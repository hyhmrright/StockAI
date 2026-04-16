import type { Page } from 'playwright-core';
import type { StockNews } from '../../shared/types';
import { TIMEOUTS } from '../config';
import { toErrorMessage, logger } from '../utils';

/**
 * 抓取上下文——策略按需调用 getPage() 触发浏览器启动；
 * 纯 fetch 策略（如 RSS）永不调用此方法，避免为它们浪费 Chromium 启动时间。
 */
export interface ScrapeContext {
  getPage(): Promise<Page>;
}

/**
 * 抓取策略接口——每个策略只承诺 name 与抓取结果。
 * Playwright 与 RSS / fetch 策略可并排实现同一接口，无继承关系。
 */
export interface ScrapeStrategy {
  readonly name: string;
  scrape(symbol: string, ctx: ScrapeContext): Promise<StockNews[]>;
}

/**
 * 基于 Playwright 的抓取策略模板方法基类。
 * 子类提供 URL 与 HTML 解析逻辑，基类负责 goto / waitForTimeout / 错误兜底。
 */
export abstract class PlaywrightStrategy implements ScrapeStrategy {
  abstract readonly name: string;

  async scrape(symbol: string, ctx: ScrapeContext): Promise<StockNews[]> {
    const page = await ctx.getPage();
    const url = this.getUrl(symbol);
    logger.info(`[${this.name}] 正在抓取 ${symbol} from ${url}`);

    try {
      await page.goto(url, {
        waitUntil: this.getWaitUntil(),
        timeout: TIMEOUTS.pageNavigation,
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
