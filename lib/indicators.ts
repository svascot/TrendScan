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
