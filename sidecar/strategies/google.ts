import { Page } from 'playwright-core';
import { StockNews } from '../types';
import { ScrapeStrategy } from './base';
import { extractLinks } from './utils';

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

      // 使用助手函数提取链接
      const links = await extractLinks(
        page, 
        'a[href*="/news/"]', 
        '/news/', 
        'https://www.google.com'
      );

      // 映射为 StockNews 格式，并限制数量
      return links
        .filter(link => link.lines.length >= 2)
        .slice(0, 5)
        .map(link => ({
          title: link.lines.find(l => l.length > 20) || link.lines[1], // 较长的行通常是标题
          source: link.lines[0],
          date: link.lines[link.lines.length - 1],
          content: "",
          url: link.url
        }));
    } catch (error) {
      console.error(`Google Finance 抓取异常:`, error);
      return [];
    }
  }
}
