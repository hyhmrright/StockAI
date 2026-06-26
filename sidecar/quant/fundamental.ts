import type { FinancialMetrics, FundamentalResult, SubSignal } from './types';
import type { CheckItem } from '../../shared/types';
import { logger, toErrorMessage } from '../utils';

export function parseEastmoneyFinancials(json: {
  data?: Record<string, number>[];
}): FinancialMetrics {
  const row = json?.data?.[0];
  if (!row) return {};
  return {
    roe: row.WEIGHTAVG_ROE ?? undefined,
    grossMargin: row.XSMLL ?? undefined,
    netMargin: row.XSJLL ?? undefined,
    debtToAsset: row.ZCFZL ?? undefined,
    currentRatio: row.LD_RATIO ?? undefined,
    revenueGrowth: row.YYZSRTBZZ ?? undefined,
    netIncomeGrowth: row.GSJLRTBZZ ?? undefined,
    // 注意：MGJYXJL 为每股经营现金流（元/股），与 Yahoo 的绝对值字段单位不同；
    // 估值模型使用前须结合 sharesOutstanding 换算，或仅作定性参考。
    operatingCashFlow: row.MGJYXJL ?? undefined,
  };
}

interface YahooFinancialData {
  returnOnEquity?: { raw: number };
  grossMargins?: { raw: number };
  profitMargins?: { raw: number };
  debtToEquity?: { raw: number };
  currentRatio?: { raw: number };
  revenueGrowth?: { raw: number };
  earningsGrowth?: { raw: number };
}

interface YahooKeyStats {
  trailingPE?: { raw: number };
  priceToBook?: { raw: number };
  enterpriseValue?: { raw: number };
}

interface YahooCashflowStatement {
  freeCashFlow?: { raw: number };
  totalCashFromOperatingActivities?: { raw: number };
  capitalExpenditures?: { raw: number };
  depreciation?: { raw: number };
}

interface YahooIncomeStatement {
  ebitda?: { raw: number };
  interestExpense?: { raw: number };
  netIncome?: { raw: number };
  totalRevenue?: { raw: number };
}

interface YahooBalanceSheetStatement {
  longTermDebt?: { raw: number };
  shortLongTermDebt?: { raw: number };
  cash?: { raw: number };
  commonStockSharesOutstanding?: { raw: number };
}

interface YahooQuoteItem {
  financialData?: YahooFinancialData;
  defaultKeyStatistics?: YahooKeyStats;
  cashflowStatementHistory?: { cashflowStatements?: YahooCashflowStatement[] };
  incomeStatementHistory?: { incomeStatementHistory?: YahooIncomeStatement[] };
  balanceSheetHistory?: { balanceSheetStatements?: YahooBalanceSheetStatement[] };
}

export function parseYahooFinancials(json: {
  quoteSummary?: { result?: YahooQuoteItem[] };
}): FinancialMetrics {
  const item = json?.quoteSummary?.result?.[0];
  if (!item) return {};
  const fd = item.financialData ?? {};
  const ks = item.defaultKeyStatistics ?? {};

  const metrics: FinancialMetrics = {
    roe: fd.returnOnEquity?.raw != null ? fd.returnOnEquity.raw * 100 : undefined,
    grossMargin: fd.grossMargins?.raw != null ? fd.grossMargins.raw * 100 : undefined,
    netMargin: fd.profitMargins?.raw != null ? fd.profitMargins.raw * 100 : undefined,
    debtToAsset:
      fd.debtToEquity?.raw != null
        ? (fd.debtToEquity.raw / (100 + fd.debtToEquity.raw)) * 100
        : undefined,
    currentRatio: fd.currentRatio?.raw,
    revenueGrowth: fd.revenueGrowth?.raw != null ? fd.revenueGrowth.raw * 100 : undefined,
    netIncomeGrowth: fd.earningsGrowth?.raw != null ? fd.earningsGrowth.raw * 100 : undefined,
    pe: ks.trailingPE?.raw,
    pb: ks.priceToBook?.raw,
    enterpriseValue: ks.enterpriseValue?.raw,
  };

  // 现金流量表
  const cfh = item.cashflowStatementHistory?.cashflowStatements?.[0];
  if (cfh) {
    metrics.freeCashFlow = cfh.freeCashFlow?.raw;
    metrics.operatingCashFlow = cfh.totalCashFromOperatingActivities?.raw;
    metrics.capitalExpenditure = cfh.capitalExpenditures?.raw;
    metrics.depreciation = cfh.depreciation?.raw;
  }

  // 利润表
  const ish = item.incomeStatementHistory?.incomeStatementHistory?.[0];
  if (ish) {
    metrics.ebitda = ish.ebitda?.raw;
    metrics.interestExpense = ish.interestExpense?.raw;
    metrics.netIncome = ish.netIncome?.raw;
    metrics.revenue = ish.totalRevenue?.raw;
  }

  // 资产负债表
  const bsh = item.balanceSheetHistory?.balanceSheetStatements?.[0];
  if (bsh) {
    // 两字段均缺失时保持 undefined（区别于"确认无债务"的 0）
    const ltd = bsh.longTermDebt?.raw;
    const std = bsh.shortLongTermDebt?.raw;
    if (ltd != null || std != null) metrics.totalDebt = (ltd ?? 0) + (std ?? 0);
    metrics.cash = bsh.cash?.raw;
    metrics.sharesOutstanding = bsh.commonStockSharesOutstanding?.raw;
  }

  return metrics;
}

export async function fetchFundamentals(
  symbol: string,
  market: 'A股' | '美股',
): Promise<FinancialMetrics> {
  try {
    if (market === 'A股') {
      return await fetchEastmoneyFundamentals(symbol);
    }
    return await fetchYahooFundamentals(symbol);
  } catch (err) {
    logger.warn(`基本面数据抓取失败 (${symbol}): ${toErrorMessage(err)}`);
    return {};
  }
}

async function fetchEastmoneyFundamentals(code: string): Promise<FinancialMetrics> {
  const cleaned = code.replace(/\D/g, '');
  if (!/^\d{6}$/.test(cleaned)) throw new Error(`无效的 A 股代码: ${code}`);
  const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_F10_FINANCE_MAINFINADATA&columns=WEIGHTAVG_ROE,XSJLL,XSMLL,ZCFZL,LD_RATIO,YYZSRTBZZ,GSJLRTBZZ,MGJYXJL&filter=(SECURITY_CODE="${cleaned}")&pageSize=1&sortColumns=REPORT_DATE&sortTypes=-1`;

  const resp = await fetch(url, {
    headers: { Referer: 'https://emweb.securities.eastmoney.com' },
    signal: AbortSignal.timeout(8000), // 防网络卡顿挂起
  });
  if (!resp.ok) throw new Error(`东财财务 HTTP ${resp.status}`);
  const json = await resp.json();
  return parseEastmoneyFinancials(json);
}

async function fetchYahooFundamentals(symbol: string): Promise<FinancialMetrics> {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=financialData,defaultKeyStatistics,cashflowStatementHistory,incomeStatementHistory,balanceSheetHistory`;

  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000), // 防网络卡顿挂起
  });
  if (!resp.ok) throw new Error(`Yahoo Finance HTTP ${resp.status}`);
  const json = await resp.json();
  return parseYahooFinancials(json);
}

/**
 * 判定单个指标的得分（1 = 优, 0 = 中, -1 = 差）；值为 null/undefined 则跳过。
 * threshold/comparator 用于可下钻展示「实际值 vs 通过阈值」。
 */
type MetricGrader = {
  value: number | undefined;
  grade: (v: number) => number;
  key: string;
  threshold: number;
  comparator: 'gte' | 'lte';
  decimals?: number;
};

/** 将指标打分结果归一化为 SubSignal（共用逻辑），同时产出可下钻的逐项检查 */
function scoreDimension(name: string, graders: MetricGrader[]): SubSignal {
  let score = 0;
  let counted = 0;
  const details: Record<string, number> = {};
  const checkItems: CheckItem[] = [];

  for (const { value, grade, key, decimals, threshold, comparator } of graders) {
    if (value == null) continue;
    counted++;
    const g = grade(value);
    score += g;
    const actual = Number(value.toFixed(decimals ?? 1));
    details[key] = actual;
    checkItems.push({
      key,
      actual,
      threshold,
      comparator,
      passed: g > 0 ? true : g < 0 ? false : null,
    });
  }

  const normalized = counted > 0 ? (score / counted) * 60 : 0;
  let signal: 'bullish' | 'bearish' | 'neutral';
  if (normalized > 20) signal = 'bullish';
  else if (normalized < -20) signal = 'bearish';
  else signal = 'neutral';
  return { name, signal, score: Math.round(normalized), weight: 0.25, details, checkItems };
}

/**
 * 基本面各指标判优(good)/判中(fair)阈值，集中管理便于审计调参。
 * gte 维度：> good 判优、> fair 判中；lte 维度：< good 判优、< fair 判中。good 同时作为下钻展示的通过阈值。
 */
const FUND_THRESHOLDS = {
  roe: { good: 15, fair: 8 },
  netMargin: { good: 10, fair: 5 },
  grossMargin: { good: 30, fair: 15 },
  revenueGrowth: { good: 10, fair: 0 },
  netIncomeGrowth: { good: 10, fair: 0 },
  debtToAsset: { good: 60, fair: 75 },
  currentRatio: { good: 1.5, fair: 1 },
  pe: { good: 25, fair: 40 },
  pb: { good: 3, fair: 5 },
} as const;

/** gte 维度评分闭包：> good →1, > fair →0, 否则 -1 */
const gradeGte = (t: { good: number; fair: number }) => (v: number) =>
  v > t.good ? 1 : v > t.fair ? 0 : -1;
/** lte 维度评分闭包：< good →1, < fair →0, 否则 -1（越低越好） */
const gradeLte = (t: { good: number; fair: number }) => (v: number) =>
  v < t.good ? 1 : v < t.fair ? 0 : -1;

function scoreProfitability(m: FinancialMetrics): SubSignal {
  return scoreDimension('profitability', [
    {
      value: m.roe,
      grade: gradeGte(FUND_THRESHOLDS.roe),
      key: 'roe',
      threshold: FUND_THRESHOLDS.roe.good,
      comparator: 'gte',
    },
    {
      value: m.netMargin,
      grade: gradeGte(FUND_THRESHOLDS.netMargin),
      key: 'net_margin',
      threshold: FUND_THRESHOLDS.netMargin.good,
      comparator: 'gte',
    },
    {
      value: m.grossMargin,
      grade: gradeGte(FUND_THRESHOLDS.grossMargin),
      key: 'gross_margin',
      threshold: FUND_THRESHOLDS.grossMargin.good,
      comparator: 'gte',
    },
  ]);
}

function scoreGrowth(m: FinancialMetrics): SubSignal {
  return scoreDimension('growth', [
    {
      value: m.revenueGrowth,
      grade: gradeGte(FUND_THRESHOLDS.revenueGrowth),
      key: 'revenue_growth',
      threshold: FUND_THRESHOLDS.revenueGrowth.good,
      comparator: 'gte',
    },
    {
      value: m.netIncomeGrowth,
      grade: gradeGte(FUND_THRESHOLDS.netIncomeGrowth),
      key: 'net_income_growth',
      threshold: FUND_THRESHOLDS.netIncomeGrowth.good,
      comparator: 'gte',
    },
  ]);
}

function scoreFinancialHealth(m: FinancialMetrics): SubSignal {
  return scoreDimension('financial_health', [
    {
      value: m.debtToAsset,
      grade: gradeLte(FUND_THRESHOLDS.debtToAsset),
      key: 'debt_to_asset',
      threshold: FUND_THRESHOLDS.debtToAsset.good,
      comparator: 'lte',
    },
    {
      value: m.currentRatio,
      grade: gradeGte(FUND_THRESHOLDS.currentRatio),
      key: 'current_ratio',
      threshold: FUND_THRESHOLDS.currentRatio.good,
      comparator: 'gte',
      decimals: 2,
    },
  ]);
}

function scoreValuation(m: FinancialMetrics): SubSignal {
  return scoreDimension('valuation', [
    {
      value: m.pe,
      grade: gradeLte(FUND_THRESHOLDS.pe),
      key: 'pe',
      threshold: FUND_THRESHOLDS.pe.good,
      comparator: 'lte',
    },
    {
      value: m.pb,
      grade: gradeLte(FUND_THRESHOLDS.pb),
      key: 'pb',
      threshold: FUND_THRESHOLDS.pb.good,
      comparator: 'lte',
      decimals: 2,
    },
  ]);
}

export function scoreFundamentals(metrics: FinancialMetrics): FundamentalResult {
  const dimensions = [
    scoreProfitability(metrics),
    scoreGrowth(metrics),
    scoreFinancialHealth(metrics),
    scoreValuation(metrics),
  ];

  const hasData = dimensions.some((d) => Object.keys(d.details).length > 0);
  if (!hasData) {
    return {
      dimensions,
      composite: { signal: 'neutral', confidence: 10, details: { reason: 'no_data' } },
    };
  }

  const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0);
  const weightedScore = dimensions.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight;
  const confidence = Math.min(100, Math.abs(weightedScore) + 30);

  let signal: 'bullish' | 'bearish' | 'neutral';
  if (weightedScore > 15) signal = 'bullish';
  else if (weightedScore < -15) signal = 'bearish';
  else signal = 'neutral';

  return {
    dimensions,
    composite: {
      signal,
      confidence: Math.round(confidence),
      details: Object.fromEntries(dimensions.map((d) => [d.name, `${d.signal} (${d.score})`])),
      // 汇总四维全部逐项检查，供前端下钻展示「凭哪几条判 bullish」
      checks: dimensions.flatMap((d) => d.checkItems ?? []),
    },
  };
}
