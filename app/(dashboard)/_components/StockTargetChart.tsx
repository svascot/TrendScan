"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ChartPoint {
  date: string;
  close: number;
}

export interface StockTargetChartProps {
  ticker: string;
  currentPrice: number;
  tpTargetPrice: number;
  slTargetPrice: number;
  historicalData: ChartPoint[];
  height?: number;
}

type Range = "30d" | "3mo";
const RANGE_BARS: Record<Range, number> = { "30d": 30, "3mo": 90 };

export function StockTargetChart({
  ticker,
  currentPrice,
  tpTargetPrice,
  slTargetPrice,
  historicalData,
  height = 220,
}: StockTargetChartProps) {
  const [range, setRange] = useState<Range>("30d");

  const gradientId = useMemo(
    () => `stc-grad-${ticker}-${Math.round(currentPrice * 100)}`,
    [ticker, currentPrice]
  );

  const windowed = useMemo<ChartPoint[]>(() => {
    const n = RANGE_BARS[range];
    return historicalData.slice(-n);
  }, [historicalData, range]);

  const data = useMemo<ChartPoint[]>(() => {
    if (windowed.length === 0) return [];
    const last = windowed[windowed.length - 1];
    if (last.close === currentPrice) return windowed;
    return [...windowed, { date: "Now", close: currentPrice }];
  }, [windowed, currentPrice]);

  const yDomain = useMemo<[number, number]>(() => {
    const closes = data.map((d) => d.close);
    const candidates = [...closes, tpTargetPrice, slTargetPrice, currentPrice].filter(
      (v) => Number.isFinite(v)
    );
    if (candidates.length === 0) return [0, 1];
    const lo = Math.min(...candidates);
    const hi = Math.max(...candidates);
    const pad = Math.max((hi - lo) * 0.08, hi * 0.005);
    return [lo - pad, hi + pad];
  }, [data, tpTargetPrice, slTargetPrice, currentPrice]);

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-slate-800 bg-slate-900/40 text-xs text-slate-500"
        style={{ height }}
      >
        No recent bars available for {ticker}.
      </div>
    );
  }

  const lastDate = data[data.length - 1].date;
  const priceFmt = (n: number) => n.toFixed(2);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Chart range"
          className="inline-flex overflow-hidden rounded-md border border-slate-700"
        >
          {(Object.keys(RANGE_BARS) as Range[]).map((r) => {
            const active = range === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                aria-pressed={active}
                className={`px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition ${
                  active
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-slate-950 text-slate-400 hover:text-slate-200"
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <LegendDot color="#10b981" />
            TP {priceFmt(tpTargetPrice)}
          </span>
          <span className="flex items-center gap-1.5">
            <LegendDot color="#f43f5e" />
            SL {priceFmt(slTargetPrice)}
          </span>
          <span className="flex items-center gap-1.5">
            <LegendDot color="#e2e8f0" />
            Now {priceFmt(currentPrice)}
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 56, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />

          <XAxis
            dataKey="date"
            tick={{ fill: "#64748b", fontSize: 10, fontFamily: "ui-monospace, monospace" }}
            tickLine={false}
            axisLine={{ stroke: "#334155" }}
            minTickGap={28}
          />
          <YAxis
            domain={yDomain}
            tick={{ fill: "#64748b", fontSize: 10, fontFamily: "ui-monospace, monospace" }}
            tickLine={false}
            axisLine={{ stroke: "#334155" }}
            width={44}
            tickFormatter={(v: number) => v.toFixed(0)}
          />

          <Tooltip
            cursor={{ stroke: "#475569", strokeDasharray: "2 2" }}
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 6,
              fontSize: 11,
              color: "#e2e8f0",
            }}
            labelStyle={{ color: "#94a3b8", fontFamily: "ui-monospace, monospace" }}
            formatter={(value) => [`$${priceFmt(Number(value))}`, "Close"]}
          />

          <ReferenceLine
            y={tpTargetPrice}
            stroke="#10b981"
            strokeDasharray="4 4"
            strokeWidth={2}
            label={{
              value: `TP ${priceFmt(tpTargetPrice)}`,
              position: "right",
              fill: "#34d399",
              fontSize: 10,
              fontFamily: "ui-monospace, monospace",
            }}
          />
          <ReferenceLine
            y={slTargetPrice}
            stroke="#f43f5e"
            strokeDasharray="4 4"
            strokeWidth={2}
            label={{
              value: `SL ${priceFmt(slTargetPrice)}`,
              position: "right",
              fill: "#fb7185",
              fontSize: 10,
              fontFamily: "ui-monospace, monospace",
            }}
          />
          <ReferenceLine
            y={currentPrice}
            stroke="#e2e8f0"
            strokeDasharray="1 3"
            strokeWidth={1}
            label={{
              value: `Now ${priceFmt(currentPrice)}`,
              position: "right",
              fill: "#e2e8f0",
              fontSize: 10,
              fontFamily: "ui-monospace, monospace",
            }}
          />

          <Area
            type="monotone"
            dataKey="close"
            stroke="#94a3b8"
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 3, fill: "#e2e8f0", stroke: "#0f172a", strokeWidth: 2 }}
          />

          <ReferenceDot
            x={lastDate}
            y={currentPrice}
            r={5}
            fill="#10b981"
            stroke="#0f172a"
            strokeWidth={2}
            ifOverflow="extendDomain"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function LegendDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}
