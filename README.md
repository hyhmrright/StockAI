# StockAI

[English](./README.md) | [简体中文](./README.zh-CN.md)

StockAI is a modern cross-platform desktop application built with **Tauri 2.0**. It leverages AI technology to perform deep sentiment analysis and scoring on real-time stock news, providing investors with data-driven insights.

## 🌟 Key Features

- **Multi-source News Scraping**: Automatically collects real-time stock news from multiple platforms like Google Finance and Yahoo Finance.
- **Deep AI Analysis**: Supports OpenAI (GPT-4o) and Ollama (local models). It doesn't just analyze headlines but also extracts full article content for in-depth evaluation.
- **Modern UI Design**: Features a Glassmorphism design language with immersive settings management and real-time analysis progress feedback.
- **Local-first**: All API configurations and personalized settings are securely stored locally.

## 🏗️ Architecture Overview

1.  **Frontend (UI Layer)**: React 19 + TypeScript + Vite. Responsible for view rendering and user interaction.
2.  **Core Orchestration (Tauri Core)**: Rust. Manages local persistence, system integration, and Sidecar process scheduling.
3.  **Analysis Engine (Sidecar)**: Based on the Bun runtime. Uses Playwright for web scraping and integrates AI models for text processing.

## 🚀 Quick Start

### Prerequisites

- **Bun**: Primary package manager and Sidecar runtime. [Install Bun](https://bun.sh/)
- **Rust**: For building the Tauri core. [Install Rust](https://www.rust-lang.org/)
- **Node.js**: (Optional) For some build tool dependencies.

### 1. Install Dependencies

```bash
# Install all dependencies using Bun
bun install
```

### 2. Prepare Sidecar Binaries

Tauri's Sidecar mechanism requires specifically named binaries. Compile the Sidecar before running:

```bash
# Example: Build for macOS ARM64
bun build sidecar/index.ts --compile --outfile src-tauri/sidecar/stockai-backend-aarch64-apple-darwin
```
*(Adjust the suffix based on your platform, e.g., `-x86_64-apple-darwin` or `-x86_64-pc-windows-msvc`)*

### 3. Start Development Environment

```bash
bun tauri dev
```

## 🧪 Testing

The project uses a multi-layered testing system:

- **Frontend Tests (Vitest)**: `bun test:ui`
- **Sidecar Logic Tests (Bun)**: `cd sidecar && bun test`
- **Rust Core Tests (Cargo)**: `cd src-tauri && cargo test`
- **Integrated Smoke Test**: `bun scripts/smoke-test.ts`

## 🛠️ Tech Stack

- **Desktop Framework**: Tauri 2.0 (Rust)
- **Frontend Framework**: React 19, TailwindCSS 4, Lucide Icons, Lightweight Charts
- **Scraper/Backend**: Bun, Playwright, NodeHtmlMarkdown
- **AI Integration**: OpenAI SDK, Ollama SDK

## 📅 Development Conventions

- **Code Comments**: All logic comments must use **Chinese** (as per project preference).
- **Architecture Principles**: Strictly follow Clean Architecture with unidirectional dependency flow (UI -> Core -> Sidecar).
- **Test Driven**: All parsing logic must be verified by offline unit tests.

## 📄 License

MIT License

---

# StockAI (简体中文)

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

- **Bun**: 项目的主要包管理器和 Sidecar 运行时。
- **Rust**: 用于构建 Tauri 核心。

### 1. 安装依赖

```bash
bun install
```

### 2. Sidecar 二进制文件准备

```bash
bun build sidecar/index.ts --compile --outfile src-tauri/sidecar/stockai-backend-aarch64-apple-darwin
```

### 3. 启动开发环境

```bash
bun tauri dev
```
