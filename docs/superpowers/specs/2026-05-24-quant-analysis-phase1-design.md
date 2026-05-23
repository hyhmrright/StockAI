# Quantitative Analysis System — Phase 1 Design

> 将 StockAI 的分析方式从纯新闻+LLM 升级为「量化指标 + 新闻情绪 + LLM 综合研判」的混合分析架构。
> 参考 [ai-hedge-fund](https://github.com/virattt/ai-hedge-fund) 的多维度分析方法。

## 目标

- 新增技术分析（5 策略加权）、基本面分析（4 维度打分）、结构化情绪分析
- 量化计算在 Sidecar 内完成（确定性纯函数），不依赖 LLM
- 量化摘要注入 LLM prompt，综合新闻 + 量化数据给出更专业的研判
- 前端即时展示量化评分，不等 LLM 返回

## 架构：多阶段 Pipeline

```
用户输入股票代码
        ↓
┌───────────────────┬──────────────────────┐
│ 阶段 1 (现有)      │ 阶段 2 (新增)          │  ← 并行
│ fetchMarketBundle │ fetchQuantBundle     │
│ → 新闻 + 股票信息   │ → K线 + 技术指标      │
│                   │ → 财务指标 + 基本面打分  │
│                   │ → 情绪评分             │
└───────┬───────────┴──────────┬───────────┘
        ↓                      ↓
   UI 展示新闻列表         UI 展示量化评分卡片
        ↓                      ↓
        └──────────┬───────────┘
                   ↓
        用户点击「AI 分析」
                   ↓
        阶段 3: analyzeWithContext(news + quant)
                   ↓
        LLM 综合研判 → 增强的分析结果
```

核心理念：**先确定性计算，再 LLM 解读**。LLM 不发明数据，只综合解读已有的量化信号和新闻。

## 1. 数据层 — Sidecar 新增模块

### 1.1 目录结构

```
sidecar/quant/
├── types.ts          # 量化数据类型定义
├── technical.ts      # 技术指标计算（纯函数，输入 KlinePoint[]）
├── fundamental.ts    # 基本面数据抓取 + 指标打分
├── sentiment.ts      # 情绪评分（基于现有 news 做结构化评分）
├── scoring.ts        # 各维度打分 → 综合信号
└── index.ts          # 聚合入口：fetchQuantBundle()
```

### 1.2 技术指标计算（`technical.ts`）

**输入**：`KlinePoint[]`（日线，约 250 根，复用现有 K 线数据源）
**输出**：`TechnicalSignal`

五个子策略加权合并：

| 策略 | 权重 | 指标 | bullish 信号 |
|------|------|------|-------------|
| 趋势跟踪 | 0.25 | EMA(8,21,55) 交叉 + ADX(14) | EMA 多头排列 + ADX>25 |
| 均值回归 | 0.20 | RSI(14) + 布林带(20,2) | RSI<30 或价格触布林下轨 |
| 动量 | 0.25 | MACD(12,26,9) + 1/3 月价格动量 | MACD 金叉 + 正动量 |
| 波动性 | 0.15 | ATR(14) + 历史波动率 | 低波动环境（有利于建仓） |
| 成交量 | 0.15 | 量价配合 + 量能 EMA 趋势 | 放量上涨确认 |

每个子策略输出 `{ signal, score, details }`，`scoring.ts` 加权合并。

所有计算都是**纯函数**，无副作用，可离线测试。

### 1.3 基本面数据（`fundamental.ts`）

**数据源**：

| 市场 | 数据源 | 接口 |
|------|--------|------|
| A 股 | 东方财富 | `emweb.securities.eastmoney.com` 财务分析接口 |
| 美股 | Yahoo Finance | `query1.finance.yahoo.com/v10/finance/quoteSummary` |

**抓取指标**：

- ROE（净资产收益率）
- 毛利率、净利率
- 资产负债率
- 营收增长率
- 净利润增长率
- 流动比率
- 结合报价已有的 PE/PB/市值/换手率

**打分维度**（参考 ai-hedge-fund Fundamentals Analyst）：

| 维度 | 指标 | bullish 阈值 |
|------|------|-------------|
| 盈利能力 | ROE > 15%, 净利率 > 10%, 毛利率 > 30% | 多数达标 |
| 成长性 | 营收增长 > 10%, 净利增长 > 10% | 多数达标 |
| 财务健康 | 资产负债率 < 60%, 流动比率 > 1.5 | 多数达标 |
| 估值 | PE < 25, PB < 3 | 多数达标 |

每个维度 bullish/bearish/neutral，多数投票得出综合基本面信号。

### 1.4 情绪评分（`sentiment.ts`）

基于现有 `StockNews[]`，不做额外抓取：

- 标题关键词匹配（中英文利好/利空词库）
- 新闻数量加权（多条同向 → 置信度高）
- 时效性衰减（越新权重越高）
- 输出 `SentimentSignal`

确定性评分，不调用 LLM。

### 1.5 综合打分（`scoring.ts`）

```typescript
// 默认权重
const DEFAULT_WEIGHTS = {
  technical: 0.40,
  fundamental: 0.35,
  sentiment: 0.25,
};
```

加权合并三个维度的 score → composite score (1-100)，多数投票得出 composite signal。

## 2. Sidecar CLI 与 Pipeline

### 2.1 新增 CLI action

```bash
sidecar --quant <symbol>
```

在 `cli-handlers.ts` 新增 `handleQuant`：

1. 复用 `getKline()` 拉取日线 K 线（250 根）
2. 复用 `getQuote()` 拉取实时报价（含 PE/PB/市值）
3. 调用 `fetchFundamentals()` 抓取财务指标
4. 纯函数计算 → `TechnicalSignal` + `FundamentalSignal` + `SentimentSignal`
5. 汇总为 `QuantBundle`，stdout 输出 JSON

**不涉及 LLM 调用**，预计执行 1-2 秒。

注意：`handleQuant` 需要 news 来计算情绪分，但 news 在阶段 1 抓取。两种选择：
- 选项 A：`--quant` 只计算技术面 + 基本面，情绪评分延迟到阶段 3 的 prompt 中由 LLM 判断
- **选项 B（采用）**：`--quant` 接收可选的 news JSON，有则算情绪分，无则跳过情绪维度。前端可在阶段 1 完成后把 news 传给阶段 2 的重试/补充调用。

实际实现中，前端并行发起阶段 1 和阶段 2。阶段 2 的 `--quant` 先只算技术面 + 基本面（不需要 news），情绪评分在两个阶段都完成后，由前端将 news 传给后续的分析阶段。简化为：

```
--quant <symbol>  →  返回 technical + fundamental（无 sentiment）
analyzeWithContext(symbol, news, quant)  →  LLM 同时做情绪分析 + 综合研判
```

这样 `--quant` 不依赖 news，可以真正与 `fetchMarketBundle` 并行。情绪分析由 LLM 在综合研判阶段一并完成，prompt 中会指示 LLM 对新闻逐条判断情绪并汇总。

### 2.2 增强 `analyzeNews`

现有 `handleAnalyzeOnly(symbol, news, config)` 扩展签名：

```typescript
handleAnalyzeOnly(symbol, news, config, quant?: QuantBundle)
```

向后兼容：`quant` 为 `undefined` 时退回纯新闻分析。

### 2.3 Prompt 增强

新增 `buildEnhancedPrompt(symbol, news, quant)` in `prompts.ts`：

```
[角色指令] — 保持不变

[量化分析摘要]（新增，仅当 quant 存在时插入）
技术面信号：{signal}，置信度 {confidence}%
- EMA 排列：多头/空头/纠缠
- RSI(14)：{值}（超买/超卖/中性）
- MACD：金叉/死叉，柱状量趋势
- 布林带位置：上轨/中轨/下轨附近
- ADX：{值}（趋势强/弱）
- 成交量：放量/缩量

基本面信号：{signal}，置信度 {confidence}%
- ROE: {值}%, 净利率: {值}%
- 营收增长: {值}%, 净利增长: {值}%
- PE: {值}, PB: {值}
- 资产负债率: {值}%

[新闻列表] — 保持现有格式

[输出格式] — 增强
```

LLM 收到精炼的量化摘要（约 200-300 tokens），不是原始 K 线数据。

### 2.4 AIAnalysisResult 增强

```typescript
interface AIAnalysisResult {
  // 现有字段保留
  rating: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  summary: string;
  pros: string[];
  cons: string[];
  sector?: string;
  industry?: string;
  description?: string;
  // 新增
  technicalView?: string;    // LLM 对技术面的文字解读
  fundamentalView?: string;  // LLM 对基本面的文字解读
}
```

## 3. Rust 层

新增 Tauri command：

```rust
#[tauri::command]
async fn fetch_quant_bundle(symbol: String, ...) -> Result<String, String>
```

与现有 `fetch_market_bundle` 模式一致：spawn Sidecar + `--quant` flag，捕获 stdout 返回前端。

## 4. 前端交互与 UI

### 4.1 新增 Hook

```typescript
// src/hooks/useQuantData.ts
function useQuantData(symbol: string): {
  step: 'idle' | 'fetching' | 'ready' | 'error';
  quant: QuantBundle | null;
  error: string | null;
  refetch: () => void;
}
```

与 `useStockData` 平行，symbol 变化时自动触发。

### 4.2 IPC 新增

```typescript
// ipc.ts
export async function fetchQuantBundle(symbol: string): Promise<QuantBundle>;
```

### 4.3 UI 布局

在 `AnalysisPanel` 中，新闻列表上方新增量化评分区：

```
┌─────────────────────────────────────────┐
│ 量化评分                                 │
│ ┌──────────┬──────────┬──────────┐      │
│ │ 技术面    │ 基本面    │ 情绪     │      │
│ │ 🟢 看涨   │ 🟡 中性   │ 🟢 看涨  │      │
│ │ 72/100   │ 55/100   │ 68/100  │      │
│ └──────────┴──────────┴──────────┘      │
│ 综合信号：看涨  68/100                    │
├─────────────────────────────────────────┤
│ 新闻列表 (现有)                           │
├─────────────────────────────────────────┤
│ [AI 分析] 按钮                            │
├─────────────────────────────────────────┤
│ AI 分析结果 (现有 + technicalView 等)      │
└─────────────────────────────────────────┘
```

### 4.4 新增组件

`src/components/QuantScoreCard.tsx`（< 200 行）：
- 三张小卡片横排，每张显示维度名 + 信号灯 + 置信度分数
- 点击展开子指标详情
- loading 骨架屏 / error 优雅降级

### 4.5 analyzeNews 调用增强

`useAIAnalysis` 的 `analyze` 方法新增可选 `quant` 参数：

```typescript
analyze: (news: StockNews[], quant?: QuantBundle) => Promise<void>;
```

IPC `analyzeNews` 签名相应扩展。

## 5. 类型定义（`shared/types.ts` 新增）

```typescript
/** 单维度分析信号 */
export interface AnalystSignal {
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;  // 0-100
  details: Record<string, number | string>;
}

/** 量化分析数据包 */
export interface QuantBundle {
  symbol: string;
  technical: AnalystSignal;
  fundamental: AnalystSignal;
  composite: {
    signal: 'bullish' | 'bearish' | 'neutral';
    score: number;  // 1-100
  };
  fetchedAt: number;  // Unix ms
}
```

注意：`sentiment` 字段不在 `QuantBundle` 中，因为 `--quant` 不依赖 news。情绪分析由 LLM 在综合研判阶段完成。

## 6. 向后兼容

- `fetchQuantBundle` 失败或超时不阻塞现有流程
- `analyzeWithContext` 的 `quant` 参数为 optional，无量化数据退回纯新闻分析
- 现有 `FullAnalysisResponse` / `MarketBundle` 类型不变
- 现有 `buildAnalysisPrompt` 保留，新增 `buildEnhancedPrompt` 并列存在

## 7. 测试策略

| 层 | 测试方式 |
|----|---------|
| `technical.ts` | 纯函数单元测试，输入固定 K 线数据，断言指标值和信号 |
| `fundamental.ts` | mock HTTP 响应，测试解析和打分逻辑 |
| `sentiment.ts` | 输入固定 news 数组，断言情绪评分 |
| `scoring.ts` | 输入三个 AnalystSignal，断言加权合并结果 |
| `cli-handlers` | mock 依赖，测试 `handleQuant` 输出结构 |
| `prompts.ts` | 断言 `buildEnhancedPrompt` 包含量化摘要文本 |
| 前端 hooks | mock IPC，测试 `useQuantData` 状态机 |
| 集成测试 | 真实数据源，验证端到端（标记为 integration） |

## 8. 未来扩展（不在 Phase 1 范围内）

- 投资大师人格 Agent（Buffett、Graham、Lynch 等）
- LLM 逐条新闻情绪分类
- 财务报表深度分析（DCF、WACC）
- 风险管理层（波动率调仓、相关性限制）
- 回测引擎
