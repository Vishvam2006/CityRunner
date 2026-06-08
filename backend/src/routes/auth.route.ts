import { Router } from "express";
import { AuthRequest } from "../types/auth-request";

import {
  register,
  login,
} from "../controllers/auth.controller";

import { auth } from "../middleware/auth.middleware";

const router = Router();

router.post("/register", register);

router.post("/login", login);

router.get(
  "/me",
  auth,
  async (req: AuthRequest, res) => {
    return res.json({
      user: req.user,
    });
  }
);

export default router;