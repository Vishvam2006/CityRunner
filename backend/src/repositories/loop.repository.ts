/**
 * loop.repository.ts
 *
 * All database operations for the real-time loop detection system:
 *   - run_segments   (one row per GPS segment)
 *   - detected_loops (one row per validated closed loop)
 *   - territories    (one row per captured territory)
 */

import { pool } from "../db/postgres";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IntersectionResult {
  segment_id: string;
  seq_from: number;
  seq_to: number;
  intersection_wkt: string; // always a POINT WKT from our filter
}

export interface PolygonValidationResult {
  polygon_wkt: string;
  area_m2: number;
  perimeter_m: number;
}

export interface DetectedLoopRecord {
  loopId: string;
  territoryId: string | null;
  area_m2: number;
  perimeter_m: number;
  confidence: number;
  polygon_wkt: string;
  detected_at: string;
}

// ── Segment operations ────────────────────────────────────────────────────────

/**
 * Inserts a new GPS segment into run_segments and returns its UUID.
 *
 * Note: PostGIS `ST_MakePoint(x, y)` = `ST_MakePoint(lng, lat)`.
 */
export async function insertSegment(
  runId: string,
  seqFrom: number,
  seqTo: number,
  lat1: number, lng1: number,
  lat2: number, lng2: number
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `
    INSERT INTO run_segments (run_id, seq_from, seq_to, geom)
    VALUES (
      $1, $2, $3,
      ST_SetSRID(
        ST_MakeLine(ST_MakePoint($5, $4), ST_MakePoint($7, $6)),
        4326
      )
    )
    RETURNING id
    `,
    [runId, seqFrom, seqTo, lat1, lng1, lat2, lng2]
  );
  return result.rows[0].id;
}

/**
 * Finds the most recent prior segment that intersects with the new segment,
 * using the PostGIS GIST index for efficient bounding-box pre-filtering.
 *
 * Returns only real crossings (ST_Point intersections), not collinear
 * overlaps (LINESTRING intersections are filtered out in the CTE).
 *
 * @param runId         Current run
 * @param newSegId      ID of the newly inserted segment (excluded from check)
 * @param maxSeqTo      Maximum seq_to for prior segments to check
 *                      (= seqFrom − MIN_SKIP_SEGMENTS)
 * @param minSegLenM    Minimum length of a prior segment to consider
 *                      (filters stationary GPS noise)
 * @param lat1,lng1     Start of new segment (previous GPS point)
 * @param lat2,lng2     End of new segment (current GPS point)
 */
export async function findIntersectingSegment(
  runId: string,
  newSegId: string,
  maxSeqTo: number,
  minSegLenM: number,
  lat1: number, lng1: number,
  lat2: number, lng2: number
): Promise<IntersectionResult | null> {
  const result = await pool.query<IntersectionResult>(
    `
    WITH new_seg AS (
      SELECT ST_SetSRID(
        ST_MakeLine(ST_MakePoint($6, $5), ST_MakePoint($8, $7)),
        4326
      ) AS geom
    ),
    candidates AS (
      SELECT
        rs.id                                                     AS segment_id,
        rs.seq_from,
        rs.seq_to,
        ST_GeometryType(ST_Intersection(rs.geom, ns.geom))       AS geom_type,
        ST_AsText(ST_Intersection(rs.geom, ns.geom))             AS intersection_wkt
      FROM run_segments rs
      CROSS JOIN new_seg ns
      WHERE rs.run_id = $1
        AND rs.id    != $2
        AND rs.seq_to <= $3
        AND ST_Intersects(rs.geom, ns.geom)           -- uses GIST index
        AND ST_Length(rs.geom::geography) >= $4        -- skip noise segments
      ORDER BY rs.seq_to DESC                          -- most recent = smallest loop
      LIMIT 3                                          -- examine top-3 candidates
    )
    SELECT segment_id, seq_from, seq_to, intersection_wkt
    FROM   candidates
    WHERE  geom_type = 'ST_Point'                      -- real crossing only
    LIMIT  1
    `,
    [runId, newSegId, maxSeqTo, minSegLenM, lat1, lng1, lat2, lng2]
  );
  return result.rows[0] ?? null;
}

// ── GPS point retrieval for polygon construction ───────────────────────────────

/**
 * Returns GPS points for sequence numbers in [startSeq, endSeq], ordered
 * by sequence_number ASC.  These form the interior of the loop ring.
 */
export async function getLoopPoints(
  runId: string,
  startSeq: number,
  endSeq: number
): Promise<Array<{ latitude: number; longitude: number; sequence_number: number }>> {
  const result = await pool.query(
    `
    SELECT latitude, longitude, sequence_number
    FROM   gps_points
    WHERE  run_id          = $1
      AND  sequence_number >= $2
      AND  sequence_number <= $3
    ORDER BY sequence_number ASC
    `,
    [runId, startSeq, endSeq]
  );
  return result.rows;
}

// ── Polygon validation via PostGIS ────────────────────────────────────────────

/**
 * Validates and extracts a clean polygon from a raw POLYGON WKT ring.
 *
 * Pipeline:
 *  1. ST_MakeValid  → repairs self-intersecting rings (GPS noise artefacts)
 *  2. ST_Dump       → extracts all geometry components (handles MultiPolygon
 *                     or GeometryCollection from complex repairs)
 *  3. Filter ST_Polygon components, take the largest by area
 *  4. Compute ST_Area + ST_Perimeter using the geography cast (metres)
 *
 * Returns null if the geometry is degenerate (point, linestring, empty).
 */
export async function validateAndExtractPolygon(
  ringWkt: string
): Promise<PolygonValidationResult | null> {
  try {
    const result = await pool.query<{
      polygon_wkt: string;
      area_m2: string;
      perimeter_m: string;
    }>(
      `
      WITH
        raw AS (
          SELECT ST_MakeValid(ST_GeomFromText($1, 4326)) AS geom
        ),
        dumped AS (
          SELECT (ST_Dump(geom)).geom AS piece
          FROM   raw
        ),
        polygons AS (
          SELECT piece
          FROM   dumped
          WHERE  ST_GeometryType(piece) = 'ST_Polygon'
          ORDER  BY ST_Area(piece) DESC
          LIMIT  1
        )
      SELECT
        ST_AsText(piece)               AS polygon_wkt,
        ST_Area(piece::geography)      AS area_m2,
        ST_Perimeter(piece::geography) AS perimeter_m
      FROM polygons
      `,
      [ringWkt]
    );

    if (!result.rows[0]?.polygon_wkt) return null;

    return {
      polygon_wkt: result.rows[0].polygon_wkt,
      area_m2:     parseFloat(result.rows[0].area_m2),
      perimeter_m: parseFloat(result.rows[0].perimeter_m),
    };
  } catch (err) {
    console.error("[validateAndExtractPolygon] PostGIS error:", err);
    return null;
  }
}

// ── Anti-farming check ────────────────────────────────────────────────────────

/**
 * Returns true if the polygon is safe to save (not a duplicate).
 *
 * Rejects if:
 *  (a) >80% overlap with any previously detected loop in the SAME run
 *      (prevents double-claiming the same area mid-run)
 *  (b) >80% overlap with any territory the user captured in the last 24 h
 *      (prevents cross-run farming)
 *
 * Uses ST_Area(ST_Intersection) / area_m2 to compute overlap ratio.
 * If ST_Intersection is empty, ST_Area returns 0 — safe default.
 */
export async function isNotFarming(
  userId: string,
  runId: string,
  polygonWkt: string,
  areaM2: number
): Promise<boolean> {
  if (areaM2 <= 0) return false;

  const result = await pool.query<{
    run_duplicate: boolean;
    territory_farming: boolean;
  }>(
    `
    SELECT
      EXISTS (
        SELECT 1
        FROM   detected_loops dl
        WHERE  dl.run_id = $1
          AND  COALESCE(
                 ST_Area(
                   ST_Intersection(dl.polygon, ST_GeomFromText($2, 4326))::geography
                 ),
                 0
               ) / $3 > 0.8
      ) AS run_duplicate,

      EXISTS (
        SELECT 1
        FROM   territories t
        WHERE  t.user_id    = $4
          AND  t.created_at >= NOW() - INTERVAL '24 hours'
          AND  COALESCE(
                 ST_Area(
                   ST_Intersection(t.polygon, ST_GeomFromText($2, 4326))::geography
                 ),
                 0
               ) / $3 > 0.8
      ) AS territory_farming
    `,
    [runId, polygonWkt, areaM2, userId]
  );

  const { run_duplicate, territory_farming } = result.rows[0];
  return !run_duplicate && !territory_farming;
}

// ── Loop persistence ──────────────────────────────────────────────────────────

/**
 * Atomically saves a validated loop:
 *  1. Creates a territory record
 *  2. Creates a detected_loop record linked to the territory
 *
 * Both happen in the same transaction so a crash mid-save doesn't leave
 * orphaned records.
 */
export async function saveDetectedLoop(
  runId: string,
  userId: string,
  polygonWkt: string,
  areaM2: number,
  perimeterM: number,
  confidence: number
): Promise<{ loopId: string; territoryId: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const terrResult = await client.query<{ id: string }>(
      `
      INSERT INTO territories (user_id, polygon, area_sq_meters)
      VALUES ($1, ST_GeomFromText($2, 4326), $3)
      RETURNING id
      `,
      [userId, polygonWkt, areaM2]
    );
    const territoryId = terrResult.rows[0].id;

    const loopResult = await client.query<{ id: string }>(
      `
      INSERT INTO detected_loops
        (run_id, user_id, polygon, area_m2, perimeter_m, confidence, territory_id)
      VALUES ($1, $2, ST_GeomFromText($3, 4326), $4, $5, $6, $7)
      RETURNING id
      `,
      [runId, userId, polygonWkt, areaM2, perimeterM, confidence, territoryId]
    );
    const loopId = loopResult.rows[0].id;

    await client.query("COMMIT");
    return { loopId, territoryId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Loop retrieval (recovery + finishRun summary) ─────────────────────────────

/**
 * Returns all detected loops for a run, ordered chronologically.
 * Includes polygon WKT so the frontend can re-render territories on recovery.
 */
export async function getRunLoops(runId: string): Promise<DetectedLoopRecord[]> {
  const result = await pool.query<DetectedLoopRecord>(
    `
    SELECT
      id                     AS "loopId",
      territory_id           AS "territoryId",
      area_m2,
      perimeter_m,
      confidence,
      ST_AsText(polygon)     AS polygon_wkt,
      detected_at
    FROM   detected_loops
    WHERE  run_id = $1
    ORDER  BY detected_at ASC
    `,
    [runId]
  );
  return result.rows;
}
