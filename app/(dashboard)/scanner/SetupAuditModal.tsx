"use client";

import { useEffect } from "react";
import type { ScanResult } from "@/lib/scanner";
import { computeTpSl, type StrategySettings } from "@/lib/strategy";
import { StockTargetChart } from "../_components/StockTargetChart";

interface Props {
  row: ScanResult;
  settings: StrategySettings;
  onClose: () => void;
}

export function SetupAuditModal({ row, settings, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const b = row.breakdown;
  const f = (n: number) => n.toFixed(2);
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const volMillions = (n: number) => `${(n / 1_000_000).toFixed(1)}M`;
  const { targetTp, targetSl } = computeTpSl(row.close, settings);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100vh-3rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"
      >
        <header className="flex flex-shrink-0 items-start justify-between border-b border-slate-800 bg-slate-950/60 px-6 py-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-emerald-400">
              Setup Audit Log
            </p>
            <h2 className="mt-1 font-mono text-xl font-bold text-slate-50">{row.ticker}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-700 px-2 py-0.5 text-sm text-slate-300 hover:border-emerald-400 hover:text-emerald-300"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6 text-sm">
          <section>
            <h3 className="font-mono text-xs uppercase tracking-widest text-slate-400">Summary</h3>
            <p className="mt-2 leading-relaxed text-slate-200">
              {row.ticker} is showing clear long-term structural health with accelerating immediate
              momentum. Volume confirms the move at {b.volRatio.toFixed(2)}× the 20-day average,
              while RSI of {row.rsi14.toFixed(1)} indicates remaining runway before saturation.
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
              1. Baseline Trend Pass/Fail
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
            </ul>
          </section>

          <section>
            <h3 className="font-mono text-xs uppercase tracking-widest text-slate-400">
              2. Multi-Factor Ranking Math
            </h3>
            <ul className="mt-3 space-y-1.5 font-mono text-xs text-slate-200">
              <li className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
                <span className="text-slate-300">Velocity (50%) · (Close − MA50) / MA50</span>
                <span className="flex gap-4">
                  <span className="text-slate-400">{pct(b.velocityPct)}</span>
                  <span className="text-emerald-300">Score: {b.scoreVelocity.toFixed(1)}</span>
                </span>
              </li>
              <li className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
                <span className="text-slate-300">RSI Sweet Spot (30%) · proximity to 60</span>
                <span className="flex gap-4">
                  <span className="text-slate-400">{(b.rsiSweetSpot * 100).toFixed(1)}%</span>
                  <span className="text-emerald-300">Score: {b.scoreRsi.toFixed(1)}</span>
                </span>
              </li>
              <li className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
                <span className="text-slate-300">
                  Volume Injection (20%) · {volMillions(row.volume)} / {volMillions(row.avgVolume20)} avg
                </span>
                <span className="flex gap-4">
                  <span className="text-slate-400">{b.volRatio.toFixed(2)}×</span>
                  <span className="text-emerald-300">Score: {b.scoreVolume.toFixed(1)}</span>
                </span>
              </li>
            </ul>
            <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-4 py-3">
              <span className="font-mono text-xs uppercase tracking-widest text-emerald-400">
                Composite Momentum Score
              </span>
              <span className="font-mono text-2xl font-bold text-emerald-300">
                {row.score.toFixed(1)}%
                <span className="ml-2 text-xs uppercase tracking-widest text-emerald-400">
                  [{row.tier}]
                </span>
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function RuleRow({
  label, expr, evalText, pass,
}: { label: string; expr: string; evalText: string; pass: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/40 px-3 py-2 text-slate-200">
      <span className="min-w-[180px] text-slate-300">{label}</span>
      <span className="text-slate-400">{expr}</span>
      <span className="text-slate-100">→ {evalText}</span>
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
