import { chromium, Browser, Page } from 'playwright-core';
import { StockNews } from './types';
import { ScrapeStrategy } from './strategies/base';
import { GoogleNewsSearchStrategy } from './strategies/google-news';
import { GoogleStrategy } from './strategies/google';
import { YahooStrategy } from './strategies/yahoo';
import { fetchGoogleNewsRSS } from './strategies/google-news-rss';
import { parseSymbol } from './strategies/exchange';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import { BROWSER_CONTEXT_DEFAULTS, BROWSER_LAUNCH_ARGS, CONTENT_LIMITS, DEEP_MODE_MAX_ARTICLES, TIMEOUTS } from './config';
import { toErrorMessage, logger } from './utils';

const nhm = new NodeHtmlMarkdown();

/**
 * 抓取股票相关新闻
 * @param symbol 股票代码（可含中文名，如"安克创新300866"）
 */
export async function scrapeStockNews(symbol: string, deepMode = true): Promise<StockNews[]> {
  const parsed = parseSymbol(symbol);

  // A 股：优先用 Google News RSS（无 CAPTCHA、速度快）
  // Playwright 抓取的 Google News 搜索结果因 reCAPTCHA 始终返回空
  if (parsed.chinaInfo) {
    const query = parsed.displayName
      ? `"${parsed.displayName}" 股票`
      : `${parsed.chinaInfo.code} 股票`;
    try {
      const rssNews = await fetchGoogleNewsRSS(query);
      if (rssNews.length > 0) {
        logger.info(`Google News RSS 抓取成功，获取到 ${rssNews.length} 条新闻。`);
        return rssNews;
      }
    } catch (err) {
      logger.warn(`Google News RSS 失败，降级到 Playwright 策略: ${toErrorMessage(err)}`);
    }
  }

  // 非 A 股或 RSS 失败：使用 Playwright 多策略抓取
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
 * Playwright 通过 .toString() 序列化函数体，编译后的二进制中命名函数引用会丢失。
 * 测试限制：DOM 选择逻辑运行在浏览器沙箱中，无法在 Bun 进程内单元测试；
 * 覆盖依赖 scraper.integration.ts（需要网络，标记 flaky）。
 * 若需要单元测试，需将 page.evaluate 替换为 page.content() + 服务端 HTML 解析器。
 */
async function extractFullContent(page: Page, url: string): Promise<string> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.contentExtraction });
    const html = await page.evaluate(() => {
      // 减少 token 噪声：移除非正文元素
      document.querySelectorAll('script, style, nav, footer, iframe').forEach(t => t.remove());

      // 优先级：article > 财经网站语义容器 > main > id/class 容器
      // 300 字符阈值：排除空容器或仅含导航链接的伪正文区
      const selectors = ['article', '.article-content', '.story-content', 'main', '#main-content', '.post-content'];
      for (const selector of selectors) {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (el && el.innerText.length > 300) return el.innerHTML;
      }

      // 最终回退：段落数优先（过滤侧边栏/广告位等低密度区块），段落数相同时取文本最长的
      // 先 map 缓存段落数，避免 filter 内重复调用 querySelectorAll 造成 O(n²) DOM 遍历
      const scored = (Array.from(document.querySelectorAll('div, section')) as HTMLElement[])
        .map(div => ({ div, pCount: div.querySelectorAll('p').length, len: div.innerText.length }))
        .filter(({ pCount }) => pCount > 3)
        .sort((a, b) => b.pCount - a.pCount || b.len - a.len);

      return scored[0] ? scored[0].div.innerHTML : document.body.innerHTML;
    });
    return html ? htmlToMarkdown(html) : "";
  } catch (error) {
    throw new Error(`页面加载失败: ${toErrorMessage(error)}`);
  }
}
