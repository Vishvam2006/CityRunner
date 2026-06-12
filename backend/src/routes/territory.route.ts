import { Router } from "express";

import { auth } from "../middleware/auth.middleware";
import {
  checkLoop,
  createTerritory,
  getTerritories,
} from "../controllers/territory.controller";


const router = Router();

router.get("/loop/:runId", auth, checkLoop);

router.post("/", auth, createTerritory);

router.get("/", auth, getTerritories);

export default router;
