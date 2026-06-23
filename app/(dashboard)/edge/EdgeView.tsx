"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface SnapMetrics {
  trades: number;
  winRate: number;
  avgR: number;
  totalR: number;
  profitFactor: number | null;
  maxDrawdownR: number;
  avgHoldDays: number;
}

interface Snapshot {
  generatedAt: string;
  config: string;
  universeSize: number;
  bull: { window: string; metrics: SnapMetrics; equity: { date: string; cumR: number }[] };
  bear: { window: string; metrics: SnapMetrics };
}

interface UserStats {
  decided: number;
  wins: number;
  losses: number;
  open: number;
  winRate: number;
  avgR: number;
  totalR: number;
}

function fmtR(r: number): string {
  return `${r >= 0 ? "+" : ""}${r.toFixed(2)}R`;
}
function fmtPct(x: number): string {
  return `${(x * 100).toFixed(0)}%`;
}

export function EdgeView({ snapshot, userStats }: { snapshot: Snapshot; userStats: UserStats }) {
  const { bull, bear } = snapshot;
  const m = bull.metrics;

  const generated = useMemo(() => {
    const d = new Date(snapshot.generatedAt);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }, [snapshot.generatedAt]);

  const minCum = useMemo(
    () => Math.min(0, ...bull.equity.map((p) => p.cumR)),
    [bull.equity],
  );
  const maxCum = useMemo(
    () => Math.max(0, ...bull.equity.map((p) => p.cumR)),
    [bull.equity],
  );

  return (
    <div className="space-y-6">
      {/* ───────── Header ───────── */}
      <header className="space-y-2 border-b border-slate-800 pb-4">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-emerald-400">
          Strategy Edge
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">
          Does the GMMA strategy actually make money?
        </h1>
        <p className="text-sm text-slate-400">
          Backtested over {snapshot.universeSize.toLocaleString()} liquid US stocks, replaying the
          exact live scanner day-by-day with no lookahead. {snapshot.config}.
        </p>
        <p className="font-mono text-[11px] text-slate-600">Snapshot generated {generated}</p>
      </header>

      {/* ───────── Headline metrics (bull window) ───────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Expectancy"
          value={fmtR(m.avgR)}
          hint="avg / trade"
          tone={m.avgR > 0 ? "gain" : "loss"}
          emphasis
        />
        <StatCard
          label="Profit factor"
          value={m.profitFactor === null ? "∞" : m.profitFactor.toFixed(2)}
          hint="won ÷ lost"
          tone={m.profitFactor !== null && m.profitFactor >= 1 ? "gain" : "loss"}
        />
        <StatCard label="Win rate" value={fmtPct(m.winRate)} hint={`${m.trades} trades`} tone="neutral" />
        <StatCard label="Max drawdown" value={fmtR(m.maxDrawdownR)} hint="peak-to-trough" tone="loss" />
        <StatCard label="Total" value={fmtR(m.totalR)} hint={bull.window} tone={m.totalR > 0 ? "gain" : "loss"} />
      </div>

      {/* ───────── Equity curve ───────── */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-200">Backtest equity curve</h2>
          <span className="font-mono text-[11px] text-slate-500">
            {bull.window} · cumulative R
          </span>
        </div>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={bull.equity} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="edgeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: "#64748b", fontSize: 10, fontFamily: "monospace" }}
                tickFormatter={(d: string) =>
                  new Date(d).toLocaleDateString(undefined, { month: "short", year: "2-digit" })
                }
                minTickGap={48}
                axisLine={{ stroke: "#1e293b" }}
                tickLine={false}
              />
              <YAxis
                domain={[Math.floor(minCum - 2), Math.ceil(maxCum + 2)]}
                tick={{ fill: "#64748b", fontSize: 10, fontFamily: "monospace" }}
                tickFormatter={(v: number) => `${v}R`}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <ReferenceLine y={0} stroke="#334155" strokeWidth={1} />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #1e293b",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#94a3b8", fontFamily: "monospace" }}
                formatter={(value) => [fmtR(Number(value)), "Cumulative"]}
                labelFormatter={(label) =>
                  new Date(String(label)).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                }
              />
              <Area
                type="monotone"
                dataKey="cumR"
                stroke="#34d399"
                strokeWidth={2}
                fill="url(#edgeFill)"
                dot={false}
                activeDot={{ r: 3, fill: "#34d399" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Each step is one simulated trade, marked at its exit. Risk is constant per trade, so the
          curve is in units of <span className="text-slate-300">R</span> (multiples of the amount
          risked) — independent of account size.
        </p>
      </section>

      {/* ───────── Regime validation ───────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-200">
          Positive in a bull <span className="text-slate-500">and</span> a bear market
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <RegimeCard label="Bull market" window={bull.window} metrics={bull.metrics} />
          <RegimeCard label="Bear-inclusive (incl. 2022)" window={bear.window} metrics={bear.metrics} />
        </div>
        <p className="text-xs leading-relaxed text-slate-500">
          The same strict config is profitable across both regimes — the edge isn&rsquo;t just
          bull-market drift. Looser variants (opening the entry gate, trailing exits) looked great in
          the bull window but turned negative in the bear, so they aren&rsquo;t shipped.
        </p>
      </section>

      {/* ───────── Your results vs the backtest ───────── */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-200">Your results vs the backtest</h2>
        {userStats.decided === 0 ? (
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            No closed trades yet
            {userStats.open > 0 ? ` (${userStats.open} still open)` : ""}. Once you mark trades as
            hitting their target or stop in{" "}
            <a href="/portfolio" className="text-emerald-400 hover:underline">
              Portfolio
            </a>
            , your real win-rate and R will appear here next to the backtest — so you can see whether
            your execution is tracking the edge.
          </p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-950/60 text-left font-mono text-[10px] uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Metric</th>
                  <th className="px-3 py-2 text-right font-medium">Backtest</th>
                  <th className="px-3 py-2 text-right font-medium">You</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums [&_td]:px-3 [&_td]:py-2.5 [&_tr]:border-t [&_tr]:border-slate-800">
                <tr>
                  <td className="text-slate-400">Win rate</td>
                  <td className="text-right text-slate-300">{fmtPct(m.winRate)}</td>
                  <td className="text-right text-slate-100">{fmtPct(userStats.winRate)}</td>
                </tr>
                <tr>
                  <td className="text-slate-400">Avg R / trade</td>
                  <td className="text-right text-slate-300">{fmtR(m.avgR)}</td>
                  <td
                    className={`text-right ${userStats.avgR >= 0 ? "text-emerald-300" : "text-red-300"}`}
                  >
                    {fmtR(userStats.avgR)}
                  </td>
                </tr>
                <tr>
                  <td className="text-slate-400">Sample</td>
                  <td className="text-right text-slate-300">{m.trades} trades</td>
                  <td className="text-right text-slate-100">
                    {userStats.decided} decided
                    {userStats.open > 0 ? ` · ${userStats.open} open` : ""}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ───────── Caveats ───────── */}
      <p className="text-xs leading-relaxed text-slate-600">
        <span className="text-slate-500">Honest caveats:</span> the universe is built from{" "}
        <em>currently</em> active names (survivorship bias — delisted losers aren&rsquo;t included);
        long-only momentum carries market beta; the free data feed sees only a fraction of true
        volume, so the liquidity filter is a rough proxy. Past backtested performance is not a promise
        of future results, and TrendScan does not execute trades or give financial advice.
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "gain" | "loss" | "neutral";
  emphasis?: boolean;
}) {
  const valueColor =
    tone === "gain" ? "text-emerald-300" : tone === "loss" ? "text-red-300" : "text-slate-100";
  return (
    <div
      className={`rounded-xl border bg-slate-900/40 p-4 ${
        emphasis ? "border-emerald-500/30 ring-1 ring-emerald-500/10" : "border-slate-800"
      }`}
    >
      <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</p>
      <p className="mt-1 font-mono text-[10px] text-slate-600">{hint}</p>
    </div>
  );
}

function RegimeCard({
  label,
  window,
  metrics,
}: {
  label: string;
  window: string;
  metrics: SnapMetrics;
}) {
  const positive = metrics.avgR > 0;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-200">{label}</span>
        <span
          className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
            positive
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/40 bg-red-500/10 text-red-300"
          }`}
        >
          {positive ? "Positive" : "Negative"}
        </span>
      </div>
      <p className="mt-1 font-mono text-[11px] text-slate-500">{window}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 font-mono text-sm tabular-nums">
        <div>
          <dt className="text-[9px] uppercase tracking-widest text-slate-500">Avg R</dt>
          <dd className={positive ? "text-emerald-300" : "text-red-300"}>{fmtR(metrics.avgR)}</dd>
        </div>
        <div>
          <dt className="text-[9px] uppercase tracking-widest text-slate-500">PF</dt>
          <dd className="text-slate-200">
            {metrics.profitFactor === null ? "∞" : metrics.profitFactor.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt className="text-[9px] uppercase tracking-widest text-slate-500">Trades</dt>
          <dd className="text-slate-200">{metrics.trades}</dd>
        </div>
      </dl>
    </div>
  );
}
