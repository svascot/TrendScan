import { awesomeOscillator, ema } from "./indicators";
import {
  type ChartBar,
  type DailyBar,
} from "./scanner";
import { getIndicesFor, type IndexName } from "./universe";

export interface GmmaBreakdown {
  rule1FanOrderedPass: boolean; // EMA30 > EMA35 > EMA40 > EMA45 > EMA50 > EMA60
  rule2PriceInChannelPass: boolean; // EMA60 <= close <= EMA30
  rule3MomentumPass: boolean; // AO curr > AO prev
  riskPerSharePositive: boolean; // close > targetSl
}

export interface GmmaScanResult {
  ticker: string;
  close: number;
  ema30: number;
  ema35: number;
  ema40: number;
  ema45: number;
  ema50: number;
  ema60: number;
  aoPrev: number;
  aoCurr: number;
  targetTp: number; // absolute $
  targetSl: number; // absolute $
  riskPerShare: number; // close - targetSl
  rrRatio: number; // (targetTp - close) / (close - targetSl) — by construction = 2
  indices: IndexName[];
  chartBars: ChartBar[];
  breakdown: GmmaBreakdown;
}

const CHART_BARS_LOOKBACK = 90;
const EMA_PERIODS = [30, 35, 40, 45, 50, 60] as const;
const MIN_BARS = 60; // need EMA(60) seed + AO(34); 60 closes is the binding minimum

function lastChartBars(bars: readonly DailyBar[]): ChartBar[] {
  const slice = bars.slice(-CHART_BARS_LOOKBACK);
  return slice.map((b) => ({
    date: b.t.slice(0, 10),
    close: round2(b.c),
  }));
}

export function evaluateGmmaTicker(
  ticker: string,
  bars: readonly DailyBar[],
): GmmaScanResult | null {
  if (bars.length < MIN_BARS) return null;

  const closes = bars.map((b) => b.c);
  const highs = bars.map((b) => b.h);
  const lows = bars.map((b) => b.l);
  const close = closes[closes.length - 1];

  const emas = EMA_PERIODS.map((p) => ema(closes, p));
  if (emas.some((e) => e === null)) return null;
  const [e30, e35, e40, e45, e50, e60] = emas as number[];

  const ao = awesomeOscillator(highs, lows);
  if (!ao) return null;

  // ---- Filters ----
  const rule1 = e30 > e35 && e35 > e40 && e40 > e45 && e45 > e50 && e50 > e60;
  const rule2 = close >= e60 && close <= e30;
  const rule3 = ao.curr > ao.prev;

  if (!(rule1 && rule2 && rule3)) return null;

  // ---- Structural stop loss ----
  // The tighter of two structural anchors: current EMA60 floor or the 5-bar swing low.
  const last5Lows = lows.slice(-5);
  let low5d = last5Lows[0];
  for (let i = 1; i < last5Lows.length; i++) if (last5Lows[i] < low5d) low5d = last5Lows[i];
  const targetSl = Math.max(e60, low5d);

  // SL must sit below the entry, otherwise position sizing is undefined.
  if (targetSl >= close) return null;

  const riskPerShare = close - targetSl;
  const targetTp = close + 2 * riskPerShare;

  return {
    ticker,
    close: round2(close),
    ema30: round2(e30),
    ema35: round2(e35),
    ema40: round2(e40),
    ema45: round2(e45),
    ema50: round2(e50),
    ema60: round2(e60),
    aoPrev: round4(ao.prev),
    aoCurr: round4(ao.curr),
    targetTp: round2(targetTp),
    targetSl: round2(targetSl),
    riskPerShare: round2(riskPerShare),
    rrRatio: 2,
    indices: getIndicesFor(ticker),
    chartBars: lastChartBars(bars),
    breakdown: {
      rule1FanOrderedPass: rule1,
      rule2PriceInChannelPass: rule2,
      rule3MomentumPass: rule3,
      riskPerSharePositive: true,
    },
  };
}

// Best-first ordering: tighter risk-per-share relative to price means more shares
// fit inside the user's risk budget, so it's a "better R" candidate.
export function rankGmmaResults(results: GmmaScanResult[]): GmmaScanResult[] {
  return [...results].sort(
    (a, b) => a.riskPerShare / a.close - b.riskPerShare / b.close,
  );
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round4(n: number): number { return Math.round(n * 10000) / 10000; }

export interface GmmaScanResponse {
  generatedAt: string;
  count: number;
  results: GmmaScanResult[];
  skipped: number;
}

interface GmmaCacheEntry {
  at: number;
  payload: GmmaScanResponse;
}

export const gmmaScanCache = new Map<string, GmmaCacheEntry>();

export function clearGmmaScanCache(): number {
  const size = gmmaScanCache.size;
  gmmaScanCache.clear();
  return size;
}
