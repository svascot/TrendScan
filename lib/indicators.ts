export function sma(values: readonly number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

export function rsi14(closes: readonly number[], period = 14): number | null {
  if (closes.length <= period) return null;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gainSum += change;
    else lossSum -= change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function meanLast(values: readonly number[], n: number): number | null {
  if (values.length < n || n <= 0) return null;
  let sum = 0;
  for (let i = values.length - n; i < values.length; i++) sum += values[i];
  return sum / n;
}

// Average True Range using Wilder smoothing. Returns the most recent ATR value,
// or null if there are not enough bars to warm the smoothing window.
export function atr(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  period = 14,
): number | null {
  const n = closes.length;
  if (period <= 0) return null;
  if (n <= period || highs.length !== n || lows.length !== n) return null;

  // True Range for i=1..n-1 (uses previous close).
  // Seed: simple average of the first `period` TR values.
  let trSum = 0;
  for (let i = 1; i <= period; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    trSum += Math.max(hl, hc, lc);
  }
  let current = trSum / period;

  for (let i = period + 1; i < n; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    const tr = Math.max(hl, hc, lc);
    current = (current * (period - 1) + tr) / period;
  }
  return current;
}

// Rate of Change (percentage) at the most recent close, comparing to `period` bars ago.
export function roc(closes: readonly number[], period = 9): number | null {
  if (period <= 0 || closes.length <= period) return null;
  const last = closes[closes.length - 1];
  const past = closes[closes.length - 1 - period];
  if (past === 0) return null;
  return ((last - past) / past) * 100;
}

// Exponential Moving Average seeded with the SMA of the first `period` values.
// Returns the most recent EMA value, or null if not enough bars.
export function ema(values: readonly number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  const k = 2 / (period + 1);
  let e = 0;
  for (let i = 0; i < period; i++) e += values[i];
  e /= period;
  for (let i = period; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
  }
  return e;
}

// Awesome Oscillator = SMA(median, 5) - SMA(median, 34), where median = (high + low) / 2.
// Returns the previous and current AO values so the caller can confirm momentum
// (curr > prev = "green bar" / rising AO). Returns null if not enough bars (needs 35).
export function awesomeOscillator(
  highs: readonly number[],
  lows: readonly number[],
): { prev: number; curr: number } | null {
  const n = highs.length;
  if (n !== lows.length || n < 35) return null;

  // Build median price series.
  const median = new Array<number>(n);
  for (let i = 0; i < n; i++) median[i] = (highs[i] + lows[i]) / 2;

  // Rolling sums for SMA(5) and SMA(34) computed in one pass.
  let sum5 = 0;
  for (let i = n - 5; i < n; i++) sum5 += median[i];
  let sum34 = 0;
  for (let i = n - 34; i < n; i++) sum34 += median[i];
  const curr = sum5 / 5 - sum34 / 34;

  // Previous bar: shift each window back by 1.
  const prevSum5 = sum5 - median[n - 1] + median[n - 1 - 5];
  const prevSum34 = sum34 - median[n - 1] + median[n - 1 - 34];
  const prev = prevSum5 / 5 - prevSum34 / 34;

  return { prev, curr };
}
