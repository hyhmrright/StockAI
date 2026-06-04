import type { FinancialMetrics } from './types';
import type { ValuationSnapshot } from '../../shared/types';
import { RISK_FREE_RATE } from '../../shared/constants';

// 估值模型假设集中显式化，便于审计与调参（原散落各函数内联）
const MOS_BAND = 0.15; // |安全边际| 超过此值判低估/高估
const MODEL_CONFIDENCE = { absolute: 30, relative: 20 } as const; // 各模型对置信度贡献
const OWNER_EARNINGS = {
  maintenanceCapexRatio: 0.85, // 维护性 capex 占总 capex
  growthScale: 0.7, // 营收增速折扣
  growthCap: 0.08, // 成长率上限
  discountRate: 0.10,
  terminalGrowth: 0.025,
  qualityDiscount: 0.85, // 整体质量折扣
} as const;
const WACC_PARAMS = {
  marketPremium: 0.06,
  beta: 1.0,
  debtCostFallback: 0.03, // 无利息数据时 = riskFree + 此值
  taxShieldRetention: 0.75, // 1 - 25% 有效税率
  min: 0.06,
  max: 0.20,
} as const;
const DCF = {
  growthCap: 0.15,
  qualityDiscount: 0.9,
  terminalGrowthCap: 0.03,
  terminalGrowthScale: 0.4,
  scenarios: {
    bear: { growthAdj: 0.5, waccAdj: 1.2 },
    base: { growthAdj: 1.0, waccAdj: 1.0 },
    bull: { growthAdj: 1.5, waccAdj: 0.9 },
  },
} as const;

export function computeValuation(metrics: FinancialMetrics): ValuationSnapshot | null {
  const models: ValuationSnapshot['models'] = {};
  const values: number[] = [];

  // 模型1：Owner Earnings（巴菲特真实盈利法）
  const oe = computeOwnerEarnings(metrics);
  if (oe) { models.ownerEarnings = oe; values.push(oe.value); }

  // 模型2：DCF 三情景
  const dcf = computeDCF(metrics);
  if (dcf) { models.dcf = dcf; values.push(dcf.base); }

  // 模型3：相对估值（PE/PB）
  const rel = computeRelativeValuation(metrics);
  if (rel) { models.relative = rel; }

  if (values.length === 0 && !rel) return null;

  // 可用模型等权平均内在价值
  const intrinsicValue = values.length > 0
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;

  const marketCap = metrics.marketCap ?? null;
  let marginOfSafety: number | null = null;
  let signal: 'undervalued' | 'overvalued' | 'fair' = 'fair';

  if (intrinsicValue && marketCap && marketCap > 0) {
    marginOfSafety = (intrinsicValue - marketCap) / marketCap;
    signal = marginOfSafety > MOS_BAND ? 'undervalued' : marginOfSafety < -MOS_BAND ? 'overvalued' : 'fair';
  } else if (rel) {
    signal = rel.signal.includes('低估') ? 'undervalued' : rel.signal.includes('高估') ? 'overvalued' : 'fair';
  }

  // 置信度：每个绝对估值模型贡献固定分，相对估值补充
  const confidence = Math.min(100, values.length * MODEL_CONFIDENCE.absolute + (rel ? MODEL_CONFIDENCE.relative : 0));

  return { intrinsicValue, marketCap, marginOfSafety, signal, confidence, models };
}

function computeOwnerEarnings(m: FinancialMetrics): { value: number; details: string } | undefined {
  const netIncome = m.netIncome;
  const depreciation = m.depreciation ?? 0;
  const capex = m.capitalExpenditure ? Math.abs(m.capitalExpenditure) : null;

  if (netIncome == null || capex == null) return undefined;
  if (netIncome <= 0) return undefined;

  // 维护性资本支出约占总资本支出，剩余为成长性
  const maintenanceCapex = capex * OWNER_EARNINGS.maintenanceCapexRatio;
  const ownerEarnings = netIncome + depreciation - maintenanceCapex;
  if (ownerEarnings <= 0) return undefined;

  // 成长率：营收增速打折，封顶
  const growthRate = Math.min((m.revenueGrowth ?? 5) / 100, OWNER_EARNINGS.growthCap) * OWNER_EARNINGS.growthScale;
  const discountRate = OWNER_EARNINGS.discountRate;
  const terminalGrowth = OWNER_EARNINGS.terminalGrowth;

  // 第一阶段：高成长期5年
  let pv = 0;
  for (let y = 1; y <= 5; y++) {
    pv += ownerEarnings * (1 + growthRate) ** y / (1 + discountRate) ** y;
  }

  // 第二阶段：过渡期5年（成长率减半）
  const transGrowth = growthRate / 2;
  const stage1Final = ownerEarnings * (1 + growthRate) ** 5;
  for (let y = 1; y <= 5; y++) {
    pv += stage1Final * (1 + transGrowth) ** y / (1 + discountRate) ** (5 + y);
  }

  // 永续价值
  const finalEarnings = stage1Final * (1 + transGrowth) ** 5;
  const terminalValue = finalEarnings * (1 + terminalGrowth) / (discountRate - terminalGrowth);
  pv += terminalValue / (1 + discountRate) ** 10;

  // 整体质量折扣
  const value = pv * OWNER_EARNINGS.qualityDiscount;
  return {
    value,
    details: `Owner Earnings: ${(ownerEarnings / 1e8).toFixed(0)}亿, 增长率: ${(growthRate * 100).toFixed(1)}%`,
  };
}

function computeWACC(m: FinancialMetrics): number {
  const riskFreeRate = RISK_FREE_RATE;
  const marketPremium = WACC_PARAMS.marketPremium;
  // beta 默认市场平均
  const costOfEquity = riskFreeRate + WACC_PARAMS.beta * marketPremium;

  const marketCap = m.marketCap ?? 0;
  const netDebt = Math.max((m.totalDebt ?? 0) - (m.cash ?? 0), 0);
  const totalValue = marketCap + netDebt;

  if (totalValue <= 0) return costOfEquity;

  // 实际负债成本：利息支出/有息负债；无数据时用无风险+3%
  const costOfDebt = m.interestExpense && m.totalDebt && m.totalDebt > 0
    ? Math.abs(m.interestExpense) / m.totalDebt
    : riskFreeRate + WACC_PARAMS.debtCostFallback;

  const wE = marketCap / totalValue;
  const wD = netDebt / totalValue;
  // 债务成本计入税盾（保留比例 = 1 - 有效税率）
  const wacc = wE * costOfEquity + wD * costOfDebt * WACC_PARAMS.taxShieldRetention;

  // WACC 夹在合理区间
  return Math.max(WACC_PARAMS.min, Math.min(WACC_PARAMS.max, wacc));
}

function computeDCF(m: FinancialMetrics): { base: number; bear: number; bull: number; wacc: number } | undefined {
  const rawFcf = m.freeCashFlow;
  if (!rawFcf || rawFcf <= 0) return undefined;
  // 将已验证的非空 FCF 绑定为明确类型，供闭包安全引用
  const fcf: number = rawFcf;

  const wacc = computeWACC(m);
  const baseGrowth = Math.min((m.revenueGrowth ?? 5) / 100, DCF.growthCap);

  function dcfValue(growthAdj: number, waccAdj: number): number {
    const g = baseGrowth * growthAdj;
    const w = wacc * waccAdj;
    const termG = Math.min(DCF.terminalGrowthCap, g * DCF.terminalGrowthScale);
    let pv = 0;

    // 高速成长期3年
    for (let y = 1; y <= 3; y++) pv += fcf * (1 + g) ** y / (1 + w) ** y;

    // 过渡期4年
    const transG = (g + termG) / 2;
    const stage1 = fcf * (1 + g) ** 3;
    for (let y = 1; y <= 4; y++) pv += stage1 * (1 + transG) ** y / (1 + w) ** (3 + y);

    // 永续价值（WACC须大于终值增速）
    const finalFCF = stage1 * (1 + transG) ** 4;
    if (w <= termG) return pv;
    pv += finalFCF * (1 + termG) / (w - termG) / (1 + w) ** 7;

    return pv * DCF.qualityDiscount;
  }

  return {
    bear: dcfValue(DCF.scenarios.bear.growthAdj, DCF.scenarios.bear.waccAdj),
    base: dcfValue(DCF.scenarios.base.growthAdj, DCF.scenarios.base.waccAdj),
    bull: dcfValue(DCF.scenarios.bull.growthAdj, DCF.scenarios.bull.waccAdj),
    wacc: Math.round(wacc * 1000) / 1000,
  };
}

function computeRelativeValuation(m: FinancialMetrics): { signal: string; details: string } | undefined {
  const signals: string[] = [];

  if (m.pe != null) {
    if (m.pe < 15) signals.push('PE偏低（<15），可能低估');
    else if (m.pe > 40) signals.push('PE偏高（>40），可能高估');
    else signals.push(`PE=${m.pe}，估值适中`);
  }

  if (m.pb != null) {
    if (m.pb < 1.5) signals.push('PB偏低（<1.5），可能低估');
    else if (m.pb > 5) signals.push('PB偏高（>5），可能高估');
    else signals.push(`PB=${m.pb}，估值适中`);
  }

  if (signals.length === 0) return undefined;

  const hasLow = signals.some(s => s.includes('低估'));
  const hasHigh = signals.some(s => s.includes('高估'));
  const signal = hasLow && !hasHigh ? '相对低估' : hasHigh && !hasLow ? '相对高估' : '估值适中';

  return { signal, details: signals.join('; ') };
}

