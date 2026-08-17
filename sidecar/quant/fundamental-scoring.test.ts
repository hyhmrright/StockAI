import { describe, test, expect } from 'bun:test';
import { scoreFundamentals } from './fundamental-scoring';
import type { FinancialMetrics } from './types';

describe('scoreFundamentals', () => {
  test('优质公司各维度 bullish', () => {
    const metrics: FinancialMetrics = {
      roe: 20,
      grossMargin: 40,
      netMargin: 15,
      debtToAsset: 35,
      currentRatio: 2.0,
      revenueGrowth: 15,
      netIncomeGrowth: 18,
      pe: 18,
      pb: 2.5,
    };
    const result = scoreFundamentals(metrics);
    expect(result.composite.signal).toBe('bullish');
  });

  test('高负债低增长公司 bearish', () => {
    const metrics: FinancialMetrics = {
      roe: 5,
      grossMargin: 15,
      netMargin: 3,
      debtToAsset: 80,
      currentRatio: 0.8,
      revenueGrowth: -5,
      netIncomeGrowth: -10,
      pe: 50,
      pb: 8,
    };
    const result = scoreFundamentals(metrics);
    expect(result.composite.signal).toBe('bearish');
  });

  test('返回 4 个维度子信号', () => {
    const metrics: FinancialMetrics = { roe: 12, pe: 20 };
    const result = scoreFundamentals(metrics);
    expect(result.dimensions).toHaveLength(4);
    expect(result.dimensions.map((d) => d.name)).toEqual([
      'profitability',
      'growth',
      'financial_health',
      'valuation',
    ]);
  });

  test('指标全部缺失时返回 neutral', () => {
    const result = scoreFundamentals({});
    expect(result.composite.signal).toBe('neutral');
    expect(result.composite.confidence).toBeLessThan(30);
  });
});

describe('scoreFundamentals 可下钻 checks', () => {
  test('逐项检查的 pass/fail 与阈值方向一致', () => {
    const checks =
      scoreFundamentals({ roe: 18, netMargin: 3, debtToAsset: 50, pe: 12 }).composite.checks ?? [];
    expect(checks.find((c) => c.key === 'roe')).toMatchObject({
      actual: 18,
      threshold: 15,
      comparator: 'gte',
      passed: true,
    });
    // netMargin 3 < 5 → 未通过
    expect(checks.find((c) => c.key === 'net_margin')).toMatchObject({
      comparator: 'gte',
      passed: false,
    });
    // debt 50 < 60 → 通过（越低越好）
    expect(checks.find((c) => c.key === 'debt_to_asset')).toMatchObject({
      threshold: 60,
      comparator: 'lte',
      passed: true,
    });
    // pe 12 < 25 → 通过（越低越好）
    expect(checks.find((c) => c.key === 'pe')).toMatchObject({
      threshold: 25,
      comparator: 'lte',
      passed: true,
    });
  });

  test('缺失指标不产生 check', () => {
    const checks = scoreFundamentals({ roe: 20 }).composite.checks ?? [];
    expect(checks.map((c) => c.key)).toEqual(['roe']);
  });
});
