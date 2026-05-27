# TrendScan — Implementation Plan

## Context

We are building **TrendScan**, a hosted momentum scanner + manual portfolio tracker for a small group of users (family/friends) doing 1–5 day swing trades on the NYSE. The starting state is a fresh, empty git repo at `/Users/santiago.vasco/codebase/TrendScan` — no code yet.

The goal is to ship a v1 that:
- Runs a daily, mathematically strict scan against a curated universe of ~600 large-cap US tickers and returns the highest-ranked bullish setups.
- Lets each user manually track open trades against personalized TP/SL targets and archive closed ones.
- Stays on permanent free tiers across the stack (Vercel + Supabase + Alpaca paper API).
- Reads cleanly: post-market, glance at the scanner, manually execute on eToro, log the trade, walk away.

Decisions confirmed in conversation:
- **Strategy params:** per-user, stored in a `user_settings` table; spec defaults (+4% TP / -2% SL, RSI 55–65) pre-filled. UI must let each user override.
- **Scan timing:** on-demand per request (with a short in-memory TTL cache to avoid burning Alpaca quota across rapid reloads).
- **Status updates:** fully manual — user clicks Mark TP / Mark SL / Close. No auto-detection.
- **Auth:** open signup with Supabase email confirmation.
- **Universe:** hardcoded JSON in repo.
- **Default scanner cut:** Top 10, configurable via `?limit=` and a UI dropdown.

## ⚠️ Pre-flight: rotate the leaked credentials

The spec doc pasted live values for `ALPACA_SECRET_KEY` and `SUPABASE_SECRET_KEY`. These must be **rotated before any commit lands on GitHub**, even a private repo. The `NEXT_PUBLIC_SUPABASE_ANON_KEY` is fine to expose, but the service-role key and Alpaca secret are not. `.env.local` will be in `.gitignore` from the first commit; no key will be hardcoded anywhere in source.

## Tech stack

- **Next.js 14+ (App Router) + TypeScript + Tailwind CSS** — slate-900 canvas, emerald-400 accents per spec.
- **Supabase** — Auth (email/password + confirmation), Postgres, RLS. `@supabase/ssr` for SSR-safe session handling.
- **Alpaca Markets** Stocks Historical Data API (free tier) — daily bars, batched up to 200 symbols/call.
- **Vercel** — hosting + serverless API route for `/api/scan`.
- **npm** as the package manager.

## Routing layout (final)

Route groups isolate marketing vs. authed app **without adding `/dashboard/` to URLs**. The mockup labels like `/dashboard/scanner` are descriptive only; actual URLs are `/scanner` and `/portfolio`.

```
app/
├── (marketing)/
│   ├── layout.tsx          # Public header + "Log In" CTA
│   └── page.tsx            # Landing: hero + 3-rule strategy cards
├── (dashboard)/
│   ├── layout.tsx          # Sidebar nav (Scanner / Portfolio / Settings / Log out) + user chip
│   ├── scanner/page.tsx
│   ├── portfolio/page.tsx
│   └── settings/page.tsx
├── login/page.tsx          # Sign-in + sign-up tabs
├── api/scan/route.ts       # Serverless scanner endpoint
└── layout.tsx              # Root layout (fonts, <html>, global styles)
middleware.ts               # Session check for (dashboard) routes
```

## Files to create

**Supabase / auth glue**
- `lib/supabase/server.ts` — server-side client using `cookies()` from `next/headers`.
- `lib/supabase/client.ts` — browser client.
- `lib/supabase/middleware.ts` — `updateSession` helper consumed by `middleware.ts`.
- `middleware.ts` — invokes `updateSession`; redirects unauthed visitors hitting `(dashboard)` paths back to `/login`.

**Domain logic (pure functions, no I/O)**
- `lib/indicators.ts` — `sma(values, period)`, `rsi14(closes)` using Wilder smoothing. Unit-testable.
- `lib/strategy.ts` — `STRATEGY_DEFAULTS` (TP=+4%, SL=-2%, RSI low=55, RSI high=65, MA short=50, MA long=200, limit=10), plus helpers `computeTpSl(entry, settings)` and a zod schema for validation.
- `lib/scanner.ts` — rule evaluator + multi-factor scorer (velocity 50%, RSI sweet-spot 30%, volume injection 20% per spec §7). Returns `{ ticker, close, score, breakdown, ma50, ma200, rsi14, volRatio }`.

**Data & I/O**
- `lib/universe.json` — `{ sp500: [...], nasdaq100: [...], etfs: ["SPY","QQQ","SCHD","JEPQ", ...] }`. Dedup at load time → ~600 unique symbols.
- `lib/alpaca.ts` — thin wrapper over the Alpaca Stocks v2 bars endpoint. Batches 200 symbols/request, requests ~250 trading days back. Reads `ALPACA_API_KEY_ID` + `ALPACA_SECRET_KEY` from `process.env`.

**API**
- `app/api/scan/route.ts` — orchestrates: load universe → apply `?exclude=` → fetch bars in batches → run rules + score → sort → apply `?limit=` → return JSON. In-process Map cache keyed by `(limit|exclude|risk)` with ~1 h TTL so reloads in the same hour don't refetch.

**Pages**
- `app/(marketing)/page.tsx` — landing per spec §7 Layout 1.
- `app/(marketing)/layout.tsx` — header with logo + "Log In" link.
- `app/(dashboard)/layout.tsx` — sidebar nav, user chip (initials from email), session check.
- `app/(dashboard)/scanner/page.tsx` — client component that fetches `/api/scan?limit={settings.limit}`, renders the ranked table with TP/SL columns derived from **the viewing user's settings** (not a global), ticker links to `https://www.etoro.com/markets/{ticker.toLowerCase()}` opening in a new tab, `[Info]` button opening the audit modal, `[+ Add]` button inserting into `user_trades`.
- `app/(dashboard)/scanner/SetupAuditModal.tsx` — renders the rule pass/fail table + score breakdown per spec §7.
- `app/(dashboard)/portfolio/page.tsx` — open trades (with progress bar computed from latest known close vs TP/SL boundaries — fetched server-side at page load, no live polling), manual action buttons (Mark TP / Mark SL / Close), archived section below for non-OPEN rows.
- `app/(dashboard)/settings/page.tsx` — form with TP%, SL%, RSI low, RSI high, scanner limit. Defaults pre-filled from `STRATEGY_DEFAULTS`. Saves to `user_settings` (upsert).
- `app/login/page.tsx` — sign-in + sign-up forms; sign-up triggers Supabase email confirmation.

**Database migrations** (`supabase/migrations/`)
- `0001_user_trades.sql` — table per spec §3 plus an index on `(user_id, status)`.
- `0002_user_settings.sql` — `user_id PK → auth.users`, columns: `tp_pct NUMERIC(5,4)`, `sl_pct NUMERIC(5,4)`, `rsi_low INT`, `rsi_high INT`, `scanner_limit INT`, `updated_at TIMESTAMPTZ`.
- `0003_rls.sql` — `ENABLE ROW LEVEL SECURITY` on both tables; policies `auth.uid() = user_id` for select/insert/update/delete.

**Config / tooling**
- `package.json`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `next.config.mjs`.
- `.env.local.example` — keys with placeholder values, committed.
- `.env.local` — real values, **gitignored**.
- `.gitignore` — standard Next.js ignores + `.env.local`.
- `README.md` — local dev setup, env vars, scanner mechanics, deploy steps.

## Key implementation details

**Scanner math** (in `lib/scanner.ts`):
1. **Rule pass:** `close > sma200` AND `close > sma50` AND `sma50 > sma200` AND `rsiLow <= rsi14 <= rsiHigh`.
2. **Score components:**
   - `velocity = (close - sma50) / sma50` → normalize to 0..1 by clamping at 0.15 (15% above SMA50 = max). Weight 50.
   - `rsiSweetSpot = 1 - |rsi14 - 60| / 5` → 1.0 at RSI 60, 0 at RSI 55 or 65. Weight 30.
   - `volRatio = today.volume / mean(last20.volume)` → normalize by clamping at 2.0. Weight 20.
   - **Composite** = sum, rounded to 1 decimal. Tier label: `High` ≥ 85, `Med` ≥ 70, else `Low`.
3. The scorer returns the raw inputs in a `breakdown` object so the Setup Audit Modal can render them without recomputation.

**TP/SL display:** the scanner table computes TP/SL columns per-row using the **viewing user's** `user_settings` (fetched on the server when the page renders). When the user clicks `+ Add`, the same settings are used to snapshot `target_tp` and `target_sl` into the `user_trades` row — so changing settings later does not retroactively alter open trades.

**eToro links:** `<a href={`https://www.etoro.com/markets/${ticker.toLowerCase()}`} target="_blank" rel="noopener noreferrer">`. Used everywhere the ticker is shown (scanner table + portfolio table).

**Progress bar** (`[|||||..]`): pure visual, computed as `(currentClose - sl) / (tp - sl)` clamped to [0,1], rendered as 10 filled/empty blocks. `currentClose` comes from the most recent daily bar fetched server-side for each open ticker; refresh = page reload. No realtime, no websocket.

**Alpaca batching:** the v2 `/stocks/bars` endpoint accepts a comma-separated `symbols` list. Use chunks of 100 (safely under the 200 limit) and `timeframe=1Day`, `start=<250 trading days ago>`. Run chunks in parallel with `Promise.all`. Expected scan latency: 3–6 s on a warm route.

**Query string filters** (spec §8): `/api/scan` honors `limit` (number), `exclude` (CSV), and `risk` (`low`|`med`|`high`; `high` widens RSI band to 50–70 and raises score clamps). Settings page only exposes `limit` and the RSI band for v1; `risk` is wired in the API for later.

**Universe loading:** `import universe from '@/lib/universe.json' assert { type: 'json' }` then `Array.from(new Set([...universe.sp500, ...universe.nasdaq100, ...universe.etfs]))`. S&P 500 + Nasdaq 100 overlap is ~85 tickers; final count lands near 520.

**Pattern reuse:** since this is greenfield, there are no existing utilities to wire into. The closest reusable references are external — the `@supabase/ssr` cookbook and the Alpaca docs — both linked in the README.

## Build order (execution phases)

1. **Foundations:** scaffold `create-next-app@latest` (TS + Tailwind + App Router), commit, set `.gitignore`, write `.env.local.example`.
2. **Indicators + strategy:** write `lib/indicators.ts`, `lib/strategy.ts`, `lib/universe.json`. Verify indicators with a known test vector before wiring anywhere else.
3. **Scanner engine + API:** `lib/alpaca.ts`, `lib/scanner.ts`, `app/api/scan/route.ts`. Test with `curl http://localhost:3000/api/scan?limit=10`.
4. **Supabase + auth:** apply migrations, set up `lib/supabase/*`, build `/login`, set up `middleware.ts` route guard.
5. **Dashboard UI:** layout, scanner page, portfolio page, settings page, audit modal.
6. **Landing page** + polish.
7. **Deploy:** push to a private GitHub repo, import in Vercel, paste env vars **with rotated keys**.

## Verification

End-to-end manual test (run locally with `npm run dev`):
1. Sign up with a fresh email → confirm via Supabase magic link → land on `/scanner`.
2. Scanner page loads ≤ 10 s with at least a handful of ranked tickers; momentum scores are sensible (highest names visibly trending).
3. Open the Setup Audit Modal for the top row → all 4 rules show PASS with real numbers → composite score matches the table.
4. Click `+ Add` → navigate to `/portfolio` → trade appears with `target_tp = entry × (1 + tpPct)` and `target_sl = entry × (1 - slPct)` taken from settings.
5. On `/settings`, change TP from 4% to 3%. Refresh `/scanner` → TP column for new rows reflects 3%. Existing portfolio row keeps original snapshot.
6. Mark TP on the portfolio row → status flips to `HIT_TP`, row moves to archived section.
7. Click any ticker → opens `https://www.etoro.com/markets/<lower>` in a new tab.
8. Open a second browser as a second user → confirm their portfolio is empty (RLS isolation).

Headless checks:
- `curl 'http://localhost:3000/api/scan?limit=5&exclude=TSLA'` returns 5 rows, none being TSLA.
- `npm run build` succeeds with no type errors.
- Inspect network panel: no calls to `process.env.SUPABASE_SECRET_KEY` or `ALPACA_SECRET_KEY` leak to the client bundle.

Indicator unit check (one-off): pick AAPL, fetch a 60-day bar window, compute `rsi14` locally, eyeball against TradingView's RSI(14) for the same date — should match within 0.5.
