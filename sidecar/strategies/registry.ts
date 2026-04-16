import type { ScrapeStrategy } from './base';
import { GoogleNewsSearchStrategy } from './google-news';
import { GoogleStrategy } from './google';
import { YahooStrategy } from './yahoo';
import { GoogleNewsRSSStrategy } from './google-news-rss';
import { parseSymbol } from '../parsers/exchange';

/**
 * 抓取策略注册中心——只负责"哪些策略适用、按什么顺序"。
 */
export class StrategyRegistry {
  private static strategies: ScrapeStrategy[] = [
    new GoogleNewsRSSStrategy(),
    new GoogleNewsSearchStrategy(),
    new GoogleStrategy(),
    new YahooStrategy(),
  ];

  /**
   * 获取适用于该股票的所有可用策略，并按优先级排序。
   * A 股优先尝试 RSS（避开 reCAPTCHA）。
   */
  static getStrategies(symbol: string): ScrapeStrategy[] {
    const parsed = parseSymbol(symbol);

    if (parsed.chinaInfo) {
      const rss = this.strategies.find(s => s instanceof GoogleNewsRSSStrategy)!;
      const rest = this.strategies.filter(s => !(s instanceof GoogleNewsRSSStrategy));
      return [rss, ...rest];
    }

    return this.strategies;
  }
}
