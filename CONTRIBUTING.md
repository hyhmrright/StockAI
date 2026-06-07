# 贡献指南 / Contributing to StockAI

[English](#english) | [简体中文](#简体中文)

感谢你愿意为 StockAI 贡献力量！无论是报告 bug、提交功能、改进文档还是参与讨论，我们都非常欢迎。

---

## 简体中文

### 开始之前

- 🐛 **发现 Bug**：先搜索 [Issues](https://github.com/hyhmrright/StockAI/issues) 看是否已存在，没有就用 Bug 模板新建。
- 💡 **功能建议**：开一个 [Discussion](https://github.com/hyhmrright/StockAI/discussions) 或用 Feature Request 模板，先讨论再动手，避免白做。
- 📝 **改文档/修错别字**：直接提 PR 即可，无需先开 issue。

### 本地开发环境

**前置要求**

- [Bun](https://bun.sh/)：主包管理器 + Sidecar 运行时
- [Rust](https://www.rust-lang.org/)：构建 Tauri Core

```bash
# 1. 安装依赖
bun install

# 2. 启动开发环境（自动编译 Sidecar + 启动 Vite + Tauri）
bun tauri dev
```

### 三层架构（贡献前必读）

StockAI 是严格单向依赖的三层架构：**UI → Tauri Core (Rust) → Sidecar (Bun)**

- **`src/`** — React + TypeScript 前端。唯一 IPC 入口是 `src/lib/ipc.ts`。
- **`src-tauri/`** — Rust 核心，负责配置解析、Sidecar 进程调度。
- **`sidecar/`** — Bun 进程，负责抓取新闻 + AI 分析 + 量化/回测。
- **`shared/`** — 跨层唯一来源（`types.ts` / `market.ts` / `constants.ts`），**不得在各层重复定义**，前端与 Sidecar 各自 re-export。

完整架构说明见 [`.claude/rules/architecture.md`](./.claude/rules/architecture.md)。

### 关键约定

| 约定 | 说明 |
|------|------|
| **注释语言** | 所有行内逻辑注释使用**简体中文** |
| **组件大小** | UI 组件文件 < 200 行，复杂逻辑抽到 hook |
| **Sidecar stdout** | 只能输出最终 JSON；调试日志走 stderr |
| **测试解耦** | 解析逻辑放 `sidecar/parsers/`，与网络层分离，离线可测 |
| **i18n** | 新增 UI 文案先在 `src/i18n/zh.json` 加 key（编译期类型来源），三语 zh/en/ja 对齐 |

### 常见扩展点（有引导脚手架）

- **新增 AI Provider**：见 `shared/constants.ts` 的 `PROVIDER_PROFILES` + `sidecar/providers/registry.ts`
- **新增投资大师 Agent**：在 `sidecar/agents/masters/` 实现接口 + `registry.ts` 注册
- **新增抓取策略**：实现 `sidecar/strategies/base.ts` 的 `ScrapeStrategy` + `registry.ts` 注册

### 提交 PR 前的检查清单

```bash
# 跑全部单元测试
bun run test

# 类型检查（pre-push 钩子也会跑）
bunx tsc --noEmit
cd src-tauri && cargo check
```

- ✅ 所有测试通过
- ✅ `tsc --noEmit` 与 `cargo check` 无报错
- ✅ 新增逻辑有对应单元测试
- ✅ commit message 清晰（推荐 [Conventional Commits](https://www.conventionalcommits.org/)：`feat:` / `fix:` / `refactor:` / `docs:` …）
- ✅ 跨层改动同步更新了 `shared/` 唯一来源

### 提交流程

1. Fork 本仓库并创建特性分支：`git checkout -b feat/your-feature`
2. 提交改动并确保上面的检查清单全过
3. Push 到你的 fork，开 PR 到 `main`，PR 模板会引导你填写
4. 等待 review，根据反馈迭代

---

## English

### Before You Start

- 🐛 **Found a bug?** Search [Issues](https://github.com/hyhmrright/StockAI/issues) first; if it's new, open one with the Bug template.
- 💡 **Feature idea?** Open a [Discussion](https://github.com/hyhmrright/StockAI/discussions) or use the Feature Request template — discuss before building.
- 📝 **Docs/typo fix?** Just open a PR directly, no issue needed.

### Local Development

**Prerequisites**: [Bun](https://bun.sh/) (package manager + Sidecar runtime), [Rust](https://www.rust-lang.org/) (Tauri Core).

```bash
bun install      # install dependencies
bun tauri dev    # compile Sidecar + start Vite + Tauri
```

### Three-Layer Architecture (read before contributing)

Strictly unidirectional: **UI → Tauri Core (Rust) → Sidecar (Bun)**

- **`src/`** — React + TS frontend. Sole IPC entry: `src/lib/ipc.ts`.
- **`src-tauri/`** — Rust core: config resolution + Sidecar process scheduling.
- **`sidecar/`** — Bun process: scraping + AI analysis + quant/backtest.
- **`shared/`** — single source of truth (`types.ts` / `market.ts` / `constants.ts`); never duplicate across layers.

Full details: [`.claude/rules/architecture.md`](./.claude/rules/architecture.md).

### Key Conventions

| Convention | Rule |
|------------|------|
| **Comments** | All inline logic comments in **Simplified Chinese** |
| **Component size** | UI files < 200 lines; extract complex logic into hooks |
| **Sidecar stdout** | Final JSON only; debug logs go to stderr |
| **Test decoupling** | Parsing logic lives in `sidecar/parsers/`, decoupled from networking |
| **i18n** | Add new UI strings to `src/i18n/zh.json` first (compile-time key source); keep zh/en/ja aligned |

### Pre-PR Checklist

```bash
bun run test            # all unit tests
bunx tsc --noEmit       # type check
cd src-tauri && cargo check
```

- ✅ All tests pass
- ✅ `tsc --noEmit` and `cargo check` clean
- ✅ New logic has unit tests
- ✅ Clear commit messages ([Conventional Commits](https://www.conventionalcommits.org/) recommended)
- ✅ Cross-layer changes update the `shared/` single source

### Workflow

1. Fork & branch: `git checkout -b feat/your-feature`
2. Commit, ensure the checklist passes
3. Push and open a PR against `main` (the PR template will guide you)
4. Iterate on review feedback

Thanks for contributing! 🚀
