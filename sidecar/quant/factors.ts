import type {
  DebtTrendFactor,
  FinancialHistory,
  FinancialSnapshot,
  GrowthSeriesStability,
  GrowthStabilityFactor,
  MarginDirection,
  MarginTrendFactor,
  MasterFactors,
  RoeConsistencyFactor,
  SimpleDcfFactor,
} from '../../shared/types';

/**
 * 大师专属因子预计算（#12）。多期年报时序 → 结构化因子，注入价值派大师 prompt。
 * 纯函数、无 IO、离线可测（与 agents/weights.ts 同风格）。对标 ai-hedge-fund 的
 * analyze_moat / analyze_consistency / analyze_financial_strength / DCF。
 */

/**
 * runDeepAnalysis 拉历史时请求的期数（≈近 10 年年报）。
 * 东财 F10 混合年报+季报，40 期约含 10 个年报，撑得起「连续 N 年」护城河判定；
 * 默认 12 期只含约 3 个年报，不够。成本不变（仍是单次已缓存 HTTP）。
 */
export const FACTOR_HISTORY_PERIODS = 40;

/** 消费因子的价值派大师（10 位）——历史基本面是其判断框架的锚。见蓝图 §4。 */
export const VALUE_FACTOR_CONSUMER_IDS: ReadonlySet<string> = new Set([
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
]);

// ---- 计算参数（对标 ai-hedge-fund 口径）----
const ROE_THRESHOLD = 15; // 护城河 ROE 判定阈值(%)
const MOAT_WIDE_STREAK = 5; // 连续达标 >=5 期判「宽阔」
const MOAT_NARROW_RATIO = 0.6; // 达标占比 >=0.6 判「中等」
const MARGIN_DEADZONE_PP = 1.0; // 利润率趋势死区（±pp）
const DEBT_DEADZONE_PP = 2.0; // 负债率趋势死区（±pp）
const GROWTH_STABLE_CV = 0.5; // 增长稳定的变异系数上限
const MIN_MARGIN_POINTS = 3; // 利润率趋势最少数据点
const MIN_TREND_POINTS = 2; // 负债趋势/增长稳定性最少数据点
const MIN_ANNUAL_PERIODS = 3; // 因子可用的最少年报期数
// 简化 DCF 参数
const DCF_DISCOUNT_RATE = 0.1; // 贴现率 w
const DCF_TERMINAL_GROWTH = 0.03; // 终值增速 g_∞
const DCF_GROWTH_CAP = 0.15; // 增速上限
const DCF_STAGE1_YEARS = 5; // 第一阶段（恒定 g）年数
const DCF_STAGE2_YEARS = 5; // 第二阶段（线性衰减到终值增速）年数
const SIMPLE_DCF_NOTE = '粗略每股内在价值，安全边际以现价/市值口径由 quant.valuation 为准';

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** 总体标准差（CV 启发式用，不做样本无偏修正） */
function stddev(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** 从 latest-first 序列中取首个非空值（最新可得年报） */
function firstPresent(xs: (number | undefined)[]): number | undefined {
  return xs.find((v): v is number => v != null);
}

/** 过滤出非空值，保持原顺序（annual 为 latest-first） */
function present(xs: (number | undefined)[]): number[] {
  return xs.filter((v): v is number => v != null);
}

/**
 * ① 护城河代理：ROE 多年持续性。
 * streak 从最新年报起连续 roe>threshold，遇缺失或不达标即中断（保守，不跨缺口续接）。
 */
function computeRoeConsistency(annual: FinancialSnapshot[]): RoeConsistencyFactor | undefined {
  const seq = annual.map((s) => s.roe); // latest-first，含缺失
  const vals = present(seq);
  if (vals.length === 0) return undefined;

  let streak = 0;
  for (const v of seq) {
    if (v != null && v > ROE_THRESHOLD) streak++;
    else break; // 缺失或不达标即中断连续性
  }
  const periodsAbove = vals.filter((v) => v > ROE_THRESHOLD).length;
  const totalPeriods = vals.length;
  let verdict: RoeConsistencyFactor['verdict'];
  if (streak >= MOAT_WIDE_STREAK) verdict = 'wide';
  else if ((streak >= 2 && streak <= 4) || periodsAbove / totalPeriods >= MOAT_NARROW_RATIO)
    verdict = 'narrow';
  else verdict = 'none';

  return {
    threshold: ROE_THRESHOLD,
    streak,
    periodsAbove,
    totalPeriods,
    avgRoe: round(mean(vals), 1),
    verdict,
  };
}

/** 单一利润率序列（latest-first）→ 方向。需 >=3 个有值点。 */
function computeMarginDirection(seq: (number | undefined)[]): MarginDirection | undefined {
  const vals = present(seq); // latest-first
  if (vals.length < MIN_MARGIN_POINTS) return undefined;
  const latest = vals[0];
  const earliest = vals[vals.length - 1]; // 最早可比点
  const deltaPp = round(latest - earliest, 1);
  let direction: MarginDirection['direction'];
  if (deltaPp > MARGIN_DEADZONE_PP) direction = 'up';
  else if (deltaPp < -MARGIN_DEADZONE_PP) direction = 'down';
  else direction = 'flat';
  return { latest, direction, deltaPp };
}

/** ② 盈利质量趋势：毛利率 + 净利率各算一遍。 */
function computeMarginTrend(annual: FinancialSnapshot[]): MarginTrendFactor | undefined {
  const gross = computeMarginDirection(annual.map((s) => s.grossMargin));
  const net = computeMarginDirection(annual.map((s) => s.netMargin));
  if (!gross && !net) return undefined;
  return { gross, net };
}

/** ③ 财务实力趋势：资产负债率走向（下降=去杠杆=好；上升=加杠杆=警惕）。 */
function computeDebtTrend(annual: FinancialSnapshot[]): DebtTrendFactor | undefined {
  const vals = present(annual.map((s) => s.debtToAsset)); // latest-first
  if (vals.length < MIN_TREND_POINTS) return undefined;
  const latest = vals[0];
  const earliest = vals[vals.length - 1];
  const delta = latest - earliest;
  let direction: DebtTrendFactor['direction'];
  if (delta < -DEBT_DEADZONE_PP) direction = 'falling';
  else if (delta > DEBT_DEADZONE_PP) direction = 'rising';
  else direction = 'stable';
  return { latest, avg: round(mean(vals), 1), direction };
}

/** 单一增长序列（同比 %）→ 稳定性。需 >=2 个有值点。 */
function computeGrowthSeries(seq: (number | undefined)[]): GrowthSeriesStability | undefined {
  const vals = present(seq);
  if (vals.length < MIN_TREND_POINTS) return undefined;
  const avgGrowth = mean(vals);
  const positivePeriods = vals.filter((v) => v > 0).length;
  const cv = Math.abs(avgGrowth) > 1e-9 ? stddev(vals) / Math.abs(avgGrowth) : Infinity;
  // 稳定 = 全期正增长 且 变异系数低；否则波动（有负增长或急涨急跌）
  const stability: GrowthSeriesStability['stability'] =
    positivePeriods === vals.length && cv < GROWTH_STABLE_CV ? 'stable' : 'volatile';
  return { avgGrowth: round(avgGrowth, 1), positivePeriods, totalPeriods: vals.length, stability };
}

/** ④ 增长稳定性：营收同比 + 净利同比各算一遍。 */
function computeGrowthStability(annual: FinancialSnapshot[]): GrowthStabilityFactor | undefined {
  const revenue = computeGrowthSeries(annual.map((s) => s.revenueGrowth));
  const netIncome = computeGrowthSeries(annual.map((s) => s.netIncomeGrowth));
  if (!revenue && !netIncome) return undefined;
  return { revenue, netIncome };
}

/**
 * ⑤ 简化两阶段 DCF 每股内在价值（交叉验证，非权威）。
 * 口径：latest 年报每股经营现金流（owner-earnings 代理）；缺则 fallback eps。
 * base<=0 → undefined（不硬凑）。增速取年报净利同比均值，钳到 0..15%。
 */
function computeSimpleDcf(annual: FinancialSnapshot[]): SimpleDcfFactor | undefined {
  const ocfps = firstPresent(annual.map((s) => s.operatingCashFlowPerShare));
  let base: number;
  let basis: SimpleDcfFactor['basis'];
  if (ocfps != null) {
    base = ocfps;
    basis = 'ocfps';
  } else {
    const eps = firstPresent(annual.map((s) => s.eps));
    if (eps == null) return undefined;
    base = eps;
    basis = 'eps';
  }
  if (base <= 0) return undefined; // 现金流/盈利为负 → 不套 DCF

  const niGrowth = present(annual.map((s) => s.netIncomeGrowth));
  const g = clamp(niGrowth.length ? mean(niGrowth) / 100 : 0, 0, DCF_GROWTH_CAP);
  const w = DCF_DISCOUNT_RATE;
  const gTerm = DCF_TERMINAL_GROWTH;

  let pv = 0;
  let cash = base;
  // 第一阶段：前 5 年按恒定 g
  for (let y = 1; y <= DCF_STAGE1_YEARS; y++) {
    cash *= 1 + g;
    pv += cash / (1 + w) ** y;
  }
  // 第二阶段：后 5 年增速从 g 线性衰减到终值增速
  for (let y = 1; y <= DCF_STAGE2_YEARS; y++) {
    const gy = g + ((gTerm - g) * y) / DCF_STAGE2_YEARS;
    cash *= 1 + gy;
    pv += cash / (1 + w) ** (DCF_STAGE1_YEARS + y);
  }
  // 终值（戈登增长），贴现回现值
  const totalYears = DCF_STAGE1_YEARS + DCF_STAGE2_YEARS;
  const terminalValue = (cash * (1 + gTerm)) / (w - gTerm);
  pv += terminalValue / (1 + w) ** totalYears;

  return {
    intrinsicValuePerShare: round(pv, 2),
    basis,
    assumedGrowthPct: round(g * 100, 1),
    note: SIMPLE_DCF_NOTE,
  };
}

/**
 * 多期财务时序 → 大师因子。纯函数。
 * 关键：水平/趋势类因子只取「年报」子序列——季报的 ROE/利润率绝对值与年报不可比
 * （Q1 的 ROE 天然远低于全年），混入会污染同口径比较。见蓝图 §3.2。
 */
export function computeFactors(history: FinancialHistory): MasterFactors {
  const annual = history.snapshots.filter((s) => s.reportType === '年报'); // 源已 latest-first
  const annualPeriods = annual.length;
  if (annualPeriods < MIN_ANNUAL_PERIODS) {
    // 非 A 股（snapshots:[]）/ 新上市 / 年报不足 → 大师完全回退单期快照行为
    return { available: false, annualPeriods };
  }

  return {
    available: true,
    asOf: annual[0].reportDate,
    annualPeriods,
    roeConsistency: computeRoeConsistency(annual),
    marginTrend: computeMarginTrend(annual),
    debtTrend: computeDebtTrend(annual),
    growthStability: computeGrowthStability(annual),
    simpleDcf: computeSimpleDcf(annual),
  };
}
