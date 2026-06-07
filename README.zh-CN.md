# StockAI (简体中文)

[English](./README.md) | [简体中文](./README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Release](https://img.shields.io/github/v/release/hyhmrright/StockAI)](https://github.com/hyhmrright/StockAI/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/hyhmrright/StockAI/total)](https://github.com/hyhmrright/StockAI/releases)
[![Stars](https://img.shields.io/github/stars/hyhmrright/StockAI?style=social)](https://github.com/hyhmrright/StockAI/stargazers)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)](https://github.com/hyhmrright/StockAI/releases/latest)

![StockAI Dashboard](./docs/screenshot-dashboard.png)

StockAI 是一款基于 **Tauri 2.0** 构建的现代化跨平台桌面应用程序，利用 AI 技术对实时股票新闻进行深度情感分析与评分，同时提供交互式 K 线图与技术指标，为投资者在一处聚合数据驱动的洞察。

## 🌟 核心特性

- **多源新闻抓取**: 优先通过 Google News RSS（无需启动 Chromium）采集新闻，Playwright 策略兜底，完整支持美股及 A 股（沪深北三所）。
- **深度 AI 分析**: 支持 OpenAI (GPT-4o)、Anthropic (Claude 3.5 Sonnet)、DeepSeek (DeepSeek V4 Pro)、GLM (GLM-5.1) 与 Ollama（本地模型）；各自独立保存 API Key / Base URL / 模型，下拉框切换。分析**显式触发**——切换股票不会静默消耗 token。深度模式开启时抽取正文进行深度研判。
- **交互式 K 线图**: 蜡烛图支持 MA / BOLL 主图叠加，九档周期切换（1D / 5D / 1M / 3M / 6M / YTD / 1Y / 5Y / All），副图指标可切换（MACD / RSI / KDJ / OBV / VWAP），支持对数坐标轴、前/后复权及对比基准叠加，交易时段实时价合并入最后一根 K 线。
- **可编辑关注列表**: 通过侧边栏输入框快速添加或删除关注股票，数据持久化存储，重启后不丢失。
- **三栏式仪表盘**: 深色主题三栏布局——左侧关注列表侧边栏、中央行情面板（实时价格卡 + K 线图 + 新闻列表）、右侧 AI 分析专区（看涨/看跌情绪比例条、公司概况、利多/风险因素卡片）。顶部工具栏固定全局搜索与设置入口。
- **本地优先**: 所有 API 配置和个性化设置均安全存储在本地，数据不离开设备。

## 🏗️ 架构概览

1.  **前端 (UI 层)**: React 19 + TypeScript + Vite。负责视图渲染和用户交互。
2.  **核心调度 (Tauri Core)**: Rust。负责管理本地持久化存储、系统集成以及 Sidecar 进程调度。
3.  **分析引擎 (Sidecar)**: 基于 Bun 运行时。使用 Playwright 进行网页采集，集成 AI 模型进行文本处理。

## 📦 安装

预构建的安装包可在 [Releases](https://github.com/hyhmrright/StockAI/releases/latest) 页面下载。

### macOS — 提示"已损坏，无法打开"

这是 macOS Gatekeeper 拦截了未经 Apple 公证的 app，并非真正损坏。在终端运行以下命令解除隔离属性即可：

```bash
xattr -cr /Applications/StockAI.app
```

之后正常打开 app 即可。这是安全的——app 不含任何后门，完整源代码在本仓库可审计。

> **原因说明**：从互联网下载的 app 会被 macOS 打上隔离标记（quarantine）。没有 Apple 开发者证书时，系统会显示"已损坏"而不是通常的"来自未知开发者"弹窗。

### Windows — SmartScreen 警告

点击 **更多信息 → 仍要运行** 即可。所有未签名的可执行文件都会触发此提示。

### Linux (.deb)

```bash
sudo dpkg -i StockAI_*_amd64.deb
```

需要 WebKitGTK 运行时（大多数基于 GNOME 的发行版已预装）。

---

## 🚀 快速开始

### 前置要求

- **Bun**: 项目的主要包管理器和 Sidecar 运行时。 [安装 Bun](https://bun.sh/)
- **Rust**: 用于构建 Tauri 核心。 [安装 Rust](https://www.rust-lang.org/)

### 1. 安装依赖

```bash
# 使用 Bun 安装所有依赖
bun install
```

### 2. Sidecar 二进制文件准备

由于 Tauri 的 Sidecar 机制需要特定命名的二进制文件，请在运行前编译 Sidecar：

```bash
# macOS ARM64 (Apple Silicon)
bun build sidecar/index.ts --compile --outfile sidecar/stockai-backend-aarch64-apple-darwin

# Windows x86_64
bun build sidecar/index.ts --compile --outfile sidecar/stockai-backend-x86_64-pc-windows-msvc.exe

# Linux x86_64
bun build sidecar/index.ts --compile --outfile sidecar/stockai-backend-x86_64-unknown-linux-gnu
```

### 3. 启动开发环境

```bash
bun tauri dev
```

## 🧪 测试

一键运行全部测试（无需 GNU `timeout`）：

```bash
bun run test
```

分层单独运行：

- **前端测试 (Vitest)**: `bunx vitest run`
- **Sidecar 逻辑测试 (Bun)**: `cd sidecar && bun test`
- **Rust 核心测试 (Cargo)**: `cd src-tauri && cargo test`
- **集成冒烟测试**: `bun scripts/smoke-test.ts`

## 🛠️ 技术栈

- **桌面框架**: Tauri 2.0 (Rust)
- **前端框架**: React 19, TailwindCSS 4, Lucide Icons, Lightweight Charts
- **爬虫/后端**: Bun, Playwright, NodeHtmlMarkdown
- **AI 集成**: OpenAI SDK、Anthropic SDK、Ollama SDK（DeepSeek / GLM 通过 OpenAI 兼容协议接入）

## 📅 开发规范

- **代码注释**: 所有的逻辑注释均使用 **中文**。
- **架构原则**: 严格遵循 Clean Architecture，保持依赖单向流动（UI -> Core -> Sidecar）。
- **测试驱动**: 所有的解析逻辑必须经过离线单元测试验证。

## 🤝 参与贡献

欢迎贡献！请先阅读[贡献指南](./CONTRIBUTING.md)与[行为准则](./CODE_OF_CONDUCT.md)。发现 bug 或有想法？欢迎提 [issue](https://github.com/hyhmrright/StockAI/issues) 或开 [discussion](https://github.com/hyhmrright/StockAI/discussions)。

## 📄 开源协议

[MIT](./LICENSE) © hyhmrright
