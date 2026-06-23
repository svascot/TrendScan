// GMMA backtest engine — pure logic, no IO.
//
// A "time machine" over historical daily bars. It reuses the *exact same*
// `evaluateGmmaTicker` the live scanner uses, but instead of evaluating only
// "today" it walks day-by-day forward: for each historical bar it asks "would
// the scanner have fired a signal if this bar were today?" (using only bars up
// to and including that day — no lookahead), then simulates the resulting trade
// against the following bars to see whether the stop or target was hit first.
//
// Conservative assumptions (so the result errs pessimistic, not optimistic):
//  - Same-bar SL+TP touch  → assume the STOP filled (worst case).
//  - Gap through the stop  → fill at the (worse) open, not the stop price.
//  - Gap through the target → fill at the (worse-for-us) open if it gapped past.
//  - One position per ticker at a time (no pyramiding / re-entry while open).
//
// R-multiple is the realised reward in units of initial risk (entry − stop).
// Commission is folded into R as a fraction of notional per side, which is
// position-size-independent, so the metrics never depend on dollar sizing.

import { evaluateGmmaTicker, type GmmaEvalOptions } from "./gmma-scanner";
import { type DailyBar } from "./scanner";

export interface BacktestParams {
  // Exit at the close after this many bars if neither stop nor target is hit.
  maxHoldDays: number;
  // Commission/slippage as a fraction of notional, charged on BOTH entry and
  // exit (e.g. 0.0005 = 5 bps/side). Folded into the realised R.
  feeRate: number;
  // Don't evaluate a signal until at least this many bars of history exist.
  // Must be >= the scanner's own minimum (60). Larger = more warm-up realism.
  warmupBars: number;
  // Strategy-rule overrides passed straight to evaluateGmmaTicker (stop anchor,
  // min-stop floor, RR, TP gate…). Omitted keys fall back to the live defaults.
  gmma?: Partial<GmmaEvalOptions>;
  // Exit mechanics. Defaults to the fixed TP/SL behavior when omitted.
  exit?: ExitConfig;
  // Market-regime gate: given a signal's date, return false to SKIP the entry
  // (e.g. SPY below its 200-day MA). Omitted = take every signal.
  regimeOk?: (date: string) => boolean;
}

export const BACKTEST_DEFAULTS: BacktestParams = {
  maxHoldDays: 10,
  feeRate: 0.0005, // 5 bps per side
  warmupBars: 60,
};

export type ExitReason = "tp" | "sl" | "trail" | "timeout";

// How a position is closed once it's open. "fixed" is the original behavior
// (fixed TP + fixed SL). The trailing modes drop the fixed TP and let the
// winner run until a ratcheting stop catches it — the "let winners run" idea.
export interface ExitConfig {
  mode: "fixed" | "trail" | "be_trail";
  trailAtrMult: number; // chandelier distance: highestHigh − k·ATR (trail modes)
  beTriggerR: number; // move the stop to breakeven after price reaches +this·R (be_trail)
}

export const EXIT_DEFAULTS: ExitConfig = {
  mode: "fixed",
  trailAtrMult: 3,
  beTriggerR: 1,
};

export interface Trade {
  ticker: string;
  entryDate: string; // YYYY-MM-DD (close of signal bar)
  entryPrice: number;
  sl: number;
  tp: number;
  riskPerShare: number;
  exitDate: string;
  exitPrice: number;
  exitReason: ExitReason;
  holdDays: number; // bars held (entry → exit)
  rGross: number; // (exit − entry) / risk, before fees
  rNet: number; // rGross minus round-trip commission, in R units
}

export interface BacktestMetrics {
  trades: number;
  wins: number;
  losses: number;
  winRate: number; // 0..1, by rNet > 0
  avgR: number; // expectancy per trade, in R (net)
  totalR: number; // sum of net R
  profitFactor: number; // gross R won / gross R lost (net), Infinity if no losers
  maxDrawdownR: number; // deepest peak-to-trough of the cumulative-R curve, in R
  avgHoldDays: number;
  bestR: number;
  worstR: number;
  tpCount: number;
  slCount: number;
  trailCount: number;
  timeoutCount: number;
}

export interface EquityPoint {
  date: string; // exit date of the trade
  ticker: string;
  rNet: number;
  cumR: number; // running cumulative net R after this trade
}

export interface BacktestResult {
  trades: Trade[];
  metrics: BacktestMetrics;
  equityCurve: EquityPoint[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

interface ExitOutcome {
  exitIdx: number;
  exitPrice: number;
  reason: ExitReason;
}

// Walk the bars after entry and decide where/how the trade closes. The stop
// level coming into each bar is set from PRIOR bars only — no intraday
// lookahead. Conservative on touches: stop is checked before the target.
function resolveExit(
  bars: readonly DailyBar[],
  entryIdx: number,
  maxExit: number,
  entry: number,
  initialSl: number,
  tp: number,
  atr: number,
  risk: number,
  exit: ExitConfig,
): ExitOutcome {
  if (exit.mode === "fixed") {
    for (let j = entryIdx + 1; j <= maxExit; j++) {
      const bar = bars[j];
      if (bar.l <= initialSl) {
        return { exitIdx: j, exitPrice: bar.o < initialSl ? bar.o : initialSl, reason: "sl" };
      }
      if (bar.h >= tp) {
        return { exitIdx: j, exitPrice: bar.o > tp ? bar.o : tp, reason: "tp" };
      }
    }
    return { exitIdx: maxExit, exitPrice: bars[maxExit].c, reason: "timeout" };
  }

  // Trailing modes: no fixed TP. The stop ratchets up to a chandelier level
  // (highest high since entry − k·ATR); in be_trail it also floors at breakeven
  // once price has tagged +beTriggerR·R.
  let stop = initialSl;
  let highest = bars[entryIdx].h;
  let beArmed = false;
  const k = exit.trailAtrMult;

  for (let j = entryIdx + 1; j <= maxExit; j++) {
    const bar = bars[j];
    if (bar.l <= stop) {
      const exitPrice = bar.o < stop ? bar.o : stop;
      // A stop that has ratcheted above the initial level is a trail exit;
      // otherwise the original protective stop took it out.
      const reason: ExitReason = stop > initialSl + 1e-9 ? "trail" : "sl";
      return { exitIdx: j, exitPrice, reason };
    }
    // Ratchet using THIS bar's high, applied to the next bar's stop.
    highest = Math.max(highest, bar.h);
    if (exit.mode === "be_trail" && !beArmed && bar.h >= entry + exit.beTriggerR * risk) {
      beArmed = true;
    }
    let candidate = highest - k * atr;
    if (exit.mode === "be_trail" && beArmed) candidate = Math.max(candidate, entry);
    stop = Math.max(stop, candidate);
  }
  return { exitIdx: maxExit, exitPrice: bars[maxExit].c, reason: "timeout" };
}

// Build a date → "ok to be long" predicate from an index's bars: true when the
// index closed above its `maPeriod`-day SMA that day. Dates before the MA is
// warm (or not in the index series) return false — so fetch the index with
// enough extra history to cover the whole test window.
export function buildRegimeFilter(
  indexBars: readonly DailyBar[],
  maPeriod = 200,
): (date: string) => boolean {
  const closes = indexBars.map((b) => b.c);
  const ok = new Map<string, boolean>();
  let sum = 0;
  for (let i = 0; i < indexBars.length; i++) {
    sum += closes[i];
    if (i >= maPeriod) sum -= closes[i - maPeriod];
    if (i >= maPeriod - 1) {
      const ma = sum / maPeriod;
      ok.set(indexBars[i].t.slice(0, 10), closes[i] > ma);
    }
  }
  return (date: string) => ok.get(date) ?? false;
}

// Simulate every trade the GMMA strategy would have taken on one symbol over its
// full bar history. Bars must be sorted oldest → newest.
export function simulateTicker(
  ticker: string,
  bars: readonly DailyBar[],
  params: BacktestParams,
): Trade[] {
  const exitCfg = params.exit ?? EXIT_DEFAULTS;
  const trades: Trade[] = [];
  const lastIdx = bars.length - 1;

  // Need at least one future bar to resolve a trade.
  let i = Math.max(params.warmupBars, 0);
  while (i < lastIdx) {
    // History as the scanner would have seen it on day `i` — no lookahead.
    const slice = bars.slice(0, i + 1);
    const signal = evaluateGmmaTicker(ticker, slice, {
      ...params.gmma,
      skipChartBars: true, // backtest never reads chartBars — skip the work
    });
    if (!signal) {
      i++;
      continue;
    }

    // Market-regime gate: skip the signal if the market isn't in an uptrend.
    if (params.regimeOk && !params.regimeOk(bars[i].t.slice(0, 10))) {
      i++;
      continue;
    }

    const entry = bars[i].c; // enter at the signal bar's close
    const sl = signal.targetSl;
    const tp = signal.targetTp;
    const risk = entry - sl;
    if (risk <= 0) {
      i++;
      continue;
    }

    const maxExit = Math.min(i + params.maxHoldDays, lastIdx);
    const { exitIdx, exitPrice, reason } = resolveExit(
      bars,
      i,
      maxExit,
      entry,
      sl,
      tp,
      signal.atr14,
      risk,
      exitCfg,
    );

    const rGross = (exitPrice - entry) / risk;
    // Round-trip commission in R units. Fees = feeRate·(entry+exit)·shares and
    // risk$ = risk·shares, so shares cancel — sizing-independent.
    const feeR = (params.feeRate * (entry + exitPrice)) / risk;
    const rNet = rGross - feeR;

    trades.push({
      ticker,
      entryDate: bars[i].t.slice(0, 10),
      entryPrice: round2(entry),
      sl: round2(sl),
      tp: round2(tp),
      riskPerShare: round2(risk),
      exitDate: bars[exitIdx].t.slice(0, 10),
      exitPrice: round2(exitPrice),
      exitReason: reason,
      holdDays: exitIdx - i,
      rGross: round4(rGross),
      rNet: round4(rNet),
    });

    // No re-entry while a position is (was) open: resume the day after exit.
    i = exitIdx + 1;
  }

  return trades;
}

// Aggregate a flat list of trades into headline metrics + an equity curve.
export function computeMetrics(trades: readonly Trade[]): {
  metrics: BacktestMetrics;
  equityCurve: EquityPoint[];
} {
  // Order the equity curve by exit date so the cumulative-R curve is chronological.
  const ordered = [...trades].sort((a, b) =>
    a.exitDate < b.exitDate ? -1 : a.exitDate > b.exitDate ? 1 : 0,
  );

  let cumR = 0;
  let peak = 0;
  let maxDrawdownR = 0;
  let grossWon = 0;
  let grossLost = 0;
  let wins = 0;
  let holdSum = 0;
  let bestR = trades.length ? -Infinity : 0;
  let worstR = trades.length ? Infinity : 0;
  let tpCount = 0;
  let slCount = 0;
  let trailCount = 0;
  let timeoutCount = 0;

  const equityCurve: EquityPoint[] = [];
  for (const t of ordered) {
    cumR += t.rNet;
    peak = Math.max(peak, cumR);
    maxDrawdownR = Math.min(maxDrawdownR, cumR - peak);

    if (t.rNet > 0) {
      wins++;
      grossWon += t.rNet;
    } else {
      grossLost += -t.rNet;
    }
    holdSum += t.holdDays;
    bestR = Math.max(bestR, t.rNet);
    worstR = Math.min(worstR, t.rNet);
    if (t.exitReason === "tp") tpCount++;
    else if (t.exitReason === "sl") slCount++;
    else if (t.exitReason === "trail") trailCount++;
    else timeoutCount++;

    equityCurve.push({
      date: t.exitDate,
      ticker: t.ticker,
      rNet: round4(t.rNet),
      cumR: round4(cumR),
    });
  }

  const n = trades.length;
  const metrics: BacktestMetrics = {
    trades: n,
    wins,
    losses: n - wins,
    winRate: n ? round4(wins / n) : 0,
    avgR: n ? round4(cumR / n) : 0,
    totalR: round4(cumR),
    profitFactor:
      grossLost > 0 ? round4(grossWon / grossLost) : grossWon > 0 ? Infinity : 0,
    maxDrawdownR: round4(maxDrawdownR),
    avgHoldDays: n ? round2(holdSum / n) : 0,
    bestR: n ? round4(bestR) : 0,
    worstR: n ? round4(worstR) : 0,
    tpCount,
    slCount,
    trailCount,
    timeoutCount,
  };

  return { metrics, equityCurve };
}

// End-to-end: simulate every symbol, then aggregate.
export function runBacktest(
  barsBySymbol: Record<string, DailyBar[]>,
  params: BacktestParams = BACKTEST_DEFAULTS,
): BacktestResult {
  const allTrades: Trade[] = [];
  for (const [ticker, bars] of Object.entries(barsBySymbol)) {
    if (!bars || bars.length < params.warmupBars + 1) continue;
    allTrades.push(...simulateTicker(ticker, bars, params));
  }
  const { metrics, equityCurve } = computeMetrics(allTrades);
  return { trades: allTrades, metrics, equityCurve };
}
