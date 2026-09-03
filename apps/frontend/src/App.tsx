import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { trpc } from "./lib/trpc";
import type { AppRouter } from "../../backend/src/routes/index";
import { CopyPasteImporter } from "./features/upload/CopyPasteImporter";
import { HistoryImporter } from "./features/upload/HistoryImporter";
import { ScreenshotImporter } from "./features/upload/ScreenshotImporter";
import { TradeList } from "./features/journal/TradeList";
import { TradeForm } from "./features/journal/TradeForm";
import { AnalyticsDashboard } from "./features/analytics/AnalyticsDashboard";

// Re-export for tree-shaking friendliness; actual type comes from backend.
export type { AppRouter };

function makeClient() {
  const url = (import.meta.env.VITE_TRPC_URL as string | undefined) ?? "http://localhost:4000/trpc";
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      transformer: superjson,
      links: [
        httpBatchLink({
          url,
          headers() {
            const token = localStorage.getItem("journaledge_token");
            return token ? { Authorization: `Bearer ${token}` } : {};
          },
        }),
      ],
    }),
  );
  return { queryClient, trpcClient };
}

type Tab = "upload" | "journal" | "analytics";

export default function App() {
  const { queryClient, trpcClient } = makeClient();
  const [tab, setTab] = useState<Tab>("upload");
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen">
          <header className="border-b border-slate-800 bg-slate-900/60">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
              <div>
                <h1 className="text-xl font-bold tracking-tight">
                  Journal<span className="text-emerald-400">Edge</span>
                </h1>
                <p className="text-xs text-slate-400">Smart trading journal — paste, OCR, analyze</p>
              </div>
              <nav className="flex gap-2">
                {(
                  [
                    ["upload", "Smart Entry"],
                    ["journal", "Journal"],
                    ["analytics", "Analytics"],
                  ] as Array<[Tab, string]>
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium ${
                      tab === id ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-4 py-6">
            {tab === "upload" && (
              <div className="grid gap-6">
                <HistoryImporter onImported={() => { setRefreshKey((k) => k + 1); setTab("journal"); }} />
                <div className="grid gap-6 lg:grid-cols-2">
                  <CopyPasteImporter onImported={() => { setRefreshKey((k) => k + 1); setTab("journal"); }} />
                  <ScreenshotImporter onImported={() => { setRefreshKey((k) => k + 1); setTab("journal"); }} />
                </div>
              </div>
            )}
            {tab === "journal" && (
              <div className="grid gap-6">
                <TradeForm onSaved={() => setRefreshKey((k) => k + 1)} />
                <TradeList key={refreshKey} />
              </div>
            )}
            {tab === "analytics" && <AnalyticsDashboard />}
          </main>
        </div>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
