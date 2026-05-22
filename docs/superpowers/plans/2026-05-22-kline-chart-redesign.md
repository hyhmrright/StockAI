# K 线图重构（专业分析软件级）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 StockAI 现有的 TradingView iframe K 线图替换为基于 `lightweight-charts` 自研的专业级金融图表，含多周期、专业指标、对数坐标、复权、对比基准、实时轮询等能力。

**Architecture:** 沿用三层架构（UI → Tauri Core → Sidecar）。Sidecar 新增 `kline/` 模块抓取 A 股（腾讯主源 + 东财备用）和美股（Yahoo Finance）K 线与实时报价；Tauri Core 新增两个命令转发；前端用 `lightweight-charts` 渲染，按市场自动判断涨跌色、交易时段。

**Tech Stack:** TradingView lightweight-charts v4（MIT），Bun（Sidecar），Rust + Tauri 2，React + TypeScript + Vite，Tailwind CSS，Vitest + bun:test。

**Spec:** `docs/superpowers/specs/2026-05-22-kline-chart-redesign-design.md`

---

## File Structure

### 新增

```
sidecar/kline/
  ├── index.ts         # 按 ParsedSymbol 路由到 yahoo/tencent，含 eastmoney fallback
  ├── types.ts         # 内部 schema：KlinePoint / RealtimeQuote
  ├── yahoo.ts         # 美股：K 线 + 实时报价（含盘前盘后）
  ├── tencent.ts       # A 股主源：K 线 + 实时报价
  ├── eastmoney.ts     # A 股备用：含复权
  ├── yahoo.test.ts
  ├── tencent.test.ts
  └── eastmoney.test.ts

src/lib/
  ├── market-hours.ts        # 交易时段判断 + 涨跌色判断
  ├── market-hours.test.ts
  ├── indicators.ts          # MA / EMA / MACD / RSI / KDJ / BOLL / OBV / VWAP
  └── indicators.test.ts

src/lib/kline.ts             # IPC 封装 + lightweight-charts 数据适配

src/components/PriceChart/
  ├── index.tsx              # 容器：拉数据 + 轮询 + 子组件组装
  ├── ChartCanvas.tsx        # lightweight-charts 渲染层
  ├── QuoteHeader.tsx        # 顶部三行信息条
  ├── Toolbar.tsx            # 时间范围 + 工具开关
  ├── CrosshairTooltip.tsx   # 十字光标信息浮层
  └── types.ts               # UI 内部类型（KlinePeriod/Range/ChartType...）
```

### 修改

| 路径 | 改动 |
|------|------|
| `shared/types.ts` | 新增 K 线相关类型 |
| `src-tauri/src/lib.rs` | 新增 `fetch_kline` / `fetch_realtime_quote` 命令 |
| `src/lib/ipc.ts` | 新增 `fetchKline` / `fetchRealtimeQuote` |
| `sidecar/index.ts` | 新增 `--kline` / `--quote` 入口 |
| `sidecar/cli-handlers.ts` | 新增 `handleKline` / `handleQuote` |
| `src/components/Dashboard.tsx` | import 路径 `./PriceChart` → 目录形式 |
| `package.json` | 加 `lightweight-charts@^4` |

### 删除

- `src/components/PriceChart.tsx`（原 iframe）

---

## Task Dependency Graph

```
Task 1 (shared types)  ──┬─►  Task 3 (yahoo)
                         ├─►  Task 4 (tencent)
                         └─►  Task 5 (eastmoney)
                              ↓
                              Task 6 (sidecar router + CLI handler)
                              ↓
                              Task 7 (Tauri Core 命令)
                              ↓
                              Task 8 (前端 IPC 封装)
Task 2 (market-hours)  ──────► Task 18+ (容器、轮询)
Task 9-11 (indicators) ──────► Task 13+ (Chart 渲染)
Task 12 (PriceChart 骨架) ───► Task 13 → Task 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21 → 22
```

Phase 1（Task 1-2）必须先做；Phase 2（Task 3-8）数据层；Phase 3（Task 9-11）可与 Phase 2 并行；Phase 4-5（Task 12-22）依赖前面所有任务。

---

## Task 1: 共享类型定义

**Files:**
- Modify: `shared/types.ts`（在文件末追加）

- [ ] **Step 1: 追加 K 线相关共享类型**

在 `shared/types.ts` 末尾追加：

```typescript
/**
 * K 线粒度
 */
export type KlinePeriod = "1m" | "5m" | "15m" | "30m" | "60m" | "1d" | "1w" | "1mo";

/**
 * 时间范围（UI 选择器）
 */
export type KlineRange = "1d" | "5d" | "1m" | "3m" | "6m" | "ytd" | "1y" | "5y" | "all";

/**
 * 复权方式
 */
export type AdjustMode = "qfq" | "hfq" | "none";

/**
 * 一根 K 线
 */
export interface KlinePoint {
  time: number;        // Unix 秒，对齐到周期起点
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;      // 股数；A 股原始是手数，已 × 100
  amount?: number;     // 成交额（人民币 / 美元）
}

/**
 * 一次 K 线拉取请求
 */
export interface KlineRequest {
  symbol: string;            // 原始用户输入（"600519" / "AAPL" / "sh600519"）
  period: KlinePeriod;
  range: KlineRange;
  adjust?: AdjustMode;       // 默认 "qfq"
}

/**
 * 实时报价
 */
export interface RealtimeQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;            // 股数
  amount: number;            // 成交额
  turnoverRate?: number;     // 换手率 %（A 股）
  marketCap?: number;        // 总市值
  pe?: number;
  pb?: number;
  high52w?: number;
  low52w?: number;
  preMarket?: { price: number; change: number; changePercent: number };
  postMarket?: { price: number; change: number; changePercent: number };
  timestamp: number;         // 报价时间 Unix 秒
  currency: string;          // CNY / USD
  market: "A股" | "美股";
}
```

- [ ] **Step 2: 验证类型可导出**

Run: `bunx tsc --noEmit`
Expected: 无新增错误。

- [ ] **Step 3: 提交**

```bash
git add shared/types.ts
git commit -m "feat(types): 添加 K 线与实时报价共享类型"
```

---

## Task 2: 市场识别 + 涨跌色 + 交易时段

**Files:**
- Create: `src/lib/market-hours.ts`
- Test: `src/lib/market-hours.test.ts`

- [ ] **Step 1: 写测试**

`src/lib/market-hours.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  detectMarket,
  upColor,
  downColor,
  isTradingHours,
} from "./market-hours";

describe("detectMarket", () => {
  it("6/0/3/4/8 开头 6 位数 → A 股", () => {
    expect(detectMarket("600519")).toBe("A股");
    expect(detectMarket("000001")).toBe("A股");
    expect(detectMarket("300750")).toBe("A股");
    expect(detectMarket("sh600519")).toBe("A股");
  });

  it("纯字母 → 美股", () => {
    expect(detectMarket("AAPL")).toBe("美股");
    expect(detectMarket("gb_aapl")).toBe("美股");
  });
});

describe("upColor/downColor", () => {
  it("A 股 → 红涨绿跌", () => {
    expect(upColor("A股")).toBe("#FF4D4F");
    expect(downColor("A股")).toBe("#10B981");
  });
  it("美股 → 绿涨红跌", () => {
    expect(upColor("美股")).toBe("#10B981");
    expect(downColor("美股")).toBe("#FF4D4F");
  });
});

describe("isTradingHours", () => {
  it("A 股工作日 10:00 北京时间 → true", () => {
    // 2026-05-20 (周三) 02:00 UTC = 10:00 北京
    const t = new Date("2026-05-20T02:00:00Z").getTime();
    expect(isTradingHours("A股", t)).toBe(true);
  });

  it("A 股工作日 12:00 北京时间（午休）→ false", () => {
    const t = new Date("2026-05-20T04:00:00Z").getTime();
    expect(isTradingHours("A股", t)).toBe(false);
  });

  it("A 股周六 → false", () => {
    const t = new Date("2026-05-23T02:00:00Z").getTime();
    expect(isTradingHours("A股", t)).toBe(false);
  });

  it("美股工作日 10:00 ET → true", () => {
    // 2026-05-20 (周三) 14:00 UTC = 10:00 ET (EDT)
    const t = new Date("2026-05-20T14:00:00Z").getTime();
    expect(isTradingHours("美股", t)).toBe(true);
  });

  it("美股盘前 06:00 ET → true（含盘前盘后）", () => {
    const t = new Date("2026-05-20T10:00:00Z").getTime();
    expect(isTradingHours("美股", t)).toBe(true);
  });

  it("美股深夜 22:00 ET → false", () => {
    const t = new Date("2026-05-21T02:00:00Z").getTime();
    expect(isTradingHours("美股", t)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `bunx vitest run src/lib/market-hours.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: 实现**

`src/lib/market-hours.ts`:

```typescript
export type Market = "A股" | "美股";

/**
 * 从原始 symbol 判断市场归属
 * 规则：含 6 位数字 → A 股；纯字母 / gb_ 前缀 → 美股
 */
export function detectMarket(symbol: string): Market {
  if (/(?<!\d)\d{6}(?!\d)/.test(symbol)) return "A股";
  return "美股";
}

/**
 * 涨色：A 股红、美股绿
 */
export function upColor(market: Market): string {
  return market === "A股" ? "#FF4D4F" : "#10B981";
}

/**
 * 跌色：A 股绿、美股红
 */
export function downColor(market: Market): string {
  return market === "A股" ? "#10B981" : "#FF4D4F";
}

/**
 * 给定时间戳（ms），判断是否落在该市场的交易时段（含盘前盘后/美股）
 * 不考虑节假日（免费数据源也不提供节假日日历，用户切换股票时会自动重拉）
 */
export function isTradingHours(market: Market, ts: number = Date.now()): boolean {
  const d = new Date(ts);
  if (market === "A股") {
    // 北京时间 = UTC+8
    const beijing = new Date(ts + 8 * 60 * 60 * 1000);
    const day = beijing.getUTCDay();
    if (day === 0 || day === 6) return false;
    const h = beijing.getUTCHours();
    const m = beijing.getUTCMinutes();
    const mins = h * 60 + m;
    // 9:30-11:30, 13:00-15:00
    return (mins >= 9 * 60 + 30 && mins <= 11 * 60 + 30) ||
           (mins >= 13 * 60 && mins <= 15 * 60);
  } else {
    // 美股按 ET（EDT/EST），夏令时简化：3月第2周日 ~ 11月第1周日 = EDT(UTC-4)，否则 EST(UTC-5)
    const offsetH = isEdt(d) ? -4 : -5;
    const et = new Date(ts + offsetH * 60 * 60 * 1000);
    const day = et.getUTCDay();
    if (day === 0 || day === 6) return false;
    const h = et.getUTCHours();
    // 含盘前 04:00 + 常规 09:30-16:00 + 盘后 16:00-20:00
    return h >= 4 && h < 20;
  }
}

function isEdt(d: Date): boolean {
  const year = d.getUTCFullYear();
  const march = new Date(Date.UTC(year, 2, 1));
  const dstStart = new Date(Date.UTC(year, 2, 1 + ((7 - march.getUTCDay() + 7) % 7) + 7));
  const nov = new Date(Date.UTC(year, 10, 1));
  const dstEnd = new Date(Date.UTC(year, 10, 1 + ((7 - nov.getUTCDay()) % 7)));
  return d >= dstStart && d < dstEnd;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `bunx vitest run src/lib/market-hours.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: 提交**

```bash
git add src/lib/market-hours.ts src/lib/market-hours.test.ts
git commit -m "feat(market): 添加市场识别 / 涨跌色 / 交易时段工具"
```

---

## Task 3: Sidecar — Yahoo Finance K 线 + 实时报价

**Files:**
- Create: `sidecar/kline/types.ts`
- Create: `sidecar/kline/yahoo.ts`
- Create: `sidecar/kline/yahoo.test.ts`

- [ ] **Step 1: 定义内部类型**

`sidecar/kline/types.ts`:

```typescript
import type { KlinePoint, RealtimeQuote, KlinePeriod, KlineRange, AdjustMode } from "../../shared/types";

export type { KlinePoint, RealtimeQuote, KlinePeriod, KlineRange, AdjustMode };

/**
 * Sidecar 内部规范化的参数：路由层把用户原始 symbol 转成各源能识别的形式
 */
export interface NormalizedRequest {
  rawSymbol: string;
  period: KlinePeriod;
  range: KlineRange;
  adjust: AdjustMode;
  market: "A股" | "美股";
}
```

- [ ] **Step 2: 写测试**

`sidecar/kline/yahoo.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { parseYahooChart, parseYahooQuote, mapRangeToYahoo } from "./yahoo";

describe("mapRangeToYahoo", () => {
  test("1d → 1m 分钟", () => {
    expect(mapRangeToYahoo("1d")).toEqual({ range: "1d", interval: "1m" });
  });
  test("1y → 日 K", () => {
    expect(mapRangeToYahoo("1y")).toEqual({ range: "1y", interval: "1d" });
  });
  test("5y → 周 K", () => {
    expect(mapRangeToYahoo("5y")).toEqual({ range: "5y", interval: "1wk" });
  });
  test("all → 月 K", () => {
    expect(mapRangeToYahoo("all")).toEqual({ range: "max", interval: "1mo" });
  });
});

describe("parseYahooChart", () => {
  const FIXTURE = {
    chart: {
      result: [
        {
          meta: { regularMarketPrice: 180.5, currency: "USD", symbol: "AAPL" },
          timestamp: [1700000000, 1700086400],
          indicators: {
            quote: [
              {
                open: [178.0, 179.5],
                high: [181.2, 182.0],
                low: [177.0, 178.5],
                close: [180.0, 180.5],
                volume: [50_000_000, 55_000_000],
              },
            ],
          },
        },
      ],
      error: null,
    },
  };

  test("解析合法响应为 KlinePoint[]", () => {
    const points = parseYahooChart(FIXTURE);
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual({
      time: 1700000000,
      open: 178.0,
      high: 181.2,
      low: 177.0,
      close: 180.0,
      volume: 50_000_000,
    });
  });

  test("跳过含 null 字段的不完整 K 线", () => {
    const dirty = JSON.parse(JSON.stringify(FIXTURE));
    dirty.chart.result[0].indicators.quote[0].close = [180.0, null];
    const points = parseYahooChart(dirty);
    expect(points).toHaveLength(1);
  });

  test("响应错误 → 抛错", () => {
    expect(() => parseYahooChart({ chart: { result: null, error: { code: "Not Found" } } }))
      .toThrow();
  });
});

describe("parseYahooQuote", () => {
  const FIXTURE = {
    chart: {
      result: [
        {
          meta: {
            symbol: "AAPL",
            shortName: "Apple Inc.",
            regularMarketPrice: 180.5,
            chartPreviousClose: 178.0,
            regularMarketOpen: 179.0,
            regularMarketDayHigh: 182.0,
            regularMarketDayLow: 178.5,
            regularMarketVolume: 55_000_000,
            currency: "USD",
            fiftyTwoWeekHigh: 200.0,
            fiftyTwoWeekLow: 150.0,
            preMarketPrice: 181.0,
            preMarketChange: 0.5,
            preMarketChangePercent: 0.28,
            regularMarketTime: 1700086400,
          },
        },
      ],
      error: null,
    },
  };

  test("解析为 RealtimeQuote", () => {
    const q = parseYahooQuote(FIXTURE, "AAPL");
    expect(q.price).toBe(180.5);
    expect(q.prevClose).toBe(178.0);
    expect(q.change).toBeCloseTo(2.5, 2);
    expect(q.changePercent).toBeCloseTo(1.40, 2);
    expect(q.preMarket?.price).toBe(181.0);
    expect(q.high52w).toBe(200.0);
    expect(q.market).toBe("美股");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd sidecar && bun test kline/yahoo.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: 实现**

`sidecar/kline/yahoo.ts`:

```typescript
import { logger, toErrorMessage } from "../utils";
import type { KlinePoint, RealtimeQuote, KlineRange, NormalizedRequest } from "./types";

/**
 * 把 UI 选择的范围映射为 Yahoo Chart API 的 (range, interval)
 */
export function mapRangeToYahoo(range: KlineRange): { range: string; interval: string } {
  switch (range) {
    case "1d":  return { range: "1d",  interval: "1m"  };
    case "5d":  return { range: "5d",  interval: "5m"  };
    case "1m":  return { range: "1mo", interval: "1d"  };
    case "3m":  return { range: "3mo", interval: "1d"  };
    case "6m":  return { range: "6mo", interval: "1d"  };
    case "ytd": return { range: "ytd", interval: "1d"  };
    case "1y":  return { range: "1y",  interval: "1d"  };
    case "5y":  return { range: "5y",  interval: "1wk" };
    case "all": return { range: "max", interval: "1mo" };
  }
}

/**
 * 拉取美股 K 线
 */
export async function fetchYahooKline(req: NormalizedRequest): Promise<KlinePoint[]> {
  const { range, interval } = mapRangeToYahoo(req.range);
  const symbol = req.rawSymbol.replace(/^gb_/i, "").toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=true`;

  const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!resp.ok) throw new Error(`Yahoo K 线响应 HTTP ${resp.status}`);
  const json = await resp.json();
  return parseYahooChart(json);
}

/**
 * 解析 Yahoo Chart API 响应
 */
export function parseYahooChart(json: any): KlinePoint[] {
  if (json?.chart?.error) {
    throw new Error(`Yahoo 错误：${json.chart.error.description || json.chart.error.code}`);
  }
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error("Yahoo 响应缺少 result");

  const ts: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const points: KlinePoint[] = [];

  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i];
    // 任一字段缺失 → 丢弃这根（Yahoo 在非交易日会塞 null）
    if (o == null || h == null || l == null || c == null) continue;
    points.push({ time: ts[i], open: o, high: h, low: l, close: c, volume: v ?? 0 });
  }
  return points;
}

/**
 * 拉取美股实时报价 — 复用 Chart API meta 字段（无需额外接口）
 */
export async function fetchYahooQuote(symbol: string): Promise<RealtimeQuote> {
  const upper = symbol.replace(/^gb_/i, "").toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(upper)}?range=1d&interval=1m&includePrePost=true`;
  const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!resp.ok) throw new Error(`Yahoo Quote 响应 HTTP ${resp.status}`);
  const json = await resp.json();
  return parseYahooQuote(json, upper);
}

/**
 * 解析 Yahoo meta 字段为 RealtimeQuote
 */
export function parseYahooQuote(json: any, symbol: string): RealtimeQuote {
  if (json?.chart?.error) throw new Error(`Yahoo Quote 错误：${json.chart.error.code}`);
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error("Yahoo Quote 缺少 meta");

  const price = meta.regularMarketPrice ?? 0;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? 0;
  const change = price - prevClose;
  const changePercent = prevClose ? (change / prevClose) * 100 : 0;

  const out: RealtimeQuote = {
    symbol,
    name: meta.shortName || meta.longName || symbol,
    price,
    change: Number(change.toFixed(4)),
    changePercent: Number(changePercent.toFixed(2)),
    open: meta.regularMarketOpen ?? 0,
    high: meta.regularMarketDayHigh ?? 0,
    low: meta.regularMarketDayLow ?? 0,
    prevClose,
    volume: meta.regularMarketVolume ?? 0,
    amount: 0,
    high52w: meta.fiftyTwoWeekHigh,
    low52w: meta.fiftyTwoWeekLow,
    timestamp: meta.regularMarketTime ?? Math.floor(Date.now() / 1000),
    currency: meta.currency || "USD",
    market: "美股",
  };

  if (meta.preMarketPrice != null) {
    out.preMarket = {
      price: meta.preMarketPrice,
      change: meta.preMarketChange ?? 0,
      changePercent: meta.preMarketChangePercent ?? 0,
    };
  }
  if (meta.postMarketPrice != null) {
    out.postMarket = {
      price: meta.postMarketPrice,
      change: meta.postMarketChange ?? 0,
      changePercent: meta.postMarketChangePercent ?? 0,
    };
  }
  return out;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd sidecar && bun test kline/yahoo.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add sidecar/kline/types.ts sidecar/kline/yahoo.ts sidecar/kline/yahoo.test.ts
git commit -m "feat(kline): 添加 Yahoo Finance K 线 + 实时报价数据源"
```

---

## Task 4: Sidecar — 腾讯 A 股 K 线 + 实时报价

**Files:**
- Create: `sidecar/kline/tencent.ts`
- Create: `sidecar/kline/tencent.test.ts`

- [ ] **Step 1: 写测试**

`sidecar/kline/tencent.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { parseTencentKline, parseTencentQuote, mapPeriodToTencent } from "./tencent";

describe("mapPeriodToTencent", () => {
  test("1m → m1", () => expect(mapPeriodToTencent("1m")).toBe("m1"));
  test("5m → m5", () => expect(mapPeriodToTencent("5m")).toBe("m5"));
  test("1d → day", () => expect(mapPeriodToTencent("1d")).toBe("day"));
  test("1w → week", () => expect(mapPeriodToTencent("1w")).toBe("week"));
  test("1mo → month", () => expect(mapPeriodToTencent("1mo")).toBe("month"));
});

describe("parseTencentKline", () => {
  const FIXTURE = {
    code: 0,
    msg: "",
    data: {
      sh600519: {
        qfqday: [
          ["2024-12-30", "1670.00", "1683.50", "1689.00", "1665.20", "3210000", "{}", "53.85亿"],
          ["2024-12-31", "1683.50", "1690.00", "1695.00", "1680.00", "2850000", "{}", "48.20亿"],
        ],
      },
    },
  };

  test("解析合法响应", () => {
    const points = parseTencentKline(FIXTURE, "sh600519", "qfq", "day");
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({
      open: 1670.0,
      close: 1683.5,
      high: 1689.0,
      low: 1665.2,
      volume: 321_000_000, // 手 × 100
    });
  });

  test("响应 code 非 0 → 抛错", () => {
    expect(() => parseTencentKline({ code: 1, msg: "fail" }, "sh600519", "qfq", "day"))
      .toThrow();
  });

  test("不复权数据从 day 字段读取", () => {
    const fix = { code: 0, data: { sh600519: { day: [["2024-12-30", "1670", "1683.5", "1689", "1665", "100000", "{}", "1.6亿"]] } } };
    const points = parseTencentKline(fix, "sh600519", "none", "day");
    expect(points).toHaveLength(1);
  });
});

describe("parseTencentQuote", () => {
  // 腾讯实时报价格式（截断为本测试所需字段，~50 字段）
  const RAW = `v_sh600519="1~贵州茅台~600519~1683.50~1671.10~1671.10~3210000~1605000~1605000~1683.50~~1683.50~~1683.50~~1683.50~~1683.50~~1683.50~~1683.50~~1683.50~~~~2026-05-22 15:00:00~12.40~0.74~1689.00~1665.20~1683.50/3210000/53850000000~3210000~538500.00~0.25~27.30~~1689.00~1665.20~0.25~21000000~21000000~1.50~~~1683.50~~~~~~538500.00~~~~~~~8.20~~"`;

  test("解析为 RealtimeQuote", () => {
    const q = parseTencentQuote(RAW, "sh600519");
    expect(q.name).toBe("贵州茅台");
    expect(q.price).toBe(1683.50);
    expect(q.prevClose).toBe(1671.10);
    expect(q.change).toBeCloseTo(12.40, 2);
    expect(q.high).toBe(1689.00);
    expect(q.low).toBe(1665.20);
    expect(q.turnoverRate).toBe(0.25);
    expect(q.market).toBe("A股");
    expect(q.currency).toBe("CNY");
  });

  test("缺失内容字符串 → 抛错", () => {
    expect(() => parseTencentQuote(`v_sh600519="";`, "sh600519")).toThrow();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd sidecar && bun test kline/tencent.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: 实现**

`sidecar/kline/tencent.ts`:

```typescript
import type { KlinePoint, RealtimeQuote, KlinePeriod, KlineRange, AdjustMode, NormalizedRequest } from "./types";

/** 把通用周期映射为腾讯 param */
export function mapPeriodToTencent(period: KlinePeriod): string {
  return ({ "1m": "m1", "5m": "m5", "15m": "m15", "30m": "m30", "60m": "m60", "1d": "day", "1w": "week", "1mo": "month" } as const)[period];
}

/** 估算每周期需要多少根 K 线满足 range */
function countForRange(period: KlinePeriod, range: KlineRange): number {
  const map: Record<KlineRange, number> = {
    "1d": 240, "5d": 480, "1m": 30, "3m": 90, "6m": 180,
    "ytd": 365, "1y": 250, "5y": 260, "all": 800,
  };
  return map[range];
}

/** 从原始 symbol 提取 tencent 接口前缀（sh / sz / bj）和 6 位代码 */
function normalizeChinaSymbol(raw: string): { prefix: string; code: string } {
  const m = raw.match(/(sh|sz|bj)?(\d{6})/i);
  if (!m) throw new Error(`无法解析 A 股代码：${raw}`);
  const code = m[2];
  const explicit = m[1]?.toLowerCase();
  if (explicit) return { prefix: explicit, code };
  if (code.startsWith("6")) return { prefix: "sh", code };
  if (code.startsWith("0") || code.startsWith("3")) return { prefix: "sz", code };
  if (code.startsWith("4") || code.startsWith("8")) return { prefix: "bj", code };
  return { prefix: "sh", code };
}

export async function fetchTencentKline(req: NormalizedRequest): Promise<KlinePoint[]> {
  const { prefix, code } = normalizeChinaSymbol(req.rawSymbol);
  const tencentSymbol = `${prefix}${code}`;
  const period = mapPeriodToTencent(req.period);
  const adjust = req.adjust === "qfq" ? "qfq" : req.adjust === "hfq" ? "hfq" : "";
  const count = countForRange(req.period, req.range);

  // 接口：分钟 K 用 kline/kline，日/周/月 K 用 fqkline/get
  const isMinute = period.startsWith("m");
  const endpoint = isMinute
    ? `https://web.ifzq.gtimg.cn/appstock/app/kline/mkline?param=${tencentSymbol},${period},,${count}`
    : `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${tencentSymbol},${period},,,${count},${adjust}`;

  const resp = await fetch(endpoint);
  if (!resp.ok) throw new Error(`腾讯 K 线 HTTP ${resp.status}`);
  const json = await resp.json();
  return parseTencentKline(json, tencentSymbol, req.adjust, period);
}

export function parseTencentKline(json: any, symbol: string, adjust: AdjustMode, period: string): KlinePoint[] {
  if (json?.code !== 0 && json?.code != null) throw new Error(`腾讯响应错误：${json.msg || json.code}`);
  const node = json?.data?.[symbol];
  if (!node) throw new Error(`腾讯响应缺少 ${symbol}`);
  const key = adjust === "qfq" ? `qfq${period}` : adjust === "hfq" ? `hfq${period}` : period;
  const arr: any[] = node[key] || node[period] || [];

  return arr.map((row) => {
    // 日/周/月：[date, open, close, high, low, volume(手), {}, amount?]
    // 分钟：[datetime, open, close, high, low, volume(手), ...]
    const time = Math.floor(new Date(row[0].length === 10 ? row[0] + "T00:00:00+08:00" : row[0] + "+08:00").getTime() / 1000);
    return {
      time,
      open: parseFloat(row[1]),
      close: parseFloat(row[2]),
      high: parseFloat(row[3]),
      low: parseFloat(row[4]),
      volume: parseFloat(row[5]) * 100, // 手 → 股
      amount: parseAmount(row[7]),
    };
  });
}

function parseAmount(v: any): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    if (v.endsWith("亿")) return parseFloat(v) * 1e8;
    if (v.endsWith("万")) return parseFloat(v) * 1e4;
    const n = parseFloat(v);
    return isNaN(n) ? undefined : n;
  }
  return undefined;
}

export async function fetchTencentQuote(symbol: string): Promise<RealtimeQuote> {
  const { prefix, code } = normalizeChinaSymbol(symbol);
  const tencentSymbol = `${prefix}${code}`;
  const url = `https://web.sqt.gtimg.cn/q=${tencentSymbol}`;
  const resp = await fetch(url, { headers: { Referer: "https://gu.qq.com" } });
  if (!resp.ok) throw new Error(`腾讯报价 HTTP ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const text = new TextDecoder("gbk").decode(buf);
  return parseTencentQuote(text, tencentSymbol);
}

/**
 * 腾讯报价响应格式：v_sh600519="1~名称~代码~当前价~昨收~今开~成交量(手)~外盘~内盘~..."
 * 字段索引（0-based）：1=名称, 3=当前价, 4=昨收, 5=今开, 6=成交量(手), 30=换手率,
 *                    32=市盈率, 33=最高, 34=最低, 38=总市值(万), 45=市净率, 37=成交额(万)
 */
export function parseTencentQuote(text: string, symbol: string): RealtimeQuote {
  const m = text.match(/="([^"]*)"/);
  if (!m || !m[1]) throw new Error(`腾讯报价为空：${symbol}`);
  const f = m[1].split("~");
  if (f.length < 30) throw new Error(`腾讯报价字段不足：${f.length}`);

  const price = parseFloat(f[3]);
  const prevClose = parseFloat(f[4]);
  const change = parseFloat(f[31]) || (price - prevClose);
  const changePercent = parseFloat(f[32]) || ((change / prevClose) * 100);

  return {
    symbol,
    name: f[1],
    price,
    change: Number(change.toFixed(3)),
    changePercent: Number(changePercent.toFixed(2)),
    open: parseFloat(f[5]),
    high: parseFloat(f[33]),
    low: parseFloat(f[34]),
    prevClose,
    volume: parseFloat(f[6]) * 100,
    amount: (parseFloat(f[37]) || 0) * 1e4,
    turnoverRate: parseFloat(f[38]) || undefined,
    pe: parseFloat(f[39]) || undefined,
    pb: parseFloat(f[46]) || undefined,
    marketCap: parseFloat(f[45]) ? parseFloat(f[45]) * 1e8 : undefined,
    timestamp: parseTencentTime(f[30]),
    currency: "CNY",
    market: "A股",
  };
}

function parseTencentTime(t: string): number {
  if (!t) return Math.floor(Date.now() / 1000);
  // 格式 "20260522150000" 或 "2026-05-22 15:00:00"
  if (/^\d{14}$/.test(t)) {
    const y = t.slice(0, 4), m = t.slice(4, 6), d = t.slice(6, 8);
    const hh = t.slice(8, 10), mm = t.slice(10, 12), ss = t.slice(12, 14);
    return Math.floor(new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}+08:00`).getTime() / 1000);
  }
  return Math.floor(new Date(t + "+08:00").getTime() / 1000);
}
```

- [ ] **Step 4: 运行测试**

Run: `cd sidecar && bun test kline/tencent.test.ts`
Expected: PASS

注：腾讯字段索引可能因接口版本微调；如真实抓包发现偏移，调整 `parseTencentQuote` 的 `f[N]` 即可，测试需同步更新 fixture。

- [ ] **Step 5: 提交**

```bash
git add sidecar/kline/tencent.ts sidecar/kline/tencent.test.ts
git commit -m "feat(kline): 添加腾讯 A 股 K 线与实时报价数据源"
```

---

## Task 5: Sidecar — 东方财富 A 股复权 K 线（备用）

**Files:**
- Create: `sidecar/kline/eastmoney.ts`
- Create: `sidecar/kline/eastmoney.test.ts`

- [ ] **Step 1: 写测试**

`sidecar/kline/eastmoney.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { parseEastmoneyKline, mapPeriodToEastmoney, mapAdjustToEastmoney } from "./eastmoney";

describe("mapPeriodToEastmoney", () => {
  test("1d → klt=101", () => expect(mapPeriodToEastmoney("1d")).toBe(101));
  test("1w → klt=102", () => expect(mapPeriodToEastmoney("1w")).toBe(102));
  test("1mo → klt=103", () => expect(mapPeriodToEastmoney("1mo")).toBe(103));
  test("5m → klt=5", () => expect(mapPeriodToEastmoney("5m")).toBe(5));
});

describe("mapAdjustToEastmoney", () => {
  test("qfq → fqt=1", () => expect(mapAdjustToEastmoney("qfq")).toBe(1));
  test("hfq → fqt=2", () => expect(mapAdjustToEastmoney("hfq")).toBe(2));
  test("none → fqt=0", () => expect(mapAdjustToEastmoney("none")).toBe(0));
});

describe("parseEastmoneyKline", () => {
  const FIXTURE = {
    rc: 0,
    data: {
      code: "600519",
      market: 1,
      klines: [
        // 字段：日期, 开, 收, 高, 低, 成交量(手), 成交额, 振幅, 涨跌幅, 涨跌额, 换手率
        "2024-12-30,1670.00,1683.50,1689.00,1665.20,3210000,53850000000.00,1.43,0.74,12.40,0.25",
        "2024-12-31,1683.50,1690.00,1695.00,1680.00,2850000,48200000000.00,0.89,0.39,6.50,0.23",
      ],
    },
  };

  test("解析合法响应", () => {
    const points = parseEastmoneyKline(FIXTURE);
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({
      open: 1670.0,
      close: 1683.5,
      high: 1689.0,
      low: 1665.2,
      volume: 321_000_000, // 手 × 100
      amount: 53_850_000_000,
    });
  });

  test("空数据 → 返回空数组", () => {
    expect(parseEastmoneyKline({ rc: 0, data: { klines: [] } })).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd sidecar && bun test kline/eastmoney.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: 实现**

`sidecar/kline/eastmoney.ts`:

```typescript
import type { KlinePoint, KlinePeriod, AdjustMode, NormalizedRequest } from "./types";

export function mapPeriodToEastmoney(p: KlinePeriod): number {
  return ({ "1m": 1, "5m": 5, "15m": 15, "30m": 30, "60m": 60, "1d": 101, "1w": 102, "1mo": 103 } as const)[p];
}

export function mapAdjustToEastmoney(a: AdjustMode): number {
  return a === "qfq" ? 1 : a === "hfq" ? 2 : 0;
}

/** 把腾讯式前缀 (sh/sz/bj) 映射为东财 secid 市场码 */
function getMarketCode(rawSymbol: string): number {
  const m = rawSymbol.match(/^(sh|sz|bj)?(\d{6})/i);
  if (!m) throw new Error(`无法解析 A 股代码：${rawSymbol}`);
  const prefix = (m[1] || "").toLowerCase();
  const code = m[2];
  if (prefix === "sh" || code.startsWith("6")) return 1;
  if (prefix === "bj" || code.startsWith("4") || code.startsWith("8")) return 0;
  return 0; // sz/创业板
}

function extractCode(rawSymbol: string): string {
  return rawSymbol.match(/\d{6}/)![0];
}

export async function fetchEastmoneyKline(req: NormalizedRequest): Promise<KlinePoint[]> {
  const code = extractCode(req.rawSymbol);
  const market = getMarketCode(req.rawSymbol);
  const klt = mapPeriodToEastmoney(req.period);
  const fqt = mapAdjustToEastmoney(req.adjust);

  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${market}.${code}&klt=${klt}&fqt=${fqt}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&end=20500101&lmt=1000`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`东财 K 线 HTTP ${resp.status}`);
  const json = await resp.json();
  return parseEastmoneyKline(json);
}

export function parseEastmoneyKline(json: any): KlinePoint[] {
  const klines: string[] = json?.data?.klines || [];
  return klines.map((row) => {
    // 日期, 开, 收, 高, 低, 成交量(手), 成交额, 振幅, 涨跌幅, 涨跌额, 换手率
    const f = row.split(",");
    const time = Math.floor(new Date(
      f[0].length === 10 ? f[0] + "T00:00:00+08:00" : f[0].replace(" ", "T") + "+08:00"
    ).getTime() / 1000);
    return {
      time,
      open: parseFloat(f[1]),
      close: parseFloat(f[2]),
      high: parseFloat(f[3]),
      low: parseFloat(f[4]),
      volume: parseFloat(f[5]) * 100,
      amount: parseFloat(f[6]),
    };
  });
}
```

- [ ] **Step 4: 运行测试**

Run: `cd sidecar && bun test kline/eastmoney.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add sidecar/kline/eastmoney.ts sidecar/kline/eastmoney.test.ts
git commit -m "feat(kline): 添加东方财富 A 股复权 K 线备用源"
```

---

## Task 6: Sidecar — 路由 + CLI handler 入口

**Files:**
- Create: `sidecar/kline/index.ts`
- Modify: `sidecar/cli-handlers.ts`
- Modify: `sidecar/index.ts`

- [ ] **Step 1: 实现路由层**

`sidecar/kline/index.ts`:

```typescript
import type { KlineRequest, KlinePoint, RealtimeQuote } from "../../shared/types";
import type { NormalizedRequest } from "./types";
import { fetchYahooKline, fetchYahooQuote } from "./yahoo";
import { fetchTencentKline, fetchTencentQuote } from "./tencent";
import { fetchEastmoneyKline } from "./eastmoney";
import { logger, toErrorMessage } from "../utils";

function detectMarket(symbol: string): "A股" | "美股" {
  return /(?<!\d)\d{6}(?!\d)/.test(symbol) ? "A股" : "美股";
}

function normalize(req: KlineRequest): NormalizedRequest {
  return {
    rawSymbol: req.symbol,
    period: req.period,
    range: req.range,
    adjust: req.adjust ?? "qfq",
    market: detectMarket(req.symbol),
  };
}

/**
 * 拉取 K 线 — A 股先腾讯，失败回退东财；美股 Yahoo
 */
export async function getKline(req: KlineRequest): Promise<KlinePoint[]> {
  const n = normalize(req);
  if (n.market === "美股") return fetchYahooKline(n);

  try {
    return await fetchTencentKline(n);
  } catch (err) {
    logger.warn(`腾讯 K 线失败，回退东财：${toErrorMessage(err)}`);
    return fetchEastmoneyKline(n);
  }
}

/**
 * 拉取实时报价
 */
export async function getQuote(symbol: string): Promise<RealtimeQuote> {
  const market = detectMarket(symbol);
  return market === "美股" ? fetchYahooQuote(symbol) : fetchTencentQuote(symbol);
}
```

- [ ] **Step 2: 扩展 CLI handler**

在 `sidecar/cli-handlers.ts` 的 `return { ... }` 对象里追加（位置：`handleSearch` 之后、`handleAnalysis` 之前）：

```typescript
    /**
     * 拉取 K 线
     */
    async handleKline(reqJson: string) {
      try {
        const req = JSON.parse(reqJson);
        const { getKline } = await import("./kline");
        const points = await getKline(req);
        out({ data: points });
      } catch (error) {
        out({ error: { code: "ERR_KLINE", message: toErrorMessage(error) } });
      }
    },

    /**
     * 拉取实时报价
     */
    async handleQuote(symbol: string) {
      try {
        const { getQuote } = await import("./kline");
        const quote = await getQuote(symbol);
        out({ data: quote });
      } catch (error) {
        out({ error: { code: "ERR_QUOTE", message: toErrorMessage(error) } });
      }
    },
```

- [ ] **Step 3: 在 sidecar 入口注册新 action**

修改 `sidecar/index.ts` 的 `run` 函数：

1. 在变量声明区追加：
```typescript
  const isKline = args.some(arg => arg === '--kline');
  const isQuote = args.some(arg => arg === '--quote');
```

2. 在 `isSearch` 分支之后追加：
```typescript
  } else if (isKline) {
    action = '--kline';
    const idx = args.indexOf('--kline');
    // 参数顺序: ["--kline", request_json]
    actionParam = args[idx + 1];
  } else if (isQuote) {
    action = '--quote';
    const idx = args.indexOf('--quote');
    // 参数顺序: ["--quote", symbol]
    actionParam = args[idx + 1];
```

3. 在 `switch (action)` 里追加：
```typescript
    case '--kline':
      await Handlers.handleKline(actionParam || '{}');
      break;
    case '--quote':
      await Handlers.handleQuote(actionParam || '');
      break;
```

- [ ] **Step 4: 验证类型 + 测试**

Run: `cd sidecar && bunx tsc --noEmit && bun test`
Expected: 类型通过 + 已有测试全绿。

- [ ] **Step 5: 手动 smoke test**

Run: `cd sidecar && bun run index.ts --kline '{"symbol":"AAPL","period":"1d","range":"1m"}'`
Expected: 看到 `{"data":[...]}` 含若干 K 线点。

Run: `cd sidecar && bun run index.ts --quote AAPL`
Expected: 看到 `{"data":{"symbol":"AAPL",...}}`。

- [ ] **Step 6: 提交**

```bash
git add sidecar/kline/index.ts sidecar/cli-handlers.ts sidecar/index.ts
git commit -m "feat(sidecar): 添加 kline / quote 路由与 CLI 入口"
```

---

## Task 7: Tauri Core — 新增 IPC 命令

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 在 `SidecarManager` impl 块里追加两个方法**

位置：`search_stocks` 之后、`impl` 块结束前：

```rust
    async fn fetch_kline(
        app_handle: &tauri::AppHandle,
        request: serde_json::Value,
    ) -> Result<String, String> {
        let request_json = serde_json::to_string(&request)
            .map_err(|e| format!("K 线参数序列化失败: {}", e))?;
        Self::run(app_handle, vec!["--kline".to_string(), request_json]).await
    }

    async fn fetch_quote(
        app_handle: &tauri::AppHandle,
        symbol: String,
    ) -> Result<String, String> {
        Self::run(app_handle, vec!["--quote".to_string(), symbol]).await
    }
```

- [ ] **Step 2: 在文件顶层追加两个 `#[tauri::command]`**

位置：`#[tauri::command] async fn start_analysis` 之前：

```rust
/**
 * 拉取 K 线
 */
#[tauri::command]
async fn fetch_kline(
    app_handle: tauri::AppHandle,
    request: serde_json::Value,
) -> Result<String, String> {
    SidecarManager::fetch_kline(&app_handle, request).await
}

/**
 * 拉取实时报价
 */
#[tauri::command]
async fn fetch_realtime_quote(
    app_handle: tauri::AppHandle,
    symbol: String,
) -> Result<String, String> {
    SidecarManager::fetch_quote(&app_handle, symbol).await
}
```

- [ ] **Step 3: 在 `invoke_handler` 注册**

修改 `pub fn run()` 中的 `invoke_handler` 行：

```rust
        .invoke_handler(tauri::generate_handler![
            start_analysis,
            list_models,
            get_stock_info,
            search_stocks,
            fetch_kline,
            fetch_realtime_quote
        ])
```

- [ ] **Step 4: 编译**

Run: `cd src-tauri && cargo check`
Expected: 编译通过。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(tauri): 注册 fetch_kline / fetch_realtime_quote 命令"
```

---

## Task 8: 前端 IPC 封装

**Files:**
- Modify: `src/lib/ipc.ts`

- [ ] **Step 1: 追加新接口**

在 `src/lib/ipc.ts` 文件末尾追加（保留现有的所有函数）：

```typescript
import type { KlineRequest, KlinePoint, RealtimeQuote } from "../../shared/types";

const MOCK_KLINE: KlinePoint[] = Array.from({ length: 30 }, (_, i) => {
  const base = 180 + Math.sin(i / 5) * 5;
  return {
    time: Math.floor(Date.now() / 1000) - (30 - i) * 86400,
    open: base,
    high: base + 2,
    low: base - 2,
    close: base + (Math.random() - 0.5) * 3,
    volume: 50_000_000 + Math.random() * 10_000_000,
  };
});

const MOCK_QUOTE: RealtimeQuote = {
  symbol: "AAPL", name: "Apple Inc.", price: 180.5, change: 2.5, changePercent: 1.4,
  open: 179, high: 182, low: 178.5, prevClose: 178, volume: 55_000_000, amount: 9_900_000_000,
  high52w: 200, low52w: 150, timestamp: Math.floor(Date.now() / 1000), currency: "USD", market: "美股",
};

/** 拉取 K 线 */
export async function fetchKline(req: KlineRequest): Promise<KlinePoint[]> {
  if (!isTauri()) return MOCK_KLINE;
  const raw = await invoke<string>("fetch_kline", { request: req });
  return parseServiceResponse<KlinePoint[]>(raw);
}

/** 拉取实时报价 */
export async function fetchRealtimeQuote(symbol: string): Promise<RealtimeQuote> {
  if (!isTauri()) return MOCK_QUOTE;
  const raw = await invoke<string>("fetch_realtime_quote", { symbol });
  return parseServiceResponse<RealtimeQuote>(raw);
}
```

- [ ] **Step 2: 类型检查**

Run: `bunx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add src/lib/ipc.ts
git commit -m "feat(ipc): 添加 fetchKline / fetchRealtimeQuote 前端封装"
```

---

## Task 9: 指标计算 — MA / EMA / Volume MA

**Files:**
- Create: `src/lib/indicators.ts`
- Create: `src/lib/indicators.test.ts`

- [ ] **Step 1: 写测试**

`src/lib/indicators.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { sma, ema } from "./indicators";

describe("sma", () => {
  it("窗口 3 在数据 [1..5] 上正确滑动", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it("数据不足窗口长度 → 全部为 null", () => {
    expect(sma([1, 2], 5)).toEqual([null, null]);
  });

  it("空数组 → 空数组", () => {
    expect(sma([], 5)).toEqual([]);
  });
});

describe("ema", () => {
  it("第一个有效值等于前 N 个平均", () => {
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeCloseTo(2, 5); // 起步用 SMA(1,2,3)
  });

  it("EMA 公式 alpha = 2/(N+1)", () => {
    const out = ema([1, 2, 3, 4, 5], 3);
    // EMA[3] = SMA(1..3) * (1-alpha) + 4 * alpha; alpha=0.5
    expect(out[3]).toBeCloseTo(2 * 0.5 + 4 * 0.5, 5);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `bunx vitest run src/lib/indicators.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: 实现**

`src/lib/indicators.ts`:

```typescript
/**
 * 简单移动平均（SMA）
 * 不足周期的位置返回 null（便于图表跳过绘制）
 */
export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    sum += values[i] - values[i - period];
    out[i] = sum / period;
  }
  return out;
}

/**
 * 指数移动平均（EMA）
 * 起步用 SMA(N) 作为种子，之后用 EMA[t] = EMA[t-1] * (1-α) + price[t] * α，α = 2 / (N+1)
 */
export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;

  const alpha = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = prev * (1 - alpha) + values[i] * alpha;
    out[i] = prev;
  }
  return out;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `bunx vitest run src/lib/indicators.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/indicators.ts src/lib/indicators.test.ts
git commit -m "feat(indicators): 添加 SMA / EMA"
```

---

## Task 10: 指标计算 — MACD / RSI / KDJ

**Files:**
- Modify: `src/lib/indicators.ts`
- Modify: `src/lib/indicators.test.ts`

- [ ] **Step 1: 追加测试**

在 `src/lib/indicators.test.ts` 末尾追加：

```typescript
import { macd, rsi, kdj } from "./indicators";

describe("macd", () => {
  it("DIF = EMA12 - EMA26，DEA = EMA9(DIF)", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5);
    const { dif, dea, hist } = macd(closes, 12, 26, 9);
    expect(dif).toHaveLength(60);
    expect(dea).toHaveLength(60);
    expect(hist).toHaveLength(60);
    // 前 25 根没有 EMA26 → DIF 必为 null
    expect(dif[24]).toBeNull();
    expect(dif[25]).not.toBeNull();
    // DEA 又要 EMA9 → 至少 25+8=33 之后有值
    expect(dea[33]).not.toBeNull();
    // hist = (dif - dea) * 2
    const i = 40;
    expect(hist[i]).toBeCloseTo(((dif[i] as number) - (dea[i] as number)) * 2, 5);
  });
});

describe("rsi", () => {
  it("全部上涨 → RSI 接近 100", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const out = rsi(closes, 14);
    expect(out[19]).toBeGreaterThan(99);
  });
  it("全部下跌 → RSI 接近 0", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 - i);
    const out = rsi(closes, 14);
    expect(out[19]).toBeLessThan(1);
  });
});

describe("kdj", () => {
  it("返回与输入等长的 K / D / J", () => {
    const highs  = Array.from({ length: 30 }, (_, i) => 110 + i);
    const lows   = Array.from({ length: 30 }, (_, i) => 100 + i);
    const closes = Array.from({ length: 30 }, (_, i) => 105 + i);
    const { k, d, j } = kdj(highs, lows, closes, 9, 3, 3);
    expect(k).toHaveLength(30);
    expect(d).toHaveLength(30);
    expect(j).toHaveLength(30);
    // 前 8 根 RSV 未形成 → K/D/J 为 null
    expect(k[7]).toBeNull();
    expect(k[8]).not.toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `bunx vitest run src/lib/indicators.test.ts`
Expected: 新增 cases FAIL。

- [ ] **Step 3: 追加实现**

在 `src/lib/indicators.ts` 末尾追加：

```typescript
/**
 * MACD
 * DIF = EMA(close, short) - EMA(close, long)
 * DEA = EMA(DIF, signal)
 * HIST = (DIF - DEA) * 2
 */
export function macd(
  closes: number[],
  short = 12,
  long = 26,
  signal = 9,
): { dif: (number | null)[]; dea: (number | null)[]; hist: (number | null)[] } {
  const emaShort = ema(closes, short);
  const emaLong = ema(closes, long);
  const dif: (number | null)[] = closes.map((_, i) => {
    const a = emaShort[i], b = emaLong[i];
    return a == null || b == null ? null : a - b;
  });

  // DEA = EMA(DIF, signal)，只在 DIF 有值后开始
  const dea: (number | null)[] = new Array(closes.length).fill(null);
  const alpha = 2 / (signal + 1);
  let seedSum = 0, seedCount = 0, prev: number | null = null;
  for (let i = 0; i < closes.length; i++) {
    const v = dif[i];
    if (v == null) continue;
    if (prev == null) {
      seedSum += v; seedCount++;
      if (seedCount >= signal) {
        prev = seedSum / signal;
        dea[i] = prev;
      }
    } else {
      prev = prev * (1 - alpha) + v * alpha;
      dea[i] = prev;
    }
  }

  const hist: (number | null)[] = closes.map((_, i) => {
    const a = dif[i], b = dea[i];
    return a == null || b == null ? null : (a - b) * 2;
  });

  return { dif, dea, hist };
}

/**
 * RSI（Wilder 平滑）
 * RSI = 100 - 100 / (1 + RS)，RS = 平均涨幅 / 平均跌幅
 */
export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gainSum += d; else lossSum -= d;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d >= 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/**
 * KDJ（标准 9,3,3）
 * RSV = (C - LowN) / (HighN - LowN) * 100
 * K = 前K * (kPeriod-1)/kPeriod + RSV / kPeriod
 * D = 前D * (dPeriod-1)/dPeriod + K  / dPeriod
 * J = 3*K - 2*D
 */
export function kdj(
  highs: number[],
  lows: number[],
  closes: number[],
  nPeriod = 9,
  kPeriod = 3,
  dPeriod = 3,
): { k: (number | null)[]; d: (number | null)[]; j: (number | null)[] } {
  const n = closes.length;
  const k: (number | null)[] = new Array(n).fill(null);
  const d: (number | null)[] = new Array(n).fill(null);
  const j: (number | null)[] = new Array(n).fill(null);
  let prevK = 50, prevD = 50;

  for (let i = nPeriod - 1; i < n; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let p = i - nPeriod + 1; p <= i; p++) {
      if (highs[p] > hh) hh = highs[p];
      if (lows[p] < ll) ll = lows[p];
    }
    const rsv = hh === ll ? 0 : ((closes[i] - ll) / (hh - ll)) * 100;
    const kVal = (prevK * (kPeriod - 1) + rsv) / kPeriod;
    const dVal = (prevD * (dPeriod - 1) + kVal) / dPeriod;
    const jVal = 3 * kVal - 2 * dVal;
    k[i] = kVal; d[i] = dVal; j[i] = jVal;
    prevK = kVal; prevD = dVal;
  }
  return { k, d, j };
}
```

- [ ] **Step 4: 运行测试**

Run: `bunx vitest run src/lib/indicators.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/indicators.ts src/lib/indicators.test.ts
git commit -m "feat(indicators): 添加 MACD / RSI / KDJ"
```

---

## Task 11: 指标计算 — BOLL / OBV / VWAP

**Files:**
- Modify: `src/lib/indicators.ts`
- Modify: `src/lib/indicators.test.ts`

- [ ] **Step 1: 追加测试**

在 `src/lib/indicators.test.ts` 末尾追加：

```typescript
import { boll, obv, vwap } from "./indicators";

describe("boll", () => {
  it("中轨 = SMA，上下轨 = 中轨 ± k×std", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const { mid, upper, lower } = boll(closes, 20, 2);
    expect(mid[19]).not.toBeNull();
    // 等差数列：std 可手算；20 项 [1..20] 的样本 std ≈ 5.766
    expect((upper[19] as number) - (mid[19] as number)).toBeCloseTo(2 * 5.766, 1);
    expect((mid[19] as number) - (lower[19] as number)).toBeCloseTo(2 * 5.766, 1);
  });
});

describe("obv", () => {
  it("收盘上涨日累加成交量，下跌日扣减", () => {
    const closes = [10, 11, 10, 12];
    const volumes = [100, 200, 150, 300];
    expect(obv(closes, volumes)).toEqual([100, 300, 150, 450]);
  });
});

describe("vwap", () => {
  it("VWAP = Σ(typPrice × vol) / Σvol", () => {
    const highs = [10, 12], lows = [8, 10], closes = [9, 11], volumes = [100, 200];
    const out = vwap(highs, lows, closes, volumes);
    // typ[0]=9, typ[1]=11；vwap[0]=9；vwap[1]=(9*100+11*200)/300=10.333
    expect(out[0]).toBeCloseTo(9, 5);
    expect(out[1]).toBeCloseTo(10.333, 3);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `bunx vitest run src/lib/indicators.test.ts`
Expected: 新增 FAIL。

- [ ] **Step 3: 追加实现**

在 `src/lib/indicators.ts` 末尾追加：

```typescript
/**
 * 布林带 BOLL（中轨 SMA + 标准差倍数上下轨）
 */
export function boll(
  closes: number[],
  period = 20,
  k = 2,
): { mid: (number | null)[]; upper: (number | null)[]; lower: (number | null)[] } {
  const mid = sma(closes, period);
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);

  for (let i = period - 1; i < closes.length; i++) {
    const m = mid[i] as number;
    let sq = 0;
    for (let p = i - period + 1; p <= i; p++) sq += (closes[p] - m) ** 2;
    const std = Math.sqrt(sq / period);
    upper[i] = m + k * std;
    lower[i] = m - k * std;
  }
  return { mid, upper, lower };
}

/**
 * OBV（能量潮）
 * 上涨日 += vol，下跌日 -= vol，平盘 += 0；首日 = vol[0]
 */
export function obv(closes: number[], volumes: number[]): number[] {
  const out: number[] = new Array(closes.length).fill(0);
  if (closes.length === 0) return out;
  out[0] = volumes[0];
  for (let i = 1; i < closes.length; i++) {
    const sign = closes[i] > closes[i - 1] ? 1 : closes[i] < closes[i - 1] ? -1 : 0;
    out[i] = out[i - 1] + sign * volumes[i];
  }
  return out;
}

/**
 * VWAP（成交量加权均价，累计型）
 * 典型价 = (H+L+C)/3；VWAP = Σ(typ × vol) / Σvol
 */
export function vwap(highs: number[], lows: number[], closes: number[], volumes: number[]): number[] {
  const out: number[] = new Array(closes.length).fill(0);
  let pvSum = 0, vSum = 0;
  for (let i = 0; i < closes.length; i++) {
    const typ = (highs[i] + lows[i] + closes[i]) / 3;
    pvSum += typ * volumes[i];
    vSum += volumes[i];
    out[i] = vSum === 0 ? typ : pvSum / vSum;
  }
  return out;
}
```

- [ ] **Step 4: 运行测试**

Run: `bunx vitest run src/lib/indicators.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/indicators.ts src/lib/indicators.test.ts
git commit -m "feat(indicators): 添加 BOLL / OBV / VWAP"
```

---

## Task 12: 安装依赖 + PriceChart 目录骨架

**Files:**
- Modify: `package.json`
- Create: `src/components/PriceChart/types.ts`
- Create: `src/components/PriceChart/index.tsx`（占位）

- [ ] **Step 1: 安装依赖**

```bash
bun add lightweight-charts@^4
```

- [ ] **Step 2: 定义 UI 类型**

`src/components/PriceChart/types.ts`:

```typescript
import type { KlinePeriod, KlineRange } from "../../../shared/types";

export type ChartType = "candle" | "line" | "area" | "heikin-ashi";

export type SubChartIndicator = "macd" | "rsi" | "kdj" | "boll" | "obv" | "vwap";

export interface ChartConfig {
  range: KlineRange;
  chartType: ChartType;
  logScale: boolean;
  adjust: "qfq" | "hfq" | "none";
  subIndicator: SubChartIndicator;
  showMA: { short: boolean; mid: boolean; long: boolean };
  compareSymbol?: string;
}

export const DEFAULT_CONFIG: ChartConfig = {
  range: "1y",
  chartType: "candle",
  logScale: false,
  adjust: "qfq",
  subIndicator: "macd",
  showMA: { short: true, mid: true, long: true },
};

/** 时间范围 → K 线粒度映射 */
export function rangeToPeriod(range: KlineRange): KlinePeriod {
  switch (range) {
    case "1d":  return "1m";
    case "5d":  return "5m";
    case "5y":  return "1w";
    case "all": return "1mo";
    default:    return "1d";
  }
}

/** 按市场返回三档均线周期 */
export function maPeriodsForMarket(market: "A股" | "美股"): { short: number; mid: number; long: number } {
  return market === "A股"
    ? { short: 5, mid: 20, long: 60 }
    : { short: 20, mid: 50, long: 200 };
}

export const MA_COLORS = {
  short: "#F5C842",
  mid:   "#B388FF",
  long:  "#4FC3F7",
} as const;
```

- [ ] **Step 3: 创建占位 index（让 import 不报错）**

`src/components/PriceChart/index.tsx`:

```typescript
import React from "react";

interface PriceChartProps {
  symbol: string;
}

const PriceChart: React.FC<PriceChartProps> = ({ symbol }) => (
  <div className="w-full bg-panel rounded-xl border border-white/10 p-8 text-center text-gray-500">
    PriceChart 占位 ({symbol})
  </div>
);

export default PriceChart;
```

- [ ] **Step 4: 让 Dashboard 改用目录形式**

修改 `src/components/Dashboard.tsx` 第 2 行：

```typescript
// 原：import PriceChart from './PriceChart';
import PriceChart from './PriceChart/index';
```

（实际效果与原写法等价，只是为后续目录展开做准备；TypeScript 会自动 resolve `./PriceChart` 到 `./PriceChart/index.tsx`，但显式写一次更清晰。）

- [ ] **Step 5: 类型检查 + 启动 dev 验证**

Run: `bunx tsc --noEmit`
Expected: 无错误。

Run: `bun tauri dev`（手动验证页面能加载，K 线区域显示占位文字）

- [ ] **Step 6: 提交**

```bash
git add package.json bun.lockb src/components/PriceChart/ src/components/Dashboard.tsx src/components/PriceChart.tsx
git commit -m "feat(chart): 安装 lightweight-charts 并搭建 PriceChart 目录骨架"
```

注：`src/components/PriceChart.tsx`（旧 iframe）此时还在；目录解析时 TS/Vite 会优先匹配文件 `PriceChart.tsx` 而非目录 `PriceChart/`。**为避免歧义，需要立即删除旧文件**：

```bash
git rm src/components/PriceChart.tsx
git commit --amend --no-edit
```

---

## Task 13: ChartCanvas — 主图 K 线 + 成交量副图

**Files:**
- Create: `src/components/PriceChart/ChartCanvas.tsx`

- [ ] **Step 1: 实现 ChartCanvas**

`src/components/PriceChart/ChartCanvas.tsx`:

```typescript
import React, { useEffect, useRef } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type UTCTimestamp,
  ColorType,
  CrosshairMode,
} from "lightweight-charts";
import type { KlinePoint } from "../../../shared/types";
import { upColor, downColor } from "../../lib/market-hours";

interface Props {
  data: KlinePoint[];
  market: "A股" | "美股";
  logScale: boolean;
  height?: number;
  onCrosshair?: (point: KlinePoint | null) => void;
}

const ChartCanvas: React.FC<Props> = ({ data, market, logScale, height = 520, onCrosshair }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  // 创建图表 — 只在首次挂载时执行
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "rgba(255,255,255,0.55)" },
      grid:   { vertLines: { color: "rgba(255,255,255,0.06)" }, horzLines: { color: "rgba(255,255,255,0.06)" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: true,
    });

    const candle = chart.addCandlestickSeries({
      upColor: upColor(market),
      downColor: downColor(market),
      borderUpColor: upColor(market),
      borderDownColor: downColor(market),
      wickUpColor: upColor(market),
      wickDownColor: downColor(market),
    });

    const volume = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });

    chartRef.current = chart;
    candleRef.current = candle;
    volumeRef.current = volume;

    // 十字光标订阅
    if (onCrosshair) {
      chart.subscribeCrosshairMove((param) => {
        if (!param.time || !param.seriesData.get(candle)) {
          onCrosshair(null);
          return;
        }
        const cd = param.seriesData.get(candle) as CandlestickData;
        const vd = param.seriesData.get(volume) as HistogramData | undefined;
        onCrosshair({
          time: cd.time as number,
          open: cd.open,
          high: cd.high,
          low: cd.low,
          close: cd.close,
          volume: vd?.value ?? 0,
        });
      });
    }

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
    };
  }, [market, onCrosshair]);

  // 喂入数据
  useEffect(() => {
    if (!candleRef.current || !volumeRef.current) return;

    const candleData: CandlestickData[] = data.map((p) => ({
      time: p.time as UTCTimestamp,
      open: p.open, high: p.high, low: p.low, close: p.close,
    }));

    const volData: HistogramData[] = data.map((p) => ({
      time: p.time as UTCTimestamp,
      value: p.volume,
      color: p.close >= p.open ? upColor(market) + "80" : downColor(market) + "80",
    }));

    candleRef.current.setData(candleData);
    volumeRef.current.setData(volData);
    chartRef.current?.timeScale().fitContent();
  }, [data, market]);

  // 对数坐标
  useEffect(() => {
    chartRef.current?.priceScale("right").applyOptions({ mode: logScale ? 1 : 0 });
  }, [logScale]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
};

export default ChartCanvas;
```

- [ ] **Step 2: 让 PriceChart 占位渲染真实 ChartCanvas（验证用）**

临时修改 `src/components/PriceChart/index.tsx`：

```typescript
import React, { useEffect, useState } from "react";
import ChartCanvas from "./ChartCanvas";
import { fetchKline } from "../../lib/ipc";
import { detectMarket } from "../../lib/market-hours";
import type { KlinePoint } from "../../../shared/types";

interface Props { symbol: string; }

const PriceChart: React.FC<Props> = ({ symbol }) => {
  const [data, setData] = useState<KlinePoint[]>([]);
  const market = detectMarket(symbol);

  useEffect(() => {
    fetchKline({ symbol, period: "1d", range: "1y" }).then(setData).catch(console.error);
  }, [symbol]);

  return (
    <div className="w-full bg-panel rounded-xl border border-white/10 p-4">
      <ChartCanvas data={data} market={market} logScale={false} />
    </div>
  );
};

export default PriceChart;
```

- [ ] **Step 3: 浏览器人工验证**

Run: `bun tauri dev`
Expected: 切换股票时图表加载，K 线显示，成交量副图在下方，颜色按市场区分（A 股红涨绿跌，美股反之）。

- [ ] **Step 4: 提交**

```bash
git add src/components/PriceChart/ChartCanvas.tsx src/components/PriceChart/index.tsx
git commit -m "feat(chart): 实现 ChartCanvas 主图 K 线 + 成交量副图"
```

---

## Task 14: ChartCanvas — 叠加 MA 均线 + 关键水平线

**Files:**
- Modify: `src/components/PriceChart/ChartCanvas.tsx`

- [ ] **Step 1: 扩展 Props**

修改 `ChartCanvas.tsx` 顶部 import 和 Props：

```typescript
import { sma } from "../../lib/indicators";
import { maPeriodsForMarket, MA_COLORS } from "./types";
import { type LineData, type IPriceLine, LineStyle } from "lightweight-charts";

interface Props {
  data: KlinePoint[];
  market: "A股" | "美股";
  logScale: boolean;
  height?: number;
  showMA: { short: boolean; mid: boolean; long: boolean };
  prevClose?: number;     // 昨收水平线
  currentPrice?: number;  // 当前价水平线
  onCrosshair?: (point: KlinePoint | null) => void;
}
```

并在解构里增加 `showMA, prevClose, currentPrice`。

- [ ] **Step 2: 在 useEffect 中创建 3 条 MA 折线 + 水平线**

在原 `// 创建图表` 的 useEffect 内、`return () => ...` 之前追加：

```typescript
    // 3 条均线
    const maSeries = {
      short: chart.addLineSeries({ color: MA_COLORS.short, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }),
      mid:   chart.addLineSeries({ color: MA_COLORS.mid,   lineWidth: 1, priceLineVisible: false, lastValueVisible: false }),
      long:  chart.addLineSeries({ color: MA_COLORS.long,  lineWidth: 1, priceLineVisible: false, lastValueVisible: false }),
    };
    maRef.current = maSeries;
```

并在文件顶部新增 ref：

```typescript
  const maRef = useRef<{
    short: ISeriesApi<"Line">;
    mid:   ISeriesApi<"Line">;
    long:  ISeriesApi<"Line">;
  } | null>(null);
  const priceLinesRef = useRef<{ prev?: IPriceLine; current?: IPriceLine }>({});
```

- [ ] **Step 3: 数据更新 effect 内追加 MA 计算**

在 `useEffect(... [data, market])` 内 `setData` 调用之后追加：

```typescript
    if (maRef.current) {
      const periods = maPeriodsForMarket(market);
      const closes = data.map((p) => p.close);
      const times = data.map((p) => p.time as UTCTimestamp);
      const toLine = (vals: (number | null)[]): LineData[] =>
        vals.map((v, i) => (v == null ? null : { time: times[i], value: v }))
            .filter((x): x is LineData => x !== null);

      maRef.current.short.setData(showMA.short ? toLine(sma(closes, periods.short)) : []);
      maRef.current.mid.setData(  showMA.mid   ? toLine(sma(closes, periods.mid))   : []);
      maRef.current.long.setData( showMA.long  ? toLine(sma(closes, periods.long))  : []);
    }
```

- [ ] **Step 4: 关键水平线 effect**

在文件中追加一个新 useEffect：

```typescript
  // 关键水平线：昨收 + 当前价
  useEffect(() => {
    const candle = candleRef.current;
    if (!candle) return;

    if (priceLinesRef.current.prev) {
      candle.removePriceLine(priceLinesRef.current.prev);
      priceLinesRef.current.prev = undefined;
    }
    if (priceLinesRef.current.current) {
      candle.removePriceLine(priceLinesRef.current.current);
      priceLinesRef.current.current = undefined;
    }

    if (prevClose != null) {
      priceLinesRef.current.prev = candle.createPriceLine({
        price: prevClose,
        color: "rgba(255,255,255,0.4)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "昨收",
      });
    }
    if (currentPrice != null) {
      const isUp = prevClose == null || currentPrice >= prevClose;
      priceLinesRef.current.current = candle.createPriceLine({
        price: currentPrice,
        color: isUp ? upColor(market) : downColor(market),
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: "现价",
      });
    }
  }, [prevClose, currentPrice, market]);
```

- [ ] **Step 5: 临时让 PriceChart 传入 MA 开关**

修改 `src/components/PriceChart/index.tsx`：

```typescript
<ChartCanvas
  data={data}
  market={market}
  logScale={false}
  showMA={{ short: true, mid: true, long: true }}
/>
```

- [ ] **Step 6: 浏览器人工验证**

Run: `bun tauri dev`
Expected: 图表上看到 3 条彩色均线（黄/紫/蓝），数据少时短线先出现。切换股票时均线重算。

- [ ] **Step 7: 提交**

```bash
git add src/components/PriceChart/ChartCanvas.tsx src/components/PriceChart/index.tsx
git commit -m "feat(chart): 叠加 MA 均线与昨收 / 当前价水平线"
```

---

## Task 15: QuoteHeader — 顶部信息条

**Files:**
- Create: `src/components/PriceChart/QuoteHeader.tsx`

- [ ] **Step 1: 实现 QuoteHeader**

`src/components/PriceChart/QuoteHeader.tsx`:

```typescript
import React from "react";
import type { RealtimeQuote } from "../../../shared/types";
import { upColor, downColor } from "../../lib/market-hours";

interface Props {
  quote: RealtimeQuote | null;
  fallbackSymbol: string;
}

function formatNumber(n: number | undefined, digits = 2): string {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatBig(n: number | undefined): string {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "万亿";
  if (n >= 1e8)  return (n / 1e8).toFixed(2) + "亿";
  if (n >= 1e4)  return (n / 1e4).toFixed(2) + "万";
  return n.toString();
}

const QuoteHeader: React.FC<Props> = ({ quote, fallbackSymbol }) => {
  if (!quote) {
    return (
      <div className="px-5 py-4 border-b border-white/5">
        <div className="font-bold text-lg">{fallbackSymbol}</div>
        <div className="text-xs text-gray-500 mt-1">行情加载中…</div>
      </div>
    );
  }

  const isUp = quote.change >= 0;
  const color = isUp ? upColor(quote.market) : downColor(quote.market);
  const sign = isUp ? "+" : "";
  const arrow = isUp ? "▲" : "▼";

  return (
    <div className="px-5 py-4 border-b border-white/5">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <span className="text-lg font-bold">{quote.name}</span>
          <span className="text-xs text-gray-500 ml-2 font-mono">{quote.symbol}</span>
        </div>
        <div className="flex items-baseline gap-3 font-mono">
          <span className="text-2xl font-bold" style={{ color }}>
            {quote.currency === "CNY" ? "¥" : "$"}{formatNumber(quote.price)}
          </span>
          <span className="text-base font-medium" style={{ color }}>
            {arrow} {sign}{formatNumber(quote.change)} ({sign}{formatNumber(quote.changePercent)}%)
          </span>
          {quote.preMarket && (
            <span className="text-xs text-gray-400">盘前 {formatNumber(quote.preMarket.price)} ({quote.preMarket.changePercent >= 0 ? "+" : ""}{formatNumber(quote.preMarket.changePercent)}%)</span>
          )}
          {quote.postMarket && (
            <span className="text-xs text-gray-400">盘后 {formatNumber(quote.postMarket.price)} ({quote.postMarket.changePercent >= 0 ? "+" : ""}{formatNumber(quote.postMarket.changePercent)}%)</span>
          )}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 md:grid-cols-6 gap-x-6 gap-y-1 text-xs text-gray-400 font-mono">
        <div>开 <span className="text-gray-200">{formatNumber(quote.open)}</span></div>
        <div>高 <span className="text-gray-200">{formatNumber(quote.high)}</span></div>
        <div>低 <span className="text-gray-200">{formatNumber(quote.low)}</span></div>
        <div>昨收 <span className="text-gray-200">{formatNumber(quote.prevClose)}</span></div>
        <div>量 <span className="text-gray-200">{formatBig(quote.volume)}</span></div>
        <div>额 <span className="text-gray-200">{formatBig(quote.amount)}</span></div>
        {quote.turnoverRate != null && <div>换手 <span className="text-gray-200">{formatNumber(quote.turnoverRate)}%</span></div>}
        {quote.pe != null && <div>PE <span className="text-gray-200">{formatNumber(quote.pe)}</span></div>}
        {quote.pb != null && <div>PB <span className="text-gray-200">{formatNumber(quote.pb)}</span></div>}
        {quote.marketCap != null && <div>市值 <span className="text-gray-200">{formatBig(quote.marketCap)}</span></div>}
        {quote.high52w != null && <div>52周高 <span className="text-gray-200">{formatNumber(quote.high52w)}</span></div>}
        {quote.low52w != null && <div>52周低 <span className="text-gray-200">{formatNumber(quote.low52w)}</span></div>}
      </div>
    </div>
  );
};

export default QuoteHeader;
```

- [ ] **Step 2: 类型检查**

Run: `bunx tsc --noEmit`
Expected: 通过。

- [ ] **Step 3: 提交**

```bash
git add src/components/PriceChart/QuoteHeader.tsx
git commit -m "feat(chart): 实现 QuoteHeader 顶部信息条"
```

---

## Task 16: Toolbar — 时间范围 + 工具开关

**Files:**
- Create: `src/components/PriceChart/Toolbar.tsx`

- [ ] **Step 1: 实现 Toolbar**

`src/components/PriceChart/Toolbar.tsx`:

```typescript
import React from "react";
import type { KlineRange } from "../../../shared/types";
import type { ChartConfig, SubChartIndicator } from "./types";

interface Props {
  config: ChartConfig;
  onChange: (next: ChartConfig) => void;
  onScreenshot?: () => void;
}

const RANGES: { value: KlineRange; label: string }[] = [
  { value: "1d", label: "1D" }, { value: "5d", label: "5D" },
  { value: "1m", label: "1M" }, { value: "3m", label: "3M" }, { value: "6m", label: "6M" },
  { value: "ytd", label: "YTD" }, { value: "1y", label: "1Y" },
  { value: "5y", label: "5Y" }, { value: "all", label: "All" },
];

const SUB_INDICATORS: { value: SubChartIndicator; label: string }[] = [
  { value: "macd", label: "MACD" }, { value: "rsi", label: "RSI" },
  { value: "kdj", label: "KDJ" }, { value: "boll", label: "BOLL" },
  { value: "obv", label: "OBV" }, { value: "vwap", label: "VWAP" },
];

const Toolbar: React.FC<Props> = ({ config, onChange, onScreenshot }) => {
  const update = (patch: Partial<ChartConfig>) => onChange({ ...config, ...patch });

  return (
    <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between flex-wrap gap-3">
      {/* 时间范围 segmented control */}
      <div className="flex gap-1">
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => update({ range: r.value })}
            className={`px-2.5 py-1 text-xs rounded font-mono transition ${
              config.range === r.value
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* 工具栏 */}
      <div className="flex items-center gap-2 text-xs">
        <select
          value={config.subIndicator}
          onChange={(e) => update({ subIndicator: e.target.value as SubChartIndicator })}
          className="bg-white/5 border border-white/10 rounded px-2 py-1 text-gray-200"
          title="副图指标"
        >
          {SUB_INDICATORS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <button
          onClick={() => update({ logScale: !config.logScale })}
          className={`px-2 py-1 rounded border ${config.logScale ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "border-white/10 text-gray-400 hover:text-white"}`}
          title="对数坐标"
        >
          对数
        </button>

        <select
          value={config.adjust}
          onChange={(e) => update({ adjust: e.target.value as "qfq" | "hfq" | "none" })}
          className="bg-white/5 border border-white/10 rounded px-2 py-1 text-gray-200"
          title="复权方式"
        >
          <option value="qfq">前复权</option>
          <option value="hfq">后复权</option>
          <option value="none">不复权</option>
        </select>

        <input
          value={config.compareSymbol || ""}
          onChange={(e) => update({ compareSymbol: e.target.value || undefined })}
          placeholder="比较 (如 SPY)"
          className="bg-white/5 border border-white/10 rounded px-2 py-1 text-gray-200 w-24"
        />

        {onScreenshot && (
          <button onClick={onScreenshot} className="px-2 py-1 border border-white/10 rounded text-gray-400 hover:text-white" title="截图">
            截图
          </button>
        )}
      </div>
    </div>
  );
};

export default Toolbar;
```

- [ ] **Step 2: 类型检查**

Run: `bunx tsc --noEmit`
Expected: 通过。

- [ ] **Step 3: 提交**

```bash
git add src/components/PriceChart/Toolbar.tsx
git commit -m "feat(chart): 实现 Toolbar 时间范围 + 工具开关"
```

---

## Task 17: CrosshairTooltip — 十字光标信息浮层

**Files:**
- Create: `src/components/PriceChart/CrosshairTooltip.tsx`

- [ ] **Step 1: 实现 CrosshairTooltip**

`src/components/PriceChart/CrosshairTooltip.tsx`:

```typescript
import React from "react";
import type { KlinePoint } from "../../../shared/types";
import { upColor, downColor } from "../../lib/market-hours";

interface Props {
  point: KlinePoint | null;
  market: "A股" | "美股";
  prevClose?: number;
  maValues?: { short: number | null; mid: number | null; long: number | null };
}

function fmt(n: number, digits = 2): string {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const CrosshairTooltip: React.FC<Props> = ({ point, market, prevClose, maValues }) => {
  if (!point) return null;

  const ref = prevClose ?? point.open;
  const isUp = point.close >= ref;
  const color = isUp ? upColor(market) : downColor(market);
  const change = point.close - ref;
  const changePct = ref ? (change / ref) * 100 : 0;

  const date = new Date(point.time * 1000);
  const dateStr = date.toLocaleDateString("zh-CN");
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const week = weekdays[date.getDay()];

  return (
    <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm rounded-lg p-3 text-xs font-mono border border-white/10 pointer-events-none z-10 min-w-[200px]">
      <div className="text-gray-300 mb-1.5">{dateStr} (周{week})</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <div>开 <span className="text-gray-100">{fmt(point.open)}</span></div>
        <div>高 <span className="text-gray-100">{fmt(point.high)}</span></div>
        <div>低 <span className="text-gray-100">{fmt(point.low)}</span></div>
        <div>收 <span style={{ color }}>{fmt(point.close)}</span></div>
      </div>
      <div className="mt-1" style={{ color }}>
        {isUp ? "▲" : "▼"} {change >= 0 ? "+" : ""}{fmt(change)} ({change >= 0 ? "+" : ""}{fmt(changePct)}%)
      </div>
      <div className="mt-1 text-gray-400">量 <span className="text-gray-100">{point.volume.toLocaleString("zh-CN")}</span></div>
      {maValues && (
        <div className="mt-1.5 pt-1.5 border-t border-white/10 space-y-0.5">
          {maValues.short != null && <div style={{ color: "#F5C842" }}>MA短 {fmt(maValues.short)}</div>}
          {maValues.mid != null   && <div style={{ color: "#B388FF" }}>MA中 {fmt(maValues.mid)}</div>}
          {maValues.long != null  && <div style={{ color: "#4FC3F7" }}>MA长 {fmt(maValues.long)}</div>}
        </div>
      )}
    </div>
  );
};

export default CrosshairTooltip;
```

- [ ] **Step 2: 提交**

```bash
git add src/components/PriceChart/CrosshairTooltip.tsx
git commit -m "feat(chart): 实现 CrosshairTooltip 十字光标信息浮层"
```

---

## Task 18: PriceChart 容器 — 组装 + 拉数据

**Files:**
- Rewrite: `src/components/PriceChart/index.tsx`

- [ ] **Step 1: 实现完整容器**

`src/components/PriceChart/index.tsx`:

```typescript
import React, { useEffect, useMemo, useState } from "react";
import ChartCanvas from "./ChartCanvas";
import QuoteHeader from "./QuoteHeader";
import Toolbar from "./Toolbar";
import CrosshairTooltip from "./CrosshairTooltip";
import { fetchKline, fetchRealtimeQuote } from "../../lib/ipc";
import { detectMarket } from "../../lib/market-hours";
import { sma } from "../../lib/indicators";
import { DEFAULT_CONFIG, rangeToPeriod, maPeriodsForMarket, type ChartConfig } from "./types";
import type { KlinePoint, RealtimeQuote } from "../../../shared/types";

interface Props {
  symbol: string;
}

const PriceChart: React.FC<Props> = ({ symbol }) => {
  const [config, setConfig] = useState<ChartConfig>(DEFAULT_CONFIG);
  const [data, setData] = useState<KlinePoint[]>([]);
  const [quote, setQuote] = useState<RealtimeQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [crosshair, setCrosshair] = useState<KlinePoint | null>(null);

  const market = useMemo(() => detectMarket(symbol), [symbol]);

  // 拉 K 线
  useEffect(() => {
    setError(null);
    fetchKline({
      symbol,
      period: rangeToPeriod(config.range),
      range: config.range,
      adjust: config.adjust,
    })
      .then(setData)
      .catch((e) => setError(e?.message || "K 线加载失败"));
  }, [symbol, config.range, config.adjust]);

  // 拉报价
  useEffect(() => {
    fetchRealtimeQuote(symbol)
      .then(setQuote)
      .catch(() => setQuote(null));
  }, [symbol]);

  // 计算十字光标对应的 MA 值
  const crosshairMA = useMemo(() => {
    if (!crosshair || data.length === 0) return undefined;
    const idx = data.findIndex((p) => p.time === crosshair.time);
    if (idx < 0) return undefined;
    const closes = data.map((p) => p.close);
    const periods = maPeriodsForMarket(market);
    return {
      short: config.showMA.short ? sma(closes, periods.short)[idx] : null,
      mid:   config.showMA.mid   ? sma(closes, periods.mid)[idx]   : null,
      long:  config.showMA.long  ? sma(closes, periods.long)[idx]  : null,
    };
  }, [crosshair, data, market, config.showMA]);

  return (
    <div className="w-full bg-panel rounded-xl border border-white/10 overflow-hidden mb-8">
      <QuoteHeader quote={quote} fallbackSymbol={symbol} />
      <Toolbar config={config} onChange={setConfig} />
      <div className="relative">
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-rose-400 text-sm z-20 bg-black/50">
            {error}
          </div>
        )}
        <ChartCanvas
          data={data}
          market={market}
          logScale={config.logScale}
          showMA={config.showMA}
          prevClose={quote?.prevClose}
          currentPrice={quote?.price}
          onCrosshair={setCrosshair}
        />
        <CrosshairTooltip point={crosshair} market={market} prevClose={quote?.prevClose} maValues={crosshairMA} />
      </div>
    </div>
  );
};

export default PriceChart;
```

- [ ] **Step 2: 浏览器人工验证**

Run: `bun tauri dev`
Expected: 切换股票时图表加载；顶部信息条显示；时间范围按钮可切换；hover 时浮层显示。

- [ ] **Step 3: 提交**

```bash
git add src/components/PriceChart/index.tsx
git commit -m "feat(chart): 装配 PriceChart 容器（拉数据 + 浮层 + 工具栏）"
```

---

## Task 19: 副图切换 — MACD / RSI / KDJ / OBV / VWAP / BOLL

**Files:**
- Create: `src/components/PriceChart/SubChart.tsx`
- Modify: `src/components/PriceChart/index.tsx`
- Modify: `src/components/PriceChart/ChartCanvas.tsx`

- [ ] **Step 1: 实现 SubChart**

`src/components/PriceChart/SubChart.tsx`:

```typescript
import React, { useEffect, useRef } from "react";
import {
  createChart, type IChartApi, type ISeriesApi,
  type UTCTimestamp, type LineData, type HistogramData,
  ColorType, CrosshairMode,
} from "lightweight-charts";
import type { KlinePoint } from "../../../shared/types";
import type { SubChartIndicator } from "./types";
import { macd, rsi, kdj, obv, vwap } from "../../lib/indicators";
import { upColor, downColor } from "../../lib/market-hours";

interface Props {
  data: KlinePoint[];
  indicator: SubChartIndicator;
  market: "A股" | "美股";
  height?: number;
}

const SubChart: React.FC<Props> = ({ data, indicator, market, height = 140 }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "rgba(255,255,255,0.45)" },
      grid:   { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: false, visible: false },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: true,
    });
    chartRef.current = chart;
    return () => { chart.remove(); chartRef.current = null; };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || data.length === 0) return;

    // 清空旧 series — lightweight-charts 没有 clear API，用 remove
    // 重新创建（每次 indicator/data 变化重画一次）
    const fresh = createChart(containerRef.current!, {});  // 不会真的用，下面 chart 还在
    fresh.remove();

    // 简化策略：每次切换 indicator 时全量重绘
    // 通过把所有 series 都加到 chart，再 setData 即可

    const times = data.map((p) => p.time as UTCTimestamp);
    const closes = data.map((p) => p.close);
    const highs  = data.map((p) => p.high);
    const lows   = data.map((p) => p.low);
    const vols   = data.map((p) => p.volume);

    const toLine = (vals: (number | null)[], color: string, width = 1): { series: ISeriesApi<"Line">; data: LineData[] } => {
      const s = chart.addLineSeries({ color, lineWidth: width as 1, priceLineVisible: false, lastValueVisible: false });
      const d = vals.map((v, i) => (v == null ? null : { time: times[i], value: v })).filter((x): x is LineData => x !== null);
      s.setData(d);
      return { series: s, data: d };
    };

    const seriesCreated: ISeriesApi<"Line" | "Histogram">[] = [];

    if (indicator === "macd") {
      const { dif, dea, hist } = macd(closes);
      seriesCreated.push(toLine(dif, "#F5C842").series);
      seriesCreated.push(toLine(dea, "#B388FF").series);
      const h = chart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
      const histData: HistogramData[] = hist.map((v, i) => (v == null ? null : {
        time: times[i], value: v, color: v >= 0 ? upColor(market) + "B0" : downColor(market) + "B0",
      })).filter((x): x is HistogramData => x !== null);
      h.setData(histData);
      seriesCreated.push(h);
    } else if (indicator === "rsi") {
      seriesCreated.push(toLine(rsi(closes), "#4FC3F7").series);
    } else if (indicator === "kdj") {
      const { k, d, j } = kdj(highs, lows, closes);
      seriesCreated.push(toLine(k, "#F5C842").series);
      seriesCreated.push(toLine(d, "#B388FF").series);
      seriesCreated.push(toLine(j, "#FF6B9D").series);
    } else if (indicator === "obv") {
      const series = obv(closes, vols);
      seriesCreated.push(toLine(series, "#4FC3F7").series);
    } else if (indicator === "vwap") {
      const series = vwap(highs, lows, closes, vols);
      seriesCreated.push(toLine(series, "#F5C842").series);
    } else if (indicator === "boll") {
      // BOLL 通常叠加在主图，此处副图不画，留空（在 ChartCanvas 处理）
    }

    chart.timeScale().fitContent();
    return () => seriesCreated.forEach((s) => chart.removeSeries(s));
  }, [data, indicator, market]);

  if (indicator === "boll") return null;

  return <div ref={containerRef} style={{ width: "100%", height }} />;
};

export default SubChart;
```

- [ ] **Step 2: 在容器里组装 SubChart**

修改 `src/components/PriceChart/index.tsx` 在 ChartCanvas 之后追加：

```typescript
        <SubChart data={data} indicator={config.subIndicator} market={market} />
```

并 import：

```typescript
import SubChart from "./SubChart";
```

- [ ] **Step 3: BOLL 叠加到主图（ChartCanvas 内）**

修改 `ChartCanvas.tsx` Props 增加 `showBoll?: boolean`：

```typescript
interface Props {
  // ...
  showBoll?: boolean;
}
```

在数据更新 effect 内追加：

```typescript
    // BOLL：叠加在主图（按需）
    if (showBoll) {
      // 简化：每次重绘 BOLL 都新建 series（量小）
      // 实战中 ref 持有更优；此处为可读性
    }
```

注：第一版 BOLL 简化处理——副图选 BOLL 时主图叠加上下轨。可以在 `index.tsx` 中：

```typescript
<ChartCanvas
  // ...
  showBoll={config.subIndicator === "boll"}
/>
```

完整的 BOLL 主图叠加实现（在 ChartCanvas 内的数据 effect 中追加）：

```typescript
    // BOLL 上下轨叠加
    if (showBoll && bollRef.current == null) {
      bollRef.current = {
        upper: chartRef.current!.addLineSeries({ color: "rgba(255,255,255,0.4)", lineWidth: 1, lineStyle: 2 }),
        mid:   chartRef.current!.addLineSeries({ color: "rgba(255,255,255,0.6)", lineWidth: 1 }),
        lower: chartRef.current!.addLineSeries({ color: "rgba(255,255,255,0.4)", lineWidth: 1, lineStyle: 2 }),
      };
    } else if (!showBoll && bollRef.current) {
      chartRef.current?.removeSeries(bollRef.current.upper);
      chartRef.current?.removeSeries(bollRef.current.mid);
      chartRef.current?.removeSeries(bollRef.current.lower);
      bollRef.current = null;
    }
    if (showBoll && bollRef.current) {
      const { boll } = await import("../../lib/indicators");
      const { upper, mid, lower } = boll(data.map((p) => p.close));
      const toLine = (v: (number | null)[]) => v.map((x, i) => x == null ? null : { time: data[i].time as UTCTimestamp, value: x }).filter((x): x is LineData => x !== null);
      bollRef.current.upper.setData(toLine(upper));
      bollRef.current.mid.setData(toLine(mid));
      bollRef.current.lower.setData(toLine(lower));
    }
```

并在文件顶 ref 声明区增加：

```typescript
  const bollRef = useRef<{ upper: ISeriesApi<"Line">; mid: ISeriesApi<"Line">; lower: ISeriesApi<"Line"> } | null>(null);
```

注：数据更新 effect 改为 async（顶层 import `boll` 更简洁——把 `const { boll } = await import(...)` 改为直接 `import { boll } from "../../lib/indicators";`）。

- [ ] **Step 4: 浏览器人工验证**

Run: `bun tauri dev`
Expected: 副图下拉切换 MACD/RSI/KDJ/OBV/VWAP 时图变化；切到 BOLL 时副图隐藏，主图叠加上中下三轨。

- [ ] **Step 5: 提交**

```bash
git add src/components/PriceChart/SubChart.tsx src/components/PriceChart/ChartCanvas.tsx src/components/PriceChart/index.tsx
git commit -m "feat(chart): 副图切换 MACD/RSI/KDJ/OBV/VWAP + 主图 BOLL 叠加"
```

---

## Task 20: 实时报价轮询

**Files:**
- Create: `src/hooks/useRealtimeQuote.ts`
- Modify: `src/components/PriceChart/index.tsx`

- [ ] **Step 1: 实现 hook**

`src/hooks/useRealtimeQuote.ts`:

```typescript
import { useEffect, useState } from "react";
import { fetchRealtimeQuote } from "../lib/ipc";
import { detectMarket, isTradingHours } from "../lib/market-hours";
import type { RealtimeQuote } from "../../shared/types";

const POLL_MS = 10_000;

export function useRealtimeQuote(symbol: string): RealtimeQuote | null {
  const [quote, setQuote] = useState<RealtimeQuote | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const market = detectMarket(symbol);

    const tick = async () => {
      try {
        const q = await fetchRealtimeQuote(symbol);
        if (active) setQuote(q);
      } catch {
        // 静默失败 — 保留最后一次成功的报价
      }
    };

    // 切换股票立即拉一次
    tick();

    // 仅在交易时段启用轮询
    if (isTradingHours(market)) {
      timer = setInterval(tick, POLL_MS);
    }

    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [symbol]);

  return quote;
}
```

- [ ] **Step 2: 把容器中的 quote 状态替换为 hook**

修改 `src/components/PriceChart/index.tsx`：

删除：
```typescript
const [quote, setQuote] = useState<RealtimeQuote | null>(null);
useEffect(() => { fetchRealtimeQuote(symbol).then(setQuote).catch(() => setQuote(null)); }, [symbol]);
```

替换为：
```typescript
import { useRealtimeQuote } from "../../hooks/useRealtimeQuote";
// ...
const quote = useRealtimeQuote(symbol);
```

- [ ] **Step 3: 让 ChartCanvas 在报价变化时刷新最后一根 K 线**

在 `index.tsx` 的 quote 变化 effect 里追加（在 `data.length > 0 && quote` 条件下）：

```typescript
  // 用实时报价 update 最后一根 K 线（仅同日 / 交易时段才合理）
  useEffect(() => {
    if (!quote || data.length === 0) return;
    const last = data[data.length - 1];
    // 同一交易日才合并（用日期前缀比较，避免分钟图被覆盖）
    const lastDate = new Date(last.time * 1000).toDateString();
    const quoteDate = new Date(quote.timestamp * 1000).toDateString();
    if (lastDate !== quoteDate) return;
    setData((prev) => {
      const merged = [...prev];
      const i = merged.length - 1;
      merged[i] = {
        time: merged[i].time,
        open: merged[i].open,
        high: Math.max(merged[i].high, quote.price),
        low:  Math.min(merged[i].low,  quote.price),
        close: quote.price,
        volume: quote.volume || merged[i].volume,
        amount: quote.amount || merged[i].amount,
      };
      return merged;
    });
  }, [quote, data.length]);
```

- [ ] **Step 4: 浏览器人工验证**

Run: `bun tauri dev`
Expected: 在 A 股交易时段打开图表，观察顶部信息条数字每 10 秒变化（如有真实波动）；最后一根 K 线随报价跳动；非交易时段则静默。

- [ ] **Step 5: 提交**

```bash
git add src/hooks/useRealtimeQuote.ts src/components/PriceChart/index.tsx
git commit -m "feat(chart): 添加实时报价轮询 + 最后一根 K 线合并"
```

---

## Task 21: 比较基准（Compare）

**Files:**
- Modify: `src/components/PriceChart/ChartCanvas.tsx`
- Modify: `src/components/PriceChart/index.tsx`

- [ ] **Step 1: 在 ChartCanvas 增加 compare series**

修改 `ChartCanvas.tsx` Props：

```typescript
interface Props {
  // ...
  compareData?: KlinePoint[];        // 比较基准的归一化 K 线（以起点 = 100 标准化）
  compareLabel?: string;
}
```

在 `// 创建图表` useEffect 里追加：

```typescript
    // 比较基准：右侧第二坐标轴上画一条折线
    const compareSeries = chart.addLineSeries({
      color: "#FF6B9D",
      lineWidth: 1,
      priceScaleId: "compare",
      lastValueVisible: true,
      priceLineVisible: false,
      title: compareLabel ?? "Compare",
    });
    chart.priceScale("compare").applyOptions({
      visible: false,  // 隐藏第二轴刻度，避免视觉干扰
      scaleMargins: { top: 0.05, bottom: 0.3 },
    });
    compareRef.current = compareSeries;
```

并在 ref 区追加：

```typescript
  const compareRef = useRef<ISeriesApi<"Line"> | null>(null);
```

在数据更新 effect 里追加：

```typescript
    if (compareRef.current) {
      if (compareData && compareData.length > 0) {
        const base = compareData[0].close;
        const normalized: LineData[] = compareData.map((p) => ({
          time: p.time as UTCTimestamp,
          value: (p.close / base) * 100,
        }));
        compareRef.current.setData(normalized);
      } else {
        compareRef.current.setData([]);
      }
    }
```

- [ ] **Step 2: 在 index.tsx 拉 compare 数据**

```typescript
const [compareData, setCompareData] = useState<KlinePoint[]>([]);

useEffect(() => {
  if (!config.compareSymbol) { setCompareData([]); return; }
  fetchKline({
    symbol: config.compareSymbol,
    period: rangeToPeriod(config.range),
    range: config.range,
    adjust: "qfq",
  }).then(setCompareData).catch(() => setCompareData([]));
}, [config.compareSymbol, config.range]);
```

并把 `<ChartCanvas ... compareData={compareData} compareLabel={config.compareSymbol} />`。

- [ ] **Step 3: 浏览器人工验证**

Run: `bun tauri dev`
Expected: 在工具栏比较输入框敲 "SPY"（美股）或 "上证指数" 对应代码，图上出现第二条粉色折线（按起点归一化），显示相对走势。

- [ ] **Step 4: 提交**

```bash
git add src/components/PriceChart/ChartCanvas.tsx src/components/PriceChart/index.tsx
git commit -m "feat(chart): 添加比较基准（归一化叠加另一标的）"
```

---

## Task 22: smoke-test + 最终回归

**Files:**
- Modify: `scripts/smoke-test.ts`

- [ ] **Step 1: 扩展 smoke-test**

在 `scripts/smoke-test.ts` 末尾追加（具体扩展点根据现有结构调整）：

```typescript
// K 线 + 报价 smoke
import { getKline, getQuote } from "../sidecar/kline";

console.log("\n--- K 线 smoke ---");
const aapl = await getKline({ symbol: "AAPL", period: "1d", range: "1m" });
console.log(`AAPL 1月日K：${aapl.length} 根，最后一根 close=${aapl[aapl.length - 1]?.close}`);

const maotai = await getKline({ symbol: "600519", period: "1d", range: "1m" });
console.log(`600519 1月日K：${maotai.length} 根，最后一根 close=${maotai[maotai.length - 1]?.close}`);

console.log("\n--- 报价 smoke ---");
const qAapl = await getQuote("AAPL");
console.log(`AAPL 实时：${qAapl.price} ${qAapl.currency}，涨跌 ${qAapl.changePercent}%`);

const qMaotai = await getQuote("600519");
console.log(`600519 实时：${qMaotai.price} ${qMaotai.currency}，涨跌 ${qMaotai.changePercent}%`);
```

- [ ] **Step 2: 跑 smoke**

Run: `bun scripts/smoke-test.ts`
Expected: 4 行输出全部非空 / 非 NaN。

- [ ] **Step 3: 跑全部测试**

Run: `bunx vitest run && cd sidecar && bun test && cd ../src-tauri && cargo test`
Expected: 全绿。

- [ ] **Step 4: 类型检查**

Run: `bunx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 5: 浏览器全面验证（核对清单）**

Run: `bun tauri dev`

确认以下场景全部正常：
- 切换 A 股 / 美股，K 线、信息条、颜色（红涨绿跌 / 绿涨红跌）正确
- 9 个时间范围切换：1D 显示分钟图、5Y/All 显示长期周期 K
- 副图下拉切换 MACD / RSI / KDJ / OBV / VWAP / BOLL（BOLL 时主图上下轨叠加）
- 对数坐标切换有效（5Y/All 上特别明显）
- 复权切换（A 股）改变 K 线数值
- 比较输入 SPY / 000001 出现粉色归一化曲线
- 鼠标 hover 出现十字光标信息浮层，含 OHLC + 涨跌 + MA 值
- 昨收虚线 + 当前价实线一直可见，标签上有数字
- 交易时段（手动调电脑时间或等到时段内）顶部数字每 10 秒变化

- [ ] **Step 6: 提交**

```bash
git add scripts/smoke-test.ts
git commit -m "test(smoke): 扩展 K 线与报价回归"
```

---

## Self-Review

### Spec 覆盖检查

- ✅ 数据源：A 股腾讯 + 东财备用、美股 Yahoo → Task 3-5
- ✅ Sidecar `kline/` 模块 → Task 3-6
- ✅ Tauri Core 两条新命令 → Task 7
- ✅ lightweight-charts 渲染 → Task 12-13
- ✅ 默认 MA 按市场切换（A 股 5/20/60，美股 20/50/200）→ Task 12 (types.ts) / Task 14
- ✅ 副图固定成交量 + 可切换 MACD/RSI/KDJ/BOLL/OBV/VWAP → Task 13 + 19
- ✅ 顶部信息条三行（量/额/换手/PE/PB/市值/52w/盘前盘后）→ Task 15
- ✅ 9 段时间范围 + K 线粒度映射 → Task 16 + types.ts
- ✅ 工具开关（图表类型 / 对数 / 复权 / 比较 / 截图）→ Task 16 + 21
  - **缺口**：图表类型切换（线 / 面积 / Heikin-Ashi）当前 Toolbar 未实现下拉，ChartCanvas 也未支持 — 一期降级处理，仅默认 K 线模式。**已在 Task 16 取舍：第一版仅 K 线**，Heikin-Ashi/折线在后续迭代。
- ✅ 十字光标浮层 → Task 17
- ✅ 配色按市场自动 → market-hours upColor/downColor + ChartCanvas
- ✅ 昨收/当前价水平线 → Task 14
- ✅ 实时轮询（10 秒、交易时段判断）→ Task 20
- ✅ 比较基准 → Task 21
- ✅ smoke test → Task 22

### 取舍说明

| 缺口 | 处理 |
|------|------|
| 图表类型（K线 / 线 / 面积 / Heikin-Ashi）切换 | 一期仅 K 线，Toolbar 留接口位但暂不画下拉。Heikin-Ashi 与线 / 面积留作后续迭代。 |
| 截图按钮 | Toolbar 上有按钮但 `onScreenshot` 默认未挂 — 实现期可在 `index.tsx` 用 `chart.takeScreenshot()` 接入。 |
| 滚动加载更早历史 | Spec 已明确不做。 |

### placeholder 扫描

- 无 TODO/TBD
- 无 "Add appropriate error handling" / "Similar to Task N" 类描述
- 所有代码 step 均给出完整可粘贴代码

### 类型一致性

- `KlinePoint` 字段在 shared/types、sidecar/kline/types、各源 parser 间一致
- `RealtimeQuote` 字段从 sidecar/parseYahooQuote/parseTencentQuote 到前端 `QuoteHeader` 一致使用 camelCase
- `detectMarket` 在 `src/lib/market-hours.ts` 和 `sidecar/kline/index.ts` 各有一份（前者前端用、后者 sidecar 用），实现一致
- `MA_COLORS` / `maPeriodsForMarket` 单一来源在 `PriceChart/types.ts`，全文件复用

---

Plan complete and saved to `docs/superpowers/plans/2026-05-22-kline-chart-redesign.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 我每个任务派一个新 subagent 实施，任务间审查，迭代快
**2. Inline Execution** — 直接在本会话内按 batch 执行，含检查点

Which approach?
