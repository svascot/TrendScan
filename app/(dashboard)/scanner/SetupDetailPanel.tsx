"use client";

import { useEffect, useState } from "react";
import type { ScanResult } from "@/lib/scanner";
import type { StrategySettings } from "@/lib/strategy";
import { SetupAuditContent } from "./SetupAuditContent";

interface Props {
  row: ScanResult;
  settings: StrategySettings;
  onClose: () => void;
}

/**
 * Desktop-only (md+) master-detail side panel. Slides in from the right and
 * stays sticky beside the table so the trader never loses sight of the list.
 * Its sticky offset clears the global header (h-16) + the sticky controls bar.
 */
export function SetupDetailPanel({ row, settings, onClose }: Props) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      aria-label={`Setup audit for ${row.ticker}`}
      className={`sticky top-[128px] flex max-h-[calc(100vh-148px)] w-full flex-col overflow-hidden rounded-2xl border border-hairline/70 bg-panel shadow-panel transition-all duration-300 ease-spring ${
        shown ? "translate-x-0 opacity-100" : "translate-x-6 opacity-0"
      }`}
    >
      <header className="flex flex-shrink-0 items-start justify-between border-b border-hairline/70 bg-slate-950/40 px-5 py-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-emerald-400">
            Setup Audit Log
          </p>
          <h2 className="mt-1 font-mono text-xl font-bold text-slate-50">{row.ticker}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-hairline text-slate-300 transition-colors hover:border-emerald-400/50 hover:text-emerald-300"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <SetupAuditContent row={row} settings={settings} />
      </div>
    </aside>
  );
}
