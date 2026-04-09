# Stock Search Standardization

**Date:** 2026-04-09  
**Status:** Approved

## Problem

Current scraper navigates to `Google Finance quote/{ticker}` pages. For small/mid-cap A-shares (e.g. 锴威特688693, 科创板) these pages return no news. The app produces "未搜寻到股票" error and shows no structured stock information.

## Solution

Two independent improvements:

1. **News scraping**: Add `GoogleNewsSearchStrategy` that searches Google News for the stock by keyword instead of navigating to a Finance quote page. Works for any stock with a public name/code.
2. **Stock info card**: Fetch structured stock data (name, code, exchange, price, change%) from Sina Finance API (A-shares) or Yahoo Finance (US stocks) and display as a card above analysis results.

---

## Data Model

### New types in `shared/types.ts`

```ts
export interface StockInfo {
  name: string;          // 股票全称
  code: string;          // 标准化代码 (688693)
  exchange: string;      // 交易所名称 (科创板 / 上交所 / 深交所 / NASDAQ / NYSE)
  market: string;        // 市场 (A股 / 美股)
  price?: number;        // 最新价
  change?: number;       // 涨跌额
  changePercent?: number; // 涨跌幅 %
  currency: string;      // 货币 (CNY / USD)
}
```

`FullAnalysisResponse` gains an optional `stockInfo` field:
```ts
export interface FullAnalysisResponse {
  symbol: string;
  stockInfo?: StockInfo;  // Added
  news: StockNews[];
  analysis: AIAnalysisResult;
}
```

---

## Input Parsing Enhancement

`sidecar/strategies/exchange.ts` gains `parseSymbol()`:

```ts
export interface ParsedSymbol {
  rawInput: string;
  displayName?: string;   // "锴威特" extracted from "锴威特688693"
  chinaInfo?: ChinaStockInfo; // { code, googleSuffix, yahooSuffix }
}
export function parseSymbol(input: string): ParsedSymbol
```

Logic: if input contains 6-digit code, extract it via existing `detectChinaStock`. Leading/trailing non-digit text becomes `displayName`.

---

## Sidecar Layer

### `sidecar/stock-info.ts` (new)

```ts
export async function fetchStockInfo(parsed: ParsedSymbol): Promise<StockInfo | null>
```

**A-shares**: HTTP fetch `https://hq.sinajs.cn/list={prefix}{code}` where prefix is `sh`/`sz`/`bj`. Parse the CSV response string:
- Field 0: name
- Field 3: current price
- Field 2: prev close → derive change/changePercent
- Code prefix → exchange name mapping

**US stocks**: Skip for now (return null); Yahoo Finance header scraping is fragile and unnecessary for the core feature.

### `sidecar/strategies/google-news.ts` (new)

```ts
export class GoogleNewsSearchStrategy implements ScrapeStrategy
```

Builds search query:
- A-share: `"{displayName ?? code}" 股票 新闻` → `https://www.google.com/search?q={query}&tbm=nws&hl=zh-CN`
- US: `"{symbol} stock news"` → same endpoint with `hl=en`

Parses news links from the search result page using `extractLinksFromHtml` with selector `a[href]` filtered to external URLs (not `google.com`).

**Strategy order in `scraper.ts`**: `[GoogleNewsSearchStrategy, GoogleStrategy, YahooStrategy]`
- `GoogleNewsSearchStrategy` runs first; on success, skips the rest.

### `sidecar/analysis.ts` (updated)

`performFullAnalysis` runs `fetchStockInfo` and `scrapeStockNews` in parallel via `Promise.allSettled`. Includes `stockInfo` in result regardless of whether news scraping succeeded.

---

## Frontend Layer

### `src/components/StockInfoCard.tsx` (new)

Displayed above `AnalysisPanel` news list when `result.stockInfo` is present.

Layout:
```
┌─────────────────────────────────────┐
│  [Tag: 科创板]  锴威特              │
│  688693  ·  A股                     │
│  ¥ 20.44   ▲ 0.12  (+0.59%)        │
└─────────────────────────────────────┘
```

Color: green for positive change, red for negative, gray for zero.

### Integration point

`src/components/AnalysisPanel.tsx`: render `<StockInfoCard info={result.stockInfo} />` at the top when `result?.stockInfo` is defined.

---

## Files Changed / Created

| File | Action |
|------|--------|
| `shared/types.ts` | Add `StockInfo`, update `FullAnalysisResponse` |
| `sidecar/strategies/exchange.ts` | Add `ParsedSymbol`, `parseSymbol()` |
| `sidecar/stock-info.ts` | New: Sina Finance API fetch |
| `sidecar/strategies/google-news.ts` | New: Google News search strategy |
| `sidecar/scraper.ts` | Add GoogleNewsSearchStrategy as first strategy |
| `sidecar/analysis.ts` | Parallel stockInfo + news fetch |
| `src/lib/api-types.ts` | Re-export `StockInfo` |
| `src/components/StockInfoCard.tsx` | New: stock info card component |
| `src/components/AnalysisPanel.tsx` | Render StockInfoCard when stockInfo present |

---

## Error Handling

- `fetchStockInfo` failure → silently returns `null`; analysis proceeds without stockInfo
- `GoogleNewsSearchStrategy` failure → falls through to existing strategies
- All failures are caught per-strategy; at least one strategy must succeed for analysis to continue
