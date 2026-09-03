import { trpc } from "../../lib/trpc";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid,
} from "recharts";

export function AnalyticsDashboard() {
  const { data, isLoading, isError, error } = trpc.analytics.summary.useQuery({});

  if (isLoading) return <p className="text-sm text-slate-400">Computing analytics…</p>;
  if (isError) return <p className="text-sm text-amber-300">Analytics unavailable ({String(error)}). Start backend + Postgres.</p>;
  if (!data) return null;

  const fmtMoney = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
  const cards: Array<[string, string]> = [
    ["Total trades", String(data.totalTrades)],
    ["Win rate", `${data.winRate}%`],
    ["Total R", `${data.totalR.toFixed(2)}R`],
    ["Avg R", `${data.avgR.toFixed(2)}R`],
    ["Total P&L", data.profitTrades > 0 ? fmtMoney(data.totalProfit) : "—"],
    ["Avg P&L", data.profitTrades > 0 ? fmtMoney(data.avgProfit) : "—"],
    ["Best / Worst", `${data.bestR ?? "—"} / ${data.worstR ?? "—"}`],
    ["W / L / BE", `${data.wins} / ${data.losses} / ${data.breakeven}`],
  ];

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(([k, v]) => (
          <div key={k} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
            <p className="text-xs text-slate-400">{k}</p>
            <p className="mt-1 text-lg font-bold">{v}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="font-semibold">Equity Curve (cumulative R)</h3>
        <div className="mt-2 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.equityCurve}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
              <Line type="monotone" dataKey="cumulativeR" stroke="#34d399" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="font-semibold">R by Symbol</h3>
          <div className="mt-2 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.bySymbol}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="symbol" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
                <Bar dataKey="totalR" fill="#34d399" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="font-semibold">R by Strategy</h3>
          <div className="mt-2 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byStrategy}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="strategy" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
                <Bar dataKey="totalR" fill="#60a5fa" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}
