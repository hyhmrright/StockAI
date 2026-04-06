import { chromium, Browser, Page } from 'playwright-core';
import { StockNews } from './types';
import { ScrapeStrategy } from './strategies/base';
import { GoogleStrategy } from './strategies/google';
import { YahooStrategy } from './strategies/yahoo';

/**
 * 抓取股票相关新闻
 * 使用策略模式支持多源抓取
 * @param symbol 股票代码
 * @returns 抓取到的新闻列表
 */
export async function scrapeStockNews(symbol: string): Promise<StockNews[]> {
  // 模拟错误降级测试
  if (symbol === "FAIL") {
    throw new Error("模拟网络错误: 无法连接至抓取服务。");
  }

  const browser: Browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'zh-CN'
  });
  
  const page: Page = await context.newPage();
  let news: StockNews[] = [];

  // 定义所有可用策略
  const strategies: ScrapeStrategy[] = [
    new GoogleStrategy(),
    new YahooStrategy()
  ];

  try {
    for (const strategy of strategies) {
      const results = await strategy.scrape(page, symbol);
      if (results && results.length > 0) {
        news = results;
        console.error(`${strategy.name} 抓取成功，获取到 ${results.length} 条新闻。`);
        break; // 只要有一个策略成功就停止
      }
    }
  } catch (error) {
    console.error(`抓取 ${symbol} 新闻发生异常:`, error);
  } finally {
    await browser.close();
  }

  return news;
}
