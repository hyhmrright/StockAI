import type { RiskSnapshot, PositionGuidance, VolatilityRange } from '../../shared/types';

/**
 * 波动率目标法（volatility targeting）参数：
 * 当年化波动率等于 TARGET_VOL 时，建议单股仓位上限为 BASE_POSITION；
 * 波动越大、建议仓位越低（成反比），并夹在 [FLOOR, CAP] 之间。
 * 对标 ai-hedge-fund 的 risk_manager（波动率→仓位约束），但只给「上限参考」不给应买量。
 */
const BASE_POSITION = 0.2; // 锚点仓位 20%
const TARGET_VOL = 0.3; // 锚点年化波动率 30%（A 股个股的「正常」量级）
const FLOOR = 0.05; // 下限 5%（再高波动也保留小仓试探）
const CAP = 0.25; // 上限 25%（再低波动也不建议单股过度集中）

/**
 * 由风险快照推导建议单股仓位上限。
 * 缺风险数据或波动率非正时返回 null（调用方据此不渲染该行，而非崩溃）。
 */
export function computePositionGuidance(
  risk: RiskSnapshot | null | undefined,
): PositionGuidance | null {
  if (!risk || !(risk.annualizedVolatility > 0)) return null;
  const raw = BASE_POSITION * (TARGET_VOL / risk.annualizedVolatility);
  const clamped = Math.max(FLOOR, Math.min(CAP, raw));
  return {
    maxPositionPct: Math.round(clamped * 100),
    riskLevel: risk.riskLevel,
    annualizedVolatility: risk.annualizedVolatility,
  };
}

// 95% 置信区间的正态分位数，用于把年化波动率折算成区间宽度
const Z_95 = 1.96;
// 区间时间跨度：半年（年化 σ 按 √t 缩放）
const HORIZON_YEARS = 0.5;

/**
 * 把年化波动率翻译成「未来半年约 95% 概率落在 -X%~+Y%」（对标 Nitrogen Risk Number）。
 * 用 ±1.96σ√t 的正态近似；下行按最大亏损 -100% 夹紧。仅统计估算，非保证区间。
 */
export function computeVolatilityRange(
  risk: RiskSnapshot | null | undefined,
): VolatilityRange | null {
  if (!risk || !(risk.annualizedVolatility > 0)) return null;
  const halfWidthPct = Z_95 * risk.annualizedVolatility * Math.sqrt(HORIZON_YEARS) * 100;
  const rounded = Math.round(halfWidthPct * 10) / 10;
  return {
    downside: Math.max(-100, -rounded),
    upside: rounded,
    confidence: 95,
    periodMonths: 12 * HORIZON_YEARS,
  };
}
