import { chromium, Browser, Page } from 'playwright-core';
import type { StockNews } from '../shared/types';
import type { ScrapeContext } from './strategies/base';
import { StrategyRegistry } from './strategies/registry';
import { BROWSER_CONTEXT_DEFAULTS, BROWSER_LAUNCH_ARGS, DEEP_MODE_MAX_ARTICLES } from './config';
import { extractFullContent } from './content-extractor';
import { toErrorMessage, logger } from './utils';

/**
 * 抓取股票相关新闻。
 * Chromium 懒启动：只有 Playwright 策略或深度模式正文提取才触发，A 股 RSS + deepMode=false 可省 1-3s。
 * @param symbol 股票代码（可含中文名，如"安克创新300866"）
 */
export async function scrapeStockNews(symbol: string, deepMode = true): Promise<StockNews[]> {
  const strategies = StrategyRegistry.getStrategies();

  // 用 ref 对象持有可变状态：ts 控制流在 finally 里无法收窄闭包内赋值的 `let`。
  // pagePromise 缓存的是 Promise 而非已解析的 Page——防止并发 getPage() 触发两次 Chromium 启动。
  const ref: { browser: Browser | null; pagePromise: Promise<Page> | null } = {
    browser: null,
    pagePromise: null,
  };

  async function launchPage(): Promise<Page> {
    logger.info("首次需要浏览器，启动 Chromium...");
    ref.browser = await chromium.launch({ headless: true, args: BROWSER_LAUNCH_ARGS });
    const context = await ref.browser.newContext(BROWSER_CONTEXT_DEFAULTS);
    return context.newPage();
  }

  const ctx: ScrapeContext = {
    getPage: () => (ref.pagePromise ??= launchPage()),
  };

  let news: StockNews[] = [];

  try {
    for (const strategy of strategies) {
      const results = await strategy.scrape(symbol, ctx);
      if (results.length > 0) {
        news = results;
        logger.info(`${strategy.name} 抓取成功，获取到 ${results.length} 条新闻概要。`);
        if (deepMode) {
          await enrichWithFullContent(news, await ctx.getPage());
        } else {
          logger.info("深度模式已关闭，仅使用新闻摘要进行分析。");
        }
        break;
      }
    }
  } catch (error) {
    logger.error(`抓取 ${symbol} 新闻发生异常: ${toErrorMessage(error)}`);
  } finally {
    if (ref.browser) await ref.browser.close();
  }

  return news;
}

/**
 * 深度模式：为前 N 条新闻补齐正文（就地修改）
 */
async function enrichWithFullContent(news: StockNews[], page: Page): Promise<void> {
  logger.info("深度模式已开启，正在提取新闻正文...");
  const count = Math.min(news.length, DEEP_MODE_MAX_ARTICLES);
  for (let i = 0; i < count; i++) {
    try {
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
