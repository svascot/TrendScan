"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { computePositionShares, computeTpSl, type StrategySettings } from "@/lib/strategy";
import { etoroLink, formatPrice } from "@/lib/format";
import type { ScanResult } from "@/lib/scanner";
import { BracketCell, EmptyState, SkeletonCards } from "../_components/setup-card";
import { useIsMobile } from "../_components/use-is-mobile";
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
  const [selected, setSelected] = useState<ScanResult | null>(null);
  const [reloading, setReloading] = useState(false);

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

  const isMobile = useIsMobile();

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

      {/* ───────── Sticky glassmorphism control bar ───────── */}
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

      {/* ───────── Results — decision cards + slide-in detail panel ───────── */}
      <div className="flex items-start gap-5">
        <div
          className={`min-w-0 transition-all duration-300 ease-out ${
            detailOpen ? "w-full md:w-[58%]" : "w-full"
          }`}
        >
          {loading && !data ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <span
                  aria-hidden
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-400"
                />
                Scanning ~2,500 tickers against four hard filters — this can take 5–10 seconds…
              </p>
              <SkeletonCards detailOpen={detailOpen} />
            </div>
          ) : data && filteredStocks.length === 0 ? (
            <EmptyState
              title="No setups today"
              actionLabel="Check your watchlist →"
              onAction={() => router.push("/watchlist")}
              onRefresh={() => fetchScan(limit, 1)}
              refreshing={loading}
            >
              We scanned{" "}
              <span className="font-mono text-slate-200">
                {(data.count + data.skipped).toLocaleString()}
              </span>{" "}
              tickers and none passed all four momentum filters today. The market may be
              overextended or consolidating — re-check tomorrow, or keep an eye on your watchlist.
            </EmptyState>
          ) : (
            <div
              className={`grid gap-3 ${
                detailOpen ? "grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-3"
              }`}
            >
              {filteredStocks.map((r) => {
                const { targetTp, targetSl } = computeTpSl(r.close, settings);
                const shares = computePositionShares(r.close, settings);
                return (
                  <ScannerCard
                    key={r.ticker}
                    r={r}
                    targetTp={targetTp}
                    targetSl={targetSl}
                    shares={shares}
                    settings={settings}
                    flash={flashes.get(r.ticker)}
                    selected={selected?.ticker === r.ticker}
                    added={addedTickers.has(r.ticker)}
                    adding={addingTicker === r.ticker}
                    onSelect={() => setSelected(r)}
                    onAdd={() => onAdd(r)}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Desktop detail panel — sticky beside the cards (page keeps scrolling) */}
        {selected && !isMobile && (
          <div className="w-[42%] flex-shrink-0">
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

      {/* Mobile detail — full-screen audit sheet, only mounted on mobile so its
          body-scroll lock never fires on desktop. */}
      {selected && isMobile && (
        <SetupAuditModal
          row={selected}
          settings={settings}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ───────────────────────── Decision card (classic) ─────────────────────────
// Leads with the ticker, buy price and momentum tier, then the TP/SL/size
// bracket; the full factor breakdown + chart live behind "Why →" (the detail
// panel on desktop, the audit sheet on mobile).
function ScannerCard({
  r,
  targetTp,
  targetSl,
  shares,
  settings,
  flash,
  selected,
  added,
  adding,
  onSelect,
  onAdd,
}: {
  r: ScanResult;
  targetTp: number;
  targetSl: number;
  shares: number;
  settings: StrategySettings;
  flash?: FlashDir;
  selected: boolean;
  added: boolean;
  adding: boolean;
  onSelect: () => void;
  onAdd: () => void;
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      aria-selected={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`group relative cursor-pointer overflow-hidden rounded-xl border p-4 transition-all duration-200 ${
        selected
          ? "border-emerald-500/50 bg-emerald-500/[0.06] ring-1 ring-emerald-500/20"
          : "border-slate-800 bg-slate-900/40 hover:border-emerald-500/30 hover:bg-slate-900/70"
      }`}
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-emerald-300 to-emerald-600 transition-opacity duration-200 ${
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-70"
        }`}
      />

      {/* Decision line */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <a
              href={etoroLink(r.ticker)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="font-mono text-lg font-bold tracking-tight text-slate-50 transition-colors hover:text-emerald-300"
            >
              {r.ticker}
            </a>
            {r.indices.map((ix) => (
              <span
                key={ix}
                className="rounded border border-slate-700 bg-slate-800/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-slate-400"
              >
                {ix === "sp500" ? "S&P 500" : "Nasdaq 100"}
              </span>
            ))}
          </div>
          <p className="mt-1 text-[13px] text-slate-400">
            <span className="font-semibold text-emerald-400">Buy</span>{" "}
            <span className="text-slate-500">~$</span>
            <PriceText value={r.close} flash={flash} className="text-[13px] text-slate-200" />
          </p>
        </div>
        <TierBadge score={r.score} tier={r.tier} />
      </div>

      {/* The bracket — target / stop / size */}
      <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-slate-800 bg-slate-800/70">
        <BracketCell
          label="Stop"
          value={`$${formatPrice(targetSl)}`}
          sub={`−${(settings.slPct * 100).toFixed(1)}%`}
          tone="loss"
        />
        <BracketCell
          label="Target"
          value={`$${formatPrice(targetTp)}`}
          sub={`+${(settings.tpPct * 100).toFixed(1)}%`}
          tone="gain"
        />
        <BracketCell label="Size" value={String(shares)} sub="shares" tone="neutral" />
      </div>

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onAdd}
          disabled={adding || added}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
            added
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {added ? "✓ Added to Portfolio" : adding ? "Adding…" : "+ Add to Portfolio"}
        </button>
        <button
          type="button"
          onClick={onSelect}
          className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 font-mono text-[11px] text-slate-400 transition hover:border-emerald-500/40 hover:text-emerald-300"
        >
          Why →
        </button>
      </div>
    </article>
  );
}

// Compact momentum-score badge, color-keyed to the tier.
function TierBadge({ score, tier }: { score: number; tier: "High" | "Med" | "Low" }) {
  const cls =
    tier === "High"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : tier === "Med"
        ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
        : "border-slate-600/40 bg-slate-700/30 text-slate-300";
  return (
    <span className={`inline-flex flex-col items-end rounded-lg border px-2.5 py-1 text-right ${cls}`}>
      <span className="font-mono text-sm font-semibold leading-none tabular-nums">
        {score.toFixed(1)}%
      </span>
      <span className="mt-0.5 font-mono text-[8px] uppercase tracking-widest opacity-80">
        {tier}
      </span>
    </span>
  );
}

/**
 * Numeric price with a brief directional tint on change. Tabular figures keep
 * the value from jittering; the 500ms color transition lets the green/red
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
