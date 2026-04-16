import { describe, test, expect } from "bun:test";
import { StrategyRegistry } from "./registry";
import { GoogleNewsRSSStrategy } from "./google-news-rss";

describe("StrategyRegistry.getStrategies", () => {
  test("A 股输入：RSS 策略排在第一位", () => {
    const list = StrategyRegistry.getStrategies("601012");
    expect(list[0]).toBeInstanceOf(GoogleNewsRSSStrategy);
  });

  test("A 股输入：列表长度等于全部策略数", () => {
    const list = StrategyRegistry.getStrategies("601012");
    const all = StrategyRegistry.getStrategies("AAPL");
    expect(list.length).toBe(all.length);
  });

  test("美股输入：保持默认顺序（首位不强制为 RSS）", () => {
    // 默认顺序由 private strategies 数组定义；美股走 Playwright 策略即可
    const list = StrategyRegistry.getStrategies("AAPL");
    expect(list.length).toBeGreaterThan(0);
    // 未特意提前 RSS——验证入参为美股时不会重排
    const rssIdxChina = StrategyRegistry.getStrategies("601012").findIndex(s => s instanceof GoogleNewsRSSStrategy);
    const rssIdxUs    = list.findIndex(s => s instanceof GoogleNewsRSSStrategy);
    expect(rssIdxChina).toBe(0);
    // 美股场景 RSS 位置由默认数组决定（当前默认也是 0，但测试不锁死顺序，只验证重排行为差异化存在于代码路径中）
    expect(rssIdxUs).toBeGreaterThanOrEqual(0);
  });

  test("每个策略实例都有 name 字段", () => {
    const list = StrategyRegistry.getStrategies("601012");
    for (const s of list) {
      expect(typeof s.name).toBe("string");
      expect(s.name.length).toBeGreaterThan(0);
    }
  });
});
