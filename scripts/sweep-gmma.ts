// GMMA stop-fix sweep.
//
//   npm run sweep
//   npm run sweep -- --lookback 730
//   npm run sweep -- --symbols AAPL,MSFT,NVDA   # quick subset
//
// Fetches the universe ONCE, then re-runs the backtest over a grid of
// stop-construction variants (the #1/#2 levers: minimum-stop floor + stop
// anchor) and prints a table ranked by expectancy (avg R / trade).
//
// Each stop idea is run twice:
//   • gate ON  — the live TP-reachability gate, i.e. deployable as-is.
//   • gate OFF — the same idea with the gate relaxed, to isolate the stop's
//                effect on win rate (widening stops widens the projected TP,
//                which the gate would otherwise reject — confounding the read).

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { fetchDailyBars } from "../lib/alpaca";
import { runBacktest, BACKTEST_DEFAULTS, type BacktestParams } from "../lib/backtest";
import { type GmmaEvalOptions } from "../lib/gmma-scanner";
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

// The #1/#2 stop ideas. Each becomes two rows (gate on / gate off).
interface Idea {
  name: string;
  gmma: Partial<GmmaEvalOptions>;
}
const IDEAS: Idea[] = [
  { name: "baseline (support, no floor)", gmma: {} },
  { name: "support + min 1.5 ATR", gmma: { minStopAtr: 1.5 } },
  { name: "support + min 2.0 ATR", gmma: { minStopAtr: 2.0 } },
  { name: "support + min 2%", gmma: { minStopPct: 2 } },
  { name: "support + min 3%", gmma: { minStopPct: 3 } },
  { name: "anchor EMA30", gmma: { stopAnchor: "ema30" } },
  { name: "EMA30 + min 1.5 ATR", gmma: { stopAnchor: "ema30", minStopAtr: 1.5 } },
];

interface Row {
  name: string;
  gate: string;
  trades: number;
  winRate: number;
  avgR: number;
  totalR: number;
  pf: number;
  maxDD: number;
  hold: number;
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
  const symbols = args.symbols
    ? args.symbols.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    : [...UNIVERSE];

  console.log(`\nGMMA stop-fix sweep · pulling ${lookbackDays}d for ${symbols.length} symbols…`);
  const bars = await fetchDailyBars(symbols, lookbackDays);
  console.log(`  → got ${Object.keys(bars).length} symbols. Running ${IDEAS.length * 2} scenarios…\n`);

  const base: Omit<BacktestParams, "gmma"> = {
    maxHoldDays: num(args.hold, BACKTEST_DEFAULTS.maxHoldDays),
    feeRate: num(args.fee, BACKTEST_DEFAULTS.feeRate),
    warmupBars: num(args.warmup, BACKTEST_DEFAULTS.warmupBars),
  };

  const rows: Row[] = [];
  for (const idea of IDEAS) {
    for (const gateOn of [true, false]) {
      const { metrics } = runBacktest(bars, {
        ...base,
        gmma: { ...idea.gmma, enforceTpReachable: gateOn },
      });
      rows.push({
        name: idea.name,
        gate: gateOn ? "on" : "off",
        trades: metrics.trades,
        winRate: metrics.winRate,
        avgR: metrics.avgR,
        totalR: metrics.totalR,
        pf: metrics.profitFactor,
        maxDD: metrics.maxDrawdownR,
        hold: metrics.avgHoldDays,
      });
    }
  }

  // Rank by expectancy (avg R), but only among scenarios with a usable sample.
  const MIN_SAMPLE = 20;
  rows.sort((a, b) => {
    const aOk = a.trades >= MIN_SAMPLE ? 1 : 0;
    const bOk = b.trades >= MIN_SAMPLE ? 1 : 0;
    if (aOk !== bOk) return bOk - aOk;
    return b.avgR - a.avgR;
  });

  const header =
    pad("scenario", 30) + pad("gate", 6) + padL("trades", 8) + padL("win%", 8) +
    padL("avgR", 9) + padL("totalR", 9) + padL("PF", 7) + padL("maxDD", 9) + padL("hold", 7);
  console.log(header);
  console.log("─".repeat(header.length));
  for (const r of rows) {
    const pf = r.pf === Infinity ? "∞" : r.pf.toFixed(2);
    const flag = r.trades < MIN_SAMPLE ? " ·low n" : "";
    console.log(
      pad(r.name, 30) +
        pad(r.gate, 6) +
        padL(String(r.trades), 8) +
        padL((r.winRate * 100).toFixed(1), 8) +
        padL(r.avgR.toFixed(3), 9) +
        padL(r.totalR.toFixed(2), 9) +
        padL(pf, 7) +
        padL(r.maxDD.toFixed(2), 9) +
        padL(r.hold.toFixed(1), 7) +
        flag,
    );
  }
  console.log(
    `\nRanked by avg R (expectancy). Scenarios with <${MIN_SAMPLE} trades sink to the bottom (·low n) — too thin to trust.`,
  );
  console.log(`gate on = deployable (live TP-reachability gate). gate off = isolates the stop effect.\n`);
}

main().catch((err) => {
  console.error("\nSweep failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
