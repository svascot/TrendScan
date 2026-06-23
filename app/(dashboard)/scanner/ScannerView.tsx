"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { computePositionShares, computeTpSl, type StrategySettings } from "@/lib/strategy";
import { etoroLink, formatPrice } from "@/lib/format";
import type { ScanResult } from "@/lib/scanner";
import { SetupAuditModal } from "./SetupAuditModal";
import { SetupDetailPanel } from "./SetupDetailPanel";

interface ScanResponse {
  generatedAt: string;
  count: number;
  rule: { rsiLow: number; rsiHigh: number; maShort: number; maLong: number };
  risk: string;
  results: ScanResult[];
  skipped: number;
}

type Density = "comfortable" | "compact";
type FlashDir = "up" | "down";

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
  const [selected, setSelected] = useState<ScanResult | null>(null);
  const [reloading, setReloading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [density, setDensity] = useState<Density>("comfortable");

  // Live price-flash tracking: remember the last close we rendered per ticker so
  // a refresh can briefly tint the number green (up) or red (down) before easing
  // back to neutral — the institutional "tape" effect, no harsh blinking.
  const prevPricesRef = useRef<Map<string, number>>(new Map());
  const [flashes, setFlashes] = useState<Map<string, FlashDir>>(new Map());

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

  // The scanner always analyses the full universe — no index filtering.
  const filteredStocks = useMemo(() => data?.results ?? [], [data]);

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

  // Diff incoming closes against the previous render → drive the price-flash tint.
  useEffect(() => {
    if (!data) return;
    const prev = prevPricesRef.current;
    const next = new Map<string, FlashDir>();
    for (const r of data.results) {
      const last = prev.get(r.ticker);
      if (last !== undefined && last !== r.close) {
        next.set(r.ticker, r.close > last ? "up" : "down");
      }
      prev.set(r.ticker, r.close);
    }
    if (next.size === 0) return;
    setFlashes(next);
    const id = setTimeout(() => setFlashes(new Map()), 450);
    return () => clearTimeout(id);
  }, [data]);

  // Keep the open detail panel in sync with refreshed data (live price/score).
  useEffect(() => {
    if (!selected || !data) return;
    const fresh = data.results.find((r) => r.ticker === selected.ticker);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [data, selected]);

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

  const detailOpen = selected !== null;
  const rowPadY = density === "compact" ? "py-2.5" : "py-3.5";

  return (
    <div className="space-y-5">
      {/* ───────── Title block (scrolls away) ───────── */}
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-emerald-400">
          Daily Scanner Report
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">
          Market Universe: ~2,500 Liquid US Stocks &amp; ETFs
        </h1>
        <p className="text-sm text-slate-400">
          Showing the absolute highest-ranked mathematical setups.
        </p>
      </header>

      {/* ───────── Sticky glassmorphism control bar ─────────
          Bleeds to the column edges via -mx and re-pads its content, so the
          translucent macOS-style layer spans the full width when pinned. */}
      <div className="sticky top-[68px] z-30 -mx-4 border-b border-slate-900 bg-slate-950/75 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex min-h-[20px] items-center gap-2 text-xs">
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                loading ? "animate-pulse bg-emerald-400" : "bg-emerald-500/60"
              }`}
            />
            {generated ? (
              <span className="text-slate-400">
                <span className={loading ? "text-emerald-300" : "text-slate-300"}>
                  {loading ? "Refreshing…" : `Updated ${generated}`}
                </span>
                <span className="ml-2 hidden text-slate-600 sm:inline">
                  · auto every {settings.refreshIntervalMinutes} min
                </span>
              </span>
            ) : (
              <span className="text-slate-500">Initializing scanner…</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <DensityToggle value={density} onChange={setDensity} />

            <select
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value, 10))}
              aria-label="Number of setups to show"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 outline-none transition focus:border-emerald-400"
            >
              {LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>Top {n}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={hardReload}
              disabled={reloading}
              aria-label="Hard reload (bypass cache)"
              title="Hard reload (bypass cache)"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 text-slate-400 transition hover:border-emerald-500/40 hover:text-emerald-300 disabled:opacity-60"
            >
              <RefreshIcon className={`h-4 w-4 ${reloading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* ───────── Mobile card layout — progressive disclosure ───────── */}
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
                  <PriceText value={r.close} flash={flashes.get(r.ticker)} className="text-base" />
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

      {/* ───────── Desktop master-detail split (md+) ───────── */}
      <div className="hidden md:flex md:items-start md:gap-5">
        <div
          className={`min-w-0 transition-all duration-300 ease-spring ${
            detailOpen ? "md:w-[63%]" : "md:w-full"
          }`}
        >
          <div className="overflow-hidden rounded-2xl border border-slate-800/60 bg-panel/50 shadow-panel">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800/70 bg-slate-950/50 text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Ticker</th>
                  <th className="px-4 py-3 text-right font-medium">Price</th>
                  <th className="px-4 py-3 text-right font-medium">Momentum Score</th>
                  {!detailOpen && (
                    <>
                      <th className="px-4 py-3 text-right font-medium">Target TP</th>
                      <th className="px-4 py-3 text-right font-medium">Target SL</th>
                    </>
                  )}
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
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
                        Running scanner across ~2,500 tickers — this can take 5–10 seconds…
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
                  const isSelected = selected?.ticker === r.ticker;
                  return (
                    <tr
                      key={r.ticker}
                      onClick={() => setSelected(r)}
                      aria-selected={isSelected}
                      className={`group cursor-pointer border-b border-slate-800/40 transition-colors last:border-b-0 ${
                        isSelected ? "bg-emerald-500/[0.06]" : "hover:bg-slate-800/20"
                      }`}
                    >
                      {/* First cell carries the surgical emerald hover/selection indicator */}
                      <td className={`relative px-4 ${rowPadY}`}>
                        <span
                          aria-hidden
                          className={`absolute left-0 top-1/2 h-[55%] w-[2px] -translate-y-1/2 rounded-full bg-emerald-400 transition-all duration-200 ${
                            isSelected
                              ? "opacity-100"
                              : "opacity-0 group-hover:opacity-100"
                          }`}
                        />
                        <a
                          href={etoroLink(r.ticker)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono font-semibold text-emerald-400 hover:underline"
                        >
                          {r.ticker}
                        </a>
                      </td>
                      <td className={`px-4 text-right ${rowPadY}`}>
                        <PriceText value={r.close} flash={flashes.get(r.ticker)} />
                      </td>
                      <td className={`px-4 text-right ${rowPadY}`}>
                        <ScoreCell score={r.score} tier={r.tier} />
                      </td>
                      {!detailOpen && (
                        <>
                          <td className={`px-4 text-right font-mono tabular-nums text-emerald-300 ${rowPadY}`}>
                            {formatPrice(targetTp)}
                          </td>
                          <td className={`px-4 text-right font-mono tabular-nums text-red-300 ${rowPadY}`}>
                            {formatPrice(targetSl)}
                          </td>
                        </>
                      )}
                      <td className={`px-4 text-right ${rowPadY}`}>
                        <div className="flex justify-end">
                          <span onClick={(e) => e.stopPropagation()}>
                            <AddButton
                              added={added}
                              adding={addingTicker === r.ticker}
                              onClick={() => onAdd(r)}
                            />
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right master-detail panel — slides in beside the list */}
        {selected && (
          <div className="hidden w-[37%] flex-shrink-0 md:block">
            <SetupDetailPanel
              key={selected.ticker}
              row={selected}
              settings={settings}
              onClose={() => setSelected(null)}
            />
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Trade setups calculated with your personal targets:{" "}
        <span className="text-emerald-400">+{(settings.tpPct * 100).toFixed(1)}% TP</span> /{" "}
        <span className="text-red-400">-{(settings.slPct * 100).toFixed(1)}% SL</span>. Edit in{" "}
        <a href="/settings" className="text-emerald-400 hover:underline" onClick={(e) => { e.preventDefault(); router.push("/settings"); }}>Settings</a>.
      </p>

      {/* Mobile-only intrusive sheet (desktop uses the master-detail panel) */}
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

function DensityToggle({
  value,
  onChange,
}: {
  value: Density;
  onChange: (d: Density) => void;
}) {
  const options: { key: Density; label: string }[] = [
    { key: "comfortable", label: "Comfortable" },
    { key: "compact", label: "Compact" },
  ];
  return (
    <div
      role="group"
      aria-label="Row density"
      className="hidden items-center rounded-lg border border-slate-800 bg-slate-950 p-0.5 lg:inline-flex"
    >
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.key)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              active
                ? "bg-slate-800 text-slate-100"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
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

/**
 * Numeric price with a brief directional tint on change. Tabular figures keep
 * the column from jittering; the 500ms color transition lets the green/red
 * flash decay smoothly back to neutral instead of hard-blinking.
 */
function PriceText({
  value,
  flash,
  className = "",
}: {
  value: number;
  flash?: FlashDir;
  className?: string;
}) {
  const color =
    flash === "up" ? "text-emerald-400" : flash === "down" ? "text-red-400" : "text-slate-100";
  return (
    <span className={`font-mono tabular-nums transition-colors duration-500 ${color} ${className}`}>
      {formatPrice(value)}
    </span>
  );
}

/**
 * Minimalist quick-add control. A thin Lucide-style plus that morphs into an
 * emerald confirmation badge once the position is staged.
 */
function AddButton({
  added,
  adding,
  onClick,
}: {
  added: boolean;
  adding: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={adding || added}
      aria-label={added ? "Added to portfolio" : "Add to portfolio"}
      className={`group/add inline-flex items-center gap-1.5 overflow-hidden rounded-lg border px-2.5 py-1 text-xs font-medium transition-all duration-300 ease-spring disabled:cursor-default ${
        added
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-slate-800 text-slate-400 hover:border-emerald-500/40 hover:text-emerald-300"
      }`}
    >
      {added ? (
        <CheckIcon className="h-3.5 w-3.5" />
      ) : adding ? (
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-slate-700 border-t-emerald-400"
        />
      ) : (
        <PlusIcon className="h-3.5 w-3.5" />
      )}
      <span>{added ? "Added" : adding ? "Adding" : "Add"}</span>
    </button>
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

function PlusIcon({ className = "" }: { className?: string }) {
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
      className={className}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
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
      className={className}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function RefreshIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
