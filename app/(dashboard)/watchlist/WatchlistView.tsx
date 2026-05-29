"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { computeTpSl, type StrategySettings } from "@/lib/strategy";
import { etoroLink, formatPrice } from "@/lib/format";
import type { ScanResult } from "@/lib/scanner";
import { SetupAuditModal } from "../scanner/SetupAuditModal";

interface ScanResponse {
  generatedAt: string;
  count: number;
  rule: { rsiLow: number; rsiHigh: number; maShort: number; maLong: number };
  risk: string;
  results: ScanResult[];
  skipped: number;
}

interface Suggestion {
  symbol: string;
  name: string;
  exchange: string;
}

function isTrendPassing(r: ScanResult): boolean {
  return (
    r.breakdown.rule1MacroPass &&
    r.breakdown.rule2MomentumPass &&
    r.breakdown.rule3GoldenPass &&
    r.breakdown.rule4RsiPass
  );
}

export function WatchlistView({ settings }: { settings: StrategySettings }) {
  const [data, setData] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auditRow, setAuditRow] = useState<ScanResult | null>(null);
  const [removingTicker, setRemovingTicker] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const refreshMinutes = Math.max(1, settings.refreshIntervalMinutes);

  const fetchScan = useCallback(async (maxAgeSeconds: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/scan?mode=watchlist&maxAgeSeconds=${maxAgeSeconds}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Watchlist failed (${res.status})`);
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
    fetchScan(refreshMinutes * 60);
  }, [fetchScan, refreshMinutes]);

  useEffect(() => {
    const id = setInterval(() => {
      fetchScan(refreshMinutes * 60);
    }, refreshMinutes * 60_000);
    return () => clearInterval(id);
  }, [fetchScan, refreshMinutes]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ctrl = new AbortController();
    const handle = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/symbols/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
          cache: "no-store",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `Search failed (${res.status})`);
        }
        const json = (await res.json()) as { results: Suggestion[] };
        setSuggestions(json.results);
        setHighlighted(0);
        setError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setSuggestions([]);
          setError((e as Error).message);
        }
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => {
      ctrl.abort();
      window.clearTimeout(handle);
    };
  }, [query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const existingTickers = useMemo(
    () => new Set((data?.results ?? []).map((r) => r.ticker.toUpperCase())),
    [data],
  );

  function resolveSubmission(): Suggestion | null {
    const q = query.trim().toUpperCase();
    if (!q) return null;
    if (suggestions.length > 0 && highlighted >= 0 && highlighted < suggestions.length) {
      return suggestions[highlighted];
    }
    const exact = suggestions.find((s) => s.symbol.toUpperCase() === q);
    if (exact) return exact;
    return null;
  }

  async function addSymbol(symbol: string) {
    const sym = symbol.toUpperCase();
    if (existingTickers.has(sym)) {
      setError(`${sym} is already in your watchlist.`);
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in.");
      const { error: insertError } = await supabase
        .from("user_watchlist")
        .insert({ user_id: userData.user.id, ticker: sym });
      if (insertError && insertError.code !== "23505") throw insertError;
      setQuery("");
      setSuggestions([]);
      setShowDropdown(false);
      await fetchScan(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function onAdd() {
    const resolved = resolveSubmission();
    if (!resolved) {
      setError("No matching symbol — pick a suggestion or type a valid ticker.");
      return;
    }
    await addSymbol(resolved.symbol);
  }

  async function onRemove(ticker: string) {
    if (!data) return;
    setRemovingTicker(ticker);
    setError(null);
    const prevResults = data.results;
    setData({
      ...data,
      results: prevResults.filter((r) => r.ticker !== ticker),
      count: Math.max(0, prevResults.length - 1),
    });
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in.");
      const { error: delError } = await supabase
        .from("user_watchlist")
        .delete()
        .eq("user_id", userData.user.id)
        .eq("ticker", ticker);
      if (delError) throw delError;
    } catch (e) {
      setData({ ...data, results: prevResults, count: prevResults.length });
      setError((e as Error).message);
    } finally {
      setRemovingTicker(null);
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

  const stocks = data?.results ?? [];
  const resolved = resolveSubmission();
  const addDisabled = adding || !resolved || existingTickers.has(resolved.symbol.toUpperCase());

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setShowDropdown(true);
      setHighlighted((h) => Math.min(h + 1, Math.max(0, suggestions.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      onAdd();
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  }

  function pickSuggestion(s: Suggestion) {
    addSymbol(s.symbol);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-amber-300">
            Your Watchlist
          </p>
          <h1 className="mt-2 text-xl font-semibold text-slate-50 sm:text-2xl">
            Tracked Tickers
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Add any active US equity by ticker or company name. Stocks that don&apos;t pass
            the four trend rules stay visible with a halved score.
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
      </header>

      <div ref={containerRef} className="relative">
        <div className="flex flex-wrap items-stretch gap-2">
          <div className="relative min-w-[260px] flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              onKeyDown={onKeyDown}
              placeholder="Type a ticker or company name (e.g. AAPL or Apple)"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-400"
              autoComplete="off"
              spellCheck={false}
            />
            {showDropdown && (suggestions.length > 0 || searching) && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-80 overflow-auto rounded-md border border-slate-700 bg-slate-950 shadow-lg">
                {searching && suggestions.length === 0 && (
                  <div className="px-3 py-2 text-xs text-slate-500">Searching…</div>
                )}
                {suggestions.map((s, i) => {
                  const already = existingTickers.has(s.symbol.toUpperCase());
                  return (
                    <button
                      key={`${s.symbol}-${i}`}
                      type="button"
                      onMouseEnter={() => setHighlighted(i)}
                      onClick={() => pickSuggestion(s)}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition ${
                        i === highlighted ? "bg-slate-800" : "hover:bg-slate-800/70"
                      } ${already ? "opacity-50" : ""}`}
                    >
                      <span className="flex flex-col">
                        <span className="font-mono font-semibold text-emerald-400">{s.symbol}</span>
                        <span className="text-xs text-slate-400">{s.name}</span>
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-slate-500">
                        {already ? "Added" : s.exchange}
                      </span>
                    </button>
                  );
                })}
                {!searching && suggestions.length === 0 && query.trim().length > 0 && (
                  <div className="px-3 py-2 text-xs text-slate-500">No matches.</div>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onAdd}
            disabled={addDisabled}
            className="rounded-md border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add to Watchlist"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Mobile card layout */}
      <div className="space-y-3 md:hidden">
        {loading && !data && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-10 text-center text-sm text-slate-400">
            Loading your watchlist…
          </div>
        )}
        {!loading && data && stocks.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-10 text-center text-sm text-slate-400">
            Your watchlist is empty. Add a ticker above.
          </div>
        )}
        {stocks.map((r) => {
          const { targetTp, targetSl } = computeTpSl(r.close, settings);
          const passing = isTrendPassing(r);
          return (
            <article
              key={r.ticker}
              className="rounded-xl border border-slate-800 bg-slate-900/40 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <a
                    href={etoroLink(r.ticker)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-lg font-semibold text-emerald-400 hover:underline"
                  >
                    {r.ticker}
                  </a>
                  <p className="mt-0.5 font-mono text-sm text-slate-100">{formatPrice(r.close)}</p>
                </div>
                <ScoreCell score={r.score} tier={r.tier} dimmed={!passing} />
              </div>

              <div className="mt-3">
                {passing ? (
                  <span className="inline-flex items-center rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
                    Setup Active
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-red-300">
                    No Setup · Trend Filter Failed
                  </span>
                )}
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-800/60 pt-3 text-sm">
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Target TP
                  </dt>
                  <dd className="mt-1 font-mono text-emerald-300">{formatPrice(targetTp)}</dd>
                </div>
                <div className="text-right">
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Target SL
                  </dt>
                  <dd className="mt-1 font-mono text-red-300">{formatPrice(targetSl)}</dd>
                </div>
              </dl>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setAuditRow(r)}
                  className="flex-1 rounded-md border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-emerald-400 hover:text-emerald-300"
                >
                  Info
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(r.ticker)}
                  disabled={removingTicker === r.ticker}
                  aria-label={`Remove ${r.ticker}`}
                  className="flex-1 rounded-md border border-slate-700 px-3 py-2 text-xs font-medium text-slate-400 transition hover:border-red-500/60 hover:text-red-300 disabled:opacity-50"
                >
                  {removingTicker === r.ticker ? "Removing…" : "Remove"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {/* Desktop table layout */}
      <div className="hidden overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-950/60 text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3">Ticker</th>
              <th className="px-4 py-3">Status</th>
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
                <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                  Loading your watchlist…
                </td>
              </tr>
            )}
            {!loading && data && stocks.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                  Your watchlist is empty. Type a ticker or company name above to add one.
                </td>
              </tr>
            )}
            {stocks.map((r) => {
              const { targetTp, targetSl } = computeTpSl(r.close, settings);
              const passing = isTrendPassing(r);
              return (
                <tr key={r.ticker} className="border-b border-slate-800/60 last:border-b-0 hover:bg-slate-800/30">
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
                  <td className="px-4 py-3">
                    {passing ? (
                      <span className="inline-flex items-center rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
                        Setup Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-red-300">
                        No Setup · Trend Filter Failed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-100">{formatPrice(r.close)}</td>
                  <td className="px-4 py-3 text-right">
                    <ScoreCell score={r.score} tier={r.tier} dimmed={!passing} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-300">{formatPrice(targetTp)}</td>
                  <td className="px-4 py-3 text-right font-mono text-red-300">{formatPrice(targetSl)}</td>
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
                        onClick={() => onRemove(r.ticker)}
                        disabled={removingTicker === r.ticker}
                        aria-label={`Remove ${r.ticker}`}
                        className="rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-400 transition hover:border-red-500/60 hover:text-red-300 disabled:opacity-50"
                      >
                        {removingTicker === r.ticker ? "Removing…" : "Remove"}
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
        Failing setups have their score halved so they sink in the ranking, but stay visible so you can watch them recover.
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

function ScoreCell({ score, tier, dimmed }: { score: number; tier: "High" | "Med" | "Low"; dimmed: boolean }) {
  const color =
    tier === "High" ? "text-emerald-400" : tier === "Med" ? "text-amber-300" : "text-slate-400";
  const badge =
    tier === "High"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : tier === "Med"
      ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
      : "border-slate-600/40 bg-slate-700/30 text-slate-300";
  return (
    <span className={`inline-flex items-center gap-2 ${dimmed ? "opacity-70" : ""}`}>
      <span className={`font-mono font-semibold ${color}`}>{score.toFixed(1)}%</span>
      <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${badge}`}>
        {tier}
      </span>
    </span>
  );
}
