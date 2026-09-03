import { createTradeSchema, type ParsedTradeRow } from "@journaledge/shared-types";
import * as XLSX from "xlsx";

/**
 * Smart history parser.
 *
 * Handles copy-pasted text AND uploaded files (CSV/TSV/TXT, Excel, MT4/MT5
 * HTML reports) from MetaTrader 4, MetaTrader 5, cTrader, TradingView, or any
 * generic tabular export.
 *
 * Pipeline:
 *   1. Extract a { headers, rows } table from the input (text / workbook / HTML).
 *   2. Detect the platform by scoring header signatures (mt4 / mt5 / mt5-deals / ctrader / generic).
 *   3. Build a platform-aware column map (handles MT4's duplicate Price/Time
 *      columns, MT5 deal Direction In/Out, Buy/Sell vs Long/Short, etc.).
 *   4. Coerce values (numbers with currency/thousands separators, many date
 *      formats, directions) and validate — invalid rows are kept with errors
 *      so the frontend can show an editable preview before saving.
 */

export type PlatformId = "mt4" | "mt5" | "mt5-deals" | "ctrader" | "generic";

export const PLATFORM_LABELS: Record<PlatformId, string> = {
  mt4: "MetaTrader 4",
  mt5: "MetaTrader 5",
  "mt5-deals": "MetaTrader 5 (deals — reconstructed)",
  ctrader: "cTrader",
  generic: "Generic / unknown",
};

export interface PlatformDetection {
  platform: PlatformId;
  confidence: number; // 0-100
  reasons: string[];
}

export interface ParseResult {
  rows: ParsedTradeRow[];
  errors: Array<{ row: number; message: string }>;
  detectedColumns: Record<string, string>;
  platform?: PlatformId;
  platformLabel?: string;
  confidence?: number;
  reasons?: string[];
  /** Non-trade rows skipped (deposits, balance ops, cancelled pendings, …). */
  skipped?: number;
}

/** ParseResult with the smart-detection fields always populated. */
export interface SmartParseResult extends ParseResult {
  platform: PlatformId;
  platformLabel: string;
  confidence: number;
  reasons: string[];
  skipped: number;
}

export interface ExtractedTable {
  headers: string[] | null;
  rows: unknown[][];
  source: string;
}

// ---------------------------------------------------------------------------
// Normalization + alias dictionaries
// ---------------------------------------------------------------------------

function normalizeKey(h: unknown): string {
  return String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Canonical trade fields plus `extra:*` passthroughs folded into notes. */
type MappedField =
  | "symbol"
  | "direction"
  | "entryPrice"
  | "exitPrice"
  | "stopLoss"
  | "takeProfit"
  | "entryTime"
  | "exitTime"
  | "profit"
  | "strategy"
  | "emotionTag"
  | "setupGrade"
  | "notes"
  | "screenshotUrl"
  | "extra:ticket"
  | "extra:volume"
  | "extra:commission"
  | "extra:swap"
  | "extra:profit"
  | null;

const GENERIC_ALIASES: Array<{ keys: string[]; field: MappedField }> = [
  { keys: ["symbol", "ticker", "pair", "instrument", "security", "item", "currency", "asset", "market"], field: "symbol" },
  { keys: ["direction", "side", "type", "position", "ordertype", "tradetype", "dealtype", "buyorsell", "longshort"], field: "direction" },
  { keys: ["entryprice", "entry", "openprice", "open", "inprice", "buyprice", "entryrate", "openrate", "rateopen", "priceopen", "executionprice"], field: "entryPrice" },
  { keys: ["exitprice", "exit", "closeprice", "close", "outprice", "sellprice", "exitrate", "closerate", "rateclose", "priceclose"], field: "exitPrice" },
  { keys: ["stoploss", "stop", "sl", "stopprice", "stoplevel"], field: "stopLoss" },
  { keys: ["takeprofit", "take", "tp", "target", "targetprice", "profitarget", "takeprofitprice"], field: "takeProfit" },
  { keys: ["entrytime", "entrydate", "entrydatetime", "opentime", "opendate", "opendatetime", "dateopen", "timeopen", "timein", "opened", "openedat", "filltime"], field: "entryTime" },
  { keys: ["exittime", "exitdate", "exitdatetime", "closetime", "closedate", "closedatetime", "dateclose", "timeclose", "timeout", "closed", "closedat"], field: "exitTime" },
  { keys: ["strategy", "system", "playbook", "setupname", "approach"], field: "strategy" },
  { keys: ["emotion", "emotiontag", "feeling", "mood", "psychology", "mindset"], field: "emotionTag" },
  { keys: ["setupgrade", "setup", "grade", "rating", "score"], field: "setupGrade" },
  { keys: ["notes", "note", "comment", "comments", "remarks", "memo", "description"], field: "notes" },
  { keys: ["screenshoturl", "screenshot", "image", "imageurl"], field: "screenshotUrl" },
  { keys: ["ticket", "order", "orderid", "orderticket", "deal", "dealticket", "position", "positionid", "positionticket", "tradeid", "id", "ref", "reference"], field: "extra:ticket" },
  { keys: ["volume", "size", "lots", "lot", "qty", "quantity", "amount", "contracts", "units"], field: "extra:volume" },
  { keys: ["commission", "comm", "fees", "fee", "cost"], field: "extra:commission" },
  { keys: ["swap", "swaps", "overnight", "rollovercharge"], field: "extra:swap" },
  { keys: ["profit", "pl", "pnl", "net", "netpl", "netprofit", "gross", "grosspl", "grossprofit", "profitloss", "result", "gainloss", "profitability"], field: "profit" },
];

/** Platform-specific overrides applied BEFORE the generic table. */
const PLATFORM_ALIASES: Record<Exclude<PlatformId, "generic">, Array<{ keys: string[]; field: MappedField }>> = {
  mt4: [
    { keys: ["ticket"], field: "extra:ticket" },
    { keys: ["opentime"], field: "entryTime" },
    { keys: ["type"], field: "direction" },
    { keys: ["size"], field: "extra:volume" },
    { keys: ["item"], field: "symbol" },
    { keys: ["sl"], field: "stopLoss" },
    { keys: ["tp"], field: "takeProfit" },
    { keys: ["closetime"], field: "exitTime" },
    { keys: ["commission", "taxes", "swap", "profit"], field: "extra:commission" }, // refined below
  ],
  mt5: [
    { keys: ["ticket", "position", "order"], field: "extra:ticket" },
    { keys: ["type"], field: "direction" },
    { keys: ["volume"], field: "extra:volume" },
  ],
  "mt5-deals": [
    { keys: ["deal"], field: "extra:ticket" },
    { keys: ["symbol"], field: "symbol" },
    { keys: ["type"], field: "direction" },
    { keys: ["direction"], field: null }, // In/Out marker — handled by deal matching, not a trade field
    { keys: ["volume"], field: "extra:volume" },
    { keys: ["price"], field: "entryPrice" }, // deal price; matcher reassigns entry/exit
    { keys: ["time"], field: "entryTime" },
    { keys: ["order"], field: "extra:ticket" },
    { keys: ["commission"], field: "extra:commission" },
    { keys: ["swap"], field: "extra:swap" },
    { keys: ["profit"], field: "extra:profit" },
  ],
  ctrader: [
    { keys: ["positionid", "position"], field: "extra:ticket" },
    { keys: ["entrytime"], field: "entryTime" },
    { keys: ["entryprice"], field: "entryPrice" },
    { keys: ["exittime"], field: "exitTime" },
    { keys: ["exitprice"], field: "exitPrice" },
    { keys: ["symbol", "symbolname"], field: "symbol" },
    { keys: ["direction", "tradetype"], field: "direction" },
    { keys: ["volume", "quantity"], field: "extra:volume" },
    { keys: ["commission"], field: "extra:commission" },
    { keys: ["swap"], field: "extra:swap" },
    { keys: ["gross", "grossprofit", "net", "netprofit", "pnl", "profit"], field: "profit" },
  ],
};

/** Refine MT4's grouped extras (commission/taxes/swap got one bucket above). Profit maps to the P&L field. */
const MT4_EXTRA_FIX: Record<string, MappedField> = {
  commission: "extra:commission",
  taxes: "extra:commission",
  swap: "extra:swap",
  profit: "profit",
};

function mapWithTable(norm: string, table: Array<{ keys: string[]; field: MappedField }>): MappedField | undefined {
  for (const { keys, field } of table) {
    if (keys.includes(norm)) return field;
  }
  // fuzzy contains-match (only for keys with 3+ chars to avoid noise)
  for (const { keys, field } of table) {
    if (keys.some((k) => k.length >= 3 && (norm.includes(k) || k.includes(norm)))) return field;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

const SIGNATURES: Array<{ platform: PlatformId; keys: string[]; weight: number; label: string }> = [
  { platform: "mt5-deals", keys: ["deal", "direction"], weight: 3, label: "Deal + Direction columns (MT5 deal ledger)" },
  { platform: "ctrader", keys: ["positionid", "entrytime", "exitprice"], weight: 3, label: "Position ID + Entry/Exit columns (cTrader)" },
  { platform: "ctrader", keys: ["entryprice", "exitprice", "netprofit"], weight: 2, label: "Entry/Exit price + net profit columns (cTrader)" },
  { platform: "mt4", keys: ["ticket", "opentime", "closetime"], weight: 3, label: "Ticket + Open/Close time columns (MetaTrader)" },
  { platform: "mt4", keys: ["ticket", "type", "size", "item"], weight: 3, label: "Ticket/Type/Size/Item columns (MT4 history)" },
  { platform: "mt5", keys: ["ticket", "type", "volume", "swap", "profit"], weight: 2, label: "Ticket + Volume + Swap/Profit columns (MetaTrader)" },
];

export function detectPlatform(headers: string[]): PlatformDetection {
  const norms = new Set(headers.map(normalizeKey));
  const reasons: string[] = [];
  let best: { platform: PlatformId; score: number } = { platform: "generic", score: 0 };

  for (const sig of SIGNATURES) {
    const hits = sig.keys.filter((k) => norms.has(k)).length;
    if (hits === sig.keys.length) {
      const score = sig.weight * hits;
      if (score > best.score) {
        best = { platform: sig.platform, score };
        reasons.unshift(sig.label);
      } else if (score === best.score && score > 0) {
        reasons.push(sig.label);
      }
    }
  }

  if (best.platform === "generic") {
    // Secondary heuristics for MT4 vs MT5 position-style statements.
    if (norms.has("ticket") && (norms.has("commission") || norms.has("taxes"))) {
      best = { platform: "mt4", score: 2 };
      reasons.unshift("Ticket + Commission/Taxes columns (MT4 statement style)");
    } else if (norms.has("order") && norms.has("deal")) {
      best = { platform: "mt5-deals", score: 2 };
      reasons.unshift("Order + Deal columns (MT5 style)");
    }
    if (best.platform === "generic") {
      reasons.push("No platform signature matched — using generic column mapping");
    }
  }

  const confidence =
    best.platform === "generic" ? 35 : Math.min(95, 55 + best.score * 8 + (headers.length >= 6 ? 5 : 0));

  return { platform: best.platform, confidence, reasons };
}

// ---------------------------------------------------------------------------
// Text / workbook / HTML extraction
// ---------------------------------------------------------------------------

const HEADER_HINTS = [
  "symbol", "ticker", "pair", "instrument", "item",
  "side", "direction", "long", "short", "type", "deal",
  "entry", "open", "in", "ticket", "position",
  "exit", "close", "out",
  "stop", "sl",
  "take", "tp", "target",
  "time", "date", "entrytime", "exittime",
  "strategy", "setup", "grade", "emotion", "note",
  "qty", "quantity", "size", "volume", "price", "profit", "commission", "swap",
];

export function detectDelimiter(line: string): string {
  const tabs = (line.match(/\t/g) ?? []).length;
  if (tabs > 0) return "\t";
  const commas = (line.match(/,/g) ?? []).length;
  const semis = (line.match(/;/g) ?? []).length;
  const pipes = (line.match(/\|/g) ?? []).length;
  if (commas >= semis && commas >= pipes && commas > 0) return ",";
  if (semis >= pipes && semis > 0) return ";";
  if (pipes > 0) return "|";
  return "\t";
}

export function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === ",") {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  }
  return line.split(delimiter).map((s) => s.trim());
}

function cellText(c: unknown): string {
  if (c == null) return "";
  if (c instanceof Date) return c.toISOString();
  return String(c);
}

function looksLikeHeader(cells: unknown[]): boolean {
  let hits = 0;
  let alpha = 0;
  for (const raw of cells) {
    const c = cellText(raw);
    const n = normalizeKey(c);
    if (!n) continue;
    if (/[a-zA-Z]/.test(c)) alpha++;
    if (HEADER_HINTS.some((h) => n.includes(h))) hits++;
    if (mapWithTable(n, GENERIC_ALIASES) !== undefined) hits++;
  }
  if (cells.length === 0) return false;
  return hits >= Math.max(2, cells.length * 0.5) && alpha >= cells.length * 0.5;
}

function splitTextTable(text: string): ExtractedTable {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { headers: null, rows: [], source: "empty text" };

  const delimiter = detectDelimiter(lines[0]);
  const firstCells = splitLine(lines[0], delimiter);
  const hasHeader = looksLikeHeader(firstCells);
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const rows: unknown[][] = dataLines.map((line) => {
    const lineDelim = detectDelimiter(line);
    let cells = splitLine(line, lineDelim);
    const want = firstCells.length;
    if (cells.length !== want && lineDelim !== delimiter) {
      const alt = splitLine(line, delimiter);
      if (Math.abs(alt.length - want) < Math.abs(cells.length - want)) cells = alt;
    }
    return cells;
  });

  return { headers: hasHeader ? firstCells : null, rows, source: `delimited text (${delimiter === "\t" ? "tab" : delimiter}-separated)` };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Minimal HTML table extractor (no extra deps) — enough for MT4/MT5 reports. */
function extractHtmlTables(html: string): unknown[][][] {
  const tables: unknown[][][] = [];
  const tableRe = /<table[\s>][\s\S]*?<\/table\s*>/gi;
  const rowRe = /<tr[\s>][\s\S]*?<\/tr\s*>/gi;
  const cellRe = /<(td|th)[\s>][\s\S]*?<\/(td|th)\s*>/gi;
  let tm: RegExpExecArray | null;
  while ((tm = tableRe.exec(html)) !== null) {
    const rows: unknown[][] = [];
    let rm: RegExpExecArray | null;
    rowRe.lastIndex = 0;
    while ((rm = rowRe.exec(tm[0])) !== null) {
      const cells: unknown[] = [];
      let cm: RegExpExecArray | null;
      cellRe.lastIndex = 0;
      while ((cm = cellRe.exec(rm[0])) !== null) {
        const inner = cm[0].replace(/^<[^>]+>/, "").replace(/<\/[^>]+>\s*$/, "");
        const text = decodeEntities(inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
        cells.push(text);
      }
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length > 0) tables.push(rows);
  }
  return tables;
}

function recognizedHeaderCount(cells: unknown[]): number {
  return cells.filter((c) => mapWithTable(normalizeKey(cellText(c)), GENERIC_ALIASES) !== undefined).length;
}

function parseHtmlTable(html: string): ExtractedTable | null {
  const tables = extractHtmlTables(html);
  let best: { headers: string[]; rows: unknown[][]; score: number } | null = null;
  for (const t of tables) {
    if (t.length < 2) continue;
    for (let h = 0; h < Math.min(3, t.length - 1); h++) {
      const headerCells = t[h].map(cellText);
      const recognized = recognizedHeaderCount(t[h]);
      if (recognized < 3) continue;
      const dataRows = t.slice(h + 1).filter((r) => r.some((c) => cellText(c) !== ""));
      const score = recognized * 10 + Math.min(dataRows.length, 5000);
      if (!best || score > best.score) best = { headers: headerCells, rows: dataRows, score };
    }
  }
  if (!best) return null;
  return { headers: best.headers, rows: best.rows, source: "HTML report table" };
}

function parseWorkbookTable(buffer: Buffer): ExtractedTable {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { headers: null, rows: [], source: "workbook (no sheets)" };
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" }) as unknown[][];
  const nonEmpty = aoa.filter((r) => Array.isArray(r) && r.some((c) => cellText(c) !== ""));
  if (nonEmpty.length === 0) return { headers: null, rows: [], source: `workbook sheet "${sheetName}" (empty)` };
  const width = Math.max(...nonEmpty.map((r) => r.length));
  const norm = nonEmpty.map((r) => {
    const copy = [...r];
    while (copy.length < width) copy.push("");
    return copy;
  });
  // Header may not be row 0 (exports often have title rows) — scan first 5 rows.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(5, norm.length); i++) {
    if (looksLikeHeader(norm[i])) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return { headers: null, rows: norm, source: `workbook sheet "${sheetName}"` };
  return {
    headers: norm[headerIdx].map(cellText),
    rows: norm.slice(headerIdx + 1),
    source: `workbook sheet "${sheetName}"`,
  };
}

// ---------------------------------------------------------------------------
// Value coercion
// ---------------------------------------------------------------------------

function coerceNumber(raw: unknown): number | null | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
  let v = String(raw).trim();
  if (v === "" || v === "-" || v === "--") return undefined;
  const lower = v.toLowerCase();
  if (["null", "n/a", "na", "none", "—", "–"].includes(lower)) return undefined;
  let negative = false;
  if (/^\(.*\)$/.test(v)) {
    negative = true;
    v = v.slice(1, -1);
  }
  v = v.replace(/[$€£¥₹\s'\u00a0]/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(v)) {
    // 1.234,56 (EU thousands) -> 1234.56
    v = v.replace(/\./g, "").replace(",", ".");
  } else if (v.includes(",") && v.includes(".")) {
    v = v.replace(/,/g, "");
  } else if (/^\d+,\d{1,4}$/.test(v)) {
    // 1234,56 (EU decimal) -> 1234.56
    v = v.replace(",", ".");
  } else {
    v = v.replace(/,/g, "");
  }
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

function coerceDate(raw: unknown): Date | null | undefined {
  if (raw == null || raw === "") return undefined;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === "number" && XLSX.SSF) {
    // Excel serial date fallback (only plausible range 1990-2050)
    if (raw > 30000 && raw < 80000) {
      const ms = Math.round((raw - 25569) * 86400 * 1000);
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return null;
  }
  let v = String(raw).trim();
  if (v === "" || v.toLowerCase() === "n/a") return undefined;
  // MT4/MT5 "2024.01.15 10:30" / "2024.01.15 10:30:00" -> ISO-ish
  v = v.replace(/^(\d{4})\.(\d{2})\.(\d{2})([ T])/, "$1-$2-$3$4");
  // "15.01.2024 10:30" (EU) -> 2024-01-15
  v = v.replace(/^(\d{2})\.(\d{2})\.(\d{4})([ T]|$)/, "$3-$2-$1$4");
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function coerceDirection(raw: unknown): "long" | "short" | null | undefined {
  if (raw == null) return undefined;
  const l = String(raw).trim().toLowerCase();
  if (l === "") return undefined;
  if (l.startsWith("long") || l.startsWith("buy") || l === "b" || l === "l" || l === "bid") return "long";
  if (l.startsWith("short") || l.startsWith("sell") || l === "s" || l === "ask") return "short";
  return null;
}

function coerceCell(field: MappedField, raw: unknown): unknown {
  switch (field) {
    case "symbol":
      return cellText(raw).trim().toUpperCase().replace(/\s+/g, "");
    case "direction":
      return coerceDirection(raw);
    case "entryPrice":
    case "exitPrice":
    case "stopLoss":
    case "takeProfit":
      return coerceNumber(raw);
    case "entryTime":
    case "exitTime":
      return coerceDate(raw);
    case "profit":
      return coerceNumber(raw);
    case "setupGrade":
      return cellText(raw).trim().toUpperCase().replace(/\s+/g, "");
    case "strategy":
    case "emotionTag":
    case "notes":
    case "screenshotUrl":
      return cellText(raw).trim();
    default:
      return cellText(raw).trim();
  }
}

// ---------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------

const POSITIONAL_FIELDS = [
  "symbol", "direction", "entryPrice", "exitPrice", "stopLoss", "takeProfit",
  "entryTime", "exitTime", "strategy", "emotionTag", "setupGrade", "notes",
] as const;

/** Rows whose Type column marks them as non-trades (funding ops, cancelled pendings). */
const NON_TRADE_TYPE_RE = /balance|credit|deposit|withdraw|adjust|dividend|fee|correction|transfer|bonus|cancel|delet|expir|reject/i;

function buildFieldMap(platform: PlatformId, headers: string[] | null, sampleWidth: number): {
  fields: MappedField[];
  detectedColumns: Record<string, string>;
  notes: string[];
} {
  const detectedColumns: Record<string, string> = {};
  const notes: string[] = [];

  if (!headers) {
    const fields: MappedField[] = Array.from({ length: sampleWidth }, (_, i) => {
      const f = (POSITIONAL_FIELDS[i] ?? null) as MappedField;
      if (f) detectedColumns[`col${i + 1}`] = f;
      return f;
    });
    notes.push("No header row detected — using positional mapping (Symbol, Direction, Entry, Exit, SL, TP, …)");
    return { fields, detectedColumns, notes };
  }

  const override = platform === "generic" ? null : PLATFORM_ALIASES[platform];
  const provisional: MappedField[] = headers.map((h) => {
    const n = normalizeKey(h);
    if (!n) return null;
    if (override) {
      const hit = mapWithTable(n, override);
      if (hit !== undefined) {
        // MT4 groups commission/taxes/swap/profit under one alias entry — refine per column.
        const f = platform === "mt4" && MT4_EXTRA_FIX[n] ? MT4_EXTRA_FIX[n] : hit;
        if (f) detectedColumns[h] = f;
        return f;
      }
    }
    const generic = mapWithTable(n, GENERIC_ALIASES);
    if (generic !== undefined) {
      let f = generic;
      if (platform === "mt4" && f === "extra:commission" && MT4_EXTRA_FIX[n]) f = MT4_EXTRA_FIX[n];
      if (f) detectedColumns[h] = f;
      return f;
    }
    return null;
  });

  // Disambiguate duplicate bare "Price"/"Time" columns (classic MT4 layout:
  // Price(open) … Close Time, Price(close)). First occurrence -> entry, second -> exit.
  const fields = [...provisional];
  const ambPriceIdx: number[] = [];
  const ambTimeIdx: number[] = [];
  headers.forEach((h, i) => {
    const n = normalizeKey(h);
    if (n === "price" && fields[i] !== null) ambPriceIdx.push(i);
    if ((n === "time" || n === "date" || n === "datetime") && fields[i] !== null) ambTimeIdx.push(i);
  });
  const disambiguate = (idx: number[], entryF: MappedField, exitF: MappedField, label: string) => {
    if (idx.length >= 2) {
      fields[idx[0]] = entryF;
      fields[idx[1]] = exitF;
      // Suffixed keys so duplicate header names (e.g. MT4's two "Price" cols) don't collide.
      const keyFor = (i: number) => (headers[idx[0]] === headers[idx[1]] ? `${headers[i]} (col ${i + 1})` : headers[i]);
      detectedColumns[keyFor(idx[0])] = `${entryF} (first ${label} column)`;
      detectedColumns[keyFor(idx[1])] = `${exitF} (second ${label} column)`;
      notes.push(`Two "${label}" columns found — mapped first to entry, second to exit`);
    } else if (idx.length === 1 && platform !== "generic") {
      // Single bare Price in a platform export is the open/entry price.
      fields[idx[0]] = label === "Price" ? "entryPrice" : "entryTime";
    }
  };
  disambiguate(ambPriceIdx, "entryPrice", "exitPrice", "Price");
  disambiguate(ambTimeIdx, "entryTime", "exitTime", "Time");

  return { fields, detectedColumns, notes };
}

// ---------------------------------------------------------------------------
// MT5 deal reconstruction (In/Out ledger -> closed positions, FIFO)
// ---------------------------------------------------------------------------

interface DealRow {
  symbol: string;
  side: "long" | "short"; // deal side (Buy -> long, Sell -> short)
  flow: "in" | "out" | "inout";
  volume: number;
  price: number;
  time?: Date;
  ticket?: string;
  commission?: number;
  swap?: number;
  profit?: number;
}

function normalizeFlow(raw: unknown): "in" | "out" | "inout" | null {
  const l = cellText(raw).trim().toLowerCase().replace(/[^a-z/]/g, "");
  if (l === "in" || l === "buy" || l === "entry") return "in";
  if (l === "out" || l === "sell" || l === "exit" || l === "close") return "out";
  if (l === "in/out" || l === "inout" || l === "reversal") return "inout";
  return null;
}

function matchMt5Deals(headers: string[], dataRows: unknown[][]): {
  positions: Array<Record<string, unknown>>;
  errors: Array<{ row: number; message: string }>;
} {
  const normHeaders = headers.map(normalizeKey);
  const findCol = (...names: string[]) => normHeaders.findIndex((h) => names.includes(h));
  const iSymbol = findCol("symbol", "security", "ticker", "pair");
  const iType = findCol("type", "dealtype", "tradetype");
  const iFlow = findCol("direction", "flow", "entryexit", "inex");
  const iVol = findCol("volume", "size", "lots", "qty", "quantity");
  const iPrice = findCol("price", "dealprice", "rate");
  const iTime = findCol("time", "datetime", "date", "opentime", "closetime");
  const iTicket = findCol("deal", "ticket", "position", "order");
  const iComm = findCol("commission", "fees");
  const iSwap = findCol("swap");
  const iProfit = findCol("profit", "pl", "pnl");

  const positions: Array<Record<string, unknown>> = [];
  const errors: Array<{ row: number; message: string }> = [];
  // Open legs FIFO per symbol.
  const open = new Map<string, Array<{ side: "long" | "short"; volume: number; price: number; time?: Date; ticket?: string; commission: number; swap: number }>>();

  const closeLegs = (
    symbol: string,
    outSide: "long" | "short",
    volume: number,
    price: number,
    time: Date | undefined,
    ticket: string | undefined,
    commission: number,
    swap: number,
    profit: number | undefined,
    rowNumber: number,
  ) => {
    const legs = open.get(symbol) ?? [];
    // Position side is the side of the entry legs (opposite of the closing deal).
    const entrySide = outSide === "long" ? "short" : "long";
    let remaining = volume;
    let entryVol = 0;
    let entryNotional = 0;
    let entryTime: Date | undefined;
    let entryTicket = "";
    let accComm = commission;
    let accSwap = swap;
    const leftovers: typeof legs = [];
    for (const leg of legs) {
      if (remaining <= 0 || leg.side !== entrySide) {
        leftovers.push(leg);
        continue;
      }
      const take = Math.min(remaining, leg.volume);
      entryVol += take;
      entryNotional += take * leg.price;
      entryTime = entryTime ?? leg.time;
      entryTicket = entryTicket || leg.ticket || "";
      accComm += (leg.commission * take) / leg.volume;
      accSwap += (leg.swap * take) / leg.volume;
      remaining -= take;
      if (leg.volume > take) leftovers.push({ ...leg, volume: leg.volume - take });
    }
    open.set(symbol, leftovers);
    if (entryVol <= 0) {
      errors.push({
        row: rowNumber,
        message: `Could not match an entry (In) deal for this exit — export a wider date range or fix manually.`,
      });
      return;
    }
    positions.push({
      symbol,
      direction: entrySide,
      entryPrice: entryNotional / entryVol,
      exitPrice: price,
      entryTime,
      exitTime: time,
      // The closing deal's P&L is the realized P&L of this (fully or partially) closed position.
      profit: profit ?? undefined,
      _rowNumber: rowNumber,
      _notes: [
        ticket ? `deal #${ticket}` : "",
        entryTicket ? `entry deal #${entryTicket}` : "",
        `mt5-deals FIFO · ${entryVol} matched`,
        Number.isFinite(accComm) && accComm !== 0 ? `comm ${accComm.toFixed(2)}` : "",
        Number.isFinite(accSwap) && accSwap !== 0 ? `swap ${accSwap.toFixed(2)}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    });
  };

  dataRows.forEach((cells, idx) => {
    const rowNumber = idx + 2;
    if (cells.every((c) => cellText(c) === "")) return;
    const symbol = cellText(cells[iSymbol]).trim().toUpperCase().replace(/\s+/g, "");
    const side = iType >= 0 ? coerceDirection(cells[iType]) : null;
    const flow = iFlow >= 0 ? normalizeFlow(cells[iFlow]) : null;
    const volume = iVol >= 0 ? coerceNumber(cells[iVol]) : null;
    const price = iPrice >= 0 ? coerceNumber(cells[iPrice]) : null;
    const time = iTime >= 0 ? (coerceDate(cells[iTime]) as Date | null | undefined) ?? undefined : undefined;
    if (!symbol || side == null || !side || flow == null || volume == null || !volume || price == null || !price) {
      errors.push({ row: rowNumber, message: "Deal row is missing symbol/side/direction/volume/price — skipped." });
      return;
    }
    const ticket = iTicket >= 0 ? cellText(cells[iTicket]).trim() || undefined : undefined;
    const commission = (iComm >= 0 ? coerceNumber(cells[iComm]) : 0) || 0;
    const swap = (iSwap >= 0 ? coerceNumber(cells[iSwap]) : 0) || 0;
    const profit = (iProfit >= 0 ? coerceNumber(cells[iProfit]) : undefined) ?? undefined;

    if (flow === "in") {
      const legs = open.get(symbol) ?? [];
      legs.push({ side, volume, price, time, ticket, commission: commission as number, swap: swap as number });
      open.set(symbol, legs);
    } else if (flow === "out") {
      closeLegs(symbol, side, volume as number, price as number, time, ticket, commission as number, swap as number, profit as number | undefined, rowNumber);
    } else {
      // In/Out (reversal): close what we can, open the rest.
      closeLegs(symbol, side, volume as number, price as number, time, ticket, 0, 0, profit as number | undefined, rowNumber);
      const legs = open.get(symbol) ?? [];
      legs.push({ side, volume: volume as number, price: price as number, time, ticket, commission: commission as number, swap: swap as number });
      open.set(symbol, legs);
    }
  });

  return { positions, errors };
}

// ---------------------------------------------------------------------------
// Smart table -> trades
// ---------------------------------------------------------------------------

const MAX_ROWS = 5000;

export function smartParseTable(
  headers: string[] | null,
  dataRows: unknown[][],
  opts?: { platform?: PlatformId; fileName?: string },
): SmartParseResult {
  const rows: ParsedTradeRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  const reasons: string[] = [];

  if (dataRows.length === 0) {
    return {
      rows,
      errors: [{ row: 0, message: "No data rows found." }],
      detectedColumns: {},
      platform: "generic",
      platformLabel: PLATFORM_LABELS.generic,
      confidence: 0,
      reasons: ["Nothing to parse"],
      skipped: 0,
    };
  }

  const detection = opts?.platform
    ? { platform: opts.platform, confidence: 100, reasons: [`Platform forced by file type (${opts.fileName ?? "upload"})`] }
    : headers
      ? detectPlatform(headers)
      : { platform: "generic" as PlatformId, confidence: 40, reasons: ["No header row — positional mapping"] };
  reasons.push(...detection.reasons);

  // MT5 deal ledgers need reconstruction before column mapping.
  let mapped: Array<{ obj: Record<string, unknown>; rowNumber: number; raw: string }> = [];
  if (detection.platform === "mt5-deals" && headers) {
    const { positions, errors: dealErrors } = matchMt5Deals(headers, dataRows);
    errors.push(...dealErrors);
    reasons.push(`Reconstructed ${positions.length} closed position(s) from ${dataRows.length} deal(s) (FIFO)`);
    mapped = positions.map((p) => ({
      obj: {
        symbol: p.symbol,
        direction: p.direction,
        entryPrice: p.entryPrice,
        exitPrice: p.exitPrice,
        entryTime: p.entryTime,
        exitTime: p.exitTime,
        profit: p.profit,
        notes: p._notes,
      },
      rowNumber: (p._rowNumber as number) ?? 0,
      raw: JSON.stringify(p),
    }));
  } else {
    const { fields, detectedColumns, notes } = buildFieldMap(
      detection.platform === "mt5-deals" ? "generic" : detection.platform,
      headers,
      dataRows[0]?.length ?? 0,
    );
    reasons.push(...notes);
    const detected = detectedColumns;

    let skipped = 0;
    const limited = dataRows.slice(0, MAX_ROWS);
    if (dataRows.length > MAX_ROWS) {
      reasons.push(`Capped at ${MAX_ROWS} rows (file had ${dataRows.length}) — split larger exports`);
    }

    limited.forEach((cells, idx) => {
      const rowNumber = idx + (headers ? 2 : 1);
      if (cells.every((c) => cellText(c) === "")) {
        skipped++;
        return;
      }
      const obj: Record<string, unknown> = {};
      const extras: Record<string, string> = {};
      cells.forEach((cell, i) => {
        const field = fields[i];
        if (!field) return;
        const coerced = coerceCell(field, cell);
        if (coerced === undefined || coerced === null) {
          if (field === "direction" && coerced === null) obj.__badDirection = cellText(cell);
          return;
        }
        if (field.startsWith("extra:")) {
          const v = cellText(coerced);
          if (v !== "" && v !== "0" && v !== "0.00") extras[field.slice(6)] = v;
        } else {
          obj[field] = coerced;
        }
      });

      // Skip funding/corporate-action rows and dead pending orders.
      const dirRaw = cellText((cells[fields.indexOf("direction")] ?? ""));
      if (NON_TRADE_TYPE_RE.test(dirRaw)) {
        skipped++;
        return;
      }
      if (!obj.symbol) {
        skipped++;
        return;
      }
      if (obj.__badDirection) {
        errors.push({ row: rowNumber, message: `Unrecognized direction "${obj.__badDirection}" — use Buy/Sell or Long/Short.` });
        delete obj.__badDirection;
      }

      // Fold ticket/volume/costs into notes so history context is preserved.
      // (Broker P&L now maps to the profit field directly.)
      const extraBits: string[] = [];
      if (extras.ticket) extraBits.push(`#${extras.ticket}`);
      if (extras.volume) extraBits.push(`${extras.volume} lots`);
      if (extras.commission) extraBits.push(`comm ${extras.commission}`);
      if (extras.swap) extraBits.push(`swap ${extras.swap}`);
      if (extraBits.length > 0) {
        const tag = `[imported ${detection.platform}${extraBits.length ? ": " + extraBits.join(" · ") : ""}]`;
        obj.notes = obj.notes ? `${obj.notes} ${tag}` : tag;
      }

      mapped.push({ obj, rowNumber, raw: cells.map(cellText).join(" | ") });
    });

    // Validate + finalize below (shared).
    const out = finalizeMapped(mapped, errors, rows, detection, reasons, skipped, detected);
    return out;
  }

  const out = finalizeMapped(mapped, errors, rows, detection, reasons, 0, {
    Symbol: "symbol",
    Type: "direction (deal side: Buy/Sell)",
    Direction: "deal flow (In/Out — used for FIFO reconstruction)",
    Volume: "volume (matched FIFO)",
    Price: "deal price (entry/exit)",
    Time: "deal time",
  });
  return out;
}

function finalizeMapped(
  mapped: Array<{ obj: Record<string, unknown>; rowNumber: number; raw: string }>,
  errors: Array<{ row: number; message: string }>,
  rows: ParsedTradeRow[],
  detection: PlatformDetection,
  reasons: string[],
  skipped: number,
  detectedColumns: Record<string, string>,
): SmartParseResult {
  for (const { obj, rowNumber, raw } of mapped) {
    const withMeta = { ...obj, _rowNumber: rowNumber, _raw: raw };
    const parsed = createTradeSchema.safeParse(withMeta);
    if (parsed.success) {
      rows.push({ ...parsed.data, _rowNumber: rowNumber, _raw: raw } as ParsedTradeRow);
    } else {
      const message = parsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; ");
      errors.push({ row: rowNumber, message });
      rows.push(withMeta as unknown as ParsedTradeRow);
    }
  }
  if (skipped > 0) reasons.push(`Skipped ${skipped} non-trade row(s) (deposits, balance ops, cancelled orders, blanks)`);
  return {
    rows,
    errors,
    detectedColumns,
    platform: detection.platform,
    platformLabel: PLATFORM_LABELS[detection.platform],
    confidence: detection.confidence,
    reasons,
    skipped,
  };
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/** Back-compatible paste parser — now runs the smart pipeline. */
export function parsePastedTrades(text: string): ParseResult {
  const table = splitTextTable(text);
  if (table.rows.length === 0 && !table.headers) {
    return {
      rows: [],
      errors: [{ row: 0, message: "No data found. Paste tab- or comma-separated rows." }],
      detectedColumns: {},
    };
  }
  if (table.rows.length === 0) {
    return {
      rows: [],
      errors: [{ row: 1, message: "Only a header row was detected — no trade rows to import." }],
      detectedColumns: {},
    };
  }
  return smartParseTable(table.headers, table.rows);
}

const EXCEL_EXTS = [".xlsx", ".xls", ".xlsm", ".xltx", ".xltm", ".ods"];
const HTML_EXTS = [".html", ".htm", ".mhtml"];

export interface HistoryPreview extends SmartParseResult {
  fileName: string;
}

/** Parse an uploaded history file (broker export) into a trade preview. */
export function parseHistoryFile(buffer: Buffer, fileName: string): HistoryPreview {
  const lower = fileName.toLowerCase();
  const fail = (message: string): HistoryPreview => ({
    rows: [],
    errors: [{ row: 0, message }],
    detectedColumns: {},
    fileName,
    platform: "generic",
    platformLabel: PLATFORM_LABELS.generic,
    confidence: 0,
    reasons: [message],
    skipped: 0,
  });

  if (buffer.length === 0) return fail("Uploaded file is empty.");
  if (buffer.length > 15 * 1024 * 1024) return fail("File is larger than 15 MB — export a smaller date range.");

  try {
    if (EXCEL_EXTS.some((e) => lower.endsWith(e))) {
      const table = parseWorkbookTable(buffer);
      if (table.rows.length === 0) return fail(`No data rows found in ${fileName}.`);
      return { ...smartParseTable(table.headers, table.rows, { fileName }), fileName };
    }
    if (HTML_EXTS.some((e) => lower.endsWith(e))) {
      const text = buffer.toString("utf8");
      const table = parseHtmlTable(text);
      if (!table) {
        return fail("No recognizable trade table found in this HTML file. MT4/MT5 statement reports work best.");
      }
      return { ...smartParseTable(table.headers, table.rows, { fileName }), fileName };
    }
    // Plain text: CSV / TSV / TXT / MT4 "save as" text, cTrader CSV, …
    let text = buffer.toString("utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
    if (text.includes("\uFFFD")) {
      // Likely a legacy ANSI export (MT4 on Windows) — retry as latin1.
      text = buffer.toString("latin1");
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    }
    const table = splitTextTable(text);
    if (table.rows.length === 0) return fail(`No data rows found in ${fileName}.`);
    return { ...smartParseTable(table.headers, table.rows, { fileName }), fileName };
  } catch (err) {
    return fail(`Could not parse ${fileName}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
