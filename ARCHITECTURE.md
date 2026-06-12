# TrendScan — Architecture & Flow

A breakdown of what TrendScan is, how the codebase is organised, and how requests flow through it. Companion to `README.md` (which goes deep on the scanning math) and `PLAN.md` (the original v1 spec).

---

## 1. What it is

TrendScan is a **single-tenant-per-user momentum scanner with a manual trade tracker**, hosted on free tiers (Vercel + Supabase + Alpaca). It does four things for each authenticated user:

1. **Scans** a curated universe of ~520 US large-caps + premium ETFs every visit, applies four hard technical filters, then ranks survivors with a 3-factor composite score (velocity 50 / RSI sweet-spot 30 / volume injection 20). Results are tagged with their index memberships (`sp500`, `nasdaq100`), and the UI lets the user toggle either index off.
2. **GMMA scans** the same universe with an independent strategy (`/gmma-scanner` → `/api/scan-gmma` → `lib/gmma-scanner.ts`): an ordered Guppy EMA fan (30/35/40/45/50/60), price pulled back inside the EMA30–EMA60 channel, and a rising Awesome Oscillator. Matches carry a structural stop loss (the tighter of EMA60 or the 5-bar swing low), a 1:2 take profit derived from that stop, and a per-user position size in shares computed client-side from the money-management settings (`total_capital` × `risk_per_trade_pct`). The displayed/saved TP is additionally raised by `broker_fee_usd / shares` so a win still nets 2:1 after the broker's round-trip commission.
3. **Watchlist** — the user adds arbitrary US equities by ticker or company name (autocomplete is backed by Alpaca's `/v2/assets` feed via `/api/symbols/search`). The same scoring engine runs against just that personal list. Unlike the scanner, watchlist mode never gates on rule failures — when any of the four trend rules fails, the composite score is **halved** so the row sinks in the ranking but stays visible, and a "No Setup · Trend Filter Failed" badge is shown next to the ticker.
4. **Tracks** a personal portfolio of trades the user "adds" from either scanner — entry, TP, SL targets are snapshotted at click time so later strategy changes never retroactively shift open trades.

It is **informational only** — no order routing, no broker integration. The "+ Add" button writes a row to Supabase; that is the entirety of the trade lifecycle.

---

## 2. Stack at a glance

| Layer | Tech | Where it lives |
|---|---|---|
| Framework | Next.js 14 (App Router) | `app/` |
| Language | TypeScript (strict) | `tsconfig.json` |
| Styling | Tailwind CSS | `tailwind.config.ts`, inline classes |
| Auth + DB | Supabase (Postgres + RLS + Auth) | `lib/supabase/*`, `supabase/migrations/` |
| Market data | Alpaca Markets Stocks Historical Data (free tier, IEX feed) | `lib/alpaca.ts` |
| Charts | Recharts (`AreaChart`, `ReferenceLine`, `ReferenceDot`) | `app/(dashboard)/_components/StockTargetChart.tsx` |
| Validation | Zod | `lib/strategy.ts` |
| Deploy | Vercel | `next.config.mjs` |

No state managers, no ORMs, no UI libraries beyond Recharts. Everything else is hand-rolled Tailwind + native React `useState`/`useEffect`.

---

## 3. Project layout

```
app/
├── layout.tsx                    # Root HTML shell (fonts, body classes)
├── (marketing)/                  # Public-facing route group
│   ├── layout.tsx                # No nav, no auth
│   └── page.tsx                  # Landing page → /login
├── (dashboard)/                  # Authenticated route group
│   ├── layout.tsx                # Server-checks auth, wraps in DashboardShell
│   ├── _components/
│   │   ├── DashboardShell.tsx    # Sidebar nav, header, footer, log-out
│   │   └── StockTargetChart.tsx  # Recharts price chart w/ TP/SL overlays + range toggle
│   ├── scanner/
│   │   ├── page.tsx              # Server wrapper → fetches user + settings
│   │   ├── ScannerView.tsx       # Client UI: filters, toggles, table, polling
│   │   └── SetupAuditModal.tsx   # Per-row breakdown modal (embeds chart)
│   ├── gmma-scanner/
│   │   ├── page.tsx              # Server wrapper → fetches user + settings
│   │   └── GmmaScannerView.tsx   # Client UI: GMMA table, position sizing, fee-adjusted TP, polling
│   ├── watchlist/
│   │   ├── page.tsx              # Server wrapper → fetches user + settings
│   │   └── WatchlistView.tsx     # Client UI: autocomplete add, table, remove, polling
│   ├── portfolio/
│   │   ├── page.tsx              # Server wrapper → lists trades + fetches Alpaca bars for open
│   │   └── PortfolioView.tsx     # Open + closed trades, expandable rows w/ chart, win-rate
│   └── settings/
│       ├── page.tsx              # Server wrapper → loads settings
│       └── SettingsView.tsx      # Form + Zod validation
├── login/page.tsx                # Sign-in / sign-up
├── auth/callback/route.ts        # OAuth/email-link → session exchange
└── api/
    ├── scan/route.ts             # Serverless scan endpoint (scanner + watchlist modes)
    ├── scan-gmma/route.ts        # Serverless GMMA scan endpoint
    └── symbols/search/route.ts   # Ticker / company-name autocomplete (Alpaca /v2/assets)

lib/
├── indicators.ts                 # Pure functions: SMA, Wilder RSI(14), ATR, ROC, EMA, Awesome Oscillator
├── scanner.ts                    # ScanResult, evaluateTicker, evaluateTickerForWatchlist, rankResults
├── gmma-scanner.ts               # GmmaScanResult, evaluateGmmaTicker, rankGmmaResults, GMMA cache
├── strategy.ts                   # Defaults, Zod schema, row mappers, TP/SL math
├── alpaca.ts                     # Batched daily-bars fetcher + active-equities fetcher
├── universe.ts                   # Deduped universe, getIndicesFor(ticker)
├── universe.json                 # S&P 500 + Nasdaq-100 + ETF tickers
├── format.ts                     # Price/pct formatters, eToro links, name helpers
├── site.ts                       # Site-wide constants
├── supabase/
│   ├── server.ts                 # Server-side Supabase client (RSC, route handlers)
│   ├── client.ts                 # Browser Supabase client (client components)
│   └── middleware.ts             # Edge middleware: session refresh + route guard
└── db/
    ├── settings.ts               # getOrCreateSettings, saveSettings
    └── trades.ts                 # listTrades, UserTradeRow type

middleware.ts                     # Wires lib/supabase/middleware into Next.js
supabase/migrations/              # SQL DDL (idempotent bootstrap + per-feature files)
```

**Route groups** (`(marketing)` and `(dashboard)`) are Next.js folders that don't affect URLs — they only let those subtrees share their own layout and `dynamic = "force-dynamic"` settings without leaking into the marketing surface.

---

## 4. Architecture diagram (text)

```
┌────────────────────────────────────────────────────────────────────┐
│                            Browser (user)                          │
│  - Marketing page (/)                                              │
│  - Login (/login)                                                  │
│  - Dashboard SPA-ish: /scanner /gmma-scanner /watchlist            │
│    /portfolio /settings                                            │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ HTTPS
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│                       Next.js on Vercel                            │
│                                                                    │
│  middleware.ts ──┐  (every request, Edge)                          │
│                  │  - refreshes Supabase session cookie            │
│                  │  - redirects /scanner|/watchlist|/portfolio|    │
│                  │    /settings to /login if no user               │
│                  │  - redirects /login to /scanner if user exists  │
│                  ▼                                                 │
│  ┌─ Server components (RSC) ────────────────────────────────────┐  │
│  │  page.tsx files: read Supabase user + DB rows, pass props    │  │
│  │  /portfolio also calls fetchDailyBars() for open-trade       │  │
│  │  tickers so the expandable chart row has data on render      │  │
│  └────────────────────┬─────────────────────────────────────────┘  │
│                       │                                            │
│  ┌─ Client components (use client) ─────────────────────────────┐  │
│  │  ScannerView / GmmaScannerView / WatchlistView /             │  │
│  │  PortfolioView / SettingsView                                │  │
│  │  - useState / useEffect for local UI state                   │  │
│  │  - fetch('/api/scan?...') for scan + watchlist data          │  │
│  │  - fetch('/api/symbols/search?q=...') for ticker autocomplete│  │
│  │  - direct Supabase client for trade / watchlist / settings   │  │
│  │  - StockTargetChart renders Recharts in modals / expansions  │  │
│  └────────────────────┬─────────────────────────────────────────┘  │
│                       │                                            │
│  ┌─ Route handlers (Node runtime) ──────────────────────────────┐  │
│  │  /api/scan?mode=scanner   → universe → bars → score → JSON   │  │
│  │  /api/scan?mode=watchlist → user_watchlist tickers → score   │  │
│  │                             (failing rows get score / 2)     │  │
│  │  /api/scan-gmma           → universe → bars → GMMA fan + AO  │  │
│  │  /api/symbols/search      → Alpaca /v2/assets → suggestions  │  │
│  │  /auth/callback           → exchanges code for session       │  │
│  └──────────────┬───────────────────────────┬───────────────────┘  │
└─────────────────┼───────────────────────────┼──────────────────────┘
                  │                           │
                  ▼                           ▼
┌────────────────────────────┐   ┌────────────────────────────────────┐
│   Alpaca Markets           │   │   Supabase (Postgres + Auth)        │
│   /v2/stocks/bars          │   │   - auth.users (managed)            │
│   - daily bars, IEX feed   │   │   - public.user_trades    (RLS)     │
│   /v2/assets               │   │   - public.user_watchlist (RLS)     │
│   - active US equities     │   │   - public.user_settings  (RLS)     │
│   - server-side only       │   │   RLS = `auth.uid() = user_id`      │
│   - ~520 syms / scan       │   │                                     │
│   - N syms / portfolio RSC │   │                                     │
│   - batches of 100         │   │                                     │
└────────────────────────────┘   └────────────────────────────────────┘
```

---

## 5. Request flow — the scanner page

This is the most representative flow; portfolio/settings are simpler variants.

```
User → /scanner
  │
  ▼
┌──────────────────────────────────────────────────────────────────┐
│ 1. Edge middleware (middleware.ts → lib/supabase/middleware.ts)  │
│    - Reads session cookie                                        │
│    - /scanner is in PROTECTED_PREFIXES → if no user, redirect    │
│      to /login?redirectTo=/scanner                               │
└──────────────────────────┬───────────────────────────────────────┘
                           │ authenticated
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│ 2. Dashboard layout (app/(dashboard)/layout.tsx)                 │
│    - Server-side supabase.auth.getUser() (defence in depth)      │
│    - Renders <DashboardShell> with sidebar / header / footer     │
└──────────────────────────┬───────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│ 3. Scanner page (app/(dashboard)/scanner/page.tsx)               │
│    - getOrCreateSettings(supabase, user.id)                      │
│      → if no row, writes defaults from STRATEGY_DEFAULTS          │
│    - Returns <ScannerView settings={...} />                      │
└──────────────────────────┬───────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│ 4. ScannerView (client component)                                │
│    - useEffect on mount: fetch('/api/scan?limit=N')              │
│    - useEffect on interval: refetches every                      │
│      settings.refreshIntervalMinutes                             │
│    - Local state: filters {sp500, nasdaq100}, limit, data, etc.  │
│    - filteredStocks = data.results filtered by active toggles    │
└──────────────────────────┬───────────────────────────────────────┘
                           │ fetch
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│ 5. /api/scan route handler (Node runtime, app/api/scan/route.ts) │
│    a. Parse ?limit, ?risk, ?exclude                              │
│    b. cacheKey = `${risk}|${exclude}` — process-local Map cache  │
│       (1-hour TTL). On hit: slice top-N, return.                 │
│    c. Miss → universeMinus(exclude) → ~520 symbols               │
│    d. fetchDailyBars() — Alpaca, chunks of 100, parallel         │
│    e. For each ticker: evaluateTicker(bars, rule)                │
│       - Applies 4 hard filters; null if any fails                │
│       - Computes score = Sv + Sr + Sρ ∈ [0, 100]                 │
│       - Attaches indices via getIndicesFor(ticker)               │
│       - Attaches chartBars: last 90 closes (for the modal chart) │
│    f. rankResults(passed) → sort by score desc                   │
│    g. Cache full ranked payload; respond with slice(0, limit)    │
└──────────────────────────┬───────────────────────────────────────┘
                           ▼
                       JSON to client → table renders;
                       clicking Info opens SetupAuditModal which
                       feeds row.chartBars into <StockTargetChart />
```

### Watchlist flow — same scoring engine, different gate

```
User → /watchlist
  │
  ▼
1. Same middleware + dashboard layout gates as Scanner.
2. /watchlist/page.tsx (RSC):
   - getOrCreateSettings(supabase, user.id) → same settings row as scanner
   - <WatchlistView settings={...} />
3. WatchlistView (client):
   a. On mount + every settings.refreshIntervalMinutes:
      fetch('/api/scan?mode=watchlist&maxAgeSeconds=...')
   b. Route handler with mode=watchlist:
      - Reads `user_watchlist` rows for the authenticated user
      - Cache key = `watchlist|<userId>|<risk>|<sorted-symbols>` so
        edits to the personal list invalidate independently from
        the global scanner cache
      - Calls fetchDailyBars(userSymbols) for just that list
      - For each ticker: evaluateTickerForWatchlist(bars, rule)
          · all 4 rules pass → ScanResult unchanged
          · any rule fails  → score is halved, tier recomputed,
                              row still returned (NOT filtered out)
      - rankResults → JSON
   c. Add-symbol UX:
      - Debounced input (200 ms) → fetch('/api/symbols/search?q=...')
      - The handler hits Alpaca /v2/assets, filters to ACTIVE +
        TRADABLE + asset_class=us_equity, then ranks matches as
        exact > symbol-prefix > name-prefix > name-contains
      - Selecting a suggestion (or pressing Enter on an exact match)
        inserts into `public.user_watchlist` via the browser
        Supabase client; RLS enforces auth.uid() = user_id
      - Duplicate-key (23505) is silently swallowed; other errors
        surface in a red banner
   d. Remove button → optimistic delete from local state, then
      Supabase DELETE; rolled back on error.
   e. Each row shows "Setup Active" (all 4 rules pass) or
      "No Setup · Trend Filter Failed" (any rule fails, score halved).
   f. Info button opens the same SetupAuditModal used by the scanner.
```

### GMMA scanner flow — same shape, different engine

```
User → /gmma-scanner
  │
  ▼
1. Same middleware + dashboard layout gates as Scanner.
2. /gmma-scanner/page.tsx (RSC):
   - getOrCreateSettings(supabase, user.id) → same settings row
   - <GmmaScannerView settings={...} />
3. GmmaScannerView (client):
   a. On mount + every settings.refreshIntervalMinutes:
      fetch('/api/scan-gmma?limit=N&maxAgeSeconds=...')
   b. Route handler (app/api/scan-gmma/route.ts):
      - Cache key = `gmma|<exclude>` — user-agnostic, 1-hour TTL,
        same Map-based in-process cache pattern as /api/scan
      - universeMinus(exclude) → fetchDailyBars (shared Alpaca layer)
      - For each ticker: evaluateGmmaTicker(bars) (lib/gmma-scanner.ts)
          · needs ≥ 60 bars (EMA60 seed + AO(34))
          · rule 1: EMA30 > EMA35 > EMA40 > EMA45 > EMA50 > EMA60
          · rule 2: EMA60 ≤ close ≤ EMA30 (pullback into the ribbon)
          · rule 3: AO(t) > AO(t-1) (momentum turning up)
          · targetSl = max(EMA60, 5-bar swing low); reject if ≥ close
          · targetTp = close + 2 × (close - targetSl)  → 1:2 R:R
      - rankGmmaResults → ascending riskPerShare / close
        (tightest relative stop first), then slice top-N
   c. Position sizing is client-side:
      shares = floor(totalCapital × riskPerTradePct% / riskPerShare)
      — so the cached payload is shareable across users while each
      sees their own size. shares ≤ 0 renders "n/a" and disables Add.
   d. TP is fee-adjusted client-side (feeAdjustedTp):
      targetTp += brokerFeeUsd / shares
      — covers the broker's round-trip commission so a win still
      nets 2× the risked amount. Fee = 0 or shares ≤ 0 → raw TP.
   e. + Add inserts into user_trades with the STRUCTURAL targets
      (fee-adjusted targetTp / r.targetSl), not the percentage-based
      computeTpSl used by the classic scanner.
```

### Portfolio flow — server-side bars for chart expansions

```
User → /portfolio
  │
  ▼
1. Same middleware + dashboard layout gates as Scanner.
2. /portfolio/page.tsx (RSC):
   - listTrades(supabase, user.id) → open + archived
   - openTickers = unique tickers from OPEN trades
   - if openTickers.length > 0: fetchDailyBars(openTickers)
       → server-side Alpaca call, never client→Alpaca
       → builds Record<ticker, { chartBars, currentPrice }>
       → degrades silently to {} on error
   - <PortfolioView open={open} archived={archived} charts={...} />
3. PortfolioView (client):
   - Each open row has a chevron button; clicking expands a
     full-width row with <StockTargetChart />.
   - TP / SL are the immutable snapshots from user_trades
     (target_tp / target_sl), so user can see how far price
     has drifted from entry toward either target.
```

### What "+ Add" does

Independent of the scan fetch. Runs entirely client-side against Supabase:

```
User clicks + Add on row r
  │
  ▼
ScannerView.onAdd(r):
  - supabase.auth.getUser() (browser client)
  - computeTpSl(r.close, settings) → targetTp, targetSl
  - supabase.from('user_trades').insert({
      user_id, ticker, entry_price: r.close,
      target_tp, target_sl, status: 'OPEN'
    })
  - RLS policy `trades_insert_own` enforces auth.uid() = user_id
  - On success: setAddedTickers(prev.add(r.ticker)) — button flips to "Added"
```

The TP/SL values are written into the row, **not recomputed on read**, so editing settings later doesn't move stops on open trades.

---

## 6. Authentication flow

```
┌──────────────────────────────────────────────────────────────────┐
│ Sign-up                                                          │
│   /login → email+password form                                   │
│   supabase.auth.signUp({ ..., options.emailRedirectTo:           │
│                                'https://.../auth/callback' })    │
│   → Supabase emails a confirmation link                          │
│   → User clicks → /auth/callback?code=...                        │
│   → route.ts: exchangeCodeForSession(code), redirect to /scanner │
│                                                                  │
│ Sign-in                                                          │
│   supabase.auth.signInWithPassword({ email, password })          │
│   → cookie set by Supabase SSR helper                            │
│   → router.replace('/scanner')                                   │
│                                                                  │
│ Every subsequent request                                         │
│   middleware.ts → updateSession() refreshes the cookie if near   │
│   expiry, then route guards run                                  │
│                                                                  │
│ Sign-out                                                         │
│   DashboardShell.logOut() → supabase.auth.signOut()              │
│   → router.replace('/login') + router.refresh()                  │
└──────────────────────────────────────────────────────────────────┘
```

Three Supabase clients live in `lib/supabase/`:

- **`server.ts`** — for RSC and route handlers. Reads cookies via `next/headers`.
- **`client.ts`** — for `"use client"` components. Browser-side, reads `document.cookie`.
- **`middleware.ts`** — for edge middleware. Reads + writes cookies on the `NextRequest`/`NextResponse` pair so the session can be refreshed transparently.

All three use the same `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The service role key is **not** used by the app — security is delegated to RLS.

---

## 7. Data model

Three tables, all keyed by `user_id` and fully RLS-locked to the owning user. The full DDL is in `supabase/migrations/bootstrap.sql`.

### `public.user_trades`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid | FK → `auth.users` ON DELETE CASCADE |
| `ticker` | varchar(12) | |
| `entry_price` | numeric(10,2) | snapshot at "+ Add" click |
| `target_tp` | numeric(10,2) | snapshot, never recomputed |
| `target_sl` | numeric(10,2) | snapshot, never recomputed |
| `status` | varchar(20) | CHECK `('OPEN','HIT_TP','HIT_SL','CLOSED')` |
| `notes` | text | nullable |
| `created_at` | timestamptz | default `now()` |
| `closed_at` | timestamptz | nullable |

Indexes: `(user_id, status)` and `(user_id, created_at desc)`.

### `public.user_watchlist`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid | FK → `auth.users` ON DELETE CASCADE |
| `ticker` | varchar(12) | Stored as the user provided; the API uppercases on read |
| `created_at` | timestamptz | default `now()` |

Unique constraint: `(user_id, ticker)` — adding the same symbol twice is a no-op (the API treats Postgres error `23505` as success).

Indexes: `(user_id, created_at desc)` for the watchlist listing query.

Migration: `0006_user_watchlist.sql`.

### `public.user_settings`

One row per user. Schema mirrors `StrategySettings` in `lib/strategy.ts`:

| Column | Type | Default |
|---|---|---|
| `user_id` | uuid PK | FK → `auth.users` |
| `tp_pct` | numeric(5,4) | `0.0400` |
| `sl_pct` | numeric(5,4) | `0.0200` |
| `rsi_low` / `rsi_high` | int | 55 / 65 (CHECK `high > low`) |
| `ma_short` / `ma_long` | int | 50 / 200 (CHECK `long > short`) |
| `scanner_limit` | int | 10 (CHECK 1–100) |
| `refresh_interval_minutes` | int | 5 |
| `atr_min_pct` | numeric(5,4) | `0.0150` (CHECK 0–0.2) — ATR volatility floor (migration `0007`) |
| `total_capital` | numeric(12,2) | `10000.00` (CHECK ≥ 0) — account size for GMMA position sizing (migration `0008`) |
| `risk_per_trade_pct` | numeric(5,2) | `1.00` (CHECK 0–10, exclusive low) — % of capital risked per GMMA trade (migration `0008`) |
| `broker_fee_usd` | numeric(8,2) | `2.00` (CHECK 0–100) — flat round-trip commission folded into the GMMA TP (migration `0009`) |
| `updated_at` | timestamptz | trigger keeps fresh |

### RLS

Same shape on every table — `auth.uid() = user_id` on `select`, `insert`, `update`, `delete` (watchlist exposes only select/insert/delete; rows aren't mutated in place). No service-role bypasses anywhere in the app.

---

## 8. The scanning library (`lib/`)

The scoring/ranking core is intentionally framework-free — pure TS, no React, no Next.js — so it's straightforward to unit-test and easy to lift into a future cron job.

```
                    ┌──────────────────────────┐
                    │      route.ts            │
                    │  (orchestrates the run)  │
                    └────┬─────────┬───────────┘
                         │         │
              universeMinus      fetchDailyBars
                  (universe.ts)   (alpaca.ts)
                         │         │
                         ▼         ▼
                  ~520 symbols  Record<ticker, DailyBar[]>
                         │         │
                         └────┬────┘
                              ▼
                       evaluateTicker
                       (scanner.ts)
                          │     │
                  indicators.ts  getIndicesFor (universe.ts)
                  SMA, RSI(14)        sp500/nasdaq100 sets
                          │
                          ▼
                   ScanResult | null
                          │
                          ▼
                  rankResults → sort by score desc
                          │
                          ▼
                  sliceTop(payload, limit)
                          │
                          ▼
                       JSON response
```

Key invariants:

- `indicators.ts` is pure and side-effect-free.
- `evaluateTicker` returns `null` if any of the four hard rules fails or if there isn't enough bar history (`maLong + 1` bars minimum).
- `evaluateTickerForWatchlist` shares the same `computeScan` core but **never gates on rule failure**. When any rule fails, the composite score is halved and the tier is recomputed against the halved value (so a 88 → 44 drops from High to Low). It still returns `null` if the ticker doesn't have enough history to score at all.
- `ScanResult.indices` is always populated; an empty array means the ticker is ETF-only (no index membership). The Scanner client's toggle filter then naturally hides it whenever no index toggle covers it. The Watchlist UI ignores this field — users can add anything tradable.
- `ScanResult.chartBars` is always populated with the last 90 daily closes (or all available if fewer). This is the single source of truth for the chart embedded in the Scanner / Watchlist modals — no client-side Alpaca fetch.
- The in-process cache is a `Map<cacheKey, { at, payload }>`. Scanner keys are `scanner|<risk>|<exclude>`; watchlist keys are `watchlist|<userId>|<risk>|<sortedSymbols>`. It survives between requests **on the same serverless instance** but does *not* survive cold starts. That's a feature, not a bug — Alpaca data is stale-tolerant for an hour but should be refreshed on every redeploy.
- The watchlist `addSymbol` flow trusts `/api/symbols/search` to validate that the symbol is a live, tradable US equity. The server route requires authentication; the Alpaca `/v2/assets` list is fetched once per cold start and held in module memory.
- `lib/gmma-scanner.ts` is a second, fully independent engine following the same conventions: pure TS, no framework imports, `evaluateGmmaTicker` returns `null` on any rule failure / insufficient history (< 60 bars) / non-positive risk-per-share, `rankGmmaResults` orders by ascending `riskPerShare / close`, and `GmmaScanResult.chartBars` / `.indices` reuse the same types and helpers as the classic `ScanResult`. Its cache (`gmmaScanCache`, keys `gmma|<exclude>`) is a separate `Map` from the classic scanner's, so the two never evict each other.

---

## 9. Configuration & environment

| Env var | Where used | Public? |
|---|---|---|
| `ALPACA_API_KEY_ID` | `lib/alpaca.ts` (server only) | No |
| `ALPACA_SECRET_KEY` | `lib/alpaca.ts` (server only) | No |
| `ALPACA_DATA_URL` | optional override; defaults to `https://data.alpaca.markets` | No |
| `NEXT_PUBLIC_SUPABASE_URL` | all three Supabase clients | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | all three Supabase clients | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | declared in env example, **not currently referenced** | No |

The `NEXT_PUBLIC_*` keys are safe to expose because RLS is the actual access boundary. The Alpaca keys are server-only — they're read in `getCreds()` and never bundled into client code (route handlers run on the Node runtime).

User-facing settings (TP %, SL %, RSI band, MA lengths, top-N, refresh interval) are stored per-user in `public.user_settings` and validated with the Zod `strategySchema` before save.

---

## 10. UI shell & navigation

```
DashboardShell (lib component, client-side)
├── <aside> — vertical nav on lg, horizontal scroll on mobile
│   ├── TrendScan wordmark
│   ├── Scanner       /scanner      (◎)
│   ├── GMMA Scanner  /gmma-scanner (⚡)
│   ├── Watchlist     /watchlist    (★)
│   ├── Portfolio     /portfolio    (▣)
│   ├── Settings      /settings     (⚙)
│   └── Log Out
├── <header> — current page title + avatar (initials from email)
├── <main> — children (the active view)
└── <footer>
    ├── "TrendScan is an informational tool…" disclaimer
    └── "Created by santiagovasco.com"
```

Active-route detection is `pathname?.startsWith(item.href)`, so sub-routes (e.g. a future `/portfolio/[id]`) keep the parent tab highlighted.

The marketing surface has its own minimal layout (`app/(marketing)/layout.tsx`) — no sidebar, just the footer with the same disclaimer + attribution.

---

## 11. Conventions worth knowing

- **`force-dynamic`** on every authed page and on `/api/scan` — disables ISR/static rendering for anything that depends on the user session or live market data.
- **Server components fetch DB rows; client components fetch the scan API.** This split keeps Alpaca-bound work off the SSR critical path (the scan would block the first paint for 3–6s otherwise).
- **No ORM.** `lib/db/*.ts` files are thin wrappers around `supabase.from(...)` with a tiny mapper layer (`settingsFromRow` / `settingsToRow`) to bridge snake_case columns and camelCase TS.
- **Zod only on writes.** `strategySchema` validates the settings form before save. Reads trust the DB shape because RLS + CHECK constraints already gate it.
- **One shared visual component.** Every control is a hand-rolled `<button>` / `<select>` / `<input>` with Tailwind. The reused atoms across pages are: the score badge (inline in both `ScannerView.tsx` and `WatchlistView.tsx`), the `IndexToggle` (inline in `ScannerView.tsx`), `SetupAuditModal` (in `app/(dashboard)/scanner/` but imported by `WatchlistView.tsx` too), and **`StockTargetChart`** (`app/(dashboard)/_components/StockTargetChart.tsx`), the only file that touches Recharts.
- **`StockTargetChart` contract.** Pure presentational client component. Props: `ticker`, `currentPrice`, `tpTargetPrice`, `slTargetPrice`, `historicalData: { date, close }[]`. Renders an `AreaChart` with three `ReferenceLine`s (TP emerald-dashed, SL rose-dashed, current price slate-dotted) plus a `ReferenceDot` at the latest close. Has a built-in 30d / 3mo range toggle that slices `historicalData` client-side — the caller always passes the full 90-bar window. Animations are disabled (`isAnimationActive={false}`) for fast renders inside expanding rows / modals.
- **Type safety for the universe.** `IndexName` is `"sp500" | "nasdaq100"`; `ScanResult.indices: IndexName[]` keeps client filtering exhaustive.

---

## 12. Where to make common changes

| You want to… | Edit |
|---|---|
| Tune the scoring weights or clamps | `lib/scanner.ts` (`computeScan`) |
| Change how watchlist failures are penalised | The `* 0.5` in `evaluateTickerForWatchlist` (`lib/scanner.ts`) |
| Tune the GMMA fan periods or entry rules | `EMA_PERIODS` + the rule checks in `evaluateGmmaTicker` (`lib/gmma-scanner.ts`) |
| Change the GMMA stop anchors or the 1:2 R:R multiple | The `max(e60, low5d)` / `2 * riskPerShare` lines in `evaluateGmmaTicker` (`lib/gmma-scanner.ts`) |
| Change how GMMA position size is computed | `computeShares` in `GmmaScannerView.tsx` |
| Change how the broker fee adjusts the GMMA TP | `feeAdjustedTp` in `GmmaScannerView.tsx` |
| Change the default strategy values (incl. capital / risk / broker fee) | `STRATEGY_DEFAULTS` in `lib/strategy.ts` |
| Add a new ticker to the scanned universe | `lib/universe.json` |
| Change the scanner cache TTL upper bound | `CACHE_TTL_MS` in `app/api/scan/route.ts` and `app/api/scan-gmma/route.ts` |
| Change the default client-side max-age | `DEFAULT_MAX_AGE_MS` in `app/api/scan/route.ts` and `app/api/scan-gmma/route.ts` |
| Change how many chart bars the API ships | `CHART_BARS_LOOKBACK` in `lib/scanner.ts` (and `app/(dashboard)/portfolio/page.tsx` for the portfolio fetch) |
| Add a new chart range option (e.g. 6mo) | `RANGE_BARS` map + the toggle group in `StockTargetChart.tsx`; bump server lookback if longer than 90 |
| Restyle the chart (colors, gradient, axes) | `StockTargetChart.tsx` — Recharts is contained to this one file |
| Change autocomplete result count | `MAX_RESULTS` in `app/api/symbols/search/route.ts` |
| Change watchlist autocomplete ranking | `app/api/symbols/search/route.ts` (the exact / symbolPrefix / namePrefix / nameContains buckets) |
| Add a new protected route | `PROTECTED_PREFIXES` in `lib/supabase/middleware.ts` and a folder under `app/(dashboard)/` |
| Add a new column to a table | Write a new file under `supabase/migrations/` (do not edit old ones) and update the matching mapper in `lib/db/` |
| Tweak the navigation | `NAV` array in `app/(dashboard)/_components/DashboardShell.tsx` |
| Change the email template | Supabase dashboard → Authentication → Email Templates (HTML is in the README under "Branded email template") |

---

## 13. What this codebase deliberately doesn't do

- **No order routing.** "+ Add" writes a row; nothing leaves the system to a broker. The footer disclaimer is intentional, not boilerplate.
- **No real-time data.** Daily bars only, IEX feed, ~250 trading days of history. Sufficient for swing-trade (1–5 day) setups; insufficient for intraday.
- **No background jobs / no cron.** The scan runs lazily on user request and caches in-process. There is no scheduled refresh, no notification, no alerting.
- **No multi-user features.** Every row is owned by exactly one `user_id`. There are no teams, shares, or comparisons.
- **No retries / no queue.** Alpaca errors surface immediately as 500/502 to the client, which renders them in a red banner.
