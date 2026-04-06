# 抽象 Scraper 策略助手实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提取 Google/Yahoo 抓取策略中的通用 Playwright 提取逻辑到 `sidecar/strategies/utils.ts`，减少重复代码。

**Architecture:** 实现一个 `extractLinks` 助手函数，封装 URL 补全、去重、文本分行和过滤逻辑。

**Tech Stack:** TypeScript, Playwright, Bun (Test runner)

---

### Task 1: 基础环境检查

**Files:**
- Test: `sidecar/scraper.test.ts`

- [ ] **Step 1: 运行现有测试确保基准通过**

Run: `cd sidecar && ~/.bun/bin/bun test scraper.test.ts`
Expected: PASS (AAPL 新闻抓取成功)

### Task 2: 实现 `sidecar/strategies/utils.ts`

**Files:**
- Create: `sidecar/strategies/utils.ts`

- [ ] **Step 1: 创建文件并实现 `extractLinks`**

```typescript
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
```

- [ ] **Step 2: 验证编译 (无报错即认为通过)**

### Task 3: 重构 `sidecar/strategies/google.ts`

**Files:**
- Modify: `sidecar/strategies/google.ts`

- [ ] **Step 1: 使用 `extractLinks` 重写抓取逻辑**

```typescript
import { Page } from 'playwright-core';
import { StockNews } from '../types';
import { ScrapeStrategy } from './base';
import { extractLinks } from './utils';

/**
 * Google Finance 抓取策略
 */
export class GoogleStrategy implements ScrapeStrategy {
  name = "Google Finance";

  canHandle(url: string): boolean {
    return url.includes("google.com/finance");
  }

  async scrape(page: Page, symbol: string): Promise<StockNews[]> {
    console.error(`正在通过 Google Finance 策略抓取 ${symbol}...`);
    const googleUrl = `https://www.google.com/finance/quote/${symbol}:NASDAQ`;
    
    try {
      await page.goto(googleUrl, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1000);

      // 使用助手函数提取链接
      const links = await extractLinks(
        page, 
        'a[href*="/news/"]', 
        '/news/', 
        'https://www.google.com'
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
    } catch (error) {
      console.error(`Google Finance 抓取异常:`, error);
      return [];
    }
  }
}
```

### Task 4: 重构 `sidecar/strategies/yahoo.ts`

**Files:**
- Modify: `sidecar/strategies/yahoo.ts`

- [ ] **Step 1: 使用 `extractLinks` 简化逻辑**

```typescript
import { Page } from 'playwright-core';
import { StockNews } from '../types';
import { ScrapeStrategy } from './base';
import { extractLinks } from './utils';

/**
 * Yahoo Finance 抓取策略
 */
export class YahooStrategy implements ScrapeStrategy {
  name = "Yahoo Finance";

  canHandle(url: string): boolean {
    return url.includes("finance.yahoo.com");
  }

  async scrape(page: Page, symbol: string): Promise<StockNews[]> {
    console.error(`正在通过 Yahoo Finance 策略抓取 ${symbol}...`);
    const yahooUrl = `https://finance.yahoo.com/quote/${symbol}`;
    
    try {
      await page.goto(yahooUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1000);

      const selectors = [
        '#quoteNewsStreamContent a',
        'ul li h3 a',
        'section[data-test="qsp-news"] a'
      ];

      for (const selector of selectors) {
        // 使用助手函数提取链接
        const links = await extractLinks(
          page, 
          selector, 
          '/news/', 
          'https://finance.yahoo.com'
        );

        // 过滤标题过短的链接并映射
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
    } catch (error) {
      console.error(`Yahoo Finance 抓取异常:`, error);
      return [];
    }
  }
}
```

### Task 5: 最终验证与提交

- [ ] **Step 1: 运行所有 Sidecar 测试**

Run: `cd sidecar && ~/.bun/bin/bun test`
Expected: 全部测试通过 (包括 scraper.test.ts)

- [ ] **Step 2: 提交代码**

```bash
git add sidecar/strategies/utils.ts sidecar/strategies/google.ts sidecar/strategies/yahoo.ts
git commit -m "refactor: abstract common scraping utilities to reduce knowledge duplication"
```
