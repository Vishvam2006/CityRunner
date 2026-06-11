import { Router } from "express";

import { auth } from "../middleware/auth.middleware";
import { checkLoop } from "../controllers/territory.controller";

const router = Router();

/**
 * GET /api/territory/loop/:runId
 *
 * Returns loop detection result for the given run.
 * Requires a valid JWT in the Authorization header.
 */
router.get("/loop/:runId", auth, checkLoop);

export default router;