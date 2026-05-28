"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { etoroLink, formatPrice } from "@/lib/format";
import type { TradeStatus, UserTradeRow } from "@/lib/db/trades";
import type { ChartBar } from "@/lib/scanner";
import { StockTargetChart } from "../_components/StockTargetChart";

export interface ChartSnapshot {
  chartBars: ChartBar[];
  currentPrice: number;
}

interface Props {
  open: UserTradeRow[];
  archived: UserTradeRow[];
  charts: Record<string, ChartSnapshot>;
}

export function PortfolioView({ open, archived, charts }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function setStatus(trade: UserTradeRow, status: TradeStatus) {
    setBusyId(trade.id);
    setError(null);
    try {
      const supabase = createClient();
      const patch: { status: TradeStatus; closed_at?: string } = { status };
      if (status !== "OPEN") patch.closed_at = new Date().toISOString();
      const { error } = await supabase.from("user_trades").update(patch).eq("id", trade.id);
      if (error) throw error;
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteTrade(trade: UserTradeRow) {
    if (!confirm(`Delete ${trade.ticker} from your history?`)) return;
    setBusyId(trade.id);
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("user_trades").delete().eq("id", trade.id);
      if (error) throw error;
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <header className="border-b border-slate-800 pb-4">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-emerald-400">
          Capital Allocation Tracker
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-50">My Active Portfolio</h1>
        <p className="mt-1 text-sm text-slate-400">
          Monitor your open trades. Update status once filled on your broker.
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <section>
        <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-slate-400">
          Open Trades ({open.length})
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-950/60 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-2 py-3 w-8" />
                <th className="px-4 py-3">Ticker</th>
                <th className="px-4 py-3 text-right">Entry</th>
                <th className="px-4 py-3 text-right">Target TP</th>
                <th className="px-4 py-3 text-right">Target SL</th>
                <th className="px-4 py-3">Opened</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {open.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    No open trades. Add one from the Scanner.
                  </td>
                </tr>
              )}
              {open.map((t) => {
                const snapshot = charts[t.ticker];
                const isExpanded = expandedId === t.id;
                return (
                  <Fragment key={t.id}>
                    <tr className="border-b border-slate-800/60 last:border-b-0 hover:bg-slate-800/30">
                      <td className="px-2 py-3">
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : t.id)}
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? `Collapse ${t.ticker} chart` : `Expand ${t.ticker} chart`}
                          className="flex h-6 w-6 items-center justify-center rounded border border-slate-700 text-slate-400 transition hover:border-emerald-400 hover:text-emerald-300"
                        >
                          <span
                            className={`inline-block font-mono text-[10px] transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          >
                            ▶
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={etoroLink(t.ticker)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono font-semibold text-emerald-400 hover:underline"
                        >
                          {t.ticker}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{formatPrice(Number(t.entry_price))}</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-300">{formatPrice(Number(t.target_tp))}</td>
                      <td className="px-4 py-3 text-right font-mono text-red-300">{formatPrice(Number(t.target_sl))}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{formatDate(t.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={busyId === t.id}
                            onClick={() => setStatus(t, "HIT_TP")}
                            className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                          >
                            Mark TP
                          </button>
                          <button
                            type="button"
                            disabled={busyId === t.id}
                            onClick={() => setStatus(t, "HIT_SL")}
                            className="rounded border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                          >
                            Mark SL
                          </button>
                          <button
                            type="button"
                            disabled={busyId === t.id}
                            onClick={() => setStatus(t, "CLOSED")}
                            className="rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-500 hover:text-slate-100 disabled:opacity-50"
                          >
                            Close
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-slate-800/60 bg-slate-950/40">
                        <td colSpan={7} className="px-4 py-4">
                          {snapshot ? (
                            <StockTargetChart
                              ticker={t.ticker}
                              currentPrice={snapshot.currentPrice}
                              tpTargetPrice={Number(t.target_tp)}
                              slTargetPrice={Number(t.target_sl)}
                              historicalData={snapshot.chartBars}
                              height={240}
                            />
                          ) : (
                            <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-6 text-center text-xs text-slate-500">
                              Live bars unavailable for {t.ticker}. Targets stay locked at TP {formatPrice(Number(t.target_tp))} / SL {formatPrice(Number(t.target_sl))}.
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <ArchivedSection trades={archived} busyId={busyId} onDelete={deleteTrade} />
    </div>
  );
}

function ArchivedSection({
  trades, busyId, onDelete,
}: { trades: UserTradeRow[]; busyId: string | null; onDelete: (t: UserTradeRow) => void }) {
  const summary = useMemo(() => {
    const wins = trades.filter((t) => t.status === "HIT_TP").length;
    const losses = trades.filter((t) => t.status === "HIT_SL").length;
    const closed = trades.filter((t) => t.status === "CLOSED").length;
    const decided = wins + losses;
    const winRate = decided > 0 ? (wins / decided) * 100 : 0;
    return { wins, losses, closed, decided, winRate };
  }, [trades]);

  return (
    <section>
      <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-slate-400">
        Archived &amp; Closed History ({trades.length})
      </h2>

      {trades.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatChip label="Wins (TP)" value={summary.wins.toString()} tone="emerald" />
          <StatChip label="Losses (SL)" value={summary.losses.toString()} tone="red" />
          <StatChip label="Manually closed" value={summary.closed.toString()} />
          <StatChip
            label="Win rate"
            value={summary.decided > 0 ? `${summary.winRate.toFixed(0)}%` : "—"}
            tone={summary.winRate >= 50 ? "emerald" : summary.decided > 0 ? "red" : undefined}
          />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-950/60 text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3">Ticker</th>
              <th className="px-4 py-3 text-right">Entry</th>
              <th className="px-4 py-3 text-right">Outcome</th>
              <th className="px-4 py-3">Closed</th>
              <th className="px-4 py-3 text-right">Result</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  Nothing archived yet.
                </td>
              </tr>
            )}
            {trades.map((t) => {
              const entry = Number(t.entry_price);
              const target =
                t.status === "HIT_TP" ? Number(t.target_tp)
                : t.status === "HIT_SL" ? Number(t.target_sl)
                : null;
              const pct = target !== null ? ((target - entry) / entry) * 100 : null;
              return (
                <tr key={t.id} className="border-b border-slate-800/60 last:border-b-0 hover:bg-slate-800/30">
                  <td className="px-4 py-3">
                    <a
                      href={etoroLink(t.ticker)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono font-semibold text-emerald-400 hover:underline"
                    >
                      {t.ticker}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{formatPrice(entry)}</td>
                  <td className="px-4 py-3 text-right">
                    <OutcomeBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {t.closed_at ? formatDate(t.closed_at) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {pct === null ? (
                      <span className="text-slate-500">—</span>
                    ) : (
                      <span className={pct >= 0 ? "text-emerald-300" : "text-red-300"}>
                        {pct >= 0 ? "+" : ""}
                        {pct.toFixed(2)}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={busyId === t.id}
                      onClick={() => onDelete(t)}
                      className="rounded border border-slate-800 px-2 py-1 text-xs text-slate-500 hover:border-red-500/40 hover:text-red-300 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OutcomeBadge({ status }: { status: TradeStatus }) {
  if (status === "HIT_TP") {
    return <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-emerald-300">Hit TP · WIN</span>;
  }
  if (status === "HIT_SL") {
    return <span className="rounded border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-red-300">Hit SL · LOSS</span>;
  }
  return <span className="rounded border border-slate-600/40 bg-slate-700/20 px-2 py-0.5 text-[10px] uppercase tracking-widest text-slate-300">Closed</span>;
}

function StatChip({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "red" }) {
  const color = tone === "emerald" ? "text-emerald-300" : tone === "red" ? "text-red-300" : "text-slate-100";
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
