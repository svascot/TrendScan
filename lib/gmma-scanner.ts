import {
  aoBullishSaucer,
  aoZeroCrossUp,
  atr,
  awesomeOscillatorSeries,
  ema,
  emaSeries,
} from "./indicators";
import { type DailyBar } from "./scanner";
import { getIndicesFor, type IndexName } from "./universe";

// Per-bar chart series for the GMMA detail panel: close + both Guppy ribbons
// (short 3-15 + long 30-60) + the Awesome Oscillator, all aligned to the same
// date. EMA/AO fields are null during their warm-up window so the chart can gap
// them cleanly.
export interface GmmaChartBar {
  date: string; // YYYY-MM-DD
  close: number;
  // Short-term (trader) ribbon.
  ema3: number | null;
  ema5: number | null;
  ema8: number | null;
  ema10: number | null;
  ema12: number | null;
  ema15: number | null;
  // Long-term (investor) ribbon.
  ema30: number | null;
  ema35: number | null;
  ema40: number | null;
  ema45: number | null;
  ema50: number | null;
  ema60: number | null;
  ao: number | null;
}

export interface GmmaBreakdown {
  // Short ribbon fully above the long ribbon, long ribbon ordered (true GMMA uptrend).
  rule1TrendAlignedPass: boolean;
  // Price has pulled back into the short ribbon while the uptrend holds.
  rule2PullbackToShortRibbonPass: boolean;
  // AO confirms via a bullish saucer or a zero-line cross up.
  rule3AoConfirmedPass: boolean;
  // The strict 1:2 TP sits below real resistance, so the target is reachable.
  tpReachablePass: boolean;
}

export interface GmmaScanResult {
  ticker: string;
  close: number;
  // Short-term (trader) ribbon, fast → slow.
  ema3: number;
  ema5: number;
  ema8: number;
  ema10: number;
  ema12: number;
  ema15: number;
  // Long-term (investor) ribbon, fast → slow.
  ema30: number;
  ema35: number;
  ema40: number;
  ema45: number;
  ema50: number;
  ema60: number;
  aoPrev: number;
  aoCurr: number;
  atr14: number; // ATR(14) used for the SL/TP buffers
  supportLow: number; // recent swing low the SL is anchored to
  resistanceHigh: number; // recent swing high the TP targets
  targetTp: number; // absolute $ — strict 1:2, verified below resistance
  targetSl: number; // absolute $ — just below support
  riskPerShare: number; // close - targetSl
  rrRatio: number; // (targetTp - close) / (close - targetSl) = 2 by construction
  indices: IndexName[];
  chartBars: GmmaChartBar[];
  breakdown: GmmaBreakdown;
}

const CHART_BARS_LOOKBACK = 90;
const SHORT_PERIODS = [3, 5, 8, 10, 12, 15] as const; // trader ribbon
const LONG_PERIODS = [30, 35, 40, 45, 50, 60] as const; // investor ribbon
const ATR_PERIOD = 14;
// SL is anchored to real support (recent pullback low). TP is a strict 1:2 on
// price, but only kept when it sits below the recent resistance (a price the
// stock actually traded) — so the target is genuinely reachable. ATR only buffers.
const SUPPORT_LOOKBACK = 10; // bars to find the recent support (pullback low)
const RESISTANCE_LOOKBACK = 20; // bars to find the recent resistance (swing high)
const SL_ATR_BUFFER = 0.3; // place SL this far below support so noise doesn't tag it
const TP_CLEARANCE_ATR = 0.25; // the 1:2 TP must sit at least this far below resistance
const RR_TARGET = 2; // strict 1:2 reward:risk
const MIN_BARS = 60; // EMA(60) seed is the binding minimum; short ribbon + AO + ATR need fewer

// Build the enriched chart series for the last ~90 bars. The EMA/AO series are
// computed over the FULL history first (so values inside the lookback window are
// fully warmed up), then sliced to the visible window.
function buildGmmaChartBars(
  bars: readonly DailyBar[],
  closes: readonly number[],
  highs: readonly number[],
  lows: readonly number[],
): GmmaChartBar[] {
  const s3 = emaSeries(closes, 3);
  const s5 = emaSeries(closes, 5);
  const s8 = emaSeries(closes, 8);
  const s10 = emaSeries(closes, 10);
  const s12 = emaSeries(closes, 12);
  const s15 = emaSeries(closes, 15);
  const s30 = emaSeries(closes, 30);
  const s35 = emaSeries(closes, 35);
  const s40 = emaSeries(closes, 40);
  const s45 = emaSeries(closes, 45);
  const s50 = emaSeries(closes, 50);
  const s60 = emaSeries(closes, 60);
  const aoSer = awesomeOscillatorSeries(highs, lows);

  const start = Math.max(0, bars.length - CHART_BARS_LOOKBACK);
  const out: GmmaChartBar[] = [];
  for (let i = start; i < bars.length; i++) {
    out.push({
      date: bars[i].t.slice(0, 10),
      close: round2(bars[i].c),
      ema3: round2OrNull(s3[i]),
      ema5: round2OrNull(s5[i]),
      ema8: round2OrNull(s8[i]),
      ema10: round2OrNull(s10[i]),
      ema12: round2OrNull(s12[i]),
      ema15: round2OrNull(s15[i]),
      ema30: round2OrNull(s30[i]),
      ema35: round2OrNull(s35[i]),
      ema40: round2OrNull(s40[i]),
      ema45: round2OrNull(s45[i]),
      ema50: round2OrNull(s50[i]),
      ema60: round2OrNull(s60[i]),
      ao: round4OrNull(aoSer[i]),
    });
  }
  return out;
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

  const shortEmas = SHORT_PERIODS.map((p) => ema(closes, p));
  const longEmas = LONG_PERIODS.map((p) => ema(closes, p));
  if (shortEmas.some((e) => e === null) || longEmas.some((e) => e === null)) return null;
  const [e3, e5, e8, e10, e12, e15] = shortEmas as number[];
  const [e30, e35, e40, e45, e50, e60] = longEmas as number[];

  // Awesome Oscillator — one series pass; curr/prev are simply its last two bars.
  const aoSer = awesomeOscillatorSeries(highs, lows);
  const aoCurr = aoSer[aoSer.length - 1];
  const aoPrev = aoSer[aoSer.length - 2];
  if (aoCurr === null || aoPrev === null) return null;

  // ---- Rule 1: true two-ribbon GMMA uptrend ----
  // The long (investor) ribbon is ordered fast→slow, AND the short (trader)
  // ribbon sits entirely above it — the canonical "short above long, fanning up".
  const longOrdered = e30 > e35 && e35 > e40 && e40 > e45 && e45 > e50 && e50 > e60;
  const shortMin = Math.min(e3, e5, e8, e10, e12, e15);
  const longMax = Math.max(e30, e35, e40, e45, e50, e60);
  const rule1 = longOrdered && shortMin > longMax;

  // ---- Rule 2: pullback into the short ribbon, uptrend intact ----
  // Price has eased back to the slow edge of the short ribbon (close ≤ EMA15)
  // but is still above the whole investor ribbon (close > longMax).
  const rule2 = close <= e15 && close > longMax;

  // ---- Rule 3: AO confirmation (saucer or zero-line cross up) ----
  const rule3 = aoBullishSaucer(aoSer) || aoZeroCrossUp(aoPrev, aoCurr);

  if (!(rule1 && rule2 && rule3)) return null;

  // ---- SL at real support; TP at a strict 1:2 that must be reachable ----
  const atr14 = atr(highs, lows, closes, ATR_PERIOD);
  if (atr14 === null || atr14 <= 0) return null;

  // Stop: just below the recent support (pullback low) — a real level — with a
  // small ATR buffer so a normal wiggle doesn't tag it exactly.
  const supportLow = Math.min(...lows.slice(-SUPPORT_LOOKBACK));
  const targetSl = supportLow - SL_ATR_BUFFER * atr14;
  if (targetSl >= close) return null;

  const riskPerShare = close - targetSl;
  const targetTp = close + RR_TARGET * riskPerShare; // strict 1:2 on price

  // Realism gate: the 1:2 target must sit below the recent resistance (a price
  // the stock actually traded), with a small clearance so it fills before the
  // wall. If the 1:2 lands above recent resistance, it's not reachable → skip.
  const resistanceHigh = Math.max(...highs.slice(-RESISTANCE_LOOKBACK));
  if (targetTp > resistanceHigh - TP_CLEARANCE_ATR * atr14) return null;

  const rrRatio = RR_TARGET; // 2 by construction

  return {
    ticker,
    close: round2(close),
    ema3: round2(e3),
    ema5: round2(e5),
    ema8: round2(e8),
    ema10: round2(e10),
    ema12: round2(e12),
    ema15: round2(e15),
    ema30: round2(e30),
    ema35: round2(e35),
    ema40: round2(e40),
    ema45: round2(e45),
    ema50: round2(e50),
    ema60: round2(e60),
    aoPrev: round4(aoPrev),
    aoCurr: round4(aoCurr),
    atr14: round2(atr14),
    supportLow: round2(supportLow),
    resistanceHigh: round2(resistanceHigh),
    targetTp: round2(targetTp),
    targetSl: round2(targetSl),
    riskPerShare: round2(riskPerShare),
    rrRatio: round2(rrRatio),
    indices: getIndicesFor(ticker),
    chartBars: buildGmmaChartBars(bars, closes, highs, lows),
    breakdown: {
      rule1TrendAlignedPass: rule1,
      rule2PullbackToShortRibbonPass: rule2,
      rule3AoConfirmedPass: rule3,
      tpReachablePass: true,
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
function round2OrNull(n: number | null): number | null { return n === null ? null : round2(n); }
function round4OrNull(n: number | null): number | null { return n === null ? null : round4(n); }

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
