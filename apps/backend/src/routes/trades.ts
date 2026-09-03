import { and, desc, eq, gte, ilike, lte } from "drizzle-orm";
import { z } from "zod";
import {
  createTradeSchema,
  tradeFilterSchema,
  updateTradeSchema,
} from "@journaledge/shared-types";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import { getDb, requireDb } from "../db/index.js";
import { trades } from "../db/schema.js";
import { withRMultiple } from "../services/r-multiple.js";
import { parsePastedTrades } from "../services/parser.service.js";

const idInput = z.object({ id: z.string().uuid() });

function toDbRow(input: Record<string, unknown>, userId?: string | null) {
  return {
    userId: userId ?? undefined,
    symbol: input.symbol as string,
    direction: input.direction as "long" | "short",
    entryPrice: input.entryPrice != null ? String(input.entryPrice) : undefined,
    exitPrice: input.exitPrice != null ? String(input.exitPrice) : null,
    stopLoss: input.stopLoss != null ? String(input.stopLoss) : null,
    takeProfit: input.takeProfit != null ? String(input.takeProfit) : null,
    rMultiple: input.rMultiple != null ? String(input.rMultiple as number) : null,
    entryTime: input.entryTime ? new Date(input.entryTime as string | Date) : null,
    exitTime: input.exitTime ? new Date(input.exitTime as string | Date) : null,
    strategy: (input.strategy as string) ?? null,
    emotionTag: (input.emotionTag as string) ?? null,
    setupGrade: (input.setupGrade as "A++" | "A" | "B" | "C" | "D" | "F") ?? null,
    notes: (input.notes as string) ?? null,
    screenshotUrl: (input.screenshotUrl as string) || null,
  };
}

export const tradesRouter = router({
  list: publicProcedure.input(tradeFilterSchema.optional()).query(async ({ input, ctx }) => {
    const db = getDb();
    if (!db) return [];
    const conds = [];
    if (ctx.user?.id) conds.push(eq(trades.userId, ctx.user.id));
    if (input?.symbol) conds.push(ilike(trades.symbol, `%${input.symbol}%`));
    if (input?.direction) conds.push(eq(trades.direction, input.direction));
    if (input?.strategy) conds.push(ilike(trades.strategy, `%${input.strategy}%`));
    if (input?.setupGrade) conds.push(eq(trades.setupGrade, input.setupGrade));
    if (input?.from) conds.push(gte(trades.entryTime, new Date(input.from)));
    if (input?.to) conds.push(lte(trades.entryTime, new Date(input.to)));
    const rows = await db
      .select()
      .from(trades)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(trades.createdAt))
      .limit(input?.limit ?? 50)
      .offset(input?.offset ?? 0);
    return rows;
  }),

  get: publicProcedure.input(idInput).query(async ({ input }) => {
    const db = getDb();
    if (!db) throw new Error("Database not configured");
    const rows = await db.select().from(trades).where(eq(trades.id, input.id)).limit(1);
    if (!rows[0]) throw new Error("Trade not found");
    return rows[0];
  }),

  create: publicProcedure.input(createTradeSchema).mutation(async ({ input, ctx }) => {
    const db = requireDb();
    const enriched = withRMultiple(input);
    const [row] = await db
      .insert(trades)
      .values(toDbRow(enriched as unknown as Record<string, unknown>, ctx.user?.id) as never)
      .returning();
    return row;
  }),

  update: publicProcedure.input(z.object({ id: z.string().uuid(), patch: updateTradeSchema })).mutation(async ({ input }) => {
    const db = requireDb();
    const current = await db.select().from(trades).where(eq(trades.id, input.id)).limit(1);
    if (!current[0]) throw new Error("Trade not found");
    const merged = {
      direction: (input.patch.direction ?? current[0].direction) as "long" | "short",
      entryPrice: Number(input.patch.entryPrice ?? current[0].entryPrice),
      exitPrice: input.patch.exitPrice !== undefined ? (input.patch.exitPrice as number | null) : current[0].exitPrice != null ? Number(current[0].exitPrice) : null,
      stopLoss: input.patch.stopLoss !== undefined ? (input.patch.stopLoss as number | null) : current[0].stopLoss != null ? Number(current[0].stopLoss) : null,
    };
    const { calculateRMultiple } = await import("../services/r-multiple.js");
    const rMultiple = calculateRMultiple(merged);
    const patch: Record<string, unknown> = { ...input.patch };
    if (patch.entryPrice != null) patch.entryPrice = String(patch.entryPrice);
    if (patch.exitPrice !== undefined) patch.exitPrice = patch.exitPrice != null ? String(patch.exitPrice) : null;
    if (patch.stopLoss !== undefined) patch.stopLoss = patch.stopLoss != null ? String(patch.stopLoss) : null;
    if (patch.takeProfit !== undefined) patch.takeProfit = patch.takeProfit != null ? String(patch.takeProfit) : null;
    if (patch.entryTime) patch.entryTime = new Date(patch.entryTime as string | Date);
    if (patch.exitTime) patch.exitTime = new Date(patch.exitTime as string | Date);
    (patch as Record<string, unknown>).rMultiple = rMultiple != null ? String(rMultiple) : null;
    const [row] = await db.update(trades).set(patch as never).where(eq(trades.id, input.id)).returning();
    return row;
  }),

  remove: publicProcedure.input(idInput).mutation(async ({ input }) => {
    const db = requireDb();
    await db.delete(trades).where(eq(trades.id, input.id));
    return { ok: true };
  }),

  /** Parse pasted tabular text without saving — used for the editable preview fallback. */
  parsePaste: publicProcedure.input(z.object({ text: z.string().max(200_000) })).query(({ input }) => {
    return parsePastedTrades(input.text);
  }),

  /** Bulk-create validated trades (e.g. after preview editing). */
  importRows: publicProcedure.input(z.object({ rows: z.array(createTradeSchema).max(500) })).mutation(async ({ input, ctx }) => {
    const db = requireDb();
    if (input.rows.length === 0) return [];
    const values = input.rows.map((r) => {
      const enriched = withRMultiple(r);
      return toDbRow(enriched as unknown as Record<string, unknown>, ctx.user?.id) as never;
    });
    const inserted = await db.insert(trades).values(values).returning();
    return inserted;
  }),
});
