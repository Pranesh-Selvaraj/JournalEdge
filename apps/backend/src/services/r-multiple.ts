import type { CreateTradeInput } from "@journaledge/shared-types";

/**
 * R-multiple: reward / risk, normalized by direction.
 *  long:  risk = entry - SL,        reward = exit - entry
 *  short: risk = SL - entry,        reward = entry - exit
 * Returns null when inputs are missing/invalid (no SL, no exit, zero risk).
 */
export function calculateRMultiple(input: {
  direction: "long" | "short";
  entryPrice: number;
  exitPrice?: number | null;
  stopLoss?: number | null;
}): number | null {
  const { direction, entryPrice, exitPrice, stopLoss } = input;
  if (entryPrice == null || exitPrice == null || stopLoss == null) return null;
  if (!Number.isFinite(entryPrice) || !Number.isFinite(exitPrice) || !Number.isFinite(stopLoss)) {
    return null;
  }
  let risk: number;
  let reward: number;
  if (direction === "long") {
    risk = entryPrice - stopLoss;
    reward = exitPrice - entryPrice;
  } else {
    risk = stopLoss - entryPrice;
    reward = entryPrice - exitPrice;
  }
  if (risk <= 0) return null;
  const r = reward / risk;
  return Math.round(r * 10000) / 10000;
}

export function withRMultiple<T extends Pick<CreateTradeInput, "direction" | "entryPrice" | "exitPrice" | "stopLoss">>(
  trade: T,
): T & { rMultiple: number | null } {
  return {
    ...trade,
    rMultiple: calculateRMultiple({
      direction: trade.direction,
      entryPrice: Number(trade.entryPrice),
      exitPrice: trade.exitPrice != null ? Number(trade.exitPrice) : null,
      stopLoss: trade.stopLoss != null ? Number(trade.stopLoss) : null,
    }),
  };
}
