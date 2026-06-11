import { NextResponse } from "next/server";
import { AlpacaConfigError, AlpacaHttpError, fetchDailyBars } from "@/lib/alpaca";
import {
  evaluateGmmaTicker,
  gmmaScanCache,
  rankGmmaResults,
  type GmmaScanResponse,
  type GmmaScanResult,
} from "@/lib/gmma-scanner";
import type { DailyBar } from "@/lib/scanner";
import { STRATEGY_DEFAULTS } from "@/lib/strategy";
import { universeMinus } from "@/lib/universe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;
const MIN_BARS_REQUIRED = 60;

function parseLimit(s: string | null): number {
  const n = s ? parseInt(s, 10) : STRATEGY_DEFAULTS.scannerLimit;
  if (!Number.isFinite(n) || n <= 0) return STRATEGY_DEFAULTS.scannerLimit;
  return Math.min(n, 100);
}

function parseExclude(s: string | null): string[] {
  if (!s) return [];
  return s.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
}

function parseMaxAgeMs(s: string | null): number {
  if (!s) return DEFAULT_MAX_AGE_MS;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_AGE_MS;
  return Math.min(n * 1000, CACHE_TTL_MS);
}

function sliceTop(p: GmmaScanResponse, limit: number): GmmaScanResponse {
  return {
    ...p,
    results: p.results.slice(0, limit),
    count: Math.min(p.results.length, limit),
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const exclude = parseExclude(url.searchParams.get("exclude"));
  const maxAgeMs = parseMaxAgeMs(url.searchParams.get("maxAgeSeconds"));

  const symbols = universeMinus(exclude);
  const cacheKey = `gmma|${exclude.sort().join(",")}`;
  const cached = gmmaScanCache.get(cacheKey);
  if (cached && Date.now() - cached.at < maxAgeMs) {
    return NextResponse.json(sliceTop(cached.payload, limit));
  }

  if (symbols.length === 0) {
    const payload: GmmaScanResponse = {
      generatedAt: new Date().toISOString(),
      count: 0,
      results: [],
      skipped: 0,
    };
    gmmaScanCache.set(cacheKey, { at: Date.now(), payload });
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

  const passed: GmmaScanResult[] = [];
  let skipped = 0;
  for (const ticker of symbols) {
    const series = bars[ticker];
    if (!series || series.length < MIN_BARS_REQUIRED) {
      skipped++;
      continue;
    }
    const result = evaluateGmmaTicker(ticker, series);
    if (result) passed.push(result);
    else skipped++;
  }

  const ranked = rankGmmaResults(passed);
  const payload: GmmaScanResponse = {
    generatedAt: new Date().toISOString(),
    count: ranked.length,
    results: ranked,
    skipped,
  };

  gmmaScanCache.set(cacheKey, { at: Date.now(), payload });
  return NextResponse.json(sliceTop(payload, limit));
}
