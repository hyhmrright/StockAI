/**
 * 简单移动平均（SMA）
 * 不足周期的位置返回 null（便于图表跳过绘制）
 */
export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    sum += values[i] - values[i - period];
    out[i] = sum / period;
  }
  return out;
}

/**
 * 指数移动平均（EMA）
 * 起步用 SMA(N) 作为种子，之后用 EMA[t] = EMA[t-1] * (1-α) + price[t] * α，α = 2 / (N+1)
 */
export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;

  const alpha = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = prev * (1 - alpha) + values[i] * alpha;
    out[i] = prev;
  }
  return out;
}
