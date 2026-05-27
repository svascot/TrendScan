import { NextResponse } from "next/server";
import { fetchDailyBars, AlpacaConfigError, AlpacaHttpError } from "@/lib/alpaca";
import {
  evaluateTicker,
  rankResults,
  rulesForRisk,
  type DailyBar,
  type RiskLevel,
  type ScanResult,
} from "@/lib/scanner";
import { STRATEGY_DEFAULTS } from "@/lib/strategy";
import { universeMinus } from "@/lib/universe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
type CacheEntry = { at: number; payload: ScanResponse };
const cache = new Map<string, CacheEntry>();

interface ScanResponse {
  generatedAt: string;
  count: number;
  rule: { rsiLow: number; rsiHigh: number; maShort: number; maLong: number };
  risk: RiskLevel;
  results: ScanResult[];
  skipped: number;
}

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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const risk = parseRisk(url.searchParams.get("risk"));
  const exclude = parseExclude(url.searchParams.get("exclude"));

  const cacheKey = `${risk}|${exclude.sort().join(",")}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(sliceTop(cached.payload, limit));
  }

  const rule = rulesForRisk(risk);
  const symbols = universeMinus(exclude);

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
    const result = evaluateTicker(ticker, series, rule);
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

  cache.set(cacheKey, { at: Date.now(), payload });
  return NextResponse.json(sliceTop(payload, limit));
}

function sliceTop(p: ScanResponse, limit: number): ScanResponse {
  return { ...p, results: p.results.slice(0, limit), count: Math.min(p.results.length, limit) };
}
