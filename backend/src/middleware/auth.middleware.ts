import { Response, NextFunction } from "express";

import { AuthRequest } from "../types/auth-request";

import jwt from "jsonwebtoken";

import { env } from "../lib/env";
import { AuthUser } from "../types/auth-user";

export async function auth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthUser;

    req.user = decoded;

    next();
  } catch {
    return res.status(401).json({
      message: "Invalid token",
    });
  }
}
