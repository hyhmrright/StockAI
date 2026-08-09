import type { FinancialMetrics, FundamentalResult, SubSignal } from './types';
import type { CheckItem } from '../../shared/types';
import { fetchWithPolicy } from '../http';
import { logger, toErrorMessage } from '../utils';
import { fetchYahooSession } from '../yahoo-session';
import { parseUsSymbol } from '../kline/symbol';
import { annualizeRoe } from './roe-annualize';

/**
 * 东财 datacenter F10 响应形态：数据在 result.data，非顶层 data。
 * 字段名失效/参数错误时返回 { success:false, result:null, code:9501 }。
 */
interface EastmoneyF10Response {
  result?: { data?: (Record<string, number> & { REPORT_TYPE?: string })[] } | null;
  success?: boolean;
  message?: string;
}

export function parseEastmoneyFinancials(json: EastmoneyF10Response): FinancialMetrics {
  // 端点在字段名失效时返回 success:false（历史 bug：旧字段名被静默吞成空数据），显式告警到 stderr
  if (json?.success === false) {
    logger.warn(`东财 F10 返回失败: ${json.message ?? '未知原因'}`);
    return {};
  }
  const row = json?.result?.data?.[0];
  if (!row) return {};
  return {
    roe: annualizeRoe(row.ROEJQ ?? undefined, row.REPORT_TYPE),
    grossMargin: row.XSMLL ?? undefined,
    netMargin: row.XSJLL ?? undefined,
    debtToAsset: row.ZCFZL ?? undefined,
    currentRatio: row.LD ?? undefined,
    revenueGrowth: row.TOTALOPERATEREVETZ ?? undefined,
    netIncomeGrowth: row.PARENTNETPROFITTZ ?? undefined,
    // 注意：MGJYXJJE 为每股经营现金流（元/股），与 Yahoo 的绝对值字段单位不同；
    // 估值模型使用前须结合 sharesOutstanding 换算，或仅作定性参考。
    operatingCashFlow: row.MGJYXJJE ?? undefined,
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

export interface FundamentalDeps {
  fetchImpl?: typeof fetch;
}

// ─────────────── 美股备源：东财 USF10 ───────────────

/**
 * 东财美股 F10 的行项目码。
 *
 * **同一个 STD_ITEM_CODE 在利润表与资产负债表里含义完全不同**，两张表必须分开取：
 * `004005999` 在利润表是毛利、在资产负债表是总资产；`004001001` 在利润表是主营收入、
 * 在资产负债表是现金及现金等价物。混用会算出一堆形状合法但完全错误的比率。
 */
const US_INCOME_ITEM = {
  revenue: '004001001', // 主营收入
  grossProfit: '004005999', // 毛利
  netIncome: '004013999', // 净利润
} as const;

const US_BALANCE_ITEM = {
  totalAssets: '004005999', // 总资产
  totalLiabilities: '004011999', // 总负债
  equity: '004017999', // 股东权益合计
  currentAssets: '004001999', // 流动资产合计
  currentLiabilities: '004007999', // 流动负债合计
  cash: '004001001', // 现金及现金等价物
} as const;

/** 东财 F10 一行：报表被透视成「一行一个行项目」，值在 AMOUNT、同比在 YOY_RATIO */
interface UsF10Row {
  REPORT_DATE?: string;
  STD_ITEM_CODE?: string;
  AMOUNT?: number | null;
  YOY_RATIO?: number | null;
}

interface UsF10Response {
  result?: { data?: UsF10Row[] } | null;
  success?: boolean;
  message?: string;
}

/** 取最新一期（响应按 REPORT_DATE 降序）的 行项目码 → 行 映射 */
function latestPeriodItems(json: UsF10Response): Map<string, UsF10Row> {
  const rows = json?.result?.data;
  if (!Array.isArray(rows) || rows.length === 0) return new Map();
  const latest = rows[0].REPORT_DATE;
  const map = new Map<string, UsF10Row>();
  for (const r of rows) {
    // 响应里混着多个报告期，只认最新那期——多期混排会让比率的分子分母来自不同年份
    if (r.REPORT_DATE !== latest || !r.STD_ITEM_CODE) continue;
    if (!map.has(r.STD_ITEM_CODE)) map.set(r.STD_ITEM_CODE, r);
  }
  return map;
}

/**
 * 由利润表 + 资产负债表推导出与 Yahoo 同口径的指标。
 *
 * 东财这套只给绝对值，比率全要自己算；口径对齐 parseYahooFinancials：
 * **比率类一律百分数**（roe / 各种率 / 增速），currentRatio 是倍数，其余为绝对金额（美元）。
 */
export function parseEastmoneyUsFinancials(
  incomeJson: UsF10Response,
  balanceJson: UsF10Response,
): FinancialMetrics {
  const inc = latestPeriodItems(incomeJson);
  const bal = latestPeriodItems(balanceJson);
  if (inc.size === 0 && bal.size === 0) return {};

  const amount = (m: Map<string, UsF10Row>, code: string): number | undefined => {
    const v = m.get(code)?.AMOUNT;
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  };
  const yoy = (m: Map<string, UsF10Row>, code: string): number | undefined => {
    const v = m.get(code)?.YOY_RATIO;
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  };
  /** 分母为 0 或缺失时返回 undefined，绝不产出 Infinity/NaN */
  const ratio = (a?: number, b?: number, scale = 100): number | undefined =>
    a !== undefined && b !== undefined && b !== 0
      ? Number(((a / b) * scale).toFixed(4))
      : undefined;

  const revenue = amount(inc, US_INCOME_ITEM.revenue);
  const netIncome = amount(inc, US_INCOME_ITEM.netIncome);
  const equity = amount(bal, US_BALANCE_ITEM.equity);
  const totalAssets = amount(bal, US_BALANCE_ITEM.totalAssets);

  return {
    roe: ratio(netIncome, equity),
    grossMargin: ratio(amount(inc, US_INCOME_ITEM.grossProfit), revenue),
    netMargin: ratio(netIncome, revenue),
    debtToAsset: ratio(amount(bal, US_BALANCE_ITEM.totalLiabilities), totalAssets),
    currentRatio: ratio(
      amount(bal, US_BALANCE_ITEM.currentAssets),
      amount(bal, US_BALANCE_ITEM.currentLiabilities),
      1,
    ),
    // 同比东财直接给，不必再拉一期自己算
    revenueGrowth: yoy(inc, US_INCOME_ITEM.revenue),
    netIncomeGrowth: yoy(inc, US_INCOME_ITEM.netIncome),
    revenue,
    netIncome,
    cash: amount(bal, US_BALANCE_ITEM.cash),
  };
}

function usF10Url(kind: 'INCOME' | 'BALANCE', ticker: string): string {
  // 用 SECURITY_CODE 而非 SECUCODE：后者要带交易所后缀（AAPL.O / JPM.N），
  // 那就得先解析标的在哪个交易所，凭空多一次请求
  const filter = encodeURIComponent(`(SECURITY_CODE="${ticker}")(REPORT_TYPE="年报")`);
  return (
    `https://datacenter.eastmoney.com/securities/api/data/get?type=RPT_USF10_FN_${kind}` +
    `&sty=ALL&filter=${filter}&p=1&ps=60&sr=-1&st=REPORT_DATE&source=SECURITIES&client=PC`
  );
}

/** 美股基本面备源：Yahoo 不可达（不少地区直接被墙）时改用东财美股 F10 */
export async function fetchEastmoneyUsFundamentals(
  symbol: string,
  deps: FundamentalDeps = {},
): Promise<FinancialMetrics> {
  const { ticker } = parseUsSymbol(symbol);
  const [income, balance] = await Promise.all(
    (['INCOME', 'BALANCE'] as const).map(async (kind) => {
      const resp = await fetchWithPolicy(usF10Url(kind, ticker), { fetchImpl: deps.fetchImpl });
      if (!resp.ok) throw new Error(`东财美股 F10 ${kind} HTTP ${resp.status}`);
      return (await resp.json()) as UsF10Response;
    }),
  );
  const metrics = parseEastmoneyUsFinancials(income, balance);
  // 空对象会被上层当成"抓到了但没数据"静静吞掉，那正是本仓最防的静默降级
  if (Object.keys(metrics).length === 0) throw new Error('东财美股 F10 解析为空');
  return metrics;
}

export async function fetchFundamentals(
  symbol: string,
  market: 'A股' | '美股',
  deps: FundamentalDeps = {},
): Promise<FinancialMetrics> {
  if (market === 'A股') {
    try {
      return await fetchEastmoneyFundamentals(symbol);
    } catch (err) {
      logger.warn(`基本面数据抓取失败 (${symbol}): ${toErrorMessage(err)}`);
      return {};
    }
  }

  try {
    return await fetchYahooFundamentals(symbol);
  } catch (err) {
    logger.warn(`Yahoo 基本面失败，回退东财美股 F10 (${symbol}): ${toErrorMessage(err)}`);
  }
  try {
    return await fetchEastmoneyUsFundamentals(symbol, deps);
  } catch (err) {
    logger.warn(`基本面数据抓取失败 (${symbol}): ${toErrorMessage(err)}`);
    return {};
  }
}

async function fetchEastmoneyFundamentals(code: string): Promise<FinancialMetrics> {
  const cleaned = code.replace(/\D/g, '');
  if (!/^\d{6}$/.test(cleaned)) throw new Error(`无效的 A 股代码: ${code}`);
  const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_F10_FINANCE_MAINFINADATA&columns=REPORT_TYPE,ROEJQ,XSJLL,XSMLL,ZCFZL,LD,TOTALOPERATEREVETZ,PARENTNETPROFITTZ,MGJYXJJE&filter=(SECURITY_CODE="${cleaned}")&pageSize=1&sortColumns=REPORT_DATE&sortTypes=-1`;

  const resp = await fetchWithPolicy(url, {
    headers: { Referer: 'https://emweb.securities.eastmoney.com' },
  });
  if (!resp.ok) throw new Error(`东财财务 HTTP ${resp.status}`);
  const json = await resp.json();
  return parseEastmoneyFinancials(json);
}

async function fetchYahooFundamentals(symbol: string): Promise<FinancialMetrics> {
  // quoteSummary 有 cookie + crumb 门禁，缺任一者恒 401，详见 yahoo-session.ts
  const { cookie, crumb } = await fetchYahooSession();
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=financialData,defaultKeyStatistics,cashflowStatementHistory,incomeStatementHistory,balanceSheetHistory&crumb=${encodeURIComponent(crumb)}`;

  const resp = await fetchWithPolicy(url, { headers: { Cookie: cookie } });
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
