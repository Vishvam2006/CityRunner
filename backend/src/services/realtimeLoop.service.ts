/**
 * realtimeLoop.service.ts
 *
 * Orchestrates real-time loop detection for every incoming GPS point.
 * Called from run.controller.ts#savePoint after a point is persisted.
 *
 * Pipeline (all steps must pass for a territory to be saved):
 *  1. Skip short segments (stationary GPS drift)
 *  2. Insert segment into run_segments
 *  3. PostGIS intersection query (GIST-indexed)
 *  4. Parse intersection point from WKT
 *  5. Fetch interior GPS points
 *  6. Build polygon ring WKT
 *  7. PostGIS: ST_MakeValid + ST_Dump → valid polygon + area
 *  8. Minimum area check
 *  9. Anti-farming overlap check
 * 10. Atomic save: territory + detected_loop (transaction)
 * 11. Return enriched result to controller → forwarded to frontend
 */

import {
  insertSegment,
  findIntersectingSegment,
  getLoopPoints,
  validateAndExtractPolygon,
  isNotFarming,
  saveDetectedLoop,
} from "../repositories/loop.repository";

import {
  parseIntersectionPoint,
  buildRingWkt,
  wktPolygonToCoords,
  haversineM,
  MIN_SKIP_SEGMENTS,
  MIN_SEGMENT_LENGTH_M,
  MIN_LOOP_AREA_M2,
} from "../utils/geometryUtils";

// ── Public result type ────────────────────────────────────────────────────────

export interface RealtimeLoopResult {
  loopId: string;
  territoryId: string;
  /** True polygon WKT built from the actual GPS path. */
  polygonWkt: string;
  /** Pre-parsed {lat,lng} array for React Google Maps. */
  polygonCoords: Array<{ lat: number; lng: number }>;
  area_m2: number;
  perimeter_m: number;
  /** 0–100 confidence score. */
  confidence: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Confidence score for a loop detected via segment intersection.
 *
 * Base: 30 pts (better than proximity detection's heuristic).
 * Area bonus:      up to 30 pts
 * Perimeter bonus: up to 20 pts
 * Point density:   up to 20 pts
 */
function computeLoopConfidence(
  areaM2: number,
  perimeterM: number,
  numLoopPoints: number
): number {
  let score = 30;

  // Area
  if      (areaM2 >= 10_000) score += 30;
  else if (areaM2 >=  1_000) score += 20;
  else if (areaM2 >=    100) score += 10;

  // Perimeter
  if      (perimeterM >= 500) score += 20;
  else if (perimeterM >= 200) score += 12;
  else                         score +=  5;

  // Point density (more points → less noise-induced)
  if      (numLoopPoints >= 30) score += 20;
  else if (numLoopPoints >= 15) score += 12;
  else if (numLoopPoints >=  8) score +=  6;

  return Math.min(score, 100);
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Processes a newly added GPS segment for real-time loop detection.
 *
 * @param runId     Active run UUID
 * @param userId    Authenticated user UUID
 * @param seqFrom   sequence_number of the PREVIOUS GPS point
 * @param seqTo     sequence_number of the CURRENT (just saved) GPS point
 * @param lat1,lng1 Coordinates of the previous point (from runs.last_lat/lng)
 * @param lat2,lng2 Coordinates of the current point
 *
 * @returns RealtimeLoopResult if a new territory was captured, otherwise null.
 */
export async function processNewSegment(
  runId: string,
  userId: string,
  seqFrom: number,
  seqTo: number,
  lat1: number, lng1: number,
  lat2: number, lng2: number
): Promise<RealtimeLoopResult | null> {

  // ── 1. Skip very short segments ───────────────────────────────────────────
  //  Stationary GPS drift (e.g. 1–2 m oscillations while standing still)
  //  would pollute run_segments and trigger spurious intersections.
  const segLenM = haversineM(lat1, lng1, lat2, lng2);
  if (segLenM < MIN_SEGMENT_LENGTH_M) return null;

  // ── 2. Insert segment ─────────────────────────────────────────────────────
  const newSegId = await insertSegment(
    runId, seqFrom, seqTo, lat1, lng1, lat2, lng2
  );

  // ── 3. PostGIS intersection query ─────────────────────────────────────────
  //  maxSeqTo = seqFrom − MIN_SKIP_SEGMENTS
  //  Only segments with seq_to ≤ maxSeqTo are checked, ensuring there are
  //  at least MIN_SKIP_SEGMENTS GPS points between the intersection candidate
  //  and the current segment.  This prevents noise-induced false positives
  //  from nearby segments that nearly touch.
  const maxSeqTo = seqFrom - MIN_SKIP_SEGMENTS;
  if (maxSeqTo < 0) return null; // not enough history yet

  const intersection = await findIntersectingSegment(
    runId, newSegId, maxSeqTo, MIN_SEGMENT_LENGTH_M,
    lat1, lng1, lat2, lng2
  );
  if (!intersection) return null;

  // ── 4. Parse intersection point ───────────────────────────────────────────
  //  PostGIS returns WKT.  Collinear overlaps produce LINESTRING — we skip
  //  those.  Only POINT intersections (real crossings) continue.
  const intersectionPt = parseIntersectionPoint(intersection.intersection_wkt);
  if (!intersectionPt) return null;

  // ── 5. Fetch interior GPS points ──────────────────────────────────────────
  //  The loop ring is: P_int → GPS[seq_to_old] → ... → GPS[seqFrom] → P_int
  //  Where seq_to_old = intersection.seq_to  (end of the old segment)
  //        seqFrom    = previous sequence number (start of the new segment)
  const loopPoints = await getLoopPoints(runId, intersection.seq_to, seqFrom);
  if (loopPoints.length < 2) {
    // Need at least 2 interior points for a non-degenerate polygon
    return null;
  }

  // ── 6. Build polygon ring WKT ─────────────────────────────────────────────
  const ringWkt = buildRingWkt(intersectionPt, loopPoints);

  // ── 7. Validate polygon and compute area (PostGIS) ────────────────────────
  //  ST_MakeValid repairs GPS-noise self-intersections.
  //  ST_Dump extracts the largest polygon component if MakeValid produces
  //  a MultiPolygon or GeometryCollection.
  const polyResult = await validateAndExtractPolygon(ringWkt);
  if (!polyResult) {
    console.debug("[realtimeLoop] Polygon validation failed — degenerate geometry");
    return null;
  }

  // ── 8. Minimum area ───────────────────────────────────────────────────────
  if (polyResult.area_m2 < MIN_LOOP_AREA_M2) {
    console.debug(`[realtimeLoop] Loop area ${Math.round(polyResult.area_m2)} m² < ${MIN_LOOP_AREA_M2} m² minimum`);
    return null;
  }

  // ── 9. Anti-farming check ─────────────────────────────────────────────────
  const farmingOk = await isNotFarming(
    userId, runId, polyResult.polygon_wkt, polyResult.area_m2
  );
  if (!farmingOk) {
    console.debug("[realtimeLoop] Farming check failed — duplicate territory");
    return null;
  }

  // ── 10. Compute confidence ────────────────────────────────────────────────
  const confidence = computeLoopConfidence(
    polyResult.area_m2,
    polyResult.perimeter_m,
    loopPoints.length
  );

  // ── 11. Atomic save ───────────────────────────────────────────────────────
  const { loopId, territoryId } = await saveDetectedLoop(
    runId, userId,
    polyResult.polygon_wkt,
    polyResult.area_m2,
    polyResult.perimeter_m,
    confidence
  );

  console.info(
    `[realtimeLoop] ✅ Loop captured — run=${runId} area=${Math.round(polyResult.area_m2)}m² confidence=${confidence}`
  );

  return {
    loopId,
    territoryId,
    polygonWkt:    polyResult.polygon_wkt,
    polygonCoords: wktPolygonToCoords(polyResult.polygon_wkt),
    area_m2:       polyResult.area_m2,
    perimeter_m:   polyResult.perimeter_m,
    confidence,
  };
}
