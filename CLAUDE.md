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

# Build Sidecar binary (cross-platform, via build-script)
BUN_TARGET=bun-darwin-arm64 OUTFILE=src-tauri/bin/stockai-backend-aarch64-apple-darwin bun sidecar/build-script.ts

# Verify sidecar bundle integrity
bun scripts/verify-bundle.ts src-tauri/bin/stockai-backend-aarch64-apple-darwin

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
Sidecar 通过 `args.find(a => a.startsWith('{'))` 灵活定位 JSON 配置参数，经 `configResolver.ts` 的 `resolveConfig()` 解析和版本校验（`_version` 字段不匹配时抛出，提示用户重新保存配置）。字段为 camelCase：
`{ provider, apiKey, baseUrl, modelName, deepMode }`
前端 Settings 字段 `provider` 类型定义在 `shared/types.ts` 的 `ProviderType`：
`"openai" | "ollama" | "anthropic" | "deepseek" | "glm"`。
`deepseek` 与 `glm` 均走 OpenAI 兼容协议，在 `providers/registry.ts` 的工厂表中复用 `OpenAIProvider`，仅 `baseUrl`/`model` 默认值不同（集中在 `sidecar/config.ts` 的 `PROVIDER_PROFILES`）。

### 3. Sidecar (`sidecar/`)
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

前端 `src/components/PriceChart/` 是独立子系统：`ChartCanvas.tsx` 封装 TradingView lightweight-charts v4 主图（K 线 + MA + BOLL + 现价线 + "现"marker），`QuoteHeader` / `Toolbar` / `SubChart` / `CrosshairTooltip` 拆分页面区块，`index.tsx` 编排并通过 `useRealtimeQuote`（仅交易时段轮询）合并 K 线尾根与实时价。

## Key Conventions

- **Code comments**: All inline logic comments must be written in Simplified Chinese.
- **Component size**: UI component files must stay under 200 lines; extract complex logic into hooks.
- **Test decoupling**: 解析逻辑放在 `sidecar/parsers/` 目录（`exchange.ts` / `html.ts`），与网络层分离，离线测试见 `parsers/*.test.ts`。
- **Adding a scrape strategy**: 实现 `sidecar/strategies/base.ts` 的 `ScrapeStrategy`（纯 RSS / fetch 策略可直接实现；若需 Chromium，继承 `PlaywrightStrategy`），然后在 `sidecar/strategies/registry.ts` 的 `StrategyRegistry.strategies` 里追加一行。注意顺序：能跳过 Chromium 的策略尽量排前。
- **Adding an AI provider**: 若新 Provider 兼容 OpenAI 协议（如 deepseek/glm），只需在 `sidecar/config.ts` 的 `PROVIDER_PROFILES` 加默认值，再在 `providers/registry.ts` 的 `PROVIDER_FACTORIES` 表里追加一行复用 `OpenAIProvider`；协议不兼容时，在 `sidecar/providers/` 下新建文件实现 `AIProvider` 接口（`sidecar/ai.ts`）。最后同步更新 `shared/types.ts` 的 `ProviderType`。
- Sidecar stderr is for debug logging (Tauri pipes it to the terminal); stdout must only contain the final JSON output.

## Workflow

- Pre-push 钩子 (`lefthook.yml`) 跑 `tsc --noEmit` 与 `cargo check`。
- 开发期若想跳过 Tauri 外壳直接调 Sidecar，可运行 `bun scripts/sidecar-bridge.ts`（:3001 HTTP 端点）。浏览器 dev 模式下 `src/lib/ipc.ts` 自动走该桥接器，bridge 未启动时退回 mock 数据并 `console.warn` 一次（避免轮询刷屏）。

## Release Checklist

发版时必须按顺序完成以下所有步骤，缺一不可：

### 1. 版本号同步（4 个文件）

| 文件 | 字段 |
|------|------|
| `src-tauri/tauri.conf.json` | `version` |
| `src-tauri/Cargo.toml` | `version`（`[package]` 段） |
| `package.json` | `version` |
| `sidecar/package.json` | `version` |

### 2. CHANGELOG.md

在文件顶部插入新版本条目，格式：

```
## [x.y.z] - YYYY-MM-DD

### Added / Fixed / Changed
- ...
```

### 3. 确认 main 分支 CI 全绿

打 tag 前，必须确认 `main` 分支的所有 CI checks 均已通过：

```bash
gh run list --branch main --limit 5
```

若最新 run 状态不是 `completed / success`，**禁止打 tag**。找到失败的 job、修复后重新推送，等 CI 再次全绿后再继续。

### 4. 打 Tag 触发 Release CI

```bash
git tag vx.y.z
git push origin vx.y.z
```

CI（`release.yml`）会自动构建三平台产物并创建 **Draft Release**。

### 5. 发布 GitHub Release

CI 完成后，进入 GitHub → Releases → 编辑 Draft：
- **Release title**：`StockAI vx.y.z`
- **Release notes**：将 CHANGELOG.md 对应版本的条目内容粘贴进去（不只是链接）
- 确认产物（`.dmg` / `.deb` / `.msi`）已全部上传
- 点击 **Publish release**

### 6. 更新 GitHub 仓库 About

进入 GitHub → 仓库首页 → 右上角齿轮（Edit repository details）：
- **Description**：保持简短（≤ 100 字符），若有功能新增需同步更新
- **Website**：如有新的 landing page 或文档地址，一并更新
- **Topics**：若版本引入了新技术/新平台支持，追加对应 topic

### 7. 更新 GitHub Labels（按需）

若本版本引入了新的 issue 类型或工作流（如新增某 provider 的专属 bug 分类），进入 GitHub → Issues → Labels 添加对应标签。常规版本可跳过此步。
