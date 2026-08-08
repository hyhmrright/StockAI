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
    let page: Page;
    try {
      page = await ctx.getPage();
    } catch (err) {
      // playwright-core 在 Bun --compile 二进制中可能因路径问题加载失败，
      // 此处捕获后直接跳过，让 RSS 等纯 fetch 策略继续工作。
      logger.warn(`[${this.name}] 无法初始化浏览器，跳过此策略: ${toErrorMessage(err)}`);
      return [];
    }
    const url = this.getUrl(symbol);
    logger.info(`[${this.name}] 正在抓取 ${symbol} from ${url}`);

    try {
      let navFailed = false;
      await page
        .goto(url, {
          // 固定 domcontentloaded，**不要改成 networkidle**：Google 一系页面有常驻连接
          // （分析打点、预取），networkidle 基本等不到，goto 只会走到超时。而超时意味着
          // 导航等待器仍悬着，紧接着的 page.content() 就会无限期挂起（它不收 timeout）——
          // 这正是 CI 里那次静默卡死 100s+ 的成因（run 31260504774）。
          // 解析吃的是 page.content() 的 HTML，Google 的新闻列表本就是服务端渲染，
          // 少等的那点异步渲染由下面的 waitForTimeout 补足。
          waitUntil: 'domcontentloaded',
          timeout: TIMEOUTS.pageNavigation,
        })
        .catch((err) => {
          if (err instanceof Error && err.name === 'TimeoutError') {
            logger.warn(`[${this.name}] 页面加载超时，尝试解析已加载内容: ${toErrorMessage(err)}`);
          } else {
            logger.warn(`[${this.name}] 页面导航失败，跳过解析: ${toErrorMessage(err)}`);
            navFailed = true;
          }
        });

      if (navFailed) return [];

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
}
