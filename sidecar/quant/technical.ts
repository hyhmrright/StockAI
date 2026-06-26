import type { KlinePoint } from '../../shared/types';
import type { Signal, SubSignal, TechnicalResult } from './types';
import { TRADING_DAYS_PER_YEAR } from '../../shared/constants';

const MIN_DATA_POINTS = 60;

/** 将分数钳制到 [-100, 100] 区间 */
function clampScore(score: number): number {
  return Math.max(-100, Math.min(100, score));
}

/** 根据分数和阈值判定信号方向 */
function classifySignal(score: number, threshold: number): Signal {
  if (score > threshold) return 'bullish';
  if (score < -threshold) return 'bearish';
  return 'neutral';
}

/**
 * 各技术子信号判定方向的 |score| 阈值，集中管理。
 * 异质值（动量类 20、波动 10、量能 15）反映各维信号的信心度差异，为有意设计。
 */
const SIGNAL_THRESHOLD = {
  trend: 20,
  meanReversion: 20,
  momentum: 20,
  volatility: 10,
  volume: 15,
  composite: 15,
} as const;

export function computeEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

export function computeRSI(closes: number[], period: number): number[] {
  const result: number[] = new Array(closes.length).fill(50);
  if (closes.length < period + 1) return result;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;

  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

export function computeMACD(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
  const emaFast = computeEMA(closes, fast);
  const emaSlow = computeEMA(closes, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = computeEMA(macdLine, signalPeriod);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macdLine, signalLine, histogram };
}

export function computeBollingerBands(
  closes: number[],
  period = 20,
  stdDevMultiplier = 2,
): { upper: number; middle: number; lower: number }[] {
  return closes.map((_, i) => {
    if (i < period - 1) return { upper: closes[i], middle: closes[i], lower: closes[i] };
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((s, v) => s + v, 0) / period;
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    return {
      upper: mean + stdDevMultiplier * std,
      middle: mean,
      lower: mean - stdDevMultiplier * std,
    };
  });
}

export function computeADX(kline: KlinePoint[], period = 14): number[] {
  const len = kline.length;
  if (len < period * 2) return new Array(len).fill(0);

  const trueRanges: number[] = [0];
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];

  for (let i = 1; i < len; i++) {
    const high = kline[i].high;
    const low = kline[i].low;
    const prevClose = kline[i - 1].close;
    const prevHigh = kline[i - 1].high;
    const prevLow = kline[i - 1].low;

    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));

    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  const smoothTR = computeEMA(trueRanges, period);
  const smoothPlusDM = computeEMA(plusDM, period);
  const smoothMinusDM = computeEMA(minusDM, period);

  const dx: number[] = smoothTR.map((tr, i) => {
    if (tr === 0) return 0;
    const plusDI = (smoothPlusDM[i] / tr) * 100;
    const minusDI = (smoothMinusDM[i] / tr) * 100;
    const sum = plusDI + minusDI;
    return sum === 0 ? 0 : (Math.abs(plusDI - minusDI) / sum) * 100;
  });

  return computeEMA(dx, period);
}

export function computeATR(kline: KlinePoint[], period = 14): number[] {
  const trueRanges: number[] = [kline[0].high - kline[0].low];
  for (let i = 1; i < kline.length; i++) {
    const h = kline[i].high;
    const l = kline[i].low;
    const pc = kline[i - 1].close;
    trueRanges.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return computeEMA(trueRanges, period);
}

function trendFollowing(closes: number[], kline: KlinePoint[]): SubSignal {
  const ema8 = computeEMA(closes, 8);
  const ema21 = computeEMA(closes, 21);
  const ema55 = computeEMA(closes, 55);
  const adx = computeADX(kline, 14);
  const last = closes.length - 1;

  const bullishAlign = ema8[last] > ema21[last] && ema21[last] > ema55[last];
  const bearishAlign = ema8[last] < ema21[last] && ema21[last] < ema55[last];
  const adxStrong = adx[last] > 25;

  let score = 0;
  if (bullishAlign) score += 50;
  else if (bearishAlign) score -= 50;
  if (adxStrong) score = score > 0 ? score + 30 : score - 30;

  return {
    name: 'trend_following',
    signal: classifySignal(score, SIGNAL_THRESHOLD.trend),
    score: clampScore(score),
    weight: 0.25,
    details: {
      ema8: Number(ema8[last].toFixed(2)),
      ema21: Number(ema21[last].toFixed(2)),
      ema55: Number(ema55[last].toFixed(2)),
      adx: Number(adx[last].toFixed(1)),
      alignment: bullishAlign ? 'bullish' : bearishAlign ? 'bearish' : 'mixed',
    },
  };
}

function meanReversion(closes: number[]): SubSignal {
  const rsi = computeRSI(closes, 14);
  const bb = computeBollingerBands(closes, 20, 2);
  const last = closes.length - 1;
  const rsiVal = rsi[last];
  const bbLast = bb[last];
  const price = closes[last];

  let score = 0;
  if (rsiVal < 30) score += 40;
  else if (rsiVal > 70) score -= 40;

  if (price <= bbLast.lower) score += 40;
  else if (price >= bbLast.upper) score -= 40;

  return {
    name: 'mean_reversion',
    signal: classifySignal(score, SIGNAL_THRESHOLD.meanReversion),
    score: clampScore(score),
    weight: 0.2,
    details: {
      rsi: Number(rsiVal.toFixed(1)),
      bb_position:
        price <= bbLast.lower ? 'below_lower' : price >= bbLast.upper ? 'above_upper' : 'within',
      bb_upper: Number(bbLast.upper.toFixed(2)),
      bb_middle: Number(bbLast.middle.toFixed(2)),
      bb_lower: Number(bbLast.lower.toFixed(2)),
    },
  };
}

function momentum(closes: number[]): SubSignal {
  const macd = computeMACD(closes);
  const last = closes.length - 1;
  const hist = macd.histogram[last];
  const prevHist = last > 0 ? macd.histogram[last - 1] : 0;

  const mom1m = last >= 21 ? (closes[last] / closes[last - 21] - 1) * 100 : 0;
  const mom3m = last >= 63 ? (closes[last] / closes[last - 63] - 1) * 100 : 0;

  let score = 0;
  if (hist > 0 && hist > prevHist) score += 30;
  else if (hist < 0 && hist < prevHist) score -= 30;

  if (mom1m > 5) score += 25;
  else if (mom1m < -5) score -= 25;
  if (mom3m > 10) score += 25;
  else if (mom3m < -10) score -= 25;

  return {
    name: 'momentum',
    signal: classifySignal(score, SIGNAL_THRESHOLD.momentum),
    score: clampScore(score),
    weight: 0.25,
    details: {
      macd_histogram: Number(hist.toFixed(3)),
      macd_trend: hist > prevHist ? 'expanding' : 'contracting',
      momentum_1m: Number(mom1m.toFixed(2)),
      momentum_3m: Number(mom3m.toFixed(2)),
    },
  };
}

function volatilityAnalysis(kline: KlinePoint[]): SubSignal {
  const closes = kline.map((k) => k.close);
  const atr = computeATR(kline, 14);
  const last = closes.length - 1;
  const atrVal = atr[last];
  const atrPct = (atrVal / closes[last]) * 100;

  const returns: number[] = [];
  for (let i = Math.max(1, last - 19); i <= last; i++) {
    returns.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length;
  const hvol = Math.sqrt(variance * TRADING_DAYS_PER_YEAR) * 100;

  let score = 0;
  if (hvol < 20) score += 30;
  else if (hvol < 35) score += 10;
  else if (hvol > 50) score -= 30;

  return {
    name: 'volatility',
    signal: classifySignal(score, SIGNAL_THRESHOLD.volatility),
    score: clampScore(score),
    weight: 0.15,
    details: {
      atr: Number(atrVal.toFixed(2)),
      atr_pct: Number(atrPct.toFixed(2)),
      hist_vol_annualized: Number(hvol.toFixed(1)),
      regime: hvol < 20 ? 'low' : hvol < 35 ? 'medium' : 'high',
    },
  };
}

function volumeAnalysis(kline: KlinePoint[]): SubSignal {
  const last = kline.length - 1;
  if (last < 21) {
    return { name: 'volume', signal: 'neutral', score: 0, weight: 0.15, details: {} };
  }

  const volumes = kline.map((k) => k.volume);
  const closes = kline.map((k) => k.close);
  const volEma20 = computeEMA(volumes, 20);
  const recentVol = volumes[last];
  const avgVol = volEma20[last];
  const volRatio = avgVol > 0 ? recentVol / avgVol : 1;

  const priceUp = closes[last] > closes[last - 1];
  const priceDown = closes[last] < closes[last - 1];

  let score = 0;
  if (volRatio > 1.5 && priceUp) score += 50;
  else if (volRatio > 1.5 && priceDown) score -= 50;
  else if (volRatio > 1.2 && priceUp) score += 25;
  else if (volRatio > 1.2 && priceDown) score -= 25;

  return {
    name: 'volume',
    signal: classifySignal(score, SIGNAL_THRESHOLD.volume),
    score: clampScore(score),
    weight: 0.15,
    details: {
      current_volume: recentVol,
      avg_volume_20d: Number(avgVol.toFixed(0)),
      volume_ratio: Number(volRatio.toFixed(2)),
      price_direction: priceUp ? 'up' : priceDown ? 'down' : 'flat',
    },
  };
}

export function analyzeTechnical(kline: KlinePoint[]): TechnicalResult {
  if (kline.length < MIN_DATA_POINTS) {
    return {
      subSignals: [],
      composite: { signal: 'neutral', confidence: 10, details: { reason: 'insufficient_data' } },
    };
  }

  const closes = kline.map((k) => k.close);
  const subSignals = [
    trendFollowing(closes, kline),
    meanReversion(closes),
    momentum(closes),
    volatilityAnalysis(kline),
    volumeAnalysis(kline),
  ];

  const weightedScore = subSignals.reduce((sum, s) => sum + s.score * s.weight, 0);
  const normalizedScore = clampScore(weightedScore);
  const confidence = Math.min(100, Math.abs(normalizedScore) + 20);

  return {
    subSignals,
    composite: {
      signal: classifySignal(normalizedScore, SIGNAL_THRESHOLD.composite),
      confidence: Math.round(confidence),
      details: {
        ...subSignals.reduce<Record<string, number | string>>(
          (acc, s) => Object.assign(acc, s.details),
          {},
        ),
        ...Object.fromEntries(subSignals.map((s) => [s.name, `${s.signal} (${s.score})`])),
      },
    },
  };
}
