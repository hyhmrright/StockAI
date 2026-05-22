# K 线图重构设计 — 专业分析软件级体验

**日期**：2026-05-22
**作者**：hyhmrright + Claude
**状态**：Approved

## 背景

当前 `src/components/PriceChart.tsx` 使用 TradingView 的免费 iframe widget (`s.tradingview.com/widgetembed/`)，存在两个用户痛点：

1. **没有实时数据**：免费 iframe 对 A 股的实时性弱，盘中无法刷新。
2. **看不到"当前 K 线"**：iframe 不暴露 API，无法标注昨收线、当前价水平线，用户难以一眼定位"现在"。

更深层的问题：iframe 沙箱限制了交互、配色、信息密度等所有定制空间，天花板锁死。StockAI 的定位是"AI 股票分析软件"而非"轻量看盘",需要专业人士级别的图表能力（多周期、指标、对数坐标、对比基准等）。

## 目标

把 K 线图替换为**完全自研**的专业级金融图表，要求：

- 体验对标 TradingView 专业版、Yahoo Finance、Bloomberg Terminal 的金融图表风格——**克制、高信噪比**，不走同花顺式"信息堆砌"路线
- 全部数据自取，可控、可实时刷新
- A 股与美股统一同一组件、配色按市场自动切换
- 与 StockAI 暗色主题视觉语言统一

## 非目标（明确不做）

| 不做 | 理由 |
|------|------|
| 画线工具（趋势线/斐波那契/矩形） | lightweight-charts 原生不支持，需要自己造绘图层。第一版不做，后续迭代。 |
| 自定义指标 / Pine Script | TradingView 收费版独有，免费替代极难，专业用户有需求会去 TV 网站。 |
| Tick 级数据 / Level 2 五档 | 免费数据源拿不到稳定数据；意义不大。 |
| 多窗口分屏 | StockAI 是分析软件不是交易终端。 |
| WebSocket 实时推送 | 免费数据源大多不支持；改用 10 秒智能轮询。 |

## 技术选型

**图表库：TradingView lightweight-charts v4**（约 35 KB gzipped，MIT 协议）

选型理由：
- TradingView 团队自家开源，与专业版同源审美——黑底极简、高信噪比
- 性能极强，10 万+ 根 K 线无压力
- 原生支持十字光标、对数坐标、`update()` 增量更新
- 默认不带指标和画线——反而是优势，可由我们精选少数专业人士关注的指标，避免"散户面板"观感
- 不选 KLineChart：默认风格偏国内零售（同花顺/通达信式红绿炫目），与"专业分析软件"定位不符
- 不选 ECharts：通用图表库，金融场景要堆很多代码

## 架构

### 层次

遵循 StockAI 既有的三层架构（UI → Tauri Core → Sidecar），数据抓取全部下沉到 Sidecar 绕开浏览器 CORS。

```
┌──────────────────────────────────────────────────────────┐
│ Frontend (src/components/PriceChart.tsx)                 │
│ - lightweight-charts 渲染                                 │
│ - 顶部信息条 / 工具栏 / 副图切换 UI                          │
│ - 实时轮询调度（交易时段判断）                                │
└────────────────────────┬─────────────────────────────────┘
                         │ invoke()
                         ▼
┌──────────────────────────────────────────────────────────┐
│ Tauri Core (src-tauri/src/lib.rs)                        │
│ - 新增命令 fetch_kline(symbol, period, range)             │
│ - 新增命令 fetch_realtime_quote(symbol)                   │
│ - 透传给 Sidecar 一次性子进程                                │
└────────────────────────┬─────────────────────────────────┘
                         │ child process + stdin/stdout
                         ▼
┌──────────────────────────────────────────────────────────┐
│ Sidecar (sidecar/kline/)                                 │
│ - tencent.ts  : A 股日/周/月/分钟 K + 实时报价              │
│ - yahoo.ts    : 美股日/周/月/分钟 K + 实时报价 + 盘前盘后    │
│ - eastmoney.ts: A 股备用（含前/后复权）                      │
│ - index.ts    : 按市场路由 + 统一 schema                    │
└──────────────────────────────────────────────────────────┘
```

### 数据源

**A 股：腾讯（主） + 东方财富（备）**
- 腾讯 `web.sqt.gtimg.cn/q=` 取实时报价；`web.ifzq.gtimg.cn/appstock/app/...` 取 K 线
- 东方财富 `push2his.eastmoney.com/api/qt/stock/kline/get` 备用（含复权选项）
- 项目已用过新浪/腾讯，CSP 不需要再放行（请求由 Sidecar 发出，不经 webview）

**美股：Yahoo Finance**
- `query1.finance.yahoo.com/v8/finance/chart/{symbol}` 一站式：日/周/月/1m/5m + 盘前盘后
- 已被 `sidecar/fetchStockInfo` 使用过

### IPC 接口

```typescript
// src/lib/ipc.ts
fetch_kline(params: {
  symbol: string;           // "600519.SH" / "AAPL"
  period: KlinePeriod;      // "1m" | "5m" | "1d" | "1w" | "1mo"
  range: KlineRange;        // "1d" | "5d" | "1m" | "3m" | "6m" | "ytd" | "1y" | "5y" | "all"
  adjust?: "qfq" | "hfq" | "none";  // 复权，默认 qfq
}): Promise<KlinePoint[]>

fetch_realtime_quote(symbol: string): Promise<RealtimeQuote>
```

数据 schema（`shared/types.ts`）：
```typescript
interface KlinePoint {
  time: number;        // Unix 秒
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;      // 股数（A 股是手数 * 100 后的股数）
  amount?: number;     // 成交额，元 / USD
}

interface RealtimeQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  amount: number;
  turnoverRate?: number;   // 换手率，A 股有
  marketCap?: number;
  pe?: number;
  pb?: number;
  high52w?: number;
  low52w?: number;
  preMarket?: { price: number; change: number; changePercent: number };   // 美股盘前
  postMarket?: { price: number; change: number; changePercent: number };  // 美股盘后
  timestamp: number;       // 报价时间 Unix 秒
}
```

## UI 设计

### 整体布局

```
┌─────────────────────────────────────────────────────────────────────┐
│ 贵州茅台 600519.SH                  ¥1,683.50  ▲ +12.40 (+0.74%)    │
│ 开 1671.10  高 1689.00  低 1665.20  量 3.2M  额 53.8亿  换手 0.25%   │
│ 52周高 1,920.50  52周低 1,420.10    PE 27.3  PB 8.2  市值 2.1万亿     │
├─────────────────────────────────────────────────────────────────────┤
│ [1D] [5D] [1M] [3M] [6M] [YTD] [1Y✓] [5Y] [All]                      │
│                                  ⚙ K线  线  HA  对数  复权  比较  截图 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   主图（K 线 + MA20黄 + MA50紫 + MA200蓝）           ~60% 高度        │
│   ─ ─ ─ ─ ─ ─ ─ ─ ─ 昨收 1671.10 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─         │
│   ━━━━━━━━━━━━━━━━ 当前 1683.50 ━━━━━━━━━━━━━━━━━━━━ (右轴标签同色) │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│   副图 1：成交量（红/绿柱）+ MA20 均量线              ~18% 高度        │
├─────────────────────────────────────────────────────────────────────┤
│   副图 2：MACD(12,26,9)              切换 ▼          ~22% 高度        │
│           可选：RSI(14) / KDJ(9,3,3) / BOLL / OBV / VWAP              │
└─────────────────────────────────────────────────────────────────────┘
```

### 顶部信息条

- **第一行**：股票名 + 代码（左），当前价 + 涨跌额 + 涨跌幅（右）
- **第二行**：开 / 高 / 低 / 量 / 额 / 换手率（A 股专有）
- **第三行**：52 周高 / 52 周低 / PE / PB / 市值
- 美股有盘前/盘后行情时，第一行右侧追加 "盘前 ¥X.XX (+0.5%)"

### 时间范围与 K 线粒度映射

| 范围   | K 线粒度          | 备注                                       |
|--------|--------------------|--------------------------------------------|
| 1D     | 1 分钟分时折线     | 非 K 线，含均价线（VWAP-like）                |
| 5D     | 5 分钟 K           |                                            |
| 1M     | 日 K               |                                            |
| 3M     | 日 K               |                                            |
| 6M     | 日 K               |                                            |
| YTD    | 日 K               | 今年初至今                                  |
| 1Y     | 日 K               | **默认范围**                                |
| 5Y     | 周 K               |                                            |
| All    | 月 K               |                                            |

### 工具栏开关

- **图表类型**：K 线 / 折线 / Heikin-Ashi（趋势分析常用）/ 面积
- **坐标轴**：线性 / 对数（5Y/All 默认对数，长期分析关键）
- **复权**：前复权（默认）/ 后复权 / 不复权
- **比较**：叠加另一标的，快捷：上证指数 / 沪深 300 / 标普 500 / 纳指 / 自定义
- **截图**：调用 lightweight-charts `takeScreenshot()`
- **全屏**：浏览器 Fullscreen API

### 主图叠加

**默认开启的均线（按市场区分）：**

| 市场 | 默认均线           |
|------|--------------------|
| A 股 | MA5 / MA20 / MA60   |
| 美股 | MA20 / MA50 / MA200 |

颜色（参考 TradingView 默认，专业人士识别度高）——按"短/中/长"三档配色，与具体市场无关：
- 短期均线（A 股 MA5 / 美股 MA20）：黄色 `#F5C842`
- 中期均线（A 股 MA20 / 美股 MA50）：紫色 `#B388FF`
- 长期均线（A 股 MA60 / 美股 MA200）：蓝色 `#4FC3F7`

用户可在右上 ⚙ 中开关每条均线。

**关键水平线（默认显示）：**
- **昨收**：灰色虚线，标签 "昨收 1671.10"
- **当前价**：实线，颜色随涨跌（A 股红涨绿跌、美股反之），右轴标签实时更新
- 这两条线直接回应"看不到当前在哪根 K 线"的痛点

### 副图

**副图 1（固定）：成交量**
- 柱状图，红涨绿跌（A 股）或绿涨红跌（美股），与主图 K 线颜色一致
- 叠加 20 周期均量线（细线）

**副图 2（可切换）：默认 MACD**
- 下拉切换：MACD(12,26,9) / RSI(14) / KDJ(9,3,3) / BOLL(20,2) / OBV / VWAP
- 注：BOLL 切换后实际叠加在主图，副图 2 隐藏（特殊处理）

### 十字光标信息浮层

hover 任一 K 线时，左上角显示：

```
2026-05-20 (周二)
开 1671.10   高 1689.00
低 1665.20   收 1683.50  ▲ +0.74%
量 3,210,000  额 53.85亿
MA20 1645.20  MA50 1602.10  MA200 1521.30
MACD: DIF 8.32  DEA 5.10  柱 +6.44
```

字段按当前已开启的指标动态扩展。

### 配色

- 背景：沿用 `bg-panel`（StockAI 现有暗色主题）
- 涨跌色：
  - A 股 symbol → 红涨 `#FF4D4F` / 绿跌 `#10B981`
  - 美股 symbol → 绿涨 `#10B981` / 红跌 `#FF4D4F`
  - **按 symbol 自动判断**，无需用户配置
- 网格线：白 10% 透明度
- 轴文字：白 50% 透明度

## 实时刷新策略

不上 WebSocket，简化为定时轮询：

```typescript
function startPolling(symbol: string) {
  const intervalMs = inTradingHours(symbol) ? 10_000 : null;
  if (!intervalMs) return;

  const handle = setInterval(async () => {
    const quote = await fetchRealtimeQuote(symbol);
    updateTopBar(quote);
    chart.applyOptions(/* 当前价水平线 */);
    series.update(makeLastCandleFrom(quote));   // 仅 update 最后一根
  }, intervalMs);

  return () => clearInterval(handle);
}
```

**交易时段判断**：
- A 股（`.SH/.SZ/.BJ`）：北京时间 09:30–11:30, 13:00–15:00（工作日）
- 美股（无后缀或显式 NYSE/NASDAQ）：纽约时间 04:00–20:00，含盘前盘后（工作日）
- 非交易时段不轮询；用户切换股票时立即拉一次

## 性能与加载策略

- 首次加载：仅拉默认范围（1Y 日 K，约 250 根），目标 < 1s
- 切换更长范围：增量拉取并 `series.setData()` 重置
- 实时更新：`series.update()` 仅替换最后一根，零重排
- 副图指标计算：纯前端 JS，250 根数据下毫秒级完成
- 暂不实现"滚动到更早自动加载更早历史"——5Y/All 已经覆盖大部分需求

## 模块边界与文件清单

### 新增文件

| 路径 | 职责 |
|------|------|
| `sidecar/kline/index.ts` | 按 symbol 路由到 tencent/yahoo/eastmoney |
| `sidecar/kline/tencent.ts` | A 股主源：K 线 + 实时报价 |
| `sidecar/kline/yahoo.ts` | 美股：K 线 + 实时报价 + 盘前盘后 |
| `sidecar/kline/eastmoney.ts` | A 股备用：含前/后复权 |
| `sidecar/kline/types.ts` | KlinePoint / RealtimeQuote 内部 schema |
| `sidecar/kline/*.test.ts` | 各源解析层离线测试（参考 `parsers/*.test.ts` 模式） |
| `src/lib/kline.ts` | 前端 IPC 封装 + lightweight-charts 适配器 |
| `src/lib/indicators.ts` | MA / EMA / MACD / RSI / KDJ / BOLL / OBV / VWAP 计算（纯函数） |
| `src/lib/indicators.test.ts` | 指标计算单元测试 |
| `src/lib/market-hours.ts` | 交易时段判断 + 涨跌色判断（按市场） |
| `src/components/PriceChart/index.tsx` | 容器（拉数据 + 轮询调度） |
| `src/components/PriceChart/ChartCanvas.tsx` | lightweight-charts 渲染层 |
| `src/components/PriceChart/QuoteHeader.tsx` | 顶部三行信息条 |
| `src/components/PriceChart/Toolbar.tsx` | 时间范围 + 工具开关 |
| `src/components/PriceChart/CrosshairTooltip.tsx` | 十字光标浮层 |
| `src/components/PriceChart/types.ts` | KlinePeriod / KlineRange / ChartType 等 UI 类型 |

### 修改文件

| 路径 | 改动 |
|------|------|
| `src/components/PriceChart.tsx` | **删除**，被新 `PriceChart/index.tsx` 取代 |
| `src/components/Dashboard.tsx` | import 路径调整为 `./PriceChart` 目录形式 |
| `src-tauri/src/lib.rs` | 新增 `fetch_kline` / `fetch_realtime_quote` 命令 |
| `src-tauri/tauri.conf.json` | CSP 不需调整（请求由 Sidecar 发起） |
| `shared/types.ts` | 新增 `KlinePoint` / `RealtimeQuote` / `KlinePeriod` / `KlineRange` |
| `package.json` | 新增依赖 `lightweight-charts@^4` |

### 删除文件

- `src/components/PriceChart.tsx`（原 iframe 实现）

### 模块边界自检

- **数据层**（`sidecar/kline/*`）：只懂 HTTP + 解析，不懂 UI
- **计算层**（`src/lib/indicators.ts`）：纯函数，KlinePoint[] → number[]，可独立测试
- **适配层**（`src/lib/kline.ts`）：IPC → lightweight-charts schema，单一职责
- **渲染层**（`PriceChart/ChartCanvas.tsx`）：只懂 lightweight-charts API，不懂数据来源
- **容器层**（`PriceChart/index.tsx`）：组装数据 + 轮询 + 子组件，每个文件 < 200 行（CLAUDE.md 约束）

## 测试策略

- **Sidecar 解析层**：每个数据源至少 1 个解析测试，用 fixtures 喂入真实响应样本
- **指标计算**：MA/EMA/MACD/RSI/KDJ/BOLL/OBV/VWAP 各一套对照测试（标准答案来自 TA-Lib 文档）
- **market-hours**：覆盖 A 股 / 美股、工作日 / 周末、盘前 / 盘中 / 盘后边界
- **集成 smoke**：扩展 `scripts/smoke-test.ts`，从 IPC 拉一次 1Y 日 K + 一次实时报价
- **Chart 组件**：人工浏览器验证为主，自动化只覆盖关键 hooks（useKlineData、usePolling）

## 错误处理

- 数据源失败：A 股自动切到东方财富备用源；都失败时显示"行情数据暂不可用"占位
- 实时报价失败：保留最后成功的报价、停止轮询、底部小提示"行情连接已断开，点击重试"
- 非交易时段：不报错，明确显示"休市中，最后交易日 5/20"
- symbol 不识别：显示"未找到该标的行情数据"

## 复用 / 渐进式增强

- 现有 `displayInfo`（来自 `useAnalysis` 的 `partialInfo` / `result.stockInfo`）仍可用作**初始占位**，避免空白态
- `QuoteHeader` 优先用实时报价，回退到 `displayInfo`
- 这样首屏 < 100ms 就有内容，K 线和实时报价异步填入

## 开放问题（实现期再决）

无 — 设计已自洽。
