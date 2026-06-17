"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { etoroLink, formatPrice } from "@/lib/format";
import type { StrategySettings } from "@/lib/strategy";
import type { GmmaScanResponse, GmmaScanResult } from "@/lib/gmma-scanner";
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
  const [filters, setFilters] = useState({ sp500: true, nasdaq100: true });
  const [selected, setSelected] = useState<GmmaScanResult | null>(null);
  // Session-only total-capital override, seeded from saved settings. Changing it
  // recalculates sizing / P&L live but does not persist; reload resets to settings.
  const [totalCapital, setTotalCapital] = useState<number>(settings.totalCapital);

  const refreshMinutes = Math.max(1, settings.refreshIntervalMinutes);
  const riskUsd = totalCapital * (settings.riskPerTradePct / 100);

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

      {/* Mobile card layout */}
      <div className="space-y-3 md:hidden">
        {loading && !data && <LoadingCard />}
        {!loading && data && filteredStocks.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-10 text-center text-sm text-slate-400">
            No tickers matched the GMMA fan + AO trigger today.
          </div>
        )}
        {filteredStocks.map((r) => {
          const shares = computeShares(riskUsd, r.close, r.targetSl, totalCapital);
          const tpFee = feeAdjustedTp(r.targetTp, settings.brokerFeeUsd, shares);
          const slFee = feeAdjustedSl(r.targetSl, settings.brokerFeeUsd, shares);
          const feeOk = feePlanValid(r.close, slFee);
          const added = addedTickers.has(r.ticker);
          return (
            <article
              key={r.ticker}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(r)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(r);
                }
              }}
              className="cursor-pointer rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition-colors hover:border-emerald-500/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <a
                    href={etoroLink(r.ticker)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="font-mono text-lg font-semibold text-emerald-400 hover:underline"
                  >
                    {r.ticker}
                  </a>
                  <p className="mt-0.5 font-mono text-sm text-slate-100">{formatPrice(r.close)}</p>
                </div>
                <SharesBadge shares={shares} />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-800/60 pt-3 text-sm">
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    TP (no fee)
                  </dt>
                  <dd className="mt-1 font-mono text-slate-300">${formatPrice(r.targetTp)}</dd>
                </div>
                <div className="text-right">
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    TP (fee)
                  </dt>
                  <dd className="mt-1 font-mono text-emerald-300">${formatPrice(tpFee)}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    SL (no fee)
                  </dt>
                  <dd className="mt-1 font-mono text-red-300">${formatPrice(r.targetSl)}</dd>
                </div>
                <div className="text-right">
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    SL (fee)
                  </dt>
                  <dd className="mt-1 font-mono text-red-300">{feeOk ? `$${formatPrice(slFee)}` : "—"}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Risk / Share
                  </dt>
                  <dd className="mt-1 font-mono text-slate-200">${formatPrice(r.riskPerShare)}</dd>
                </div>
                <div className="text-right">
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    R:R
                  </dt>
                  <dd className="mt-1 font-mono text-slate-200">1:{r.rrRatio}</dd>
                </div>
              </dl>

              <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() =>
                    onAdd(r, feeOk ? tpFee : r.targetTp, feeOk ? slFee : r.targetSl)
                  }
                  disabled={addingTicker === r.ticker || added || shares <= 0}
                  className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition ${
                    added
                      ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border border-emerald-500/40 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                  } disabled:opacity-60`}
                >
                  {added ? "Added" : addingTicker === r.ticker ? "Adding…" : "+ Add"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {/* Desktop master-detail split (md+) */}
      <div className="hidden md:flex md:items-start md:gap-5">
        <div
          className={`min-w-0 transition-all duration-300 ease-out ${
            detailOpen ? "md:w-[60%]" : "md:w-full"
          }`}
        >
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Ticker</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  {!detailOpen && (
                    <>
                      <th className="px-4 py-3 text-right">TP (no fee)</th>
                      <th className="px-4 py-3 text-right">TP (fee)</th>
                      <th className="px-4 py-3 text-right">SL (no fee)</th>
                      <th className="px-4 py-3 text-right">SL (fee)</th>
                      <th className="px-4 py-3 text-right">Risk / Share</th>
                    </>
                  )}
                  <th className="px-4 py-3 text-right">Size (Shares)</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data && (
                  <tr>
                    <td colSpan={detailOpen ? 4 : 9} className="px-4 py-12 text-center text-slate-400">
                      <span className="inline-flex items-center gap-3">
                        <span
                          aria-hidden
                          className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-400"
                        />
                        Running GMMA scanner across ~600 tickers — this can take 5–10 seconds…
                      </span>
                    </td>
                  </tr>
                )}
                {!loading && data && filteredStocks.length === 0 && (
                  <tr>
                    <td colSpan={detailOpen ? 4 : 9} className="px-4 py-12 text-center text-slate-400">
                      No tickers matched the GMMA fan + AO trigger today.
                    </td>
                  </tr>
                )}
                {filteredStocks.map((r) => {
                  const shares = computeShares(riskUsd, r.close, r.targetSl, totalCapital);
                  const tpFee = feeAdjustedTp(r.targetTp, settings.brokerFeeUsd, shares);
                  const slFee = feeAdjustedSl(r.targetSl, settings.brokerFeeUsd, shares);
                  const feeOk = feePlanValid(r.close, slFee);
                  const added = addedTickers.has(r.ticker);
                  const isSelected = selected?.ticker === r.ticker;
                  return (
                    <tr
                      key={r.ticker}
                      onClick={() => setSelected(r)}
                      aria-selected={isSelected}
                      className={`group cursor-pointer border-b border-slate-800/60 transition-colors last:border-b-0 ${
                        isSelected ? "bg-emerald-500/[0.06]" : "hover:bg-slate-800/30"
                      }`}
                    >
                      <td className="relative px-4 py-3">
                        <span
                          aria-hidden
                          className={`absolute left-0 top-1/2 h-[55%] w-[2px] -translate-y-1/2 rounded-full bg-emerald-400 transition-all duration-200 ${
                            isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
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
                      <td className="px-4 py-3 text-right font-mono text-slate-100">${formatPrice(r.close)}</td>
                      {!detailOpen && (
                        <>
                          <td className="px-4 py-3 text-right font-mono text-slate-300">${formatPrice(r.targetTp)}</td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-300">${formatPrice(tpFee)}</td>
                          <td className="px-4 py-3 text-right font-mono text-red-300">${formatPrice(r.targetSl)}</td>
                          <td className="px-4 py-3 text-right font-mono text-red-300">{feeOk ? `$${formatPrice(slFee)}` : "—"}</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-300">${formatPrice(r.riskPerShare)}</td>
                        </>
                      )}
                      <td className="px-4 py-3 text-right">
                        <SharesBadge shares={shares} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <span onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() =>
                                onAdd(r, feeOk ? tpFee : r.targetTp, feeOk ? slFee : r.targetSl)
                              }
                              disabled={addingTicker === r.ticker || added || shares <= 0}
                              className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                                added
                                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                  : "border border-emerald-500/40 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                              } disabled:opacity-60`}
                            >
                              {added ? "Added" : addingTicker === r.ticker ? "Adding…" : "+ Add"}
                            </button>
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
          <div className="hidden w-[40%] flex-shrink-0 md:block">
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

      {/* Mobile slide-in drawer */}
      {selected && (
        <div className="md:hidden">
          <GMMADetailDrawer
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

function LoadingCard() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-10 text-center text-sm text-slate-400">
      <span className="inline-flex items-center gap-3">
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-400"
        />
        Running GMMA scanner…
      </span>
    </div>
  );
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
    <span className="inline-flex items-center rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-300">
      {Number.isInteger(shares) ? shares : shares.toFixed(2)}
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
