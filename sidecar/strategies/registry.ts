import { ScrapeStrategy } from './base';
import { GoogleNewsSearchStrategy } from './google-news';
import { GoogleStrategy } from './google';
import { YahooStrategy } from './yahoo';
import { GoogleNewsRSSStrategy } from './google-news-rss';
import { parseSymbol } from '../parsers/exchange';
import { fetchStockInfo } from '../stock-info';

/**
 * 抓取策略注册中心
 */
export class StrategyRegistry {
  private static strategies: ScrapeStrategy[] = [
    new GoogleNewsRSSStrategy(),
    new GoogleNewsSearchStrategy(),
    new GoogleStrategy(),
    new YahooStrategy()
  ];

  /**
   * 获取增强后的搜索关键词。
   * 对于 A 股纯代码输入，尝试获取其公司名以提升新闻命中率。
   */
  static async getEnhancedSymbol(symbol: string): Promise<string> {
    const parsed = parseSymbol(symbol);
    
    // A 股纯代码输入：补充中文名
    if (parsed.chinaInfo && !parsed.displayName) {
      try {
        const info = await fetchStockInfo(parsed);
        if (info?.name) return `${info.name}${parsed.chinaInfo.code}`;
      } catch {
        // 忽略获取失败，回退到原始输入
      }
    }
    
    return symbol;
  }

  /**
   * 获取适用于该股票的所有可用策略，并按优先级排序。
   */
  static getStrategies(symbol: string): ScrapeStrategy[] {
    const parsed = parseSymbol(symbol);
    
    if (parsed.chinaInfo) {
      return [
        this.strategies.find(s => s instanceof GoogleNewsRSSStrategy)!,
        ...this.strategies.filter(s => !(s instanceof GoogleNewsRSSStrategy))
      ];
    }

    return this.strategies;
  }
}
