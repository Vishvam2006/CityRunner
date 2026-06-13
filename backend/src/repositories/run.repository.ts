
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
    ORDER BY recorded_at ASC
    `,
    [runId]
  );

  return result.rows;
}

export async function findRunByIdAndUserId(
  runId: string,
  userId: string
) {
  const result = await pool.query(
    `
    SELECT *
    FROM runs
    WHERE id = $1
    AND user_id = $2
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

