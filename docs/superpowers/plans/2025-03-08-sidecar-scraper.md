# Sidecar 数据抓取层实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个健壮的 Sidecar 数据抓取层，利用 Playwright 抓取股票相关新闻。

**Architecture:** 使用 Playwright-core 和 Chromium 浏览器进行抓取，并将抓取到的 HTML 转换为 Markdown 格式以便后续处理。抓取目标暂定为 Google Finance 的新闻。

**Tech Stack:** Playwright-core, node-html-markdown, Bun (test runner).

---

### Task 1: 安装 Sidecar 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装依赖**

Run: `bun add playwright-core node-html-markdown`

- [ ] **Step 2: 安装 Chromium 浏览器**

Run: `bun x playwright install chromium`

- [ ] **Step 3: 验证安装**

Run: `bun pm ls`
Expected: 包含 `playwright-core` 和 `node-html-markdown`

---

### Task 2: 定义数据抓取接口

**Files:**
- Create: `sidecar/types.ts`

- [ ] **Step 1: 创建 `sidecar/types.ts` 并定义接口**

```typescript
// 定义股票新闻接口
export interface StockNews {
  title: string;   // 新闻标题
  source: string;  // 新闻来源
  date: string;    // 发布日期
  content: string; // 新闻内容 (Markdown 格式)
  url: string;     // 新闻链接
}

// 定义分析 Payload 接口
export interface AnalysisPayload {
  symbol: string;  // 股票代码
  news: StockNews[]; // 相关新闻列表
}
```

- [ ] **Step 2: 验证文件创建**

Run: `ls sidecar/types.ts`
Expected: 文件存在

---

### Task 3: 实现爬虫逻辑

**Files:**
- Create: `sidecar/scraper.ts`

- [ ] **Step 1: 实现基于 Playwright 的抓取逻辑**

```typescript
import { chromium, Browser, Page } from 'playwright-core';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import { StockNews } from './types';

/**
 * 抓取股票相关新闻
 * @param symbol 股票代码 (例如: AAPL)
 * @returns 抓取到的新闻列表
 */
export async function scrapeStockNews(symbol: string): Promise<StockNews[]> {
  const browser: Browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page: Page = await context.newPage();
  
  const news: StockNews[] = [];
  const nhm = new NodeHtmlMarkdown();

  try {
    // 目标: Google Finance 新闻页
    const url = `https://www.google.com/finance/quote/${symbol}:NASDAQ`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 等待新闻部分加载 (示例选择器，可能需要根据实际页面调整)
    const newsSelector = 'div[data-async-context*="query:"] a, section:has-text("News") a';
    
    // 简单起见，我们抓取页面上可见的新闻卡片
    const newsElements = await page.locator('section:has-text("News") div > div > div > a').all();
    
    for (const el of newsElements.slice(0, 5)) { // 只取前 5 条
      try {
        const title = await el.locator('div:nth-child(2) > div:nth-child(2)').innerText();
        const source = await el.locator('div:nth-child(2) > div:nth-child(1)').innerText();
        const href = await el.getAttribute('href');
        const date = "Just now"; // Google Finance 页面结构复杂，这里简化处理
        
        if (title && href) {
          news.push({
            title: title.trim(),
            source: source.trim(),
            date,
            content: "", // 稍后抓取或由下游处理
            url: href.startsWith('http') ? href : `https://www.google.com${href}`
          });
        }
      } catch (e) {
        console.error(`解析新闻项失败: ${e}`);
      }
    }
  } catch (error) {
    console.error(`抓取 ${symbol} 新闻失败:`, error);
  } finally {
    await browser.close();
  }

  return news;
}
```

- [ ] **Step 2: 验证编译**

Run: `bun x tsc sidecar/scraper.ts --noEmit --esModuleInterop --skipLibCheck`
Expected: 无错误

---

### Task 4: 编写爬虫单元测试

**Files:**
- Create: `sidecar/scraper.test.ts`

- [ ] **Step 1: 编写单元测试**

```typescript
import { expect, test, describe } from "bun:test";
import { scrapeStockNews } from "./scraper";

describe("Scraper Tests", () => {
  test("应该能抓取 AAPL 的新闻", async () => {
    const news = await scrapeStockNews("AAPL");
    console.log(`抓取到 ${news.length} 条 AAPL 新闻`);
    
    expect(news.length).toBeGreaterThan(0);
    expect(news[0].title).toBeTruthy();
    expect(news[0].url).toContain("http");
  }, 60000); // 增加超时时间

  test("处理不存在的股票代码时应返回空列表", async () => {
    const news = await scrapeStockNews("NONEXISTENT_STOCK_12345");
    expect(news.length).toBe(0);
  }, 60000);
});
```

- [ ] **Step 2: 运行测试**

Run: `bun test sidecar/scraper.test.ts`
Expected: 所有测试通过

---

### Task 5: 提交代码

- [ ] **Step 1: 暂存并提交代码**

Run: `git add sidecar/ && git commit -m "feat: implement sidecar scraper with playwright"`
Expected: 成功提交
