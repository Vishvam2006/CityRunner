import { db } from "../lib/db";

export async function createRun(
  userId: string
) {
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
  longitude: number
) {
  const result = await db.query(
    `
    INSERT INTO gps_points
    (
      run_id,
      latitude,
      longitude
    )
    VALUES
    (
      $1,
      $2,
      $3
    )
    RETURNING *
    `,
    [runId, latitude, longitude]
  );

  return result.rows[0];
}