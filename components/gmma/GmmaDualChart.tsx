"use client";

import { useMemo } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPrice } from "@/lib/format";
import type { GmmaChartBar } from "@/lib/gmma-scanner";

/* ────────────────────────────────────────────────────────────────────────────
 * One Guppy ribbon line: its data key on the chart row + its colour.
 * ──────────────────────────────────────────────────────────────────────────── */
type RibbonKey = keyof Pick<
  GmmaChartBar,
  | "ema3" | "ema5" | "ema8" | "ema10" | "ema12" | "ema15"
  | "ema30" | "ema35" | "ema40" | "ema45" | "ema50" | "ema60"
>;
export interface RibbonLine {
  key: RibbonKey;
  label: string;
  color: string;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Two Guppy ribbons drawn as one fan: the short-term (trader) ribbon 3-15 in
 * warm amber→gold, the long-term (investor) ribbon 30-60 in cool teal→emerald.
 * The warm/cool split makes the canonical signal — short ribbon riding above the
 * long ribbon, and their compression/expansion — read at a glance.
 * ──────────────────────────────────────────────────────────────────────────── */
export const SHORT_RIBBON: readonly RibbonLine[] = [
  { key: "ema3", label: "MA3", color: "#fbbf24" },
  { key: "ema5", label: "MA5", color: "#f59e0b" },
  { key: "ema8", label: "MA8", color: "#f97316" },
  { key: "ema10", label: "MA10", color: "#fb923c" },
  { key: "ema12", label: "MA12", color: "#fdba74" },
  { key: "ema15", label: "MA15", color: "#fcd34d" },
] as const;
export const LONG_RIBBON: readonly RibbonLine[] = [
  { key: "ema30", label: "MA30", color: "#38bdf8" },
  { key: "ema35", label: "MA35", color: "#22d3ee" },
  { key: "ema40", label: "MA40", color: "#2dd4bf" },
  { key: "ema45", label: "MA45", color: "#34d399" },
  { key: "ema50", label: "MA50", color: "#10b981" },
  { key: "ema60", label: "MA60", color: "#059669" },
] as const;
const RIBBON: readonly RibbonLine[] = [...SHORT_RIBBON, ...LONG_RIBBON];

const AO_GREEN = "#10b981";
const AO_RED = "#ef4444";
const SYNC_ID = "gmma_ao_sync";

/* ────────────────────────────────────────────────────────────────────────────
 * Date helpers — parse the YYYY-MM-DD string without a timezone shift.
 * ──────────────────────────────────────────────────────────────────────────── */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/* ════════════════════════════════════════════════════════════════════════════
 * Custom floating tooltip — a minimalist, deeply-blurred dark card with
 * horizontally-aligned monospaced figures. Reads date, price + AO straight off
 * the synced data row so a single card narrates both panes at once.
 * ════════════════════════════════════════════════════════════════════════════ */
interface TooltipPayloadItem {
  payload: GmmaChartBar;
}
function GmmaTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-800/50 bg-slate-950/80 px-3 py-2 shadow-xl backdrop-blur-md">
      <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
        {longDate(row.date)}
      </p>
      <div className="mt-1.5 space-y-1 font-mono text-xs tabular-nums">
        <div className="flex items-center justify-between gap-6">
          <span className="text-slate-400">Price</span>
          <span className="text-slate-100">${formatPrice(row.close)}</span>
        </div>
        {row.ao !== null && (
          <div className="flex items-center justify-between gap-6">
            <span className="text-slate-400">AO</span>
            <span className={row.ao >= 0 ? "text-emerald-400" : "text-red-400"}>
              {row.ao >= 0 ? "+" : ""}
              {row.ao.toFixed(4)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * Dual synced chart — price + Guppy fan (65%) stacked over the AO histogram
 * (35%), sharing one X axis via syncId so the cursor tracks both at once.
 * ════════════════════════════════════════════════════════════════════════════ */
export function GmmaDualChart({ bars, large = false }: { bars: GmmaChartBar[]; large?: boolean }) {
  // Awesome Oscillator bar colour: green when the histogram is rising vs. the
  // immediately-prior bar, red when flat or falling.
  const aoColors = useMemo(
    () =>
      bars.map((b, i) => {
        const prev = i > 0 ? bars[i - 1].ao : null;
        const rising = b.ao !== null && prev !== null && b.ao > prev;
        return rising ? AO_GREEN : AO_RED;
      }),
    [bars],
  );

  const sharedX = (
    <XAxis
      dataKey="date"
      tickFormatter={shortDate}
      minTickGap={28}
      tick={{ fill: "#64748b", fontSize: 10 }}
      tickLine={false}
      axisLine={{ stroke: "#1e293b" }}
    />
  );

  return (
    <div className="space-y-1">
      {/* ── Upper: price area + 6 EMA ribbon (65%) ── */}
      <div className={large ? "h-[440px] w-full" : "h-[230px] w-full"}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={bars}
            syncId={SYNC_ID}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="gmmaPriceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1e293b" strokeOpacity={0.4} vertical={false} />
            {sharedX}
            <YAxis
              width={52}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => `$${formatPrice(v)}`}
              tick={{ fill: "#64748b", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={<GmmaTooltip />}
              cursor={{ stroke: "#475569", strokeDasharray: "3 3" }}
            />
            <Area
              type="monotone"
              dataKey="close"
              stroke="#e2e8f0"
              strokeWidth={1.75}
              fill="url(#gmmaPriceFill)"
              isAnimationActive={false}
              connectNulls
            />
            {RIBBON.map((r) => (
              <Line
                key={r.key}
                type="monotone"
                dataKey={r.key}
                stroke={r.color}
                strokeWidth={1.5}
                strokeOpacity={0.85}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── Lower: Awesome Oscillator histogram, zero-centred (35%) ── */}
      <div className={large ? "h-[210px] w-full" : "h-[124px] w-full"}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={bars}
            syncId={SYNC_ID}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke="#1e293b" strokeOpacity={0.4} vertical={false} />
            {sharedX}
            <YAxis
              width={52}
              tickFormatter={(v: number) => v.toFixed(2)}
              tick={{ fill: "#64748b", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={() => null}
              cursor={{ fill: "rgba(148,163,184,0.08)" }}
            />
            <ReferenceLine y={0} stroke="#334155" />
            <Bar dataKey="ao" isAnimationActive={false} radius={[1, 1, 0, 0]}>
              {bars.map((_, i) => (
                <Cell key={i} fill={aoColors[i]} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * Ribbon legend row — one labelled colour-swatch list per Guppy ribbon.
 * ════════════════════════════════════════════════════════════════════════════ */
export function RibbonLegendRow({ title, lines }: { title: string; lines: readonly RibbonLine[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="font-mono text-[9px] uppercase tracking-widest text-slate-600">{title}</span>
      {lines.map((r) => (
        <span key={r.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ backgroundColor: r.color }} />
          <span className="font-mono text-[10px] tracking-wide text-slate-500">{r.label}</span>
        </span>
      ))}
    </div>
  );
}
