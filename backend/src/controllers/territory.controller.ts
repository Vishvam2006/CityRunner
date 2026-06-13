import { Response } from "express";

import { AuthRequest } from "../types/auth-request";
import { findRunByIdAndUserId, getRunPoints } from "../repositories/run.repository";
import {
  detectLoopForRun,
  createTerritoryRepo,
  getTerritories as getTerritoriesRepo,
} from "../repositories/territory.repository";

/**
 * checkLoop — on-demand loop check for a completed run.
 *
 * FIX: Previously built the territory WKT polygon in JavaScript by
 * concatenating raw GPS coordinates, producing a self-intersecting ring that
 * crashed PostGIS's ST_GeomFromText.  Now the polygon WKT comes directly from
 * PostGIS's ST_ConvexHull (via detectLoopForRun), which is always a valid,
 * simple polygon regardless of GPS noise or path crossings.
 *
 * NOTE: The primary frontend flow no longer calls this endpoint — the
 * finishRun response now includes the full loop result (eliminating a
 * duplicate PostGIS round-trip).  This endpoint is kept for debugging /
 * third-party integrations.
 */
export const checkLoop = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { runId } = req.params as { runId: string };

    const run = await findRunByIdAndUserId(runId, userId);
    if (!run) {
      return res.status(404).json({ success: false, message: "Run not found" });
    }

    const points = await getRunPoints(runId);

    if (points.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Run has no GPS points",
      });
    }

    const result = await detectLoopForRun(runId, userId, points);

    return res.status(200).json({
      ...result,
      point_count: points.length,
      // Map polygon_wkt → polygonWkt for API consistency
      polygonWkt: result.polygon_wkt ?? null,
      polygon_wkt: undefined,
    });
  } catch (error) {
    console.error("[checkLoop]", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const createTerritory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { polygonWkt, area } = req.body;

    if (!polygonWkt || area === undefined) {
      return res.status(400).json({ message: "polygonWkt and area are required" });
    }

    const territory = await createTerritoryRepo(userId, polygonWkt, area);
    return res.status(201).json(territory);
  } catch (error) {
    console.error("[createTerritory] Failed:", error);
    return res.status(500).json({ message: "Failed to create territory" });
  }
};

export const getTerritories = async (req: AuthRequest, res: Response) => {
  try {
    const territories = await getTerritoriesRepo();
    return res.status(200).json(territories);
  } catch (error) {
    console.error("[getTerritories]", error);
    return res.status(500).json({ message: "Failed to fetch territories" });
  }
};
