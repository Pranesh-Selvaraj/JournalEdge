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
  const pageMeta: Record<Tab, { eyebrow: string; title: string; description: string }> = {
    upload: { eyebrow: "Workspace / Smart entry", title: "Capture the trade, keep the edge.", description: "Bring in your market history in seconds, then turn every position into a useful decision log." },
    journal: { eyebrow: "Workspace / Journal", title: "Your trading memory.", description: "Review the details that matter, spot patterns, and stay honest about your process." },
    analytics: { eyebrow: "Workspace / Analytics", title: "Read the tape.", description: "A calm view of your performance, built from the trades you actually took." },
  };
  const meta = pageMeta[tab];
  const goToJournal = () => { setRefreshKey((k) => k + 1); setTab("journal"); };

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <div className="app-shell min-h-screen">
          <aside className="sidebar">
            <div className="brand-mark"><img src="/journaledge-wordmark.svg" alt="JournalEdge" width="150" height="28" /><div><p>Trading, made visible.</p></div></div>
            <div className="sidebar-label">Workspace</div>
            <nav className="sidebar-nav">
              {([["upload", "Smart entry", "↗"], ["journal", "Journal", "≡"], ["analytics", "Analytics", "◒"]] as Array<[Tab, string, string]>).map(([id, label, icon]) => (
                <button key={id} onClick={() => setTab(id)} className={`sidebar-link ${tab === id ? "active" : ""}`}><span className="nav-icon">{icon}</span>{label}</button>
              ))}
            </nav>
            <div className="sidebar-bottom"><div className="status-dot"><span /> Local workspace</div><p>Private by default.<br />Built for better decisions.</p></div>
          </aside>
          <main className="main-content">
            <header className="topbar"><div className="breadcrumb">{meta.eyebrow}</div><div className="topbar-actions"><span className="live-pill"><span /> Synced</span><div className="avatar">TR</div></div></header>
            <section className="page-intro"><div><p className="section-kicker">{meta.eyebrow}</p><h2>{meta.title}</h2><p className="intro-copy">{meta.description}</p></div><div className="date-chip">September 2026 <span>⌄</span></div></section>
            {tab === "upload" && (
              <div className="content-stack">
                <section className="welcome-panel"><div><p className="section-kicker accent">THE QUICK START</p><h3>How did you trade today?</h3><p>Choose the fastest way to get your positions into the journal.</p></div><div className="quick-stat"><strong>01</strong><span>Import, review,<br />improve.</span></div></section>
                <HistoryImporter onImported={goToJournal} />
                <div className="import-grid"><CopyPasteImporter onImported={goToJournal} /><ScreenshotImporter onImported={goToJournal} /></div>
              </div>
            )}
            {tab === "journal" && <div className="content-stack"><TradeForm onSaved={() => setRefreshKey((k) => k + 1)} /><TradeList key={refreshKey} /></div>}
            {tab === "analytics" && <AnalyticsDashboard />}
          </main>
        </div>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
