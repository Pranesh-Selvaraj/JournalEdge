import type { OcrExtraction } from "@journaledge/shared-types";

/**
 * Heuristic extraction from Tesseract.js plain text:
 * - Entry: /entry[:\s]+([\d.,]+)/i
 * - SL:    /(?:SL|stop\s*loss|stop)[:\s]+([\d.,]+)/i
 * - TP:    /(?:TP|take\s*profit|target)[:\s]+([\d.,]+)/i
 * - Symbol: first ALL-CAPS token 2-12 chars (optionally with / : - _), usually chart header
 */
export function extractTradeFields(rawText: string): Omit<OcrExtraction, "rawText" | "confidence" | "directionGuess"> {
  const text = rawText ?? "";
  const num = (s: string | undefined): number | null => {
    if (!s) return null;
    const normalized = s.replace(/[,\s]/g, "");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  };

  // Keep the label/value relationship intact even when OCR inserts a line
  // break between them. Values may be decimal prices or use thousands commas.
  const price = "(-?(?:\\d[\\d,]*\\.?\\d*|\\.\\d+))";
  const afterLabel = (label: string): number | null => num(text.match(new RegExp(`${label}[^0-9.-]{0,32}${price}`, "i"))?.[1]);
  const entryPrice = afterLabel("\\bentry(?:\\s+price)?\\b");
  const stopLoss = afterLabel("(?:\\bSL\\b|\\bstop\\s*loss\\b|\\bstop\\b)");
  const takeProfit = afterLabel("(?:\\bTP\\b|\\btake\\s*profit\\b|\\bt\\/p\\b|\\btarget\\b)");

  // Symbol: prefer first line tokens that look like tickers.
  const firstLines = text.split(/\n/).slice(0, 4).join(" ");
  const symbolMatch =
    firstLines.match(/\b([A-Z]{2,12}(?:[\/:._-][A-Z0-9]{1,10})?)\b/) ??
    text.match(/\b([A-Z]{3,10}USD|[A-Z]{6,7}|[A-Z]+USDT?)\b/);

  return {
    symbol: symbolMatch?.[1]?.toUpperCase() ?? null,
    entryPrice,
    stopLoss,
    takeProfit,
  };
}

export function guessDirectionFromText(rawText: string): "long" | "short" | null {
  const text = rawText ?? "";
  const orderType = text.match(/\border\s*type\b[^a-z]*(buy|sell|long|short)\b/i)?.[1].toLowerCase();
  if (orderType === "buy" || orderType === "long") return "long";
  if (orderType === "sell" || orderType === "short") return "short";
  return null;
}

/**
 * Green = long, Red = short heuristic from image pixels.
 * Samples the image at low resolution and compares green vs red dominance.
 */
export async function guessDirectionFromColors(img: HTMLImageElement): Promise<"long" | "short" | null> {
  const canvas = document.createElement("canvas");
  const W = 64;
  const H = 64;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;
  let green = 0;
  let red = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // strongly green / strongly red pixels only (typical trading candles)
    if (g > r + 30 && g > b + 20) green++;
    else if (r > g + 30 && r > b + 20) red++;
  }
  if (green === 0 && red === 0) return null;
  if (Math.abs(green - red) < 8) return null;
  return green > red ? "long" : "short";
}

export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
