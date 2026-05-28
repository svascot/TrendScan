import { meanLast, rsi14, sma } from "./indicators";
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
}

export type RiskLevel = "low" | "med" | "high";

export function rulesForRisk(risk: RiskLevel): ScanRule {
  switch (risk) {
    case "low":
      return { rsiLow: 58, rsiHigh: 62, maShort: 50, maLong: 200 };
    case "high":
      return { rsiLow: 50, rsiHigh: 70, maShort: 50, maLong: 200 };
    case "med":
    default:
      return {
        rsiLow: STRATEGY_DEFAULTS.rsiLow,
        rsiHigh: STRATEGY_DEFAULTS.rsiHigh,
        maShort: STRATEGY_DEFAULTS.maShort,
        maLong: STRATEGY_DEFAULTS.maLong,
      };
  }
}

export interface SetupBreakdown {
  rule1MacroPass: boolean; // close > MA200
  rule2MomentumPass: boolean; // close > MA50
  rule3GoldenPass: boolean; // MA50 > MA200
  rule4RsiPass: boolean; // rsiLow <= rsi14 <= rsiHigh
  velocityPct: number; // (close - MA50) / MA50
  rsiSweetSpot: number; // 1 at rsi=60, 0 at edge
  volRatio: number; // today vol / mean(20)
  scoreVelocity: number; // 0..50
  scoreRsi: number; // 0..30
  scoreVolume: number; // 0..20
}

export interface ScanResult {
  ticker: string;
  close: number;
  ma50: number;
  ma200: number;
  rsi14: number;
  volume: number;
  avgVolume20: number;
  score: number; // 0..100
  tier: "High" | "Med" | "Low";
  indices: IndexName[];
  breakdown: SetupBreakdown;
}

const VELOCITY_CLAMP_DEFAULT = 0.15;
const VOL_CLAMP_DEFAULT = 2.0;

export function evaluateTicker(
  ticker: string,
  bars: readonly DailyBar[],
  rule: ScanRule,
  opts?: { velocityClamp?: number; volClamp?: number }
): ScanResult | null {
  const minBars = rule.maLong + 1;
  if (bars.length < minBars) return null;

  const closes = bars.map((b) => b.c);
  const volumes = bars.map((b) => b.v);

  const close = closes[closes.length - 1];
  const ma50 = sma(closes, rule.maShort);
  const ma200 = sma(closes, rule.maLong);
  const rsi = rsi14(closes);
  const avgVol20 = meanLast(volumes, 20);
  const todayVol = volumes[volumes.length - 1];

  if (ma50 === null || ma200 === null || rsi === null || avgVol20 === null) return null;
  if (avgVol20 <= 0) return null;

  const rule1 = close > ma200;
  const rule2 = close > ma50;
  const rule3 = ma50 > ma200;
  const rule4 = rsi >= rule.rsiLow && rsi <= rule.rsiHigh;

  if (!(rule1 && rule2 && rule3 && rule4)) return null;

  const velocityClamp = opts?.velocityClamp ?? VELOCITY_CLAMP_DEFAULT;
  const volClamp = opts?.volClamp ?? VOL_CLAMP_DEFAULT;

  const velocityPct = (close - ma50) / ma50;
  const velocityNorm = clamp(velocityPct / velocityClamp, 0, 1);

  const halfBand = (rule.rsiHigh - rule.rsiLow) / 2;
  const rsiMid = (rule.rsiHigh + rule.rsiLow) / 2;
  const rsiSweetSpot = clamp(1 - Math.abs(rsi - rsiMid) / halfBand, 0, 1);

  const volRatio = todayVol / avgVol20;
  const volNorm = clamp(volRatio / volClamp, 0, 1);

  const scoreVelocity = velocityNorm * 50;
  const scoreRsi = rsiSweetSpot * 30;
  const scoreVolume = volNorm * 20;
  const score = round1(scoreVelocity + scoreRsi + scoreVolume);

  const tier: ScanResult["tier"] = score >= 85 ? "High" : score >= 70 ? "Med" : "Low";

  return {
    ticker,
    close: round2(close),
    ma50: round2(ma50),
    ma200: round2(ma200),
    rsi14: round2(rsi),
    volume: todayVol,
    avgVolume20: Math.round(avgVol20),
    score,
    tier,
    indices: getIndicesFor(ticker),
    breakdown: {
      rule1MacroPass: rule1,
      rule2MomentumPass: rule2,
      rule3GoldenPass: rule3,
      rule4RsiPass: rule4,
      velocityPct: round4(velocityPct),
      rsiSweetSpot: round2(rsiSweetSpot),
      volRatio: round2(volRatio),
      scoreVelocity: round1(scoreVelocity),
      scoreRsi: round1(scoreRsi),
      scoreVolume: round1(scoreVolume),
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
