import { atr, meanLast, roc, rsi14, sma } from "./indicators";
import { STRATEGY_DEFAULTS } from "./strategy";
import { getIndicesFor, type IndexName } from "./universe";

export interface DailyBar {
  c: number; // close
  h: number;
  l: number;
  o: number;
  v: number;
  t: string; // timestamp ISO
}

export interface ScanRule {
  rsiLow: number;
  rsiHigh: number;
  maShort: number;
  maLong: number;
  atrMinPct: number; // fraction, e.g. 0.015 = 1.5%
  atrPeriod: number;
  rocPeriod: number;
}

export type RiskLevel = "low" | "med" | "high";

const ATR_PERIOD_DEFAULT = 14;
const ROC_PERIOD_DEFAULT = 9;

export function rulesForRisk(risk: RiskLevel): ScanRule {
  switch (risk) {
    case "low":
      return {
        rsiLow: 58,
        rsiHigh: 62,
        maShort: 50,
        maLong: 200,
        atrMinPct: 0.02,
        atrPeriod: ATR_PERIOD_DEFAULT,
        rocPeriod: ROC_PERIOD_DEFAULT,
      };
    case "high":
      return {
        rsiLow: 50,
        rsiHigh: 70,
        maShort: 50,
        maLong: 200,
        atrMinPct: 0.01,
        atrPeriod: ATR_PERIOD_DEFAULT,
        rocPeriod: ROC_PERIOD_DEFAULT,
      };
    case "med":
    default:
      return {
        rsiLow: STRATEGY_DEFAULTS.rsiLow,
        rsiHigh: STRATEGY_DEFAULTS.rsiHigh,
        maShort: STRATEGY_DEFAULTS.maShort,
        maLong: STRATEGY_DEFAULTS.maLong,
        atrMinPct: STRATEGY_DEFAULTS.atrMinPct,
        atrPeriod: ATR_PERIOD_DEFAULT,
        rocPeriod: ROC_PERIOD_DEFAULT,
      };
  }
}

export interface SetupBreakdown {
  rule1MacroPass: boolean; // close > MA200
  rule2MomentumPass: boolean; // close > MA50
  rule3GoldenPass: boolean; // MA50 > MA200
  rule4RsiPass: boolean; // rsiLow <= rsi14 <= rsiHigh
  rule5RocPass: boolean; // ROC(9) > 0
  rule6AtrPass: boolean; // ATR(14)/close >= atrMinPct

  // Raw factor values
  velocityPct: number; // (close - MA50) / MA50
  rsiSweetSpot: number; // 1 at band midpoint, 0 at edge
  volRatio: number; // today vol / mean(20)
  rocValue: number; // ROC(9) in percent
  atrValue: number; // ATR(14) absolute
  atrPct: number; // ATR(14)/close * 100

  // Normalized factor contributions (each 0..100 before weighting)
  normROC: number;
  normVel: number;
  normATR: number;
  normVol: number;
  normRSI: number;

  // Weighted contributions (sum to the final composite score, 0..100)
  scoreRoc: number; // weight 0.30
  scoreVelocity: number; // weight 0.25
  scoreAtr: number; // weight 0.20
  scoreVolume: number; // weight 0.15
  scoreRsi: number; // weight 0.10
}

export interface ChartBar {
  date: string; // YYYY-MM-DD
  close: number;
}

export interface ScanResult {
  ticker: string;
  close: number;
  ma50: number;
  ma200: number;
  rsi14: number;
  volume: number;
  avgVolume20: number;
  rocValue: number; // ROC(9) %
  atrValue: number; // ATR(14)
  atrPercentage: number; // ATR(14)/close * 100
  score: number; // 0..100
  tier: "High" | "Med" | "Low";
  indices: IndexName[];
  chartBars: ChartBar[]; // last ~90 daily closes for visual context
  breakdown: SetupBreakdown;
}

const CHART_BARS_LOOKBACK = 90;

function lastChartBars(bars: readonly DailyBar[]): ChartBar[] {
  const slice = bars.slice(-CHART_BARS_LOOKBACK);
  return slice.map((b) => ({
    date: b.t.slice(0, 10),
    close: round2(b.c),
  }));
}

const VELOCITY_CLAMP_DEFAULT = 0.15; // 15% above MA = full velocity score
const VOL_CLAMP_DEFAULT = 2.0; // 2x average volume = full volume score
const ROC_CLAMP_DEFAULT = 10; // ROC of +10% = full ROC score
const ATR_CLAMP_DEFAULT = 5; // ATR of 5% of price = full ATR score

// Score-matrix weights (sum to 1.0). Optimised for short-horizon swing trades.
export const W_ROC = 0.30;
export const W_VEL = 0.25;
export const W_ATR = 0.20;
export const W_VOL = 0.15;
export const W_RSI = 0.10;

export function evaluateTicker(
  ticker: string,
  bars: readonly DailyBar[],
  rule: ScanRule,
  opts?: { velocityClamp?: number; volClamp?: number }
): ScanResult | null {
  const base = computeScan(ticker, bars, rule, opts);
  if (!base) return null;
  if (!base.allPass) return null;
  return base.result;
}

// Watchlist mode: never gate on rule failure. If any rule fails, halve the
// composite score so failing setups sink in the ranking while staying visible.
export function evaluateTickerForWatchlist(
  ticker: string,
  bars: readonly DailyBar[],
  rule: ScanRule,
  opts?: { velocityClamp?: number; volClamp?: number }
): ScanResult | null {
  const base = computeScan(ticker, bars, rule, opts);
  if (!base) return null;
  if (base.allPass) return base.result;

  const halved = round1(base.result.score * 0.5);
  const tier: ScanResult["tier"] = halved >= 85 ? "High" : halved >= 70 ? "Med" : "Low";
  return { ...base.result, score: halved, tier };
}

interface ComputeScanResult {
  result: ScanResult;
  allPass: boolean;
}

function computeScan(
  ticker: string,
  bars: readonly DailyBar[],
  rule: ScanRule,
  opts?: { velocityClamp?: number; volClamp?: number }
): ComputeScanResult | null {
  // Need enough bars to seed the longest indicator: MA(maLong) + 1.
  // Also requires atrPeriod+1 bars and rocPeriod+1 bars (both well under maLong).
  const minBars = rule.maLong + 1;
  if (bars.length < minBars) return null;

  const closes = bars.map((b) => b.c);
  const highs = bars.map((b) => b.h);
  const lows = bars.map((b) => b.l);
  const volumes = bars.map((b) => b.v);

  const close = closes[closes.length - 1];
  const ma50 = sma(closes, rule.maShort);
  const ma200 = sma(closes, rule.maLong);
  const rsi = rsi14(closes);
  const avgVol20 = meanLast(volumes, 20);
  const todayVol = volumes[volumes.length - 1];
  const rocValue = roc(closes, rule.rocPeriod);
  const atrValue = atr(highs, lows, closes, rule.atrPeriod);

  if (
    ma50 === null ||
    ma200 === null ||
    rsi === null ||
    avgVol20 === null ||
    rocValue === null ||
    atrValue === null
  ) {
    return null;
  }
  if (avgVol20 <= 0 || close <= 0) return null;

  // ---- Gatekeeper rules ----
  const rule1 = close > ma200; // Macro structure
  const rule2 = close > ma50; // Short-term momentum
  const rule3 = ma50 > ma200; // Golden alignment
  const rule4 = rsi >= rule.rsiLow && rsi <= rule.rsiHigh;
  const rule5 = rocValue > 0;
  const atrPct = (atrValue / close) * 100;
  const rule6 = atrPct >= rule.atrMinPct * 100;
  const allPass = rule1 && rule2 && rule3 && rule4 && rule5 && rule6;

  // ---- Factor values ----
  const velocityClamp = opts?.velocityClamp ?? VELOCITY_CLAMP_DEFAULT;
  const volClamp = opts?.volClamp ?? VOL_CLAMP_DEFAULT;
  const velocityPct = (close - ma50) / ma50;
  const halfBand = Math.max((rule.rsiHigh - rule.rsiLow) / 2, 1e-9);
  const rsiMid = (rule.rsiHigh + rule.rsiLow) / 2;
  const rsiSweetSpot = clamp(1 - Math.abs(rsi - rsiMid) / halfBand, 0, 1);
  const volRatio = todayVol / avgVol20;

  // ---- Normalize each factor to 0..100 ----
  const normROC = clamp((rocValue / ROC_CLAMP_DEFAULT) * 100, 0, 100);
  const normVel = clamp((velocityPct / velocityClamp) * 100, 0, 100);
  const normATR = clamp((atrPct / ATR_CLAMP_DEFAULT) * 100, 0, 100);
  const normVol = clamp((volRatio / volClamp) * 100, 0, 100);
  const normRSI = clamp(rsiSweetSpot * 100, 0, 100);

  // ---- Weighted composite ----
  const scoreRoc = normROC * W_ROC;
  const scoreVelocity = normVel * W_VEL;
  const scoreAtr = normATR * W_ATR;
  const scoreVolume = normVol * W_VOL;
  const scoreRsi = normRSI * W_RSI;
  const score = round1(
    clamp(scoreRoc + scoreVelocity + scoreAtr + scoreVolume + scoreRsi, 0, 100),
  );

  const tier: ScanResult["tier"] = score >= 85 ? "High" : score >= 70 ? "Med" : "Low";

  return {
    allPass,
    result: {
      ticker,
      close: round2(close),
      ma50: round2(ma50),
      ma200: round2(ma200),
      rsi14: round2(rsi),
      volume: todayVol,
      avgVolume20: Math.round(avgVol20),
      rocValue: round2(rocValue),
      atrValue: round2(atrValue),
      atrPercentage: round2(atrPct),
      score,
      tier,
      indices: getIndicesFor(ticker),
      chartBars: lastChartBars(bars),
      breakdown: {
        rule1MacroPass: rule1,
        rule2MomentumPass: rule2,
        rule3GoldenPass: rule3,
        rule4RsiPass: rule4,
        rule5RocPass: rule5,
        rule6AtrPass: rule6,
        velocityPct: round4(velocityPct),
        rsiSweetSpot: round2(rsiSweetSpot),
        volRatio: round2(volRatio),
        rocValue: round2(rocValue),
        atrValue: round2(atrValue),
        atrPct: round2(atrPct),
        normROC: round1(normROC),
        normVel: round1(normVel),
        normATR: round1(normATR),
        normVol: round1(normVol),
        normRSI: round1(normRSI),
        scoreRoc: round1(scoreRoc),
        scoreVelocity: round1(scoreVelocity),
        scoreAtr: round1(scoreAtr),
        scoreVolume: round1(scoreVolume),
        scoreRsi: round1(scoreRsi),
      },
    },
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
function round1(n: number): number { return Math.round(n * 10) / 10; }
function round2(n: number): number { return Math.round(n * 100) / 100; }
function round4(n: number): number { return Math.round(n * 10000) / 10000; }

export function rankResults(results: ScanResult[]): ScanResult[] {
  return [...results].sort((a, b) => b.score - a.score);
}
