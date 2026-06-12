import { Response } from "express";

import { pool } from "../db/postgres";
import { AuthRequest } from "../types/auth-request";
import { findRunByIdAndUserId, getRunPoints } from "../repositories/run.repository";

// Minimum number of GPS points before we even attempt loop detection.
const MIN_POINTS = 10;

// How close (in metres) the runner's last point must be to the first point
// for a loop to be considered closed.
const LOOP_CLOSE_THRESHOLD_M = 30;

/**
 * GET /api/territory/loop/:runId
 *
 * Reads the GPS points for the authenticated user's run and uses PostGIS to:
 *   1. Build a LINESTRING from the ordered points.
 *   2. Check whether the start and end are within LOOP_CLOSE_THRESHOLD_M metres.
 *   3. If so, close the ring, build a POLYGON, and return its area in m².
 */
export const checkLoop = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { runId } = req.params as { runId: string };

    // Validate that this run belongs to the authenticated user.
    const run = await findRunByIdAndUserId(runId, userId);

    if (!run) {
      return res.status(404).json({
        success: false,
        message: "Run not found",
      });
    }

    const points = await getRunPoints(runId);

    if (points.length < MIN_POINTS) {
      return res.status(200).json({
        success: true,
        loop_detected: false,
        reason: `Not enough points (${points.length}/${MIN_POINTS})`,
        area_m2: null,
      });
    }

    // Build a WKT LINESTRING from the stored latitude/longitude values.
    // PostGIS expects (longitude latitude) order.
    const wktPoints = points
      .map((p: { latitude: number; longitude: number }) => `${p.longitude} ${p.latitude}`)
      .join(", ");

    const query = `
      WITH
        path AS (
          SELECT ST_GeomFromText('LINESTRING(${wktPoints})', 4326) AS geom
        ),
        endpoints AS (
          SELECT
            ST_StartPoint(geom) AS start_pt,
            ST_EndPoint(geom)   AS end_pt,
            geom
          FROM path
        ),
        detection AS (
          SELECT
            -- Distance in metres between first and last recorded point.
            ST_Distance(
              geom::geography,
              ST_StartPoint(geom)::geography
            ) AS dummy, -- just to make sure we can use geography
            ST_Distance(
              ST_Transform(start_pt, 3857),
              ST_Transform(end_pt,   3857)
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
              THEN ST_MakePolygon(ST_AddPoint(geom, start_pt))
              ELSE NULL
            END AS poly_geom,
            CASE
              WHEN gap_m <= $1
              THEN ST_Area(ST_MakePolygon(ST_AddPoint(geom, start_pt))::geography)
              ELSE NULL
            END AS area_m2,
            CASE
              WHEN gap_m <= $1
              THEN ST_Length(geom::geography)
              ELSE NULL
            END as perimeter_m
          FROM detection
        ),
        -- Find previous runs by the same user in the last 24h to check overlap
        recent_runs AS (
          SELECT id FROM runs 
          WHERE user_id = $2 
          AND id != $3
          AND started_at >= NOW() - INTERVAL '24 hours'
          AND status = 'VALID'
        ),
        recent_points AS (
          SELECT r.id as run_id, gp.longitude, gp.latitude, gp.recorded_at
          FROM recent_runs r
          JOIN gps_points gp ON gp.run_id = r.id
          ORDER BY r.id, gp.recorded_at ASC
        ),
        recent_lines AS (
          SELECT run_id, ST_MakeLine(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) ORDER BY recorded_at ASC) as geom
          FROM recent_points
          GROUP BY run_id
          HAVING count(*) >= 10
        ),
        recent_polys AS (
          SELECT run_id, 
            ST_MakePolygon(ST_AddPoint(geom, ST_StartPoint(geom))) as poly_geom,
            ST_Area(ST_MakePolygon(ST_AddPoint(geom, ST_StartPoint(geom)))::geography) as poly_area
          FROM recent_lines
          WHERE ST_Distance(ST_Transform(ST_StartPoint(geom), 3857), ST_Transform(ST_EndPoint(geom), 3857)) <= $1
        ),
        overlaps AS (
          SELECT max(
            ST_Area(ST_Intersection(p1.poly_geom, p2.poly_geom)::geography) / p1.area_m2
          ) as max_overlap_ratio
          FROM polygon_cte p1
          CROSS JOIN recent_polys p2
          WHERE p1.is_closed = true AND p1.area_m2 > 0
        )
      SELECT
        p.gap_m,
        p.is_closed,
        p.area_m2,
        p.perimeter_m,
        COALESCE(o.max_overlap_ratio, 0) as max_overlap_ratio
      FROM polygon_cte p
      LEFT JOIN overlaps o ON true;
    `;

    const result = await pool.query(query, [LOOP_CLOSE_THRESHOLD_M, userId, runId]);
    const row = result.rows[0];

    const isClosed = row.is_closed;
    const areaM2 = row.area_m2 !== null ? parseFloat(row.area_m2) : null;
    const perimeterM = row.perimeter_m !== null ? parseFloat(row.perimeter_m) : null;
    const maxOverlapRatio = parseFloat(row.max_overlap_ratio);

    let loopDetected = isClosed;
    let reason = "Loop detected successfully";

    if (isClosed && areaM2 !== null && perimeterM !== null) {
      // 1. Minimum area check
      if (areaM2 < 100) {
        loopDetected = false;
        reason = "Loop area too small (< 100 m²)";
      }
      
      // 2. Area vs Perimeter physical limit check (Area <= P^2 / 4*pi)
      // Allow a small margin (e.g. 1.5x) due to GPS inaccuracy/jumps
      const maxTheoreticalArea = (perimeterM * perimeterM) / (4 * Math.PI);
      if (areaM2 > maxTheoreticalArea * 1.5) {
        loopDetected = false;
        reason = "Impossible Area-to-Perimeter ratio (Potential Teleportation/Exploit)";
      }

      // 3. Territory Farming (Overlapping > 80% with recent run)
      if (maxOverlapRatio > 0.8) {
        loopDetected = false;
        reason = "Territory Farming: Overlaps > 80% with a recent territory captured in last 24h";
      }
    } else if (!isClosed) {
      reason = "Start and end points are too far apart to close loop";
    }

    return res.status(200).json({
      success: true,
      loop_detected: loopDetected,
      gap_m: parseFloat(row.gap_m),
      area_m2: loopDetected ? areaM2 : null,
      reason: !loopDetected ? reason : undefined,
      point_count: points.length,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};