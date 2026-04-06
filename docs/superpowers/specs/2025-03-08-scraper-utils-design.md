# 设计方案：抽象 Scraper 策略助手 (2025-03-08)

## 目标
解决抓取策略（Google/Yahoo）中的硬编码模式和解析逻辑重复问题，通过抽象通用的 Playwright 提取助手来提高代码的可维护性和复用性。

## 设计概述
将通用的链接提取、URL 补全、去重和文本清洗逻辑提取到 `sidecar/strategies/utils.ts` 中的 `extractLinks` 函数中。

### 1. `extractLinks` 函数设计
- **参数**：
  - `page`: Playwright `Page` 对象。
  - `selector`: CSS 选择器。
  - `urlFilter`: URL 过滤器（支持字符串或正则表达式）。
  - `baseUrl`: 用于补全相对路径的基础 URL。
- **功能**：
  - 自动处理 `href` 属性获取。
  - 自动补全相对路径（处理 `./` 或 `/` 前缀）。
  - 基于 URL 进行去重。
  - 对 `innerText` 进行分行处理（`lines`），自动去除空白字符。
  - 自动过滤不符合 `urlFilter` 的链接。
- **返回值**：`Promise<{ url: string; text: string; lines: string[] }[]>`

### 2. 策略重构计划
- **GoogleStrategy**：
  - 使用 `extractLinks` 替换原始的 `for` 循环和 URL 补全逻辑。
  - 利用 `lines` 属性简化标题、来源和日期的提取。
- **YahooStrategy**：
  - 在遍历 `selectors` 时使用 `extractLinks`。
  - 移除内部重复的属性获取和过滤逻辑。

## 验证计划
1. **单元测试**：运行 `sidecar` 目录下的 `bun test`。
2. **逻辑一致性**：确保重构后的抓取逻辑产生的 `StockNews` 对象与重构前保持一致。

## 提交信息
`refactor: abstract common scraping utilities to reduce knowledge duplication`
