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

/**
 * MACD
 * DIF = EMA(close, short) - EMA(close, long)
 * DEA = EMA(DIF, signal)
 * HIST = (DIF - DEA) * 2
 */
export function macd(
  closes: number[],
  short = 12,
  long = 26,
  signal = 9,
): { dif: (number | null)[]; dea: (number | null)[]; hist: (number | null)[] } {
  const emaShort = ema(closes, short);
  const emaLong = ema(closes, long);
  const dif: (number | null)[] = closes.map((_, i) => {
    const a = emaShort[i],
      b = emaLong[i];
    return a == null || b == null ? null : a - b;
  });

  // DEA = EMA(DIF, signal)，只在 DIF 有值后开始
  const dea: (number | null)[] = new Array(closes.length).fill(null);
  const alpha = 2 / (signal + 1);
  let seedSum = 0,
    seedCount = 0,
    prev: number | null = null;
  for (let i = 0; i < closes.length; i++) {
    const v = dif[i];
    if (v == null) continue;
    if (prev == null) {
      seedSum += v;
      seedCount++;
      if (seedCount >= signal) {
        prev = seedSum / signal;
        dea[i] = prev;
      }
    } else {
      prev = prev * (1 - alpha) + v * alpha;
      dea[i] = prev;
    }
  }

  const hist: (number | null)[] = closes.map((_, i) => {
    const a = dif[i],
      b = dea[i];
    return a == null || b == null ? null : (a - b) * 2;
  });

  return { dif, dea, hist };
}

/**
 * RSI（Wilder 平滑）
 * RSI = 100 - 100 / (1 + RS)，RS = 平均涨幅 / 平均跌幅
 */
export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  let gainSum = 0,
    lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gainSum += d;
    else lossSum -= d;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d >= 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/**
 * KDJ（标准 9,3,3）
 * RSV = (C - LowN) / (HighN - LowN) * 100
 * K = 前K * (kPeriod-1)/kPeriod + RSV / kPeriod
 * D = 前D * (dPeriod-1)/dPeriod + K  / dPeriod
 * J = 3*K - 2*D
 */
export function kdj(
  highs: number[],
  lows: number[],
  closes: number[],
  nPeriod = 9,
  kPeriod = 3,
  dPeriod = 3,
): { k: (number | null)[]; d: (number | null)[]; j: (number | null)[] } {
  const n = closes.length;
  const k: (number | null)[] = new Array(n).fill(null);
  const d: (number | null)[] = new Array(n).fill(null);
  const j: (number | null)[] = new Array(n).fill(null);
  let prevK = 50,
    prevD = 50;

  for (let i = nPeriod - 1; i < n; i++) {
    let hh = -Infinity,
      ll = Infinity;
    for (let p = i - nPeriod + 1; p <= i; p++) {
      if (highs[p] > hh) hh = highs[p];
      if (lows[p] < ll) ll = lows[p];
    }
    const rsv = hh === ll ? 0 : ((closes[i] - ll) / (hh - ll)) * 100;
    const kVal = (prevK * (kPeriod - 1) + rsv) / kPeriod;
    const dVal = (prevD * (dPeriod - 1) + kVal) / dPeriod;
    const jVal = 3 * kVal - 2 * dVal;
    k[i] = kVal;
    d[i] = dVal;
    j[i] = jVal;
    prevK = kVal;
    prevD = dVal;
  }
  return { k, d, j };
}

/**
 * 布林带 BOLL（中轨 SMA + 标准差倍数上下轨）
 */
export function boll(
  closes: number[],
  period = 20,
  k = 2,
): { mid: (number | null)[]; upper: (number | null)[]; lower: (number | null)[] } {
  const mid = sma(closes, period);
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);

  for (let i = period - 1; i < closes.length; i++) {
    const m = mid[i] as number;
    let sq = 0;
    for (let p = i - period + 1; p <= i; p++) sq += (closes[p] - m) ** 2;
    const std = Math.sqrt(sq / period);
    upper[i] = m + k * std;
    lower[i] = m - k * std;
  }
  return { mid, upper, lower };
}

/**
 * OBV（能量潮）
 * 上涨日 += vol，下跌日 -= vol，平盘 += 0；首日 = vol[0]
 */
export function obv(closes: number[], volumes: number[]): number[] {
  const out: number[] = new Array(closes.length).fill(0);
  if (closes.length === 0) return out;
  out[0] = volumes[0];
  for (let i = 1; i < closes.length; i++) {
    const sign = closes[i] > closes[i - 1] ? 1 : closes[i] < closes[i - 1] ? -1 : 0;
    out[i] = out[i - 1] + sign * volumes[i];
  }
  return out;
}

/**
 * VWAP（成交量加权均价，累计型）
 * 典型价 = (H+L+C)/3；VWAP = Σ(typ × vol) / Σvol
 */
export function vwap(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
): number[] {
  const out: number[] = new Array(closes.length).fill(0);
  let pvSum = 0,
    vSum = 0;
  for (let i = 0; i < closes.length; i++) {
    const typ = (highs[i] + lows[i] + closes[i]) / 3;
    pvSum += typ * volumes[i];
    vSum += volumes[i];
    out[i] = vSum === 0 ? typ : pvSum / vSum;
  }
  return out;
}
