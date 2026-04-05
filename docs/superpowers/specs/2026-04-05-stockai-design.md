# StockAI 设计规范 (Design Spec)

## 1. 项目概述 (Project Overview)
StockAI 是一款基于 Tauri v2 和 Bun 构建的桌面级 AI 股票分析客户端。应用旨在通过全网抓取指定股票的相关新闻、财报和舆情，并结合大语言模型 (LLM) 进行深度分析，最终以专业仪表盘的形式为用户提供购买建议和走势预测。

## 2. 核心架构 (Architecture)
- **前端 (UI)**: React + Vite + TypeScript (运行于 Tauri v2 提供的系统 Webview)。
- **后端进程 (Sidecar)**: 纯 Bun + TypeScript 编写的独立可执行文件，负责高并发爬虫、数据清洗和与 AI 模型的通信。
- **通信机制**: 前端与 Bun Sidecar 之间通过 Tauri 的 IPC 机制或本地 WebSocket/HTTP 通信。

## 3. 界面设计 (User Interface)
采用**专业金融仪表盘 (Dashboard)** 布局：
- **顶部**: 统一的股票代码/公司名称搜索框。
- **左侧模块**: 基础财务数据与历史股价走势图 (可集成轻量级图表库如 ECharts 或 Lightweight Charts)。
- **中间模块**: 全网舆情情绪指数 (情感倾向：看多/看空，显示直观的占比条)。
- **右侧模块**: 最核心的 AI 综合购买建议 (分数/评级) 与基于全网信息总结的未来走势预测。

## 4. 数据流与获取策略 (Data Strategy)
- **初始方案 (硬核爬虫)**: Bun Sidecar 驱动无头浏览器引擎 (如 Playwright-core) 模拟搜索 Google Finance 及主流财经媒体，硬核抓取网页正文文本作为原始资料喂给 AI。
- **扩展设计**: 数据获取层采用接口 (Interface) 抽象，预留后续接入标准官方聚合 API (如 Yahoo Finance API、Tavily Search API) 和 RSS 订阅源的能力。

## 5. AI 模型集成策略 (AI Integration)
采用**混合模式 (Hybrid Mode)**，给用户最大自由度：
- **云端大模型 (BYOK)**: 设置页面允许用户填入自己的 OpenAI (ChatGPT)、Anthropic (Claude) 或国产大模型 (如 DeepSeek) 的 API Key。
- **本地隐私模型 (Ollama)**: 支持对接本地电脑上运行的 Ollama 服务 (如 Llama 3, Qwen 2)，实现 100% 数据不出境及零 API 推理费用。

## 6. 技术选型 (Tech Stack)
- 桌面框架: Tauri v2
- 运行时与打包工具: Bun
- 语言: TypeScript (100% 覆盖前后端逻辑)
- 前端视图: React, Vite, Tailwind CSS
- 数据抓取: Playwright (由 Bun 驱动)

## 7. 错误处理与鲁棒性 (Error Handling & Testing)
- **测试框架**: 采用 Bun 内置的极速 `bun test`。
- **降级策略**: 应对爬虫由于网站改版而失效的情况，需提供友好的错误提示，并允许用户一键切换到备用的 RSS 新闻源，或手动提供关键新闻文本进行分析。
