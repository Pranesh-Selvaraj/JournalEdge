import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { createWorker } from "tesseract.js";
import { trpc } from "../../lib/trpc";
import { extractTradeFields, guessDirectionFromColors, guessDirectionFromText, loadImage } from "./ocr";

/**
 * Screenshot Mode:
 * - drag-drop file OR paste image from clipboard (Ctrl+V anywhere in the dropzone)
 * - Tesseract.js (browser, no API key) extracts Entry / SL / TP / Symbol
 * - pixel color heuristic guesses long (green) vs short (red)
 * - editable form → saves via trades.create
 */
export function ScreenshotImporter({ onImported }: { onImported?: () => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({ symbol: "", direction: "long" as "long" | "short", entryPrice: "", stopLoss: "", takeProfit: "" });

  const createMut = trpc.trades.create.useMutation();

  const runOcr = useCallback(async (file: File) => {
    setBusy(true);
    setStatus("Loading image…");
    try {
      setPreview(URL.createObjectURL(file));
      const img = await loadImage(file);
      const dirGuess = await guessDirectionFromColors(img);

      setStatus("Running OCR (Tesseract.js, English)…");
      const worker = await createWorker("eng");
      const { data } = await worker.recognize(file);
      await worker.terminate();

      const text = data.text ?? "";
      setRawText(text);
      const fields = extractTradeFields(text);
      const textDirection = guessDirectionFromText(text);
      setForm((current) => ({
        symbol: fields.symbol ?? "",
        direction: textDirection ?? dirGuess ?? current.direction,
        entryPrice: fields.entryPrice != null ? String(fields.entryPrice) : "",
        stopLoss: fields.stopLoss != null ? String(fields.stopLoss) : "",
        takeProfit: fields.takeProfit != null ? String(fields.takeProfit) : "",
      }));
      setStatus(
        `OCR done (confidence ${Math.round(data.confidence ?? 0)}%). Direction: ${textDirection ?? dirGuess ?? "unknown"} — verify before saving.`,
      );
    } catch (e) {
      setStatus(`OCR failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const onDrop = useCallback(
    (files: File[]) => {
      if (files[0]) void runOcr(files[0]);
    },
    [runOcr],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple: false,
  });

  // Ctrl+V paste support
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (file) void runOcr(file);
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [runOcr]);

  async function handleSave() {
    await createMut.mutateAsync({
      symbol: form.symbol.toUpperCase(),
      direction: form.direction,
      entryPrice: Number(form.entryPrice),
      stopLoss: form.stopLoss ? Number(form.stopLoss) : undefined,
      takeProfit: form.takeProfit ? Number(form.takeProfit) : undefined,
    } as never);
    onImported?.();
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-lg font-semibold">Screenshot Mode</h2>
      <p className="mt-1 text-xs text-slate-400">Drag-drop a chart screenshot or paste it with Ctrl+V. OCR runs locally in your browser.</p>

      <div
        {...getRootProps()}
        className={`mt-3 cursor-pointer rounded-lg border-2 border-dashed p-6 text-center text-sm ${
          isDragActive ? "border-emerald-400 bg-slate-800" : "border-slate-700 bg-slate-950"
        }`}
      >
        <input {...getInputProps()} />
        {preview ? (
          <img src={preview} alt="trade screenshot preview" className="mx-auto max-h-48 rounded" />
        ) : (
          <p className="text-slate-400">Drop image here, click to browse, or press Ctrl+V</p>
        )}
      </div>

      {status && <p className="mt-2 text-xs text-slate-300">{busy ? "Working… " : ""}{status}</p>}

      {rawText && (
        <details className="mt-2 text-xs text-slate-400">
          <summary className="cursor-pointer">Raw OCR text</summary>
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-2">{rawText}</pre>
        </details>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <label className="flex flex-col gap-1">Symbol
          <input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} className="rounded bg-slate-950 p-2" placeholder="BTCUSD" />
        </label>
        <label className="flex flex-col gap-1">Direction
          <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as "long" | "short" })} className="rounded bg-slate-950 p-2">
            <option value="long">long (green)</option>
            <option value="short">short (red)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">Entry
          <input value={form.entryPrice} onChange={(e) => setForm({ ...form, entryPrice: e.target.value })} className="rounded bg-slate-950 p-2" placeholder="67000" />
        </label>
        <label className="flex flex-col gap-1">Stop Loss (SL)
          <input value={form.stopLoss} onChange={(e) => setForm({ ...form, stopLoss: e.target.value })} className="rounded bg-slate-950 p-2" placeholder="66500" />
        </label>
        <label className="col-span-2 flex flex-col gap-1">Take Profit (TP)
          <input value={form.takeProfit} onChange={(e) => setForm({ ...form, takeProfit: e.target.value })} className="rounded bg-slate-950 p-2" placeholder="70000" />
        </label>
      </div>

      <button
        onClick={handleSave}
        disabled={busy || !form.symbol || !form.entryPrice || createMut.isLoading}
        className="mt-3 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
      >
        {createMut.isLoading ? "Saving…" : "Save trade"}
      </button>
      {createMut.isSuccess && <p className="mt-2 text-xs text-emerald-300">Saved.</p>}
      {createMut.isError && <p className="mt-2 text-xs text-red-400">Save failed: {String(createMut.error)}</p>}
    </section>
  );
}
