# StockAI Architecture

Three-layer architecture with strictly unidirectional dependencies: **UI → Tauri Core (Rust) → Sidecar (Bun)**

## 1. Frontend (`src/`)

React + TypeScript + Vite. The sole IPC entry point is `src/lib/ipc.ts`, which calls `invoke("start_analysis")`。Dev-only mock 数据集中在 `src/lib/dev-mocks.ts`，仅在浏览器模式且 sidecar-bridge 未启动时使用。Cross-layer DTO 类型定义在 `shared/types.ts`（唯一来源），跨层共享的市场识别函数 `detectMarket` 在 `shared/market.ts`（前端与 Sidecar 各自 re-export）。全局 Store 单例在 `src/lib/store.ts`，所有 Hook 共享同一实例。Core logic lives in `src/hooks/useAnalysis.ts`, which manages the `AnalysisStep` state machine (`idle → scraping → completed | error`).

## 2. Tauri Core (`src-tauri/src/lib.rs`)

The Rust layer does three things:
- Reads config from `settings.json` (`tauri-plugin-store`) and produces an `AppConfig` via the pure function `resolve_config()`
- Spawns the Sidecar subprocess, injects config as CLI args, captures stdout, and returns it to the frontend
- 桌面端（`#[cfg(desktop)]`）注册 `tauri-plugin-updater` + `tauri-plugin-process`，支撑应用内自动更新（前端 `src/hooks/useUpdater.ts` + `UpdateBanner`/`settings/UpdateChecker`，启动静默检查 + 设置页手动按钮）。更新源与签名运维见 `release-checklist.md`。

**Config field mapping** (frontend → Rust → Sidecar):
Rust 层将 `AppConfig` 序列化为 JSON 字符串，作为 Sidecar 的第二个 CLI 参数传递。
Sidecar 通过 `args.find(a => a.startsWith('{'))` 灵活定位 JSON 配置参数，经 `configResolver.ts` 的 `resolveConfig()` 解析和版本校验（`_version` 字段不匹配时抛出，提示用户重新保存配置）。字段为 camelCase：
`{ provider, apiKey, baseUrl, modelName, deepMode }`
前端 Settings 字段 `provider` 类型定义在 `shared/types.ts` 的 `ProviderType`：
`"openai" | "ollama" | "anthropic" | "deepseek" | "glm"`。
`deepseek` 与 `glm` 均走 OpenAI 兼容协议，在 `providers/registry.ts` 的工厂表中复用 `OpenAIProvider`，仅 `baseUrl`/`model` 默认值不同（定义在 `shared/constants.ts` 的 `PROVIDER_PROFILES`，`sidecar/config.ts` 仅 re-export）。

## 3. Sidecar (`sidecar/`)

A Bun process that reads JSON config from `process.argv[3]` and runs a two-step pipeline:
1. **Scrape** (`scraper.ts`): 按 `StrategyRegistry.getStrategies()` 顺序尝试策略，首个返回非空结果即停止。顺序为 RSS 优先（`strategies/google-news-rss.ts` 原生覆盖 A 股、绕过 reCAPTCHA），其次 Playwright 策略（`google-news.ts` / `google.ts` / `yahoo.ts`）。Chromium 懒启动——仅 Playwright 策略或深度正文提取才触发，纯 RSS 路径可节省 1–3 秒。`deepMode=true`（默认）时对前 3 条抽取正文。纯解析助手（HTML / 交易所识别）在 `sidecar/parsers/{html,exchange}.ts`，与网络层解耦。
2. **Analyze** (`analysis.ts`): Delegates provider creation to `providers/registry.ts` factory, then calls `provider.analyze()`. Prompt 构建逻辑统一在 `prompts.ts`，所有 Provider 共用。

The result is written as a JSON string to stdout, captured by Tauri, and returned to the frontend where it is parsed into `FullAnalysisResponse`.

**Sidecar CLI actions**（`sidecar/index.ts` 按 `process.argv` 分发，所有 handler 集中在 `cli-handlers.ts`）：
- 无标志（默认）：`<symbol> <config-json>` → 完整 scrape+analyze pipeline
- `--bundle <config-json> <symbol>`：仅抓取新闻，将结果写入临时文件并返回路径；供 `--analyze-only` 读取（Rust 两阶段调用，规避 macOS ARG_MAX 限制）
- `--analyze-only <config-json> <symbol> <news_tmp_path> [quant_json]`：读取临时文件中的新闻直接进入 AI 分析，不重新抓取
- `--quant <symbol>`：仅执行量化评分（技术面/基本面/估值/波动率），返回 QuantResult JSON
- `--backtest <symbol>`：执行策略回测，返回 BacktestResult JSON
- `--kline <request-json>`：拉取 K 线，多源容错（`sidecar/kline/` 下 eastmoney / tencent / yahoo 顺序回退）
- `--quote <symbol>`：拉取实时报价
- `--info <config-json> <symbol>` / `--search <config-json> <keyword>` / `--list-models <config-json>`：辅助查询
- `--check`：健康自检（仅触发 BrowserManager 启动验证）

## Multi-Agent 系统（`sidecar/agents/`）

13 位投资大师 Agent（巴菲特、芒格、格雷厄姆、伯里、伍德等）各自持有独立的分析视角，统一实现 `MasterAgent` 接口（`agents/types.ts`）。数据流：`agents/registry.ts`（注册表）→ `agents/synthesizer.ts`（聚合评分）→ `agents/sentiment.ts`（情绪综合）。新增大师：在 `agents/masters/` 实现接口，然后在 `agents/registry.ts` 追加一行。`agents/chat-adapter.ts` 负责适配各 AI provider 的对话格式。

## 量化评分子系统（`sidecar/quant/`）

四个维度独立评分：`technical.ts` / `fundamental.ts` / `valuation.ts` / `volatility.ts`，由 `scoring.ts` 聚合为 `QuantResult`（类型定义在 `quant/types.ts`）。入口：`quant/index.ts`。通过 `--quant <symbol>` CLI flag 触发，前端对应 `useQuantData` hook 和 `QuantScoreCard` 组件。

## 回测引擎（`sidecar/backtest/`）

`engine.ts` 实现策略回测逻辑，类型定义在 `backtest/types.ts`。通过 `--backtest <symbol>` CLI flag 触发，前端对应 `src/components/Backtest/BacktestPanel.tsx`。

## PriceChart Subsystem

前端 `src/components/PriceChart/` 是独立子系统：`ChartCanvas.tsx` 封装 TradingView lightweight-charts v4 主图（K 线 + MA + BOLL + 现价线 + "现"marker），`QuoteHeader` / `Toolbar` / `SubChart` / `CrosshairTooltip` 拆分页面区块，`index.tsx` 编排并通过 `useRealtimeQuote`（仅交易时段轮询）合并 K 线尾根与实时价。
