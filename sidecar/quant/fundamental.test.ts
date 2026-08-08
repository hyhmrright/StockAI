import { describe, test, expect, mock, afterEach } from 'bun:test';
import {
  parseEastmoneyFinancials,
  parseYahooFinancials,
  scoreFundamentals,
  fetchFundamentals,
} from './fundamental';
import type { FinancialMetrics } from './types';

describe('parseEastmoneyFinancials', () => {
  test('从东方财富 API 响应中提取财务指标（真实 result.data 形态 + 新字段名）', () => {
    // 实测形态：数据在 result.data，字段名为 ROEJQ/LD/TOTALOPERATEREVETZ 等
    const response = {
      result: {
        data: [
          {
            ROEJQ: 18.5,
            XSJLL: 32.0,
            XSMLL: 45.0,
            ZCFZL: 42.3,
            LD: 1.8,
            TOTALOPERATEREVETZ: 15.2,
            PARENTNETPROFITTZ: 12.8,
            MGJYXJJE: 3.5,
          },
        ],
      },
      success: true,
    };
    const metrics = parseEastmoneyFinancials(response);
    expect(metrics.roe).toBeCloseTo(18.5, 1);
    expect(metrics.grossMargin).toBeCloseTo(45.0, 1);
    expect(metrics.netMargin).toBeCloseTo(32.0, 1);
    expect(metrics.debtToAsset).toBeCloseTo(42.3, 1);
    expect(metrics.currentRatio).toBeCloseTo(1.8, 1);
    expect(metrics.revenueGrowth).toBeCloseTo(15.2, 1);
    expect(metrics.netIncomeGrowth).toBeCloseTo(12.8, 1);
    expect(metrics.operatingCashFlow).toBeCloseTo(3.5, 1);
  });

  test('REPORT_TYPE 为一季报时 roe 按 ×4 年化（避免季度口径与年化阈值错位）', () => {
    const metrics = parseEastmoneyFinancials({
      result: { data: [{ REPORT_TYPE: '一季报', ROEJQ: 10.57 }] },
      success: true,
    });
    expect(metrics.roe).toBeCloseTo(42.28, 2);
  });

  test('数据为空时返回空对象', () => {
    const metrics = parseEastmoneyFinancials({ result: { data: [] } });
    expect(metrics.roe).toBeUndefined();
  });

  test('端点返回 success:false（字段名失效）时返回空对象', () => {
    // 复现历史 bug：旧字段名现返回 success:false，须显式降级为空而非崩溃
    const metrics = parseEastmoneyFinancials({
      result: null,
      success: false,
      message: 'WEIGHTAVG_ROE返回字段不存在',
    });
    expect(metrics).toEqual({});
  });
});

describe('parseYahooFinancials', () => {
  test('从 Yahoo Finance 响应中提取财务指标', () => {
    const response = {
      quoteSummary: {
        result: [
          {
            financialData: {
              returnOnEquity: { raw: 0.165 },
              grossMargins: { raw: 0.438 },
              profitMargins: { raw: 0.255 },
              debtToEquity: { raw: 85.5 },
              currentRatio: { raw: 1.07 },
              revenueGrowth: { raw: 0.049 },
              earningsGrowth: { raw: 0.108 },
            },
            defaultKeyStatistics: {
              trailingPE: { raw: 29.4 },
              priceToBook: { raw: 48.2 },
              enterpriseValue: { raw: 3_200_000_000_000 },
            },
          },
        ],
      },
    };
    const metrics = parseYahooFinancials(response);
    expect(metrics.roe).toBeCloseTo(16.5, 0);
    expect(metrics.grossMargin).toBeCloseTo(43.8, 0);
    expect(metrics.revenueGrowth).toBeCloseTo(4.9, 0);
  });

  test('parseYahooFinancials extracts cash flow fields', () => {
    const json = {
      quoteSummary: {
        result: [
          {
            financialData: { returnOnEquity: { raw: 0.25 } },
            defaultKeyStatistics: { enterpriseValue: { raw: 2_000_000_000_000 } },
            cashflowStatementHistory: {
              cashflowStatements: [
                {
                  freeCashFlow: { raw: 90_000_000_000 },
                  totalCashFromOperatingActivities: { raw: 100_000_000_000 },
                  capitalExpenditures: { raw: -10_000_000_000 },
                  depreciation: { raw: 11_000_000_000 },
                },
              ],
            },
            incomeStatementHistory: {
              incomeStatementHistory: [
                {
                  ebitda: { raw: 130_000_000_000 },
                  interestExpense: { raw: -3_000_000_000 },
                  netIncome: { raw: 95_000_000_000 },
                  totalRevenue: { raw: 400_000_000_000 },
                },
              ],
            },
            balanceSheetHistory: {
              balanceSheetStatements: [
                {
                  longTermDebt: { raw: 100_000_000_000 },
                  shortLongTermDebt: { raw: 10_000_000_000 },
                  cash: { raw: 50_000_000_000 },
                  commonStockSharesOutstanding: { raw: 15_000_000_000 },
                },
              ],
            },
          },
        ],
      },
    };
    const result = parseYahooFinancials(json);
    expect(result.freeCashFlow).toBe(90_000_000_000);
    expect(result.operatingCashFlow).toBe(100_000_000_000);
    expect(result.capitalExpenditure).toBe(-10_000_000_000);
    expect(result.ebitda).toBe(130_000_000_000);
    expect(result.totalDebt).toBe(110_000_000_000);
    expect(result.cash).toBe(50_000_000_000);
    expect(result.sharesOutstanding).toBe(15_000_000_000);
    expect(result.enterpriseValue).toBe(2_000_000_000_000);
    expect(result.netIncome).toBe(95_000_000_000);
    expect(result.revenue).toBe(400_000_000_000);
  });
});

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

describe('fetchFundamentals', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('A 股调用东方财富接口', async () => {
    let calledUrl = '';
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      calledUrl = String(url);
      return new Response(
        JSON.stringify({
          success: true,
          result: {
            data: [
              {
                ROEJQ: 15,
                XSJLL: 20,
                XSMLL: 35,
                ZCFZL: 40,
                LD: 1.5,
                TOTALOPERATEREVETZ: 10,
                PARENTNETPROFITTZ: 8,
              },
            ],
          },
        }),
      );
    }) as typeof fetch;

    const result = await fetchFundamentals('601012', 'A股');
    expect(calledUrl).toContain('eastmoney');
    expect(result.roe).toBeCloseTo(15, 0);
  });

  test('美股先握手取 cookie+crumb，再带着它们请求 quoteSummary', async () => {
    let summaryUrl = '';
    let summaryCookie: string | null = null;
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      // 第一步：fc.yahoo.com 真实响应就是 404，产物只有 Set-Cookie
      if (target.includes('fc.yahoo.com')) {
        return new Response('', { status: 404, headers: { 'set-cookie': 'A3=token; Path=/' } });
      }
      if (target.includes('getcrumb')) return new Response('cRuMb123');
      summaryUrl = target;
      summaryCookie = new Headers(init?.headers).get('Cookie');
      return new Response(
        JSON.stringify({
          quoteSummary: {
            result: [
              {
                financialData: {
                  returnOnEquity: { raw: 0.2 },
                  grossMargins: { raw: 0.45 },
                  profitMargins: { raw: 0.25 },
                  debtToEquity: { raw: 100 },
                  currentRatio: { raw: 1.2 },
                  revenueGrowth: { raw: 0.08 },
                  earningsGrowth: { raw: 0.12 },
                },
                defaultKeyStatistics: {},
              },
            ],
          },
        }),
      );
    }) as typeof fetch;

    const result = await fetchFundamentals('AAPL', '美股');
    expect(summaryUrl).toContain('quoteSummary');
    // 这两条是 401 门禁的全部要件，少任一条线上就恒失败
    expect(summaryUrl).toContain('crumb=cRuMb123');
    expect(summaryCookie).toBe('A3=token');
    expect(result.roe).toBeCloseTo(20, 0);
  });

  test('网络失败返回空对象', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('network');
    }) as typeof fetch;
    const result = await fetchFundamentals('AAPL', '美股');
    expect(result).toEqual({});
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
