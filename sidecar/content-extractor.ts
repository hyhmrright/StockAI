import type { Page } from 'playwright-core';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import { CONTENT_LIMITS, TIMEOUTS } from './config';
import { toErrorMessage } from './utils';

const nhm = new NodeHtmlMarkdown();

/**
 * 将 HTML 转换为 Markdown 并截断
 */
export function htmlToMarkdown(html: string): string {
  const markdown = nhm.translate(html);
  return markdown.length > CONTENT_LIMITS.fullContent
    ? markdown.substring(0, CONTENT_LIMITS.fullContent) + "\n\n...(内容已截断)"
    : markdown;
}

/**
 * 启发式正文提取逻辑 (运行在浏览器沙箱内)
 * 注意：此函数必须是自包含的，不能引用外部闭包变量——Playwright 通过 .toString()
 * 序列化函数体并在页面上下文执行，任何外部引用都会在沙箱内 undefined。
 */
function heuristicContentExtraction(): string {
  // 减少 token 噪声：移除非正文元素
  document.querySelectorAll('script, style, nav, footer, iframe, aside').forEach(t => t.remove());

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
}

/**
 * 提取新闻详情页的完整正文并转换为 Markdown
 */
export async function extractFullContent(page: Page, url: string): Promise<string> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.contentExtraction });
    const html = await page.evaluate(heuristicContentExtraction);
    return html ? htmlToMarkdown(html) : "";
  } catch (error) {
    throw new Error(`页面加载失败: ${toErrorMessage(error)}`);
  }
}
