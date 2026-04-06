import { Page } from 'playwright-core';
import { StockNews } from '../types';

/**
 * 抓取策略基础接口
 */
export interface ScrapeStrategy {
  name: string;
  
  /**
   * 检查该策略是否能处理给定的 URL (目前主要用于调度，未来可以扩展)
   */
  canHandle(url: string): boolean;
  
  /**
   * 执行具体的抓取逻辑
   * @param page Playwright Page 对象
   * @param symbol 股票代码
   */
  scrape(page: Page, symbol: string): Promise<StockNews[]>;
}
