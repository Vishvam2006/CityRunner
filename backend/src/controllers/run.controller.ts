import { Response } from "express";

import { AuthRequest } from "../types/auth-request";

import { createRun } from "../repositories/run.repository";

import { addGpsPoint } from "../repositories/run.repository";

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
    return res.status(500).json({
      error,
    });
  }
};

export const addPoint = async (req: Request, res: Response) => {
  return res.json({
    message: "Point received",
  });
};

export const savePoint = async (req: AuthRequest, res: Response) => {
  try {
    const runId = req.params.runId as string;
    const { latitude, longitude } = req.body;

    const point = await addGpsPoint(runId, latitude, longitude);

    return res.status(201).json(point);
  } catch (error) {
    return res.status(500).json({
      error,
    });
  }
};
