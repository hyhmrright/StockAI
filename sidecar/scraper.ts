import { chromium, Browser, Page } from 'playwright-core';
import { StockNews } from './types';

/**
 * 抓取股票相关新闻
 * @param symbol 股票代码 (例如: AAPL)
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

  try {
    // 策略 1: Google Finance
    console.error(`尝试通过 Google Finance 抓取 ${symbol}...`);
    const googleUrl = `https://www.google.com/finance/quote/${symbol}:NASDAQ`;
    await page.goto(googleUrl, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    
    // 增加等待时间，确保内容加载
    await page.waitForTimeout(1000);
    
    const googleNews = await extractGoogleNews(page);
    if (googleNews.length > 0) {
      news = googleNews;
    } else {
      // 策略 2: Yahoo Finance (回退方案)
      console.error(`Google Finance 未发现结果，尝试 Yahoo Finance...`);
      const yahooUrl = `https://finance.yahoo.com/quote/${symbol}`;
      await page.goto(yahooUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1000);
      news = await extractYahooNews(page);
    }
  } catch (error) {
    console.error(`抓取 ${symbol} 新闻发生异常:`, error);
  } finally {
    await browser.close();
  }

  return news;
}

async function extractGoogleNews(page: Page): Promise<StockNews[]> {
  const news: StockNews[] = [];
  try {
    // 使用更底层的属性选择器
    const links = await page.locator('a[href*="/news/"]').all();
    const seenUrls = new Set<string>();

    for (const link of links) {
      const href = await link.getAttribute('href');
      if (!href) continue;
      const fullUrl = href.startsWith('http') ? href : `https://www.google.com${href.startsWith('.') ? href.substring(1) : href}`;
      
      if (seenUrls.has(fullUrl)) continue;
      seenUrls.add(fullUrl);

      const text = await link.innerText();
      const lines = text.split('\n').map(s => s.trim()).filter(s => s.length > 0);
      
      // Google News 结构通常是: [Source, Title, Time] 或其他排列
      if (lines.length >= 2) {
        news.push({
          title: lines.find(l => l.length > 20) || lines[1], // 较长的行通常是标题
          source: lines[0],
          date: lines[lines.length - 1],
          content: "",
          url: fullUrl
        });
      }
      if (news.length >= 5) break;
    }
  } catch (e) {}
  return news;
}

async function extractYahooNews(page: Page): Promise<StockNews[]> {
  const news: StockNews[] = [];
  try {
    // Yahoo Finance 新闻通常包含在 list item 中，具有特定的 class 或结构
    // 尝试查找具有新闻标题特征的链接
    const selectors = [
      '#quoteNewsStreamContent a',
      'ul li h3 a',
      'section[data-test="qsp-news"] a'
    ];

    for (const selector of selectors) {
      const elements = await page.locator(selector).all();
      for (const el of elements) {
        const title = await el.innerText();
        const href = await el.getAttribute('href');
        
        if (title && title.length > 10 && href && href.includes('/news/')) {
          const fullUrl = href.startsWith('http') ? href : `https://finance.yahoo.com${href}`;
          news.push({
            title: title.trim(),
            source: "Yahoo Finance",
            date: "Recently",
            content: "",
            url: fullUrl
          });
        }
        if (news.length >= 5) break;
      }
      if (news.length > 0) break;
    }
  } catch (e) {}
  return news;
}

import { performFullAnalysis } from './analysis';

// 修改 CLI 入口逻辑，支持编译后的二进制文件运行
if (import.meta.main || (typeof process !== 'undefined' && process.argv[1] && (process.argv[1].endsWith('stockai-backend') || process.argv[1].endsWith('stockai-backend.exe')))) {
  const symbol = process.argv[2];
  if (!symbol) {
    console.error("使用方法: stockai-backend <SYMBOL>");
    process.exit(1);
  }

  try {
    // 执行完整分析 (抓取 + AI)
    const result = await performFullAnalysis(symbol);
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    console.error("Sidecar 运行出错:", error);
    process.exit(1);
  }
}
