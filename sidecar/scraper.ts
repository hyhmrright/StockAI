import { chromium, Browser, Page } from 'playwright-core';
import { StockNews } from './types';
import { ScrapeStrategy } from './strategies/base';
import { GoogleStrategy } from './strategies/google';
import { YahooStrategy } from './strategies/yahoo';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import { CONTENT_LIMITS, DEEP_MODE_MAX_ARTICLES, TIMEOUTS } from './config';
import { toErrorMessage } from './utils';

const nhm = new NodeHtmlMarkdown();

/**
 * 抓取股票相关新闻
 * 使用策略模式支持多源抓取，并支持正文内容提取
 * @param symbol 股票代码
 * @returns 抓取到的新闻列表
 */
export async function scrapeStockNews(symbol: string, deepMode = true): Promise<StockNews[]> {
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
      if (results.length > 0) {
        news = results;
        console.error(`${strategy.name} 抓取成功，获取到 ${results.length} 条新闻概要。`);
        
        // 深度模式：提取前 3 条新闻的完整正文，耗时较长但分析质量更高
        if (deepMode) {
          console.error("深度模式已开启，正在提取新闻正文...");
          for (let i = 0; i < Math.min(news.length, DEEP_MODE_MAX_ARTICLES); i++) {
            try {
              const content = await extractFullContent(page, news[i].url);
              if (content) {
                news[i].content = content;
                console.error(`  - 已提取正文: ${news[i].title.substring(0, 30)}...`);
              }
            } catch (e) {
              console.error(`  - 无法提取正文 [${news[i].title.substring(0, 20)}]:`, toErrorMessage(e));
            }
          }
        } else {
          console.error("深度模式已关闭，仅使用新闻摘要进行分析。");
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
 * 将 HTML 转换为 Markdown 并截断
 */
function htmlToMarkdown(html: string): string {
  const markdown = nhm.translate(html);
  return markdown.length > CONTENT_LIMITS.fullContent
    ? markdown.substring(0, CONTENT_LIMITS.fullContent) + "\n\n...(内容已截断)"
    : markdown;
}

/**
 * 提取新闻详情页的完整正文并转换为 Markdown
 * 注意：page.evaluate 的回调必须内联，不能传命名函数引用——
 * Playwright 通过 .toString() 序列化函数体，编译后的二进制中命名函数引用会丢失
 */
async function extractFullContent(page: Page, url: string): Promise<string> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.contentExtraction });
    const html = await page.evaluate(() => {
      // 移除干扰元素
      document.querySelectorAll('script, style, nav, footer, iframe, ads').forEach(t => t.remove());

      // 按优先级尝试常见正文容器
      const selectors = ['article', '.article-content', '.story-content', 'main', '#main-content', '.post-content'];
      for (const selector of selectors) {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (el && el.innerText.length > 300) return el.innerHTML;
      }

      // 回退：找包含最多段落的容器
      const containers = Array.from(document.querySelectorAll('div, section')) as HTMLElement[];
      const best = containers
        .filter(div => div.querySelectorAll('p').length > 3)
        .sort((a, b) => b.innerText.length - a.innerText.length)[0];

      return best ? best.innerHTML : document.body.innerHTML;
    });
    return html ? htmlToMarkdown(html) : "";
  } catch (error) {
    throw new Error(`页面加载失败: ${toErrorMessage(error)}`);
  }
}
