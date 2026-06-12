import { Response } from "express";

import { AuthRequest } from "../types/auth-request";

import {
  createRun,
  addGpsPoint,
  getRunPoints,
  findRunByIdAndUserId,
  finishRunInDb,
  addFraudLog,
  updateRunAntiCheat,
} from "../repositories/run.repository";
import { detectLoopForRun } from "../repositories/territory.repository";
import { updateUserStats } from "../repositories/user.repository";

import { calculateDistance } from "../utils/calculateDistance";
import {
  validateSequence,
  validateBurstUpload,
  validateMovement,
} from "../utils/antiCheat";

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

    const {
      latitude,
      longitude,
      accuracy,
      speed,
      sequence_number,
      client_timestamp,
    } = req.body;

    if (
      latitude === undefined ||
      longitude === undefined ||
      sequence_number === undefined ||
      client_timestamp === undefined
    ) {
      return res.status(400).json({
        message: "Missing required fields",
      });
    }

    const run = await validateRunOwnership(runId, userId);
    if (!run) {
      return res.status(404).json({
        message: "Run not found",
      });
    }

    const newDate = new Date(client_timestamp);

    // 1. Validate Sequence
    const seqCheck = validateSequence(sequence_number, run.last_sequence_number);
    if (!seqCheck.isValid) {
      await addFraudLog(runId, seqCheck.reason!, seqCheck.fraudScoreAdded);
      await updateRunAntiCheat(runId, seqCheck.fraudScoreAdded, sequence_number);
      return res.status(400).json({ message: seqCheck.reason });
    }

    let accumulatedFraudScore = 0;

    // Get previous points to validate movement and burst
    const points = await getRunPoints(runId);
    if (points.length > 0) {
      const lastPoint = points[points.length - 1];
      
      const serverReceiveDeltaMs = Date.now() - new Date(lastPoint.server_received_at).getTime();
      const clientTimeDeltaMs = newDate.getTime() - new Date(lastPoint.client_timestamp).getTime();

      // 2. Validate Burst Upload
      const burstCheck = validateBurstUpload(serverReceiveDeltaMs, clientTimeDeltaMs);
      if (!burstCheck.isValid) {
        accumulatedFraudScore += burstCheck.fraudScoreAdded;
        await addFraudLog(runId, burstCheck.reason!, burstCheck.fraudScoreAdded);
      }

      // 3. Validate Movement
      const movementCheck = validateMovement(
        {
          latitude: lastPoint.latitude,
          longitude: lastPoint.longitude,
          client_timestamp: new Date(lastPoint.client_timestamp),
        },
        {
          latitude,
          longitude,
          client_timestamp: newDate,
        }
      );

      if (movementCheck.fraudScoreAdded > 0) {
        accumulatedFraudScore += movementCheck.fraudScoreAdded;
        await addFraudLog(runId, movementCheck.reason!, movementCheck.fraudScoreAdded);
      }
      
      if (!movementCheck.isValid) {
        // Point is completely invalid (teleportation)
        await updateRunAntiCheat(runId, accumulatedFraudScore, sequence_number);
        return res.status(400).json({ message: movementCheck.reason });
      }
    }

    // Point is valid (even if highly suspicious, we store it and add score)
    await updateRunAntiCheat(runId, accumulatedFraudScore, sequence_number);

    const point = await addGpsPoint(
      runId,
      latitude,
      longitude,
      accuracy,
      speed,
      sequence_number,
      client_timestamp
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

    const runId = req.params.runId as string;

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

    let status = "VALID";
    if (run.fraud_score >= 60) {
      status = "REJECTED";
    } else if (run.fraud_score >= 30) {
      status = "FLAGGED";
    }

    const finishedRun = await finishRunInDb(runId, distanceKm, status);

    let loopsDetected = 0;
    if (status === "VALID") {
      const loopResult = await detectLoopForRun(runId, userId, points);
      if (loopResult.loop_detected) {
        loopsDetected = 1;
      }
      
      // Update the user's aggregated stats
      await updateUserStats(userId, distanceKm, loopsDetected);
    }

    return res.status(200).json({
      run: finishedRun,
      totalPoints: points.length,
      distanceKm,
      status: finishedRun.status,
      fraudScore: run.fraud_score,
      loopsDetected,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to finish run",
    });
  }
};
