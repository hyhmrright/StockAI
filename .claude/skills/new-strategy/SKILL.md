---
name: new-strategy
description: 在 sidecar/strategies/ 新增新闻抓取策略，完成 ScrapeStrategy 实现与 registry 注册
---

# 新增抓取策略

向用户询问以下信息（若已在请求中提供则跳过）：

- **策略 ID**：英文 kebab-case，如 `bing-news`
- **数据源**：URL 或 RSS/API 端点
- **类型**：纯 fetch（RSS/HTTP，无需浏览器）还是需要 Playwright 渲染
- **覆盖市场**：A 股 / 港股 / 美股 / 全部
- **期望顺序**：排在现有策略之前还是之后

## 实施步骤

### 1. 读取接口与参考实现

读 `sidecar/strategies/base.ts` 确认 `ScrapeStrategy` 接口与 `PlaywrightStrategy` 基类。按类型选参考：

- **纯 fetch 策略** → 参考 `google-news-rss.ts`（直接 `implements ScrapeStrategy`，**绝不调用 `ctx.getPage()`**，从而完全跳过 Chromium 启动，省 1–3 秒）
- **Playwright 策略** → 参考 `yahoo.ts`（`extends PlaywrightStrategy`，只需实现 `getUrl` 与 `parse`，基类已处理 goto / 超时 / 浏览器初始化失败的兜底）

### 2. 创建策略文件

`sidecar/strategies/<id>.ts`：

- **纯 fetch**：`export class XxxStrategy implements ScrapeStrategy`，提供 `readonly name` 与 `async scrape(symbol, ctx)`
- **Playwright**：`export class XxxStrategy extends PlaywrightStrategy`，实现 `getUrl(symbol)` 与 `protected parse(html, symbol)`，必要时覆盖 `getWaitUntil()`

三条硬约定：

- **对外 HTTP 一律经 `sidecar/http.ts` 的 `fetchWithPolicy(url, policy)`**。UA 与超时的唯一来源是 `config.ts` 的 `HTTP_DEFAULTS`——**不要在策略里另写 UA 字面量或 `AbortSignal.timeout(...)`**。
- **失败返回 `[]` 而非抛出**，让 registry 回退到下一策略。基类已对 Playwright 路径做了这层兜底；纯 fetch 策略要自己 try/catch。
- HTML 解析复用 `sidecar/parsers/html.ts`，别在策略里手搓正则。返回类型统一 `StockNews[]`（`from '../../shared/types'`）。
- 行内注释用**简体中文**。

### 3. 注册到 registry

`sidecar/strategies/registry.ts`：

```ts
import { XxxStrategy } from './<id>';
// StrategyRegistry.strategies 数组追加：
new XxxStrategy(),
```

**顺序原则**：能跳过 Chromium 的纯 fetch 策略排在 Playwright 策略之前（首个返回非空结果即停止）。

> ⚠️ `registry.test.ts` 断言 `GoogleNewsRSSStrategy` 位于索引 **0**。若新策略要插到最前面，需一并更新该断言——否则测试红。

### 4. 验证

```bash
cd sidecar && bun test strategies
bun tsc --noEmit
```

纯 fetch 策略**必须补一个离线解析测试**（参考 `google-news-rss.test.ts`）：把一份真实响应存成 fixture 字符串，经 `fetchImpl` 注入，断言解析结果。默认套件必须离线可跑——真网络断言只能进 `*.integration.ts`（只在 `bun run test:integration` 跑）。
