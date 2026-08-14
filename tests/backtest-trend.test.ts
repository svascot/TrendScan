import test from "node:test";
import assert from "node:assert/strict";

import {
  simulateTicker,
  type BacktestParams,
  type SignalFn,
  type Trade,
} from "../lib/backtest";
import {
  bucketByBands,
  bucketByQuantile,
  scoreRankCorrelation,
  targetDistanceStats,
  trendSignalFn,
} from "../lib/backtest-trend";
import { evaluateTicker, rulesForRisk, type DailyBar } from "../lib/scanner";

// ---------------------------------------------------------------------------
// Bar builders
// ---------------------------------------------------------------------------

function bar(day: number, close: number, opts: Partial<DailyBar> = {}): DailyBar {
  // Day 1 = 2020-01-01, one bar per calendar day (the engine only reads order).
  const t = new Date(Date.UTC(2020, 0, day)).toISOString();
  return {
    o: opts.o ?? close,
    h: opts.h ?? close * 1.01,
    l: opts.l ?? close * 0.99,
    c: close,
    v: opts.v ?? 1_000_000,
    t,
  };
}

// A long uptrend ending in a shallow 4-bar pullback — enough bars to warm MA200
// and land inside all six Trend rules at the final bar: close > MA50 > MA200,
// RSI ≈ 58 (band 55–65), ROC(9) ≈ +1.4%, ATR ≈ 2.5% of price (floor 1.5%).
// The pullback matters: an unbroken uptrend pins RSI above the 65 ceiling, which
// is exactly the "buy the dip in an uptrend" shape the scanner is built to find.
const PULLBACK_BARS = 4;
const PULLBACK_DROP = 0.004;

function uptrendBars(n: number): DailyBar[] {
  const bars: DailyBar[] = [];
  let price = 50;
  for (let i = 1; i <= n; i++) {
    // Drift up ~0.35%/bar, then ease off over the final PULLBACK_BARS. The
    // alternating wobble gives a ~2% intrabar range so ATR clears the floor.
    price *= i <= n - PULLBACK_BARS ? 1.0035 : 1 - PULLBACK_DROP;
    const wobble = i % 2 === 0 ? 1.008 : 0.996;
    const c = price * wobble;
    bars.push(bar(i, c, { o: c * 0.999, h: c * 1.012, l: c * 0.988 }));
  }
  return bars;
}

function fakeTrade(score: number, rNet: number, reason: Trade["exitReason"]): Trade {
  return {
    ticker: "TEST",
    score,
    atrAtEntry: 2,
    entryDate: "2025-01-02",
    entryPrice: 100,
    sl: 98,
    tp: 104,
    riskPerShare: 2,
    exitDate: "2025-01-06",
    exitPrice: 100 + rNet * 2,
    exitReason: reason,
    holdDays: 4,
    rGross: rNet,
    rNet,
  };
}

const BASE_PARAMS: BacktestParams = {
  maxHoldDays: 10,
  feeRate: 0,
  warmupBars: 3,
};

// ---------------------------------------------------------------------------
// Engine generalisation
// ---------------------------------------------------------------------------

test("simulateTicker drives an injected signal source and records score + ATR", () => {
  // Fires once on bar index 3, then never again.
  const signal: SignalFn = (_t, bars) =>
    bars.length === 4 ? { sl: 90, tp: 120, atr: 5, score: 77.5 } : null;

  // Entry at 100 (bar 3), then a bar that tags 120 → TP.
  const bars = [
    bar(1, 80),
    bar(2, 90),
    bar(3, 95),
    bar(4, 100, { h: 101, l: 99 }),
    bar(5, 118, { h: 121, l: 100, o: 101 }),
  ];

  const trades = simulateTicker("TEST", bars, { ...BASE_PARAMS, signal });
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.score, 77.5);
  assert.equal(t.atrAtEntry, 5);
  assert.equal(t.entryPrice, 100);
  assert.equal(t.exitReason, "tp");
  assert.equal(t.tp, 120);
  // (120 − 100) / (100 − 90) = 2R, fees zero.
  assert.equal(t.rNet, 2);
});

test("simulateTicker uses the signal's stop and exits at SL when price breaks it", () => {
  const signal: SignalFn = (_t, bars) =>
    bars.length === 4 ? { sl: 95, tp: 130, atr: 3 } : null;
  const bars = [
    bar(1, 80),
    bar(2, 90),
    bar(3, 95),
    bar(4, 100, { h: 101, l: 99 }),
    bar(5, 96, { h: 100, l: 94, o: 99 }),
  ];

  const trades = simulateTicker("TEST", bars, { ...BASE_PARAMS, signal });
  assert.equal(trades.length, 1);
  assert.equal(trades[0].exitReason, "sl");
  assert.equal(trades[0].exitPrice, 95);
  assert.equal(trades[0].rNet, -1); // exactly −1R
  assert.equal(trades[0].score, undefined); // absent when the source omits it
});

test("entryFrom suppresses signals dated before the window (preroll bars)", () => {
  const signal: SignalFn = () => ({ sl: 90, tp: 110, atr: 4 });
  const bars = [bar(1, 100), bar(2, 100), bar(3, 100), bar(4, 100), bar(5, 100)];

  const withoutGate = simulateTicker("TEST", bars, { ...BASE_PARAMS, signal });
  assert.ok(withoutGate.length >= 1, "signal fires without the gate");

  // Bar 5 = 2020-01-05; require entries on/after that day → the earlier bars
  // are preroll only, and bar 5 is the last index so no trade can resolve.
  const gated = simulateTicker("TEST", bars, {
    ...BASE_PARAMS,
    signal,
    entryFrom: "2020-01-05",
  });
  assert.equal(gated.length, 0);

  // A window that starts at bar 4 leaves exactly one resolvable entry.
  const gated4 = simulateTicker("TEST", bars, {
    ...BASE_PARAMS,
    signal,
    entryFrom: "2020-01-04",
  });
  assert.equal(gated4.length, 1);
  assert.equal(gated4[0].entryDate, "2020-01-04");
});

// ---------------------------------------------------------------------------
// Trend signal adapter
// ---------------------------------------------------------------------------

test("trendSignalFn fires only where the live evaluateTicker fires", () => {
  const rule = rulesForRisk("med");
  const bars = uptrendBars(260);
  const fn = trendSignalFn(rule);

  const live = evaluateTicker("TEST", bars, rule);
  const sig = fn("TEST", bars);
  assert.equal(sig === null, live === null, "adapter and live scanner must agree");

  // Below the MA200 warm-up both must decline.
  assert.equal(fn("TEST", bars.slice(0, 100)), null);
  assert.equal(evaluateTicker("TEST", bars.slice(0, 100), rule), null);
});

test("trendSignalFn fixed mode reproduces the live flat-percentage TP/SL", () => {
  const rule = rulesForRisk("med");
  const bars = uptrendBars(260);
  const live = evaluateTicker("TEST", bars, rule);
  assert.ok(live, "fixture must produce a live Trend signal");

  const sig = trendSignalFn(rule, { mode: "fixed", tpPct: 0.04, slPct: 0.02 })("TEST", bars);
  assert.ok(sig);
  // Same flat percentages lib/strategy.ts computeTpSl applies in the UI, but off
  // the exact close the engine enters at (live.close is rounded for display).
  const entry = bars[bars.length - 1].c;
  assert.ok(Math.abs(sig.tp - entry * 1.04) < 1e-9);
  assert.ok(Math.abs(sig.sl - entry * 0.98) < 1e-9);
  assert.ok(Math.abs(sig.tp - live.close * 1.04) < 0.01, "matches the displayed TP to the cent");
  assert.equal(sig.score, live.score);
});

test("trendSignalFn atr mode scales the stop to volatility and holds the RR", () => {
  const rule = rulesForRisk("med");
  const bars = uptrendBars(260);
  const sig = trendSignalFn(rule, { mode: "atr", slAtrMult: 1.5, rrTarget: 2 })("TEST", bars);
  assert.ok(sig);

  const entry = bars[bars.length - 1].c;
  const risk = entry - sig.sl;
  assert.ok(Math.abs(risk - 1.5 * sig.atr) < 1e-6, "stop sits 1.5 ATR below entry");
  assert.ok(Math.abs((sig.tp - entry) / risk - 2) < 1e-6, "target holds 1:2");
});

test("trendSignalFn TP-reachability gate rejects targets above recent resistance", () => {
  const rule = rulesForRisk("med");
  const bars = uptrendBars(260);

  // An unreachably distant target must be gated out; the same setup without the
  // gate (and with a modest target) still fires.
  const gated = trendSignalFn(rule, {
    mode: "atr",
    slAtrMult: 1.5,
    rrTarget: 12, // far above any recent high
    enforceTpReachable: true,
  })("TEST", bars);
  assert.equal(gated, null);

  const ungated = trendSignalFn(rule, {
    mode: "atr",
    slAtrMult: 1.5,
    rrTarget: 12,
    enforceTpReachable: false,
  })("TEST", bars);
  assert.ok(ungated, "the same setup passes with the gate off");
});

// ---------------------------------------------------------------------------
// Score diagnostics
// ---------------------------------------------------------------------------

test("bucketByQuantile splits into equal-count buckets ordered by score", () => {
  const trades = [
    fakeTrade(10, -1, "sl"),
    fakeTrade(20, -1, "sl"),
    fakeTrade(30, 2, "tp"),
    fakeTrade(40, 2, "tp"),
  ];
  const buckets = bucketByQuantile(trades, 2);
  assert.equal(buckets.length, 2);
  assert.equal(buckets[0].trades, 2);
  assert.equal(buckets[1].trades, 2);
  assert.deepEqual([buckets[0].loScore, buckets[0].hiScore], [10, 20]);
  assert.deepEqual([buckets[1].loScore, buckets[1].hiScore], [30, 40]);
  assert.equal(buckets[0].tpRate, 0);
  assert.equal(buckets[1].tpRate, 1);
  assert.equal(buckets[1].avgR, 2);
});

test("bucketByQuantile tpRate counts only TP exits, winRate counts green timeouts", () => {
  // A timeout that closed green is a win but NOT a TP hit — the two rates must
  // differ, since the whole question is "did it reach the target".
  const trades = [fakeTrade(50, 0.4, "timeout"), fakeTrade(60, 2, "tp")];
  const [b] = bucketByQuantile(trades, 1);
  assert.equal(b.trades, 2);
  assert.equal(b.tpRate, 0.5);
  assert.equal(b.winRate, 1);
  assert.equal(b.timeoutRate, 0.5);
});

test("bucketByBands cuts on the dashboard tier edges and keeps empty bands visible", () => {
  const trades = [fakeTrade(65, -1, "sl"), fakeTrade(75, 2, "tp")];
  const bands = bucketByBands(trades, [70, 85]);
  assert.equal(bands.length, 3);
  assert.equal(bands[0].label, "<70");
  assert.equal(bands[0].trades, 1);
  assert.equal(bands[1].trades, 1); // 70–85
  assert.equal(bands[2].label, "≥85");
  assert.equal(bands[2].trades, 0); // reported, not dropped
});

test("scoreRankCorrelation is +1 when score orders outcomes, ~0 when it doesn't", () => {
  const perfect = [
    fakeTrade(10, -1, "sl"),
    fakeTrade(20, 0, "timeout"),
    fakeTrade(30, 1, "tp"),
    fakeTrade(40, 2, "tp"),
  ];
  assert.ok(Math.abs(scoreRankCorrelation(perfect) - 1) < 1e-9);

  const inverted = [
    fakeTrade(10, 2, "tp"),
    fakeTrade(20, 1, "tp"),
    fakeTrade(30, 0, "timeout"),
    fakeTrade(40, -1, "sl"),
  ];
  assert.ok(Math.abs(scoreRankCorrelation(inverted) + 1) < 1e-9);

  // All scores identical → no ranking information.
  const flat = [fakeTrade(80, 2, "tp"), fakeTrade(80, -1, "sl"), fakeTrade(80, 1, "tp")];
  assert.equal(scoreRankCorrelation(flat), 0);
});

test("targetDistanceStats expresses TP/SL distance in ATR units", () => {
  // entry 100, tp 104, sl 98, ATR 2 → TP 2 ATR away, SL 1 ATR away.
  const stats = targetDistanceStats([fakeTrade(80, 2, "tp")]);
  assert.equal(stats.trades, 1);
  assert.equal(stats.avgTpAtr, 2);
  assert.equal(stats.avgSlAtr, 1);
  assert.equal(stats.medianTpAtr, 2);
});
