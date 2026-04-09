import { chromium, Browser, Page } from 'playwright-core';
import { StockNews } from './types';
import { ScrapeStrategy } from './strategies/base';
import { GoogleNewsSearchStrategy } from './strategies/google-news';
import { GoogleStrategy } from './strategies/google';
import { YahooStrategy } from './strategies/yahoo';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import { CONTENT_LIMITS, DEEP_MODE_MAX_ARTICLES, TIMEOUTS } from './config';
import { toErrorMessage } from './utils';

const nhm = new NodeHtmlMarkdown();

/**
 * 抓取股票相关新闻
 * @param symbol 股票代码
 */
export async function scrapeStockNews(symbol: string, deepMode = true): Promise<StockNews[]> {
  // 集成测试专属：返回真实结构的样本数据 (用于 UI 全链路渲染验证)
  if (symbol === "NVDA_REAL") {
    return [
      {
        title: "英伟达财报超预期：AI 需求带动数据中心收入激增",
        source: "金融界",
        date: "2024-03-20",
        content: "英伟达今日公布的季度业绩再次震撼华尔街，其数据中心业务收入同比增长 400%，主要得益于大型语言模型和生成式 AI 对 H100 GPU 的强劲需求。",
        url: "https://finance.sina.com.cn/stock/usstock/2024-03-20/doc-ianfyrkv3849502.shtml"
      },
      {
        title: "分析师上调英伟达目标价至 1200 美元",
        source: "华尔街见闻",
        date: "2024-03-21",
        content: "由于供应短缺依然存在且毛利率持续走高，顶级分析师们普遍认为英伟达在 AI 基础设施领域的垄断地位在未来 18 个月内不可动摇。",
        url: "https://wallstreetcn.com/articles/3710293"
      }
    ];
  }

  // 模拟错误降级测试
  if (symbol === "FAIL") {
    throw new Error("模拟网络错误: 无法连接至抓取服务。");
  }

  const browser: Browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'] 
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'zh-CN'
  });
  
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
