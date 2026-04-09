import { Page } from 'playwright-core';
import { StockNews } from '../types';
import { ScrapeStrategy } from './base';
import { parseYahooNews } from './parsers';
import { detectChinaStock } from './exchange';
import { TIMEOUTS } from '../config';
import { toErrorMessage } from '../utils';

/**
 * Yahoo Finance 抓取策略
 */
export class YahooStrategy implements ScrapeStrategy {
  name = "Yahoo Finance";

  async scrape(page: Page, symbol: string): Promise<StockNews[]> {
    console.error(`正在通过 Yahoo Finance 策略抓取 ${symbol}...`);
    // A 股代码需要加交易所后缀（沪 .SS / 深 .SZ / 北 .BJ）
    const china = detectChinaStock(symbol);
    const yahooSymbol = china ? `${china.code}${china.yahooSuffix}` : symbol;
    const yahooUrl = `https://finance.yahoo.com/quote/${yahooSymbol}`;
    
    try {
      await page.goto(yahooUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.pageNavigation }).catch(() => {});
      await page.waitForTimeout(TIMEOUTS.pageWait);

      // 获取完整 HTML 并交由解耦的解析器处理
      const html = await page.content();
      return await parseYahooNews(html);
    } catch (error) {
      console.error(`Yahoo Finance 抓取异常 (${symbol}): ${toErrorMessage(error)}`);
      return [];
    }
  }
}
