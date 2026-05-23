# StockAI Architecture

Three-layer architecture with strictly unidirectional dependencies: **UI → Tauri Core (Rust) → Sidecar (Bun)**

## 1. Frontend (`src/`)

React + TypeScript + Vite. The sole IPC entry point is `src/lib/ipc.ts`, which calls `invoke("start_analysis")`。Dev-only mock 数据集中在 `src/lib/dev-mocks.ts`，仅在浏览器模式且 sidecar-bridge 未启动时使用。Cross-layer DTO 类型定义在 `shared/types.ts`（唯一来源），跨层共享的市场识别函数 `detectMarket` 在 `shared/market.ts`（前端与 Sidecar 各自 re-export）。全局 Store 单例在 `src/lib/store.ts`，所有 Hook 共享同一实例。Core logic lives in `src/hooks/useAnalysis.ts`, which manages the `AnalysisStep` state machine (`idle → scraping → completed | error`).

## 2. Tauri Core (`src-tauri/src/lib.rs`)

The Rust layer does exactly two things:
- Reads config from `settings.json` (`tauri-plugin-store`) and produces an `AppConfig` via the pure function `resolve_config()`
- Spawns the Sidecar subprocess, injects config as CLI args, captures stdout, and returns it to the frontend

**Config field mapping** (frontend → Rust → Sidecar):
Rust 层将 `AppConfig` 序列化为 JSON 字符串，作为 Sidecar 的第二个 CLI 参数传递。
Sidecar 通过 `args.find(a => a.startsWith('{'))` 灵活定位 JSON 配置参数，经 `configResolver.ts` 的 `resolveConfig()` 解析和版本校验（`_version` 字段不匹配时抛出，提示用户重新保存配置）。字段为 camelCase：
`{ provider, apiKey, baseUrl, modelName, deepMode }`
前端 Settings 字段 `provider` 类型定义在 `shared/types.ts` 的 `ProviderType`：
`"openai" | "ollama" | "anthropic" | "deepseek" | "glm"`。
`deepseek` 与 `glm` 均走 OpenAI 兼容协议，在 `providers/registry.ts` 的工厂表中复用 `OpenAIProvider`，仅 `baseUrl`/`model` 默认值不同（集中在 `sidecar/config.ts` 的 `PROVIDER_PROFILES`）。

## 3. Sidecar (`sidecar/`)

A Bun process that reads JSON config from `process.argv[3]` and runs a two-step pipeline:
1. **Scrape** (`scraper.ts`): 按 `StrategyRegistry.getStrategies()` 顺序尝试策略，首个返回非空结果即停止。顺序为 RSS 优先（`strategies/google-news-rss.ts` 原生覆盖 A 股、绕过 reCAPTCHA），其次 Playwright 策略（`google-news.ts` / `google.ts` / `yahoo.ts`）。Chromium 懒启动——仅 Playwright 策略或深度正文提取才触发，纯 RSS 路径可节省 1–3 秒。`deepMode=true`（默认）时对前 3 条抽取正文。纯解析助手（HTML / 交易所识别）在 `sidecar/parsers/{html,exchange}.ts`，与网络层解耦。
2. **Analyze** (`analysis.ts`): Delegates provider creation to `providers/registry.ts` factory, then calls `provider.analyze()`. Prompt 构建逻辑统一在 `prompts.ts`，所有 Provider 共用。

The result is written as a JSON string to stdout, captured by Tauri, and returned to the frontend where it is parsed into `FullAnalysisResponse`.

**Sidecar CLI actions**（`sidecar/index.ts` 按 `process.argv` 分发，所有 handler 集中在 `cli-handlers.ts`）：
- 无标志（默认）：`<symbol> <config-json>` → 完整 scrape+analyze pipeline
- `--kline <request-json>`：拉取 K 线，多源容错（`sidecar/kline/` 下 eastmoney / tencent / yahoo 顺序回退）
- `--quote <symbol>`：拉取实时报价
- `--info <config-json> <symbol>` / `--search <config-json> <keyword>` / `--list-models <config-json>`：辅助查询
- `--check`：健康自检（仅触发 BrowserManager 启动验证）

## PriceChart Subsystem

前端 `src/components/PriceChart/` 是独立子系统：`ChartCanvas.tsx` 封装 TradingView lightweight-charts v4 主图（K 线 + MA + BOLL + 现价线 + "现"marker），`QuoteHeader` / `Toolbar` / `SubChart` / `CrosshairTooltip` 拆分页面区块，`index.tsx` 编排并通过 `useRealtimeQuote`（仅交易时段轮询）合并 K 线尾根与实时价。
