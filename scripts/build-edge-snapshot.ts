// Generate lib/backtest-snapshot.json — a committed, static snapshot of the
// validated GMMA strategy's backtest, so the /edge page can render the equity
// curve + headline metrics WITHOUT running a backtest at request time.
//
//   npm run build-edge-snapshot
//
// Runs the deployable config (strict TP gate + fixed 1:2, the live defaults)
// over a bull window (equity curve + metrics) and a bear-inclusive window
// (metrics only, to show the edge holds out-of-regime).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { fetchDailyBars, fetchDailyBarsRange } from "../lib/alpaca";
import { runBacktest, type BacktestMetrics } from "../lib/backtest";
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

const BASE = { maxHoldDays: 10, feeRate: 0.0005, warmupBars: 60 };

function windowLabel(start: string, end: string): string {
  return `${start.slice(0, 7)} → ${end.slice(0, 7)}`;
}

async function main(): Promise<void> {
  loadEnv(resolve(process.cwd(), ".env.local"));
  console.log(`\nBuilding edge snapshot · strict gate + fixed 1:2 · ${UNIVERSE.length} symbols…`);

  // Bull window: last 730 days (the live default). Equity curve + metrics.
  const bullBars = await fetchDailyBars(UNIVERSE, 730);
  const bull = runBacktest(bullBars, BASE);
  let bullStart = "9999";
  let bullEnd = "0000";
  for (const bars of Object.values(bullBars)) {
    if (!bars.length) continue;
    const f = bars[0].t.slice(0, 10);
    const l = bars[bars.length - 1].t.slice(0, 10);
    if (f < bullStart) bullStart = f;
    if (l > bullEnd) bullEnd = l;
  }
  console.log(`  bull: ${bull.metrics.trades} trades, avgR ${bull.metrics.avgR}`);

  // Bear-inclusive window: 2021-01 → 2023-12 (incl. the 2022 bear). Metrics only.
  const bearStart = "2021-01-01";
  const bearEnd = "2023-12-31";
  const bearBars = await fetchDailyBarsRange(UNIVERSE, bearStart, bearEnd);
  const bear = runBacktest(bearBars, BASE);
  console.log(`  bear: ${bear.metrics.trades} trades, avgR ${bear.metrics.avgR}`);

  const slim = (m: BacktestMetrics) => ({
    trades: m.trades,
    winRate: m.winRate,
    avgR: m.avgR,
    totalR: m.totalR,
    profitFactor: m.profitFactor === Infinity ? null : m.profitFactor,
    maxDrawdownR: m.maxDrawdownR,
    avgHoldDays: m.avgHoldDays,
  });

  const snapshot = {
    generatedAt: new Date().toISOString(),
    config: "Strict TP gate · fixed 1:2 · hold ≤ 10d · ~0.05% fee/side",
    universeSize: UNIVERSE.length,
    bull: {
      window: windowLabel(bullStart, bullEnd),
      metrics: slim(bull.metrics),
      equity: bull.equityCurve.map((p) => ({ date: p.date, cumR: p.cumR })),
    },
    bear: {
      window: windowLabel(bearStart, bearEnd),
      metrics: slim(bear.metrics),
    },
  };

  const out = resolve(process.cwd(), "lib/backtest-snapshot.json");
  writeFileSync(out, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${out} (${snapshot.bull.equity.length} equity points).\n`);
}

main().catch((err) => {
  console.error("\nbuild-edge-snapshot failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
