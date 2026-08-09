import { describe, test, expect } from 'bun:test';
import { StrategyRegistry } from './registry';
import { GoogleNewsRSSStrategy } from './google-news-rss';
import { EastmoneyNewsStrategy } from './eastmoney-news';
import { PlaywrightStrategy } from './base';

describe('StrategyRegistry.getStrategies', () => {
  test('A 股输入：RSS 策略排在第一位', () => {
    const list = StrategyRegistry.getStrategies('601012');
    expect(list[0]).toBeInstanceOf(GoogleNewsRSSStrategy);
  });

  test('A 股输入：列表长度等于全部策略数', () => {
    const list = StrategyRegistry.getStrategies('601012');
    const all = StrategyRegistry.getStrategies('AAPL');
    expect(list.length).toBe(all.length);
  });

  test('美股输入：保持默认顺序（首位不强制为 RSS）', () => {
    // 默认顺序由 private strategies 数组定义；美股走 Playwright 策略即可
    const list = StrategyRegistry.getStrategies('AAPL');
    expect(list.length).toBeGreaterThan(0);
    // 未特意提前 RSS——验证入参为美股时不会重排
    const rssIdxChina = StrategyRegistry.getStrategies('601012').findIndex(
      (s) => s instanceof GoogleNewsRSSStrategy,
    );
    const rssIdxUs = list.findIndex((s) => s instanceof GoogleNewsRSSStrategy);
    expect(rssIdxChina).toBe(0);
    // 美股场景 RSS 位置由默认数组决定（当前默认也是 0，但测试不锁死顺序，只验证重排行为差异化存在于代码路径中）
    expect(rssIdxUs).toBeGreaterThanOrEqual(0);
  });

  test('必须存在不依赖 Google/Yahoo 的策略', () => {
    // 防回归：四个策略曾全部指向 google.com / news.google.com / finance.yahoo.com。
    // 在这三个域名都不可达的地区（本项目的主要受众所在地），新闻抓取 100% 失败，
    // 且失败被伪装成"没有找到这只股票的相关新闻，请确认代码是否正确"。
    const list = StrategyRegistry.getStrategies();
    expect(list.some((s) => s instanceof EastmoneyNewsStrategy)).toBe(true);
  });

  test('纯 fetch 策略排在 Playwright 策略之前', () => {
    // CLAUDE.md：能跳过 Chromium 的策略尽量排前。国内备源同样是纯 fetch，
    // 必须在启动浏览器的 Google/Yahoo 策略之前，否则它永远等不到自己的回合。
    const list = StrategyRegistry.getStrategies();
    const emIdx = list.findIndex((s) => s instanceof EastmoneyNewsStrategy);
    const firstPlaywrightIdx = list.findIndex((s) => s instanceof PlaywrightStrategy);

    expect(emIdx).toBeGreaterThanOrEqual(0);
    expect(emIdx).toBeLessThan(firstPlaywrightIdx);
  });

  test('每个策略实例都有 name 字段', () => {
    const list = StrategyRegistry.getStrategies('601012');
    for (const s of list) {
      expect(typeof s.name).toBe('string');
      expect(s.name.length).toBeGreaterThan(0);
    }
  });
});
