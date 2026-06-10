import { Router } from "express";

import { auth } from "../middleware/auth.middleware";

import {
  startRun,
  savePoint,
  getRun,
  getRunDistance,
  finishRun
} from "../controllers/run.controller";

const router = Router();

router.post(
  "/start",
  auth,
  startRun
);

router.post(
  "/:runId/points",
  auth,
  savePoint
);

router.get(
  "/:runId",
  auth,
  getRun
);

router.get(
  "/:runId/distance",
  auth,
  getRunDistance
);

router.post(
  "/:runId/finish",
  auth,
  finishRun
);

export default router;