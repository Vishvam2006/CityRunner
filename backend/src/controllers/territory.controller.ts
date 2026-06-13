import { Response } from "express";

import { AuthRequest } from "../types/auth-request";

import {
  findRunByIdAndUserId,
  getRunPoints,
} from "../repositories/run.repository";

import {
  createTerritoryRepo,
  detectLoopForRun,
  getTerritories as getTerritoriesRepo,
} from "../repositories/territory.repository";

const MIN_POINTS = 10;

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

    if (points.length < MIN_POINTS) {
      return res.status(200).json({
        success: true,
        loop_detected: false,
        reason: `Not enough points (${points.length}/${MIN_POINTS})`,
        area_m2: null,
        point_count: points.length,
        polygonWkt: null,
      });
    }

    const result = await detectLoopForRun(runId, userId, points);

    let polygonWkt: string | null = null;

    if (result.loop_detected) {
      const wktPoints = points
        .map(
          (p: { latitude: number; longitude: number }) =>
            `${p.longitude} ${p.latitude}`,
        )
        .join(", ");

      const firstPoint = `${points[0].longitude} ${points[0].latitude}`;

      polygonWkt = `POLYGON((${wktPoints}, ${firstPoint}))`;
    }

    return res.status(200).json({
      ...result,
      point_count: points.length,
      polygonWkt,
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
      return res.status(400).json({
        message: "polygonWkt and area are required",
      });
    }

    const territory = await createTerritoryRepo(userId, polygonWkt, area);

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
