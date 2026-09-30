import type { StockNews } from '../../shared/types';
import { todayISO } from '../utils';
import { relevanceTokens } from './exchange';

/**
 * 提取链接的信息接口
 */
export interface ExtractedLink {
  url: string; // 完整 URL
  text: string; // 原始 innerText
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
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 通用的 HTML 字符串链接提取助手 (不依赖 Playwright)
 */
export async function extractLinksFromHtml(
  html: string,
  selector: string,
  urlFilter: string | RegExp,
  baseUrl: string,
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

      currentLink = { url: fullUrl, text: '' };
      collecting = true;

      element.onEndTag(() => {
        if (currentLink) {
          const lines = sanitizeText(currentLink.text);
          if (lines.length > 0 || currentLink.text.trim().length > 0) {
            results.push({
              url: currentLink.url,
              text: currentLink.text.trim(),
              lines,
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
    },
  });

  await rewriter.transform(new Response(html)).text();
  return results;
}

/**
 * 解析 Google Finance 的新闻
 * @param html Google Finance 页面的 HTML
 * @param baseUrl 基础 URL，默认为 "https://www.google.com"
 */
export async function parseGoogleNews(
  html: string,
  baseUrl: string = 'https://www.google.com',
): Promise<StockNews[]> {
  // Google Finance 现在常使用带有 /articles/ 或直接外部链接的新闻
  // 我们放宽选择器，寻找包含常见新闻标识符的链接
  const links = await extractLinksFromHtml(
    html,
    'a[href*="article"]', // 匹配 /article/, /articles/, /articleshow/ 等
    /article/i,
    baseUrl,
  );

  // 映射为 StockNews 格式，并限制数量
  const MIN_TITLE_LENGTH = 15; // 标题最小长度启发值
  return links
    .filter((link) => link.lines.length >= 2)
    .slice(0, 5)
    .map((link) => ({
      title: link.lines.find((l) => l.length > MIN_TITLE_LENGTH) || link.lines[1] || link.lines[0],
      source: link.lines[0],
      date: link.lines[link.lines.length - 1],
      content: '',
      url: link.url,
    }));
}

/**
 * 解析 Yahoo Finance 的新闻
 * @param html Yahoo Finance 页面的 HTML
 * @param baseUrl 基础 URL，默认为 "https://finance.yahoo.com"
 */
export async function parseYahooNews(
  html: string,
  baseUrl: string = 'https://finance.yahoo.com',
): Promise<StockNews[]> {
  const selectors = ['#quoteNewsStreamContent a', 'ul li h3 a', 'section[data-test="qsp-news"] a'];

  for (const selector of selectors) {
    const links = await extractLinksFromHtml(html, selector, '/news/', baseUrl);

    const validNews = links
      .filter((l) => l.text.length > 10)
      .slice(0, 5)
      .map((link) => ({
        title: link.text,
        source: 'Yahoo Finance',
        date: 'Recently',
        content: '',
        url: link.url,
      }));

    if (validNews.length > 0) return validNews;
  }

  return [];
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

/** 单页最多取回的条数 */
const GOOGLE_SEARCH_MAX_RESULTS = 8;
/** 标题最短长度——比这短的多是页脚、分页之类的导航文字 */
const MIN_SEARCH_TITLE_LENGTH = 10;

/** 还原结果链接的真实地址（直接外链或 /url?q= 跳转）；google.com 自家链接与非 http 链接返回 null */
function resolveSearchResultUrl(href: string): string | null {
  const url = href.startsWith('/url?') ? new URLSearchParams(href.slice(5)).get('q') : href;
  if (!url || !/^https?:\/\//.test(url) || url.includes('google.com')) return null;
  return url;
}

/**
 * 从 Google News 搜索结果页面解析新闻列表。
 *
 * 标题只取**同一个 `<a>` 内部**的标题元素（新版 `role="heading"` / 基础版 `.vvjwJb`），
 * 拿不到标题的链接直接丢弃，不填占位。曾经的做法是「页面上任意非 google.com 外链 +
 * 全页另扫一遍标题、数量一致才对齐，否则填 `<symbol> 相关新闻 N`」——无结果页、验证页里
 * 的零星外链因此被伪造成新闻，毁掉 `fetchMarketBundle` 依赖的「查无此股 → 0 条」不变量
 * （数据源冒烟 run 36731049524）。再叠一层相关性过滤：Google 对引号查询也会放宽匹配，
 * 链接文本里没有标的识别词元的结果一律视为无关。
 */
export async function parseGoogleNewsSearch(html: string, symbol: string): Promise<StockNews[]> {
  // Google 查询用的就是原始输入（如 "0700.HK"），归一后的词元（"00700"）未必出现在结果里
  const tokens = [...relevanceTokens(symbol), symbol.trim().toLowerCase()];
  const anchors: { url: string; title: string; text: string }[] = [];
  let current: (typeof anchors)[number] | null = null;

  const appendTitle = {
    text(t: HTMLRewriterTypes.Text) {
      if (current) current.title += t.text;
    },
  };
  const rewriter = new HTMLRewriter()
    .on('a[href]', {
      element(el) {
        const url = resolveSearchResultUrl(el.getAttribute('href') ?? '');
        if (!url) return;
        const anchor = { url, title: '', text: '' };
        current = anchor;
        el.onEndTag(() => {
          anchors.push(anchor);
          current = null;
        });
      },
      text(t) {
        if (current) current.text += t.text;
      },
    })
    .on('a[href] [role="heading"]', appendTitle)
    .on('a[href] .vvjwJb', appendTitle);
  await rewriter.transform(new Response(html)).text();

  const seen = new Set<string>();
  const news: StockNews[] = [];
  for (const { url, title, text } of anchors) {
    const cleanTitle = title.replace(/\s+/g, ' ').trim();
    if (cleanTitle.length < MIN_SEARCH_TITLE_LENGTH || seen.has(url)) continue;
    const haystack = text.toLowerCase();
    if (!tokens.some((t) => haystack.includes(t))) continue;
    seen.add(url);
    news.push({
      title: cleanTitle,
      source: extractDomain(url),
      date: todayISO(),
      content: '',
      url,
    });
    if (news.length === GOOGLE_SEARCH_MAX_RESULTS) break;
  }
  return news;
}
