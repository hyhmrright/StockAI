import { Page } from 'playwright-core';
import { StockNews } from '../types';
import { TIMEOUTS } from '../config';
import { toErrorMessage, logger } from '../utils';

/**
 * 抓取策略基础类
 */
export abstract class ScrapeStrategy {
  abstract name: string;

  /**
   * 执行具体的抓取逻辑（模板方法）
   * @param page Playwright Page 对象
   * @param symbol 股票代码
   */
  async scrape(page: Page, symbol: string): Promise<StockNews[]> {
    const url = this.getUrl(symbol);
    logger.info(`[${this.name}] 正在抓取 ${symbol} from ${url}`);

    try {
      await page.goto(url, { 
        waitUntil: this.getWaitUntil(), 
        timeout: TIMEOUTS.pageNavigation 
      }).catch(err => {
        logger.warn(`[${this.name}] 页面加载部分超时: ${toErrorMessage(err)}`);
      });

      await page.waitForTimeout(TIMEOUTS.pageWait);

      const html = await page.content();
      return await this.parse(html, symbol);
    } catch (error) {
      logger.error(`[${this.name}] 抓取异常 (${symbol}): ${toErrorMessage(error)}`);
      return [];
    }
  }

  /** 获取目标 URL */
  protected abstract getUrl(symbol: string): string;

  /** 解析 HTML 逻辑 */
  protected abstract parse(html: string, symbol: string): Promise<StockNews[]> | StockNews[];

  /** 可选覆盖的等待条件 */
  protected getWaitUntil(): 'domcontentloaded' | 'networkidle' | 'load' {
    return 'domcontentloaded';
  }
}
