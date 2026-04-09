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

# Sidecar tests (Bun native)
cd sidecar && bun test

# Run a single Sidecar test file
cd sidecar && bun test scraper.test.ts

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
React + TypeScript + Vite. The sole IPC entry point is `src/lib/ipc.ts`, which calls `invoke("start_analysis")`. Cross-layer DTO 类型定义在 `shared/types.ts`（唯一来源），前端通过 `src/lib/api-types.ts` 重新导出。全局 Store 单例在 `src/lib/store.ts`，所有 Hook 共享同一实例。Core logic lives in `src/hooks/useAnalysis.ts`, which manages the `AnalysisStep` state machine (`idle → scraping → extracting → analyzing → completed | error`).

### 2. Tauri Core (`src-tauri/src/lib.rs`)
The Rust layer does exactly two things:
- Reads config from `settings.json` (`tauri-plugin-store`) and produces an `AppConfig` via the pure function `resolve_config()`
- Spawns the Sidecar subprocess, injects config as CLI args, captures stdout, and returns it to the frontend

**Config field mapping** (frontend → Rust → Sidecar):
Rust 层将 `AppConfig` 序列化为 JSON 字符串，作为 Sidecar 的第二个 CLI 参数传递。
Sidecar 通过 `JSON.parse(process.argv[3])` 解析，字段为 camelCase：
`{ provider, apiKey, baseUrl, modelName, deepMode }`
前端 Settings 接口字段 `provider`（"openai" | "ollama"）对应 Rust `AppConfig.provider`。

### 3. Sidecar (`sidecar/`)
A Bun process that reads JSON config from `process.argv[3]` and runs a two-step pipeline:
1. **Scrape** (`scraper.ts`): Uses Playwright + Strategy pattern (`strategies/google.ts`, `strategies/yahoo.ts`) to fetch news. When `deepMode=true` (default), extracts full article content for the first 3 results. HTML parsing helpers live in `strategies/parsers.ts`.
2. **Analyze** (`analysis.ts`): Delegates provider creation to `providers/registry.ts` factory, then calls `provider.analyze()`. Prompt 构建逻辑统一在 `prompts.ts`，所有 Provider 共用。

The result is written as a JSON string to stdout, captured by Tauri, and returned to the frontend where it is parsed into `FullAnalysisResponse`.

## Key Conventions

- **Code comments**: All inline logic comments must be written in Simplified Chinese.
- **Component size**: UI component files must stay under 200 lines; extract complex logic into hooks.
- **Test decoupling**: Parser logic (`strategies/parsers.ts`) must be separated from network requests and tested offline in `strategies/parsers.test.ts`.
- **Adding a scrape strategy**: Extend the `ScrapeStrategy` interface in `sidecar/strategies/base.ts` and register the instance in the `strategies` array in `scraper.ts`.
- **Adding an AI provider**: Implement the `AIProvider` interface (defined in `sidecar/ai.ts`) in a new file under `sidecar/providers/`, then register it in `providers/registry.ts` 的 `createProvider()` 工厂函数中。
- Sidecar stderr is for debug logging (Tauri pipes it to the terminal); stdout must only contain the final JSON output.
