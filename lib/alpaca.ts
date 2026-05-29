import type { DailyBar } from "./scanner";

const DEFAULT_DATA_URL = "https://data.alpaca.markets";
const DEFAULT_TRADING_URL = "https://api.alpaca.markets";
const PAPER_TRADING_URL = "https://paper-api.alpaca.markets";
const CHUNK_SIZE = 100;
const BARS_LOOKBACK_DAYS = 365; // calendar days; ~250 trading days
const ASSETS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface AlpacaAsset {
  symbol: string;
  name: string;
  exchange: string;
  tradable: boolean;
}

interface AlpacaBarsResponseBar {
  c: number; h: number; l: number; o: number; v: number; t: string;
  n?: number; vw?: number;
}

interface AlpacaBarsResponse {
  bars: Record<string, AlpacaBarsResponseBar[]> | null;
  next_page_token?: string | null;
}

function getCreds(): { keyId: string; secret: string; baseUrl: string } | null {
  const keyId = process.env.ALPACA_API_KEY_ID;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!keyId || !secret) return null;
  const baseUrl = process.env.ALPACA_DATA_URL ?? DEFAULT_DATA_URL;
  return { keyId, secret, baseUrl };
}

function getTradingCreds(): { keyId: string; secret: string; baseUrl: string } | null {
  const keyId = process.env.ALPACA_API_KEY_ID;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!keyId || !secret) return null;
  const baseUrl = process.env.ALPACA_TRADING_URL ?? DEFAULT_TRADING_URL;
  return { keyId, secret, baseUrl };
}

export class AlpacaConfigError extends Error {
  constructor(msg: string) { super(msg); this.name = "AlpacaConfigError"; }
}

export class AlpacaHttpError extends Error {
  constructor(public status: number, msg: string) { super(msg); this.name = "AlpacaHttpError"; }
}

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function fetchOneBatch(
  symbols: string[],
  start: string,
  creds: { keyId: string; secret: string; baseUrl: string }
): Promise<Record<string, DailyBar[]>> {
  const out: Record<string, DailyBar[]> = {};
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      symbols: symbols.join(","),
      timeframe: "1Day",
      start,
      adjustment: "all",
      feed: "iex",
      limit: "10000",
    });
    if (pageToken) params.set("page_token", pageToken);

    const url = `${creds.baseUrl}/v2/stocks/bars?${params.toString()}`;
    const res = await fetch(url, {
      headers: {
        "APCA-API-KEY-ID": creds.keyId,
        "APCA-API-SECRET-KEY": creds.secret,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new AlpacaHttpError(res.status, `Alpaca ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as AlpacaBarsResponse;
    if (json.bars) {
      for (const [sym, bars] of Object.entries(json.bars)) {
        if (!bars || bars.length === 0) continue;
        const mapped: DailyBar[] = bars.map((b) => ({
          c: b.c, h: b.h, l: b.l, o: b.o, v: b.v, t: b.t,
        }));
        if (out[sym]) out[sym] = out[sym].concat(mapped);
        else out[sym] = mapped;
      }
    }
    pageToken = json.next_page_token ?? undefined;
  } while (pageToken);

  return out;
}

let assetsCache: { at: number; assets: AlpacaAsset[] } | null = null;

interface AlpacaAssetResponse {
  symbol: string;
  name: string;
  exchange: string;
  tradable: boolean;
  status: string;
  asset_class: string;
}

export async function fetchActiveEquities(): Promise<AlpacaAsset[]> {
  if (assetsCache && Date.now() - assetsCache.at < ASSETS_TTL_MS) {
    return assetsCache.assets;
  }
  const creds = getTradingCreds();
  if (!creds) {
    throw new AlpacaConfigError(
      "Missing ALPACA_API_KEY_ID / ALPACA_SECRET_KEY. Set them in .env.local."
    );
  }

  // Paper-trading keys only authenticate against paper-api.alpaca.markets;
  // live keys only against api.alpaca.markets. Try the configured (or default
  // live) base URL first, then fall back to paper on 401/403.
  const candidates = [creds.baseUrl];
  if (creds.baseUrl !== PAPER_TRADING_URL) candidates.push(PAPER_TRADING_URL);

  let lastError: AlpacaHttpError | null = null;
  for (const base of candidates) {
    const url = `${base}/v2/assets?status=active&asset_class=us_equity`;
    const res = await fetch(url, {
      headers: {
        "APCA-API-KEY-ID": creds.keyId,
        "APCA-API-SECRET-KEY": creds.secret,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      lastError = new AlpacaHttpError(
        res.status,
        `Alpaca ${res.status} from ${base}: ${body.slice(0, 300)}`,
      );
      if (res.status === 401 || res.status === 403) continue;
      throw lastError;
    }
    const raw = (await res.json()) as AlpacaAssetResponse[];
    const assets: AlpacaAsset[] = raw
      .filter((a) => a.tradable)
      .map((a) => ({
        symbol: a.symbol,
        name: a.name,
        exchange: a.exchange,
        tradable: a.tradable,
      }));
    assetsCache = { at: Date.now(), assets };
    return assets;
  }
  throw lastError ?? new AlpacaHttpError(500, "Failed to fetch Alpaca assets.");
}

export async function fetchDailyBars(
  symbols: readonly string[]
): Promise<Record<string, DailyBar[]>> {
  const creds = getCreds();
  if (!creds) {
    throw new AlpacaConfigError(
      "Missing ALPACA_API_KEY_ID / ALPACA_SECRET_KEY. Set them in .env.local."
    );
  }

  const start = isoDaysAgo(BARS_LOOKBACK_DAYS);
  const batches = chunk(symbols, CHUNK_SIZE);

  const results = await Promise.all(
    batches.map((batch) => fetchOneBatch(batch, start, creds))
  );

  const merged: Record<string, DailyBar[]> = {};
  for (const r of results) {
    for (const [sym, bars] of Object.entries(r)) {
      merged[sym] = bars;
    }
  }
  return merged;
}
