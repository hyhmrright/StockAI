import { Page } from 'playwright-core';
import { StockNews } from '../types';
import { ScrapeStrategy } from './base';

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

      const news: StockNews[] = [];
      const selectors = [
        '#quoteNewsStreamContent a',
        'ul li h3 a',
        'section[data-test="qsp-news"] a'
      ];

      for (const selector of selectors) {
        const elements = await page.locator(selector).all();
        for (const el of elements) {
          const title = await el.innerText();
          const href = await el.getAttribute('href');
          
          if (title && title.length > 10 && href && href.includes('/news/')) {
            const fullUrl = href.startsWith('http') ? href : `https://finance.yahoo.com${href}`;
            news.push({
              title: title.trim(),
              source: "Yahoo Finance",
              date: "Recently",
              content: "",
              url: fullUrl
            });
          }
          if (news.length >= 5) break;
        }
        if (news.length > 0) break;
      }
      return news;
    } catch (error) {
      console.error(`Yahoo Finance 抓取异常:`, error);
      return [];
    }
  }
}
