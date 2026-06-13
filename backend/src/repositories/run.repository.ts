
import { pool } from "../db/postgres";

export async function createRun(userId: string) {
  const result = await pool.query(
    `
    INSERT INTO runs (user_id)
    VALUES ($1)
    RETURNING *
    `,
    [userId]
  );
  return result.rows[0];
}

export async function addGpsPoint(
  runId: string,
  latitude: number,
  longitude: number,
  accuracy: number | null,
  speed: number | null,
  sequence_number: number,
  client_timestamp: string
) {
  const result = await pool.query(
    `
    INSERT INTO gps_points
    (
      run_id,
      latitude,
      longitude,
      accuracy,
      speed,
      sequence_number,
      client_timestamp
    )
    VALUES
    (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7
    )
    RETURNING *
    `,
    [
      runId,
      latitude,
      longitude,
      accuracy,
      speed,
      sequence_number,
      client_timestamp,
    ]
  );
  return result.rows[0];
}

/**
 * Returns all GPS points for a run, ordered by sequence_number ASC.
 *
 * BUG FIX: previously ordered by `recorded_at` (server insert time), which
 * caused out-of-order geometry when a point arrived late due to mobile network
 * latency.  Sequence number is assigned client-side at capture time and is
 * always monotonically increasing.
 */
export async function getRunPoints(runId: string) {
  const result = await pool.query(
    `
    SELECT
      latitude,
      longitude,
      accuracy,
      speed,
      sequence_number,
      client_timestamp,
      server_received_at,
      recorded_at
    FROM gps_points
    WHERE run_id = $1
    ORDER BY sequence_number ASC
    `,
    [runId]
  );
  return result.rows;
}

export async function findRunByIdAndUserId(runId: string, userId: string) {
  const result = await pool.query(
    `
    SELECT *
    FROM runs
    WHERE id       = $1
      AND user_id  = $2
    `,
    [runId, userId]
  );
  return result.rows[0];
}

export async function finishRunInDb(
  runId: string,
  distanceKm: number,
  status: string
) {
  const result = await pool.query(
    `
    UPDATE runs
    SET
      ended_at = NOW(),
      distance_km = $2,
      status = $3
    WHERE id = $1
    RETURNING *
    `,
    [runId, distanceKm, status]
  );

  return result.rows[0];
}

export async function addFraudLog(
  runId: string,
  reason: string,
  scoreAdded: number
) {
  await pool.query(
    `
    INSERT INTO fraud_logs (run_id, reason, score_added)
    VALUES ($1, $2, $3)
    `,
    [runId, reason, scoreAdded]
  );
}

export async function updateRunAntiCheat(
  runId: string,
  scoreToAdd: number,
  newSequenceNumber: number
) {
  await pool.query(
    `
    UPDATE runs
    SET
      fraud_score = fraud_score + $2,
      last_sequence_number = $3
    WHERE id = $1
    `,
    [runId, scoreToAdd, newSequenceNumber]
  );
}

export async function getRunFraudScore(runId: string) {
  const result = await pool.query(
    `
    SELECT fraud_score, status
    FROM runs
    WHERE id = $1
    `,
    [runId]
  );
  return result.rows[0];
}

export async function addFraudLog(
  runId: string,
  reason: string,
  scoreAdded: number
) {
  await pool.query(
    `
    INSERT INTO fraud_logs (run_id, reason, score_added)
    VALUES ($1, $2, $3)
    `,
    [runId, reason, scoreAdded]
  );
}

/** Optional last-point payload written alongside the fraud/sequence update.
 *  Storing these four values in the runs row eliminates the O(n) `getRunPoints`
 *  call previously needed to perform the anti-cheat movement check. */
export interface LastPointPayload {
  latitude: number;
  longitude: number;
  client_timestamp: string;
  server_received_at: Date;
  accuracy: number | null;
}

/**
 * Updates fraud score, sequence number, and — when a valid point is being
 * stored — the last-point snapshot in the runs row.
 */
export async function updateRunAntiCheat(
  runId: string,
  scoreToAdd: number,
  newSequenceNumber: number,
  lastPoint?: LastPointPayload
) {
  await pool.query(
    `
    UPDATE runs
    SET
      fraud_score                = fraud_score + $2,
      last_sequence_number       = $3,
      last_lat                   = COALESCE($4, last_lat),
      last_lng                   = COALESCE($5, last_lng),
      last_client_ts             = COALESCE($6::timestamptz, last_client_ts),
      last_server_received_at    = COALESCE($7::timestamptz, last_server_received_at),
      last_accuracy              = COALESCE($8, last_accuracy)
    WHERE id = $1
    `,
    [
      runId,
      scoreToAdd,
      newSequenceNumber,
      lastPoint?.latitude           ?? null,
      lastPoint?.longitude          ?? null,
      lastPoint?.client_timestamp   ?? null,
      lastPoint?.server_received_at?.toISOString() ?? null,
      lastPoint?.accuracy           ?? null,
    ]
  );
}

export async function getRunFraudScore(runId: string) {
  const result = await pool.query(
    `
    SELECT fraud_score, status
    FROM runs
    WHERE id = $1
    `,
    [runId]
  );
  return result.rows[0];
}
