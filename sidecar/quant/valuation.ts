import type { FinancialMetrics } from './types';
import type { ValuationSnapshot } from '../../shared/types';
import { RISK_FREE_RATE } from '../../shared/constants';

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
    signal = marginOfSafety > 0.15 ? 'undervalued' : marginOfSafety < -0.15 ? 'overvalued' : 'fair';
  } else if (rel) {
    signal = rel.signal.includes('低估') ? 'undervalued' : rel.signal.includes('高估') ? 'overvalued' : 'fair';
  }

  // 置信度：每个绝对估值模型贡献30分，相对估值补充20分
  const confidence = Math.min(100, values.length * 30 + (rel ? 20 : 0));

  return { intrinsicValue, marketCap, marginOfSafety, signal, confidence, models };
}

function computeOwnerEarnings(m: FinancialMetrics): { value: number; details: string } | undefined {
  const netIncome = m.netIncome;
  const depreciation = m.depreciation ?? 0;
  const capex = m.capitalExpenditure ? Math.abs(m.capitalExpenditure) : null;

  if (netIncome == null || capex == null) return undefined;
  if (netIncome <= 0) return undefined;

  // 维护性资本支出约占总资本支出的85%，成长性资本支出15%
  const maintenanceCapex = capex * 0.85;
  const ownerEarnings = netIncome + depreciation - maintenanceCapex;
  if (ownerEarnings <= 0) return undefined;

  // 成长率：营收增速打七折，上限8%
  const growthRate = Math.min((m.revenueGrowth ?? 5) / 100, 0.08) * 0.7;
  const discountRate = 0.10;
  const terminalGrowth = 0.025;

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

  // 整体打85折（质量折扣）
  const value = pv * 0.85;
  return {
    value,
    details: `Owner Earnings: ${(ownerEarnings / 1e8).toFixed(0)}亿, 增长率: ${(growthRate * 100).toFixed(1)}%`,
  };
}

function computeWACC(m: FinancialMetrics): number {
  const riskFreeRate = RISK_FREE_RATE;
  const marketPremium = 0.06;
  // beta 默认1.0（市场平均）
  const costOfEquity = riskFreeRate + 1.0 * marketPremium;

  const marketCap = m.marketCap ?? 0;
  const netDebt = Math.max((m.totalDebt ?? 0) - (m.cash ?? 0), 0);
  const totalValue = marketCap + netDebt;

  if (totalValue <= 0) return costOfEquity;

  // 实际负债成本：利息支出/有息负债；无数据时用无风险+3%
  const costOfDebt = m.interestExpense && m.totalDebt && m.totalDebt > 0
    ? Math.abs(m.interestExpense) / m.totalDebt
    : riskFreeRate + 0.03;

  const wE = marketCap / totalValue;
  const wD = netDebt / totalValue;
  // 税盾按25%有效税率
  const wacc = wE * costOfEquity + wD * costOfDebt * 0.75;

  // WACC 合理区间 6%～20%
  return Math.max(0.06, Math.min(0.20, wacc));
}

function computeDCF(m: FinancialMetrics): { base: number; bear: number; bull: number; wacc: number } | undefined {
  const rawFcf = m.freeCashFlow;
  if (!rawFcf || rawFcf <= 0) return undefined;
  // 将已验证的非空 FCF 绑定为明确类型，供闭包安全引用
  const fcf: number = rawFcf;

  const wacc = computeWACC(m);
  const baseGrowth = Math.min((m.revenueGrowth ?? 5) / 100, 0.15);

  function dcfValue(growthAdj: number, waccAdj: number): number {
    const g = baseGrowth * growthAdj;
    const w = wacc * waccAdj;
    const termG = Math.min(0.03, g * 0.4);
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

    return pv * 0.9; // 10%质量折扣
  }

  return {
    bear: dcfValue(0.5, 1.2),
    base: dcfValue(1.0, 1.0),
    bull: dcfValue(1.5, 0.9),
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

