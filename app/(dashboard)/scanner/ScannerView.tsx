"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { computePositionShares, computeTpSl, type StrategySettings } from "@/lib/strategy";
import { etoroLink, formatPrice } from "@/lib/format";
import type { ScanResult } from "@/lib/scanner";
import { SetupAuditModal } from "./SetupAuditModal";

interface ScanResponse {
  generatedAt: string;
  count: number;
  rule: { rsiLow: number; rsiHigh: number; maShort: number; maLong: number };
  risk: string;
  results: ScanResult[];
  skipped: number;
}

const LIMIT_OPTIONS = [10, 20, 50, 100] as const;

export function ScannerView({ settings }: { settings: StrategySettings }) {
  const router = useRouter();
  const [limit, setLimit] = useState<number>(settings.scannerLimit);
  const [data, setData] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingTicker, setAddingTicker] = useState<string | null>(null);
  const [addedTickers, setAddedTickers] = useState<Set<string>>(new Set());
  const [auditRow, setAuditRow] = useState<ScanResult | null>(null);
  const [filters, setFilters] = useState({ sp500: true, nasdaq100: true });
  const [reloading, setReloading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function hardReload() {
    if (reloading) return;
    setReloading(true);
    try {
      await fetch("/api/scan/bust", { method: "POST", cache: "no-store" });
    } catch {
      // ignore — still proceed with reload
    }
    window.location.reload();
  }

  const toggleFilter = (key: "sp500" | "nasdaq100") => {
    setFilters((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next.sp500 && !next.nasdaq100) return prev;
      return next;
    });
  };

  const filteredStocks = useMemo(() => {
    if (!data) return [];
    return data.results.filter((stock) => {
      if (filters.sp500 && stock.indices.includes("sp500")) return true;
      if (filters.nasdaq100 && stock.indices.includes("nasdaq100")) return true;
      return false;
    });
  }, [data, filters]);

  const refreshMinutes = Math.max(1, settings.refreshIntervalMinutes);

  const fetchScan = useCallback(async (l: number, maxAgeSeconds: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/scan?limit=${l}&maxAgeSeconds=${maxAgeSeconds}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Scan failed (${res.status})`);
      }
      const json = (await res.json()) as ScanResponse;
      setData(json);
      const stamp = new Date(json.generatedAt).toLocaleString(undefined, {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
      console.log(`[TrendScan] Scanner list updated at ${stamp} — ${json.count} setups (top ${l}).`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScan(limit, refreshMinutes * 60);
  }, [limit, fetchScan, refreshMinutes]);

  useEffect(() => {
    const id = setInterval(() => {
      fetchScan(limit, refreshMinutes * 60);
    }, refreshMinutes * 60_000);
    return () => clearInterval(id);
  }, [limit, fetchScan, refreshMinutes]);

  async function onAdd(r: ScanResult) {
    setAddingTicker(r.ticker);
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in.");
      const { targetTp, targetSl } = computeTpSl(r.close, settings);
      const { error } = await supabase.from("user_trades").insert({
        user_id: userData.user.id,
        ticker: r.ticker,
        entry_price: r.close,
        target_tp: targetTp,
        target_sl: targetSl,
        status: "OPEN",
      });
      if (error) throw error;
      setAddedTickers((prev) => new Set(prev).add(r.ticker));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAddingTicker(null);
    }
  }

  const generated = useMemo(() => {
    if (!data) return null;
    const d = new Date(data.generatedAt);
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  }, [data]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-emerald-400">
            Daily Scanner Report
          </p>
          <h1 className="mt-2 text-xl font-semibold text-slate-50 sm:text-2xl">
            Market Universe: S&amp;P 500 &amp; Nasdaq 100
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Showing the absolute highest-ranked mathematical setups.
          </p>
          {generated && (
            <p className="mt-1 text-xs text-slate-500">
              <span className={loading ? "text-emerald-300" : ""}>
                {loading ? "Refreshing…" : `Last updated at ${generated}`}
              </span>
              <span className="ml-2 text-slate-600">
                · auto-refresh every {settings.refreshIntervalMinutes} min
              </span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={hardReload}
            disabled={reloading}
            aria-label="Hard reload (bypass cache)"
            title="Hard reload (bypass cache)"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-800 text-slate-300 transition hover:border-emerald-500/40 hover:text-emerald-300 disabled:opacity-60"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-4 w-4 ${reloading ? "animate-spin" : ""}`}
              aria-hidden
            >
              <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <IndexToggle
              label="S&P 500"
              active={filters.sp500}
              lastActive={filters.sp500 && !filters.nasdaq100}
              onClick={() => toggleFilter("sp500")}
            />
            <IndexToggle
              label="Nasdaq-100"
              active={filters.nasdaq100}
              lastActive={filters.nasdaq100 && !filters.sp500}
              onClick={() => toggleFilter("nasdaq100")}
            />
          </div>
          <label className="font-mono text-xs uppercase tracking-widest text-slate-400">
            Show
          </label>
          <select
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value, 10))}
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-emerald-400"
          >
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>Top {n}</option>
            ))}
          </select>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Mobile card layout — progressive disclosure */}
      <div className="space-y-3 md:hidden">
        {loading && !data && (
          <div className="rounded-2xl border border-hairline/60 bg-panel/50 px-4 py-10 text-center text-sm text-slate-400">
            <span className="inline-flex items-center gap-3">
              <span
                aria-hidden
                className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-400"
              />
              Running scanner…
            </span>
          </div>
        )}
        {!loading && data && filteredStocks.length === 0 && (
          <div className="rounded-2xl border border-hairline/60 bg-panel/50 px-4 py-10 text-center text-sm text-slate-400">
            No setups passed all four rules today. Re-check tomorrow.
          </div>
        )}
        {filteredStocks.map((r) => {
          const { targetTp, targetSl } = computeTpSl(r.close, settings);
          const shares = computePositionShares(r.close, settings);
          const added = addedTickers.has(r.ticker);
          const open = expanded === r.ticker;
          return (
            <article
              key={r.ticker}
              className={`overflow-hidden rounded-2xl border bg-panel/50 transition-colors ${
                open ? "border-emerald-500/30" : "border-hairline/60"
              }`}
            >
              {/* Tap target: header toggles the disclosure panel */}
              <button
                type="button"
                onClick={() => setExpanded(open ? null : r.ticker)}
                aria-expanded={open}
                className="flex w-full min-h-[44px] flex-col gap-2 px-4 py-3 text-left"
              >
                {/* Top line — ticker + current price */}
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-base font-semibold tracking-tight text-slate-50">
                    {r.ticker}
                  </span>
                  <span className="font-mono text-base tabular-nums text-slate-100">
                    {formatPrice(r.close)}
                  </span>
                </div>

                {/* Middle line — momentum badge + position size */}
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
                    <span className="font-mono tabular-nums">{r.score.toFixed(1)}%</span>
                    <span className="text-[10px] uppercase tracking-wider text-emerald-400/70">
                      {r.tier}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="font-mono tabular-nums text-slate-200">{shares}</span>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">shares</span>
                    <Chevron open={open} />
                  </span>
                </div>
              </button>

              {/* Expansion line — animated via grid-rows (no JS height measuring) */}
              <div
                className={`grid transition-all duration-300 ease-spring ${
                  open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="overflow-hidden">
                  <div className="border-t border-hairline/60 px-4 py-3">
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-[10px] uppercase tracking-widest text-slate-500">
                          Target TP
                        </dt>
                        <dd className="mt-1 font-mono tabular-nums text-emerald-300">
                          {formatPrice(targetTp)}
                        </dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-[10px] uppercase tracking-widest text-slate-500">
                          Target SL
                        </dt>
                        <dd className="mt-1 font-mono tabular-nums text-red-300">
                          {formatPrice(targetSl)}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-4 flex gap-2">
                      <a
                        href={etoroLink(r.ticker)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-hairline px-3 text-xs font-medium text-slate-300 transition-colors hover:border-emerald-400/50 hover:text-emerald-300"
                      >
                        eToro
                      </a>
                      <button
                        type="button"
                        onClick={() => setAuditRow(r)}
                        className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-hairline px-3 text-xs font-medium text-slate-300 transition-colors hover:border-emerald-400/50 hover:text-emerald-300"
                      >
                        Info
                      </button>
                      <button
                        type="button"
                        onClick={() => onAdd(r)}
                        disabled={addingTicker === r.ticker || added}
                        className={`flex min-h-[44px] flex-1 items-center justify-center rounded-xl px-3 text-xs font-semibold transition-colors ${
                          added
                            ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                        } disabled:opacity-60`}
                      >
                        {added ? "Added" : addingTicker === r.ticker ? "Adding…" : "+ Add"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Desktop table layout */}
      <div className="hidden overflow-hidden rounded-2xl border border-hairline/60 bg-panel/50 shadow-panel md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-hairline/70 bg-slate-950/50 text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3">Ticker</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-right">Momentum Score</th>
              <th className="px-4 py-3 text-right">Target TP</th>
              <th className="px-4 py-3 text-right">Target SL</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                  <span className="inline-flex items-center gap-3">
                    <span
                      aria-hidden
                      className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-400"
                    />
                    Running scanner across ~600 tickers — this can take 5–10 seconds…
                  </span>
                </td>
              </tr>
            )}
            {!loading && data && filteredStocks.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                  No setups passed all four rules today. The market may be overextended or
                  consolidating. Re-check tomorrow.
                </td>
              </tr>
            )}
            {filteredStocks.map((r) => {
              const { targetTp, targetSl } = computeTpSl(r.close, settings);
              const added = addedTickers.has(r.ticker);
              return (
                <tr key={r.ticker} className="border-b border-hairline/50 last:border-b-0 hover:bg-slate-800/20">
                  <td className="px-4 py-3">
                    <a
                      href={etoroLink(r.ticker)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono font-semibold text-emerald-400 hover:underline"
                    >
                      {r.ticker}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-100">{formatPrice(r.close)}</td>
                  <td className="px-4 py-3 text-right">
                    <ScoreCell score={r.score} tier={r.tier} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-300">{formatPrice(targetTp)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-red-300">{formatPrice(targetSl)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setAuditRow(r)}
                        className="rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:border-emerald-400 hover:text-emerald-300"
                      >
                        Info
                      </button>
                      <button
                        type="button"
                        onClick={() => onAdd(r)}
                        disabled={addingTicker === r.ticker || added}
                        className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                          added
                            ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border border-emerald-500/40 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                        } disabled:opacity-60`}
                      >
                        {added ? "Added" : addingTicker === r.ticker ? "Adding…" : "+ Add"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Trade setups calculated with your personal targets:{" "}
        <span className="text-emerald-400">+{(settings.tpPct * 100).toFixed(1)}% TP</span> /{" "}
        <span className="text-red-400">-{(settings.slPct * 100).toFixed(1)}% SL</span>. Edit in{" "}
        <a href="/settings" className="text-emerald-400 hover:underline" onClick={(e) => { e.preventDefault(); router.push("/settings"); }}>Settings</a>.
      </p>

      {auditRow && (
        <SetupAuditModal
          row={auditRow}
          settings={settings}
          onClose={() => setAuditRow(null)}
        />
      )}
    </div>
  );
}

function IndexToggle({
  label,
  active,
  lastActive,
  onClick,
}: {
  label: string;
  active: boolean;
  lastActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-disabled={lastActive}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition ${
        active
          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
          : "border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-600 hover:text-slate-200"
      } ${lastActive ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${active ? "bg-emerald-500" : "bg-slate-600"}`}
      />
      {label}
    </button>
  );
}

function ScoreCell({ score, tier }: { score: number; tier: "High" | "Med" | "Low" }) {
  const color =
    tier === "High" ? "text-emerald-400" : tier === "Med" ? "text-amber-300" : "text-slate-400";
  const badge =
    tier === "High"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : tier === "Med"
      ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
      : "border-slate-600/40 bg-slate-700/30 text-slate-300";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`font-mono font-semibold tabular-nums ${color}`}>{score.toFixed(1)}%</span>
      <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${badge}`}>
        {tier}
      </span>
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`h-4 w-4 text-slate-500 transition-transform duration-300 ease-spring ${
        open ? "rotate-180" : ""
      }`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
