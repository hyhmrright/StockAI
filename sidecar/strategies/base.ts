import { Page } from 'playwright-core';
import { StockNews } from '../types';

/**
 * 抓取策略基础接口
 */
export interface ScrapeStrategy {
  name: string;

  /**
   * 执行具体的抓取逻辑
   * @param page Playwright Page 对象
   * @param symbol 股票代码
   */
  scrape(page: Page, symbol: string): Promise<StockNews[]>;
}
