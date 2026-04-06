import { chromium, Browser, Page } from 'playwright-core';
import { StockNews } from './types';
import { ScrapeStrategy } from './strategies/base';
import { GoogleStrategy } from './strategies/google';
import { YahooStrategy } from './strategies/yahoo';
import { NodeHtmlMarkdown } from 'node-html-markdown';

/**
 * 抓取股票相关新闻
 * 使用策略模式支持多源抓取，并支持正文内容提取
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
        console.error(`${strategy.name} 抓取成功，获取到 ${results.length} 条新闻概要。`);
        
        // 为获取到的新闻抓取详细正文 (仅限前 3 条，以平衡性能和分析深度)
        console.error("正在尝试提取新闻正文以进行深度分析...");
        for (let i = 0; i < Math.min(news.length, 3); i++) {
          try {
            const content = await extractFullContent(page, news[i].url);
            if (content) {
              news[i].content = content;
              console.error(`  - 已提取正文: ${news[i].title.substring(0, 30)}...`);
            }
          } catch (e) {
            console.error(`  - 无法提取正文 [${news[i].title.substring(0, 20)}]:`, (e as any).message);
          }
        }
        
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

/**
 * 提取新闻详情页的完整正文并转换为 Markdown
 * @param page Playwright Page 对象
 * @param url 新闻链接
 */
async function extractFullContent(page: Page, url: string): Promise<string> {
  try {
    // 增加超时控制和重试
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    
    // 等待核心内容区域加载 (通用策略)
    const content = await page.evaluate(() => {
      // 移除干扰元素
      const scriptTags = document.querySelectorAll('script, style, nav, footer, iframe, ads');
      scriptTags.forEach(t => t.remove());

      // 寻找最可能的正文容器 (启发式)
      const selectors = [
        'article',
        '.article-content',
        '.story-content',
        'main',
        '#main-content',
        '.post-content'
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (el && el.innerText.length > 300) {
          return el.innerHTML;
        }
      }

      // 如果没有匹配的选择器，找包含最多段落的容器
      const pContainers = Array.from(document.querySelectorAll('div, section')) as HTMLElement[];
      const sortedContainers = pContainers
        .filter(div => div.querySelectorAll('p').length > 3)
        .sort((a, b) => b.innerText.length - a.innerText.length);
      
      return sortedContainers[0] ? sortedContainers[0].innerHTML : document.body.innerHTML;
    });

    if (!content) return "";

    // 使用 NodeHtmlMarkdown 转换为 Markdown
    const nhm = new NodeHtmlMarkdown();
    const markdown = nhm.translate(content);

    // 截断过长的内容以防 Token 超出
    return markdown.length > 3000 ? markdown.substring(0, 3000) + "\n\n...(内容已截断)" : markdown;
  } catch (error) {
    throw new Error(`页面加载失败: ${(error as any).message}`);
  }
}
