import express from "express";
import cors from "cors";
import { connectDB } from "./db/postgres";
import { env } from "./lib/env";
import authRouter from "./routes/auth.route";
import territoryRouter from "./routes/territory.route";
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
app.use("/api/territory", territoryRouter);




const startServer = async () => {
  await connectDB();

  app.listen(Number(env.PORT), () => {
    console.log(`🚀 Server running on port ${env.PORT}`);
  });
};

startServer();
export default app;
