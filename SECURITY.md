# 安全策略 / Security Policy

[English](#english) | [简体中文](#简体中文)

---

## 简体中文

### API Key 与数据处理说明

StockAI 是一款**本地优先**的桌面应用，理解它如何处理你的敏感数据很重要：

- **API Key 存储在本地**：你填写的各 AI 提供商（OpenAI / Anthropic / DeepSeek / GLM / Ollama）的 API Key 通过 `tauri-plugin-store` 保存在本机配置文件中，**不会上传到任何 StockAI 控制的服务器**。
- **数据流向**：股票新闻分析时，新闻文本会发送给**你自己配置的** AI 提供商进行分析。除此之外，应用不向第三方发送你的数据。
- **Key 传递链**：API Key 经 Tauri Core 以进程参数传给 Sidecar，仅用于调用你指定的 AI 接口。日志（stderr）中对 Key 做脱敏处理。

> ⚠️ 请妥善保管你的 API Key。任何能访问你本机配置目录的人都可能读取到它。

### 支持的版本

我们仅对**最新发布版本**提供安全修复。请始终使用 [Releases](https://github.com/hyhmrright/StockAI/releases/latest) 页面的最新版（应用内也有自动更新）。

### 报告漏洞

如果你发现了安全漏洞，**请不要公开提 issue**，以免在修复前被利用。

请通过以下方式私下报告：

- 使用 GitHub 的 [私密漏洞报告](https://github.com/hyhmrright/StockAI/security/advisories/new)（推荐）
- 或发邮件至 **hyhmrright@gmail.com**，标题注明 `[SECURITY] StockAI`

请在报告中包含：

- 漏洞的详细描述与影响范围
- 复现步骤
- 受影响的版本
- （可选）建议的修复方案

我们会在 **72 小时内**确认收到，并在修复后于 Release Notes 中致谢（除非你希望匿名）。

---

## English

### How StockAI Handles Your Data

StockAI is a **local-first** desktop app. Here's how it treats your sensitive data:

- **API keys are stored locally**: Keys for your AI providers (OpenAI / Anthropic / DeepSeek / GLM / Ollama) are persisted on your machine via `tauri-plugin-store` and are **never sent to any StockAI-controlled server**.
- **Data flow**: During analysis, news text is sent to **the AI provider you configured**. The app sends your data to no other third party.
- **Key passing**: API keys pass from the Tauri Core to the Sidecar as process arguments, used only to call the AI endpoint you specified. Keys are redacted in logs (stderr).

> ⚠️ Keep your API keys safe. Anyone with access to your local config directory could read them.

### Supported Versions

Security fixes are provided for the **latest released version** only. Always use the latest build from [Releases](https://github.com/hyhmrright/StockAI/releases/latest) (the app also auto-updates).

### Reporting a Vulnerability

If you discover a security vulnerability, **please do not open a public issue**.

Report it privately via:

- GitHub's [private vulnerability reporting](https://github.com/hyhmrright/StockAI/security/advisories/new) (preferred), or
- Email **hyhmrright@gmail.com** with subject `[SECURITY] StockAI`

Please include: a description and impact, reproduction steps, the affected version, and optionally a suggested fix.

We aim to acknowledge within **72 hours** and will credit you in the release notes once fixed (unless you prefer to stay anonymous).
