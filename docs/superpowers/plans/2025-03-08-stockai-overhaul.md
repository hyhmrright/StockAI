# StockAI 全面升级计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现从 UI 配置到 Sidecar 分析的完整闭环，并参考 Cherry Studio 风格提升抓取能力和视觉体验。

**Architecture:** 采用“Tauri 调度中心”模式，由 Rust 读取配置并注入 Sidecar；Sidecar 内部重构为策略模式以支持多源抓取。

**Tech Stack:** Tauri (Rust), React (TS), Bun, Playwright, TailwindCSS.

---

### Task 1: Rust 端配置读取与注入

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `sidecar/index.ts`
- Modify: `sidecar/analysis.ts`

- [ ] **Step 1: 修改 Rust `start_analysis` 命令以读取 Store**
在 `lib.rs` 中，从 `tauri-plugin-store` 读取 `settings.json`。

```rust
// src-tauri/src/lib.rs
#[tauri::command]
async fn start_analysis(app_handle: tauri::AppHandle, symbol: String) -> Result<String, String> {
    use tauri_plugin_store::StoreExt;
    use serde_json::Value;

    // 读取配置
    const STORE_PATH: &str = "settings.json";
    let stores = app_handle.store(STORE_PATH);
    let settings = stores.get("app_settings").unwrap_or(Value::Null);

    let api_key = settings["apiKey"].as_str().unwrap_or("");
    let model_type = settings["model"].as_str().unwrap_or("openai");
    let base_url = settings["baseUrl"].as_str().unwrap_or("");
    let model_name = settings["ollamaModel"].as_str().unwrap_or("gpt-4o");

    // 启动 sidecar 并传入参数
    let sidecar_command = app_handle
        .shell()
        .sidecar("stockai-backend")
        .map_err(|e| format!("无法找到 Sidecar: {}", e))?
        .args(&[
            symbol, 
            model_type.to_string(), 
            api_key.to_string(), 
            base_url.to_string(), 
            model_name.to_string()
        ]);
    // ... 保持原有 spawn 逻辑
    Ok("".into()) // Dummy return for plan structure
}
```

- [ ] **Step 2: 更新 Sidecar 入口以接收新参数**

```typescript
// sidecar/index.ts
async function main() {
  const [,, symbol, provider, apiKey, baseUrl, model] = process.argv;
  // ...
  const result = await performFullAnalysis(symbol, provider as any, {
    apiKey,
    baseUrl,
    model
  });
  // ...
}
```

- [ ] **Step 3: 提交更改**
`git commit -m "arch: implement config injection from tauri to sidecar"`

---

### Task 2: 抓取器重构为策略模式 (Scraper Strategies)

**Files:**
- Create: `sidecar/strategies/base.ts`
- Create: `sidecar/strategies/google.ts`
- Create: `sidecar/strategies/yahoo.ts`
- Modify: `sidecar/scraper.ts`

- [ ] **Step 1: 定义基础策略接口**

```typescript
// sidecar/strategies/base.ts
import { Page } from 'playwright-core';
import { StockNews } from '../types';

export interface ScrapeStrategy {
  name: string;
  canHandle(url: string): boolean;
  scrape(page: Page, symbol: string): Promise<StockNews[]>;
}
```

- [ ] **Step 2: 迁移 Google Finance 逻辑到独立策略**
- [ ] **Step 3: 迁移 Yahoo Finance 逻辑到独立策略**
- [ ] **Step 4: 在 `scraper.ts` 中实现策略调度**

```typescript
// sidecar/scraper.ts
export async function scrapeStockNews(symbol: string): Promise<StockNews[]> {
  const strategies: ScrapeStrategy[] = [new GoogleStrategy(), new YahooStrategy()];
  // ... 轮询策略直到获取结果
}
```

- [ ] **Step 5: 提交更改**
`git commit -m "refactor: implement scraper strategy pattern"`

---

### Task 3: 增加正文提取功能

**Files:**
- Modify: `sidecar/scraper.ts`

- [ ] **Step 1: 实现深度抓取逻辑**
对于抓取到的每个新闻链接，可选地进入详情页提取正文。

```typescript
// 伪代码思路
async function extractFullContent(page: Page, url: string): Promise<string> {
  await page.goto(url);
  // 使用简单的启发式算法提取最大文本块
  return await page.evaluate(() => {
    const article = document.querySelector('article') || document.body;
    return article.innerText.substring(0, 2000); // 限制长度
  });
}
```

- [ ] **Step 2: 提交更改**
`git commit -m "feat: add news body extraction for deeper analysis"`

---

### Task 4: UI/UX 升级 (Cherry Studio 风格)

**Files:**
- Modify: `src/components/SettingsModal.tsx`
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: 重做设置中心 UI**
改为左侧侧边栏导航，右侧内容区的布局。增加“测试连接”按钮。

- [ ] **Step 2: 增加分析状态指示器**
在 `Dashboard` 增加 Step-by-step 的状态展示（抓取中 -> 提取正文中 -> AI 分析中）。

- [ ] **Step 3: 提交更改**
`git commit -m "ui: overhaul settings and dashboard with modern desktop aesthetics"`
