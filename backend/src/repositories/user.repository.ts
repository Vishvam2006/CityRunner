import { pool } from "../db/postgres";

export async function findUserByEmail(
  email: string
) {
  const result = await pool.query(
    `
    SELECT *
    FROM users
    WHERE email = $1
    `,
    [email]
  );

  return result.rows[0];
}

export async function createUser(
  username: string,
  email: string,
  passwordHash: string
) {
  const result = await pool.query(
    `
    INSERT INTO users
    (
      username,
      email,
      password_hash
    )
    VALUES
    (
      $1,
      $2,
      $3
    )
    RETURNING *
    `,
    [
      username,
      email,
      passwordHash,
    ]
  );

  return result.rows[0];
}

export async function updateUserStats(
  userId: string,
  distanceKm: number,
  loopsDetected: number
) {
  await pool.query(
    `
    INSERT INTO user_stats (user_id, total_distance_km, total_runs, total_loops)
    VALUES ($1, $2, 1, $3)
    ON CONFLICT (user_id) DO UPDATE SET
      total_distance_km = user_stats.total_distance_km + EXCLUDED.total_distance_km,
      total_runs = user_stats.total_runs + EXCLUDED.total_runs,
      total_loops = user_stats.total_loops + EXCLUDED.total_loops,
      last_updated = CURRENT_TIMESTAMP
    `,
    [userId, distanceKm, loopsDetected]
  );
}