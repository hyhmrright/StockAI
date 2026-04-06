# GEMINI Context (English)

## Project Overview
**StockAI** is a cross-platform desktop application built with **Tauri 2.0**, designed for deep sentiment analysis and scoring of stock news using AI.

### Architecture:
1.  **Frontend (UI Layer)**: **React + TypeScript + Vite**. Modern desktop design with real-time feedback.
2.  **Core Orchestration (Tauri Core)**: **Rust**. Handles local settings (`settings.json`) and Sidecar management.
3.  **Analysis Engine (Sidecar)**: **Bun**. Uses **Playwright** for scraping and **OpenAI/Ollama** for AI analysis.

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
*   **Anti-Corruption Layer**: Use DTOs in `src/lib/api-types.ts` for UI-Sidecar communication.

### Code Style:
*   **Comment Preference**: All logic comments must use **Chinese** (Simplified).
*   **Modularity**: Keep components small (< 200 lines). Extract logic to hooks.

### Testing Strategy:
*   **Logic Decoupling**: Separation of fetching and parsing. Parser logic must have offline unit tests in `sidecar/strategies/parsers.test.ts`.
*   **State Verification**: Test `useAnalysis` hook for state transitions.

---

# GEMINI 上下文 (简体中文)

## 项目概览
**StockAI** 是一个基于 **Tauri 2.0** 的跨平台桌面应用程序，旨在通过 AI 对股票新闻进行深度情感分析和评分。

### 核心架构：
1.  **前端 (UI 层)**: **React + TypeScript + Vite**。现代桌面端设计，支持实时反馈。
2.  **核心调度 (Tauri Core)**: **Rust**。管理本地配置 (`settings.json`) 并通过 **Sidecar** 调度后台任务。
3.  **分析引擎 (Sidecar)**: **Bun**。使用 **Playwright** 进行抓取，集成 **OpenAI/Ollama** 进行 AI 分析。

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
*   **Anti-Corruption Layer**: 前端与 Sidecar 通信必须通过 `src/lib/api-types.ts` 定义的 DTO 契约。

### 代码风格：
*   **注释偏好**: 所有的代码逻辑注释必须使用 **中文**。
*   **组件化**: 保持 UI 组件原子化（文件行数 < 200）。

### 测试驱动：
*   **逻辑解耦**: 解析逻辑必须与网络请求分离，在 `sidecar/strategies/parsers.test.ts` 中进行离线单元测试。
*   **状态验证**: 对核心 Hook (`useAnalysis`) 进行状态流转测试。
