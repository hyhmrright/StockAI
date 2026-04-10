import { chromium, Browser, Page } from 'playwright-core';
import { StockNews } from './types';
import { ScrapeStrategy } from './strategies/base';
import { GoogleNewsSearchStrategy } from './strategies/google-news';
import { GoogleStrategy } from './strategies/google';
import { YahooStrategy } from './strategies/yahoo';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import { BROWSER_CONTEXT_DEFAULTS, BROWSER_LAUNCH_ARGS, CONTENT_LIMITS, DEEP_MODE_MAX_ARTICLES, TIMEOUTS } from './config';
import { toErrorMessage, logger } from './utils';

const nhm = new NodeHtmlMarkdown();

/**
 * 抓取股票相关新闻
 * @param symbol 股票代码
 */
export async function scrapeStockNews(symbol: string, deepMode = true): Promise<StockNews[]> {
  const browser: Browser = await chromium.launch({
    headless: true,
    args: BROWSER_LAUNCH_ARGS,
  });

  const context = await browser.newContext(BROWSER_CONTEXT_DEFAULTS);
  
  const page: Page = await context.newPage();
  let news: StockNews[] = [];

  // 定义所有可用策略（GoogleNewsSearch 优先，适用于任何股票）
  const strategies: ScrapeStrategy[] = [
    new GoogleNewsSearchStrategy(),
    new GoogleStrategy(),
    new YahooStrategy()
  ];

  try {
    for (const strategy of strategies) {
      const results = await strategy.scrape(page, symbol);
      if (results.length > 0) {
        news = results;
        logger.info(`${strategy.name} 抓取成功，获取到 ${results.length} 条新闻概要。`);

        // 深度模式：提取前 3 条新闻的完整正文，耗时较长但分析质量更高
        if (deepMode) {
          logger.info("深度模式已开启，正在提取新闻正文...");
          for (let i = 0; i < Math.min(news.length, DEEP_MODE_MAX_ARTICLES); i++) {
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
        } else {
          logger.info("深度模式已关闭，仅使用新闻摘要进行分析。");
        }

        break; // 只要有一个策略成功就停止
      }
    }
  } catch (error) {
    logger.error(`抓取 ${symbol} 新闻发生异常: ${toErrorMessage(error)}`);
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
      // 移除广告、导航等干扰元素，减少 token 噪声
      document.querySelectorAll('script, style, nav, footer, iframe, ads').forEach(t => t.remove());

      // 按覆盖率优先级尝试常见正文容器：
      // article > 语义容器（财经网站常用）> main > id/class 型容器
      const selectors = ['article', '.article-content', '.story-content', 'main', '#main-content', '.post-content'];
      for (const selector of selectors) {
        const el = document.querySelector(selector) as HTMLElement | null;
        // 300 字符阈值：排除空容器或仅含导航链接的伪正文区
        if (el && el.innerText.length > 300) return el.innerHTML;
      }

      // 最终回退：在所有 div/section 中找段落最多且文本最长的容器
      // 3 个段落阈值：过滤掉侧边栏、广告位等低密度区块
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
