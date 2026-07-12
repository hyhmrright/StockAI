import { describe, test, expect } from 'bun:test';
import { deriveLevels } from './levels';
import type { SubSignal } from './types';
import type { PriceLevel, ValuationSnapshot } from '../../shared/types';

/** 合成 mean_reversion 子信号（携带 BOLL 上下轨） */
function meanReversion(bbLower: number, bbUpper: number): SubSignal {
  return {
    name: 'mean_reversion',
    signal: 'neutral',
    score: 0,
    weight: 0.2,
    details: { bb_lower: bbLower, bb_middle: (bbLower + bbUpper) / 2, bb_upper: bbUpper },
  };
}

/** 合成 volatility 子信号（携带 ATR） */
function volatility(atr: number): SubSignal {
  return {
    name: 'volatility',
    signal: 'neutral',
    score: 0,
    weight: 0.15,
    details: { atr },
  };
}

/** 合成估值快照，仅安全边际参与推导 */
function valuation(marginOfSafety: number | null): ValuationSnapshot {
  return {
    intrinsicValue: 1000,
    marketCap: 800,
    marginOfSafety,
    signal: 'fair',
    confidence: 50,
    models: {},
  };
}

/** 按 type 索引，便于断言 */
function byType(levels: PriceLevel[]): Record<string, PriceLevel> {
  return Object.fromEntries(levels.map((l) => [l.type, l]));
}

describe('deriveLevels', () => {
  test('齐全输入产出恰好 4 条，type/price/source 正确', () => {
    const levels = deriveLevels([meanReversion(90, 110), volatility(3)], valuation(0.25), 100);
    expect(levels).toHaveLength(4);
    expect(levels.length).toBeLessThanOrEqual(4);

    const m = byType(levels);
    expect(m.support).toEqual({ price: 90, type: 'support', source: 'boll_lower' });
    expect(m.resistance).toEqual({ price: 110, type: 'resistance', source: 'boll_upper' });
    expect(m.target.type).toBe('target');
    expect(m.target.source).toBe('valuation');
    expect(m.target.price).toBeCloseTo(125); // 100 × (1 + 0.25)
    expect(m.stopLoss.type).toBe('stopLoss');
    expect(m.stopLoss.source).toBe('atr');
    expect(m.stopLoss.price).toBeCloseTo(94); // 100 − 2 × 3
  });

  test('valuation 为 null 时降级为 support/resistance/stopLoss 三条（无 target）', () => {
    const levels = deriveLevels([meanReversion(90, 110), volatility(3)], null, 100);
    expect(levels).toHaveLength(3);
    expect(levels.find((l) => l.type === 'target')).toBeUndefined();
  });

  test('marginOfSafety 为 null 时同样跳过 target', () => {
    const levels = deriveLevels([meanReversion(90, 110), volatility(3)], valuation(null), 100);
    expect(levels.find((l) => l.type === 'target')).toBeUndefined();
    expect(levels).toHaveLength(3);
  });

  test('ATR=0 跳过止损', () => {
    const levels = deriveLevels([meanReversion(90, 110), volatility(0)], null, 100);
    expect(levels.find((l) => l.type === 'stopLoss')).toBeUndefined();
    expect(levels).toHaveLength(2);
  });

  test('ATR=NaN 跳过止损', () => {
    const levels = deriveLevels([meanReversion(90, 110), volatility(Number.NaN)], null, 100);
    expect(levels.find((l) => l.type === 'stopLoss')).toBeUndefined();
  });

  test('止损跌破 0（ATR 过大）时跳过', () => {
    const levels = deriveLevels([meanReversion(90, 110), volatility(60)], null, 100);
    // 100 − 2×60 = −20，非法，跳过
    expect(levels.find((l) => l.type === 'stopLoss')).toBeUndefined();
  });

  test('BOLL 轨为非有限值时对应线跳过', () => {
    const levels = deriveLevels(
      [meanReversion(Number.NaN, Number.POSITIVE_INFINITY), volatility(3)],
      null,
      100,
    );
    expect(levels.find((l) => l.type === 'support')).toBeUndefined();
    expect(levels.find((l) => l.type === 'resistance')).toBeUndefined();
    expect(levels.find((l) => l.type === 'stopLoss')).toBeDefined();
  });

  test('marginOfSafety 非有限时跳过 target', () => {
    const levels = deriveLevels([], valuation(Number.POSITIVE_INFINITY), 100);
    expect(levels).toHaveLength(0);
  });

  test('空子信号 + 无估值 → 空数组', () => {
    expect(deriveLevels([], null, 100)).toEqual([]);
  });

  test('lastClose 非法（NaN / ≤0）→ 空数组', () => {
    const subs = [meanReversion(90, 110), volatility(3)];
    expect(deriveLevels(subs, valuation(0.25), Number.NaN)).toEqual([]);
    expect(deriveLevels(subs, valuation(0.25), 0)).toEqual([]);
    expect(deriveLevels(subs, valuation(0.25), -5)).toEqual([]);
  });
});
