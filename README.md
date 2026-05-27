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
# In Supabase dashboard → SQL Editor, run the consolidated bootstrap (idempotent):
#   supabase/migrations/bootstrap.sql
# Or paste the individual files in order (0001 → 0002 → 0003 → 0004).

# 4. Configure auth — see "Supabase auth configuration" below.

# 5. Run
npm run dev
# → http://localhost:3000
```

## Supabase auth configuration

### Redirect URLs

In **Authentication → URL Configuration**:

**Site URL** — set to the environment you're testing in (`http://localhost:3000` for dev, `https://trend-scan.vercel.app` once deployed).

**Redirect URLs** — paste these so email confirmation links resolve through the `/auth/callback` route the app provides:

```
https://trend-scan.vercel.app/auth/callback
https://trend-scan.vercel.app/auth/callback?next=**
https://trend-scan-*.vercel.app/auth/callback
https://trend-scan-*.vercel.app/auth/callback?next=**
http://localhost:3000/auth/callback
http://localhost:3000/auth/callback?next=**
```

`**` is Supabase's glob wildcard for "anything including slashes" and is what allows the `?next=/scanner` query string through the allowlist.

### Branded email template — "Confirm signup"

In **Authentication → Email Templates → Confirm signup**, replace the default HTML with the template below. It matches the TrendScan dark / emerald aesthetic and uses Supabase's `{{ .Email }}`, `{{ .ConfirmationURL }}`, and `{{ .RedirectTo }}` variables.

> **Subject:** `Confirm your TrendScan account`

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ .Email }} - Confirm Your TrendScan Account</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0f172a; padding: 48px 20px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; background-color: #1e293b; border-radius: 12px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);">

          <tr>
            <td style="padding: 32px 32px 16px 32px; text-align: left;">
              <div style="font-size: 22px; font-weight: 700; color: #34d399; letter-spacing: -0.05em; display: inline-block;">
                [T] TrendScan
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #f8fafc; letter-spacing: -0.025em;">
                {{ .Email }} - Confirm your email address
              </h2>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #94a3b8;">
                Welcome to the platform. Follow the verification secure link below to validate your email address, activate your data isolation profile, and finish setting up your dashboard.
              </p>

              <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center" style="border-radius: 6px; background-color: #10b981;">
                    <a href="{{ .ConfirmationURL }}" target="_blank" style="display: inline-block; padding: 12px 24px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px; letter-spacing: -0.01em;">
                      Confirm Email Address
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748b; border-top: 1px solid #334155; padding-top: 16px;">
                <strong>Security note:</strong> This confirmation link is uniquely bound to your account authorization step and will expire shortly. If you did not initiate this request, you can safely disregard this message.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 16px 32px; background-color: #0f172a; text-align: center; border-top: 1px solid #334155;">
              <p style="margin: 0; font-size: 12px; color: #475569;">
                Quantitative Momentum Engine Core v1.0 - santiagovasco.com
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

**Template variables in play:**

| Variable | Provided by Supabase as | Used for |
| --- | --- | --- |
| `{{ .Email }}` | The recipient's email address | Personalising the subject and headline |
| `{{ .ConfirmationURL }}` | The signed verification link Supabase mints, already pointed at the Site URL + `emailRedirectTo` | The CTA button `href` |
| `{{ .RedirectTo }}` | The raw `emailRedirectTo` value the client SDK sent | Optional — surface for debugging only |

When updating the template, **save and send yourself a test confirmation** before announcing changes to users. Supabase ships any HTML save immediately — there's no preview/revert.

### Other email templates

The same brand pattern (slate-900 canvas, emerald CTA, mono `[T] TrendScan` wordmark) can be cloned onto the other Supabase templates as you build them out:

- **Magic link** — replace the headline with "Your secure sign-in link".
- **Change email address** — confirm new address; same CTA style.
- **Reset password** — replace the security-note copy.

Keep the footer line `Quantitative Momentum Engine Core v1.0 - santiagovasco.com` consistent across all of them so users learn to recognise legitimate TrendScan mail at a glance.

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
