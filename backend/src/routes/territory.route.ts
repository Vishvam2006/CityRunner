import { Router } from "express";
import { testTerritory } from "../controllers/territory.controller";

const router = Router();

router.post("/test", testTerritory);

export default router;