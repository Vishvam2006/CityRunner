import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import { connectDB } from "./db/postgres";
// import authRouter from "./routes/auth.route";
import territoryRouter from "./routes/territory.route";
import runRouter from "./routes/run.route";
const PORT = process.env.PORT || 3000;
const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_, res) => {
  res.json({
    status: "ok",
  });
});

// app.use("/api/auth", authRouter);
app.use("/api/runs", runRouter);
app.use("/api/territory", territoryRouter);
const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
};

startServer();
export default app;
