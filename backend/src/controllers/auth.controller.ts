import { Request, Response } from "express";

import bcrypt from "bcrypt";

import { generateToken } from "../lib/jwt";

import { registerSchema } from "../validators/auth.validator";

import { findUserByEmail, createUser } from "../repositories/user.repository";

export const register = async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);

    const existingUser = await findUserByEmail(data.email);

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await createUser(data.username, data.email, passwordHash);

    return res.status(201).json({
      user,
    });
  } catch (error) {
    return res.status(400).json({
      error,
    });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const token = generateToken(user.id);

    return res.json({
      token,
    });
  } catch (error) {
    return res.status(400).json({
      error,
    });
  }
};
