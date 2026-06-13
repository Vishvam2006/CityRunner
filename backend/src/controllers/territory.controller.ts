import { Response } from "express";

import { pool } from "../db/postgres";
import { AuthRequest } from "../types/auth-request";
import {
  findRunByIdAndUserId,
  getRunPoints,
} from "../repositories/run.repository";
import { createTerritoryRepo } from "../repositories/territory.repository";

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
export const checkLoop = async (req: AuthRequest, res: Response) => {
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
      .map(
        (p: { latitude: number; longitude: number }) =>
          `${p.longitude} ${p.latitude}`,
      )
      .join(", ");

    // Close the ring by repeating the first coordinate on a single line.
    // A multi-line template literal would embed newlines and corrupt the WKT.
    const firstPoint = `${points[0].longitude} ${points[0].latitude}`;
    const polygonWkt = `POLYGON((${wktPoints}, ${firstPoint}))`;

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
              ST_Transform(start_pt, 3857),
              ST_Transform(end_pt,   3857)
            ) AS gap_m,
            geom,
            start_pt
          FROM endpoints
        )
      SELECT
        gap_m,
        gap_m <= $1 AS loop_detected,
        CASE
          WHEN gap_m <= $1
          -- Close the ring by appending the start point, then compute area.
          THEN ST_Area(
            ST_Transform(
              ST_MakePolygon(
                ST_AddPoint(geom, start_pt)
              ),
              3857
            )
          )
          ELSE NULL
        END AS area_m2
      FROM detection;
    `;

    const result = await pool.query(query, [LOOP_CLOSE_THRESHOLD_M]);
    const row = result.rows[0];

    return res.status(200).json({
      success: true,
      loop_detected: row.loop_detected,
      gap_m: parseFloat(row.gap_m),
      area_m2: row.area_m2 !== null ? parseFloat(row.area_m2) : null,
      point_count: points.length,
      // Only include the WKT when a real loop was detected so the
      // frontend auto-save logic has an unambiguous gate.
      polygonWkt: row.loop_detected ? polygonWkt : null,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const createTerritory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const { polygonWkt, area } = req.body;

    const territory = await createTerritoryRepo(userId, polygonWkt, area);

    return res.status(201).json(territory);
  } catch (error) {
    console.error("[createTerritory] Failed:", error);

    return res.status(500).json({
      message: "Failed to create territory",
    });
  }
};

import { getTerritories as getTerritoriesRepo } from "../repositories/territory.repository";

export const getTerritories = async (req: AuthRequest, res: Response) => {
  try {
    const territories = await getTerritoriesRepo();

    return res.status(200).json(territories);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch territories",
    });
  }
};
