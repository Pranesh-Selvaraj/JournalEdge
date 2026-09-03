import { router } from "../trpc.js";
import { healthRouter } from "./health.js";
import { tradesRouter } from "./trades.js";
import { analyticsRouter } from "./analytics.js";
import { authRouter } from "./auth.js";

export const appRouter = router({
  health: healthRouter,
  trades: tradesRouter,
  analytics: analyticsRouter,
  auth: authRouter,
});

export type AppRouter = typeof appRouter;
