import { describe, test, expect } from 'bun:test';
import { runBacktest } from './engine';
import type { KlinePoint } from '../../shared/types';

function generateTrendingKline(days: number, startPrice: number, endPrice: number): KlinePoint[] {
  const points: KlinePoint[] = [];
  const dailyReturn = (endPrice / startPrice) ** (1 / days) - 1;
  let price = startPrice;
  for (let i = 0; i < days; i++) {
    const noise = price * 0.005 * (Math.random() * 2 - 1);
    const close = price * (1 + dailyReturn) + noise;
    points.push({
      time: 1700000000 + i * 86400,
      open: price,
      high: Math.max(price, close) * 1.005,
      low: Math.min(price, close) * 0.995,
      close,
      volume: 1000000,
    });
    price = close;
  }
  return points;
}

describe('runBacktest', () => {
  test('returns result with equity curve', () => {
    const kline = generateTrendingKline(200, 100, 130);
    const result = runBacktest(kline, {
      symbol: 'TEST',
      period: 200,
      buyThreshold: 55,
      sellThreshold: 45,
      initialCapital: 100000,
      transactionCost: 0.001,
    });
    expect(result.symbol).toBe('TEST');
    expect(result.equityCurve.length).toBeGreaterThan(0);
    expect(result.totalReturn).toBeDefined();
    expect(result.buyAndHoldReturn).toBeGreaterThan(0);
    expect(typeof result.maxDrawdown).toBe('number');
    expect(typeof result.sharpeRatio).toBe('number');
  });

  test('returns zero trades with extreme thresholds', () => {
    const kline = generateTrendingKline(100, 100, 110);
    const result = runBacktest(kline, {
      symbol: 'TEST',
      period: 100,
      buyThreshold: 99,
      sellThreshold: 1,
      initialCapital: 100000,
      transactionCost: 0.001,
    });
    expect(result.totalTrades).toBe(0);
    expect(result.totalReturn).toBe(0);
  });

  test('rejects insufficient data', () => {
    const kline = generateTrendingKline(20, 100, 105);
    const result = runBacktest(kline, {
      symbol: 'TEST',
      period: 20,
      buyThreshold: 60,
      sellThreshold: 40,
      initialCapital: 100000,
      transactionCost: 0.001,
    });
    expect(result.totalTrades).toBe(0);
    expect(result.equityCurve.length).toBeGreaterThan(0);
  });
});
