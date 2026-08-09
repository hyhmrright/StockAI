import type { ScrapeStrategy } from './base';
import { GoogleNewsSearchStrategy } from './google-news';
import { GoogleStrategy } from './google';
import { YahooStrategy } from './yahoo';
import { GoogleNewsRSSStrategy } from './google-news-rss';
import { EastmoneyNewsStrategy } from './eastmoney-news';

/**
 * 抓取策略注册中心——只负责"哪些策略适用、按什么顺序"。
 *
 * 两条排序依据：
 * 1. **纯 fetch 的排在 Playwright 之前**，省掉 1–3 秒的 Chromium 启动。
 * 2. **可达性**：RSS 命中质量最好（关键词直搜、来源多样），故仍居首；但它与其后两个
 *    Google 策略、Yahoo 策略共用一组域名，在这些域名不可达的地区会整组失败。东财资讯
 *    是唯一的域外备源，紧随 RSS——放在 Playwright 策略之后就等于永远轮不到：那三个
 *    策略每个都要启浏览器并跑满导航超时，60s 的 scrapeBudget 撑不到东财。
 */
export class StrategyRegistry {
  private static strategies: ScrapeStrategy[] = [
    new GoogleNewsRSSStrategy(),
    new EastmoneyNewsStrategy(),
    new GoogleNewsSearchStrategy(),
    new GoogleStrategy(),
    new YahooStrategy(),
  ];

  static getStrategies(): ScrapeStrategy[] {
    return [...this.strategies];
  }
}
