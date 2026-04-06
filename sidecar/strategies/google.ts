import { Page } from 'playwright-core';
import { StockNews } from '../types';
import { ScrapeStrategy } from './base';

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
      await page.waitForTimeout(1000); // 增加等待时间

      const news: StockNews[] = [];
      const links = await page.locator('a[href*="/news/"]').all();
      const seenUrls = new Set<string>();

      for (const link of links) {
        const href = await link.getAttribute('href');
        if (!href) continue;
        const fullUrl = href.startsWith('http') ? href : `https://www.google.com${href.startsWith('.') ? href.substring(1) : href}`;
        
        if (seenUrls.has(fullUrl)) continue;
        seenUrls.add(fullUrl);

        const text = await link.innerText();
        const lines = text.split('\n').map(s => s.trim()).filter(s => s.length > 0);
        
        if (lines.length >= 2) {
          news.push({
            title: lines.find(l => l.length > 20) || lines[1], // 较长的行通常是标题
            source: lines[0],
            date: lines[lines.length - 1],
            content: "",
            url: fullUrl
          });
        }
        if (news.length >= 5) break;
      }
      return news;
    } catch (error) {
      console.error(`Google Finance 抓取异常:`, error);
      return [];
    }
  }
}
