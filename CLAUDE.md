# CLAUDE.md

## Commands

```bash
# Install dependencies
bun install

# Start development environment (Tauri + Vite)
bun tauri dev

# Build for production
bun tauri build

# 一键跑全部单元测试（聚合 vitest + sidecar bun test，自带超时不依赖 GNU `timeout`）
bun run test

# 同上但额外跑 sidecar 集成测试（需要网络）
bun run test:integration

# 单独跑前端 vitest
bunx vitest run

# Run a single frontend test file
bunx vitest run src/hooks/useAnalysis.test.ts

# 单独跑 sidecar 单元测试
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

# 代码格式化（biome，仅源码 ts/tsx）；--check 版只校验不写盘（pre-push 门禁用）
bun run format
bun run format:check
```

## Architecture

Three-layer architecture: **UI → Tauri Core (Rust) → Sidecar (Bun)**

`shared/` 目录是跨层唯一来源：`types/`（DTO 类型，按上下文分文件 + barrel，一律 `from '../shared/types'`）、`actions.ts`（Sidecar CLI 动作清单，三层布线的单一来源）、`market.ts`（`detectMarket` 函数）、`constants.ts`（默认大师列表等）。前端与 Sidecar 各自 re-export，**不得在各层重复定义**。

新增 Sidecar 能力只需三处：`shared/actions.ts` 加一条 + `sidecar/cli-handlers/` 对应领域文件实现 handler + `sidecar/index.ts` 的 `DISPATCH` 加一行——Rust（泛化 `invoke_sidecar`）与 `src/lib/ipc.ts` 的调用管道无需改动。

详细架构说明见 `.claude/rules/architecture.md`（需要时 Read 该文件）。

## Key Conventions

- **Code comments**: All inline logic comments must be written in Simplified Chinese.
- **Component size**: UI component files must stay under 200 lines; extract complex logic into hooks.
- **Test decoupling**: 解析逻辑放在 `sidecar/parsers/` 目录（`exchange.ts` / `html.ts`），与网络层分离，离线测试见 `parsers/*.test.ts`。抓取链路统一暴露 `fetchImpl` 注入点（`KlineSourceDeps` / `SearchDeps` / `QuantDeps` 同形），默认套件**必须离线可跑**；真网络断言放 `*.integration.ts`（只在 `bun run test:integration` 跑）。
- **Outbound HTTP**: 一律经 `sidecar/http.ts` 的 `fetchWithPolicy(url, policy)`，UA 与超时的唯一来源是 `sidecar/config.ts` 的 `HTTP_DEFAULTS`。**不要在数据源模块另写 UA 字面量或 `AbortSignal.timeout(...)`**。
- **Frontend async hooks**: 「按 symbol 取数」复用 `useSymbolFetch`，「按 symbol 缓存异步结果」复用 `useSymbolScopedAsync`（含竞态守卫 + LRI 限容），不要再手搓一份。
- **Adding a K-line source**: 在 `sidecar/kline/index.ts` 的 `KLINE_SOURCES[市场]` 数组追加一行即可（依次尝试、首个成功即返回），不必改控制流。
- **Adding a scrape strategy**: 实现 `sidecar/strategies/base.ts` 的 `ScrapeStrategy`，然后在 `sidecar/strategies/registry.ts` 的 `StrategyRegistry.strategies` 追加一行。能跳过 Chromium 的策略尽量排前。
- **Adding an AI provider**: 兼容 OpenAI 协议时，在 `shared/constants.ts` 的 `PROVIDER_PROFILES` 加默认值（`sidecar/config.ts` 仅 re-export，勿在此加）+ `providers/registry.ts` 的 `PROVIDER_FACTORIES` 追加一行；协议不兼容时在 `sidecar/providers/` 实现 `AIProvider` 接口（`sidecar/ai.ts`）。最后同步 `shared/types/provider.ts` 的 `ProviderType`。
- **i18n**: 多语言通过 `Language` 类型（`shared/types`）传递；前端用 `useLanguage()` hook 获取翻译函数；`src/i18n/zh.json` 是翻译 key 的 TypeScript 类型来源（编译期校验），新增 UI 文字须先在此文件加 key。
- Sidecar stderr is for debug logging; stdout must only contain the final JSON output.
- **构建期依赖，勿当死依赖删**：`chromium-bidi` 在全仓源码里零引用，但 `bun build --compile` 会静态解析 `playwright-core/lib/coreBundle.js` 里的 `require("chromium-bidi/...")`，缺它则 sidecar 编译直接失败。源码级引用扫描看不见 `node_modules` 内的预打包产物——删依赖前请以「干净 node_modules 下 `bun run sidecar:build` 能否通过」为准，而不是只看 import 引用数。
- **Formatting**: biome 统一格式（单引号 / 2 空格 / lineWidth 100，配置见 `biome.json`，仅 formatter 不开 linter）。改完跑 `bun run format`；用 Claude Code 时 `.claude/hooks/` 会在编辑时自动 format + 跑相关测试 + 拦截硬编码 API key。

## Workflow

- **Claude Skills**：`/new-master-agent`（引导新增投资大师 Agent）、`/add-provider`（引导新增 AI Provider）、`/new-strategy`（引导新增抓取策略）。`.mcp.json` 已提交，重启 Claude Code 后 context7 MCP 生效（对话中说 `use context7` 查实时库文档）；`sqlite-history` MCP 的 db 路径写死为 macOS 的 `~/Library/Application Support/com.hyh.stockai/`，**仅 macOS 可用**，Linux/Windows 贡献者可忽略该 server。
- **提交前流程**：非纯文档改动 commit 前先跑 `agent-skills:code-simplification` → `agent-skills:code-review-and-quality`（有问题修完再回简化）。维护者本地由全局 hook（`~/.claude/hooks/commit-gate.sh`）强制——拦未声明审查的代码提交，审查后用 `REVIEWED=1 git commit ...` 放行，纯文档自动豁免。
- Pre-push 钩子 (`lefthook.yml`) 并行跑 `tsc --noEmit`、`cargo check`、`bun run format:check`（biome 格式门禁）。
- 开发期若想跳过 Tauri 外壳直接调 Sidecar，可运行 `bun scripts/sidecar-bridge.ts`（:3001 HTTP 端点）。浏览器 dev 模式下 `src/lib/ipc.ts` 自动走该桥接器，bridge 未启动时退回 mock 数据并 `console.warn` 一次。

## Release Checklist

完整发版流程（含双语 Release Notes 模板）见 `.claude/rules/release-checklist.md`（发版时 Read 该文件）。

版本号需同步 3 个文件：`src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` / `package.json`，一键同步：`bun run bump-version <x.y.z> --write`。

## 하네스：StockAI 开发编排

**目标：** 把「审查 / 跨三层功能开发 / 发布」三类反复工作流交给专家 Agent 团队编排执行。

**触发：** 代码改完要审查、跨层加新功能、发版出新版本，以及对这些结果的后续修改/重跑/补充时，使用 `stockai-orchestrator` 技能（它分诊到审查/功能/发布团队）。单点问题或单文件小改可直接处理，无需起团队。加 provider/大师/策略仍走对应生成技能（`/add-provider`、`/new-master-agent`、`/new-strategy`），发版双语 notes 走 `/release-notes`。

**Agent**（`.claude/agents/`）：审查团队 = api-key-security-reviewer · i18n-consistency-reviewer · layer-boundary-reviewer · code-quality-reviewer；功能团队 = feature-architect · backend-engineer · frontend-engineer · integration-qa；发布 = release-manager。

**变更历史：**
| 日期 | 变更内容 | 对象 | 事由 |
|------|----------|------|------|
| 2026-06-01 | 初始构建（综合：审查 + 功能开发 + 发布团队 + 总编排分诊） | 全体 | 复用既有 2 审查员 + 4 生成技能，补齐编排层 |
