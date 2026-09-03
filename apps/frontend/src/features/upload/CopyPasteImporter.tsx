import { useState } from "react";
import { trpc } from "../../lib/trpc";

interface EditableRow {
  symbol: string;
  direction: "long" | "short";
  entryPrice: number | string;
  exitPrice?: number | string | null;
  stopLoss?: number | string | null;
  takeProfit?: number | string | null;
  profit?: number | string | null;
  strategy?: string;
  notes?: string;
}

/**
 * Copy-paste importer:
 * - textarea for TSV/CSV from TradingView / MT4
 * - "Preview" calls trades.parsePaste (header detection + auto-mapping on backend)
 * - editable grid fallback before saving via trades.importRows
 */
export function CopyPasteImporter({ onImported }: { onImported?: () => void }) {
  const [text, setText] = useState("Symbol\tDirection\tEntry\tExit\tSL\tTP\nBTCUSD\tlong\t67000\t68500\t66500\t70000");
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [errors, setErrors] = useState<Array<{ row: number; message: string }>>([]);
  const [detected, setDetected] = useState<Record<string, string>>({});

  const parseQuery = trpc.trades.parsePaste.useQuery({ text }, { enabled: false });
  const importMut = trpc.trades.importRows.useMutation();

  async function handlePreview() {
    const res = await parseQuery.refetch();
    if (res.data) {
      setRows(
        (res.data.rows as unknown as EditableRow[]).map((r) => ({
          symbol: (r.symbol as string) ?? "",
          direction: (r.direction as "long" | "short") ?? "long",
          entryPrice: (r.entryPrice as number) ?? "",
          exitPrice: (r.exitPrice as number | null) ?? "",
          stopLoss: (r.stopLoss as number | null) ?? "",
          takeProfit: (r.takeProfit as number | null) ?? "",
          profit: (r.profit as number | null) ?? "",
          strategy: (r.strategy as string) ?? "",
          notes: (r.notes as string) ?? "",
        })),
      );
      setErrors(res.data.errors);
      setDetected(res.data.detectedColumns as Record<string, string>);
    }
  }

  function updateRow(i: number, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function handleImport() {
    const payload = rows.map((r) => ({
      symbol: String(r.symbol || "").toUpperCase(),
      direction: r.direction,
      entryPrice: Number(r.entryPrice),
      exitPrice: r.exitPrice === "" || r.exitPrice == null ? undefined : Number(r.exitPrice),
      stopLoss: r.stopLoss === "" || r.stopLoss == null ? undefined : Number(r.stopLoss),
      takeProfit: r.takeProfit === "" || r.takeProfit == null ? undefined : Number(r.takeProfit),
      profit: r.profit === "" || r.profit == null ? undefined : Number(r.profit),
      strategy: r.strategy || undefined,
      notes: r.notes || undefined,
    }));
    await importMut.mutateAsync({ rows: payload as never });
    setText("");
    setRows([]);
    setErrors([]);
    onImported?.();
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-lg font-semibold">Copy-Paste Mode</h2>
      <p className="mt-1 text-xs text-slate-400">
        Paste tab- or comma-separated rows from TradingView / MT4. Headers are auto-detected.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        spellCheck={false}
        className="mt-3 w-full rounded-lg bg-slate-950 p-3 font-mono text-xs text-slate-200 outline-none ring-emerald-500 focus:ring-1"
        placeholder={"Symbol\tEntry\tExit\tSL\tTP\nBTCUSD\t67000\t68500\t66500\t70000"}
      />
      <div className="mt-3 flex gap-2">
        <button onClick={handlePreview} className="rounded-lg bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600">
          Preview parse
        </button>
        <button
          onClick={handleImport}
          disabled={rows.length === 0 || importMut.isLoading}
          className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
        >
          {importMut.isLoading ? "Importing…" : `Import ${rows.length} row(s)`}
        </button>
      </div>

      {Object.keys(detected).length > 0 && (
        <p className="mt-2 text-xs text-slate-400">
          Detected columns: {Object.entries(detected).map(([k, v]) => `${k}→${v}`).join(", ")}
        </p>
      )}
      {errors.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-amber-300">
          {errors.map((e, i) => (
            <li key={i}>Row {e.row}: {e.message} — fix below before saving.</li>
          ))}
        </ul>
      )}
      {importMut.isError && <p className="mt-2 text-xs text-red-400">Import failed: {String(importMut.error)}</p>}
      {importMut.isSuccess && <p className="mt-2 text-xs text-emerald-300">Imported successfully.</p>}

      {rows.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="p-1">Symbol</th>
                <th className="p-1">Dir</th>
                <th className="p-1">Entry</th>
                <th className="p-1">Exit</th>
                <th className="p-1">SL</th>
                <th className="p-1">TP</th>
                <th className="p-1">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-800">
                  <td className="p-1"><input value={r.symbol} onChange={(e) => updateRow(i, { symbol: e.target.value })} className="w-20 rounded bg-slate-950 p-1" /></td>
                  <td className="p-1">
                    <select value={r.direction} onChange={(e) => updateRow(i, { direction: e.target.value as "long" | "short" })} className="rounded bg-slate-950 p-1">
                      <option value="long">long</option>
                      <option value="short">short</option>
                    </select>
                  </td>
                  <td className="p-1"><input value={String(r.entryPrice ?? "")} onChange={(e) => updateRow(i, { entryPrice: e.target.value })} className="w-20 rounded bg-slate-950 p-1" /></td>
                  <td className="p-1"><input value={String(r.exitPrice ?? "")} onChange={(e) => updateRow(i, { exitPrice: e.target.value })} className="w-20 rounded bg-slate-950 p-1" /></td>
                  <td className="p-1"><input value={String(r.stopLoss ?? "")} onChange={(e) => updateRow(i, { stopLoss: e.target.value })} className="w-20 rounded bg-slate-950 p-1" /></td>
                  <td className="p-1"><input value={String(r.takeProfit ?? "")} onChange={(e) => updateRow(i, { takeProfit: e.target.value })} className="w-20 rounded bg-slate-950 p-1" /></td>
                  <td className="p-1"><input value={String(r.profit ?? "")} onChange={(e) => updateRow(i, { profit: e.target.value })} className="w-20 rounded bg-slate-950 p-1" placeholder="+/-" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
