# StockAI

StockAI 是一款基于 **Tauri 2.0** 构建的现代化跨平台桌面应用程序，旨在利用 AI 技术对实时股票新闻进行深度情感分析和评分，为投资者提供数据驱动的洞察。

## 🌟 核心特性

- **多源新闻抓取**: 自动从 Google Finance、Yahoo Finance 等多个平台实时采集股票相关新闻。
- **深度 AI 分析**: 支持 OpenAI (GPT-4o) 和 Ollama (本地模型)，不仅分析标题，还能自动提取新闻正文进行深度研判。
- **现代 UI 设计**: 采用玻璃拟态 (Glassmorphism) 设计语言，提供沉浸式的设置管理和实时的分析进度反馈。
- **本地优先**: 所有的 API 配置和个性化设置均安全存储在本地。

## 🏗️ 架构概览

1.  **前端 (UI 层)**: React 19 + TypeScript + Vite。负责视图渲染和用户交互。
2.  **核心调度 (Tauri Core)**: Rust。负责管理本地持久化存储、系统集成以及 Sidecar 进程调度。
3.  **分析引擎 (Sidecar)**: 基于 Bun 运行时。使用 Playwright 进行网页采集，集成 AI 模型进行文本处理。

## 🚀 快速开始

### 前置要求

- **Bun**: 项目的主要包管理器和 Sidecar 运行时。 [安装 Bun](https://bun.sh/)
- **Rust**: 用于构建 Tauri 核心。 [安装 Rust](https://www.rust-lang.org/)
- **Node.js**: (可选) 部分构建工具依赖。

### 1. 安装依赖

```bash
# 使用 Bun 安装所有依赖
bun install
```

### 2. Sidecar 二进制文件准备

由于 Tauri 的 Sidecar 机制需要特定命名的二进制文件，请在运行前编译 Sidecar：

```bash
# 示例：构建 macOS ARM64 版本
bun build sidecar/index.ts --compile --outfile src-tauri/sidecar/stockai-backend-aarch64-apple-darwin
```
*(请根据你的系统平台调整后缀，如 `-x86_64-apple-darwin` 或 `-x86_64-pc-windows-msvc`)*

### 3. 启动开发环境

```bash
bun tauri dev
```

## 🧪 测试

项目采用了多层测试体系以确保稳定性：

- **前端测试 (Vitest)**: `bun test:ui`
- **Sidecar 逻辑测试 (Bun)**: `cd sidecar && bun test`
- **Rust 核心测试 (Cargo)**: `cd src-tauri && cargo test`
- **集成冒烟测试**: `bun scripts/smoke-test.ts`

## 🛠️ 技术栈

- **桌面框架**: Tauri 2.0 (Rust)
- **前端框架**: React 19, TailwindCSS 4, Lucide Icons, Lightweight Charts
- **爬虫/后端**: Bun, Playwright, NodeHtmlMarkdown
- **AI 集成**: OpenAI SDK, Ollama SDK

## 📅 开发规范

- **代码注释**: 所有的逻辑注释均使用 **中文**。
- **架构原则**: 严格遵循 Clean Architecture，保持依赖单向流动（UI -> Core -> Sidecar）。
- **测试驱动**: 所有的解析逻辑必须经过离线单元测试验证。

## 📄 开源协议

MIT License
