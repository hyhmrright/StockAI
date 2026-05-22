import { describe, it, expect } from "vitest";
import { sma, ema } from "./indicators";

describe("sma", () => {
  it("窗口 3 在数据 [1..5] 上正确滑动", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it("数据不足窗口长度 → 全部为 null", () => {
    expect(sma([1, 2], 5)).toEqual([null, null]);
  });

  it("空数组 → 空数组", () => {
    expect(sma([], 5)).toEqual([]);
  });
});

describe("ema", () => {
  it("第一个有效值等于前 N 个平均", () => {
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeCloseTo(2, 5); // 起步用 SMA(1,2,3)
  });

  it("EMA 公式 alpha = 2/(N+1)", () => {
    const out = ema([1, 2, 3, 4, 5], 3);
    // EMA[3] = SMA(1..3) * (1-alpha) + 4 * alpha; alpha=0.5
    expect(out[3]).toBeCloseTo(2 * 0.5 + 4 * 0.5, 5);
  });
});
