---
name: new-strategy
description: 在 sidecar/strategies/ 新增新闻抓取策略，自动完成 ScrapeStrategy 实现和 registry 注册
---

# 新增抓取策略

向用户询问以下信息（若已在请求中提供则跳过）：
- **策略 ID**：英文 kebab-case，如 `bing-news`
- **数据源**：URL 或 RSS/API 端点
- **类型**：纯 fetch（RSS/HTTP，无需浏览器）还是需要 Playwright 渲染
- **覆盖市场**：A 股 / 港股 / 美股 / 全部

## 实施步骤

### 1. 读取接口与参考实现

读取 `sidecar/strategies/base.ts` 确认 `ScrapeStrategy` 接口与 `PlaywrightStrategy` 基类。按类型选参考：
- **纯 fetch 策略** → 参考 `sidecar/strategies/google-news-rss.ts`（直接 `implements ScrapeStrategy`，**绝不调用** `ctx.getPage()`，从而跳过 Chromium 启动）
- **Playwright 策略** → 参考 `sidecar/strategies/yahoo.ts`（`extends PlaywrightStrategy`，只需实现 `getUrl` 与 `parse`）

### 2. 创建策略文件

在 `sidecar/strategies/<id>.ts` 新建：
- 纯 fetch：`export class XxxStrategy implements ScrapeStrategy`，提供 `readonly name` 与 `async scrape(symbol, ctx)`，HTML 解析复用 `sidecar/parsers/html.ts`
- Playwright：`export class XxxStrategy extends PlaywrightStrategy`，实现 `getUrl(symbol)` 与 `parse(html, symbol)`，必要时覆盖 `getWaitUntil()`
- 返回类型统一为 `StockNews[]`（`shared/types.ts`）；失败时返回 `[]` 而非抛出，让 registry 回退到下一策略

### 3. 注册到 registry

在 `sidecar/strategies/registry.ts`：
- 顶部 `import { XxxStrategy } from './<id>';`
- 在 `StrategyRegistry.strategies` 数组追加 `new XxxStrategy()`
- **顺序原则**：能跳过 Chromium 的纯 fetch 策略排在 Playwright 策略前面（首个返回非空结果即停止，纯 RSS 路径可省 1–3 秒）

### 4. 验证

```bash
cd sidecar && bun test strategies
```

确认无类型错误、无测试失败后完成。如新增的是纯 fetch 策略，建议补一个离线解析测试（参考 `google-news-rss.test.ts`），不依赖网络。
