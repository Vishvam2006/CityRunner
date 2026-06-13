import { Router } from "express";

import { auth } from "../middleware/auth.middleware";

import {
  startRun,
  savePoint,
  getRun,
  getRunDistance,
  getRunLoopsController,
  finishRun,
} from "../controllers/run.controller";

const router = Router();

router.post("/:runId/finish",   auth, finishRun);
router.post("/start",           auth, startRun);
router.post("/:runId/points",   auth, savePoint);
router.get("/:runId/distance",  auth, getRunDistance);
router.get("/:runId/loops",     auth, getRunLoopsController);
router.get("/:runId",           auth, getRun);

export default router;