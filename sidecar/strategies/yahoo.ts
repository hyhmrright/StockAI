import type { StockNews } from '../../shared/types';
import { PlaywrightStrategy } from './base';
import { parseYahooNews } from '../parsers/html';
import { detectChinaStock } from '../parsers/exchange';

/**
 * Yahoo Finance 抓取策略
 */
export class YahooStrategy extends PlaywrightStrategy {
  readonly name = "Yahoo Finance";

  protected getUrl(symbol: string): string {
    const china = detectChinaStock(symbol);
    const yahooSymbol = china ? `${china.code}${china.yahooSuffix}` : symbol;
    return `https://finance.yahoo.com/quote/${yahooSymbol}`;
  }

  protected async parse(html: string): Promise<StockNews[]> {
    return await parseYahooNews(html);
  }
}
