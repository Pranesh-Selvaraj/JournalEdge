import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { trpc } from "../../lib/trpc";

interface EditableRow {
  symbol: string;
  direction: "long" | "short";
  entryPrice: string;
  exitPrice: string;
  stopLoss: string;
  takeProfit: string;
  profit: string;
  entryTime: string;
  exitTime: string;
  strategy: string;
  notes: string;
}

interface Preview {
  fileName: string;
  platform: string;
  platformLabel: string;
  confidence: number;
  reasons: string[];
  rows: Array<Record<string, unknown>>;
  errors: Array<{ row: number; message: string }>;
  detectedColumns: Record<string, string>;
  skipped: number;
}

function apiBase(): string {
  const trpcUrl = (import.meta.env.VITE_TRPC_URL as string | undefined) ?? "/trpc";
  return trpcUrl.replace(/\/trpc\/?$/, "");
}

const str = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  return String(v);
};

function toEditable(r: Record<string, unknown>): EditableRow {
  return {
    symbol: str(r.symbol),
    direction: r.direction === "short" ? "short" : "long",
    entryPrice: str(r.entryPrice),
    exitPrice: str(r.exitPrice),
    stopLoss: str(r.stopLoss),
    takeProfit: str(r.takeProfit),
    profit: str(r.profit),
    entryTime: r.entryTime ? new Date(str(r.entryTime)).toISOString().slice(0, 16) : "",
    exitTime: r.exitTime ? new Date(str(r.exitTime)).toISOString().slice(0, 16) : "",
    strategy: str(r.strategy),
    notes: str(r.notes),
  };
}

const numOrUndef = (s: string): number | undefined => {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * History import: drop a broker export file (CSV/TSV/TXT, Excel, MT4/MT5
 * HTML report) from cTrader, MT4, MT5 or any other platform. The backend
 * auto-detects the platform, maps columns, and returns an editable preview.
 */
export function HistoryImporter({ onImported }: { onImported?: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState("");

  const importMut = trpc.trades.importRows.useMutation();

  const runFile = useCallback(async (file: File) => {
    setBusy(true);
    setStatus("");
    setPreview(null);
    setRows([]);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${apiBase()}/api/import/preview`, { method: "POST", body: form });
      if (!res.ok) throw new Error(`Server rejected the file (HTTP ${res.status})`);
      const data = (await res.json()) as Preview;
      setPreview(data);
      setRows(data.rows.map((r) => toEditable(r)));
      if (data.rows.length === 0) setStatus("No trade rows found in this file — check the format hints below.");
    } catch (e) {
      setStatus(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const onDrop = useCallback((files: File[]) => {
    if (files[0]) void runFile(files[0]);
  }, [runFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      "text/csv": [".csv"],
      "text/tab-separated-values": [".tsv"],
      "text/plain": [".txt"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx", ".xlsm"],
      "application/vnd.oasis.opendocument.spreadsheet": [".ods"],
      "text/html": [".html", ".htm"],
    },
  });

  function updateRow(i: number, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleImport() {
    setBusy(true);
    setProgress("");
    try {
      const payload = rows.map((r) => ({
        symbol: r.symbol.toUpperCase().trim(),
        direction: r.direction,
        entryPrice: Number(r.entryPrice),
        exitPrice: numOrUndef(r.exitPrice),
        stopLoss: numOrUndef(r.stopLoss),
        takeProfit: numOrUndef(r.takeProfit),
        profit: numOrUndef(r.profit),
        entryTime: r.entryTime ? new Date(r.entryTime) : undefined,
        exitTime: r.exitTime ? new Date(r.exitTime) : undefined,
        strategy: r.strategy.trim() || undefined,
        notes: r.notes.trim() || undefined,
      }));
      const valid = payload.filter((p) => p.symbol && Number.isFinite(p.entryPrice));
      const skippedInvalid = payload.length - valid.length;
      let done = 0;
      for (let i = 0; i < valid.length; i += 500) {
        const chunk = valid.slice(i, i + 500);
        await importMut.mutateAsync({ rows: chunk as never });
        done += chunk.length;
        setProgress(`Imported ${done} / ${valid.length}…`);
      }
      setProgress(`Done — imported ${done} trade(s)${skippedInvalid ? `, skipped ${skippedInvalid} incomplete row(s)` : ""}.`);
      setPreview(null);
      setRows([]);
      onImported?.();
    } catch (e) {
      setProgress(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const cell = "w-full rounded bg-slate-950 p-1 text-xs";

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-lg font-semibold">History Import <span className="ml-1 rounded bg-emerald-900 px-2 py-0.5 text-xs font-medium text-emerald-200">MT4 · MT5 · cTrader · CSV · Excel</span></h2>
      <p className="mt-1 text-xs text-slate-400">
        Drop an old history export — the platform and columns are detected automatically.
        Nothing is saved until you review the preview and press Import.
      </p>

      <div
        {...getRootProps()}
        className={`mt-3 cursor-pointer rounded-lg border-2 border-dashed p-6 text-center text-sm ${
          isDragActive ? "border-emerald-400 bg-slate-800" : "border-slate-700 bg-slate-950"
        }`}
      >
        <input {...getInputProps()} />
        <p className="text-slate-300">{busy ? "Working…" : "Drop history file here or click to browse"}</p>
        <p className="mt-1 text-xs text-slate-500">.csv · .tsv · .txt · .xls · .xlsx · .ods · .html (MT4/MT5 statements) — max 15 MB</p>
      </div>

      {status && <p className="mt-2 text-xs text-amber-300">{status}</p>}

      {preview && (
        <div className="mt-3 rounded-lg bg-slate-950 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-800 px-2 py-1 text-xs font-semibold text-emerald-300">
              {preview.platformLabel}
            </span>
            <span className="text-xs text-slate-400" title={preview.reasons.join("\n")}>
              confidence {preview.confidence}% · {preview.rows.length} row(s)
              {preview.skipped ? ` · ${preview.skipped} non-trade row(s) skipped` : ""}
              {preview.errors.length ? ` · ${preview.errors.length} need(s) attention` : ""}
            </span>
            <span className="text-xs text-slate-500">{preview.fileName}</span>
          </div>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-400">
            {preview.reasons.slice(0, 5).map((r, i) => <li key={i}>{r}</li>)}
          </ul>
          {Object.keys(preview.detectedColumns).length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Columns: {Object.entries(preview.detectedColumns).slice(0, 12).map(([k, v]) => `${k}→${v}`).join(", ")}
              {Object.keys(preview.detectedColumns).length > 12 ? "…" : ""}
            </p>
          )}
          {preview.errors.length > 0 && (
            <ul className="mt-2 max-h-28 space-y-1 overflow-auto text-xs text-amber-300">
              {preview.errors.slice(0, 30).map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}
              {preview.errors.length > 30 && <li>…and {preview.errors.length - 30} more (fix in the grid below).</li>}
            </ul>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-slate-800">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-800">
                <tr className="text-left text-slate-300">
                  <th className="p-1">Symbol</th>
                  <th className="p-1">Dir</th>
                  <th className="p-1">Entry</th>
                  <th className="p-1">Exit</th>
                  <th className="p-1">SL</th>
                  <th className="p-1">TP</th>
                  <th className="p-1">P&amp;L</th>
                  <th className="p-1">Entry time</th>
                  <th className="p-1">Exit time</th>
                  <th className="p-1">Strategy</th>
                  <th className="p-1" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-slate-800 align-top">
                    <td className="p-1"><input value={r.symbol} onChange={(e) => updateRow(i, { symbol: e.target.value })} className={`${cell} w-20`} /></td>
                    <td className="p-1">
                      <select value={r.direction} onChange={(e) => updateRow(i, { direction: e.target.value as "long" | "short" })} className={cell}>
                        <option value="long">long</option>
                        <option value="short">short</option>
                      </select>
                    </td>
                    <td className="p-1"><input value={r.entryPrice} onChange={(e) => updateRow(i, { entryPrice: e.target.value })} className={`${cell} w-20`} /></td>
                    <td className="p-1"><input value={r.exitPrice} onChange={(e) => updateRow(i, { exitPrice: e.target.value })} className={`${cell} w-20`} /></td>
                    <td className="p-1"><input value={r.stopLoss} onChange={(e) => updateRow(i, { stopLoss: e.target.value })} className={`${cell} w-20`} /></td>
                    <td className="p-1"><input value={r.takeProfit} onChange={(e) => updateRow(i, { takeProfit: e.target.value })} className={`${cell} w-20`} /></td>
                    <td className="p-1"><input value={r.profit} onChange={(e) => updateRow(i, { profit: e.target.value })} className={`${cell} w-20`} placeholder="+/-" /></td>
                    <td className="p-1"><input type="datetime-local" value={r.entryTime} onChange={(e) => updateRow(i, { entryTime: e.target.value })} className={`${cell} w-36`} /></td>
                    <td className="p-1"><input type="datetime-local" value={r.exitTime} onChange={(e) => updateRow(i, { exitTime: e.target.value })} className={`${cell} w-36`} /></td>
                    <td className="p-1"><input value={r.strategy} onChange={(e) => updateRow(i, { strategy: e.target.value })} className={`${cell} w-24`} placeholder="strategy" /></td>
                    <td className="p-1"><button onClick={() => removeRow(i)} className="rounded bg-slate-800 px-2 py-1 hover:bg-red-900" title="Remove row">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={handleImport}
              disabled={busy || rows.length === 0}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
            >
              {busy ? "Importing…" : `Import ${rows.length} trade(s)`}
            </button>
            {progress && <p className="text-xs text-slate-300">{progress}</p>}
          </div>
        </>
      )}

      <details className="mt-3 text-xs text-slate-500">
        <summary className="cursor-pointer hover:text-slate-300">Where do I get these files?</summary>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li><b>MT4:</b> Terminal → Account History → right-click → Save as Report (.html), or drag-select rows and copy, or export CSV from a script.</li>
          <li><b>MT5:</b> Toolbox → History → right-click → Report (.html), or Export to CSV. Deal ledgers (In/Out) are auto-reconstructed into positions.</li>
          <li><b>cTrader:</b> History tab → export icon → CSV.</li>
          <li><b>TradingView / generic:</b> any CSV/TSV with Symbol, direction, prices — headers are auto-mapped; Buy/Sell and Long/Short both work.</li>
          <li><b>Excel:</b> first sheet is used; title rows above the header are skipped automatically.</li>
        </ul>
      </details>
    </section>
  );
}
