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

export function SetupAuditModal({ row, settings, onClose }: Props) {
  // Drive the enter transition: false on mount → true next frame so the panel
  // slides up from the bottom (mobile) / fades in (desktop) with a spring ease.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 backdrop-blur transition-opacity duration-300 ease-spring sm:items-center sm:px-4 sm:py-6 ${
        shown ? "opacity-100" : "opacity-0"
      }`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Setup audit for ${row.ticker}`}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-hairline bg-panel shadow-sheet transition-all duration-300 ease-spring sm:max-h-[calc(100vh-3rem)] sm:rounded-2xl sm:shadow-2xl ${
          shown ? "translate-y-0 opacity-100 sm:scale-100" : "translate-y-full opacity-0 sm:translate-y-2 sm:opacity-0 sm:scale-95"
        }`}
      >
        {/* Grab handle — bottom-sheet affordance on mobile only */}
        <div className="flex justify-center pt-2.5 sm:hidden">
          <span aria-hidden className="h-1 w-9 rounded-full bg-slate-700" />
        </div>

        <header className="flex flex-shrink-0 items-start justify-between border-b border-hairline/70 bg-slate-950/40 px-5 py-4 sm:px-6">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-emerald-400">
              Setup Audit Log
            </p>
            <h2 className="mt-1 font-mono text-xl font-bold text-slate-50">{row.ticker}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-hairline text-slate-300 transition-colors hover:border-emerald-400/50 hover:text-emerald-300"
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

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <SetupAuditContent row={row} settings={settings} />
        </div>
      </div>
    </div>
  );
}
