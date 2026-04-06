import { Page } from 'playwright-core';
import { StockNews } from '../types';
import { ScrapeStrategy } from './base';
import { parseYahooNews } from './parsers';

/**
 * Yahoo Finance 抓取策略
 */
export class YahooStrategy implements ScrapeStrategy {
  name = "Yahoo Finance";

  canHandle(url: string): boolean {
    return url.includes("finance.yahoo.com");
  }

  async scrape(page: Page, symbol: string): Promise<StockNews[]> {
    console.error(`正在通过 Yahoo Finance 策略抓取 ${symbol}...`);
    const yahooUrl = `https://finance.yahoo.com/quote/${symbol}`;
    
    try {
      await page.goto(yahooUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1000);

      // 获取完整 HTML 并交由解耦的解析器处理
      const html = await page.content();
      return await parseYahooNews(html);
    } catch (error) {
      console.error(`Yahoo Finance 抓取异常:`, error);
      return [];
    }
  }
}
