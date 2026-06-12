import { Router } from "express";
import { getLeaderboard, getTopLeaderboard, getMyLeaderboard, getUserLeaderboard } from "../controllers/leaderboard.controller";
import { auth } from "../middleware/auth.middleware";

const router = Router();

router.get("/", auth, getLeaderboard);
router.get("/top", auth, getTopLeaderboard);
router.get("/me", auth, getMyLeaderboard);
router.get("/user/:id", auth, getUserLeaderboard);

export default router;
