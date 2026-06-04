import { describe, test, expect } from 'bun:test';
import { computeRiskMetrics } from './volatility';
import type { KlinePoint } from '../../shared/types';

// 确定性伪随机（固定种子 LCG）替代 Math.random，避免 erratic test：同输入恒产出同序列、可复现
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function generateKline(days: number, basePrice = 100, volatility = 0.02): KlinePoint[] {
  const points: KlinePoint[] = [];
  const rng = makeRng(12345);
  let price = basePrice;
  for (let i = 0; i < days; i++) {
    const change = price * volatility * (rng() * 2 - 1);
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) * (1 + rng() * 0.01);
    const low = Math.min(open, close) * (1 - rng() * 0.01);
    points.push({ time: 1700000000 + i * 86400, open, high, low, close, volume: 1000000 });
    price = close;
  }
  return points;
}

describe('computeRiskMetrics', () => {
  test('returns null for insufficient data (<30 days)', () => {
    expect(computeRiskMetrics(generateKline(20))).toBeNull();
  });

  test('computes valid metrics for 252 days', () => {
    const kline = generateKline(252);
    const result = computeRiskMetrics(kline);
    expect(result).not.toBeNull();
    expect(result!.annualizedVolatility).toBeGreaterThan(0);
    expect(result!.annualizedVolatility).toBeLessThan(2);
    expect(result!.maxDrawdown).toBeLessThanOrEqual(0);
    expect(result!.volatilityPercentile).toBeGreaterThanOrEqual(0);
    expect(result!.volatilityPercentile).toBeLessThanOrEqual(100);
    expect(['low', 'medium', 'high']).toContain(result!.riskLevel);
  });

  test('high volatility data gives high risk level', () => {
    const kline = generateKline(100, 100, 0.08);
    const result = computeRiskMetrics(kline);
    expect(result).not.toBeNull();
    expect(result!.annualizedVolatility).toBeGreaterThan(0.3);
  });

  test('sharpeProxy is calculated', () => {
    const kline = generateKline(252, 100, 0.01);
    const result = computeRiskMetrics(kline);
    expect(result).not.toBeNull();
    expect(typeof result!.sharpeProxy).toBe('number');
  });
});
