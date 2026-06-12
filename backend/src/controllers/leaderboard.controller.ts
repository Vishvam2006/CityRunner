import { Response } from "express";
import { pool } from "../db/postgres";
import { AuthRequest } from "../types/auth-request";

export const getLeaderboard = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        u.id as "userId", 
        u.username, 
        s.total_distance_km as distance, 
        s.total_loops as loops, 
        s.total_runs as runs,
        RANK() OVER(
          ORDER BY s.total_distance_km DESC, s.total_loops DESC, s.total_runs DESC
        ) as rank
      FROM user_stats s
      JOIN users u ON s.user_id = u.id
      ORDER BY s.total_distance_km DESC, s.total_loops DESC, s.total_runs DESC
      LIMIT $1 OFFSET $2;
    `;

    const countQuery = `SELECT COUNT(*) FROM user_stats;`;

    const [result, countResult] = await Promise.all([
      pool.query(query, [limit, offset]),
      pool.query(countQuery)
    ]);

    const totalRecords = parseInt(countResult.rows[0].count);

    return res.status(200).json({
      data: result.rows,
      meta: {
        page,
        limit,
        totalPages: Math.ceil(totalRecords / limit),
        totalRecords,
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getTopLeaderboard = async (req: AuthRequest, res: Response) => {
  try {
    const query = `
      SELECT 
        u.id as "userId", 
        u.username, 
        s.total_distance_km as distance, 
        s.total_loops as loops, 
        s.total_runs as runs,
        RANK() OVER(
          ORDER BY s.total_distance_km DESC, s.total_loops DESC, s.total_runs DESC
        ) as rank
      FROM user_stats s
      JOIN users u ON s.user_id = u.id
      ORDER BY s.total_distance_km DESC, s.total_loops DESC, s.total_runs DESC
      LIMIT 10;
    `;

    const result = await pool.query(query);

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const getRankForStats = async (distance: number, loops: number, runs: number) => {
  const rankQuery = `
    SELECT COUNT(*) + 1 AS rank
    FROM user_stats
    WHERE 
      total_distance_km > $1 OR
      (total_distance_km = $1 AND total_loops > $2) OR
      (total_distance_km = $1 AND total_loops = $2 AND total_runs > $3);
  `;
  const result = await pool.query(rankQuery, [distance, loops, runs]);
  return parseInt(result.rows[0].rank);
};

export const getMyLeaderboard = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const query = `
      SELECT 
        u.id as "userId", 
        u.username, 
        COALESCE(s.total_distance_km, 0) as distance, 
        COALESCE(s.total_loops, 0) as loops, 
        COALESCE(s.total_runs, 0) as runs
      FROM users u
      LEFT JOIN user_stats s ON s.user_id = u.id
      WHERE u.id = $1;
    `;

    const result = await pool.query(query, [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const userData = result.rows[0];
    const rank = await getRankForStats(userData.distance, userData.loops, userData.runs);

    return res.status(200).json({
      ...userData,
      rank
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getUserLeaderboard = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id;

    const query = `
      SELECT 
        u.id as "userId", 
        u.username, 
        COALESCE(s.total_distance_km, 0) as distance, 
        COALESCE(s.total_loops, 0) as loops, 
        COALESCE(s.total_runs, 0) as runs
      FROM users u
      LEFT JOIN user_stats s ON s.user_id = u.id
      WHERE u.id = $1;
    `;

    const result = await pool.query(query, [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const userData = result.rows[0];
    const rank = await getRankForStats(userData.distance, userData.loops, userData.runs);

    return res.status(200).json({
      ...userData,
      rank
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
