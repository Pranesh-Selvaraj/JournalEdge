import { useState } from "react";
import { getTradeOutcome, OUTCOME_LABELS } from "@journaledge/shared-types";
import { trpc } from "../../lib/trpc";

const GRADES = ["A++", "A", "B", "C", "D", "F"] as const;

export function TradeForm({ onSaved }: { onSaved?: () => void }) {
  const [form, setForm] = useState({
    symbol: "",
    direction: "long",
    entryPrice: "",
    exitPrice: "",
    stopLoss: "",
    takeProfit: "",
    profit: "",
    strategy: "",
    emotionTag: "",
    setupGrade: "",
    notes: "",
  });
  const createMut = trpc.trades.create.useMutation();
  const utils = trpc.useUtils();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await createMut.mutateAsync({
      symbol: form.symbol.toUpperCase(),
      direction: form.direction as "long" | "short",
      entryPrice: Number(form.entryPrice),
      exitPrice: form.exitPrice ? Number(form.exitPrice) : undefined,
      stopLoss: form.stopLoss ? Number(form.stopLoss) : undefined,
      takeProfit: form.takeProfit ? Number(form.takeProfit) : undefined,
      profit: form.profit.trim() ? Number(form.profit) : undefined,
      strategy: form.strategy || undefined,
      emotionTag: form.emotionTag || undefined,
      setupGrade: (form.setupGrade || undefined) as never,
      notes: form.notes || undefined,
    } as never);
    setForm({ symbol: "", direction: "long", entryPrice: "", exitPrice: "", stopLoss: "", takeProfit: "", profit: "", strategy: "", emotionTag: "", setupGrade: "", notes: "" });
    await utils.trades.list.invalidate();
    onSaved?.();
  }

  const liveOutcome =
    form.entryPrice.trim() && (form.exitPrice.trim() || form.profit.trim())
      ? getTradeOutcome({
          direction: form.direction as "long" | "short",
          entryPrice: Number(form.entryPrice),
          exitPrice: form.exitPrice.trim() ? Number(form.exitPrice) : undefined,
          profit: form.profit.trim() ? Number(form.profit) : undefined,
        })
      : null;

  const input = "rounded bg-slate-950 p-2 text-sm outline-none ring-emerald-500 focus:ring-1";

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-lg font-semibold">Manual Entry</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <input className={input} placeholder="Symbol (BTCUSD)" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} required />
        <select className={input} value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
          <option value="long">long</option>
          <option value="short">short</option>
        </select>
        <input className={input} placeholder="Entry" type="number" step="any" value={form.entryPrice} onChange={(e) => setForm({ ...form, entryPrice: e.target.value })} required />
        <input className={input} placeholder="Exit" type="number" step="any" value={form.exitPrice} onChange={(e) => setForm({ ...form, exitPrice: e.target.value })} />
        <input className={input} placeholder="Stop Loss" type="number" step="any" value={form.stopLoss} onChange={(e) => setForm({ ...form, stopLoss: e.target.value })} />
        <input className={input} placeholder="Take Profit" type="number" step="any" value={form.takeProfit} onChange={(e) => setForm({ ...form, takeProfit: e.target.value })} />
        <input className={input} placeholder="P&L (+/-)" type="number" step="any" value={form.profit} onChange={(e) => setForm({ ...form, profit: e.target.value })} title="Realized profit/loss in account currency — overrides price-derived outcome" />
        <input className={input} placeholder="Strategy" value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value })} />
        <input className={input} placeholder="Emotion (confident…)" value={form.emotionTag} onChange={(e) => setForm({ ...form, emotionTag: e.target.value })} />
        <select className={input} value={form.setupGrade} onChange={(e) => setForm({ ...form, setupGrade: e.target.value })}>
          <option value="">Grade…</option>
          {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <input className={input} placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
      <button disabled={createMut.isLoading} className="mt-3 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40">
        {createMut.isLoading ? "Saving…" : "Add trade"}
      </button>
      {liveOutcome && (
        <span className="ml-2 rounded bg-slate-800 px-2 py-1 text-xs text-slate-300">
          Outcome: <b>{OUTCOME_LABELS[liveOutcome]}</b>
        </span>
      )}
      {createMut.isError && <p className="mt-2 text-xs text-red-400">Failed: {String(createMut.error)}</p>}
    </form>
  );
}
