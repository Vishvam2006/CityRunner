import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  PORT: z.string().default("5000"),

  DATABASE_URL: z.string().min(1),

  JWT_SECRET: z.string().min(8),
});

export const env = envSchema.parse(process.env);