// Trend Scanner backtest — answers "does the 0..100 score predict hitting TP?"
//
//   npm run backtest-trend                                      # last 730d
//   npm run backtest-trend -- --start 2025-01-01 --end 2026-07-31
//   npm run backtest-trend -- --start 2021-01-01 --end 2023-12-31   # incl. 2022 bear
//   npm run backtest-trend -- --targets atr --gate on            # compare fixes
//   npm run backtest-trend -- --symbols AAPL,MSFT,NVDA           # quick subset
//
// Flags (all optional):
//   --start/--end <date>  explicit window (YYYY-MM-DD). Extra "preroll" history
//                         is fetched automatically to warm MA200 so the window
//                         is fully tradeable from day one.
//   --lookback <days>     used when --start is absent                (default 730)
//   --hold <days>         max bars held before timing out            (default 10)
//   --fee <fraction>      commission/slippage per side               (default 0.0005)
//   --risk low|med|high   which Trend rule set to scan               (default med)
//   --targets fixed|atr   flat % TP/SL (live behavior) or ATR-scaled (default fixed)
//   --tp / --sl <pct>     fixed-mode target/stop, in percent         (default 4 / 2)
//   --slatr <mult>        atr-mode stop distance in ATR              (default 1.5)
//   --rr <mult>           atr-mode reward:risk                       (default 2)
//   --gate on|off         require the TP to sit below recent resistance (default off)
//   --buckets <n>         score quantile buckets                     (default 5)
//   --symbols <list>      comma-separated tickers instead of the universe
//   --out <dir>           output directory                (default ./backtest-output)
//
// Reads Alpaca creds from .env.local.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { fetchDailyBars, fetchDailyBarsRange } from "../lib/alpaca";
import {
  BACKTEST_DEFAULTS,
  computeMetrics,
  simulateTicker,
  type BacktestParams,
  type Trade,
} from "../lib/backtest";
import {
  bucketByBands,
  bucketByQuantile,
  scoreRankCorrelation,
  targetDistanceStats,
  TREND_SIGNAL_DEFAULTS,
  trendSignalFn,
  type ScoreBucket,
  type TrendTargetMode,
} from "../lib/backtest-trend";
import { rulesForRisk, type RiskLevel } from "../lib/scanner";
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

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}
function fmtR(x: number): string {
  return `${x >= 0 ? "+" : ""}${x.toFixed(3)}`;
}
function pf(x: number): string {
  return x === Infinity ? "∞" : x.toFixed(2);
}
function pad(s: string, w: number): string {
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}
function padL(s: string, w: number): string {
  return s.length >= w ? s : " ".repeat(w - s.length) + s;
}

function bucketTable(title: string, buckets: readonly ScoreBucket[]): string {
  const head =
    pad("Bucket", 8) +
    padL("Score range", 14) +
    padL("N", 7) +
    padL("TP hit", 9) +
    padL("SL hit", 9) +
    padL("Timeout", 9) +
    padL("Win%", 8) +
    padL("Avg R", 9) +
    padL("PF", 7);
  const rows = buckets.map((b) =>
    pad(b.label, 8) +
    padL(b.trades ? `${b.loScore.toFixed(1)}–${b.hiScore.toFixed(1)}` : "—", 14) +
    padL(String(b.trades), 7) +
    padL(b.trades ? pct(b.tpRate) : "—", 9) +
    padL(b.trades ? pct(b.slRate) : "—", 9) +
    padL(b.trades ? pct(b.timeoutRate) : "—", 9) +
    padL(b.trades ? pct(b.winRate) : "—", 8) +
    padL(b.trades ? fmtR(b.avgR) : "—", 9) +
    padL(b.trades ? pf(b.profitFactor) : "—", 7),
  );
  return [`\n${title}`, "─".repeat(head.length), head, ...rows].join("\n");
}

function toCsv(trades: readonly Trade[]): string {
  const header = [
    "ticker",
    "score",
    "entryDate",
    "entryPrice",
    "sl",
    "tp",
    "atrAtEntry",
    "tpDistAtr",
    "slDistAtr",
    "riskPerShare",
    "exitDate",
    "exitPrice",
    "exitReason",
    "holdDays",
    "rNet",
  ].join(",");
  const rows = trades.map((t) =>
    [
      t.ticker,
      t.score ?? "",
      t.entryDate,
      t.entryPrice,
      t.sl,
      t.tp,
      t.atrAtEntry,
      t.atrAtEntry > 0 ? ((t.tp - t.entryPrice) / t.atrAtEntry).toFixed(2) : "",
      t.atrAtEntry > 0 ? ((t.entryPrice - t.sl) / t.atrAtEntry).toFixed(2) : "",
      t.riskPerShare,
      t.exitDate,
      t.exitPrice,
      t.exitReason,
      t.holdDays,
      t.rNet,
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

// MA200 needs 201 bars before the first signal can fire, so an explicit window
// gets ~400 extra calendar days of history fetched ahead of it; `entryFrom`
// then confines actual entries to the requested window.
const PREROLL_DAYS = 420;

function shiftDate(date: string, days: number): string {
  return new Date(new Date(date).getTime() + days * 86400_000).toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  loadEnv(resolve(process.cwd(), ".env.local"));

  const args = parseArgs(process.argv.slice(2));
  const risk = (args.risk ?? "med") as RiskLevel;
  const rule = rulesForRisk(risk);
  const mode = (args.targets ?? TREND_SIGNAL_DEFAULTS.mode) as TrendTargetMode;
  const gate = args.gate === "on";
  const nBuckets = Math.max(1, Math.round(num(args.buckets, 5)));
  const lookbackDays = num(args.lookback, 730);
  const start = args.start;
  const end = args.end;
  const outDir = resolve(process.cwd(), args.out ?? "backtest-output");

  const signalCfg = {
    mode,
    tpPct: num(args.tp, TREND_SIGNAL_DEFAULTS.tpPct * 100) / 100,
    slPct: num(args.sl, TREND_SIGNAL_DEFAULTS.slPct * 100) / 100,
    slAtrMult: num(args.slatr, TREND_SIGNAL_DEFAULTS.slAtrMult),
    rrTarget: num(args.rr, TREND_SIGNAL_DEFAULTS.rrTarget),
    enforceTpReachable: gate,
  };

  const params: BacktestParams = {
    maxHoldDays: num(args.hold, BACKTEST_DEFAULTS.maxHoldDays),
    feeRate: num(args.fee, BACKTEST_DEFAULTS.feeRate),
    // The Trend scanner can't produce a signal before MA(maLong) is warm.
    warmupBars: num(args.warmup, rule.maLong + 1),
    signal: trendSignalFn(rule, signalCfg),
    entryFrom: start,
  };

  const symbols = args.symbols
    ? args.symbols.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    : [...UNIVERSE];

  const windowLabel = start ? `${start} → ${end ?? "now"}` : `last ${lookbackDays}d`;
  const targetLabel =
    mode === "atr"
      ? `ATR-scaled (SL ${signalCfg.slAtrMult} ATR · RR 1:${signalCfg.rrTarget})`
      : `fixed (TP +${(signalCfg.tpPct * 100).toFixed(1)}% · SL −${(signalCfg.slPct * 100).toFixed(1)}%)`;

  console.log(
    `\nTrend Scanner Backtest · ${windowLabel} · ${symbols.length} symbols` +
      `\n  risk=${risk} · targets=${targetLabel} · TP-reachability gate=${gate ? "ON" : "off"}` +
      `\n  Fetching bars from Alpaca${start ? ` (+${PREROLL_DAYS}d preroll to warm MA${rule.maLong})` : ""}…`,
  );

  const t0 = Date.now();
  const barsBySymbol = start
    ? await fetchDailyBarsRange(symbols, shiftDate(start, -PREROLL_DAYS), end)
    : await fetchDailyBars(symbols, lookbackDays + PREROLL_DAYS);
  const fetched = Object.keys(barsBySymbol).length;
  console.log(
    `  → bars for ${fetched} symbols in ${((Date.now() - t0) / 1000).toFixed(1)}s. Simulating…`,
  );

  const t1 = Date.now();
  const allTrades: Trade[] = [];
  let done = 0;
  for (const [ticker, bars] of Object.entries(barsBySymbol)) {
    if (bars && bars.length >= params.warmupBars + 1) {
      allTrades.push(...simulateTicker(ticker, bars, params));
    }
    if (++done % 250 === 0) {
      console.log(`     …${done}/${fetched} symbols · ${allTrades.length} trades so far`);
    }
  }
  const { metrics } = computeMetrics(allTrades);
  const simSecs = ((Date.now() - t1) / 1000).toFixed(1);

  let minDate = "9999";
  let maxDate = "0000";
  for (const t of allTrades) {
    if (t.entryDate < minDate) minDate = t.entryDate;
    if (t.exitDate > maxDate) maxDate = t.exitDate;
  }

  const dist = targetDistanceStats(allTrades);
  const rho = scoreRankCorrelation(allTrades);
  const quantiles = bucketByQuantile(allTrades, nBuckets);
  const bands = bucketByBands(allTrades, [70, 85]);

  console.log(`
Trend Scanner · ${allTrades.length ? `${minDate} → ${maxDate}` : "no trades"} · ${fetched} symbols   (sim ${simSecs}s)
─────────────────────────────────────────────
Trades simulated:      ${metrics.trades}
TP hit (before SL):    ${metrics.trades ? pct(metrics.tpCount / metrics.trades) : "—"}   (${metrics.tpCount} of ${metrics.trades})
SL hit:                ${metrics.trades ? pct(metrics.slCount / metrics.trades) : "—"}   (${metrics.slCount})
Timed out:             ${metrics.trades ? pct(metrics.timeoutCount / metrics.trades) : "—"}   (${metrics.timeoutCount})
Win rate (net R > 0):  ${pct(metrics.winRate)}
Avg R / trade:         ${fmtR(metrics.avgR)} R   ${metrics.avgR > 0 ? "(positive expectancy ✓)" : "(negative expectancy ✗)"}
Total R:               ${fmtR(metrics.totalR)} R
Profit factor:         ${pf(metrics.profitFactor)}
Max drawdown:          ${fmtR(metrics.maxDrawdownR)} R
Avg hold:              ${metrics.avgHoldDays} days   (cap ${params.maxHoldDays})

Target reachability (how far the levels sit, in ATR):
  TP distance:         ${dist.avgTpAtr.toFixed(2)} ATR avg · ${dist.medianTpAtr.toFixed(2)} ATR median
  SL distance:         ${dist.avgSlAtr.toFixed(2)} ATR avg · ${dist.medianSlAtr.toFixed(2)} ATR median

Score vs outcome:
  Spearman ρ(score, realised R) = ${rho.toFixed(4)}   ${
    Math.abs(rho) < 0.05
      ? "→ essentially ZERO: the score carries no ranking information"
      : Math.abs(rho) < 0.15
        ? "→ weak"
        : "→ meaningful"
  }`);

  console.log(bucketTable(`Outcomes by score quantile (${nBuckets} equal-count buckets)`, quantiles));
  console.log(bucketTable("Outcomes by dashboard tier band (Low <70 · Med 70–85 · High ≥85)", bands));

  if (quantiles.length >= 2) {
    const lo = quantiles[0];
    const hi = quantiles[quantiles.length - 1];
    const lift = hi.tpRate - lo.tpRate;
    console.log(
      `\nTop vs bottom bucket: TP hit ${pct(hi.tpRate)} vs ${pct(lo.tpRate)} ` +
        `(${lift >= 0 ? "+" : ""}${(lift * 100).toFixed(1)} pts) · avg R ${fmtR(hi.avgR)} vs ${fmtR(lo.avgR)}`,
    );
  }
  console.log();

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const tag = `${mode}${gate ? "-gate" : ""}${start ? `-${start.slice(0, 7)}` : ""}`;
  const csvPath = join(outDir, `trend-trades-${tag}.csv`);
  const jsonPath = join(outDir, `trend-report-${tag}.json`);
  writeFileSync(csvPath, toCsv(allTrades), "utf8");
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        window: windowLabel,
        risk,
        rule,
        signalCfg,
        maxHoldDays: params.maxHoldDays,
        feeRate: params.feeRate,
        universeSize: symbols.length,
        symbolsWithBars: fetched,
        metrics,
        targetDistance: dist,
        spearmanRho: rho,
        quantiles,
        tierBands: bands,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`Wrote ${allTrades.length} trades → ${csvPath}`);
  console.log(`Wrote report → ${jsonPath}\n`);
}

main().catch((err) => {
  console.error("\nTrend backtest failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
