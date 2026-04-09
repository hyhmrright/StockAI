import { Page } from 'playwright-core';
import { StockNews } from '../types';
import { ScrapeStrategy } from './base';
import { parseGoogleNews } from './parsers';
import { detectChinaStock } from './exchange';

/**
 * Google Finance 抓取策略
 */
export class GoogleStrategy implements ScrapeStrategy {
  name = "Google Finance";

  async scrape(page: Page, symbol: string): Promise<StockNews[]> {
    console.error(`正在通过 Google Finance 策略抓取 ${symbol}...`);
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
    
    const googleUrl = `https://www.google.com/finance/quote/${ticker}`;

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
