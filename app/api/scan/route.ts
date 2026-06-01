import { NextResponse } from "next/server";
import { fetchDailyBars, AlpacaConfigError, AlpacaHttpError } from "@/lib/alpaca";
import {
  evaluateTicker,
  evaluateTickerForWatchlist,
  rankResults,
  rulesForRisk,
  type DailyBar,
  type RiskLevel,
  type ScanResult,
} from "@/lib/scanner";
import { STRATEGY_DEFAULTS } from "@/lib/strategy";
import { universeMinus } from "@/lib/universe";
import { createClient } from "@/lib/supabase/server";
import { scanCache, type ScanResponse } from "@/lib/scan-cache";

type ScanMode = "scanner" | "watchlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour upper bound (client can request shorter)
const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes when client doesn't specify

function parseRisk(s: string | null): RiskLevel {
  if (s === "low" || s === "med" || s === "high") return s;
  return "med";
}

function parseLimit(s: string | null): number {
  const n = s ? parseInt(s, 10) : STRATEGY_DEFAULTS.scannerLimit;
  if (!Number.isFinite(n) || n <= 0) return STRATEGY_DEFAULTS.scannerLimit;
  return Math.min(n, 100);
}

function parseExclude(s: string | null): string[] {
  if (!s) return [];
  return s.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
}

function parseMode(s: string | null): ScanMode {
  return s === "watchlist" ? "watchlist" : "scanner";
}

function parseMaxAgeMs(s: string | null): number {
  if (!s) return DEFAULT_MAX_AGE_MS;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_AGE_MS;
  return Math.min(n * 1000, CACHE_TTL_MS);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = parseMode(url.searchParams.get("mode"));
  const limit = parseLimit(url.searchParams.get("limit"));
  const risk = parseRisk(url.searchParams.get("risk"));
  const exclude = parseExclude(url.searchParams.get("exclude"));
  const maxAgeMs = parseMaxAgeMs(url.searchParams.get("maxAgeSeconds"));

  let symbols: string[];
  let userId: string | null = null;

  if (mode === "watchlist") {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    userId = userData.user.id;
    const { data: rows, error } = await supabase
      .from("user_watchlist")
      .select("ticker")
      .eq("user_id", userId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    symbols = (rows ?? []).map((r) => r.ticker.toUpperCase());
  } else {
    symbols = universeMinus(exclude);
  }

  const cacheKey =
    mode === "watchlist"
      ? `watchlist|${userId}|${risk}|${[...symbols].sort().join(",")}`
      : `scanner|${risk}|${exclude.sort().join(",")}`;
  const cached = scanCache.get(cacheKey);
  if (cached && Date.now() - cached.at < maxAgeMs) {
    return NextResponse.json(
      mode === "watchlist" ? cached.payload : sliceTop(cached.payload, limit),
    );
  }

  const rule = rulesForRisk(risk);

  if (symbols.length === 0) {
    const payload: ScanResponse = {
      generatedAt: new Date().toISOString(),
      count: 0,
      rule,
      risk,
      results: [],
      skipped: 0,
    };
    scanCache.set(cacheKey, { at: Date.now(), payload });
    return NextResponse.json(payload);
  }

  let bars: Record<string, DailyBar[]>;
  try {
    bars = await fetchDailyBars(symbols);
  } catch (e) {
    if (e instanceof AlpacaConfigError) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
    if (e instanceof AlpacaHttpError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const passed: ScanResult[] = [];
  let skipped = 0;
  for (const ticker of symbols) {
    const series = bars[ticker];
    if (!series || series.length < rule.maLong + 1) {
      skipped++;
      continue;
    }
    const result =
      mode === "watchlist"
        ? evaluateTickerForWatchlist(ticker, series, rule)
        : evaluateTicker(ticker, series, rule);
    if (result) passed.push(result);
    else skipped++;
  }

  const ranked = rankResults(passed);
  const payload: ScanResponse = {
    generatedAt: new Date().toISOString(),
    count: ranked.length,
    rule,
    risk,
    results: ranked,
    skipped,
  };

  scanCache.set(cacheKey, { at: Date.now(), payload });
  return NextResponse.json(mode === "watchlist" ? payload : sliceTop(payload, limit));
}

function sliceTop(p: ScanResponse, limit: number): ScanResponse {
  return { ...p, results: p.results.slice(0, limit), count: Math.min(p.results.length, limit) };
}
