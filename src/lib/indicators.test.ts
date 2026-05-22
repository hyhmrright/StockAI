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

import { macd, rsi, kdj } from "./indicators";

describe("macd", () => {
  it("DIF = EMA12 - EMA26，DEA = EMA9(DIF)", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5);
    const { dif, dea, hist } = macd(closes, 12, 26, 9);
    expect(dif).toHaveLength(60);
    expect(dea).toHaveLength(60);
    expect(hist).toHaveLength(60);
    // 前 25 根没有 EMA26 → DIF 必为 null
    expect(dif[24]).toBeNull();
    expect(dif[25]).not.toBeNull();
    // DEA 又要 EMA9 → 至少 25+8=33 之后有值
    expect(dea[33]).not.toBeNull();
    // hist = (dif - dea) * 2
    const i = 40;
    expect(hist[i]).toBeCloseTo(((dif[i] as number) - (dea[i] as number)) * 2, 5);
  });
});

describe("rsi", () => {
  it("全部上涨 → RSI 接近 100", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const out = rsi(closes, 14);
    expect(out[19]).toBeGreaterThan(99);
  });
  it("全部下跌 → RSI 接近 0", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 - i);
    const out = rsi(closes, 14);
    expect(out[19]).toBeLessThan(1);
  });
});

describe("kdj", () => {
  it("返回与输入等长的 K / D / J", () => {
    const highs  = Array.from({ length: 30 }, (_, i) => 110 + i);
    const lows   = Array.from({ length: 30 }, (_, i) => 100 + i);
    const closes = Array.from({ length: 30 }, (_, i) => 105 + i);
    const { k, d, j } = kdj(highs, lows, closes, 9, 3, 3);
    expect(k).toHaveLength(30);
    expect(d).toHaveLength(30);
    expect(j).toHaveLength(30);
    // 前 8 根 RSV 未形成 → K/D/J 为 null
    expect(k[7]).toBeNull();
    expect(k[8]).not.toBeNull();
  });
});
