import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STRATEGY_DEFAULTS,
  computePositionShares,
  computeShares,
  computeTpSl,
  round2,
  type StrategySettings,
} from "../lib/strategy";

// A concrete settings object built from the shipped defaults, overridable per test.
function settings(overrides: Partial<StrategySettings> = {}): StrategySettings {
  return { ...STRATEGY_DEFAULTS, ...overrides };
}

test("round2 rounds to two decimals", () => {
  assert.equal(round2(1.234), 1.23);
  assert.equal(round2(1.236), 1.24);
  assert.equal(round2(108.399999), 108.4);
  assert.equal(round2(0.1 + 0.2), 0.3); // 0.30000000000000004 → 0.3
});

test("computeTpSl places TP/SL at the configured percentages of entry", () => {
  const s = settings({ tpPct: 0.04, slPct: 0.02 });
  const { targetTp, targetSl } = computeTpSl(100, s);
  assert.equal(targetTp, 104); // 100 * 1.04
  assert.equal(targetSl, 98); // 100 * 0.98
});

test("computeTpSl keeps a strict 1:2 reward:risk when tp = 2 * sl", () => {
  const s = settings({ tpPct: 0.04, slPct: 0.02 });
  const entry = 250;
  const { targetTp, targetSl } = computeTpSl(entry, s);
  const reward = targetTp - entry;
  const risk = entry - targetSl;
  assert.equal(round2(reward / risk), 2);
});

test("computePositionShares sizes so a stop-out costs exactly the risk budget", () => {
  // $10,000 capital, 1% risk = $100 budget. SL 2% below a $100 entry = $2/share risk.
  const s = settings({ totalCapital: 10_000, riskPerTradePct: 1, slPct: 0.02 });
  const shares = computePositionShares(100, s);
  assert.equal(shares, 50); // floor(100 / 2)
});

test("computePositionShares floors to whole shares", () => {
  const s = settings({ totalCapital: 10_000, riskPerTradePct: 1, slPct: 0.03 });
  // budget $100, risk/share = 100 * 0.03 = $3 → 33.33 → 33
  assert.equal(computePositionShares(100, s), 33);
});

test("computePositionShares returns 0 when the stop is not below entry", () => {
  const s = settings({ slPct: 0 }); // SL == entry → zero risk per share
  assert.equal(computePositionShares(100, s), 0);
});

test("computeShares is bounded by the risk budget when capital is ample", () => {
  // risk $250, $10/share → 25 shares; capital cap 100000/100 = 1000 shares (not binding)
  assert.equal(computeShares(250, 100, 90, 100_000), 25);
});

test("computeShares is capped by what the capital can actually buy", () => {
  // risk budget alone would allow 100 shares, but $500 only buys 5 at $100.
  assert.equal(computeShares(1_000, 100, 90, 500), 5);
});

test("computeShares supports fractional shares, rounded down to 2 decimals", () => {
  // risk $10, $3/share → 3.333… → floor to 3.33; capital 1000/100 = 10 (not binding)
  assert.equal(computeShares(10, 100, 97, 1_000), 3.33);
});

test("computeShares returns 0 for non-positive risk-per-share or inputs", () => {
  assert.equal(computeShares(100, 100, 100, 10_000), 0); // stop == entry
  assert.equal(computeShares(100, 100, 105, 10_000), 0); // stop above entry
  assert.equal(computeShares(0, 100, 95, 10_000), 0); // no risk budget
  assert.equal(computeShares(100, 0, -5, 10_000), 0); // no entry price
});
