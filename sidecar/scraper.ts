import type { Page } from 'playwright-core';
import type { StockNews } from '../shared/types';
import type { ScrapeStrategy, ScrapeContext } from './strategies/base';
import { StrategyRegistry } from './strategies/registry';
import { DEEP_MODE_MAX_ARTICLES, TIMEOUTS } from './config';
import { extractFullContent } from './content-extractor';
import { toErrorMessage, logger } from './utils';
import { BrowserManager } from './browser-manager';

/** 测试注入点；生产不传。避开 bun:test 全局 mock.module 导致的跨文件状态泄漏。 */
export interface ScraperDeps {
  strategies?: ScrapeStrategy[];
  browserMgr?: BrowserManager;
  extractContent?: typeof extractFullContent;
  /** 覆盖策略链总预算，仅为让超时用例秒级跑完；生产走 TIMEOUTS.strategyChain */
  budgetMs?: number;
}

/**
 * 给一次策略调用套上截止时间。
 *
 * 为什么必须在调用方划这条线：策略内部每个 Playwright 调用各自有超时，**不等于整个策略有超时**。
 * `page.goto` 以 networkidle 超时后，紧接着的 `page.content()` 会无限期挂起——它不接受 timeout
 * 参数，页面只要还在加载就一直等。CI 实测这一路径静默卡死 100s+ 直到测试超时才被打断
 * （run 31260504774，Google Finance 与 Google News Search 各复现一次）。
 *
 * 被放弃的 promise 仍在后台跑，由 finally 里的 browserMgr.close() 连页面一起拆掉。
 */
function withDeadline<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 超出 ${ms}ms 预算，已中断`)), ms);
  });
  return Promise.race([work, guard]).finally(() => clearTimeout(timer));
}

/**
 * 抓取股票相关新闻。
 * @param symbol 股票代码（可含中文名，如"安克创新300866"）
 * @param deepMode 是否开启深度模式（抓取正文）
 * @param deps 测试依赖注入（生产不传）
 */
export async function scrapeStockNews(
  symbol: string,
  deepMode = true,
  deps?: ScraperDeps,
): Promise<StockNews[]> {
  const strategies = deps?.strategies ?? StrategyRegistry.getStrategies();
  const browserMgr = deps?.browserMgr ?? new BrowserManager();

  const ctx: ScrapeContext = {
    getPage: () => browserMgr.getPage(),
  };

  let news: StockNews[] = [];

  // 整条链共享一份预算：每个策略拿到的是「剩余时间」而非固定配额。
  // 后果是前面的策略卡住会挤掉后面的——但在现状里卡住是无限期的，后面的策略同样跑不到，
  // 所以这只是把「无限等」换成「有界等」，没有牺牲任何原本可达的回退。
  const budgetMs = deps?.budgetMs ?? TIMEOUTS.strategyChain;
  const deadline = Date.now() + budgetMs;

  try {
    for (const strategy of strategies) {
      if (Date.now() >= deadline) {
        logger.warn(`策略链已耗尽 ${budgetMs}ms 预算，跳过剩余策略`);
        break;
      }
      let attempts = 0;
      while (attempts < 2 && Date.now() < deadline) {
        try {
          const results = await withDeadline(
            strategy.scrape(symbol, ctx),
            deadline - Date.now(),
            strategy.name,
          );
          if (results.length > 0) {
            news = results;
            logger.info(`${strategy.name} 抓取成功，获取到 ${results.length} 条新闻概要。`);

            if (deepMode) {
              await enrichWithFullContent(news, ctx.getPage, deps?.extractContent);
            } else {
              logger.info('深度模式已关闭，仅使用新闻摘要进行分析。');
            }
          }
          break; // 无论结果是否为空，不再重试当前策略
        } catch (err) {
          attempts++;
          if (attempts >= 2) {
            logger.warn(`${strategy.name} 重试后仍失败: ${toErrorMessage(err)}`);
          } else {
            logger.warn(`${strategy.name} 首次失败，正在重试: ${toErrorMessage(err)}`);
          }
        }
      }
      if (news.length > 0) break;
    }
  } catch (error) {
    logger.error(`抓取 ${symbol} 新闻发生异常: ${toErrorMessage(error)}`);
  } finally {
    await browserMgr.close();
  }

  return news;
}

/**
 * 深度模式：为前 N 条新闻补齐正文（就地修改）
 * getPage 工厂函数仅在首次真正需要时被调用，RSS 纯路径不触发 Chromium 启动。
 */
async function enrichWithFullContent(
  news: StockNews[],
  getPage: () => Promise<Page>,
  extract?: typeof extractFullContent,
): Promise<void> {
  const doExtract = extract ?? extractFullContent;
  logger.info('深度模式已开启，正在提取新闻正文...');
  const count = Math.min(news.length, DEEP_MODE_MAX_ARTICLES);
  let page: Page | null = null;
  for (let i = 0; i < count; i++) {
    try {
      page ??= await getPage();
      const content = await doExtract(page, news[i].url);
      if (content) {
        news[i].content = content;
        logger.info(`  - 已提取正文: ${news[i].title.substring(0, 30)}...`);
      }
    } catch (e) {
      logger.warn(`  - 无法提取正文 [${news[i].title.substring(0, 20)}]: ${toErrorMessage(e)}`);
    }
  }
}
