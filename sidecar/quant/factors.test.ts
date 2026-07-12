import { describe, expect, test } from 'bun:test';
import type { FinancialHistory, FinancialSnapshot } from '../../shared/types';
import { computeFactors, FACTOR_HISTORY_PERIODS, VALUE_FACTOR_CONSUMER_IDS } from './factors';

// 手搓快照：只关心 reportDate/reportType 必填，其余按需注入
function snap(
  p: Partial<FinancialSnapshot> & { reportDate: string; reportType: string },
): FinancialSnapshot {
  return p as FinancialSnapshot;
}

function hist(snapshots: FinancialSnapshot[]): FinancialHistory {
  return { symbol: '600519', market: 'A股', snapshots, fetchedAt: Date.now() };
}

// 茅台式：6 期年报（latest-first），ROE 常年 >15%，毛利率/净利率抬升，负债率下降，
// 营收/净利稳定正增，OCFPS>0；末尾混入一条季报噪声（Q1 的 ROE 天然低），应被年报过滤剔除
const MOATY: FinancialSnapshot[] = [
  snap({
    reportDate: '2024-12-31',
    reportType: '年报',
    roe: 30,
    grossMargin: 91.5,
    netMargin: 52,
    debtToAsset: 18,
    revenueGrowth: 15,
    netIncomeGrowth: 16,
    operatingCashFlowPerShare: 50,
    eps: 60,
  }),
  snap({
    reportDate: '2023-12-31',
    reportType: '年报',
    roe: 28,
    grossMargin: 91.0,
    netMargin: 51,
    debtToAsset: 20,
    revenueGrowth: 14,
    netIncomeGrowth: 15,
    operatingCashFlowPerShare: 45,
    eps: 55,
  }),
  snap({
    reportDate: '2022-12-31',
    reportType: '年报',
    roe: 26,
    grossMargin: 90.5,
    netMargin: 50,
    debtToAsset: 22,
    revenueGrowth: 13,
    netIncomeGrowth: 14,
    operatingCashFlowPerShare: 40,
    eps: 50,
  }),
  snap({
    reportDate: '2021-12-31',
    reportType: '年报',
    roe: 24,
    grossMargin: 90.0,
    netMargin: 49,
    debtToAsset: 24,
    revenueGrowth: 12,
    netIncomeGrowth: 13,
    operatingCashFlowPerShare: 35,
    eps: 45,
  }),
  snap({
    reportDate: '2020-12-31',
    reportType: '年报',
    roe: 22,
    grossMargin: 89.5,
    netMargin: 48,
    debtToAsset: 26,
    revenueGrowth: 11,
    netIncomeGrowth: 12,
    operatingCashFlowPerShare: 30,
    eps: 40,
  }),
  snap({
    reportDate: '2019-12-31',
    reportType: '年报',
    roe: 20,
    grossMargin: 89.0,
    netMargin: 47,
    debtToAsset: 28,
    revenueGrowth: 10,
    netIncomeGrowth: 11,
    operatingCashFlowPerShare: 25,
    eps: 35,
  }),
  snap({
    reportDate: '2025-03-31',
    reportType: '一季报',
    roe: 6,
    grossMargin: 80,
    netMargin: 30,
    debtToAsset: 40,
    revenueGrowth: 5,
    netIncomeGrowth: 5,
    operatingCashFlowPerShare: 5,
    eps: 8,
  }),
];

// 亏损周期股：4 期年报，ROE 从不达标，负债率上升，营收含负增长，最新 OCFPS<0
const CYCLICAL: FinancialSnapshot[] = [
  snap({
    reportDate: '2024-12-31',
    reportType: '年报',
    roe: 3,
    grossMargin: 15,
    netMargin: 2,
    debtToAsset: 68,
    revenueGrowth: -20,
    netIncomeGrowth: -50,
    operatingCashFlowPerShare: -2,
    eps: -1,
  }),
  snap({
    reportDate: '2023-12-31',
    reportType: '年报',
    roe: 8,
    grossMargin: 18,
    netMargin: 5,
    debtToAsset: 65,
    revenueGrowth: 30,
    netIncomeGrowth: 40,
    operatingCashFlowPerShare: 3,
    eps: 2,
  }),
  snap({
    reportDate: '2022-12-31',
    reportType: '年报',
    roe: 12,
    grossMargin: 20,
    netMargin: 8,
    debtToAsset: 60,
    revenueGrowth: -10,
    netIncomeGrowth: -30,
    operatingCashFlowPerShare: 1,
    eps: 1,
  }),
  snap({
    reportDate: '2021-12-31',
    reportType: '年报',
    roe: 5,
    grossMargin: 16,
    netMargin: 3,
    debtToAsset: 62,
    revenueGrowth: 50,
    netIncomeGrowth: 60,
    operatingCashFlowPerShare: 2,
    eps: 1.5,
  }),
];

describe('computeFactors — 优质连续（茅台式）', () => {
  const f = computeFactors(hist(MOATY));

  test('available 且只用年报（季报噪声被剔除）', () => {
    expect(f.available).toBe(true);
    expect(f.annualPeriods).toBe(6);
    expect(f.asOf).toBe('2024-12-31');
  });

  test('护城河：ROE 连续 6 期 >15% → wide', () => {
    expect(f.roeConsistency?.verdict).toBe('wide');
    expect(f.roeConsistency?.streak).toBe(6);
    expect(f.roeConsistency?.periodsAbove).toBe(6);
    expect(f.roeConsistency?.totalPeriods).toBe(6);
    expect(f.roeConsistency?.avgRoe).toBe(25);
  });

  test('毛利率/净利率抬升 → up', () => {
    expect(f.marginTrend?.gross?.direction).toBe('up');
    expect(f.marginTrend?.gross?.latest).toBe(91.5);
    expect(f.marginTrend?.gross?.deltaPp).toBe(2.5);
    expect(f.marginTrend?.net?.direction).toBe('up');
  });

  test('负债率下降 → falling', () => {
    expect(f.debtTrend?.direction).toBe('falling');
    expect(f.debtTrend?.latest).toBe(18);
    expect(f.debtTrend?.avg).toBe(23);
  });

  test('营收/净利正增长低波动 → stable', () => {
    expect(f.growthStability?.revenue?.stability).toBe('stable');
    expect(f.growthStability?.revenue?.positivePeriods).toBe(6);
    expect(f.growthStability?.revenue?.totalPeriods).toBe(6);
    expect(f.growthStability?.netIncome?.stability).toBe('stable');
  });

  test('OCFPS>0 → simpleDcf 为有限正数，口径 ocfps', () => {
    expect(f.simpleDcf).toBeDefined();
    expect(Number.isFinite(f.simpleDcf?.intrinsicValuePerShare)).toBe(true);
    expect(f.simpleDcf?.intrinsicValuePerShare).toBeGreaterThan(0);
    expect(f.simpleDcf?.basis).toBe('ocfps');
  });

  test('水平因子只吃年报：季报的低毛利率(80%)不污染 latest', () => {
    // Q1 噪声毛利率 80%、ROE 6% 若混入会拉低 latest / 中断 streak，此处均无影响
    expect(f.marginTrend?.gross?.latest).toBe(91.5);
    expect(f.roeConsistency?.streak).toBe(6);
  });
});

describe('computeFactors — 亏损周期股', () => {
  const f = computeFactors(hist(CYCLICAL));

  test('ROE 从不达标 → none', () => {
    expect(f.roeConsistency?.verdict).toBe('none');
    expect(f.roeConsistency?.streak).toBe(0);
    expect(f.roeConsistency?.periodsAbove).toBe(0);
  });

  test('负债率上升 → rising', () => {
    expect(f.debtTrend?.direction).toBe('rising');
  });

  test('含负增长 → volatile', () => {
    expect(f.growthStability?.revenue?.stability).toBe('volatile');
  });

  test('最新 OCFPS<0 → simpleDcf undefined（不硬凑 DCF）', () => {
    expect(f.simpleDcf).toBeUndefined();
  });
});

describe('computeFactors — 边界', () => {
  test('非 A 股空快照 → available:false', () => {
    const f = computeFactors({
      symbol: 'AAPL',
      market: '美股',
      snapshots: [],
      fetchedAt: Date.now(),
    });
    expect(f.available).toBe(false);
    expect(f.annualPeriods).toBe(0);
    expect(f.roeConsistency).toBeUndefined();
  });

  test('年报<3 期 → available:false', () => {
    const f = computeFactors(hist(MOATY.slice(0, 2)));
    expect(f.available).toBe(false);
    expect(f.annualPeriods).toBe(2);
  });

  test('恰好 3 期年报 → available:true', () => {
    const f = computeFactors(hist(MOATY.slice(0, 3)));
    expect(f.available).toBe(true);
    expect(f.annualPeriods).toBe(3);
  });

  test('roe 全 null 不崩：roeConsistency undefined，但年报≥3 → available:true', () => {
    const nullRoe = MOATY.slice(0, 4).map((s) => ({ ...s, roe: undefined }));
    const f = computeFactors(hist(nullRoe));
    expect(f.available).toBe(true);
    expect(f.roeConsistency).toBeUndefined();
    // 其余基于非 roe 字段的因子仍应正常算出
    expect(f.marginTrend?.gross).toBeDefined();
    expect(f.debtTrend).toBeDefined();
  });
});

describe('模块常量', () => {
  test('VALUE_FACTOR_CONSUMER_IDS 覆盖 10 位价值派大师', () => {
    expect(VALUE_FACTOR_CONSUMER_IDS.size).toBe(10);
    for (const id of [
      'warren-buffett',
      'charlie-munger',
      'ben-graham',
      'aswath-damodaran',
      'mohnish-pabrai',
      'bill-ackman',
      'rakesh-jhunjhunwala',
      'phil-fisher',
      'peter-lynch',
      'michael-burry',
    ]) {
      expect(VALUE_FACTOR_CONSUMER_IDS.has(id)).toBe(true);
    }
  });

  test('FACTOR_HISTORY_PERIODS 足够覆盖多个年报期（≥10 年）', () => {
    expect(FACTOR_HISTORY_PERIODS).toBeGreaterThanOrEqual(40);
  });
});
