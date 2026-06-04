import type { RiskSnapshot, PositionGuidance } from "../../shared/types";

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
