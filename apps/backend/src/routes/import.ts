import { Router } from "express";
import multer from "multer";
import { parseHistoryFile } from "../services/parser.service.js";

/**
 * File-based history import (REST — tRPC doesn't do multipart).
 *
 *   POST /api/import/preview   multipart field `file`
 *     -> { fileName, platform, platformLabel, confidence, reasons,
 *          rows, errors, detectedColumns, skipped }
 *
 * Saving reuses the tRPC `trades.importRows` mutation (bulk, validated),
 * so this endpoint never writes to the database.
 */
export const importRouter: Router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
});

importRouter.post("/preview", upload.single("file"), (req, res) => {
  const file = (req as unknown as { file?: Express.Multer.File }).file;
  if (!file) {
    res.status(400).json({ error: "No file uploaded. Send multipart field `file`." });
    return;
  }
  const preview = parseHistoryFile(file.buffer, file.originalname || "upload");
  res.json(preview);
});

importRouter.get("/formats", (_req, res) => {
  res.json({
    accepted: [".csv", ".tsv", ".txt", ".xls", ".xlsx", ".xlsm", ".ods", ".html", ".htm"],
    maxBytes: 15 * 1024 * 1024,
    platforms: ["mt4", "mt5", "mt5-deals", "ctrader", "generic"],
    notes: [
      "MT4: Account History copy-paste, statement HTML, or CSV export.",
      "MT5: History export (positions) or deal-ledger HTML/CSV — In/Out deals are reconstructed FIFO.",
      "cTrader: History tab CSV export.",
      "Anything else: first row is auto-detected as header when possible; Buy/Sell and Long/Short both understood.",
    ],
  });
});
