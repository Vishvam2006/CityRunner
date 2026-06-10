import { db } from "../lib/db";

export async function createRun(userId: string) {
  const result = await db.query(
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
  speed: number | null
) {
  const result = await db.query(
    `
    INSERT INTO gps_points
    (
      run_id,
      latitude,
      longitude,
      accuracy,
      speed
    )
    VALUES
    (
      $1,
      $2,
      $3,
      $4,
      $5
    )
    RETURNING *
    `,
    [
      runId,
      latitude,
      longitude,
      accuracy,
      speed,
    ]
  );

  return result.rows[0];
}

export async function getRunPoints(runId: string) {
  const result = await db.query(
    `
    SELECT
      latitude,
      longitude,
      accuracy,
      speed,
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
  const result = await db.query(
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
  distanceKm: number
) {
  const result = await db.query(
    `
    UPDATE runs
    SET
      ended_at = NOW(),
      distance_km = $2
    WHERE id = $1
    RETURNING *
    `,
    [runId, distanceKm]
  );

  return result.rows[0];
}