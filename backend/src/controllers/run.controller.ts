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

// ── startRun ──────────────────────────────────────────────────────────────────

export const startRun = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const run = await createRun(userId);
    return res.status(201).json(run);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to start run" });
  }
};

// ── savePoint ─────────────────────────────────────────────────────────────────

/**
 * Persists a GPS point with anti-cheat validation, then — if the point
 * passes — triggers real-time loop detection.
 *
 * Response shape:
 *  { point: GpsPoint, loopDetected: RealtimeLoopResult | null }
 *
 * The client checks `loopDetected` to show territory captures instantly
 * without a separate HTTP round-trip.
 *
 * Performance note (O(1) anti-cheat):
 *  The previous point's coordinates are stored directly on the `runs` row
 *  (last_lat, last_lng, last_client_ts, last_sequence_number).  We never
 *  fetch all prior GPS points for the anti-cheat check.
 */
export const savePoint = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

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
      latitude         == null ||
      longitude        == null ||
      sequence_number  == null ||
      client_timestamp == null
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const run = await findRunByIdAndUserId(runId, userId);
    if (!run) return res.status(404).json({ message: "Run not found" });

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

    let accumulatedFraudScore = 0;

    // ── Burst / movement checks (O(1) via last-point snapshot) ───────────
    if (run.last_lat != null && run.last_lng != null && run.last_client_ts != null) {
      const serverReceiveDeltaMs = run.last_server_received_at
        ? Date.now() - new Date(run.last_server_received_at).getTime()
        : 0;
      const clientTimeDeltaMs =
        newDate.getTime() - new Date(run.last_client_ts).getTime();

      const burstCheck = validateBurstUpload(serverReceiveDeltaMs, clientTimeDeltaMs);
      if (!burstCheck.isValid) {
        accumulatedFraudScore += burstCheck.fraudScoreAdded;
        await addFraudLog(runId, burstCheck.reason!, burstCheck.fraudScoreAdded);
      }

      const movementCheck = validateMovement(
        {
          latitude:         run.last_lat,
          longitude:        run.last_lng,
          client_timestamp: new Date(run.last_client_ts),
        },
        { latitude, longitude, client_timestamp: newDate }
      );

      if (movementCheck.fraudScoreAdded > 0) {
        accumulatedFraudScore += movementCheck.fraudScoreAdded;
        await addFraudLog(runId, movementCheck.reason!, movementCheck.fraudScoreAdded);
      }

      if (!movementCheck.isValid) {
        await updateRunAntiCheat(runId, accumulatedFraudScore, sequence_number);
        return res.status(400).json({ message: movementCheck.reason });
      }
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

    const point = await addGpsPoint(
      runId, latitude, longitude,
      accuracy, speed, sequence_number, client_timestamp
    );

    // ── Real-time loop detection ──────────────────────────────────────────
    // Only run for clean points in a VALID (non-rejected) run that already
    // has at least one prior saved point.
    let loopDetected: RealtimeLoopResult | null = null;

    if (
      run.fraud_score < 60 &&   // run not rejected
      prevLat != null &&
      prevLng != null
    ) {
      try {
        loopDetected = await processNewSegment(
          runId, userId,
          prevSeq,                          // seqFrom = previous sequence number
          sequence_number,                  // seqTo   = current sequence number
          prevLat, prevLng,                 // previous GPS coordinates
          latitude, longitude               // current GPS coordinates
        );
      } catch (err) {
        // Non-fatal: log and continue — the point is already saved
        console.error("[savePoint] Real-time loop detection error:", err);
      }
    }

    return res.status(201).json({ point, loopDetected });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to save GPS point" });
  }
};

// ── getRun ────────────────────────────────────────────────────────────────────

export const getRun = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const runId = req.params.runId as string;
    const run   = await findRunByIdAndUserId(runId, userId);
    if (!run) return res.status(404).json({ message: "Run not found" });

    const points = await getRunPoints(runId);
    return res.json({ runId, points });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to fetch run" });
  }
};

// ── getRunDistance ────────────────────────────────────────────────────────────

export const getRunDistance = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const runId = req.params.runId as string;
    const run   = await findRunByIdAndUserId(runId, userId);
    if (!run) return res.status(404).json({ message: "Run not found" });

    const points     = await getRunPoints(runId);
    const distanceKm = calculateDistance(points);

    return res.json({ runId, distanceKm });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to calculate distance" });
  }
};

// ── getRunLoopsController ─────────────────────────────────────────────────────

/**
 * GET /runs/:runId/loops
 *
 * Returns all loops detected during a run.  Used by the frontend to:
 *  (a) show territories on the summary screen after run completion
 *  (b) restore detected territories on browser reconnect / page reload
 */
export const getRunLoopsController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const runId = req.params.runId as string;
    const run   = await findRunByIdAndUserId(runId, userId);
    if (!run) return res.status(404).json({ message: "Run not found" });

    const loops = await getRunLoops(runId);

    // Attach parsed coordinates for direct use by React Google Maps
    const loopsWithCoords = loops.map(loop => ({
      ...loop,
      polygonCoords: wktPolygonToCoords(loop.polygon_wkt),
    }));

    return res.json({ runId, loops: loopsWithCoords });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to fetch run loops" });
  }
};

// ── finishRun ─────────────────────────────────────────────────────────────────

/**
 * Ends the run, updates user stats, and returns a summary of all loops
 * detected in real-time during the run.
 *
 * Territories are already saved — finishRun just aggregates and returns them.
 * This is significantly simpler than the old approach (no PostGIS CTE re-run).
 */
export const finishRun = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const runId = req.params.runId as string;
    const run   = await findRunByIdAndUserId(runId, userId);
    if (!run) return res.status(404).json({ message: "Run not found" });

    const points = await getRunPoints(runId);
    if (points.length === 0) {
      return res.status(400).json({ message: "Run contains no GPS points" });
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
      run:          finishedRun,
      totalPoints:  points.length,
      distanceKm,
      status: finishedRun.status,
      fraudScore: run.fraud_score,
      loopsDetected,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to finish run" });
  }
};
