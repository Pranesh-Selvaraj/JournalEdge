import { eq } from "drizzle-orm";
import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { getDb } from "../db/index.js";
import { trades } from "../db/schema.js";
import { summarizeTrades } from "../services/analytics.service.js";

export const analyticsRouter = router({
  summary: publicProcedure
    .input(z.object({ symbol: z.string().optional(), strategy: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) {
        return summarizeTrades([]);
      }
      const all = ctx.user?.id
        ? await db.select().from(trades).where(eq(trades.userId, ctx.user.id))
        : await db.select().from(trades);
      const filtered = all.filter((t) => {
        if (input?.symbol && !t.symbol.toLowerCase().includes(input.symbol.toLowerCase())) return false;
        if (input?.strategy && (t.strategy ?? "").toLowerCase() !== input.strategy.toLowerCase()) return false;
        return true;
      });
      return summarizeTrades(filtered);
    }),
});
