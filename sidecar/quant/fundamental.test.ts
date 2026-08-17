import { describe, test, expect, mock, afterEach } from 'bun:test';
import {
  parseEastmoneyFinancials,
  parseEastmoneyUsFinancials,
  parseYahooFinancials,
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

describe('parseEastmoneyUsFinancials（Yahoo 不可达时的美股备源）', () => {
  /** 东财把报表透视成「一行一个行项目」；数值取自 AAPL 2025/FY 实测 */
  const row = (code: string, amount: number, yoy?: number, date = '2025-09-27 00:00:00') => ({
    REPORT_DATE: date,
    STD_ITEM_CODE: code,
    AMOUNT: amount,
    YOY_RATIO: yoy ?? null,
  });
  const INCOME = {
    result: {
      data: [
        row('004001001', 416_161_000_000, 6.4255), // 主营收入
        row('004005999', 195_201_000_000, 8.035), // 毛利
        row('004013999', 112_010_000_000, 19.4952), // 净利润
      ],
    },
  };
  const BALANCE = {
    result: {
      data: [
        row('004005999', 359_241_000_000), // 总资产（同码在利润表是毛利！）
        row('004011999', 285_508_000_000), // 总负债
        row('004017999', 73_733_000_000), // 股东权益合计
        row('004001999', 147_957_000_000), // 流动资产合计
        row('004007999', 165_631_000_000), // 流动负债合计
        row('004001001', 35_934_000_000), // 现金（同码在利润表是主营收入！）
      ],
    },
  };

  test('比率按 Yahoo 口径产出百分数', () => {
    const m = parseEastmoneyUsFinancials(INCOME, BALANCE);
    expect(m.grossMargin).toBeCloseTo(46.9, 1);
    expect(m.netMargin).toBeCloseTo(26.9, 1);
    expect(m.roe).toBeCloseTo(151.9, 1); // 苹果长期回购，ROE 确实在 150% 量级
    expect(m.debtToAsset).toBeCloseTo(79.5, 1);
  });

  test('currentRatio 是倍数而非百分数', () => {
    expect(parseEastmoneyUsFinancials(INCOME, BALANCE).currentRatio).toBeCloseTo(0.893, 3);
  });

  test('两张表的同码字段不串味——这是本模块最容易错的地方', () => {
    // 004005999 在利润表是毛利、在资产负债表是总资产；串了的话 grossMargin 会变成 86%
    const m = parseEastmoneyUsFinancials(INCOME, BALANCE);
    expect(m.revenue).toBe(416_161_000_000);
    expect(m.cash).toBe(35_934_000_000); // 取自资产负债表的 004001001
    expect(m.grossMargin).toBeLessThan(50); // 若误用总资产当毛利会得到 86%
  });

  test('增速直接取上游 YOY_RATIO，不再拉一期自算', () => {
    const m = parseEastmoneyUsFinancials(INCOME, BALANCE);
    expect(m.revenueGrowth).toBeCloseTo(6.43, 2);
    expect(m.netIncomeGrowth).toBeCloseTo(19.5, 2);
  });

  test('只认最新一期——多期混排会让分子分母来自不同年份', () => {
    const mixed = {
      result: {
        data: [
          ...INCOME.result.data,
          row('004001001', 391_035_000_000, 2.02, '2024-09-28 00:00:00'),
        ],
      },
    };
    expect(parseEastmoneyUsFinancials(mixed, BALANCE).revenue).toBe(416_161_000_000);
  });

  test('分母为 0 或缺失时返回 undefined，不产出 Infinity/NaN', () => {
    const zeroEquity = { result: { data: [row('004017999', 0)] } };
    const m = parseEastmoneyUsFinancials(INCOME, zeroEquity);
    expect(m.roe).toBeUndefined();
    expect(m.currentRatio).toBeUndefined();
  });

  test('两张表都空时返回 {}', () => {
    expect(parseEastmoneyUsFinancials({ result: null }, { result: null })).toEqual({});
  });
});
