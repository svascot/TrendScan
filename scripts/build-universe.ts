// Rebuild the scan universe from Alpaca, data-driven by liquidity.
//
//   npx tsx scripts/build-universe.ts --dry            # show stats, write nothing
//   npm run build-universe -- --minvol 20 --minprice 5 # write lib/universe.json
//   npm run build-universe -- --dry --limit 500        # quick calibration run
//
// Keeps the existing sp500 / nasdaq100 / etfs buckets untouched (they drive the
// index tags in getIndicesFor) and (re)builds an `extra` bucket: every liquid
// common share NOT already in those buckets. "Liquid" = avg daily dollar volume
// over the last ~90 bars ≥ --minvol (millions) and price ≥ --minprice. This
// lifts the universe to ~Russell-1000-and-then-some at the SAME quality bar,
// instead of loosening the strategy's filters.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { fetchActiveEquities, fetchDailyBars } from "../lib/alpaca";
import { type DailyBar } from "../lib/scanner";

function loadEnv(path: string): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[a.slice(2)] = next;
        i++;
      } else out[a.slice(2)] = "true";
    }
  }
  return out;
}
function num(v: string | undefined, fallback: number): number {
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Common-share symbols only: 1–5 plain uppercase letters. Drops class shares
// with dots (BRK.B), warrants/units/preferreds, and other oddities that produce
// unreliable signals and unrealistic fills.
const COMMON_SHARE = /^[A-Z]{1,5}$/;
const KEEP_EXCHANGES = new Set(["NYSE", "NASDAQ", "ARCA", "BATS", "AMEX"]);

// Exclude leveraged / inverse / single-stock derivative products by name — they
// are far noisier than the stocks/plain ETFs the momentum strategy targets, and
// Alpaca's asset_class ("us_equity") doesn't flag them. Word boundaries avoid
// false positives (e.g. \bultra\b would hit "Ultragenyx"/"Ultra Clean", so we
// only match the unambiguous "ProShares Ultra"/"UltraPro" forms). Direxion's
// "Daily … 3X" products are caught by the multiplier and bull/bear tokens.
const EXCLUDE_NAME = new RegExp(
  [
    "\\b-?\\d(?:\\.\\d)?x\\b", // 2x, 3x, 1.5x, -1x …
    "\\bbull\\b",
    "\\bbear\\b",
    "\\binverse\\b",
    "\\bleveraged\\b",
    "\\bultrapro\\b",
    "\\bultrashort\\b",
    "ultra short",
    "proshares ultra",
    "\\byieldmax\\b",
  ].join("|"),
  "i",
);

async function main(): Promise<void> {
  loadEnv(resolve(process.cwd(), ".env.local"));
  const args = parseArgs(process.argv.slice(2));
  const dry = args.dry === "true" || args.dry === "";
  const minVolM = num(args.minvol, 20); // millions of $ avg daily volume
  const minPrice = num(args.minprice, 5);
  const limit = args.limit ? num(args.limit, 0) : 0;
  const minBars = num(args.minbars, 40);

  const universePath = resolve(process.cwd(), "lib/universe.json");
  const universe = JSON.parse(readFileSync(universePath, "utf8")) as Record<string, unknown>;
  const sp500 = (universe.sp500 as string[]) ?? [];
  const nasdaq100 = (universe.nasdaq100 as string[]) ?? [];
  const etfs = (universe.etfs as string[]) ?? [];
  const indexed = new Set([...sp500, ...nasdaq100, ...etfs].map((s) => s.toUpperCase()));

  console.log(`\nBuilding universe · min $${minVolM}M/day · min $${minPrice} · liquidity over last 90 bars…`);
  const assets = await fetchActiveEquities();
  const eligible = assets.filter(
    (a) => a.tradable && COMMON_SHARE.test(a.symbol) && KEEP_EXCHANGES.has(a.exchange),
  );
  const excludedByName = eligible.filter((a) => EXCLUDE_NAME.test(a.name));
  const kept = eligible.filter((a) => !EXCLUDE_NAME.test(a.name));
  let candidates = Array.from(new Set(kept.map((a) => a.symbol.toUpperCase()))).sort();
  if (limit) candidates = candidates.slice(0, limit);
  console.log(
    `  ${assets.length} active equities → ${eligible.length} common-share` +
      ` → dropped ${excludedByName.length} leveraged/inverse/derivative by name` +
      ` → ${candidates.length} candidates. Fetching bars…`,
  );
  console.log(`  excluded sample: ${excludedByName.slice(0, 15).map((a) => a.symbol).join(", ")}…`);

  // 90 calendar days is enough to gauge liquidity without pulling years of data.
  const bars = await fetchDailyBars(candidates, 90);

  const liquid: string[] = [];
  let priced = 0;
  let illiquid = 0;
  for (const sym of candidates) {
    const b = bars[sym] as DailyBar[] | undefined;
    if (!b || b.length < minBars) continue;
    const recent = b.slice(-60);
    const lastPrice = recent[recent.length - 1].c;
    if (lastPrice < minPrice) { priced++; continue; }
    const avgDollarVol =
      recent.reduce((s, x) => s + x.c * x.v, 0) / recent.length;
    if (avgDollarVol < minVolM * 1_000_000) { illiquid++; continue; }
    liquid.push(sym);
  }
  liquid.sort();

  const extra = liquid.filter((s) => !indexed.has(s));
  const totalUniverse = new Set([...indexed, ...liquid]).size;

  console.log(`
Liquidity filter results
─────────────────────────────────────────────
Candidates with bars:  ${candidates.length}
Dropped (price < $${minPrice}):   ${priced}
Dropped (illiquid):    ${illiquid}
Liquid common shares:  ${liquid.length}
Already in indices:    ${liquid.length - extra.length}
NEW (→ extra bucket):  ${extra.length}
Total scan universe:   ${totalUniverse}  (was ${indexed.size})
─────────────────────────────────────────────`);
  console.log(`  extra sample: ${extra.slice(0, 20).join(", ")}…`);

  if (dry) {
    console.log(`\n[dry run] nothing written. Re-run without --dry to update lib/universe.json.\n`);
    return;
  }

  const next = {
    _comment:
      universe._comment ??
      "sp500/nasdaq100/etfs drive index tags; extra = liquid common shares beyond them (built by scripts/build-universe.ts).",
    sp500,
    nasdaq100,
    etfs,
    extra,
  };
  writeFileSync(universePath, JSON.stringify(next, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${universePath} — universe is now ${totalUniverse} symbols.\n`);
}

main().catch((err) => {
  console.error("\nbuild-universe failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
