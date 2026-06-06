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

import { boll, obv, vwap } from "./indicators";

describe("boll", () => {
  it("中轨 = SMA，上下轨 = 中轨 ± k×std", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const { mid, upper, lower } = boll(closes, 20, 2);
    expect(mid[19]).not.toBeNull();
    // 等差数列：std 可手算；20 项 [1..20] 的样本 std ≈ 5.766
    expect((upper[19] as number) - (mid[19] as number)).toBeCloseTo(2 * 5.766, 1);
    expect((mid[19] as number) - (lower[19] as number)).toBeCloseTo(2 * 5.766, 1);
  });
});

describe("obv", () => {
  it("收盘上涨日累加成交量，下跌日扣减", () => {
    const closes = [10, 11, 10, 12];
    const volumes = [100, 200, 150, 300];
    expect(obv(closes, volumes)).toEqual([100, 300, 150, 450]);
  });
});

describe("vwap", () => {
  it("VWAP = Σ(typPrice × vol) / Σvol", () => {
    const highs = [10, 12], lows = [8, 10], closes = [9, 11], volumes = [100, 200];
    const out = vwap(highs, lows, closes, volumes);
    // typ[0]=9, typ[1]=11；vwap[0]=9；vwap[1]=(9*100+11*200)/300=10.333
    expect(out[0]).toBeCloseTo(9, 5);
    expect(out[1]).toBeCloseTo(10.333, 3);
  });
});

describe("边界与异常输入", () => {
  it("sma：空数组→空、period<=0→全 null、单值 period1→该值", () => {
    expect(sma([], 5)).toEqual([]);
    expect(sma([1, 2, 3], 0)).toEqual([null, null, null]);
    expect(sma([5], 1)).toEqual([5]);
  });

  it("ema：空数组→空、不足周期→全 null", () => {
    expect(ema([], 5)).toEqual([]);
    expect(ema([1, 2], 5)).toEqual([null, null]);
  });

  it("rsi：长度≤period→全 null、无跌幅→100", () => {
    expect(rsi([1, 2, 3], 14)).toEqual([null, null, null]);
    // 严格递增 → 平均跌幅为 0 → RSI 饱和 100
    expect(rsi([1, 2, 3, 4, 5], 2).at(-1)).toBe(100);
  });

  it("macd / kdj：空输入→各序列为空", () => {
    expect(macd([])).toEqual({ dif: [], dea: [], hist: [] });
    expect(kdj([], [], [])).toEqual({ k: [], d: [], j: [] });
  });

  it("boll：空→空、不足周期→全 null", () => {
    expect(boll([], 20)).toEqual({ mid: [], upper: [], lower: [] });
    expect(boll([1, 2, 3], 20)).toEqual({ mid: [null, null, null], upper: [null, null, null], lower: [null, null, null] });
  });

  it("obv：空→空、单值→首日成交量、平盘不增减", () => {
    expect(obv([], [])).toEqual([]);
    expect(obv([5], [100])).toEqual([100]);
    expect(obv([5, 5], [100, 200])).toEqual([100, 100]); // 平盘 sign=0
  });

  it("vwap：空→空、零成交量→退化为典型价", () => {
    expect(vwap([], [], [], [])).toEqual([]);
    expect(vwap([10], [10], [10], [0])).toEqual([10]); // vSum=0 → typ 兜底
  });
});
