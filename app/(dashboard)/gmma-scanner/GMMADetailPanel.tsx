"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { GmmaChartBar, GmmaScanResult } from "@/lib/gmma-scanner";

/* ────────────────────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────────────────────── */

interface PanelProps {
  row: GmmaScanResult;
  shares: number;
  targetTp: number; // fee-adjusted TP
  slFee: number; // fee-adjusted SL
  feeUsd: number; // round-trip broker fee, for net P&L
  onClose: () => void;
}

// One Guppy ribbon line: its data key on the chart row + its colour.
type RibbonKey = keyof Pick<
  GmmaChartBar,
  | "ema3" | "ema5" | "ema8" | "ema10" | "ema12" | "ema15"
  | "ema30" | "ema35" | "ema40" | "ema45" | "ema50" | "ema60"
>;
interface RibbonLine {
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
const SHORT_RIBBON: readonly RibbonLine[] = [
  { key: "ema3", label: "MA3", color: "#fbbf24" },
  { key: "ema5", label: "MA5", color: "#f59e0b" },
  { key: "ema8", label: "MA8", color: "#f97316" },
  { key: "ema10", label: "MA10", color: "#fb923c" },
  { key: "ema12", label: "MA12", color: "#fdba74" },
  { key: "ema15", label: "MA15", color: "#fcd34d" },
] as const;
const LONG_RIBBON: readonly RibbonLine[] = [
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
function GmmaDualChart({ bars, large = false }: { bars: GmmaChartBar[]; large?: boolean }) {
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
 * Algorithmic Verification — the "why": three badges proving each GMMA rule.
 * ════════════════════════════════════════════════════════════════════════════ */
function VerificationItem({
  pass,
  title,
  detail,
}: {
  pass: boolean;
  title: string;
  detail: string;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${
          pass
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
            : "border-slate-700 bg-slate-800/40 text-slate-500"
        }`}
      >
        {pass ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        )}
      </span>
      <div className="min-w-0">
        <p className={`text-sm font-medium ${pass ? "text-slate-100" : "text-slate-400"}`}>
          {title}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{detail}</p>
      </div>
    </li>
  );
}

function GmmaVerification({ row }: { row: GmmaScanResult }) {
  const { breakdown } = row;
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        Algorithmic Verification
      </h3>
      <ul className="mt-3 space-y-3.5">
        <VerificationItem
          pass={breakdown.rule1TrendAlignedPass}
          title="Two-Ribbon GMMA Uptrend"
          detail="The short (trader) ribbon 3–15 is riding entirely above the long (investor) ribbon 30–60, which is itself fanned upward — the canonical GMMA buy alignment."
        />
        <VerificationItem
          pass={breakdown.rule2PullbackToShortRibbonPass}
          title="Pullback to the Short Ribbon"
          detail="Price has eased back into the trader ribbon (Close ≤ MA15) while staying above the whole investor ribbon, offering a low-risk continuation entry."
        />
        <VerificationItem
          pass={breakdown.rule3AoConfirmedPass}
          title="Awesome Oscillator Confirmation"
          detail="AO confirms with a bullish saucer or a zero-line cross up — a multi-bar momentum signal, not a single green bar."
        />
        <VerificationItem
          pass={breakdown.tpReachablePass}
          title="1:2 Target Is Reachable"
          detail="The strict 1:2 take-profit sits below the recent resistance — a price the stock has already traded — so it's realistically reachable, not beyond a wall."
        />
      </ul>

      <p className="mt-4 rounded-lg border border-hairline/60 bg-slate-950/40 px-3 py-2 text-xs leading-relaxed text-slate-400">
        <span className="font-medium text-slate-300">Discretionary exit:</span>{" "}
        close the position if the short ribbon crosses back below the long ribbon, or the
        two ribbons compress together — the documented GMMA exit signal.
      </p>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * Range toggle — slice the visible window. 3M keeps all ~90 bars; 30D trims to
 * the last 30 sessions for a tighter, more recent read of the fan + AO.
 * ════════════════════════════════════════════════════════════════════════════ */
export type ChartRange = "30D" | "3M";
const RANGE_BARS: Record<ChartRange, number> = { "30D": 30, "3M": Infinity };

function RangeToggle({
  value,
  onChange,
}: {
  value: ChartRange;
  onChange: (r: ChartRange) => void;
}) {
  const options: { key: ChartRange; label: string }[] = [
    { key: "30D", label: "30D" },
    { key: "3M", label: "3M" },
  ];
  return (
    <div role="group" aria-label="Chart range" className="inline-flex items-center rounded-lg border border-hairline/70 bg-slate-950/40 p-0.5">
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.key)}
            className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-medium tracking-wide transition ${
              active ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * Shared body — trade plan + chart + verification. Reused by the desktop sticky
 * aside and the mobile slide-in drawer.
 * ════════════════════════════════════════════════════════════════════════════ */
function DetailBody({
  row,
  shares,
  targetTp,
  slFee,
  feeUsd,
  range,
  onRangeChange,
  large = false,
}: {
  row: GmmaScanResult;
  shares: number;
  targetTp: number;
  slFee: number;
  feeUsd: number;
  range: ChartRange;
  onRangeChange: (r: ChartRange) => void;
  large?: boolean;
}) {
  const bars = useMemo(() => {
    const n = RANGE_BARS[range];
    return Number.isFinite(n) ? row.chartBars.slice(-n) : row.chartBars;
  }, [row.chartBars, range]);

  const entry = row.close;
  // The fee-covered plan only exists when the fee-adjusted stop stays below entry.
  const feeOk = shares > 0 && slFee < entry;

  // Net dollar P&L on the sized position, after the round-trip fee.
  // No-fee levels: the fee still erodes both sides (so it lands just off 1:2).
  const netWinNoFee = (row.targetTp - entry) * shares - feeUsd;
  const netLossNoFee = -((entry - row.targetSl) * shares + feeUsd);
  // Fee-covered levels: the fee is baked into the prices → a TRUE net 1:2.
  const netWinFee = (targetTp - entry) * shares - feeUsd; // = 2× risk
  const netLossFee = -((entry - slFee) * shares + feeUsd); // = −risk

  return (
    <div className="space-y-6 px-5 py-5">
      {/* Trade plan strip */}
      <dl className="grid grid-cols-2 gap-2 text-center">
        <Stat label="Entry" value={`$${formatPrice(entry)}`} tone="neutral" />
        <Stat label="R:R" value={`1:${row.rrRatio}`} tone="neutral" />
      </dl>

      {/* Two plans: clean 1:2 on price vs. fee-covered (true net 1:2) */}
      <div className="overflow-hidden rounded-lg border border-hairline/60">
        <table className="w-full font-mono text-xs tabular-nums">
          <thead>
            <tr className="border-b border-hairline/60 text-[10px] uppercase tracking-widest text-slate-500">
              <th className="px-3 py-2 text-left font-medium">Plan</th>
              <th className="px-3 py-2 text-right font-medium">TP</th>
              <th className="px-3 py-2 text-right font-medium">SL</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-hairline/40">
              <td className="px-3 py-2 text-slate-400">No fee</td>
              <td className="px-3 py-2 text-right text-emerald-300">${formatPrice(row.targetTp)}</td>
              <td className="px-3 py-2 text-right text-red-300">${formatPrice(row.targetSl)}</td>
            </tr>
            <tr>
              <td className="px-3 py-2 text-slate-400">Fee-covered</td>
              <td className="px-3 py-2 text-right text-emerald-300">{feeOk ? `$${formatPrice(targetTp)}` : "—"}</td>
              <td className="px-3 py-2 text-right text-red-300">{feeOk ? `$${formatPrice(slFee)}` : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500">
        SL anchored just below support (recent low{" "}
        <span className="font-mono text-slate-400">${formatPrice(row.supportLow)}</span>). The strict
        1:2 TP <span className="font-mono text-slate-400">${formatPrice(row.targetTp)}</span> sits below
        the recent resistance{" "}
        <span className="font-mono text-slate-400">${formatPrice(row.resistanceHigh)}</span>, so it&rsquo;s
        a reachable price the stock has already traded.
      </p>

      {/* Projected net P&L on the sized position */}
      {shares > 0 && (
        <div className="rounded-lg border border-hairline/60 bg-slate-950/40 px-3 py-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
            Projected net P&amp;L · {Number.isInteger(shares) ? shares : shares.toFixed(2)} shares
          </p>

          <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-slate-600">No-fee levels</p>
          <dl className="mt-1 space-y-1 font-mono text-xs tabular-nums">
            <PnlRow label="If TP hit" value={netWinNoFee} />
            <PnlRow label="If SL hit" value={netLossNoFee} />
          </dl>

          {feeOk ? (
            <>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-emerald-500/80">
                Fee-covered levels · net 1:{row.rrRatio}
              </p>
              <dl className="mt-1 space-y-1 font-mono text-xs tabular-nums">
                <PnlRow label="If TP hit" value={netWinFee} />
                <PnlRow label="If SL hit" value={netLossFee} />
              </dl>
            </>
          ) : (
            <p className="mt-3 text-[11px] leading-relaxed text-amber-400/90">
              Fee-covered plan unavailable: the ${feeUsd.toFixed(2)} round-trip fee exceeds the
              amount risked at this position size — size up or skip this trade.
            </p>
          )}

          <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
            All figures net of your ${feeUsd.toFixed(2)} round-trip broker fee.
          </p>
        </div>
      )}

      {/* Chart range selector */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
          Price &amp; Guppy Fan
        </span>
        <RangeToggle value={range} onChange={onRangeChange} />
      </div>

      <GmmaDualChart bars={bars} large={large} />

      {/* Ribbon legend — grouped into the two Guppy ribbons */}
      <div className="space-y-1.5">
        <RibbonLegendRow title="Short (trader) 3–15" lines={SHORT_RIBBON} />
        <RibbonLegendRow title="Long (investor) 30–60" lines={LONG_RIBBON} />
      </div>

      <div className="border-t border-hairline/70 pt-5">
        <GmmaVerification row={row} />
      </div>

      {shares > 0 && (
        <p className="text-xs text-slate-500">
          Suggested size:{" "}
          <span className="font-mono text-emerald-300">
            {Number.isInteger(shares) ? shares : shares.toFixed(2)}
          </span>{" "}
          shares · risk{" "}
          <span className="font-mono text-slate-300">${formatPrice(row.riskPerShare)}</span> / share.
        </p>
      )}
    </div>
  );
}

function PnlRow({ label, value }: { label: string; value: number }) {
  const positive = value >= 0;
  return (
    <div className="flex items-center justify-between gap-6">
      <dt className="text-slate-400">{label}</dt>
      <dd className={positive ? "text-emerald-300" : "text-red-300"}>
        {positive ? "+" : "−"}${formatPrice(Math.abs(value))}
      </dd>
    </div>
  );
}

function RibbonLegendRow({ title, lines }: { title: string; lines: readonly RibbonLine[] }) {
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

function Stat({ label, value, tone }: { label: string; value: string; tone: "up" | "down" | "neutral" }) {
  const color = tone === "up" ? "text-emerald-300" : tone === "down" ? "text-red-300" : "text-slate-100";
  return (
    <div className="rounded-lg border border-hairline/60 bg-slate-950/40 px-2 py-2">
      <dt className="font-mono text-[9px] uppercase tracking-widest text-slate-500">{label}</dt>
      <dd className={`mt-1 font-mono text-sm tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}

function PanelHeader({
  ticker,
  onClose,
  maximized,
  onToggleMaximize,
}: {
  ticker: string;
  onClose: () => void;
  maximized?: boolean;
  onToggleMaximize?: () => void;
}) {
  return (
    <header className="flex flex-shrink-0 items-start justify-between border-b border-hairline/70 bg-slate-950/40 px-5 py-4">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-emerald-400">
          GMMA Setup Audit
        </p>
        <h2 className="mt-1 font-mono text-xl font-bold text-slate-50">{ticker}</h2>
      </div>
      <div className="flex items-center gap-2">
        {onToggleMaximize && (
          <button
            type="button"
            onClick={onToggleMaximize}
            aria-label={maximized ? "Restore panel" : "Maximize panel"}
            title={maximized ? "Restore" : "Maximize"}
            aria-pressed={maximized}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-hairline text-slate-300 transition-colors hover:border-emerald-400/50 hover:text-emerald-300"
          >
            {maximized ? <MinimizeIcon className="h-[18px] w-[18px]" /> : <MaximizeIcon className="h-[18px] w-[18px]" />}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-hairline text-slate-300 transition-colors hover:border-emerald-400/50 hover:text-emerald-300"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
    </header>
  );
}

function MaximizeIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  );
}

function MinimizeIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M16 21v-3a2 2 0 0 1 2-2h3M8 21v-3a2 2 0 0 0-2-2H3" />
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * Desktop (md+) master-detail aside — slides in organically from the right and
 * stays sticky beside the table. Mirrors the scanner's SetupDetailPanel offset.
 * ════════════════════════════════════════════════════════════════════════════ */
export function GMMADetailPanel({ row, shares, targetTp, slFee, feeUsd, onClose }: PanelProps) {
  const [shown, setShown] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [range, setRange] = useState<ChartRange>("3M");

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Escape restores from maximized first, then closes the panel entirely.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (maximized) setMaximized(false);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, maximized]);

  // Lock background scroll while the full-screen modal is open.
  useEffect(() => {
    if (!maximized) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [maximized]);

  if (maximized) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={`GMMA setup audit for ${row.ticker}`}>
        <button
          type="button"
          aria-label="Close panel"
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
        />
        <div className="relative flex h-full max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-hairline/70 bg-panel shadow-panel">
          <PanelHeader
            ticker={row.ticker}
            onClose={onClose}
            maximized
            onToggleMaximize={() => setMaximized(false)}
          />
          <div className="flex-1 overflow-y-auto">
            <DetailBody row={row} shares={shares} targetTp={targetTp} slFee={slFee} feeUsd={feeUsd} range={range} onRangeChange={setRange} large />
          </div>
        </div>
      </div>
    );
  }

  return (
    <aside
      aria-label={`GMMA setup audit for ${row.ticker}`}
      className={`sticky top-[88px] flex max-h-[calc(100vh-108px)] w-full flex-col overflow-hidden rounded-2xl border border-hairline/70 bg-panel shadow-panel transition-all duration-300 ease-out ${
        shown ? "translate-x-0 opacity-100" : "translate-x-6 opacity-0"
      }`}
    >
      <PanelHeader
        ticker={row.ticker}
        onClose={onClose}
        maximized={false}
        onToggleMaximize={() => setMaximized(true)}
      />
      <div className="flex-1 overflow-y-auto">
        <DetailBody row={row} shares={shares} targetTp={targetTp} slFee={slFee} feeUsd={feeUsd} range={range} onRangeChange={setRange} />
      </div>
    </aside>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * Mobile (<md) drawer — full-height sheet that slides in from the right over a
 * dimmed backdrop, using the same organic transform/ease as the desktop aside.
 * ════════════════════════════════════════════════════════════════════════════ */
export function GMMADetailDrawer({ row, shares, targetTp, slFee, feeUsd, onClose }: PanelProps) {
  const [shown, setShown] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [range, setRange] = useState<ChartRange>("3M");

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (maximized) setMaximized(false);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, maximized]);

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={`GMMA setup audit for ${row.ticker}`}>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className={`absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-300 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      {/* Drawer — maximize expands it to the full viewport width */}
      <div
        className={`absolute inset-y-0 right-0 flex w-full flex-col bg-panel shadow-panel transition-all duration-300 ease-out ${
          maximized ? "max-w-none" : "max-w-md"
        } ${shown ? "translate-x-0" : "translate-x-full"}`}
      >
        <PanelHeader
          ticker={row.ticker}
          onClose={onClose}
          maximized={maximized}
          onToggleMaximize={() => setMaximized((m) => !m)}
        />
        <div className="flex-1 overflow-y-auto">
          <DetailBody row={row} shares={shares} targetTp={targetTp} slFee={slFee} feeUsd={feeUsd} range={range} onRangeChange={setRange} large={maximized} />
        </div>
      </div>
    </div>
  );
}
