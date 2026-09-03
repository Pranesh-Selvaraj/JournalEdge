import { useMemo, useState } from "react";
import { getTradeOutcome, OUTCOME_LABELS, type TradeOutcome } from "@journaledge/shared-types";
import { trpc } from "../../lib/trpc";

const OUTCOME_STYLES: Record<TradeOutcome, string> = {
  profit: "bg-emerald-900 text-emerald-200",
  loss: "bg-red-900/60 text-red-200",
  breakeven: "bg-slate-700 text-slate-300",
  open: "bg-sky-900 text-sky-200",
};

export function TradeList() {
  const [symbol, setSymbol] = useState("");
  const [direction, setDirection] = useState("");
  const [outcome, setOutcome] = useState<"" | TradeOutcome>("");
  const query = trpc.trades.list.useQuery({ symbol: symbol || undefined, direction: (direction || undefined) as never, limit: 100 });
  const utils = trpc.useUtils();
  const removeMut = trpc.trades.remove.useMutation({
    onSuccess: () => utils.trades.list.invalidate(),
  });

  const withOutcome = useMemo(
    () => (query.data ?? []).map((t) => ({ t, outcome: getTradeOutcome(t as never) })),
    [query.data],
  );
  const counts = useMemo(() => {
    const c: Record<TradeOutcome, number> = { profit: 0, loss: 0, breakeven: 0, open: 0 };
    for (const { outcome: o } of withOutcome) c[o]++;
    return c;
  }, [withOutcome]);
  const visible = outcome ? withOutcome.filter(({ outcome: o }) => o === outcome) : withOutcome;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          Journal{" "}
          <span className="text-xs font-normal text-slate-400">
            {counts.profit} profit · {counts.loss} loss · {counts.breakeven} breakeven · {counts.open} open
          </span>
        </h2>
        <div className="flex gap-2 text-sm">
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Filter symbol…" className="rounded bg-slate-950 p-2" />
          <select value={direction} onChange={(e) => setDirection(e.target.value)} className="rounded bg-slate-950 p-2">
            <option value="">long+short</option>
            <option value="long">long</option>
            <option value="short">short</option>
          </select>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value as "" | TradeOutcome)} className="rounded bg-slate-950 p-2" title="Filter by outcome">
            <option value="">all outcomes</option>
            <option value="profit">profit</option>
            <option value="loss">loss</option>
            <option value="breakeven">breakeven</option>
            <option value="open">open</option>
          </select>
        </div>
      </div>

      {query.isLoading && <p className="mt-3 text-sm text-slate-400">Loading…</p>}
      {query.isError && (
        <p className="mt-3 text-sm text-amber-300">
          Could not load trades ({String(query.error)}). Is the backend running on :4000 with Postgres up?
        </p>
      )}
      {query.data?.length === 0 && <p className="mt-3 text-sm text-slate-400">No trades yet — add one above or use Smart Entry.</p>}
      {query.data && query.data.length > 0 && visible.length === 0 && (
        <p className="mt-3 text-sm text-slate-400">No trades match this outcome filter.</p>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400">
              <th className="p-2">Symbol</th>
              <th className="p-2">Dir</th>
              <th className="p-2">Outcome</th>
              <th className="p-2">Entry</th>
              <th className="p-2">Exit</th>
              <th className="p-2">SL</th>
              <th className="p-2">TP</th>
              <th className="p-2">R</th>
              <th className="p-2">P&amp;L</th>
              <th className="p-2">Strategy</th>
              <th className="p-2">Grade</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map(({ t, outcome: o }) => (
              <tr key={t.id} className="border-t border-slate-800">
                <td className="p-2 font-semibold">{t.symbol}</td>
                <td className={`p-2 ${t.direction === "long" ? "text-emerald-300" : "text-red-300"}`}>{t.direction}</td>
                <td className="p-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${OUTCOME_STYLES[o]}`}>
                    {OUTCOME_LABELS[o]}
                  </span>
                </td>
                <td className="p-2">{String(t.entryPrice)}</td>
                <td className="p-2">{t.exitPrice != null ? String(t.exitPrice) : "—"}</td>
                <td className="p-2">{t.stopLoss != null ? String(t.stopLoss) : "—"}</td>
                <td className="p-2">{t.takeProfit != null ? String(t.takeProfit) : "—"}</td>
                <td className={`p-2 font-mono ${Number(t.rMultiple) > 0 ? "text-emerald-300" : Number(t.rMultiple) < 0 ? "text-red-300" : ""}`}>
                  {t.rMultiple != null ? Number(t.rMultiple).toFixed(2) : "—"}
                </td>
                <td className={`p-2 font-mono ${t.profit != null ? (Number(t.profit) > 0 ? "text-emerald-300" : Number(t.profit) < 0 ? "text-red-300" : "") : "text-slate-500"}`}>
                  {t.profit != null ? `${Number(t.profit) > 0 ? "+" : ""}${Number(t.profit).toFixed(2)}` : "—"}
                </td>
                <td className="p-2 text-slate-300">{t.strategy ?? "—"}</td>
                <td className="p-2">{t.setupGrade ?? "—"}</td>
                <td className="p-2">
                  <button
                    onClick={() => removeMut.mutate({ id: t.id })}
                    className="rounded bg-slate-800 px-2 py-1 text-xs hover:bg-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
