"use client";

import type { ScanResult } from "@/lib/scanner";
import { computePositionShares, computeTpSl, type StrategySettings } from "@/lib/strategy";
import { StockTargetChart } from "../_components/StockTargetChart";

/**
 * Shared audit body for a single setup — rendered inside the desktop
 * master-detail panel and the mobile bottom sheet alike. Pure presentation:
 * summary, target-zone chart, suggested position size, gatekeeper checklist,
 * and the multi-factor ranking math.
 */
export function SetupAuditContent({
  row,
  settings,
}: {
  row: ScanResult;
  settings: StrategySettings;
}) {
  const b = row.breakdown;
  const f = (n: number) => n.toFixed(2);
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const volMillions = (n: number) => `${(n / 1_000_000).toFixed(1)}M`;
  const { targetTp, targetSl } = computeTpSl(row.close, settings);
  const atrMinPct = (settings.atrMinPct * 100).toFixed(2);

  const shares = computePositionShares(row.close, settings);
  const allocated = shares * row.close;
  const riskBudget = settings.totalCapital * (settings.riskPerTradePct / 100);

  return (
    <div className="space-y-6 text-sm">
      <section>
        <h3 className="font-mono text-xs uppercase tracking-widest text-slate-400">Summary</h3>
        <p className="mt-2 leading-relaxed text-slate-200">
          {row.ticker} is showing structural health with accelerating short-term momentum:
          ROC(9) of {row.rocValue.toFixed(2)}% and an ATR daily range of{" "}
          {row.atrPercentage.toFixed(2)}% provide the runway to reach the TP target inside the
          5-day window. Volume confirms at {b.volRatio.toFixed(2)}× the 20-day average, while
          RSI of {row.rsi14.toFixed(1)} keeps the setup clear of overbought territory.
        </p>
      </section>

      <section>
        <h3 className="mb-3 font-mono text-xs uppercase tracking-widest text-slate-400">
          Target Zones · TP +{(settings.tpPct * 100).toFixed(1)}% / SL −{(settings.slPct * 100).toFixed(1)}%
        </h3>
        <StockTargetChart
          ticker={row.ticker}
          currentPrice={row.close}
          tpTargetPrice={targetTp}
          slTargetPrice={targetSl}
          historicalData={row.chartBars}
        />
      </section>

      <section>
        <h3 className="font-mono text-xs uppercase tracking-widest text-slate-400">
          Suggested Position · {settings.riskPerTradePct}% risk
        </h3>
        <div className="mt-3 grid grid-cols-3 gap-2.5">
          <Metric label="Shares" value={shares.toString()} accent />
          <Metric label="Allocated" value={`$${allocated.toFixed(0)}`} />
          <Metric label="Risk budget" value={`$${riskBudget.toFixed(0)}`} />
        </div>
      </section>

      <section>
        <h3 className="font-mono text-xs uppercase tracking-widest text-slate-400">
          1. Gatekeeper Pass/Fail
        </h3>
        <ul className="mt-3 space-y-1.5 font-mono text-xs">
          <RuleRow
            label="Rule 1 — Macro Health"
            expr={`Close > MA(${settings.maLong})`}
            evalText={`${f(row.close)} > ${f(row.ma200)}`}
            pass={b.rule1MacroPass}
          />
          <RuleRow
            label="Rule 2 — Momentum Wave"
            expr={`Close > MA(${settings.maShort})`}
            evalText={`${f(row.close)} > ${f(row.ma50)}`}
            pass={b.rule2MomentumPass}
          />
          <RuleRow
            label="Rule 3 — Golden Guard"
            expr={`MA(${settings.maShort}) > MA(${settings.maLong})`}
            evalText={`${f(row.ma50)} > ${f(row.ma200)}`}
            pass={b.rule3GoldenPass}
          />
          <RuleRow
            label="Rule 4 — Runway Band"
            expr={`${settings.rsiLow} ≤ RSI(14) ≤ ${settings.rsiHigh}`}
            evalText={`RSI(14) = ${row.rsi14.toFixed(2)}`}
            pass={b.rule4RsiPass}
          />
          <RuleRow
            label="Rule 5 — Velocity Floor"
            expr={`ROC(9) > 0`}
            evalText={`ROC(9) = ${b.rocValue.toFixed(2)}%`}
            pass={b.rule5RocPass}
          />
          <RuleRow
            label="Rule 6 — Volatility Floor"
            expr={`ATR(14)/Close ≥ ${atrMinPct}%`}
            evalText={`ATR% = ${b.atrPct.toFixed(2)}%`}
            pass={b.rule6AtrPass}
          />
        </ul>
      </section>

      <section>
        <h3 className="font-mono text-xs uppercase tracking-widest text-slate-400">
          2. Multi-Factor Ranking Math
        </h3>
        <ul className="mt-3 space-y-1.5 font-mono text-xs text-slate-200">
          <li className="flex flex-wrap items-center justify-between gap-3 rounded border border-hairline/70 bg-slate-950/40 px-3 py-2">
            <span className="text-slate-300">ROC (30%) · short-term price velocity</span>
            <span className="flex gap-4 tabular-nums">
              <span className="text-slate-400">{b.rocValue.toFixed(2)}%</span>
              <span className="text-emerald-300">Score: {b.scoreRoc.toFixed(1)}</span>
            </span>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-3 rounded border border-hairline/70 bg-slate-950/40 px-3 py-2">
            <span className="text-slate-300">Velocity (25%) · (Close − MA{settings.maShort}) / MA{settings.maShort}</span>
            <span className="flex gap-4 tabular-nums">
              <span className="text-slate-400">{pct(b.velocityPct)}</span>
              <span className="text-emerald-300">Score: {b.scoreVelocity.toFixed(1)}</span>
            </span>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-3 rounded border border-hairline/70 bg-slate-950/40 px-3 py-2">
            <span className="text-slate-300">ATR (20%) · daily range as % of price</span>
            <span className="flex gap-4 tabular-nums">
              <span className="text-slate-400">{b.atrPct.toFixed(2)}%</span>
              <span className="text-emerald-300">Score: {b.scoreAtr.toFixed(1)}</span>
            </span>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-3 rounded border border-hairline/70 bg-slate-950/40 px-3 py-2">
            <span className="text-slate-300">
              Volume (15%) · {volMillions(row.volume)} / {volMillions(row.avgVolume20)} avg
            </span>
            <span className="flex gap-4 tabular-nums">
              <span className="text-slate-400">{b.volRatio.toFixed(2)}×</span>
              <span className="text-emerald-300">Score: {b.scoreVolume.toFixed(1)}</span>
            </span>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-3 rounded border border-hairline/70 bg-slate-950/40 px-3 py-2">
            <span className="text-slate-300">RSI Sweet Spot (10%) · proximity to band center</span>
            <span className="flex gap-4 tabular-nums">
              <span className="text-slate-400">{(b.rsiSweetSpot * 100).toFixed(1)}%</span>
              <span className="text-emerald-300">Score: {b.scoreRsi.toFixed(1)}</span>
            </span>
          </li>
        </ul>
        <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-4 py-3">
          <span className="font-mono text-xs uppercase tracking-widest text-emerald-400">
            Composite Momentum Score
          </span>
          <span className="font-mono text-2xl font-bold tabular-nums text-emerald-300">
            {row.score.toFixed(1)}%
            <span className="ml-2 text-xs uppercase tracking-widest text-emerald-400">
              [{row.tier}]
            </span>
          </span>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-hairline/70 bg-slate-950/40 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-base tabular-nums ${accent ? "text-emerald-300" : "text-slate-100"}`}>
        {value}
      </p>
    </div>
  );
}

function RuleRow({
  label, expr, evalText, pass,
}: { label: string; expr: string; evalText: string; pass: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded border border-hairline/70 bg-slate-950/40 px-3 py-2 text-slate-200">
      <span className="min-w-[180px] text-slate-300">{label}</span>
      <span className="text-slate-400">{expr}</span>
      <span className="tabular-nums text-slate-100">→ {evalText}</span>
      <span
        className={
          pass
            ? "rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-emerald-300"
            : "rounded border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-red-300"
        }
      >
        {pass ? "Passed" : "Failed"}
      </span>
    </li>
  );
}
