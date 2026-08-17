import type { FinancialMetrics, FundamentalResult, SubSignal } from './types';
import type { CheckItem } from '../../shared/types';

/**
 * 基本面评分：把 `FinancialMetrics` 折成四个维度信号与一个复合信号。
 *
 * 与 `fundamental.ts` 分家的理由是**两半因为完全不同的事而改**——那边随东财 / Yahoo
 * 改版而动（被动、频繁、外部驱动），这边的 `FUND_THRESHOLDS` 随我们对「什么算好公司」
 * 的看法而动（主动、罕见、口径决策）。混在一个 517 行的文件里时，调一次 ROE 阈值的 diff
 * 看起来和修一个解析 bug 没有区别。
 *
 * **改这里的阈值属于口径变更，不是加法**——它会移动每只股票的基本面分。
 */

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
