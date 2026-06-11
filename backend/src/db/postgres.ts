import { Pool } from "pg";

import { env } from "../lib/env";

// Use the validated DATABASE_URL from env.ts.
// This is the single source of truth for the connection string and avoids
// the split DB_USER / DB_HOST / DB_PASSWORD vars that were out of sync.
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

export const connectDB = async () => {
  try {
    const client = await pool.connect();

    await client.query("SELECT NOW()");

    console.log("✅ PostgreSQL Connected");

    client.release();
  } catch (error) {
    console.error("❌ Database Connection Failed");
    console.error(error);
    process.exit(1);
  }
};