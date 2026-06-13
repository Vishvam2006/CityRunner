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
  LastPointPayload,
} from "../repositories/run.repository";

import { getRunLoops } from "../repositories/loop.repository";
import { processNewSegment, RealtimeLoopResult } from "../services/realtimeLoop.service";
import { wktPolygonToCoords }                    from "../utils/geometryUtils";
import { updateUserStats }                        from "../repositories/user.repository";
import { calculateDistance }                      from "../utils/calculateDistance";
import {
  validateSequence,
  validateBurstUpload,
  validateMovement,
} from "../utils/antiCheat";

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

    const newDate = new Date(client_timestamp);

    // ── Sequence check ────────────────────────────────────────────────────
    const seqCheck = validateSequence(sequence_number, run.last_sequence_number);
    if (!seqCheck.isValid) {
      await addFraudLog(runId, seqCheck.reason!, seqCheck.fraudScoreAdded);
      await updateRunAntiCheat(runId, seqCheck.fraudScoreAdded, sequence_number);
      return res.status(400).json({ message: seqCheck.reason });
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

    // ── Persist point ────────────────────────────────────────────────────
    const lastPointPayload: LastPointPayload = {
      latitude,
      longitude,
      client_timestamp,
      server_received_at: new Date(),
      accuracy: accuracy ?? null,
    };

    // Capture the previous-point snapshot BEFORE the update overwrites it.
    // These values are what we pass to processNewSegment as the segment origin.
    const prevSeq = run.last_sequence_number as number;
    const prevLat = run.last_lat            as number | null;
    const prevLng = run.last_lng            as number | null;

    await updateRunAntiCheat(
      runId,
      accumulatedFraudScore,
      sequence_number,
      lastPointPayload
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

    // Determine status from accumulated fraud score
    let status = "VALID";
    if      (run.fraud_score >= 60) status = "REJECTED";
    else if (run.fraud_score >= 30) status = "FLAGGED";

    const finishedRun = await finishRunInDb(runId, distanceKm, status);

    // Fetch all loops detected during this run (already saved in real-time)
    const rawLoops   = await getRunLoops(runId);
    const loopsCount = rawLoops.length;

    // Update user statistics
    if (status === "VALID") {
      await updateUserStats(userId, distanceKm, loopsCount);
    }

    // Attach polygon coords for the frontend summary screen
    const loops = rawLoops.map(loop => ({
      ...loop,
      polygonCoords: wktPolygonToCoords(loop.polygon_wkt),
    }));

    return res.status(200).json({
      run:          finishedRun,
      totalPoints:  points.length,
      distanceKm,
      status:       finishedRun.status,
      fraudScore:   run.fraud_score,
      loopsDetected: loopsCount,
      loops,        // full details for the summary screen
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to finish run" });
  }
};
