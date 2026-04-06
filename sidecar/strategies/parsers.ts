import { StockNews } from '../types';

/**
 * 提取链接的信息接口
 */
export interface ExtractedLink {
  url: string;    // 完整 URL
  text: string;   // 原始 innerText
  lines: string[]; // 按行拆分并清洗后的文本
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

      // 处理 URL 补全
      let fullUrl = href;
      if (!href.startsWith('http')) {
        const path = href.startsWith('.') ? href.substring(1) : href;
        const cleanBase = baseUrl.replace(/\/+$/, '');
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        fullUrl = `${cleanBase}${cleanPath}`;
      }

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
          const rawText = currentLink.text;
          const lines = rawText.split('\n')
            .map(s => s.trim())
            .filter(s => s.length > 0);

          if (lines.length > 0 || rawText.trim().length > 0) {
            results.push({
              url: currentLink.url,
              text: rawText.trim(),
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
  const links = await extractLinksFromHtml(
    html,
    'a[href*="/news/"]',
    '/news/',
    baseUrl
  );

  // 映射为 StockNews 格式，并限制数量
  return links
    .filter(link => link.lines.length >= 2)
    .slice(0, 5)
    .map(link => ({
      title: link.lines.find(l => l.length > 20) || link.lines[1], // 较长的行通常是标题
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
