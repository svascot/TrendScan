import type { ReactNode } from "react";

// Shared presentational primitives for the scanner "decision card" surfaces
// (GMMA + classic). Pure components — no state — so they live outside either
// view and stay consistent across both.

// One cell of the SL/TP/risk "bracket" strip on a decision card.
export function BracketCell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "gain" | "loss" | "neutral";
}) {
  const valueColor =
    tone === "gain" ? "text-emerald-300" : tone === "loss" ? "text-red-300" : "text-slate-200";
  const subColor =
    tone === "gain" ? "text-emerald-500/70" : tone === "loss" ? "text-red-400/70" : "text-slate-500";
  return (
    <div className="bg-slate-950/60 px-2 py-2 text-center">
      <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-sm tabular-nums ${valueColor}`}>{value}</p>
      {sub && <p className={`font-mono text-[10px] ${subColor}`}>{sub}</p>}
    </div>
  );
}

// Pulsing card placeholders shown during the first scan.
export function SkeletonCards({ detailOpen }: { detailOpen: boolean }) {
  return (
    <div className={`grid gap-3 ${detailOpen ? "grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-3"}`}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-slate-800 bg-slate-900/40 p-4"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="flex items-center justify-between">
            <div className="h-5 w-16 rounded bg-slate-800" />
            <div className="h-5 w-10 rounded bg-slate-800" />
          </div>
          <div className="mt-3 h-14 rounded-lg bg-slate-800/60" />
          <div className="mt-3 h-8 rounded-lg bg-slate-800/60" />
        </div>
      ))}
    </div>
  );
}

// A designed, reassuring empty state — a strict gate means "0 setups" is a
// frequent, healthy outcome, not an error. Copy is passed by each scanner.
// An optional refresh re-runs the scan (markets can shift intraday).
export function EmptyState({
  title,
  actionLabel,
  onAction,
  onRefresh,
  refreshing = false,
  children,
}: {
  title: string;
  actionLabel: string;
  onAction: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 px-6 py-14 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.08),transparent_60%)]"
      />
      <div className="relative mx-auto max-w-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
            <path d="M11 8v3l2 1" />
          </svg>
        </div>
        <h3 className="mt-4 text-base font-semibold text-slate-100">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{children}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                aria-hidden
              >
                <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
              {refreshing ? "Scanning…" : "Refresh scan"}
            </button>
          )}
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-emerald-500/40 hover:text-emerald-300"
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
