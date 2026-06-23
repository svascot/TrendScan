// GMMA sweep #2 — market regime × exit mechanics, with the TP-reachability gate
// OFF (sweep #1 showed the gate, not the stop, was throttling trade count).
//
//   npm run sweep2
//   npm run sweep2 -- --lookback 730 --hold 20 --trailmult 3
//   npm run sweep2 -- --symbols AAPL,MSFT,NVDA
//
// Three levers, combined:
//   1. regime  — only take longs when the index closed above its 200-day MA
//                (none / SPY / QQQ / both).
//   2. exit    — fixed 1:2  ·  trail (chandelier highHigh−k·ATR)  ·  be_trail
//                (breakeven after +1R, then trail). The trailing modes "let
//                winners run" — no fixed TP.
//   3. gate    — TP-reachability OFF for all scenarios (lever already validated).
//
// Trailing wants room, so this sweep defaults to hold≤20 (vs 10 elsewhere); the
// "none · fixed" row is the apples-to-apples reference at the same hold.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { fetchDailyBars, fetchDailyBarsRange } from "../lib/alpaca";
import {
  runBacktest,
  buildRegimeFilter,
  BACKTEST_DEFAULTS,
  type BacktestParams,
  type ExitConfig,
} from "../lib/backtest";
import { type DailyBar } from "../lib/scanner";
import { UNIVERSE } from "../lib/universe";

function loadEnv(path: string): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[a.slice(2)] = next;
        i++;
      } else out[a.slice(2)] = "true";
    }
  }
  return out;
}

function num(v: string | undefined, fallback: number): number {
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
function padL(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

interface Scenario {
  name: string;
  params: BacktestParams;
}

interface Row {
  name: string;
  trades: number;
  winRate: number;
  avgR: number;
  totalR: number;
  pf: number;
  maxDD: number;
  hold: number;
  mix: string; // exit breakdown
}

async function main(): Promise<void> {
  loadEnv(resolve(process.cwd(), ".env.local"));
  const args = parseArgs(process.argv.slice(2));
  const lookbackDays = num(args.lookback, 730);
  const maxHoldDays = num(args.hold, 20);
  const trailMult = num(args.trailmult, 3);
  const symbols = args.symbols
    ? args.symbols.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    : [...UNIVERSE];

  // Explicit window (e.g. --start 2021-01-01 --end 2023-12-31) overrides the
  // "N days back" mode — needed to test specific periods like the 2022 bear.
  const start = args.start;
  const end = args.end;
  const windowLabel = start ? `${start}→${end ?? "now"}` : `${lookbackDays}d`;
  // Index needs ~450 extra calendar days before the window so MA200 is warm.
  const idxStart = start
    ? new Date(new Date(start).getTime() - 450 * 86400_000).toISOString().slice(0, 10)
    : undefined;

  console.log(`\nGMMA sweep #2 (regime × exits) · ${windowLabel} · ${symbols.length} symbols · hold≤${maxHoldDays}…`);

  // Universe bars for the test window; index bars with extra history so the
  // 200-day MA is warm across the whole window.
  const [bars, indexBars] = await Promise.all([
    start
      ? fetchDailyBarsRange(symbols, start, end)
      : fetchDailyBars(symbols, lookbackDays),
    start
      ? fetchDailyBarsRange(["SPY", "QQQ"], idxStart!, end)
      : fetchDailyBars(["SPY", "QQQ"], lookbackDays + 450),
  ]);
  const spy = indexBars["SPY"] as DailyBar[] | undefined;
  const qqq = indexBars["QQQ"] as DailyBar[] | undefined;
  if (!spy?.length || !qqq?.length) {
    throw new Error("Could not fetch SPY/QQQ bars for the regime filter.");
  }
  const regimeSpy = buildRegimeFilter(spy, 200);
  const regimeQqq = buildRegimeFilter(qqq, 200);
  const regimeBoth = (d: string) => regimeSpy(d) && regimeQqq(d);
  console.log(`  → ${Object.keys(bars).length} symbols + SPY/QQQ. Running scenarios…\n`);

  const base = {
    maxHoldDays,
    feeRate: num(args.fee, BACKTEST_DEFAULTS.feeRate),
    warmupBars: num(args.warmup, BACKTEST_DEFAULTS.warmupBars),
  };

  const regimes: { key: string; ok?: (d: string) => boolean }[] = [
    { key: "none" },
    { key: "spy", ok: regimeSpy },
    { key: "qqq", ok: regimeQqq },
    { key: "both", ok: regimeBoth },
  ];
  const exits: { key: string; cfg: ExitConfig }[] = [
    { key: "fixed", cfg: { mode: "fixed", trailAtrMult: trailMult, beTriggerR: 1 } },
    { key: "trail", cfg: { mode: "trail", trailAtrMult: trailMult, beTriggerR: 1 } },
    { key: "be+trail", cfg: { mode: "be_trail", trailAtrMult: trailMult, beTriggerR: 1 } },
  ];

  const scenarios: Scenario[] = [];
  // Reference: the live strategy exactly (gate on, fixed, no regime).
  scenarios.push({
    name: "LIVE ref (gate on)",
    params: { ...base, gmma: {}, exit: exits[0].cfg },
  });
  // The grid: every regime × exit, all with the TP gate OFF.
  for (const r of regimes) {
    for (const e of exits) {
      scenarios.push({
        name: `${r.key} · ${e.key}`,
        params: {
          ...base,
          gmma: { enforceTpReachable: false },
          exit: e.cfg,
          regimeOk: r.ok,
        },
      });
    }
  }

  const rows: Row[] = [];
  for (const s of scenarios) {
    const { metrics: m } = runBacktest(bars, s.params);
    rows.push({
      name: s.name,
      trades: m.trades,
      winRate: m.winRate,
      avgR: m.avgR,
      totalR: m.totalR,
      pf: m.profitFactor,
      maxDD: m.maxDrawdownR,
      hold: m.avgHoldDays,
      mix: `${m.tpCount}tp/${m.slCount}sl/${m.trailCount}tr/${m.timeoutCount}to`,
    });
  }

  const MIN_SAMPLE = 20;
  rows.sort((a, b) => {
    const aOk = a.trades >= MIN_SAMPLE ? 1 : 0;
    const bOk = b.trades >= MIN_SAMPLE ? 1 : 0;
    if (aOk !== bOk) return bOk - aOk;
    return b.avgR - a.avgR;
  });

  const header =
    pad("scenario", 22) + padL("trades", 8) + padL("win%", 7) + padL("avgR", 9) +
    padL("totalR", 9) + padL("PF", 7) + padL("maxDD", 9) + padL("hold", 7) + "  exits";
  console.log(header);
  console.log("─".repeat(header.length));
  for (const r of rows) {
    const pf = r.pf === Infinity ? "∞" : r.pf.toFixed(2);
    const flag = r.trades < MIN_SAMPLE ? " ·low n" : "";
    console.log(
      pad(r.name, 22) +
        padL(String(r.trades), 8) +
        padL((r.winRate * 100).toFixed(1), 7) +
        padL(r.avgR.toFixed(3), 9) +
        padL(r.totalR.toFixed(2), 9) +
        padL(pf, 7) +
        padL(r.maxDD.toFixed(2), 9) +
        padL(r.hold.toFixed(1), 7) +
        "  " + r.mix + flag,
    );
  }
  console.log(
    `\nRanked by avg R (expectancy). exits = tp/sl/trail/timeout counts. trailmult k=${trailMult}, hold≤${maxHoldDays}.`,
  );
  console.log(`All grid rows have the TP gate OFF; "LIVE ref" is the current strategy (gate on, fixed, no regime).\n`);
}

main().catch((err) => {
  console.error("\nSweep failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
