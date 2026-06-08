import express from "express";
import cors from "cors";

import authRouter from "./routes/auth.route";
import runRouter from "./routes/run.route";

const app = express();

app.use(cors());

app.use(express.json());

app.get("/health", (_, res) => {
  res.json({
    status: "ok",
  });
});

app.use("/api/auth", authRouter);

app.use("/api/runs", runRouter);

export default app;