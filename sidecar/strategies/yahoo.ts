import { Page } from 'playwright-core';
import { StockNews } from '../types';
import { ScrapeStrategy } from './base';
import { extractLinks } from './utils';

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

      const selectors = [
        '#quoteNewsStreamContent a',
        'ul li h3 a',
        'section[data-test="qsp-news"] a'
      ];

      for (const selector of selectors) {
        // 使用助手函数提取链接
        const links = await extractLinks(
          page, 
          selector, 
          '/news/', 
          'https://finance.yahoo.com'
        );

        // 过滤标题过短的链接并映射
        const validNews = links
          .filter(l => l.text.length > 10)
          .slice(0, 5)
          .map(link => ({
            title: link.text,
            source: "Yahoo Finance",
            date: "Recently",
            content: "",
            url: link.url
          }));

        if (validNews.length > 0) return validNews;
      }
      return [];
    } catch (error) {
      console.error(`Yahoo Finance 抓取异常:`, error);
      return [];
    }
  }
}
