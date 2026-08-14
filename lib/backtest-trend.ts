// Trend Scanner backtest adapter + score diagnostics.
//
// The Trend Scanner ships a 0..100 composite score (ROC/velocity/ATR/volume/RSI)
// and a tier cutoff (High ≥85) that were hand-picked, never fitted to outcomes.
// This module drives the SAME `evaluateTicker` the live scanner uses through the
// generic backtest engine, records the score at entry on every trade, then
// buckets the realised outcomes by that score. The question it answers:
//
//   does a higher score actually hit the take-profit more often?
//
// If the TP-hit rate is flat across score buckets, the score ranks nothing and
// the weights need refitting. Nothing here changes live scanner behavior.

import { type SignalFn, type Trade } from "./backtest";
import { atr as atr14fn } from "./indicators";
import { evaluateTicker, type DailyBar, type ScanRule } from "./scanner";

// How the stop and target are placed on a Trend signal.
//
//  - "fixed": the live behavior — flat percentages off the entry, the same for
//    every symbol regardless of its volatility (lib/strategy.ts computeTpSl).
//  - "atr": volatility-scaled — the stop sits slAtrMult·ATR below entry and the
//    target projects rrTarget × that risk, so every setup gets the same number
//    of ATR of breathing room and the same reward:risk (how GMMA does it).
export type TrendTargetMode = "fixed" | "atr";

export interface TrendSignalConfig {
  mode: TrendTargetMode;
  // mode "fixed" — fractions of entry price, e.g. 0.04 / 0.02 for +4% / −2%.
  tpPct: number;
  slPct: number;
  // mode "atr"
  slAtrMult: number; // stop distance in ATR(14)
  rrTarget: number; // target = entry + rrTarget × risk
  // Port of the GMMA realism gate: reject the setup when the target sits above
  // the recent swing high (overhead supply the price has to chew through), with
  // a small clearance so it fills before the wall. Off = live Trend behavior.
  enforceTpReachable: boolean;
  resistanceLookback: number;
  tpClearanceAtr: number;
}

export const TREND_SIGNAL_DEFAULTS: TrendSignalConfig = {
  mode: "fixed",
  tpPct: 0.04,
  slPct: 0.02,
  slAtrMult: 1.5,
  rrTarget: 2,
  enforceTpReachable: false,
  resistanceLookback: 20,
  tpClearanceAtr: 0.25,
};

const ATR_PERIOD = 14;

// Wrap the live Trend Scanner as a backtest signal source. `evaluateTicker`
// returns null unless all six gatekeeper rules pass, which is exactly the live
// entry gate, so the simulated entries are the rows the dashboard would list.
export function trendSignalFn(
  rule: ScanRule,
  cfg: Partial<TrendSignalConfig> = {},
): SignalFn {
  const c: TrendSignalConfig = { ...TREND_SIGNAL_DEFAULTS, ...cfg };

  return (ticker, barsToDate) => {
    const res = evaluateTicker(ticker, barsToDate, rule, { skipChartBars: true });
    if (!res) return null;

    // Use the raw close, not res.close — that one is rounded to 2dp for display,
    // while the engine enters at the bar's exact close. Deriving the levels from
    // the rounded value would put the stop a fraction of a cent off the intended
    // distance, so the realised R wouldn't be exactly −1 on a stop-out.
    const entry = barsToDate[barsToDate.length - 1].c;
    // res.atrValue is likewise rounded; recompute at full precision so the
    // ATR-scaled levels don't inherit the rounding.
    const a =
      atr14fn(
        barsToDate.map((b) => b.h),
        barsToDate.map((b) => b.l),
        barsToDate.map((b) => b.c),
        ATR_PERIOD,
      ) ?? res.atrValue;
    if (!(a > 0)) return null;

    let sl: number;
    let tp: number;
    if (c.mode === "atr") {
      sl = entry - c.slAtrMult * a;
      tp = entry + c.rrTarget * (entry - sl);
    } else {
      sl = entry * (1 - c.slPct);
      tp = entry * (1 + c.tpPct);
    }
    if (sl >= entry || tp <= entry) return null;

    if (c.enforceTpReachable) {
      const lookback = Math.max(1, c.resistanceLookback);
      let resistance = -Infinity;
      for (let i = Math.max(0, barsToDate.length - lookback); i < barsToDate.length; i++) {
        if (barsToDate[i].h > resistance) resistance = barsToDate[i].h;
      }
      if (tp > resistance - c.tpClearanceAtr * a) return null;
    }

    return { sl, tp, atr: a, score: res.score };
  };
}

// ---------------------------------------------------------------------------
// Score → outcome diagnostics
// ---------------------------------------------------------------------------

export interface ScoreBucket {
  label: string;
  loScore: number;
  hiScore: number;
  trades: number;
  // The headline number: share of trades that reached the target before the
  // stop. `resolveExit` checks the stop first on a same-bar touch, so this is a
  // conservative P(TP before SL).
  tpRate: number;
  slRate: number;
  timeoutRate: number;
  winRate: number; // by rNet > 0 — differs from tpRate because timeouts can be green
  avgR: number;
  totalR: number;
  profitFactor: number;
}

function summarize(label: string, group: readonly Trade[]): ScoreBucket {
  const n = group.length;
  const scores = group.map((t) => t.score ?? 0);
  let tp = 0;
  let sl = 0;
  let timeout = 0;
  let wins = 0;
  let sumR = 0;
  let won = 0;
  let lost = 0;

  for (const t of group) {
    if (t.exitReason === "tp") tp++;
    else if (t.exitReason === "sl") sl++;
    else if (t.exitReason === "timeout") timeout++;
    if (t.rNet > 0) {
      wins++;
      won += t.rNet;
    } else {
      lost += -t.rNet;
    }
    sumR += t.rNet;
  }

  return {
    label,
    loScore: n ? Math.min(...scores) : 0,
    hiScore: n ? Math.max(...scores) : 0,
    trades: n,
    tpRate: n ? tp / n : 0,
    slRate: n ? sl / n : 0,
    timeoutRate: n ? timeout / n : 0,
    winRate: n ? wins / n : 0,
    avgR: n ? sumR / n : 0,
    totalR: sumR,
    profitFactor: lost > 0 ? won / lost : won > 0 ? Infinity : 0,
  };
}

// Split trades into `n` equal-count groups ordered by score (quantiles). Equal
// counts keep every bucket statistically comparable, which fixed score bands
// can't guarantee when the score distribution is lopsided.
export function bucketByQuantile(trades: readonly Trade[], n = 5): ScoreBucket[] {
  const scored = trades.filter((t) => t.score !== undefined);
  if (!scored.length || n < 1) return [];
  const sorted = [...scored].sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

  const out: ScoreBucket[] = [];
  for (let q = 0; q < n; q++) {
    const from = Math.floor((q * sorted.length) / n);
    const to = Math.floor(((q + 1) * sorted.length) / n);
    const group = sorted.slice(from, to);
    if (!group.length) continue;
    out.push(summarize(`Q${q + 1}`, group));
  }
  return out;
}

// Split trades by explicit score cut points, e.g. [70, 85] → <70, 70–85, ≥85 —
// the bands the dashboard's Low/Med/High tiers actually use.
export function bucketByBands(trades: readonly Trade[], edges: readonly number[]): ScoreBucket[] {
  const scored = trades.filter((t) => t.score !== undefined);
  if (!scored.length) return [];
  const cuts = [...edges].sort((a, b) => a - b);

  const out: ScoreBucket[] = [];
  for (let i = 0; i <= cuts.length; i++) {
    const lo = i === 0 ? -Infinity : cuts[i - 1];
    const hi = i === cuts.length ? Infinity : cuts[i];
    const group = scored.filter((t) => {
      const s = t.score ?? 0;
      return s >= lo && s < hi;
    });
    const label =
      i === 0 ? `<${cuts[0]}` : i === cuts.length ? `≥${cuts[cuts.length - 1]}` : `${lo}–${hi}`;
    if (!group.length) {
      out.push({ ...summarize(label, []), label });
      continue;
    }
    out.push(summarize(label, group));
  }
  return out;
}

// Spearman rank correlation between the entry score and the realised R. This is
// the single-number version of "does the score rank outcomes": ~0 means no
// ranking information at all. Ties get average ranks.
export function scoreRankCorrelation(trades: readonly Trade[]): number {
  const scored = trades.filter((t) => t.score !== undefined);
  const n = scored.length;
  if (n < 3) return 0;

  const ranks = (values: readonly number[]): number[] => {
    const idx = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const r = new Array<number>(values.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k].i] = avg;
      i = j + 1;
    }
    return r;
  };

  const rs = ranks(scored.map((t) => t.score ?? 0));
  const rr = ranks(scored.map((t) => t.rNet));
  const mean = (a: readonly number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const ms = mean(rs);
  const mr = mean(rr);

  let cov = 0;
  let vs = 0;
  let vr = 0;
  for (let i = 0; i < n; i++) {
    const ds = rs[i] - ms;
    const dr = rr[i] - mr;
    cov += ds * dr;
    vs += ds * ds;
    vr += dr * dr;
  }
  if (vs === 0 || vr === 0) return 0;
  return cov / Math.sqrt(vs * vr);
}

// How far the target sits from the entry in ATR units — the "is +4% even
// reachable in the hold window" diagnostic. A target 3 ATR away needs a
// sustained run; a stop 0.4 ATR away gets tagged by noise.
export interface DistanceStats {
  trades: number;
  avgTpAtr: number;
  medianTpAtr: number;
  avgSlAtr: number;
  medianSlAtr: number;
}

export function targetDistanceStats(trades: readonly Trade[]): DistanceStats {
  const tpA: number[] = [];
  const slA: number[] = [];
  for (const t of trades) {
    const a = t.atrAtEntry;
    if (!a || a <= 0) continue;
    tpA.push((t.tp - t.entryPrice) / a);
    slA.push((t.entryPrice - t.sl) / a);
  }
  const median = (xs: number[]): number => {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    trades: tpA.length,
    avgTpAtr: mean(tpA),
    medianTpAtr: median(tpA),
    avgSlAtr: mean(slA),
    medianSlAtr: median(slA),
  };
}
