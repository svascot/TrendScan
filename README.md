# TrendScan

A lightweight, hosted momentum scanner + manual portfolio tracker for 1–5 day swing trades on the NYSE. Built for a small group of users (family / friends).

## What it does

- Scans a curated universe of ~600 large-cap US equities + premium ETFs (S&P 500, Nasdaq 100, SPY/QQQ/SCHD/JEPQ, sector SPDRs) against four hard rules every visit:
  1. `close > MA(maLong)` — macro health
  2. `close > MA(maShort)` — short-term momentum
  3. `MA(maShort) > MA(maLong)` — golden-cross orientation
  4. `rsiLow ≤ RSI(14) ≤ rsiHigh` — runway band, no overbought
- Ranks passing tickers via a 3-factor score (velocity 50%, RSI sweet-spot 30%, volume injection 20%).
- Each user has a personal **strategy** (TP%, SL%, RSI band, MA lengths, Top-N). Scanner TP/SL columns reflect *the viewing user's* values; clicking **+ Add** snapshots the current settings into the trade row.
- Portfolio tracker is fully **manual**: user marks `HIT_TP`, `HIT_SL`, or `CLOSED` once their broker confirms. Archive shows win rate.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Supabase (Postgres + Auth + RLS)
- Alpaca Markets Stocks Historical Data (free tier, IEX feed)
- Deploy: Vercel

## Local setup

```bash
# 1. Install
npm install

# 2. Credentials — copy template and fill in your keys.
cp .env.local.example .env.local
# Edit .env.local:
#   ALPACA_API_KEY_ID, ALPACA_SECRET_KEY     (from https://alpaca.markets)
#   NEXT_PUBLIC_SUPABASE_URL,
#   NEXT_PUBLIC_SUPABASE_ANON_KEY,
#   SUPABASE_SERVICE_ROLE_KEY                (from your Supabase project)

# 3. Apply database migrations.
# In Supabase dashboard → SQL Editor, paste each file in order:
#   supabase/migrations/0001_user_trades.sql
#   supabase/migrations/0002_user_settings.sql
#   supabase/migrations/0003_rls.sql

# 4. Run
npm run dev
# → http://localhost:3000
```

## Project layout

```
app/
├── (marketing)/        # Public landing — URL: /
├── (dashboard)/        # Authed app — URLs: /scanner, /portfolio, /settings
├── login/              # Sign-in + sign-up
├── api/scan/           # Serverless scanner endpoint
└── layout.tsx
lib/
├── indicators.ts       # SMA + Wilder RSI(14)
├── strategy.ts         # Defaults, zod schema, TP/SL helpers, row mappers
├── scanner.ts          # Rule eval + multi-factor scoring
├── alpaca.ts           # Batched bars fetcher
├── universe.ts         # Deduped universe loader
├── universe.json       # S&P 500 + Nasdaq 100 + premium ETFs
├── format.ts           # eToro link, name/initials, formatters
├── supabase/{server,client,middleware}.ts
└── db/{settings,trades}.ts
middleware.ts           # Route guard
supabase/migrations/    # SQL DDL
```

## API

`GET /api/scan?limit=10&exclude=AAPL,TSLA&risk=med` — runs the scan, returns ranked results.

| Param     | Type                 | Default |
| --------- | -------------------- | ------- |
| `limit`   | int (1–100)          | 10      |
| `exclude` | CSV of tickers       | none    |
| `risk`    | `low` \| `med` \| `high` | `med`   |

Response (truncated):

```json
{
  "generatedAt": "2026-05-27T20:34:11.000Z",
  "count": 10,
  "rule": { "rsiLow": 55, "rsiHigh": 65, "maShort": 50, "maLong": 200 },
  "risk": "med",
  "skipped": 432,
  "results": [
    { "ticker": "NVDA", "close": 124.5, "score": 94.2, "tier": "High", "ma50": 112.4, "ma200": 98.2, "rsi14": 58.6, "volume": 42000000, "avgVolume20": 26000000, "breakdown": { ... } }
  ]
}
```

Results are cached per `(risk, exclude)` for 1 hour to avoid pummeling the Alpaca free tier on reloads.

## Deploy to Vercel

1. Push to a private GitHub repository.
2. Import the repo in Vercel.
3. Paste env vars from `.env.local.example` into the Vercel project's Environment Variables — **with rotated values**, never the originals from the spec doc.
4. Deploy. Every `git push` to `main` triggers a rebuild.

## Security notes

- `SUPABASE_SERVICE_ROLE_KEY` and `ALPACA_SECRET_KEY` are server-only. Never reference them in client components or commit them.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are intended to be public — RLS does the access control.
- RLS policies enforce `auth.uid() = user_id` on every read/write to `user_trades` and `user_settings`.

## Disclaimer

TrendScan is an informational tool. It does not execute trades and is not financial advice.
