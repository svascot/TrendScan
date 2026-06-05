import { z } from "zod";

export interface StrategySettings {
  tpPct: number; // e.g. 0.04 = +4%
  slPct: number; // e.g. 0.02 = -2%
  rsiLow: number;
  rsiHigh: number;
  maShort: number;
  maLong: number;
  scannerLimit: number;
  refreshIntervalMinutes: number;
  atrMinPct: number; // e.g. 0.015 = 1.5% — min (ATR/close) for the volatility filter
}

export const STRATEGY_DEFAULTS: StrategySettings = {
  tpPct: 0.04,
  slPct: 0.02,
  rsiLow: 55,
  rsiHigh: 65,
  maShort: 50,
  maLong: 200,
  scannerLimit: 10,
  refreshIntervalMinutes: 5,
  atrMinPct: 0.015,
};

export const strategySchema = z.object({
  tpPct: z.number().min(0.005).max(0.2),
  slPct: z.number().min(0.005).max(0.2),
  rsiLow: z.number().int().min(0).max(99),
  rsiHigh: z.number().int().min(1).max(100),
  maShort: z.number().int().min(5).max(100),
  maLong: z.number().int().min(50).max(400),
  scannerLimit: z.number().int().min(1).max(100),
  refreshIntervalMinutes: z.number().int().min(1).max(1440),
  atrMinPct: z.number().min(0).max(0.2),
}).refine((s) => s.rsiHigh > s.rsiLow, {
  message: "rsiHigh must be greater than rsiLow",
  path: ["rsiHigh"],
}).refine((s) => s.maLong > s.maShort, {
  message: "maLong must be greater than maShort",
  path: ["maLong"],
});

export function computeTpSl(entry: number, settings: StrategySettings) {
  return {
    targetTp: round2(entry * (1 + settings.tpPct)),
    targetSl: round2(entry * (1 - settings.slPct)),
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type DbSettingsRow = {
  user_id: string;
  tp_pct: number;
  sl_pct: number;
  rsi_low: number;
  rsi_high: number;
  ma_short: number;
  ma_long: number;
  scanner_limit: number;
  refresh_interval_minutes: number;
  atr_min_pct?: number | null;
  updated_at?: string;
};

export function settingsFromRow(row: DbSettingsRow | null): StrategySettings {
  if (!row) return { ...STRATEGY_DEFAULTS };
  return {
    tpPct: Number(row.tp_pct),
    slPct: Number(row.sl_pct),
    rsiLow: Number(row.rsi_low),
    rsiHigh: Number(row.rsi_high),
    maShort: Number(row.ma_short),
    maLong: Number(row.ma_long),
    scannerLimit: Number(row.scanner_limit),
    refreshIntervalMinutes:
      row.refresh_interval_minutes == null
        ? STRATEGY_DEFAULTS.refreshIntervalMinutes
        : Number(row.refresh_interval_minutes),
    atrMinPct:
      row.atr_min_pct == null
        ? STRATEGY_DEFAULTS.atrMinPct
        : Number(row.atr_min_pct),
  };
}

export function settingsToRow(userId: string, s: StrategySettings): DbSettingsRow {
  return {
    user_id: userId,
    tp_pct: s.tpPct,
    sl_pct: s.slPct,
    rsi_low: s.rsiLow,
    rsi_high: s.rsiHigh,
    ma_short: s.maShort,
    ma_long: s.maLong,
    scanner_limit: s.scannerLimit,
    refresh_interval_minutes: s.refreshIntervalMinutes,
    atr_min_pct: s.atrMinPct,
  };
}
