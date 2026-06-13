import { pool } from "../db/postgres";
import {
  detectLoopInMemory,
  computeConfidence,
  MIN_AREA_M2,
} from "../utils/loopDetection";

// ── Public result type ────────────────────────────────────────────────────────

export interface LoopDetectionResult {
  success: boolean;
  loop_detected: boolean;
  /** 0–100.  Only meaningful when loop_detected === true. */
  confidence: number;
  /** Minimum gap found between any of the last 5 points and the start. */
  gap_m: number | null;
  area_m2: number | null;
  /** ConvexHull WKT string.  Present only when loop_detected === true. */
  polygon_wkt: string | null;
  reason?: string;
  checks: {
    sufficient_points: boolean;
    gap_closed: boolean;
    area_valid: boolean;
    isoperimetric_valid: boolean;
    not_duplicate_territory: boolean;
  };
}

// ── Main Detection ────────────────────────────────────────────────────────────

/**
 * Full loop-detection pipeline for a finished run:
 *
 * 1. In-memory sliding-window gap check (no DB, testable).
 * 2. PostGIS ConvexHull for area + WKT (robust to self-intersections).
 * 3. Isoperimetric sanity check (catches teleportation exploits).
 * 4. Anti-farming overlap check against user's last-24 h territories.
 * 5. Confidence scoring.
 *
 * Points must be pre-ordered by sequence_number ASC (caller's responsibility).
 */
export async function detectLoopForRun(
  runId: string,
  userId: string,
  points: { latitude: number; longitude: number; sequence_number?: number }[]
): Promise<LoopDetectionResult> {
  // ── Step 1: In-memory sliding-window check ─────────────────────────────────
  const prelim = detectLoopInMemory(points);

  const baseChecks = {
    sufficient_points: prelim.sufficient_points,
    gap_closed: false,
    area_valid: false,
    isoperimetric_valid: false,
    not_duplicate_territory: false,
  };

  if (!prelim.sufficient_points) {
    return {
      success: true,
      loop_detected: false,
      confidence: 0,
      gap_m: null,
      area_m2: null,
      polygon_wkt: null,
      reason: `Not enough GPS points (${points.length} collected, need ${10})`,
      checks: baseChecks,
    };
  }

  if (!prelim.is_closed) {
    return {
      success: true,
      loop_detected: false,
      confidence: 0,
      gap_m: prelim.gap_m,
      area_m2: null,
      polygon_wkt: null,
      reason: `Gap to start: ${Math.round(prelim.gap_m!)}m (need ≤${Math.round(prelim.threshold)}m)`,
      checks: baseChecks,
    };
  }

  baseChecks.gap_closed = true;

  // ── Step 2: PostGIS ConvexHull (area + valid WKT) ──────────────────────────
  // ST_ConvexHull is used instead of ST_MakePolygon because:
  //   • It never throws on self-intersecting or degenerate rings.
  //   • Real GPS paths always have small noise-induced crossings.
  //   • The convex hull is the correct semantic for "territory captured".
  const wktMultiPoint = points
    .map((p) => `${p.longitude} ${p.latitude}`)
    .join(", ");

  let areaM2: number;
  let polygonWkt: string;

  try {
    const geoResult = await pool.query<{ area_m2: string; polygon_wkt: string }>(
      `
      WITH hull AS (
        SELECT ST_ConvexHull(
          ST_GeomFromText('MULTIPOINT(${wktMultiPoint})', 4326)
        ) AS geom
      )
      SELECT
        ST_Area(geom::geography)  AS area_m2,
        ST_AsText(geom)           AS polygon_wkt
      FROM hull
      `
    );

    areaM2     = parseFloat(geoResult.rows[0].area_m2);
    polygonWkt = geoResult.rows[0].polygon_wkt;
  } catch (err) {
    console.error("[detectLoopForRun] PostGIS ConvexHull error:", err);
    return {
      success: false,
      loop_detected: false,
      confidence: 0,
      gap_m: prelim.gap_m,
      area_m2: null,
      polygon_wkt: null,
      reason: "Geometry computation failed — please try again",
      checks: baseChecks,
    };
  }

  // ── Step 3: Area floor ─────────────────────────────────────────────────────
  if (!isFinite(areaM2) || areaM2 < MIN_AREA_M2) {
    return {
      success: true,
      loop_detected: false,
      confidence: 0,
      gap_m: prelim.gap_m,
      area_m2: areaM2,
      polygon_wkt: null,
      reason: `Loop area too small (${Math.round(areaM2)} m² < ${MIN_AREA_M2} m²)`,
      checks: { ...baseChecks, area_valid: false },
    };
  }
  baseChecks.area_valid = true;

  // ── Step 4: Isoperimetric sanity check ────────────────────────────────────
  // A perfect circle maximises area for a given perimeter.  If the measured
  // area exceeds 1.5× the theoretical circle area, GPS data is corrupted
  // (teleportation, data injection, etc.).
  const maxTheoreticalArea = (prelim.perimeter_m * prelim.perimeter_m) / (4 * Math.PI);
  if (areaM2 > maxTheoreticalArea * 1.5) {
    return {
      success: true,
      loop_detected: false,
      confidence: 0,
      gap_m: prelim.gap_m,
      area_m2: areaM2,
      polygon_wkt: null,
      reason: "Impossible area-to-perimeter ratio — possible exploit or GPS corruption",
      checks: { ...baseChecks, isoperimetric_valid: false },
    };
  }
  baseChecks.isoperimetric_valid = true;

  // ── Step 5: Anti-farming overlap check ────────────────────────────────────
  // Reject if this territory overlaps >80% with one the user already claimed
  // in the last 24 hours.  Uses ConvexHull for recent territories too, so
  // it's consistent with our polygon representation.
  let maxOverlapRatio = 0;
  try {
    const overlapResult = await pool.query<{ max_overlap_ratio: string }>(
      `
      WITH
        current_hull AS (
          SELECT
            ST_GeomFromText($1, 4326) AS geom,
            $2::double precision      AS area_m2
        ),
        recent_runs AS (
          SELECT id FROM runs
          WHERE user_id  = $3
            AND id       != $4
            AND started_at >= NOW() - INTERVAL '24 hours'
            AND status    = 'VALID'
        ),
        recent_pts AS (
          SELECT gp.run_id, gp.longitude, gp.latitude
          FROM recent_runs r
          JOIN gps_points gp ON gp.run_id = r.id
        ),
        recent_hulls AS (
          SELECT
            run_id,
            ST_ConvexHull(
              ST_Collect(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326))
            ) AS geom
          FROM recent_pts
          GROUP BY run_id
          HAVING count(*) >= 10
        ),
        overlaps AS (
          SELECT
            COALESCE(
              MAX(
                ST_Area(ST_Intersection(ch.geom, rh.geom)::geography)
                / NULLIF(ch.area_m2, 0)
              ),
              0
            ) AS max_overlap_ratio
          FROM current_hull ch
          CROSS JOIN recent_hulls rh
          WHERE ST_Intersects(ch.geom, rh.geom)
        )
      SELECT COALESCE((SELECT max_overlap_ratio FROM overlaps), 0) AS max_overlap_ratio
      `,
      [polygonWkt, areaM2, userId, runId]
    );
    maxOverlapRatio = parseFloat(overlapResult.rows[0]?.max_overlap_ratio ?? "0");
  } catch (err) {
    // Non-fatal: log and continue without the farming check
    console.warn("[detectLoopForRun] Overlap check failed — skipping:", err);
  }

  if (maxOverlapRatio > 0.8) {
    return {
      success: true,
      loop_detected: false,
      confidence: 0,
      gap_m: prelim.gap_m,
      area_m2: areaM2,
      polygon_wkt: null,
      reason: "Territory farming: this area overlaps >80% with a territory you captured in the last 24 h",
      checks: { ...baseChecks, not_duplicate_territory: false },
    };
  }
  baseChecks.not_duplicate_territory = true;

  // ── Step 6: Confidence score ───────────────────────────────────────────────
  const confidence = computeConfidence(
    prelim.gap_m!,
    points.length,
    areaM2,
    prelim.threshold
  );

  return {
    success: true,
    loop_detected: true,
    confidence,
    gap_m: prelim.gap_m,
    area_m2: areaM2,
    polygon_wkt: polygonWkt,
    checks: baseChecks,
  };
}

// ── Territory CRUD ────────────────────────────────────────────────────────────

const LOOP_CLOSE_THRESHOLD_M = 30;

export async function createTerritoryRepo(
  userId: string,
  polygonWkt: string,
  area: number
) {
  const result = await pool.query(
    `
    INSERT INTO territories (user_id, polygon, area_sq_meters)
    VALUES ($1, ST_GeomFromText($2, 4326), $3)
    RETURNING *
    `,
    [userId, polygonWkt, area]
  );
  return result.rows[0];
}

export async function getTerritories() {
  const result = await pool.query(
    `
    SELECT
      t.id,
      t.user_id,
      t.area_sq_meters,
      ST_AsGeoJSON(t.polygon) AS polygon
    FROM territories t
    `,
  );
  return result.rows.map((territory) => ({
    ...territory,
    polygon: JSON.parse(territory.polygon),
  }));
}

export async function detectLoopForRun(
  runId: string,
  userId: string,
  points: any[],
) {
  if (points.length < 10) {
    return {
      success: true,
      loop_detected: false,
      reason: `Not enough points (${points.length}/10)`,
      area_m2: null,
      gap_m: null,
    };
  }

  const wktPoints = points
    .map(
      (p: { latitude: number; longitude: number }) =>
        `${p.longitude} ${p.latitude}`,
    )
    .join(", ");

  const query = `
    WITH
      path AS (
        SELECT ST_GeomFromText(
          'LINESTRING(${wktPoints})',
          4326
        ) AS geom
      ),

      endpoints AS (
        SELECT
          ST_StartPoint(geom) AS start_pt,
          ST_EndPoint(geom) AS end_pt,
          geom
        FROM path
      ),

      detection AS (
        SELECT
          ST_Distance(
            ST_Transform(start_pt, 3857),
            ST_Transform(end_pt, 3857)
          ) AS gap_m,
          geom,
          start_pt
        FROM endpoints
      ),

      polygon_cte AS (
        SELECT
          gap_m,
          gap_m <= $1 AS is_closed,

          CASE
            WHEN gap_m <= $1
            THEN ST_MakePolygon(
              ST_AddPoint(
                geom,
                start_pt
              )
            )
            ELSE NULL
          END AS poly_geom,

          CASE
            WHEN gap_m <= $1
            THEN ST_Area(
              ST_MakePolygon(
                ST_AddPoint(
                  geom,
                  start_pt
                )
              )::geography
            )
            ELSE NULL
          END AS area_m2,

          CASE
            WHEN gap_m <= $1
            THEN ST_Length(
              geom::geography
            )
            ELSE NULL
          END AS perimeter_m

        FROM detection
      ),

      recent_runs AS (
        SELECT id
        FROM runs
        WHERE user_id = $2
          AND id != $3
          AND started_at >= NOW() - INTERVAL '24 hours'
          AND status = 'VALID'
      ),

      recent_points AS (
        SELECT
          r.id AS run_id,
          gp.longitude,
          gp.latitude,
          gp.recorded_at
        FROM recent_runs r
        JOIN gps_points gp
          ON gp.run_id = r.id
        ORDER BY r.id, gp.recorded_at
      ),

      recent_lines AS (
        SELECT
          run_id,
          ST_MakeLine(
            ST_SetSRID(
              ST_MakePoint(
                longitude,
                latitude
              ),
              4326
            )
            ORDER BY recorded_at
          ) AS geom
        FROM recent_points
        GROUP BY run_id
        HAVING COUNT(*) >= 10
      ),

      recent_polys AS (
        SELECT
          run_id,

          ST_MakePolygon(
            ST_AddPoint(
              geom,
              ST_StartPoint(geom)
            )
          ) AS poly_geom,

          ST_Area(
            ST_MakePolygon(
              ST_AddPoint(
                geom,
                ST_StartPoint(geom)
              )
            )::geography
          ) AS poly_area

        FROM recent_lines

        WHERE ST_Distance(
          ST_Transform(
            ST_StartPoint(geom),
            3857
          ),
          ST_Transform(
            ST_EndPoint(geom),
            3857
          )
        ) <= $1
      ),

      overlaps AS (
        SELECT
          MAX(
            ST_Area(
              ST_Intersection(
                p1.poly_geom,
                p2.poly_geom
              )::geography
            ) / p1.area_m2
          ) AS max_overlap_ratio

        FROM polygon_cte p1
        CROSS JOIN recent_polys p2

        WHERE
          p1.is_closed = true
          AND p1.area_m2 > 0
      )

    SELECT
      p.gap_m,
      p.is_closed,
      p.area_m2,
      p.perimeter_m,
      COALESCE(
        o.max_overlap_ratio,
        0
      ) AS max_overlap_ratio
    FROM polygon_cte p
    LEFT JOIN overlaps o
      ON true;
  `;

  const result = await pool.query(query, [
    LOOP_CLOSE_THRESHOLD_M,
    userId,
    runId,
  ]);

  const row = result.rows[0];

  const isClosed = row.is_closed;
  const areaM2 = row.area_m2 !== null ? parseFloat(row.area_m2) : null;

  const perimeterM =
    row.perimeter_m !== null ? parseFloat(row.perimeter_m) : null;

  const maxOverlapRatio = parseFloat(row.max_overlap_ratio);

  let loopDetected = isClosed;

  let reason = "Loop detected successfully";

  if (isClosed && areaM2 !== null && perimeterM !== null) {
    if (areaM2 < 100) {
      loopDetected = false;
      reason = "Loop area too small (< 100 m²)";
    }

    const maxTheoreticalArea = (perimeterM * perimeterM) / (4 * Math.PI);

    if (areaM2 > maxTheoreticalArea * 1.5) {
      loopDetected = false;

      reason =
        "Impossible Area-to-Perimeter ratio (Potential Teleportation/Exploit)";
    }

    if (maxOverlapRatio > 0.8) {
      loopDetected = false;

      reason =
        "Territory Farming: Overlaps > 80% with a recent territory captured in last 24h";
    }
  } else if (!isClosed) {
    reason = "Start and end points are too far apart to close loop";
  }

  return {
    success: true,
    loop_detected: loopDetected,
    gap_m: row.gap_m !== null ? parseFloat(row.gap_m) : null,
    area_m2: loopDetected ? areaM2 : null,
    reason: !loopDetected ? reason : undefined,
  };
}
