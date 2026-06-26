import { describe, test, expect } from 'bun:test';
import {
  computeEMA,
  computeRSI,
  computeMACD,
  computeBollingerBands,
  computeADX,
  computeATR,
  analyzeTechnical,
} from './technical';
import type { KlinePoint } from '../../shared/types';

function makeKline(closes: number[], baseVolume = 1_000_000): KlinePoint[] {
  return closes.map((close, i) => ({
    time: 1700000000 + i * 86400,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume: baseVolume + (i % 3) * 100_000,
  }));
}

describe('computeEMA', () => {
  test('计算 EMA 返回正确长度', () => {
    const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const ema = computeEMA(closes, 5);
    expect(ema.length).toBe(closes.length);
  });

  test('period=1 时 EMA 等于原始值', () => {
    const closes = [10, 20, 30];
    const ema = computeEMA(closes, 1);
    expect(ema).toEqual(closes);
  });

  test('EMA 对最新数据权重更高', () => {
    const closes = [10, 10, 10, 10, 10, 20, 20, 20, 20, 20];
    const ema = computeEMA(closes, 5);
    expect(ema[ema.length - 1]).toBeGreaterThan(18);
    expect(ema[ema.length - 1]).toBeLessThan(20);
  });
});

describe('computeRSI', () => {
  test('单调上涨序列 RSI 接近 100', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const rsi = computeRSI(closes, 14);
    expect(rsi[rsi.length - 1]).toBeGreaterThan(90);
  });

  test('单调下跌序列 RSI 接近 0', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 - i);
    const rsi = computeRSI(closes, 14);
    expect(rsi[rsi.length - 1]).toBeLessThan(10);
  });

  test('横盘序列 RSI 接近 50', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + (i % 2 === 0 ? 1 : -1));
    const rsi = computeRSI(closes, 14);
    expect(rsi[rsi.length - 1]).toBeGreaterThan(40);
    expect(rsi[rsi.length - 1]).toBeLessThan(60);
  });
});

describe('computeMACD', () => {
  test('上升趋势 MACD 柱状线为正', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5);
    const macd = computeMACD(closes);
    expect(macd.histogram[macd.histogram.length - 1]).toBeGreaterThan(0);
  });

  test('返回 macdLine, signalLine, histogram 三组数据', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const macd = computeMACD(closes);
    expect(macd.macdLine.length).toBe(closes.length);
    expect(macd.signalLine.length).toBe(closes.length);
    expect(macd.histogram.length).toBe(closes.length);
  });
});

describe('computeBollingerBands', () => {
  test('中轨等于 SMA', () => {
    const closes = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30];
    const bb = computeBollingerBands(closes, 5, 2);
    const last = bb[bb.length - 1];
    expect(last.middle).toBeCloseTo((22 + 24 + 26 + 28 + 30) / 5, 1);
  });

  test('上轨 > 中轨 > 下轨', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5);
    const bb = computeBollingerBands(closes, 20, 2);
    const last = bb[bb.length - 1];
    expect(last.upper).toBeGreaterThan(last.middle);
    expect(last.middle).toBeGreaterThan(last.lower);
  });
});

describe('computeADX', () => {
  test('强趋势序列 ADX > 25', () => {
    const kline: KlinePoint[] = Array.from({ length: 50 }, (_, i) => ({
      time: 1700000000 + i * 86400,
      open: 100 + i * 2,
      high: 102 + i * 2,
      low: 99 + i * 2,
      close: 101 + i * 2,
      volume: 1_000_000,
    }));
    const adx = computeADX(kline, 14);
    expect(adx[adx.length - 1]).toBeGreaterThan(25);
  });
});

describe('computeATR', () => {
  test('ATR 始终为非负数', () => {
    const kline = makeKline(Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5));
    const atr = computeATR(kline, 14);
    atr.forEach((v) => expect(v).toBeGreaterThanOrEqual(0));
  });
});

describe('analyzeTechnical', () => {
  test('返回 5 个子信号和一个综合信号', () => {
    const kline = makeKline(
      Array.from({ length: 250 }, (_, i) => 100 + i * 0.1 + Math.sin(i / 10) * 5),
    );
    const result = analyzeTechnical(kline);
    expect(result.subSignals).toHaveLength(5);
    expect(['bullish', 'bearish', 'neutral']).toContain(result.composite.signal);
    expect(result.composite.confidence).toBeGreaterThanOrEqual(0);
    expect(result.composite.confidence).toBeLessThanOrEqual(100);
  });

  test('数据不足时返回 neutral 信号', () => {
    const kline = makeKline([100, 101, 102]);
    const result = analyzeTechnical(kline);
    expect(result.composite.signal).toBe('neutral');
    expect(result.composite.confidence).toBeLessThan(30);
  });

  test('强势上涨序列返回 bullish', () => {
    const closes = Array.from({ length: 250 }, (_, i) => 50 + i * 0.5);
    const kline = makeKline(closes, 2_000_000);
    const result = analyzeTechnical(kline);
    expect(result.composite.signal).toBe('bullish');
  });

  test('强势下跌序列返回 bearish', () => {
    const closes = Array.from({ length: 250 }, (_, i) => 200 - i * 0.5);
    const kline = makeKline(closes, 2_000_000);
    const result = analyzeTechnical(kline);
    expect(result.composite.signal).toBe('bearish');
  });
});
