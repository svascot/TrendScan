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
export function EmptyState({
  title,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  actionLabel: string;
  onAction: () => void;
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
        <button
          type="button"
          onClick={onAction}
          className="mt-6 inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/25"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
