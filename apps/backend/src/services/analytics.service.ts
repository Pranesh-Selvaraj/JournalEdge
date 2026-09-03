import type { TradeRow } from "../db/schema.js";

export interface AnalyticsSummary {
  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  totalR: number;
  avgR: number;
  bestR: number | null;
  worstR: number | null;
  bySymbol: Array<{ symbol: string; trades: number; totalR: number; winRate: number }>;
  byStrategy: Array<{ strategy: string; trades: number; totalR: number; winRate: number }>;
  bySetupGrade: Array<{ grade: string; trades: number; totalR: number; winRate: number }>;
  equityCurve: Array<{ x: number; label: string; cumulativeR: number }>;
}

function num(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function groupStats<T>(items: TradeRow[], keyFn: (t: TradeRow) => T | null | undefined) {
  const map = new Map<string, { trades: number; wins: number; totalR: number; rCount: number }>();
  for (const t of items) {
    const k = keyFn(t);
    if (k == null || k === "") continue;
    const key = String(k);
    const e = map.get(key) ?? { trades: 0, wins: 0, totalR: 0, rCount: 0 };
    e.trades++;
    const r = num(t.rMultiple);
    if (r != null) {
      e.totalR += r;
      e.rCount++;
      if (r > 0) e.wins++;
    }
    map.set(key, e);
  }
  return [...map.entries()].map(([key, e]) => ({
    key,
    trades: e.trades,
    totalR: Math.round(e.totalR * 10000) / 10000,
    winRate: e.rCount === 0 ? 0 : Math.round((e.wins / e.rCount) * 1000) / 10,
  }));
}

export function summarizeTrades(input: TradeRow[]): AnalyticsSummary {
  const withR = input.map((t) => ({ t, r: num(t.rMultiple) })).filter((x) => x.r != null);
  const rs = withR.map((x) => x.r as number);

  const wins = rs.filter((r) => r > 0).length;
  const losses = rs.filter((r) => r < 0).length;
  const breakeven = rs.filter((r) => r === 0).length;
  const totalR = rs.reduce((a, b) => a + b, 0);

  const sorted = [...input].sort((a, b) => {
    const ta = a.exitTime ?? a.entryTime ?? a.createdAt;
    const tb = b.exitTime ?? b.entryTime ?? b.createdAt;
    return new Date(ta as unknown as string).getTime() - new Date(tb as unknown as string).getTime();
  });

  let cum = 0;
  const equityCurve = sorted.map((t, i) => {
    const r = num(t.rMultiple) ?? 0;
    cum += r;
    const d = t.exitTime ?? t.entryTime ?? t.createdAt;
    return {
      x: i + 1,
      label: d ? new Date(d as unknown as string).toISOString().slice(0, 10) : `#${i + 1}`,
      cumulativeR: Math.round(cum * 10000) / 10000,
    };
  });

  return {
    totalTrades: input.length,
    wins,
    losses,
    breakeven,
    winRate: rs.length === 0 ? 0 : Math.round((wins / rs.length) * 1000) / 10,
    totalR: Math.round(totalR * 10000) / 10000,
    avgR: rs.length === 0 ? 0 : Math.round((totalR / rs.length) * 10000) / 10000,
    bestR: rs.length ? Math.max(...rs) : null,
    worstR: rs.length ? Math.min(...rs) : null,
    bySymbol: groupStats(input, (t) => t.symbol).map((g) => ({ symbol: g.key, trades: g.trades, totalR: g.totalR, winRate: g.winRate })),
    byStrategy: groupStats(input, (t) => t.strategy).map((g) => ({ strategy: g.key, trades: g.trades, totalR: g.totalR, winRate: g.winRate })),
    bySetupGrade: groupStats(input, (t) => t.setupGrade).map((g) => ({ grade: g.key, trades: g.trades, totalR: g.totalR, winRate: g.winRate })),
    equityCurve,
  };
}
