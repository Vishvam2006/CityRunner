import { Response } from "express";

import { AuthRequest } from "../types/auth-request";

import {
  createRun,
  addGpsPoint,
  getRunPoints,
  findRunByIdAndUserId,
  finishRunInDb,
} from "../repositories/run.repository";

import { calculateDistance } from "../utils/calculateDistance";

async function validateRunOwnership(runId: string, userId: string) {
  const run = await findRunByIdAndUserId(runId, userId);

  return run;
}

export const startRun = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const run = await createRun(userId);

    return res.status(201).json(run);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to start run",
    });
  }
};

export const savePoint = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const runId = req.params.runId as string;

    const { latitude, longitude, accuracy, speed } = req.body;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        message: "Latitude and longitude required",
      });
    }

    const run = await validateRunOwnership(runId, userId);
    if (!run) {
      return res.status(404).json({
        message: "Run not found",
      });
    }

    const point = await addGpsPoint(
      runId,
      latitude,
      longitude,
      accuracy,
      speed,
    );

    return res.status(201).json(point);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to save GPS point",
    });
  }
};

export const getRun = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const runId = req.params.runId;

    const run = await validateRunOwnership(runId, userId);

    if (!run) {
      return res.status(404).json({
        message: "Run not found",
      });
    }

    const points = await getRunPoints(runId);

    return res.json({
      runId,
      points,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch run points",
    });
  }
};

export const getRunDistance = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const runId = req.params.runId as string;

    const run = await validateRunOwnership(runId, userId);

    if (!run) {
      return res.status(404).json({
        message: "Run not found",
      });
    }

    const points = await getRunPoints(runId);

    const distanceKm = calculateDistance(points);

    return res.json({
      runId,
      distanceKm,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to calculate distance",
    });
  }
};

export const finishRun = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const runId = req.params.runId as string;

    const run = await validateRunOwnership(runId, userId);

    if (!run) {
      return res.status(404).json({
        message: "Run not found",
      });
    }

    const points = await getRunPoints(runId);

    if (points.length === 0) {
      return res.status(400).json({
        message: "Run contains no GPS points",
      });
    }

    const distanceKm = calculateDistance(points);

    const finishedRun = await finishRunInDb(runId, distanceKm);

    return res.status(200).json({
      run: finishedRun,
      totalPoints: points.length,
      distanceKm,
      status: "finished",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to finish run",
    });
  }
};
