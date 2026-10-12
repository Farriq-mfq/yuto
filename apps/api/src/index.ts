import { app } from "./app";
import { getEnv } from "./lib/env";

// Throws on missing or weak JWT_SECRET / YUTO_PASSWORD: the API refuses to start.
const env = getEnv();

app.listen({ port: env.port, hostname: "0.0.0.0" }, () => {
  console.log(`Yuto API listening on port ${env.port}`);
});
