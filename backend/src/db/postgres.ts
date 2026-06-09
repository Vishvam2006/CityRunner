
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

export const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
});

export const connectDB = async () => {
  try {
    const client = await pool.connect();

    const result = await client.query("SELECT NOW()");

    console.log("PostgreSQL Connected");

    client.release();
  } catch (error) {
    console.error("Database Connection Failed");
    console.error(error);
    process.exit(1);
  }
};