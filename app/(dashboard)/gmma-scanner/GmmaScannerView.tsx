"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { etoroLink, formatPrice } from "@/lib/format";
import { fireSetupNotification } from "@/lib/notifications";
import type { StrategySettings } from "@/lib/strategy";
import type { GmmaScanResponse, GmmaScanResult } from "@/lib/gmma-scanner";
import { BracketCell, EmptyState, SkeletonCards } from "../_components/setup-card";
import { useIsMobile } from "../_components/use-is-mobile";
import { GMMADetailPanel, GMMADetailDrawer } from "./GMMADetailPanel";

const LIMIT_OPTIONS = [10, 20, 50, 100] as const;

export function GmmaScannerView({ settings }: { settings: StrategySettings }) {
  const router = useRouter();
  const [limit, setLimit] = useState<number>(settings.scannerLimit);
  const [data, setData] = useState<GmmaScanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingTicker, setAddingTicker] = useState<string | null>(null);
  const [addedTickers, setAddedTickers] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<GmmaScanResult | null>(null);
  // Session-only total-capital override, seeded from saved settings. Changing it
  // recalculates sizing / P&L live but does not persist; reload resets to settings.
  const [totalCapital, setTotalCapital] = useState<number>(settings.totalCapital);

  const isMobile = useIsMobile();
  const refreshMinutes = Math.max(1, settings.refreshIntervalMinutes);
  const riskUsd = totalCapital * (settings.riskPerTradePct / 100);

  // Tracks which tickers we've already alerted on, so each setup notifies once.
  // Seeded silently on the first scan so opening the page doesn't blast every
  // current setup at once.
  const seenTickersRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  // The GMMA scanner always analyses the full universe — no index filtering.
  const filteredStocks = useMemo(() => data?.results ?? [], [data]);

  const fetchScan = useCallback(async (l: number, maxAgeSeconds: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/scan-gmma?limit=${l}&maxAgeSeconds=${maxAgeSeconds}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Scan failed (${res.status})`);
      }
      const json = (await res.json()) as GmmaScanResponse;
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

  async function onAdd(r: GmmaScanResult, tp: number, sl: number) {
    setAddingTicker(r.ticker);
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in.");
      const { error } = await supabase.from("user_trades").insert({
        user_id: userData.user.id,
        ticker: r.ticker,
        entry_price: r.close,
        target_tp: tp,
        target_sl: sl,
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

  // Keep the open detail panel in sync with refreshed data; close it if the
  // selected ticker drops out of the latest scan.
  useEffect(() => {
    if (!selected || !data) return;
    const fresh = data.results.find((r) => r.ticker === selected.ticker);
    if (!fresh) setSelected(null);
    else if (fresh !== selected) setSelected(fresh);
  }, [data, selected]);

  // Fire a browser notification for each setup that's new since the last scan.
  // Always keep the seen-set current (even when notifications are off) so toggling
  // it on mid-session doesn't replay setups that were already on screen.
  useEffect(() => {
    if (!data) return;
    const seen = seenTickersRef.current;

    if (!seededRef.current) {
      seededRef.current = true;
      data.results.forEach((r) => seen.add(r.ticker));
      return;
    }

    if (settings.notificationsEnabled) {
      for (const r of data.results) {
        if (seen.has(r.ticker)) continue;
        const shares = computeShares(riskUsd, r.close, r.targetSl, totalCapital);
        const slFee = feeAdjustedSl(r.targetSl, settings.brokerFeeUsd, shares);
        const tpFee = feeAdjustedTp(r.targetTp, settings.brokerFeeUsd, shares);
        const feeOk = feePlanValid(r.close, slFee);
        fireSetupNotification(
          {
            ticker: r.ticker,
            close: r.close,
            target: feeOk ? tpFee : r.targetTp,
            stop: feeOk ? slFee : r.targetSl,
            shares,
          },
          () => setSelected(r),
        );
      }
    }

    data.results.forEach((r) => seen.add(r.ticker));
  }, [data, settings.notificationsEnabled, settings.brokerFeeUsd, riskUsd, totalCapital]);

  const detailOpen = selected !== null;
  const selectedShares = selected
    ? computeShares(riskUsd, selected.close, selected.targetSl, totalCapital)
    : 0;
  const selectedTp = selected
    ? feeAdjustedTp(selected.targetTp, settings.brokerFeeUsd, selectedShares)
    : 0;
  const selectedSlFee = selected
    ? feeAdjustedSl(selected.targetSl, settings.brokerFeeUsd, selectedShares)
    : 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-emerald-400">
            GMMA Momentum Report
          </p>
          <h1 className="mt-2 text-xl font-semibold text-slate-50 sm:text-2xl">
            Guppy Dual Ribbon (3–15 / 30–60) + Awesome Oscillator
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            SL at real support · strict 1:2 TP, kept only when it&rsquo;s reachable below the recent resistance. Position size is computed for your{" "}
            <span className="text-emerald-300">{settings.riskPerTradePct.toFixed(2)}% risk</span> per trade on a{" "}
            <span className="text-emerald-300">${totalCapital.toLocaleString()}</span> account.
            {settings.brokerFeeUsd > 0 && (
              <>
                {" "}TP targets include your{" "}
                <span className="text-emerald-300">${settings.brokerFeeUsd.toFixed(2)}</span> broker fee.
              </>
            )}
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
          <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-slate-400">
            Capital&nbsp;$
            <input
              type="number"
              min={0}
              step="100"
              value={totalCapital}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setTotalCapital(Number.isFinite(v) && v >= 0 ? v : 0);
              }}
              aria-label="Total capital (USD)"
              title="Total capital — overrides Settings for this session only"
              className="w-28 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-emerald-400"
            />
          </label>
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

      <TpSlExplainer />

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Results — decision-card first, with a slide-in detail panel on desktop */}
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
                Scanning ~2,500 tickers for the GMMA fan + AO trigger — this can take 5–10 seconds…
              </p>
              <SkeletonCards detailOpen={detailOpen} />
            </div>
          ) : data && filteredStocks.length === 0 ? (
            <EmptyState
              title="No clean setups today"
              actionLabel="Check your watchlist →"
              onAction={() => router.push("/watchlist")}
              onRefresh={() => fetchScan(limit, 1)}
              refreshing={loading}
            >
              We scanned{" "}
              <span className="font-mono text-slate-200">
                {(data.count + data.skipped).toLocaleString()}
              </span>{" "}
              tickers and none cleared all three GMMA filters today. That&rsquo;s the strategy doing
              its job — it stays patient when the market isn&rsquo;t offering high-probability,
              reachable 1:2 setups. Quiet days are completely normal: across the whole universe the
              scanner averages only about{" "}
              <span className="font-mono text-slate-200">0.5 setups a day</span>, so seeing zero is
              expected more often than not.
            </EmptyState>
          ) : (
            <div
              className={`grid gap-3 ${
                detailOpen ? "grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-3"
              }`}
            >
              {filteredStocks.map((r) => {
                const shares = computeShares(riskUsd, r.close, r.targetSl, totalCapital);
                const tpFee = feeAdjustedTp(r.targetTp, settings.brokerFeeUsd, shares);
                const slFee = feeAdjustedSl(r.targetSl, settings.brokerFeeUsd, shares);
                const feeOk = feePlanValid(r.close, slFee);
                return (
                  <DecisionCard
                    key={r.ticker}
                    r={r}
                    shares={shares}
                    stop={feeOk ? slFee : r.targetSl}
                    target={feeOk ? tpFee : r.targetTp}
                    selected={selected?.ticker === r.ticker}
                    added={addedTickers.has(r.ticker)}
                    adding={addingTicker === r.ticker}
                    onSelect={() => setSelected(r)}
                    onAdd={() =>
                      onAdd(r, feeOk ? tpFee : r.targetTp, feeOk ? slFee : r.targetSl)
                    }
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Desktop detail panel — sticky beside the cards (page keeps scrolling) */}
        {selected && !isMobile && (
          <div className="w-[42%] flex-shrink-0">
            <GMMADetailPanel
              key={selected.ticker}
              row={selected}
              shares={selectedShares}
              targetTp={selectedTp}
              slFee={selectedSlFee}
              feeUsd={settings.brokerFeeUsd}
              onClose={() => setSelected(null)}
            />
          </div>
        )}
      </div>

      {/* Mobile slide-in drawer — only mounted on mobile, so its body-scroll lock
          never fires on desktop. */}
      {selected && isMobile && (
        <GMMADetailDrawer
          key={selected.ticker}
          row={selected}
          shares={selectedShares}
          targetTp={selectedTp}
          slFee={selectedSlFee}
          feeUsd={settings.brokerFeeUsd}
          onClose={() => setSelected(null)}
        />
      )}

      <p className="text-xs text-slate-500">
        Position sizing uses your{" "}
        <span className="text-emerald-400">${totalCapital.toLocaleString()}</span> capital ×{" "}
        <span className="text-emerald-400">{settings.riskPerTradePct.toFixed(2)}%</span> per trade
        (= ${riskUsd.toFixed(2)} risk / trade), capped at what your capital can buy
        (fractional shares). TP targets are raised by{" "}
        <span className="text-emerald-400">${settings.brokerFeeUsd.toFixed(2)}</span> ÷ shares so wins
        net 2:1 after broker fees. Edit in{" "}
        <a href="/settings" className="text-emerald-400 hover:underline" onClick={(e) => { e.preventDefault(); router.push("/settings"); }}>Settings</a>.
      </p>
    </div>
  );
}

// ───────────────────────── Decision card ─────────────────────────
// Leads with the decision — ticker, buy price, the SL/TP/risk bracket, size and
// a one-tap add — and tucks the full math (EMAs, AO, fee math, chart) behind the
// detail panel via "Why →". The fee-covered SL/TP are shown when valid; otherwise
// the raw structural levels (the same logic the +Add button uses).
function DecisionCard({
  r,
  shares,
  stop,
  target,
  selected,
  added,
  adding,
  onSelect,
  onAdd,
}: {
  r: GmmaScanResult;
  shares: number;
  stop: number;
  target: number;
  selected: boolean;
  added: boolean;
  adding: boolean;
  onSelect: () => void;
  onAdd: () => void;
}) {
  const sizable = shares > 0;
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
            <span className="text-slate-500">~</span>
            <span className="font-mono text-slate-200">${formatPrice(r.close)}</span>
          </p>
        </div>
        <SharesBadge shares={shares} />
      </div>

      {/* The bracket — the decision essence */}
      <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-slate-800 bg-slate-800/70">
        <BracketCell label="Stop" value={`$${formatPrice(stop)}`} sub="−1R" tone="loss" />
        <BracketCell label="Target" value={`$${formatPrice(target)}`} sub="+2R" tone="gain" />
        <BracketCell
          label="Risk/sh"
          value={`$${formatPrice(r.riskPerShare)}`}
          sub={`1:${r.rrRatio}`}
          tone="neutral"
        />
      </div>

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onAdd}
          disabled={adding || added || !sizable}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
            added
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {added
            ? "✓ Added to Portfolio"
            : adding
              ? "Adding…"
              : sizable
                ? "+ Add to Portfolio"
                : "Position too small"}
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

// eToro supports fractional shares: size by risk, capped by what the capital
// can actually buy. Rounded down to 2 decimals so neither limit is exceeded.
function computeShares(riskUsd: number, entry: number, stop: number, capitalUsd: number): number {
  const perShare = entry - stop;
  if (perShare <= 0 || riskUsd <= 0 || entry <= 0) return 0;
  const shares = Math.min(riskUsd / perShare, capitalUsd / entry);
  return Math.floor(shares * 100) / 100;
}

// Raise the TP by the round-trip broker fee spread across the position, so a win
// covers the commission first and still nets 2x the risked amount.
function feeAdjustedTp(targetTp: number, feeUsd: number, shares: number): number {
  if (shares <= 0 || feeUsd <= 0) return targetTp;
  return Math.round((targetTp + feeUsd / shares) * 100) / 100;
}

// Raise the SL by the same per-share fee. A slightly tighter stop means the
// price loss plus the round-trip fee equals exactly the risked amount — so paired
// with feeAdjustedTp the trade nets a TRUE 1:2 after commissions.
function feeAdjustedSl(targetSl: number, feeUsd: number, shares: number): number {
  if (shares <= 0 || feeUsd <= 0) return targetSl;
  return Math.round((targetSl + feeUsd / shares) * 100) / 100;
}

// The fee-covered plan only exists when the per-share fee is smaller than the
// risk — otherwise the fee-adjusted stop would sit at or above the entry.
function feePlanValid(entry: number, slFee: number): boolean {
  return slFee < entry;
}

function SharesBadge({ shares }: { shares: number }) {
  if (shares <= 0) {
    return (
      <span className="inline-flex items-center rounded border border-slate-700 bg-slate-800/40 px-2 py-0.5 font-mono text-xs text-slate-400">
        n/a
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-end rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-right">
      <span className="font-mono text-sm font-semibold leading-none text-emerald-300">
        {Number.isInteger(shares) ? shares : shares.toFixed(2)}
      </span>
      <span className="mt-0.5 font-mono text-[8px] uppercase tracking-widest text-emerald-500/70">
        shares
      </span>
    </span>
  );
}

// Collapsible worked example explaining how the structural SL/TP (and their
// fee-covered variants) are derived. Numbers are illustrative, not live.
function TpSlExplainer() {
  return (
    <details className="group rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-slate-200">
        <span className="font-medium">
          How are TP / SL — and the fee-covered versions — calculated?
        </span>
        <span aria-hidden className="font-mono text-xs text-slate-500 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>

      <div className="mt-4 space-y-4 text-slate-400">
        <p>
          <span className="text-slate-200">SL on real support, TP at a strict 1:2 that&rsquo;s reachable.</span>{" "}
          The <strong>SL</strong> sits just below the recent <em>support</em> (pullback low) — a real
          level. The <strong>TP</strong> is a strict <strong>1:2</strong> (entry + 2×risk), but the
          setup is only kept if that TP lands <em>below</em> the recent <em>resistance</em> — a price
          the stock already traded — so it&rsquo;s reachable, not beyond a wall. The fee-covered prices
          then shift both levels by the per-share fee so the 1:2 also holds on the actual dollars.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px] font-mono text-xs tabular-nums">
            <tbody className="[&_td]:py-1 [&_td:first-child]:text-slate-500">
              <tr><td>Entry (close)</td><td className="text-slate-200">$100.00</td><td className="text-slate-500">— today&rsquo;s price</td></tr>
              <tr><td>ATR(14)</td><td className="text-slate-200">$4.00</td><td className="text-slate-500">for the buffers</td></tr>
              <tr><td>Support (10-bar low)</td><td className="text-slate-200">$97.00</td><td className="text-slate-500">anchors the SL</td></tr>
              <tr><td>Resistance (20-bar high)</td><td className="text-slate-200">$112.00</td><td className="text-slate-500">reachability gate</td></tr>
              <tr><td>Capital × risk%</td><td className="text-slate-200">$12,600 × 1% = $126</td><td className="text-slate-500">risk budget</td></tr>
              <tr><td>Broker fee</td><td className="text-slate-200">$2.00</td><td className="text-slate-500">round trip</td></tr>
            </tbody>
          </table>
        </div>

        <ol className="list-decimal space-y-1.5 pl-5 font-mono text-xs leading-relaxed">
          <li><span className="text-slate-300">SL</span> = support − 0.3×ATR = 97 − 1.2 = <span className="text-red-300">$95.80</span> &nbsp;(risk = $4.20/sh)</li>
          <li><span className="text-slate-300">TP</span> = entry + 2×risk = 100 + 8.40 = <span className="text-emerald-300">$108.40</span> &nbsp;(strict 1:2)</li>
          <li><span className="text-slate-300">Reachable?</span> TP $108.40 ≤ resistance − 0.25×ATR = 112 − 1.0 = $111 &nbsp;<span className="text-emerald-400">✓ kept</span></li>
          <li><span className="text-slate-300">Shares</span> = min(126 ÷ 4.20, 12600 ÷ 100) = <span className="text-slate-200">30</span></li>
          <li><span className="text-slate-300">Fee / share</span> = $2 ÷ 30 = <span className="text-slate-200">$0.07</span></li>
          <li><span className="text-slate-300">TP(fee)</span> = 108.40 + 0.07 = <span className="text-emerald-300">$108.47</span>; <span className="text-slate-300">SL(fee)</span> = 95.80 + 0.07 = <span className="text-red-300">$95.87</span></li>
        </ol>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">No-fee levels ($108.40 / $95.80)</p>
            <dl className="mt-2 space-y-1 font-mono text-xs tabular-nums">
              <div className="flex justify-between"><dt>If TP hit</dt><dd className="text-emerald-300">+$250</dd></div>
              <div className="flex justify-between"><dt>If SL hit</dt><dd className="text-red-300">−$128</dd></div>
            </dl>
            <p className="mt-2 text-[11px] text-slate-500">≈ 1.95 : 1 — the flat fee tilts it.</p>
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-500/80">Fee-covered ($108.47 / $95.87)</p>
            <dl className="mt-2 space-y-1 font-mono text-xs tabular-nums">
              <div className="flex justify-between"><dt>If TP hit</dt><dd className="text-emerald-300">+$252</dd></div>
              <div className="flex justify-between"><dt>If SL hit</dt><dd className="text-red-300">−$126</dd></div>
            </dl>
            <p className="mt-2 text-[11px] text-emerald-300/80">= exactly 2 : 1, net of fees.</p>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-slate-500">
          The fee-covered plan makes your net loss equal your budgeted risk ($126 = 1%) and your net
          win exactly 2× ($252), so the 1:2 survives commissions. If the strict 1:2 TP would land{" "}
          <em>above</em> the recent resistance, the setup is skipped — that target isn&rsquo;t realistically
          reachable. And if a position is so small that the per-share fee exceeds the risk, the
          fee-covered plan can&rsquo;t exist — size up so a flat fee stays negligible.
        </p>
      </div>
    </details>
  );
}
