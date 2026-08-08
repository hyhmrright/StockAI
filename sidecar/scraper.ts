import type { Page } from 'playwright-core';
import type { StockNews } from '../shared/types';
import type { ScrapeStrategy, ScrapeContext } from './strategies/base';
import { StrategyRegistry } from './strategies/registry';
import { DEEP_MODE_MAX_ARTICLES, TIMEOUTS } from './config';
import { extractFullContent } from './content-extractor';
import { toErrorMessage, logger, withTimeout } from './utils';
import { BrowserManager } from './browser-manager';

/** 测试注入点；生产不传。避开 bun:test 全局 mock.module 导致的跨文件状态泄漏。 */
export interface ScraperDeps {
  strategies?: ScrapeStrategy[];
  browserMgr?: BrowserManager;
  extractContent?: typeof extractFullContent;
  /** 覆盖单次抓取总预算，仅为让超时用例秒级跑完；生产走 TIMEOUTS.scrapeBudget */
  budgetMs?: number;
}

/**
 * 给一段抓取工作套上剩余预算。
 *
 * 为什么必须在调用方划这条线：策略内部每个 Playwright 调用各自有超时，**不等于整个策略有超时**。
 * 典型例子是 `page.content()`——它不接受 timeout 参数，导航还悬着就一直等。CI 实测这一路径
 * 静默卡死 100s+ 直到测试超时才被打断（run 31260504774，Google Finance 与 Google News Search
 * 各复现一次；那次的引信是 networkidle，已在 strategies/base.ts 拆掉，但这条线仍是兜底）。
 *
 * 被放弃的 promise 仍在后台跑，由 finally 里的 browserMgr.close() 连页面一起拆掉。
 */
function withBudget<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return withTimeout(work, ms, `${label} 超出 ${ms}ms 预算，已中断`);
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

  // 整次抓取共享一份预算：每个阶段拿到的是「剩余时间」而非固定配额。
  // 后果是前面的阶段卡住会挤掉后面的——但在现状里卡住是无限期的，后面的阶段同样跑不到，
  // 所以这只是把「无限等」换成「有界等」，没有牺牲任何原本可达的回退。
  const budgetMs = deps?.budgetMs ?? TIMEOUTS.scrapeBudget;
  const deadline = Date.now() + budgetMs;

  try {
    for (const strategy of strategies) {
      if (Date.now() >= deadline) {
        logger.warn(`已耗尽 ${budgetMs}ms 预算，跳过剩余策略`);
        break;
      }
      let attempts = 0;
      while (attempts < 2 && Date.now() < deadline) {
        try {
          const results = await withBudget(
            strategy.scrape(symbol, ctx),
            deadline - Date.now(),
            strategy.name,
          );
          if (results.length > 0) {
            news = results;
            logger.info(`${strategy.name} 抓取成功，获取到 ${results.length} 条新闻概要。`);
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

    // 正文提取吃同一份预算：它同样能无限期挂起（extractFullContent 里的 page.evaluate
    // 不接受 timeout），原先逃在预算之外，实测把一次抓取顶到 90s——「策略链有界」不等于
    // 「scrapeStockNews 有界」。放在策略循环之外还顺带修掉一个隐患：留在 try 里的话，
    // 提取超时会被当成策略失败而触发多余重抓。就地修改保证超时前提取到的正文不丢。
    if (news.length > 0) {
      if (!deepMode) {
        logger.info('深度模式已关闭，仅使用新闻摘要进行分析。');
      } else if (Date.now() >= deadline) {
        logger.warn(`已耗尽 ${budgetMs}ms 预算，跳过正文提取，仅用新闻概要`);
      } else {
        await withBudget(
          enrichWithFullContent(news, ctx.getPage, deps?.extractContent),
          deadline - Date.now(),
          '正文提取',
        ).catch((err) => logger.warn(toErrorMessage(err)));
      }
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
