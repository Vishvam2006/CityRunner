import { Response } from "express";

import { AuthRequest } from "../types/auth-request";
import { findRunByIdAndUserId, getRunPoints } from "../repositories/run.repository";
import { detectLoopForRun } from "../repositories/territory.repository";

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

    const result = await detectLoopForRun(runId, userId, points);

    return res.status(200).json({
      ...result,
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