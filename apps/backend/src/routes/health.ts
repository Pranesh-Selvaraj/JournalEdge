import { router, publicProcedure } from "../trpc.js";
import { getDb } from "../db/index.js";
import { sql } from "drizzle-orm";

export const healthRouter = router({
  check: publicProcedure.query(async () => {
    let db: "up" | "down" | "unconfigured" = "unconfigured";
    try {
      const inst = getDb();
      if (!inst) return { status: "ok" as const, db, time: new Date().toISOString() };
      await inst.execute(sql`select 1`);
      db = "up";
    } catch {
      db = "down";
    }
    return { status: "ok" as const, db, time: new Date().toISOString() };
  }),
});
