# GEMINI Context (English)

## Project Overview
**StockAI** is a cross-platform desktop application built with **Tauri 2.0**, designed for deep sentiment analysis and scoring of stock news using AI.

### Architecture:
1.  **Frontend (UI Layer)**: **React + TypeScript + Vite**. Modern desktop design with real-time feedback.
2.  **Core Orchestration (Tauri Core)**: **Rust**. Handles local settings (`settings.json`) and Sidecar management.
3.  **Analysis Engine (Sidecar)**: **Bun**. Uses **Playwright** for scraping and pluggable AI providers (**OpenAI / Anthropic / DeepSeek / Ollama**).

---

## Build and Run

### Dependencies:
```bash
# Install all dependencies using Bun
bun install
```

### Development:
```bash
# Start Tauri development environment
bun tauri dev
```

### Testing:
*   **Frontend (Vitest)**: `bunx vitest run`
*   **Sidecar (Bun)**: `cd sidecar && bun test`
*   **Rust (Cargo)**: `cd src-tauri && cargo test`
*   **Integrated Smoke Test**: `bun scripts/smoke-test.ts`

### Sidecar Build:
```bash
# macOS ARM64 (Apple Silicon)
bun build sidecar/index.ts --compile --outfile sidecar/stockai-backend-aarch64-apple-darwin

# Windows x86_64
bun build sidecar/index.ts --compile --outfile sidecar/stockai-backend-x86_64-pc-windows-msvc.exe

# Linux x86_64
bun build sidecar/index.ts --compile --outfile sidecar/stockai-backend-x86_64-unknown-linux-gnu
```

---

## Development Conventions

### Architectural Principles:
*   **Clean Architecture**: Unidirectional dependency flow (UI -> Core -> Sidecar).
*   **Strategy Pattern**: Scrapers use strategy pattern in `sidecar/strategies/`.
*   **Anti-Corruption Layer**: Use DTOs in `shared/types.ts` for UI-Sidecar communication.

### Code Style:
*   **Comment Preference**: All logic comments must use **Chinese** (Simplified).
*   **Modularity**: Keep components small (< 200 lines). Extract logic to hooks.

### Testing Strategy:
*   **Logic Decoupling**: Separation of fetching and parsing. Parser logic lives in `sidecar/parsers/` (`html.ts` / `exchange.ts`) with offline unit tests in `sidecar/parsers/*.test.ts`.
*   **State Verification**: Test `useAnalysis` hook for state transitions.

---

## macOS Release Checklist

1.  **Entitlements Verification**: Ensure `src-tauri/Entitlements.plist` contains the `com.apple.security.cs.disable-library-validation` key set to `true` to allow the Sidecar to be loaded.
2.  **GitHub Actions Secrets**: Verify that the following 6 secrets are configured for notarization:
    *   `APPLE_ID`
    *   `APPLE_PASSWORD`
    *   `APPLE_TEAM_ID`
    *   `APPLE_CERTIFICATE`
    *   `APPLE_CERTIFICATE_PASSWORD`
    *   `APPLE_SIGNING_IDENTITY`
3.  **Local Build Purity**: Run `bun sidecar/build-script.ts` locally to ensure the sidecar can be compiled without errors.
4.  **Bundle Verification**: Use `bun scripts/verify-bundle.ts` to check the final artifact structure and sidecar path.
5.  **Quarantine Handling**: If notarization is skipped during local testing, clear quarantine bits using:
    ```bash
    xattr -rd com.apple.quarantine StockAI.app
    ```

---

# GEMINI 上下文 (简体中文)

## 项目概览
**StockAI** 是一个基于 **Tauri 2.0** 的跨平台桌面应用程序，旨在通过 AI 对股票新闻进行深度情感分析和评分。

### 核心架构：
1.  **前端 (UI 层)**: **React + TypeScript + Vite**。现代桌面端设计，支持实时反馈。
2.  **核心调度 (Tauri Core)**: **Rust**。管理本地配置 (`settings.json`) 并通过 **Sidecar** 调度后台任务。
3.  **分析引擎 (Sidecar)**: **Bun**。使用 **Playwright** 进行抓取，通过可插拔 Provider 接口集成 **OpenAI / Anthropic / DeepSeek / Ollama** 多种 AI 模型。

---

## 构建与运行

### 依赖安装：
```bash
# 使用 Bun 安装所有依赖
bun install
```

### 开发模式：
```bash
# 启动 Tauri 开发环境
bun tauri dev
```

### 测试指令：
*   **前端测试 (Vitest)**: `bunx vitest run`
*   **Sidecar 测试 (Bun)**: `cd sidecar && bun test`
*   **Rust 测试 (Cargo)**: `cd src-tauri && cargo test`
*   **集成冒烟测试**: `bun scripts/smoke-test.ts`

---

## 开发规范

### 架构原则：
*   **Clean Architecture**: 严格保持依赖单向流动（UI -> Core -> Sidecar）。
*   **Strategy Pattern**: 抓取器采用策略模式。
*   **Anti-Corruption Layer**: 前端与 Sidecar 通信必须通过 `shared/types.ts` 定义的 DTO 契约。

### 代码风格：
*   **注释偏好**: 所有的代码逻辑注释必须使用 **中文**。
*   **组件化**: 保持 UI 组件原子化（文件行数 < 200）。

### 测试驱动：
*   **逻辑解耦**: 解析逻辑放在 `sidecar/parsers/`（`html.ts` / `exchange.ts`），与网络层分离，离线单元测试位于 `sidecar/parsers/*.test.ts`。
*   **状态验证**: 对核心 Hook (`useAnalysis`) 进行状态流转测试。

---

## macOS 发布检查清单

1.  **权利文件 (Entitlements) 验证**: 确保 `src-tauri/Entitlements.plist` 包含 `com.apple.security.cs.disable-library-validation` 键并设置为 `true`，以允许加载 Sidecar。
2.  **GitHub Actions 密钥**: 验证 GitHub 仓库中是否已配置以下 6 个用于公证的 Secrets:
    *   `APPLE_ID`
    *   `APPLE_PASSWORD`
    *   `APPLE_TEAM_ID`
    *   `APPLE_CERTIFICATE`
    *   `APPLE_CERTIFICATE_PASSWORD`
    *   `APPLE_SIGNING_IDENTITY`
3.  **本地构建纯净度**: 在本地运行 `bun sidecar/build-script.ts` 以确保 Sidecar 可以正常编译。
4.  **安装包验证**: 使用 `bun scripts/verify-bundle.ts` 检查最终生成的应用程序包结构和 Sidecar 位置是否正确。
5.  **隔离位处理**: 如果在本地测试时跳过了公证，请使用以下命令清除隔离位：
    ```bash
    xattr -rd com.apple.quarantine StockAI.app
    ```
