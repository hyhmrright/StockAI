import { Page } from 'playwright-core';
import { StockNews } from '../types';
import { ScrapeStrategy } from './base';
import { parseGoogleNews } from './parsers';

/**
 * Google Finance 抓取策略
 */
export class GoogleStrategy implements ScrapeStrategy {
  name = "Google Finance";

  canHandle(url: string): boolean {
    return url.includes("google.com/finance");
  }

  async scrape(page: Page, symbol: string): Promise<StockNews[]> {
    console.error(`正在通过 Google Finance 策略抓取 ${symbol}...`);
    const googleUrl = `https://www.google.com/finance/quote/${symbol}:NASDAQ`;
    
    try {
      await page.goto(googleUrl, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1000); 

      // 获取完整 HTML 并交由解耦的解析器处理
      const html = await page.content();
      return await parseGoogleNews(html);
    } catch (error) {
      console.error(`Google Finance 抓取异常:`, error);
      return [];
    }
  }
}
