import { describe, it, expect } from "vitest";
import { computePositionGuidance } from "./positionSizing";
import type { RiskSnapshot } from "../../shared/types";

// 测试构造助手：只关心波动率与档位，其余字段填默认
function risk(over: Partial<RiskSnapshot>): RiskSnapshot {
  return {
    annualizedVolatility: 0.3,
    volatilityPercentile: 50,
    maxDrawdown: -0.2,
    sharpeProxy: 1,
    riskLevel: "medium",
    ...over,
  };
}

describe("computePositionGuidance", () => {
  it("缺风险数据时返回 null", () => {
    expect(computePositionGuidance(null)).toBeNull();
    expect(computePositionGuidance(undefined)).toBeNull();
  });

  it("波动率非正时返回 null（避免除零）", () => {
    expect(computePositionGuidance(risk({ annualizedVolatility: 0 }))).toBeNull();
    expect(computePositionGuidance(risk({ annualizedVolatility: -0.1 }))).toBeNull();
  });

  it("锚点波动率(30%)给出基准仓位 20%", () => {
    expect(computePositionGuidance(risk({ annualizedVolatility: 0.3 }))?.maxPositionPct).toBe(20);
  });

  it("低波动放大仓位但夹在上限 25%", () => {
    // 0.2 * 0.3/0.15 = 0.4 → CAP 0.25
    expect(computePositionGuidance(risk({ annualizedVolatility: 0.15 }))?.maxPositionPct).toBe(25);
  });

  it("高波动收缩仓位（成反比）", () => {
    // 0.2 * 0.3/0.6 = 0.1
    expect(computePositionGuidance(risk({ annualizedVolatility: 0.6 }))?.maxPositionPct).toBe(10);
  });

  it("极高波动夹在下限 5%", () => {
    // 0.2 * 0.3/2.0 = 0.03 → FLOOR 0.05
    expect(computePositionGuidance(risk({ annualizedVolatility: 2.0 }))?.maxPositionPct).toBe(5);
  });

  it("透传 riskLevel 与 annualizedVolatility", () => {
    const g = computePositionGuidance(risk({ annualizedVolatility: 0.45, riskLevel: "high" }));
    expect(g?.riskLevel).toBe("high");
    expect(g?.annualizedVolatility).toBe(0.45);
  });
});
