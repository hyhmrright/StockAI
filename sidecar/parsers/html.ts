import type { StockNews } from '../../shared/types';
import { todayISO } from '../utils';

/**
 * 提取链接的信息接口
 */
export interface ExtractedLink {
  url: string;    // 完整 URL
  text: string;   // 原始 innerText
  lines: string[]; // 按行拆分并清洗后的文本
}

/**
 * 助手函数：补全 URL
 */
function normalizeUrl(href: string, baseUrl: string): string {
  if (href.startsWith('http')) return href;
  const path = href.startsWith('.') ? href.substring(1) : href;
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}

/**
 * 助手函数：清洗并分行文本
 */
function sanitizeText(text: string): string[] {
  return text.split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * 通用的 HTML 字符串链接提取助手 (不依赖 Playwright)
 */
export async function extractLinksFromHtml(
  html: string,
  selector: string,
  urlFilter: string | RegExp,
  baseUrl: string
): Promise<ExtractedLink[]> {
  const results: ExtractedLink[] = [];
  const seenUrls = new Set<string>();

  let currentLink: { url: string; text: string } | null = null;
  let collecting = false;

  const rewriter = new HTMLRewriter().on(selector, {
    element(element) {
      const href = element.getAttribute('href');
      if (!href) return;

      const fullUrl = normalizeUrl(href, baseUrl);

      // URL 过滤
      if (urlFilter instanceof RegExp) {
        if (!urlFilter.test(fullUrl)) return;
      } else {
        if (!fullUrl.includes(urlFilter)) return;
      }

      // 基于 URL 去重
      if (seenUrls.has(fullUrl)) return;
      seenUrls.add(fullUrl);

      currentLink = { url: fullUrl, text: "" };
      collecting = true;

      element.onEndTag(() => {
        if (currentLink) {
          const lines = sanitizeText(currentLink.text);
          if (lines.length > 0 || currentLink.text.trim().length > 0) {
            results.push({
              url: currentLink.url,
              text: currentLink.text.trim(),
              lines
            });
          }
        }
        collecting = false;
        currentLink = null;
      });
    },
    text(t) {
      if (collecting && currentLink) {
        currentLink.text += t.text;
      }
    }
  });

  await rewriter.transform(new Response(html)).text();
  return results;
}

/**
 * 解析 Google Finance 的新闻
 * @param html Google Finance 页面的 HTML
 * @param baseUrl 基础 URL，默认为 "https://www.google.com"
 */
export async function parseGoogleNews(html: string, baseUrl: string = "https://www.google.com"): Promise<StockNews[]> {
  // Google Finance 现在常使用带有 /articles/ 或直接外部链接的新闻
  // 我们放宽选择器，寻找包含常见新闻标识符的链接
  const links = await extractLinksFromHtml(
    html,
    'a[href*="article"]', // 匹配 /article/, /articles/, /articleshow/ 等
    /article/i,
    baseUrl
  );

  // 映射为 StockNews 格式，并限制数量
  const MIN_TITLE_LENGTH = 15; // 标题最小长度启发值
  return links
    .filter(link => link.lines.length >= 2)
    .slice(0, 5)
    .map(link => ({
      title: link.lines.find(l => l.length > MIN_TITLE_LENGTH) || link.lines[1] || link.lines[0], 
      source: link.lines[0],
      date: link.lines[link.lines.length - 1],
      content: "",
      url: link.url
    }));
}

/**
 * 解析 Yahoo Finance 的新闻
 * @param html Yahoo Finance 页面的 HTML
 * @param baseUrl 基础 URL，默认为 "https://finance.yahoo.com"
 */
export async function parseYahooNews(html: string, baseUrl: string = "https://finance.yahoo.com"): Promise<StockNews[]> {
  const selectors = [
    '#quoteNewsStreamContent a',
    'ul li h3 a',
    'section[data-test="qsp-news"] a'
  ];

  for (const selector of selectors) {
    const links = await extractLinksFromHtml(
      html,
      selector,
      '/news/',
      baseUrl
    );

    const validNews = links
      .filter(l => l.text.length > 10)
      .slice(0, 5)
      .map(link => ({
        title: link.text,
        source: "Yahoo Finance",
        date: "Recently",
        content: "",
        url: link.url
      }));

    if (validNews.length > 0) return validNews;
  }
  
  return [];
}

/**
 * 从 HTML 字符串中提取非 google.com 的外部 HTTP 链接（已去重）
 */
export function extractExternalLinks(html: string): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  // 一遍扫描匹配两种格式：
  //   直接外链  href="https://..."
  //   Google 跳转  href="/url?q=https://..."（Google News 常见格式）
  const linkRegex = /href="(?:(https?:\/\/[^"]+)|\/url\?q=(https?:\/\/[^&"]+))/g;
  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(html)) !== null) {
    const href = m[1] ?? decodeURIComponent(m[2]);
    if (!href.includes('google.com') && !seen.has(href)) {
      seen.add(href);
      results.push(href);
    }
  }
  return results;
}

/**
 * 从 URL 中提取域名（去除 www. 前缀）
 */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * 从 Google News 搜索结果页面解析新闻列表
 */
export function parseGoogleNewsSearch(html: string, symbol: string): StockNews[] {
  const links = extractExternalLinks(html);
  if (links.length === 0) return [];

  const seen = new Set<string>();
  const titleRegex = /<div[^>]*class="[^"]*BNeawe[^"]*"[^>]*>([^<]{10,120})<\/div>/g;
  const titles: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = titleRegex.exec(html)) !== null) {
    const t = m[1].trim();
    if (!t.includes('http') && !seen.has(t)) {
      seen.add(t);
      titles.push(t);
    }
  }

  return links.slice(0, 8).map((url, i) => ({
    title: titles[i] ?? `${symbol} 相关新闻 ${i + 1}`,
    source: extractDomain(url),
    date: todayISO(),
    content: '',
    url,
  }));
}
