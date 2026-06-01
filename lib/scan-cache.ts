import type { RiskLevel, ScanResult } from "@/lib/scanner";

export interface ScanResponse {
  generatedAt: string;
  count: number;
  rule: { rsiLow: number; rsiHigh: number; maShort: number; maLong: number };
  risk: RiskLevel;
  results: ScanResult[];
  skipped: number;
}

export interface CacheEntry {
  at: number;
  payload: ScanResponse;
}

export const scanCache = new Map<string, CacheEntry>();

export function clearScanCache(): number {
  const size = scanCache.size;
  scanCache.clear();
  return size;
}
