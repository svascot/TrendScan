// GMMA sweep #3 — reward:risk on the winning config.
//
//   npm run sweeprr
//   npm run sweeprr -- --start 2021-01-01 --end 2023-12-31   # incl. 2022 bear
//   npm run sweeprr -- --regime none                          # turn off the filter
//
// Sweep #2 settled the config: TP-reachability gate OFF + market-regime filter
// (index > MA200) + a FIXED target (trailing lost). This sweep varies just the
// reward:risk multiple on that config to find the best fixed target.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { fetchDailyBars, fetchDailyBarsRange } from "../lib/alpaca";
import {
  runBacktest,
  buildRegimeFilter,
  BACKTEST_DEFAULTS,
  type BacktestParams,
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

async function main(): Promise<void> {
  loadEnv(resolve(process.cwd(), ".env.local"));
  const args = parseArgs(process.argv.slice(2));
  const lookbackDays = num(args.lookback, 730);
  const maxHoldDays = num(args.hold, 15);
  const regimeMode = (args.regime ?? "spy").toLowerCase(); // spy | qqq | both | none
  const gateOn = (args.gate ?? "off").toLowerCase() === "on"; // TP-reachability gate
  const symbols = args.symbols
    ? args.symbols.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    : [...UNIVERSE];

  const start = args.start;
  const end = args.end;
  const windowLabel = start ? `${start}→${end ?? "now"}` : `${lookbackDays}d`;
  const idxStart = start
    ? new Date(new Date(start).getTime() - 450 * 86400_000).toISOString().slice(0, 10)
    : undefined;

  console.log(`\nGMMA sweep #3 (RR) · ${windowLabel} · regime=${regimeMode} · gate=${gateOn ? "on" : "off"} · hold≤${maxHoldDays}…`);

  const [bars, indexBars] = await Promise.all([
    start ? fetchDailyBarsRange(symbols, start, end) : fetchDailyBars(symbols, lookbackDays),
    start
      ? fetchDailyBarsRange(["SPY", "QQQ"], idxStart!, end)
      : fetchDailyBars(["SPY", "QQQ"], lookbackDays + 450),
  ]);
  const spy = indexBars["SPY"] as DailyBar[] | undefined;
  const qqq = indexBars["QQQ"] as DailyBar[] | undefined;
  if (regimeMode !== "none" && (!spy?.length || !qqq?.length)) {
    throw new Error("Could not fetch SPY/QQQ bars for the regime filter.");
  }
  const regimeSpy = spy ? buildRegimeFilter(spy, 200) : () => true;
  const regimeQqq = qqq ? buildRegimeFilter(qqq, 200) : () => true;
  const regimeOk =
    regimeMode === "none"
      ? undefined
      : regimeMode === "qqq"
        ? regimeQqq
        : regimeMode === "both"
          ? (d: string) => regimeSpy(d) && regimeQqq(d)
          : regimeSpy;
  console.log(`  → ${Object.keys(bars).length} symbols. Sweeping RR…\n`);

  const base: Omit<BacktestParams, "gmma" | "exit" | "regimeOk"> = {
    maxHoldDays,
    feeRate: num(args.fee, BACKTEST_DEFAULTS.feeRate),
    warmupBars: num(args.warmup, BACKTEST_DEFAULTS.warmupBars),
  };

  const rrValues = [1.5, 2, 2.5, 3];
  const header =
    pad("RR", 6) + padL("trades", 8) + padL("win%", 7) + padL("avgR", 9) +
    padL("totalR", 9) + padL("PF", 7) + padL("maxDD", 9) + padL("hold", 7);
  console.log(header);
  console.log("─".repeat(header.length));

  for (const rr of rrValues) {
    const { metrics: m } = runBacktest(bars, {
      ...base,
      gmma: { enforceTpReachable: gateOn, rrTarget: rr },
      exit: { mode: "fixed", trailAtrMult: 3, beTriggerR: 1 },
      regimeOk,
    });
    const pf = m.profitFactor === Infinity ? "∞" : m.profitFactor.toFixed(2);
    console.log(
      pad(`1:${rr}`, 6) +
        padL(String(m.trades), 8) +
        padL((m.winRate * 100).toFixed(1), 7) +
        padL(m.avgR.toFixed(3), 9) +
        padL(m.totalR.toFixed(2), 9) +
        padL(pf, 7) +
        padL(m.maxDrawdownR.toFixed(2), 9) +
        padL(m.avgHoldDays.toFixed(1), 7),
    );
  }
  console.log(`\nFixed target, gate=${gateOn ? "on" : "off"}, regime=${regimeMode}. Higher RR = lower win%, bigger wins.\n`);
}

main().catch((err) => {
  console.error("\nSweep failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
