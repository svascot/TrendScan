"use client";

import { HelpCircle } from "lucide-react";
import {
  SETTINGS_EDUCATION,
  type SettingHelpId,
  type SettingInfo,
} from "@/lib/constants/settings-education";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

interface SettingHelpProps {
  id: SettingHelpId;
}

export function SettingHelp({ id }: SettingHelpProps) {
  const info: SettingInfo | undefined = SETTINGS_EDUCATION[id];

  if (!info) return null;

  return (
    <HoverCard openDelay={100} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full p-1 text-slate-400 transition-colors hover:text-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          aria-label={`Learn more about ${info.title}`}
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        className="z-50 w-80 space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-4 text-slate-200 shadow-xl animate-in fade-in-50 zoom-in-95 data-[side=right]:slide-in-from-left-2 sm:w-96"
      >
        <div>
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-emerald-400">
            {info.title}
          </h4>
        </div>
        <div className="space-y-2 text-xs leading-relaxed text-slate-300">
          <p>
            <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-400">
              The Concept:
            </span>
            {info.concept}
          </p>
          <p>
            <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-400">
              TrendScan Strategy:
            </span>
            {info.rationale}
          </p>
        </div>
        <div className="flex items-start gap-1 border-t border-slate-800/60 pt-2 text-[11px] italic text-emerald-400/90">
          <span className="font-bold not-italic text-emerald-500">💡 Pro Tip:</span>
          <span>{info.tip}</span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
