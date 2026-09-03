import { useState } from "react";
import { trpc } from "../../lib/trpc";

export function TradeList() {
  const [symbol, setSymbol] = useState("");
  const [direction, setDirection] = useState("");
  const query = trpc.trades.list.useQuery({ symbol: symbol || undefined, direction: (direction || undefined) as never, limit: 100 });
  const utils = trpc.useUtils();
  const removeMut = trpc.trades.remove.useMutation({
    onSuccess: () => utils.trades.list.invalidate(),
  });

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Journal</h2>
        <div className="flex gap-2 text-sm">
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Filter symbol…" className="rounded bg-slate-950 p-2" />
          <select value={direction} onChange={(e) => setDirection(e.target.value)} className="rounded bg-slate-950 p-2">
            <option value="">long+short</option>
            <option value="long">long</option>
            <option value="short">short</option>
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

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400">
              <th className="p-2">Symbol</th>
              <th className="p-2">Dir</th>
              <th className="p-2">Entry</th>
              <th className="p-2">Exit</th>
              <th className="p-2">SL</th>
              <th className="p-2">TP</th>
              <th className="p-2">R</th>
              <th className="p-2">Strategy</th>
              <th className="p-2">Grade</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {(query.data ?? []).map((t) => (
              <tr key={t.id} className="border-t border-slate-800">
                <td className="p-2 font-semibold">{t.symbol}</td>
                <td className={`p-2 ${t.direction === "long" ? "text-emerald-300" : "text-red-300"}`}>{t.direction}</td>
                <td className="p-2">{String(t.entryPrice)}</td>
                <td className="p-2">{t.exitPrice != null ? String(t.exitPrice) : "—"}</td>
                <td className="p-2">{t.stopLoss != null ? String(t.stopLoss) : "—"}</td>
                <td className="p-2">{t.takeProfit != null ? String(t.takeProfit) : "—"}</td>
                <td className={`p-2 font-mono ${Number(t.rMultiple) > 0 ? "text-emerald-300" : Number(t.rMultiple) < 0 ? "text-red-300" : ""}`}>
                  {t.rMultiple != null ? Number(t.rMultiple).toFixed(2) : "—"}
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
