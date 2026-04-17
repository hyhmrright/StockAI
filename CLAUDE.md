# CLAUDE.md

## Commands

```bash
# Install dependencies
bun install

# Start development environment (Tauri + Vite)
bun tauri dev

# Build for production
bun tauri build

# Frontend unit tests (Vitest + happy-dom)
bunx vitest run

# Run a single frontend test file
bunx vitest run src/hooks/useAnalysis.test.ts

# Sidecar unit tests (Bun native, fast)
cd sidecar && bun test

# Run a single Sidecar test file
cd sidecar && bun test exchange.test.ts

# Sidecar integration tests (需要网络, 较慢, 可能 flaky)
cd sidecar && bun test scraper.integration.ts

# Rust tests
cd src-tauri && cargo test

# Build Sidecar binary (macOS ARM64)
bun build sidecar/index.ts --compile --outfile sidecar/stockai-backend-aarch64-apple-darwin

# Integration smoke test
bun scripts/smoke-test.ts
```

## Architecture

Three-layer architecture with strictly unidirectional dependencies: **UI → Tauri Core (Rust) → Sidecar (Bun)**

### 1. Frontend (`src/`)
React + TypeScript + Vite. The sole IPC entry point is `src/lib/ipc.ts`, which calls `invoke("start_analysis")`. Cross-layer DTO 类型定义在 `shared/types.ts`（唯一来源）。全局 Store 单例在 `src/lib/store.ts`，所有 Hook 共享同一实例。Core logic lives in `src/hooks/useAnalysis.ts`, which manages the `AnalysisStep` state machine (`idle → scraping → extracting → analyzing → completed | error`).

### 2. Tauri Core (`src-tauri/src/lib.rs`)
The Rust layer does exactly two things:
- Reads config from `settings.json` (`tauri-plugin-store`) and produces an `AppConfig` via the pure function `resolve_config()`
- Spawns the Sidecar subprocess, injects config as CLI args, captures stdout, and returns it to the frontend

**Config field mapping** (frontend → Rust → Sidecar):
Rust 层将 `AppConfig` 序列化为 JSON 字符串，作为 Sidecar 的第二个 CLI 参数传递。
Sidecar 通过 `JSON.parse(process.argv[3])` 解析，字段为 camelCase：
`{ provider, apiKey, baseUrl, modelName, deepMode }`
前端 Settings 字段 `provider` 类型定义在 `shared/types.ts` 的 `ProviderType`：
`"openai" | "ollama" | "anthropic" | "deepseek"`（deepseek 走 OpenAI 兼容协议）。

### 3. Sidecar (`sidecar/`)
A Bun process that reads JSON config from `process.argv[3]` and runs a two-step pipeline:
1. **Scrape** (`scraper.ts`): 按 `StrategyRegistry.getStrategies()` 顺序尝试策略，首个返回非空结果即停止。顺序为 RSS 优先（`strategies/google-news-rss.ts` 原生覆盖 A 股、绕过 reCAPTCHA），其次 Playwright 策略（`google-news.ts` / `google.ts` / `yahoo.ts`）。Chromium 懒启动——仅 Playwright 策略或深度正文提取才触发，纯 RSS 路径可节省 1–3 秒。`deepMode=true`（默认）时对前 3 条抽取正文。纯解析助手（HTML / 交易所识别）在 `sidecar/parsers/{html,exchange}.ts`，与网络层解耦。
2. **Analyze** (`analysis.ts`): Delegates provider creation to `providers/registry.ts` factory, then calls `provider.analyze()`. Prompt 构建逻辑统一在 `prompts.ts`，所有 Provider 共用。

The result is written as a JSON string to stdout, captured by Tauri, and returned to the frontend where it is parsed into `FullAnalysisResponse`.

## Key Conventions

- **Code comments**: All inline logic comments must be written in Simplified Chinese.
- **Component size**: UI component files must stay under 200 lines; extract complex logic into hooks.
- **Test decoupling**: 解析逻辑放在 `sidecar/parsers/` 目录（`exchange.ts` / `html.ts`），与网络层分离，离线测试见 `parsers/*.test.ts`。
- **Adding a scrape strategy**: 实现 `sidecar/strategies/base.ts` 的 `ScrapeStrategy`（纯 RSS / fetch 策略可直接实现；若需 Chromium，继承 `PlaywrightStrategy`），然后在 `sidecar/strategies/registry.ts` 的 `StrategyRegistry.strategies` 里追加一行。注意顺序：能跳过 Chromium 的策略尽量排前。
- **Adding an AI provider**: Implement the `AIProvider` interface (defined in `sidecar/ai.ts`) in a new file under `sidecar/providers/`, then register it in `providers/registry.ts` 的 `createProvider()` 工厂函数中。
- Sidecar stderr is for debug logging (Tauri pipes it to the terminal); stdout must only contain the final JSON output.

## Workflow

- Pre-push 钩子 (`lefthook.yml`) 跑 `tsc --noEmit` 与 `cargo check`。
- 开发期若想跳过 Tauri 外壳直接调 Sidecar，可运行 `bun scripts/sidecar-bridge.ts`（:3001 HTTP 端点）。
