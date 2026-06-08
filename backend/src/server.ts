// import "./types/express";
import app from "./app";
import { env } from "./lib/env";


app.listen(Number(env.PORT), () => {
  console.log(
    `Server running on port ${env.PORT}`
  );
});