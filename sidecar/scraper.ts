import type { Page } from 'playwright-core';
import type { StockNews } from '../shared/types';
import type { ScrapeContext } from './strategies/base';
import { StrategyRegistry } from './strategies/registry';
import { DEEP_MODE_MAX_ARTICLES } from './config';
import { extractFullContent } from './content-extractor';
import { toErrorMessage, logger } from './utils';
import { BrowserManager } from './browser-manager';

/**
 * 抓取股票相关新闻。
 * @param symbol 股票代码（可含中文名，如"安克创新300866"）
 * @param deepMode 是否开启深度模式（抓取正文）
 */
export async function scrapeStockNews(symbol: string, deepMode = true): Promise<StockNews[]> {
  const strategies = StrategyRegistry.getStrategies();
  const browserMgr = new BrowserManager();

  const ctx: ScrapeContext = {
    getPage: () => browserMgr.getPage(),
  };

  let news: StockNews[] = [];

  try {
    for (const strategy of strategies) {
      const results = await strategy.scrape(symbol, ctx);
      if (results.length > 0) {
        news = results;
        logger.info(`${strategy.name} 抓取成功，获取到 ${results.length} 条新闻概要。`);
        
        if (deepMode) {
          await enrichWithFullContent(news, ctx.getPage);
        } else {
          logger.info("深度模式已关闭，仅使用新闻摘要进行分析。");
        }
        break;
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
async function enrichWithFullContent(news: StockNews[], getPage: () => Promise<Page>): Promise<void> {
  logger.info("深度模式已开启，正在提取新闻正文...");
  const count = Math.min(news.length, DEEP_MODE_MAX_ARTICLES);
  let page: Page | null = null;
  for (let i = 0; i < count; i++) {
    try {
      page ??= await getPage();
      const content = await extractFullContent(page, news[i].url);
      if (content) {
        news[i].content = content;
        logger.info(`  - 已提取正文: ${news[i].title.substring(0, 30)}...`);
      }
    } catch (e) {
      logger.warn(`  - 无法提取正文 [${news[i].title.substring(0, 20)}]: ${toErrorMessage(e)}`);
    }
  }
}
