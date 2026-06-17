# TrendScan

> TrendScan is a quantitative momentum scanning platform designed to identify high-probability setups for short-term swing trading (1 to 5 days) within the universe of the S&P 500 and the top 100 tech companies. Through strict algorithmic filtering based on strategic moving averages ($\text{MA}_{50}$ / $\text{MA}_{200}$) and the Relative Strength Index ($\text{RSI}_{14}$), the system automates the detection of assets in a structural uptrend. Each alert mathematically generates the optimal entry price along with fixed, automated Take Profit and Stop Loss targets, completely eliminating emotional bias in risk management.

A lightweight, hosted momentum scanner + manual portfolio tracker built for a small group of users (family / friends).

## How TP / SL is calculated (worked example)

**SL on real support, TP at a strict 1:2 that's reachable.** The **SL** sits just below the recent *support* (pullback low) — a real level. The **TP** is a strict **1:2** (entry + 2×risk), but the setup is only kept if that TP lands *below* the recent *resistance* — a price the stock already traded — so it's reachable, not beyond a wall. The **fee-covered** prices then shift both levels by the per-share fee so the 1:2 also holds on the actual dollars in your account.

| Input | Value |
| --- | --- |
| Entry (today's close) | **$100.00** |
| ATR(14) (for buffers) | **$4.00** |
| Support (10-bar low) | **$97.00** |
| Resistance (20-bar high) | **$112.00** |
| Capital × risk % | **$12,600 × 1% = $126** |
| Broker fee (round trip) | **$2.00** |

1. **SL** = support − 0.3 × ATR = 97 − 1.2 = **$95.80**  → risk = **$4.20 / share**
2. **TP** = entry + 2 × risk = 100 + 8.40 = **$108.40**  (strict 1:2)
3. **Reachable?** TP $108.40 ≤ resistance − 0.25×ATR = 112 − 1.0 = $111 → **✓ kept** (if the 1:2 TP were *above* resistance, the setup is skipped)
4. **Shares** = min(126 ÷ 4.20, 12,600 ÷ 100) = **30**
5. **Fee / share** = $2 ÷ 30 = **$0.07**
6. **TP(fee)** = 108.40 + 0.07 = **$108.47**;  **SL(fee)** = 95.80 + 0.07 = **$95.87** (slightly tighter stop)

Net P&L on the 30-share position, after the $2 round-trip fee:

| Plan | If TP hit | If SL hit | Net ratio |
| --- | --- | --- | --- |
| No-fee levels ($108.40 / $95.80) | +$250 | −$128 | ≈ 1.95 : 1 (the flat fee tilts it) |
| **Fee-covered ($108.47 / $95.87)** | **+$252** | **−$126** | **exactly 2 : 1** |

The fee-covered plan makes your net loss equal your budgeted risk ($126 = 1%) and your net win exactly 2× ($252), so the 1:2 survives commissions. If the strict 1:2 TP would land *above* the recent resistance, the setup is skipped — that target isn't realistically reachable. If a position is tiny enough that the per-share fee exceeds the risk, the fee-covered plan can't exist — size up so a flat fee stays negligible.

## What it does

- Scans a curated universe of ~600 large-cap US equities + premium ETFs (S&P 500, Nasdaq 100, SPY/QQQ/SCHD/JEPQ, sector SPDRs) against four hard rules every visit.
- Ranks the survivors with a transparent 3-factor composite score.
- Runs a second, independent **GMMA scanner** over the same universe — a Guppy Multiple Moving Average dual ribbon (short/trader EMAs 3/5/8/10/12/15 above long/investor EMAs 30/35/40/45/50/60) with a pullback-into-the-short-ribbon entry and an Awesome Oscillator confirmation (bullish saucer or zero-line cross). Each match ships a stop just below the recent support (pullback low, buffered by a fraction of ATR) and a **strict 1:2** take-profit (entry + 2×risk) — kept only when that target lands below the recent resistance, so it's realistically reachable. It also ships a position size in shares from the user's money-management settings (total capital × risk per trade). Both the stop and target come in **fee-covered** variants that bake in the round-trip broker fee so the net 1:2 survives commissions (see the worked example above).
- Lets each user maintain a personal **watchlist** of arbitrary US equities — autocompleted from Alpaca's tradable-asset feed — and runs the same scoring engine against it. Failing setups stay visible with their score halved so you can watch them recover.
- Lets each user manually track open trades against personalised TP/SL targets and archive closed ones with a running win rate.
- Stays on permanent free tiers across Vercel + Supabase + Alpaca.

## Scanner algorithm

### Inputs

| Source | Detail |
| --- | --- |
| Universe | `lib/universe.json` — S&P 500 (~500), Nasdaq 100 (~100), 16 premium ETFs. Deduped at load time → ~520 unique symbols. |
| Price data | Alpaca Markets `/v2/stocks/bars` — daily bars, IEX feed (free tier), ~250 trading days of history fetched per call. |
| Strategy parameters | Loaded per-user from `public.user_settings` (TP %, SL %, RSI band, MA lengths, Top-N). Defaults live in `lib/strategy.ts`. |
| Query filters | `?limit=`, `?exclude=AAPL,TSLA`, `?risk=low\|med\|high` on `/api/scan`. |

### Indicators

Two indicators are computed in `lib/indicators.ts`:

**Simple Moving Average** — arithmetic mean of the last `n` closes:

$$\text{SMA}_n(t) = \frac{1}{n}\sum_{i=t-n+1}^{t} \text{close}_i$$

**Wilder's Relative Strength Index (period = 14)** — exponential smoothing of average gains vs. average losses, the canonical RSI used by TradingView:

$$\text{RSI}_{14}(t) = 100 - \frac{100}{1 + \dfrac{\overline{G}_t}{\overline{L}_t}} \quad\text{where}\quad \begin{cases}\overline{G}_t = \dfrac{13 \cdot \overline{G}_{t-1} + \text{gain}_t}{14} \\ \overline{L}_t = \dfrac{13 \cdot \overline{L}_{t-1} + \text{loss}_t}{14}\end{cases}$$

The seed values $\overline{G}_{14}$ and $\overline{L}_{14}$ are the plain averages of the first 14 daily changes.

### The four hard filters

A ticker must pass **all four** to advance to ranking:

| # | Rule | Intent |
| --- | --- | --- |
| 1 | $\text{close} > \text{MA}_{200}$ | Macro health — only buy names trading above their long-term structural support. |
| 2 | $\text{close} > \text{MA}_{50}$ | Short-term momentum — current price is leading, not lagging, the medium-term trend. |
| 3 | $\text{MA}_{50} > \text{MA}_{200}$ | Golden-cross orientation — the medium-term trend is itself above the long-term trend. |
| 4 | $\text{rsiLow} \le \text{RSI}_{14} \le \text{rsiHigh}$ | Runway band (default 55–65) — strong but not overbought. Avoids buying exhaustion peaks. |

### The composite ranking score (0–100)

Surviving tickers are scored with three components. Weights sum to 100; each component normalises its underlying metric to `[0, 1]` before applying the weight, so the result is always bounded.

**1. Velocity factor — weight 50**

How far the current price has pulled away from its 50-day mean:

$$v = \frac{\text{close} - \text{MA}_{50}}{\text{MA}_{50}} \qquad v_\text{norm} = \min\!\left(\max\!\left(\frac{v}{0.15}, 0\right), 1\right) \qquad S_v = 50 \cdot v_\text{norm}$$

The `0.15` clamp ("15 % above MA50 = saturated") prevents a single moonshot from dominating the score and keeps the metric comparable across megacaps and mid-volatility names.

**2. RSI sweet-spot factor — weight 30**

How close $\text{RSI}_{14}$ is to the *centre* of the allowed band (60.0 by default). The further from the centre — in either direction — the lower the score:

$$\text{rsi}_\text{mid} = \frac{\text{rsiLow} + \text{rsiHigh}}{2} \qquad r = \min\!\left(\max\!\left(1 - \frac{|\text{RSI}_{14} - \text{rsi}_\text{mid}|}{(\text{rsiHigh}-\text{rsiLow})/2}, 0\right), 1\right) \qquad S_r = 30 \cdot r$$

This rewards healthy mid-band momentum and discounts both lukewarm setups (RSI ≈ 55) and over-stretched ones (RSI ≈ 65).

**3. Volume injection factor — weight 20**

Today's volume relative to the 20-day average volume:

$$\rho = \frac{\text{volume}_t}{\frac{1}{20}\sum_{i=t-19}^{t} \text{volume}_i} \qquad \rho_\text{norm} = \min\!\left(\max\!\left(\frac{\rho}{2.0}, 0\right), 1\right) \qquad S_\rho = 20 \cdot \rho_\text{norm}$$

The `2.0×` clamp says "double-average volume is institutional confirmation; anything more is gravy." Institutional buying validates that the move has real conviction behind it, not just a thin tape drifting upward.

**Composite:**

$$\text{Score} = S_v + S_r + S_\rho \quad \in [0, 100]$$

A composite ≥ 85 is tagged **High**, ≥ 70 **Med**, otherwise **Low**.

### Trade target generation

When a user clicks **+ Add** on the scanner, the entry price is snapshotted and the targets are computed against *their* strategy settings:

$$\text{target}_\text{TP} = \text{entry} \cdot (1 + \text{tpPct}) \qquad \text{target}_\text{SL} = \text{entry} \cdot (1 - \text{slPct})$$

Defaults of `tpPct = 0.04`, `slPct = 0.02` produce the canonical 1 : 2 risk-to-reward ratio. Both numbers are written into the `user_trades` row, so changing settings later **never** retroactively shifts open trades.

### Full pipeline in pseudocode

```text
PROCEDURE scan(universe, rule, exclude, limit):
    candidates ← universe \ exclude
    bars       ← FETCH_ALPACA_DAILY_BARS(candidates, lookback ≈ 250 trading days)
                 # batched 100 symbols/request, parallel
    passed     ← []

    FOR EACH ticker IN candidates:
        series ← bars[ticker]
        IF |series| < rule.maLong + 1:
            CONTINUE                         # insufficient history (new IPO, etc.)

        closes  ← series.close
        volumes ← series.volume
        close   ← closes[last]
        ma50    ← SMA(closes, rule.maShort)
        ma200   ← SMA(closes, rule.maLong)
        rsi     ← WILDER_RSI(closes, period = 14)
        avgVol  ← MEAN(volumes[last-19 .. last])

        # --- 4 hard filters ---
        IF NOT (close  > ma200):              CONTINUE
        IF NOT (close  > ma50 ):              CONTINUE
        IF NOT (ma50   > ma200):              CONTINUE
        IF NOT (rule.rsiLow ≤ rsi ≤ rule.rsiHigh): CONTINUE

        # --- 3-factor composite score ---
        velocity ← (close - ma50) / ma50
        Sv       ← 50 * CLAMP(velocity / 0.15, 0, 1)

        rsi_mid  ← (rule.rsiLow + rule.rsiHigh) / 2
        rsi_half ← (rule.rsiHigh - rule.rsiLow) / 2
        Sr       ← 30 * CLAMP(1 - |rsi - rsi_mid| / rsi_half, 0, 1)

        vol_ratio ← volumes[last] / avgVol
        Sρ        ← 20 * CLAMP(vol_ratio / 2.0, 0, 1)

        score ← Sv + Sr + Sρ                  # ∈ [0, 100]
        tier  ← score ≥ 85 ? "High"
              : score ≥ 70 ? "Med"
              : "Low"

        passed.APPEND({ ticker, close, ma50, ma200, rsi,
                        score, tier, breakdown: {Sv, Sr, Sρ, velocity, vol_ratio} })

    passed ← SORT(passed, key = score, DESC)
    RETURN passed[0 .. limit]


FUNCTION WILDER_RSI(closes, period = 14):
    IF |closes| ≤ period: RETURN null

    gain_sum, loss_sum ← 0, 0
    FOR i = 1 TO period:
        Δ ← closes[i] - closes[i-1]
        IF Δ ≥ 0: gain_sum ← gain_sum + Δ
        ELSE:     loss_sum ← loss_sum - Δ
    avg_gain ← gain_sum / period
    avg_loss ← loss_sum / period

    FOR i = period + 1 TO |closes| - 1:
        Δ    ← closes[i] - closes[i-1]
        gain ← MAX(Δ, 0)
        loss ← MAX(-Δ, 0)
        avg_gain ← (avg_gain · (period - 1) + gain) / period
        avg_loss ← (avg_loss · (period - 1) + loss) / period

    IF avg_loss = 0: RETURN 100
    rs ← avg_gain / avg_loss
    RETURN 100 - 100 / (1 + rs)
```

### Performance notes

- Bars are fetched in **parallel batches of 100 symbols** against Alpaca's multi-symbol endpoint — the full ~520-ticker scan completes in 3–6 s on a warm route.
- Results are cached in process for **1 hour** per `(risk, exclude)` key. Multiple page loads / users hitting the same URL within an hour don't re-query Alpaca.
- All indicators are pure functions in `lib/indicators.ts` — they're trivially unit-testable without network or DB.

## GMMA scanner algorithm

A second, independent scanner lives at `/gmma-scanner` (API: `GET /api/scan-gmma`, engine: `lib/gmma-scanner.ts`). Instead of the MA50/MA200 + RSI composite, it looks for tickers riding an ordered **Guppy Multiple Moving Average fan** with confirmed momentum, and replaces fixed-percentage TP/SL with structural levels and money-management position sizing.

### Indicators

Both are pure functions in `lib/indicators.ts`:

**Exponential Moving Average** — seeded with the SMA of the first $n$ values, then smoothed with $k = \frac{2}{n+1}$:

$$\text{EMA}_n(t) = \text{close}_t \cdot k + \text{EMA}_n(t-1) \cdot (1-k)$$

Six EMAs are computed per ticker: periods 30, 35, 40, 45, 50, 60.

**Awesome Oscillator** — momentum of the median price $m = (\text{high} + \text{low}) / 2$:

$$\text{AO}(t) = \text{SMA}_5(m) - \text{SMA}_{34}(m)$$

Both the current and previous bar's AO are returned so the trigger can require a *rising* oscillator.

### The three hard filters

A ticker must pass **all three** (plus have ≥ 60 daily bars of history):

| # | Rule | Intent |
| --- | --- | --- |
| 1 | $\text{EMA}_{30} > \text{EMA}_{35} > \text{EMA}_{40} > \text{EMA}_{45} > \text{EMA}_{50} > \text{EMA}_{60}$ | Fan fully ordered — every band of the Guppy ribbon agrees the trend is up. |
| 2 | $\text{EMA}_{60} \le \text{close} \le \text{EMA}_{30}$ | Price inside the channel — buying the pullback *into* the ribbon, not chasing an extension above it. |
| 3 | $\text{AO}(t) > \text{AO}(t-1)$ | Momentum turning up — the "green AO bar" confirmation that the pullback is resolving upward. |

### Structural stop loss & dynamic 1:2 take profit

Rather than a flat percentage, the stop is anchored to structure — the **tighter** of two floors:

$$\text{target}_\text{SL} = \max\left(\text{EMA}_{60},\ \min(\text{low}_{t-4} \ldots \text{low}_t)\right)$$

If the stop isn't strictly below the close, the setup is rejected (position sizing would be undefined). The take profit is then placed at twice the risk:

$$\text{risk/share} = \text{close} - \text{target}_\text{SL} \qquad \text{target}_\text{TP} = \text{close} + 2 \cdot \text{risk/share}$$

so every GMMA setup has a 1:2 risk-to-reward ratio **by construction**.

### Ranking & position sizing

Survivors are ranked by **tightest relative risk first** — ascending `riskPerShare / close` — because a tighter stop means more shares fit inside the same risk budget.

Position size is computed client-side from two per-user **Money Management** settings (Settings page, stored in `user_settings`, migration `0008`):

$$\text{shares} = \left\lfloor \frac{\text{totalCapital} \cdot \text{riskPerTradePct} / 100}{\text{risk/share}} \right\rfloor$$

Defaults: `totalCapital = $10,000`, `riskPerTradePct = 1.0%` → a stop-out costs exactly $100.

### Broker-fee-adjusted take profit

A third money-management setting, `brokerFeeUsd` (migration `0009`, default `$2.00`), holds the flat commission your broker charges per **round trip** (entry + exit combined). The displayed TP is raised so a win pays the commission first and *then* nets 2× the risked amount:

$$\text{target}_\text{TP}^{adj} = \text{target}_\text{TP} + \frac{\text{brokerFeeUsd}}{\text{shares}}$$

Example: 100 shares, $1 risk/share, $2 fee → TP sits $0.02 above the raw 1:2 level; hitting it grosses $202, nets $200 after the fee = exactly 2× the $100 risk. The adjustment is applied client-side in `GmmaScannerView.tsx` (`feeAdjustedTp`) — the API payload and cache keep the raw structural TP. With a fee of `0` (commission-free broker) the TP falls back to the pure 1:2 bracket. When shares can't be computed (`n/a` rows), the raw TP is shown and **+ Add** stays disabled.

Clicking **+ Add** snapshots the entry, structural SL, and the **fee-adjusted** TP into `user_trades`, same immutability rule as the classic scanner.

### Caching

Same model as `/api/scan`: in-process cache keyed by `gmma|<exclude>`, 1-hour TTL upper bound, `?maxAgeSeconds=` per-request freshness (default 5 minutes), top-N slicing applied after ranking.

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
# In Supabase dashboard → SQL Editor, run the consolidated bootstrap (idempotent,
# covers 0001 → 0004), then the newer per-feature files in order:
#   supabase/migrations/bootstrap.sql
#   supabase/migrations/0005_user_settings_refresh_interval.sql
#   supabase/migrations/0006_user_watchlist.sql
#   supabase/migrations/0007_user_settings_atr_min_pct.sql
#   supabase/migrations/0008_user_settings_money_mgmt.sql
#   supabase/migrations/0009_user_settings_broker_fee.sql
# Or paste all the individual files in order (0001 → 0009).

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
├── (marketing)/             # Public landing — URL: /
├── (dashboard)/             # Authed app — URLs: /scanner, /gmma-scanner, /watchlist, /portfolio, /settings
├── login/                   # Sign-in + sign-up
├── api/
│   ├── scan/                # Serverless scan endpoint (scanner + watchlist modes)
│   ├── scan-gmma/           # Serverless GMMA scan endpoint
│   └── symbols/search/      # Ticker / company-name autocomplete
└── layout.tsx
lib/
├── indicators.ts            # SMA, Wilder RSI(14), ATR, ROC, EMA, Awesome Oscillator
├── strategy.ts              # Defaults, zod schema, TP/SL helpers, row mappers
├── scanner.ts               # Rule eval + multi-factor scoring (scanner + watchlist)
├── gmma-scanner.ts          # GMMA fan + AO eval, structural SL, 1:2 TP, ranking
├── alpaca.ts                # Batched bars fetcher + active-equities fetcher
├── universe.ts              # Deduped universe loader
├── universe.json            # S&P 500 + Nasdaq 100 + premium ETFs
├── format.ts                # eToro link, name/initials, formatters
├── supabase/{server,client,middleware}.ts
└── db/{settings,trades}.ts
middleware.ts                # Route guard
supabase/migrations/         # SQL DDL
```

## API

### `GET /api/scan`

Runs the scan or returns the user's watchlist scored. Returns ranked results.

| Param            | Type                       | Default | Notes |
| ---------------- | -------------------------- | ------- | ----- |
| `mode`           | `scanner` \| `watchlist`   | `scanner` | Watchlist mode requires authentication and reads from `public.user_watchlist`. |
| `limit`          | int (1–100)                | 10      | Applied only in scanner mode. Watchlist mode returns every row the user added. |
| `exclude`        | CSV of tickers             | none    | Scanner mode only. |
| `risk`           | `low` \| `med` \| `high`   | `med`   | Widens / narrows the RSI band and clamps. |
| `maxAgeSeconds`  | int                        | 300     | Per-request freshness ceiling; clamped to ≤ 3600 (the in-process TTL upper bound). |

Response (truncated):

```json
{
  "generatedAt": "2026-05-27T20:34:11.000Z",
  "count": 10,
  "rule": { "rsiLow": 55, "rsiHigh": 65, "maShort": 50, "maLong": 200 },
  "risk": "med",
  "skipped": 432,
  "results": [
    { "ticker": "NVDA", "close": 124.5, "score": 94.2, "tier": "High", "ma50": 112.4, "ma200": 98.2, "rsi14": 58.6, "volume": 42000000, "avgVolume20": 26000000, "indices": ["sp500", "nasdaq100"], "chartBars": [{ "date": "2026-01-12", "close": 121.4 }, "..."], "breakdown": { ... } }
  ]
}
```

In watchlist mode, rows whose four hard rules don't all pass come back with their composite score **halved** (and `tier` recomputed) instead of being filtered out — so the client can render a "No Setup · Trend Filter Failed" badge while keeping the row visible.

Results are cached in process:
- Scanner: keyed by `(risk, exclude)`.
- Watchlist: keyed by `(userId, risk, sortedSymbols)` — so editing your personal list invalidates only your entry, never another user's, and never the global scanner cache.

Cache survives between requests on the same serverless instance but not across cold starts.

### `GET /api/scan-gmma`

Runs the GMMA fan + Awesome Oscillator scan against the full universe and returns matches ranked tightest-relative-risk first.

| Param            | Type           | Default | Notes |
| ---------------- | -------------- | ------- | ----- |
| `limit`          | int (1–100)    | 10      | Top-N slice applied after ranking. |
| `exclude`        | CSV of tickers | none    | Removed from the universe before scanning. |
| `maxAgeSeconds`  | int            | 300     | Per-request freshness ceiling; clamped to ≤ 3600 (the in-process TTL upper bound). |

Response (truncated):

```json
{
  "generatedAt": "2026-06-11T20:34:11.000Z",
  "count": 10,
  "skipped": 575,
  "results": [
    {
      "ticker": "NVDA", "close": 124.5,
      "ema30": 123.9, "ema35": 122.7, "ema40": 121.4, "ema45": 120.2, "ema50": 119.1, "ema60": 117.6,
      "aoPrev": 1.2041, "aoCurr": 1.5530,
      "targetTp": 138.3, "targetSl": 117.6, "riskPerShare": 6.9, "rrRatio": 2,
      "indices": ["sp500", "nasdaq100"],
      "chartBars": [{ "date": "2026-03-12", "close": 121.4 }, "..."],
      "breakdown": { "rule1FanOrderedPass": true, "rule2PriceInChannelPass": true, "rule3MomentumPass": true, "riskPerSharePositive": true }
    }
  ]
}
```

Position sizing is **not** in the response — the client computes shares from the user's money-management settings, so two users see different sizes for the same payload (and the cache stays user-agnostic, keyed only by `gmma|<exclude>`). The same goes for the broker-fee TP adjustment: `targetTp` in the payload is always the raw structural 1:2 level; the client adds `brokerFeeUsd / shares` on top before displaying or saving it.

### `GET /api/symbols/search?q=...`

Authentication required. Backs the watchlist's add-symbol input. Hits Alpaca's `/v2/assets` endpoint, filters to active + tradable US equities, and returns up to 8 ranked matches.

Ranking: exact symbol → symbol prefix → name prefix → name contains.

Response:

```json
{
  "results": [
    { "symbol": "AAPL", "name": "Apple Inc Common Stock", "exchange": "NASDAQ" }
  ]
}
```

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
