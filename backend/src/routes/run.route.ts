import { Router } from "express";

import { auth } from "../middleware/auth.middleware";

import {
  startRun, savePoint,
} from "../controllers/run.controller";


const router = Router();

router.post(
  "/start",
  auth,
  startRun
);

router.post(
  "/:runId/point",
  auth,
  savePoint
);

export default router;