import { Page } from 'playwright-core';

/**
 * 提取链接的信息接口
 */
export interface ExtractedLink {
  url: string;    // 完整 URL
  text: string;   // 原始 innerText (已去除首尾空格)
  lines: string[]; // 按行拆分并清洗后的文本
}

/**
 * 通用的 Playwright 链接提取助手
 * 自动处理：URL 补全、基于 URL 去重、文本分行处理、空值过滤
 * 
 * @param page Playwright Page 对象
 * @param selector CSS 选择器
 * @param urlFilter URL 过滤器（包含此字符串或匹配此正则则保留）
 * @param baseUrl 用于补全相对路径的基础 URL (例如 "https://www.google.com")
 */
export async function extractLinks(
  page: Page,
  selector: string,
  urlFilter: string | RegExp,
  baseUrl: string
): Promise<ExtractedLink[]> {
  const elements = await page.locator(selector).all();
  const results: ExtractedLink[] = [];
  const seenUrls = new Set<string>();

  for (const el of elements) {
    const href = await el.getAttribute('href');
    if (!href) continue;

    // 处理 URL 补全 (支持相对路径、以 . 开头的路径等)
    let fullUrl = href;
    if (!href.startsWith('http')) {
      const path = href.startsWith('.') ? href.substring(1) : href;
      const cleanBase = baseUrl.replace(/\/+$/, '');
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      fullUrl = `${cleanBase}${cleanPath}`;
    }

    // URL 过滤
    if (urlFilter instanceof RegExp) {
      if (!urlFilter.test(fullUrl)) continue;
    } else {
      if (!fullUrl.includes(urlFilter)) continue;
    }

    // 基于 URL 去重
    if (seenUrls.has(fullUrl)) continue;
    seenUrls.add(fullUrl);

    // 提取并处理文本
    const rawText = await el.innerText();
    const lines = rawText.split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // 过滤掉完全没有内容的链接
    if (lines.length === 0 && rawText.trim().length === 0) continue;

    results.push({
      url: fullUrl,
      text: rawText.trim(),
      lines
    });
  }

  return results;
}
