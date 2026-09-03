import "dotenv/config";
import express from "express";
import cors from "cors";
import * as trpcExpress from "@trpc/server/adapters/express";
import { appRouter } from "./routes/index.js";
import { importRouter } from "./routes/import.js";
import { createContext } from "./trpc.js";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.use(
  "/trpc",
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

app.use("/api/import", importRouter);

app.listen(PORT, () => {
  console.log(`JournalEdge backend listening on http://localhost:${PORT}`);
  console.log(`  REST health: http://localhost:${PORT}/health`);
  console.log(`  tRPC:        http://localhost:${PORT}/trpc/health.check`);
});
