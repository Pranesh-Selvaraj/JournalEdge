import { pgTable, uuid, text, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const directionEnum = pgEnum("direction", ["long", "short"]);
export const setupGradeEnum = pgEnum("setup_grade", ["A++", "A", "B", "C", "D", "F"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const trades = pgTable("trades", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  direction: directionEnum("direction").notNull(),
  entryPrice: numeric("entry_price", { precision: 18, scale: 8 }).notNull(),
  exitPrice: numeric("exit_price", { precision: 18, scale: 8 }),
  stopLoss: numeric("stop_loss", { precision: 18, scale: 8 }),
  takeProfit: numeric("take_profit", { precision: 18, scale: 8 }),
  rMultiple: numeric("r_multiple", { precision: 18, scale: 4 }),
  entryTime: timestamp("entry_time"),
  exitTime: timestamp("exit_time"),
  strategy: text("strategy"),
  emotionTag: text("emotion_tag"),
  setupGrade: setupGradeEnum("setup_grade"),
  notes: text("notes"),
  screenshotUrl: text("screenshot_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  trades: many(trades),
}));

export const tradesRelations = relations(trades, ({ one }) => ({
  user: one(users, { fields: [trades.userId], references: [users.id] }),
}));

export type TradeRow = typeof trades.$inferSelect;
export type NewTradeRow = typeof trades.$inferInsert;
