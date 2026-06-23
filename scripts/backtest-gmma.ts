// GMMA strategy backtest runner.
//
//   npx tsx scripts/backtest-gmma.ts                 # defaults
//   npm run backtest -- --lookback 730 --hold 10 --fee 0.0005
//   npm run backtest -- --symbols AAPL,MSFT,NVDA     # quick subset
//
// Flags (all optional):
//   --lookback <days>   calendar days of history to pull from Alpaca   (default 730)
//   --hold <days>       max bars to hold before timing out             (default 10)
//   --fee <fraction>    commission/slippage per side, of notional      (default 0.0005)
//   --warmup <bars>     min bars before the first signal is allowed     (default 60)
//   --symbols <list>    comma-separated tickers instead of the full universe
//   --out <dir>         output directory                                (default ./backtest-output)
//
// Reads Alpaca creds from .env.local. Writes a console summary plus
// backtest-trades.csv and backtest-equity.json into the output dir.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { fetchDailyBars } from "../lib/alpaca";
import {
  runBacktest,
  BACKTEST_DEFAULTS,
  type BacktestParams,
  type Trade,
  type EquityPoint,
} from "../lib/backtest";
import { UNIVERSE } from "../lib/universe";

// --- Minimal .env.local loader (a standalone script doesn't get Next's env). ---
function loadEnv(path: string): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

// --- Tiny arg parser: --flag value ---
function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = "true";
      }
    }
  }
  return out;
}

function num(v: string | undefined, fallback: number): number {
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function fmtPct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}
function fmtR(x: number): string {
  return `${x >= 0 ? "+" : ""}${x.toFixed(2)} R`;
}

function toCsv(trades: readonly Trade[]): string {
  const header = [
    "ticker",
    "entryDate",
    "entryPrice",
    "sl",
    "tp",
    "riskPerShare",
    "exitDate",
    "exitPrice",
    "exitReason",
    "holdDays",
    "rGross",
    "rNet",
  ].join(",");
  const rows = trades.map((t) =>
    [
      t.ticker,
      t.entryDate,
      t.entryPrice,
      t.sl,
      t.tp,
      t.riskPerShare,
      t.exitDate,
      t.exitPrice,
      t.exitReason,
      t.holdDays,
      t.rGross,
      t.rNet,
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

async function main(): Promise<void> {
  loadEnv(resolve(process.cwd(), ".env.local"));

  const args = parseArgs(process.argv.slice(2));
  const lookbackDays = num(args.lookback, 730);
  const params: BacktestParams = {
    maxHoldDays: num(args.hold, BACKTEST_DEFAULTS.maxHoldDays),
    feeRate: num(args.fee, BACKTEST_DEFAULTS.feeRate),
    warmupBars: num(args.warmup, BACKTEST_DEFAULTS.warmupBars),
  };
  const outDir = resolve(process.cwd(), args.out ?? "backtest-output");

  const symbols = args.symbols
    ? args.symbols.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    : [...UNIVERSE];

  console.log(
    `\nGMMA Backtest · pulling ${lookbackDays}d history for ${symbols.length} symbols from Alpaca…`,
  );
  const t0 = Date.now();
  const barsBySymbol = await fetchDailyBars(symbols, lookbackDays);
  const fetched = Object.keys(barsBySymbol).length;
  const fetchSecs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  → got bars for ${fetched} symbols in ${fetchSecs}s. Simulating…`);

  const t1 = Date.now();
  const { trades, metrics, equityCurve } = runBacktest(barsBySymbol, params);
  const simSecs = ((Date.now() - t1) / 1000).toFixed(1);

  // Establish the date span actually covered.
  let minDate = "9999";
  let maxDate = "0000";
  for (const bars of Object.values(barsBySymbol)) {
    if (!bars.length) continue;
    const first = bars[0].t.slice(0, 10);
    const last = bars[bars.length - 1].t.slice(0, 10);
    if (first < minDate) minDate = first;
    if (last > maxDate) maxDate = last;
  }

  const pf =
    metrics.profitFactor === Infinity ? "∞ (no losers)" : metrics.profitFactor.toFixed(2);

  console.log(`
GMMA Backtest · ${minDate} → ${maxDate} · ${fetched} symbols   (sim ${simSecs}s)
─────────────────────────────────────────────
Trades simulated:      ${metrics.trades}
Win rate:              ${fmtPct(metrics.winRate)}   (${metrics.wins}W / ${metrics.losses}L)
Avg R / trade:         ${fmtR(metrics.avgR)}   ${metrics.avgR > 0 ? "(positive expectancy ✓)" : "(negative expectancy ✗)"}
Total R:               ${fmtR(metrics.totalR)}
Profit factor:         ${pf}
Max drawdown:          ${fmtR(metrics.maxDrawdownR)}
Avg hold:              ${metrics.avgHoldDays} days
Best / worst:          ${fmtR(metrics.bestR)} / ${fmtR(metrics.worstR)}
Exits:                 ${metrics.tpCount} TP · ${metrics.slCount} SL · ${metrics.trailCount} trail · ${metrics.timeoutCount} timeout
Params:                hold≤${params.maxHoldDays}d · fee ${(params.feeRate * 100).toFixed(3)}%/side · warmup ${params.warmupBars} bars
─────────────────────────────────────────────`);

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const csvPath = join(outDir, "backtest-trades.csv");
  const eqPath = join(outDir, "backtest-equity.json");
  writeFileSync(csvPath, toCsv(trades), "utf8");
  writeFileSync(
    eqPath,
    JSON.stringify({ params, lookbackDays, metrics, equityCurve }, null, 2),
    "utf8",
  );

  console.log(`Wrote ${trades.length} trades → ${csvPath}`);
  console.log(`Wrote equity curve (${equityCurve.length} pts) → ${eqPath}\n`);
}

main().catch((err) => {
  console.error("\nBacktest failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
