import { awesomeOscillatorSeries, emaSeries } from "./indicators";
import type { GmmaChartBar } from "./gmma-scanner";

/* ════════════════════════════════════════════════════════════════════════════
 * EXAMPLE GMMA SETUP — purely illustrative, NOT a real ticker or recommendation.
 *
 * The price path below is synthetic (a deterministic uptrend + a final pullback
 * into the short ribbon) but it is run through the SAME indicator math the live
 * scanner uses (`emaSeries`, `awesomeOscillatorSeries`), so the Guppy fan and
 * the Awesome Oscillator render exactly as an authentic setup would. The numbers
 * are made up "with grace" so nobody mistakes "STOCK" for an investable symbol.
 * ════════════════════════════════════════════════════════════════════════════ */

export const EXAMPLE_TICKER = "STOCK";

// Generate more bars than we show so EMA(60) + AO(34) are fully warmed up across
// the entire visible window — no null gaps in the fan.
const TOTAL_BARS = 160;
const VISIBLE_BARS = 90;
// Anchor the synthetic price so the last bar lands on a clean round entry.
const TARGET_LAST_CLOSE = 100;
const PULLBACK_BARS = 7; // a gentle final dip back into the short ribbon

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// Deterministic business-day date strings (skip Sat/Sun), counting forward from
// a fixed anchor so the build is stable and timezone-independent.
function businessDates(count: number): string[] {
  const out: string[] = [];
  // 2024-06-03 is a Monday — a safe deterministic anchor.
  const cursor = new Date("2024-06-03T00:00:00Z");
  while (out.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

// Build the synthetic close path: a steady upward drift with an organic swing,
// then ease the last few bars down so price pulls back to the slow edge of the
// short ribbon — the canonical GMMA continuation entry.
function buildCloses(): number[] {
  const raw: number[] = [];
  for (let i = 0; i < TOTAL_BARS; i++) {
    const drift = 60 + i * 0.32; // long-term uptrend
    const swing = 4 * Math.sin(i / 11); // medium wave
    const noise = 0.8 * Math.sin(i * 1.7) + 0.5 * Math.cos(i * 0.9); // fine wiggle
    raw.push(drift + swing + noise);
  }
  // Final pullback: subtract a small ramp over the last PULLBACK_BARS bars.
  for (let k = 0; k < PULLBACK_BARS; k++) {
    const idx = TOTAL_BARS - PULLBACK_BARS + k;
    raw[idx] -= (k + 1) * 0.55;
  }
  // Shift the whole path so the last close lands on TARGET_LAST_CLOSE.
  const offset = TARGET_LAST_CLOSE - raw[raw.length - 1];
  return raw.map((c) => c + offset);
}

function buildExampleBars(): GmmaChartBar[] {
  const closes = buildCloses();
  // Derive a tight daily range around each close for the AO median price.
  const highs = closes.map((c, i) => c + 0.6 + 0.3 * Math.abs(Math.sin(i * 1.3)));
  const lows = closes.map((c, i) => c - 0.6 - 0.3 * Math.abs(Math.cos(i * 1.1)));

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
  const ao = awesomeOscillatorSeries(highs, lows);

  const dates = businessDates(TOTAL_BARS);
  const r2 = (n: number | null) => (n === null ? null : round2(n));
  const r4 = (n: number | null) => (n === null ? null : round4(n));

  const all: GmmaChartBar[] = closes.map((c, i) => ({
    date: dates[i],
    close: round2(c),
    ema3: r2(s3[i]),
    ema5: r2(s5[i]),
    ema8: r2(s8[i]),
    ema10: r2(s10[i]),
    ema12: r2(s12[i]),
    ema15: r2(s15[i]),
    ema30: r2(s30[i]),
    ema35: r2(s35[i]),
    ema40: r2(s40[i]),
    ema45: r2(s45[i]),
    ema50: r2(s50[i]),
    ema60: r2(s60[i]),
    ao: r4(ao[i]),
  }));

  return all.slice(-VISIBLE_BARS);
}

export interface ExampleGmma {
  ticker: string;
  entry: number; // last close — the example entry
  targetSl: number; // SL just below the prior swing low
  targetTp: number; // strict 1:2 take-profit on price
  supportLow: number; // the prior swing low the SL anchors to
  resistanceHigh: number; // the prior swing high the TP sits below
  riskPerShare: number; // entry − SL
  rrRatio: number; // 2 by construction
  chartBars: GmmaChartBar[];
}

// Round, illustrative trade-plan figures — chosen to read cleanly and to honour
// the four rules: SL at the prior low ($94), strict 1:2 TP ($112) that still
// sits below the prior resistance ($118), R:R 1:2.
export const EXAMPLE_GMMA: ExampleGmma = {
  ticker: EXAMPLE_TICKER,
  entry: 100,
  supportLow: 95,
  targetSl: 94,
  resistanceHigh: 118,
  targetTp: 112,
  riskPerShare: 6,
  rrRatio: 2,
  chartBars: buildExampleBars(),
};
