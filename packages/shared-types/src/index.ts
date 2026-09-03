import { z } from "zod";

export const directionSchema = z.enum(["long", "short"]);
export type Direction = z.infer<typeof directionSchema>;

export const setupGradeSchema = z.enum(["A++", "A", "B", "C", "D", "F"]);
export type SetupGrade = z.infer<typeof setupGradeSchema>;

export const tradeSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  symbol: z.string().min(1, "Symbol is required").max(32),
  direction: directionSchema,
  entryPrice: z.coerce.number().positive("Entry price must be positive"),
  exitPrice: z.coerce.number().positive().optional().nullable(),
  stopLoss: z.coerce.number().positive().optional().nullable(),
  takeProfit: z.coerce.number().positive().optional().nullable(),
  rMultiple: z.coerce.number().optional().nullable(),
  entryTime: z.coerce.date().optional().nullable(),
  exitTime: z.coerce.date().optional().nullable(),
  strategy: z.string().max(128).optional().nullable(),
  emotionTag: z.string().max(64).optional().nullable(),
  setupGrade: setupGradeSchema.optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  screenshotUrl: z.string().url().optional().nullable().or(z.literal("")),
  createdAt: z.coerce.date().optional(),
});

export type Trade = z.infer<typeof tradeSchema>;

export const createTradeSchema = tradeSchema.omit({ id: true, userId: true, rMultiple: true, createdAt: true });
export type CreateTradeInput = z.infer<typeof createTradeSchema>;

export const updateTradeSchema = tradeSchema
  .omit({ id: true, userId: true, createdAt: true })
  .partial();
export type UpdateTradeInput = z.infer<typeof updateTradeSchema>;

export const tradeFilterSchema = z.object({
  symbol: z.string().optional(),
  direction: directionSchema.optional(),
  strategy: z.string().optional(),
  setupGrade: setupGradeSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
});
export type TradeFilter = z.infer<typeof tradeFilterSchema>;

/** Row produced by the copy-paste parser before validation. */
export const parsedTradeRowSchema = createTradeSchema.extend({
  _rowNumber: z.number().optional(),
  _raw: z.string().optional(),
});
export type ParsedTradeRow = z.infer<typeof parsedTradeRowSchema>;

/** Result of parsing pasted tabular text. */
export const parsePreviewSchema = z.object({
  rows: z.array(parsedTradeRowSchema),
  errors: z.array(z.object({ row: z.number(), message: z.string() })),
  detectedColumns: z.record(z.string()),
});
export type ParsePreview = z.infer<typeof parsePreviewSchema>;

/** OCR extraction result from a screenshot (frontend, Tesseract.js). */
export const ocrExtractionSchema = z.object({
  symbol: z.string().optional().nullable(),
  entryPrice: z.number().optional().nullable(),
  stopLoss: z.number().optional().nullable(),
  takeProfit: z.number().optional().nullable(),
  directionGuess: directionSchema.optional().nullable(),
  rawText: z.string(),
  confidence: z.number().min(0).max(100).optional().nullable(),
});
export type OcrExtraction = z.infer<typeof ocrExtractionSchema>;

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = registerSchema;
export type LoginInput = z.infer<typeof loginSchema>;
