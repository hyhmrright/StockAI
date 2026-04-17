import type { ScrapeStrategy } from './base';
import { GoogleNewsSearchStrategy } from './google-news';
import { GoogleStrategy } from './google';
import { YahooStrategy } from './yahoo';
import { GoogleNewsRSSStrategy } from './google-news-rss';

/**
 * 抓取策略注册中心——只负责"哪些策略适用、按什么顺序"。
 * RSS 优先排在第一位，天然覆盖 A 股（避开 reCAPTCHA），对美股同样适用。
 */
export class StrategyRegistry {
  private static strategies: ScrapeStrategy[] = [
    new GoogleNewsRSSStrategy(),
    new GoogleNewsSearchStrategy(),
    new GoogleStrategy(),
    new YahooStrategy(),
  ];

  static getStrategies(): ScrapeStrategy[] {
    return this.strategies;
  }
}
