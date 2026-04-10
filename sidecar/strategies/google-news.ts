import { StockNews } from '../types';
import { ScrapeStrategy } from './base';
import { parseSymbol } from './exchange';
import { parseGoogleNewsSearch } from './parsers';

/**
 * Google News 搜索策略
 * 通过搜索引擎 News tab 抓取新闻，适用于任何有名称/代码的股票
 */
export class GoogleNewsSearchStrategy extends ScrapeStrategy {
  name = "Google News Search";

  protected getUrl(symbol: string): string {
    const parsed = parseSymbol(symbol);
    let query: string;
    let lang: string;

    if (parsed.chinaInfo) {
      if (parsed.displayName) {
        // 有股票名称：精确匹配名称，命中率高
        query = `"${parsed.displayName}" 股票 新闻`;
      } else {
        // 纯代码输入：不加引号，允许宽松匹配
        // 中文财经新闻通常用股票名而非代码，加引号反而导致零结果
        query = `${parsed.chinaInfo.code} 股票 新闻`;
      }
      lang = 'zh-CN';
    } else {
      query = `"${symbol}" stock news`;
      lang = 'en';
    }

    return `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=nws&hl=${lang}`;
  }

  protected parse(html: string, symbol: string): StockNews[] {
    return parseGoogleNewsSearch(html, symbol);
  }

  protected override getWaitUntil(): 'networkidle' {
    return 'networkidle';
  }
}

