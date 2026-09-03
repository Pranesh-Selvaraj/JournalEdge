# JournalEdge

> **JournalEdge** — the product name and top-bar logo are always written as one word with a capital `J` and capital `E`.

### Official wordmark

The website uses this exact wordmark in the top bar:

![JournalEdge official wordmark](./apps/frontend/public/journaledge-wordmark.svg)

The visual lockup is **Journal** in soft white followed immediately by **Edge** in emerald green. Keep the spelling, capitalization, order, and colors unchanged.

A personal trading journal dashboard with smart entry methods (copy-paste parsing, screenshot OCR, manual entry), historical tracking, and detailed analytics.

## Tech Stack

- **Package Manager:** pnpm (workspace monorepo)
- **Frontend:** Vite + React (TypeScript, TailwindCSS)
- **Backend:** Node.js (v20 LTS) + Express
- **Type Safety:** tRPC (shared types between frontend/backend)
- **Database:** PostgreSQL + Drizzle ORM
- **Image/OCR:** Tesseract.js (browser-based, no external API key needed)
- **Charts:** Recharts
- **Auth:** JWT + bcrypt

## Project Structure

```
journaledge/
├── docker-compose.yml
├── .env.example
├── package.json (root with pnpm workspaces)
├── LICENSE (MIT)
├── README.md
├── apps/
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── features/
│   │   │   │   ├── upload/      # Drag-drop + paste + screenshot OCR
│   │   │   │   ├── journal/     # Trade list with filters
│   │   │   │   └── analytics/   # Charts & metrics
│   │   │   └── lib/trpc.ts
│   │   └── package.json
│   └── backend/
│       ├── src/
│       │   ├── routes/          # tRPC routers
│       │   ├── services/
│       │   │   ├── parser.service.ts
│       │   │   └── analytics.service.ts
│       │   └── db/schema.ts
│       └── package.json
└── packages/
    └── shared-types/            # Zod schemas
```

## Quickstart

```bash
# 1. Start Postgres
docker compose up -d

# 2. Copy env
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env  # if present, or set DATABASE_URL

# 3. Install dependencies
pnpm install

# 4. Generate + run migrations
pnpm db:generate
pnpm db:migrate

# 5. Start dev servers (root runs both in parallel)
pnpm dev

# Frontend: http://localhost:5173
# Backend:  http://localhost:4000
# Health:   http://localhost:4000/health  (plain Express)
#           http://localhost:4000/trpc/health.check (tRPC)
```

## Smart Entry

### Copy-Paste Mode
Paste tab- or comma-separated trade data from TradingView / MT4, etc.
- Header detection (skips first row if it contains labels like "Symbol", "Entry")
- Column auto-mapping (Symbol → symbol, Entry → entry_price, etc.)
- Fallback: preview with editable fields before saving (see `CopyPasteImporter.tsx`)

### History Import (broker files)
Drop an old history export file — platform and columns are auto-detected, nothing is saved before you review:
- **Formats:** `.csv` `.tsv` `.txt` `.xls` `.xlsx` `.ods` `.html` (MT4/MT5 statement reports), max 15 MB
- **Platforms:** MetaTrader 4, MetaTrader 5 (deal ledgers with In/Out directions are reconstructed into closed positions FIFO), cTrader, TradingView/generic
- **Smart bits:** header-signature scoring with confidence, MT4 duplicate Price/Time column disambiguation, Buy/Sell ↔ Long/Short coercion, currency/thousands separators, MT4 dot-dates (`2024.01.15 10:30`), Excel serial dates, title rows above headers skipped, deposits/balance ops/cancelled pendings skipped, ticket/volume/commission/swap/P&L folded into notes
- Endpoint: `POST /api/import/preview` (multipart `file`) → editable preview → saved via tRPC `trades.importRows` in 500-row chunks (see `HistoryImporter.tsx`)

### Outcomes & P&L
Every trade shows an outcome badge in the journal — **Profit** / **Loss** / **Breakeven** / **Open** — with a filter and counts.
- Automatic: derived from exit vs entry price and direction; broker P&L columns map to the `profit` field on import.
- Configurable: set P&L manually per trade (manual entry, copy-paste, or history preview grids) — an explicit P&L always decides the outcome.
- Analytics adds Total / Avg P&L cards whenever P&L data exists (see `getTradeOutcome` in `packages/shared-types`).

### Screenshot Mode
Paste a screenshot (Ctrl+V) or drag-drop a file. Tesseract.js (frontend) extracts:
- Entry price (`Entry` label), SL (`SL`), TP (`TP`), Symbol (chart header)
- Color detection: green-dominant = long, red-dominant = short (see `ScreenshotImporter.tsx`)

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Run backend + frontend in parallel |
| `pnpm build` | Build all workspaces |
| `pnpm db:generate` | Drizzle generate migrations |
| `pnpm db:migrate` | Drizzle apply migrations |
| `pnpm test` | Run backend unit tests |
| `pnpm check` | Install, build, and run the CI validation checks |

## Delivery and security

Every pull request is validated by GitHub Actions (`pnpm build` and `pnpm test`) and analyzed by CodeQL. Dependabot keeps pnpm and GitHub Action dependencies current. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the required branch protection rules and [SECURITY.md](./SECURITY.md) for vulnerability reporting and the production security baseline.

## License

MIT — see [LICENSE](./LICENSE).
