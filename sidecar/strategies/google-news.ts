import { Page } from 'playwright-core';
import { StockNews } from '../types';
import { ScrapeStrategy } from './base';
import { parseSymbol } from './exchange';
import { TIMEOUTS } from '../config';
import { toErrorMessage } from '../utils';
import { parseGoogleNewsSearch } from './parsers';

/**
 * Google News 搜索策略
 * 通过搜索引擎 News tab 抓取新闻，适用于任何有名称/代码的股票
 * 不依赖 Google Finance quote 页面，解决小盘 A 股无新闻问题
 */
export class GoogleNewsSearchStrategy implements ScrapeStrategy {
  name = "Google News Search";

  async scrape(page: Page, symbol: string): Promise<StockNews[]> {
    console.error(`正在通过 Google News 搜索策略抓取 ${symbol}...`);
    const parsed = parseSymbol(symbol);

    let query: string;
    let lang: string;

    if (parsed.chinaInfo) {
      const keyword = parsed.displayName ?? parsed.chinaInfo.code;
      query = `"${keyword}" 股票 新闻`;
      lang = 'zh-CN';
    } else {
      query = `"${symbol}" stock news`;
      lang = 'en';
    }

    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=nws&hl=${lang}`;

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUTS.pageNavigation }).catch(() => {});
      await page.waitForTimeout(TIMEOUTS.pageWait);

      const html = await page.content();
      return parseGoogleNewsSearch(html, symbol);
    } catch (error) {
      console.error(`Google News 搜索策略异常 (${symbol}): ${toErrorMessage(error)}`);
      return [];
    }
  }
}
