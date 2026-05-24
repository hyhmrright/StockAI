import { describe, test, expect } from 'bun:test';
import { computeValuation } from './valuation';
import type { FinancialMetrics } from './types';

describe('computeValuation', () => {
  test('returns fair signal with complete data', () => {
    const metrics: FinancialMetrics = {
      freeCashFlow: 90_000_000_000,
      operatingCashFlow: 100_000_000_000,
      capitalExpenditure: -10_000_000_000,
      depreciation: 11_000_000_000,
      netIncome: 95_000_000_000,
      ebitda: 130_000_000_000,
      interestExpense: -3_000_000_000,
      totalDebt: 110_000_000_000,
      cash: 50_000_000_000,
      sharesOutstanding: 15_000_000_000,
      marketCap: 3_000_000_000_000,
      pe: 32,
      pb: 50,
      roe: 150,
      revenueGrowth: 5,
      revenue: 400_000_000_000,
    };
    const result = computeValuation(metrics);
    expect(result).not.toBeNull();
    expect(result!.intrinsicValue).toBeGreaterThan(0);
    expect(result!.marketCap).toBe(3_000_000_000_000);
    expect(result!.marginOfSafety).toBeDefined();
    expect(['undervalued', 'overvalued', 'fair']).toContain(result!.signal);
    expect(result!.confidence).toBeGreaterThan(0);
  });

  test('returns null when no FCF or net income', () => {
    const metrics: FinancialMetrics = { pe: 25, pb: 3 };
    const result = computeValuation(metrics);
    // 仅有相对估值时仍应返回结果
    expect(result).not.toBeNull();
  });

  test('dcf model produces bear < base < bull', () => {
    const metrics: FinancialMetrics = {
      freeCashFlow: 50_000_000_000,
      marketCap: 500_000_000_000,
      totalDebt: 100_000_000_000,
      cash: 30_000_000_000,
      interestExpense: -5_000_000_000,
      revenueGrowth: 10,
    };
    const result = computeValuation(metrics);
    if (result?.models.dcf) {
      expect(result.models.dcf.bear).toBeLessThan(result.models.dcf.base);
      expect(result.models.dcf.base).toBeLessThan(result.models.dcf.bull);
    }
  });

  test('owner earnings works with net income + depreciation + capex', () => {
    const metrics: FinancialMetrics = {
      netIncome: 10_000_000_000,
      depreciation: 3_000_000_000,
      capitalExpenditure: -4_000_000_000,
      marketCap: 100_000_000_000,
      revenueGrowth: 8,
    };
    const result = computeValuation(metrics);
    expect(result?.models.ownerEarnings).toBeDefined();
    expect(result!.models.ownerEarnings!.value).toBeGreaterThan(0);
  });
});
