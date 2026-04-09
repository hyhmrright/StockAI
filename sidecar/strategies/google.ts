import { StockNews } from '../types';
import { ScrapeStrategy } from './base';
import { parseGoogleNews } from './parsers';
import { detectChinaStock } from './exchange';

/**
 * Google Finance 抓取策略
 */
export class GoogleStrategy extends ScrapeStrategy {
  name = "Google Finance";

  protected getUrl(symbol: string): string {
    const china = detectChinaStock(symbol);
    
    // 构造 Google Finance 的 Ticker:
    // 1. 如果检测到 A 股代码，加上 SHA/SZE 后缀
    // 2. 如果是纯英文/数字（通常是美股代码），默认加上 NASDAQ 后缀提高准确度
    // 3. 否则（如中文名）直接搜索
    let ticker = symbol;
    if (china) {
      ticker = `${china.code}:${china.googleSuffix}`;
    } else if (/^[A-Za-z0-9]+$/.test(symbol)) {
      ticker = `${symbol}:NASDAQ`;
    }
    
    return `https://www.google.com/finance/quote/${ticker}`;
  }

  protected async parse(html: string): Promise<StockNews[]> {
    return await parseGoogleNews(html);
  }

  protected override getWaitUntil(): 'networkidle' {
    return 'networkidle';
  }
}
