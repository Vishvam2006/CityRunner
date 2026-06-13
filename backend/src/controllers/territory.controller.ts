import { Response } from "express";

import { AuthRequest } from "../types/auth-request";
import {
  findRunByIdAndUserId,
  getRunPoints,
} from "../repositories/run.repository";
import { createTerritoryRepo } from "../repositories/territory.repository";
import { detectLoopForRun } from "../repositories/territory.repository";

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

    const wktPoints = points
      .map(
        (p: { latitude: number; longitude: number }) =>
          `${p.longitude} ${p.latitude}`,
      )
      .join(", ");

    const firstPoint = `${points[0].longitude} ${points[0].latitude}`;
    const polygonWkt = `POLYGON((${wktPoints}, ${firstPoint}))`;

    const result = await detectLoopForRun(runId, userId, points);

    return res.status(200).json({
      ...result,
      point_count: points.length,
      polygonWkt: result.loop_detected ? polygonWkt : null,
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
