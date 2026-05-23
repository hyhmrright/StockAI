# Quantitative Analysis Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add quantitative analysis (technical indicators + fundamental metrics) to StockAI so the LLM receives structured quantitative context alongside news for more professional stock analysis.

**Architecture:** New `sidecar/quant/` module computes technical indicators from existing K-line data and fetches fundamental metrics from 东方财富 (A-shares) / Yahoo Finance (US stocks). A new `--quant` CLI action returns a `QuantBundle` with scored signals. The enhanced prompt injects quantitative summaries into the LLM context. Frontend fetches quant data in parallel with news and displays signal cards.

**Tech Stack:** TypeScript/Bun (sidecar), Rust (Tauri commands), React (frontend), existing K-line/quote data sources

**Design spec:** `docs/superpowers/specs/2026-05-24-quant-analysis-phase1-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `shared/types.ts` (modify) | Add `AnalystSignal`, `QuantBundle`, extend `AIAnalysisResult` |
| `sidecar/quant/types.ts` | Internal computation types for technical/fundamental sub-signals |
| `sidecar/quant/technical.ts` | Pure functions: 5 technical strategies on `KlinePoint[]` |
| `sidecar/quant/fundamental.ts` | Fetch + score financial metrics (东方财富 / Yahoo Finance) |
| `sidecar/quant/scoring.ts` | Weighted combination → composite signal |
| `sidecar/quant/index.ts` | Orchestrator: `fetchQuantBundle()` |
| `src/hooks/useQuantData.ts` | React hook parallel to `useStockData` |
| `src/components/QuantScoreCard.tsx` | Three-card signal display with expandable details |
| `src/lib/dev-mocks.ts` (modify) | Add `MOCK_QUANT` |

### Modified Files
| File | Change |
|------|--------|
| `sidecar/prompts.ts` | Add `buildEnhancedPrompt()` |
| `sidecar/cli-handlers.ts` | Add `handleQuant()`, enhance `handleAnalyzeOnly()` |
| `sidecar/index.ts` | Add `--quant` routing |
| `sidecar/ai.ts` | Extend `AIProvider.analyze()` signature |
| `sidecar/providers/openai.ts` | Pass quant to enhanced prompt |
| `sidecar/providers/anthropic.ts` | Pass quant to enhanced prompt |
| `sidecar/providers/ollama.ts` | Pass quant to enhanced prompt |
| `src-tauri/src/lib.rs` | Add `fetch_quant_bundle` command |
| `src/lib/ipc.ts` | Add `fetchQuantBundle()` IPC |
| `src/components/Dashboard.tsx` | Wire `useQuantData`, pass to `AnalysisPanel` |
| `src/components/AnalysisPanel.tsx` | Accept `quant` prop, render `QuantScoreCard` |
| `src/hooks/useAIAnalysis.ts` | Accept optional `QuantBundle` in `analyze()` |
| `scripts/sidecar-bridge.ts` | Add `fetch_quant_bundle` bridge route |

### Test Files
| File | Coverage |
|------|----------|
| `sidecar/quant/technical.test.ts` | All 5 strategies + edge cases |
| `sidecar/quant/fundamental.test.ts` | Mock HTTP, parsing, scoring |
| `sidecar/quant/scoring.test.ts` | Weighted combination |
| `sidecar/prompts.test.ts` (extend) | `buildEnhancedPrompt` |
| `src/hooks/useQuantData.test.ts` | State machine |

---

## Task 1: Shared Types — AnalystSignal & QuantBundle

**Files:**
- Modify: `shared/types.ts`
- Modify: `shared/test-utils.ts`

- [ ] **Step 1: Add AnalystSignal and QuantBundle types to shared/types.ts**

Add at the end of the file, before the closing (there is no closing — just append):

```typescript
/** 单维度分析信号 */
export interface AnalystSignal {
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  details: Record<string, number | string>;
}

/** 量化分析数据包（技术面 + 基本面，不含情绪——情绪由 LLM 综合研判） */
export interface QuantBundle {
  symbol: string;
  technical: AnalystSignal;
  fundamental: AnalystSignal;
  composite: {
    signal: 'bullish' | 'bearish' | 'neutral';
    score: number;
  };
  fetchedAt: number;
}
```

- [ ] **Step 2: Extend AIAnalysisResult with quantitative view fields**

In `shared/types.ts`, add two optional fields to the existing `AIAnalysisResult` interface, after `description?: string;`:

```typescript
  technicalView?: string;
  fundamentalView?: string;
```

- [ ] **Step 3: Add createMockQuantBundle to test-utils.ts**

Append to `shared/test-utils.ts`:

```typescript
import type { AnalystSignal, QuantBundle } from './types';

export function createMockSignal(overrides: Partial<AnalystSignal> = {}): AnalystSignal {
  return {
    signal: 'bullish',
    confidence: 70,
    details: { rsi: 45, macd: 'golden_cross' },
    ...overrides,
  };
}

export function createMockQuantBundle(overrides: Partial<QuantBundle> = {}): QuantBundle {
  return {
    symbol: 'AAPL',
    technical: createMockSignal(),
    fundamental: createMockSignal({ signal: 'neutral', confidence: 55, details: { pe: 22, roe: 18 } }),
    composite: { signal: 'bullish', score: 65 },
    fetchedAt: Date.now(),
    ...overrides,
  };
}
```

Note: The existing imports at the top of `test-utils.ts` need to be updated to include `AnalystSignal` and `QuantBundle`:

```typescript
import type { FullAnalysisResponse, StockInfo, StockNews, AIAnalysisResult, AnalystSignal, QuantBundle } from './types';
```

- [ ] **Step 4: Verify types compile**

Run: `cd /Users/hyh/code/StockAI && bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts shared/test-utils.ts
git commit -m "feat(types): add AnalystSignal, QuantBundle, extend AIAnalysisResult"
```

---

## Task 2: Technical Analysis — Quant Types & Pure Indicator Functions

**Files:**
- Create: `sidecar/quant/types.ts`
- Create: `sidecar/quant/technical.ts`
- Create: `sidecar/quant/technical.test.ts`

- [ ] **Step 1: Create sidecar/quant/types.ts**

```typescript
import type { AnalystSignal } from '../../shared/types';

export type Signal = 'bullish' | 'bearish' | 'neutral';

/** 单个子策略的计算结果 */
export interface SubSignal {
  name: string;
  signal: Signal;
  score: number;  // -100 (极度看跌) ~ +100 (极度看涨)
  weight: number;
  details: Record<string, number | string>;
}

/** 技术分析完整结果 */
export interface TechnicalResult {
  subSignals: SubSignal[];
  composite: AnalystSignal;
}

/** 基本面分析完整结果 */
export interface FundamentalResult {
  dimensions: SubSignal[];
  composite: AnalystSignal;
}

/** 从东方财富 / Yahoo Finance 抓取的原始财务指标 */
export interface FinancialMetrics {
  roe?: number;
  grossMargin?: number;
  netMargin?: number;
  debtToAsset?: number;
  currentRatio?: number;
  revenueGrowth?: number;
  netIncomeGrowth?: number;
  pe?: number;
  pb?: number;
  marketCap?: number;
}
```

- [ ] **Step 2: Write failing tests for technical indicator helpers**

Create `sidecar/quant/technical.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import {
  computeEMA,
  computeRSI,
  computeMACD,
  computeBollingerBands,
  computeADX,
  computeATR,
  analyzeTechnical,
} from './technical';
import type { KlinePoint } from '../../shared/types';

function makeKline(closes: number[], baseVolume = 1_000_000): KlinePoint[] {
  return closes.map((close, i) => ({
    time: 1700000000 + i * 86400,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume: baseVolume + (i % 3) * 100_000,
  }));
}

describe('computeEMA', () => {
  test('计算 EMA 返回正确长度', () => {
    const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const ema = computeEMA(closes, 5);
    expect(ema.length).toBe(closes.length);
  });

  test('period=1 时 EMA 等于原始值', () => {
    const closes = [10, 20, 30];
    const ema = computeEMA(closes, 1);
    expect(ema).toEqual(closes);
  });

  test('EMA 对最新数据权重更高', () => {
    const closes = [10, 10, 10, 10, 10, 20, 20, 20, 20, 20];
    const ema = computeEMA(closes, 5);
    // 最后一个 EMA 应接近 20 但不完全等于 20（有历史拖尾）
    expect(ema[ema.length - 1]).toBeGreaterThan(18);
    expect(ema[ema.length - 1]).toBeLessThan(20);
  });
});

describe('computeRSI', () => {
  test('单调上涨序列 RSI 接近 100', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const rsi = computeRSI(closes, 14);
    expect(rsi[rsi.length - 1]).toBeGreaterThan(90);
  });

  test('单调下跌序列 RSI 接近 0', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 - i);
    const rsi = computeRSI(closes, 14);
    expect(rsi[rsi.length - 1]).toBeLessThan(10);
  });

  test('横盘序列 RSI 接近 50', () => {
    // 交替涨跌，幅度相同
    const closes = Array.from({ length: 30 }, (_, i) => 100 + (i % 2 === 0 ? 1 : -1));
    const rsi = computeRSI(closes, 14);
    expect(rsi[rsi.length - 1]).toBeGreaterThan(40);
    expect(rsi[rsi.length - 1]).toBeLessThan(60);
  });
});

describe('computeMACD', () => {
  test('上升趋势 MACD 柱状线为正', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5);
    const macd = computeMACD(closes);
    expect(macd.histogram[macd.histogram.length - 1]).toBeGreaterThan(0);
  });

  test('返回 macdLine, signalLine, histogram 三组数据', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const macd = computeMACD(closes);
    expect(macd.macdLine.length).toBe(closes.length);
    expect(macd.signalLine.length).toBe(closes.length);
    expect(macd.histogram.length).toBe(closes.length);
  });
});

describe('computeBollingerBands', () => {
  test('中轨等于 SMA', () => {
    const closes = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30];
    const bb = computeBollingerBands(closes, 5, 2);
    // 中轨在有效区间内应为 5 日 SMA
    const last = bb[bb.length - 1];
    expect(last.middle).toBeCloseTo((22 + 24 + 26 + 28 + 30) / 5, 1);
  });

  test('上轨 > 中轨 > 下轨', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5);
    const bb = computeBollingerBands(closes, 20, 2);
    const last = bb[bb.length - 1];
    expect(last.upper).toBeGreaterThan(last.middle);
    expect(last.middle).toBeGreaterThan(last.lower);
  });
});

describe('computeADX', () => {
  test('强趋势序列 ADX > 25', () => {
    // 持续上涨，每根 K 线创新高新低递增
    const kline: KlinePoint[] = Array.from({ length: 50 }, (_, i) => ({
      time: 1700000000 + i * 86400,
      open: 100 + i * 2,
      high: 102 + i * 2,
      low: 99 + i * 2,
      close: 101 + i * 2,
      volume: 1_000_000,
    }));
    const adx = computeADX(kline, 14);
    expect(adx[adx.length - 1]).toBeGreaterThan(25);
  });
});

describe('computeATR', () => {
  test('ATR 始终为非负数', () => {
    const kline = makeKline(Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5));
    const atr = computeATR(kline, 14);
    atr.forEach(v => expect(v).toBeGreaterThanOrEqual(0));
  });
});

describe('analyzeTechnical', () => {
  test('返回 5 个子信号和一个综合信号', () => {
    const kline = makeKline(Array.from({ length: 250 }, (_, i) => 100 + i * 0.1 + Math.sin(i / 10) * 5));
    const result = analyzeTechnical(kline);
    expect(result.subSignals).toHaveLength(5);
    expect(['bullish', 'bearish', 'neutral']).toContain(result.composite.signal);
    expect(result.composite.confidence).toBeGreaterThanOrEqual(0);
    expect(result.composite.confidence).toBeLessThanOrEqual(100);
  });

  test('数据不足时返回 neutral 信号', () => {
    const kline = makeKline([100, 101, 102]);
    const result = analyzeTechnical(kline);
    expect(result.composite.signal).toBe('neutral');
    expect(result.composite.confidence).toBeLessThan(30);
  });

  test('强势上涨序列返回 bullish', () => {
    const closes = Array.from({ length: 250 }, (_, i) => 50 + i * 0.5);
    const kline = makeKline(closes, 2_000_000);
    const result = analyzeTechnical(kline);
    expect(result.composite.signal).toBe('bullish');
  });

  test('强势下跌序列返回 bearish', () => {
    const closes = Array.from({ length: 250 }, (_, i) => 200 - i * 0.5);
    const kline = makeKline(closes, 2_000_000);
    const result = analyzeTechnical(kline);
    expect(result.composite.signal).toBe('bearish');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /Users/hyh/code/StockAI/sidecar && bun test quant/technical.test.ts`
Expected: FAIL — module `./technical` not found

- [ ] **Step 4: Implement technical.ts**

Create `sidecar/quant/technical.ts`:

```typescript
import type { KlinePoint } from '../../shared/types';
import type { SubSignal, TechnicalResult } from './types';

const MIN_DATA_POINTS = 60;

export function computeEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

export function computeRSI(closes: number[], period: number): number[] {
  const result: number[] = new Array(closes.length).fill(50);
  if (closes.length < period + 1) return result;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;

  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

export function computeMACD(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
  const emaFast = computeEMA(closes, fast);
  const emaSlow = computeEMA(closes, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = computeEMA(macdLine, signalPeriod);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macdLine, signalLine, histogram };
}

export function computeBollingerBands(
  closes: number[],
  period = 20,
  stdDevMultiplier = 2,
): { upper: number; middle: number; lower: number }[] {
  return closes.map((_, i) => {
    if (i < period - 1) return { upper: closes[i], middle: closes[i], lower: closes[i] };
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((s, v) => s + v, 0) / period;
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    return {
      upper: mean + stdDevMultiplier * std,
      middle: mean,
      lower: mean - stdDevMultiplier * std,
    };
  });
}

export function computeADX(kline: KlinePoint[], period = 14): number[] {
  const len = kline.length;
  const adx: number[] = new Array(len).fill(0);
  if (len < period * 2) return adx;

  const trueRanges: number[] = [0];
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];

  for (let i = 1; i < len; i++) {
    const high = kline[i].high;
    const low = kline[i].low;
    const prevClose = kline[i - 1].close;
    const prevHigh = kline[i - 1].high;
    const prevLow = kline[i - 1].low;

    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));

    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  const smoothTR = computeEMA(trueRanges, period);
  const smoothPlusDM = computeEMA(plusDM, period);
  const smoothMinusDM = computeEMA(minusDM, period);

  const dx: number[] = smoothTR.map((tr, i) => {
    if (tr === 0) return 0;
    const plusDI = (smoothPlusDM[i] / tr) * 100;
    const minusDI = (smoothMinusDM[i] / tr) * 100;
    const sum = plusDI + minusDI;
    return sum === 0 ? 0 : (Math.abs(plusDI - minusDI) / sum) * 100;
  });

  const smoothedADX = computeEMA(dx, period);
  for (let i = 0; i < len; i++) adx[i] = smoothedADX[i];
  return adx;
}

export function computeATR(kline: KlinePoint[], period = 14): number[] {
  const trueRanges: number[] = [kline[0].high - kline[0].low];
  for (let i = 1; i < kline.length; i++) {
    const h = kline[i].high;
    const l = kline[i].low;
    const pc = kline[i - 1].close;
    trueRanges.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return computeEMA(trueRanges, period);
}

function trendFollowing(closes: number[], kline: KlinePoint[]): SubSignal {
  const ema8 = computeEMA(closes, 8);
  const ema21 = computeEMA(closes, 21);
  const ema55 = computeEMA(closes, 55);
  const adx = computeADX(kline, 14);
  const last = closes.length - 1;

  const bullishAlign = ema8[last] > ema21[last] && ema21[last] > ema55[last];
  const bearishAlign = ema8[last] < ema21[last] && ema21[last] < ema55[last];
  const adxStrong = adx[last] > 25;

  let score = 0;
  if (bullishAlign) score += 50;
  else if (bearishAlign) score -= 50;
  if (adxStrong) score = score > 0 ? score + 30 : score - 30;

  return {
    name: 'trend_following',
    signal: score > 20 ? 'bullish' : score < -20 ? 'bearish' : 'neutral',
    score: Math.max(-100, Math.min(100, score)),
    weight: 0.25,
    details: {
      ema8: Number(ema8[last].toFixed(2)),
      ema21: Number(ema21[last].toFixed(2)),
      ema55: Number(ema55[last].toFixed(2)),
      adx: Number(adx[last].toFixed(1)),
      alignment: bullishAlign ? 'bullish' : bearishAlign ? 'bearish' : 'mixed',
    },
  };
}

function meanReversion(closes: number[]): SubSignal {
  const rsi = computeRSI(closes, 14);
  const bb = computeBollingerBands(closes, 20, 2);
  const last = closes.length - 1;
  const rsiVal = rsi[last];
  const bbLast = bb[last];
  const price = closes[last];

  let score = 0;
  if (rsiVal < 30) score += 40;
  else if (rsiVal > 70) score -= 40;

  if (price <= bbLast.lower) score += 40;
  else if (price >= bbLast.upper) score -= 40;

  return {
    name: 'mean_reversion',
    signal: score > 20 ? 'bullish' : score < -20 ? 'bearish' : 'neutral',
    score: Math.max(-100, Math.min(100, score)),
    weight: 0.20,
    details: {
      rsi: Number(rsiVal.toFixed(1)),
      bb_position: price <= bbLast.lower ? 'below_lower' : price >= bbLast.upper ? 'above_upper' : 'within',
      bb_upper: Number(bbLast.upper.toFixed(2)),
      bb_middle: Number(bbLast.middle.toFixed(2)),
      bb_lower: Number(bbLast.lower.toFixed(2)),
    },
  };
}

function momentum(closes: number[]): SubSignal {
  const macd = computeMACD(closes);
  const last = closes.length - 1;
  const hist = macd.histogram[last];
  const prevHist = last > 0 ? macd.histogram[last - 1] : 0;

  // 1 月 / 3 月价格动量
  const mom1m = last >= 21 ? (closes[last] / closes[last - 21] - 1) * 100 : 0;
  const mom3m = last >= 63 ? (closes[last] / closes[last - 63] - 1) * 100 : 0;

  let score = 0;
  // MACD 柱状线方向
  if (hist > 0 && hist > prevHist) score += 30;
  else if (hist < 0 && hist < prevHist) score -= 30;

  // 价格动量
  if (mom1m > 5) score += 25;
  else if (mom1m < -5) score -= 25;
  if (mom3m > 10) score += 25;
  else if (mom3m < -10) score -= 25;

  return {
    name: 'momentum',
    signal: score > 20 ? 'bullish' : score < -20 ? 'bearish' : 'neutral',
    score: Math.max(-100, Math.min(100, score)),
    weight: 0.25,
    details: {
      macd_histogram: Number(hist.toFixed(3)),
      macd_trend: hist > prevHist ? 'expanding' : 'contracting',
      momentum_1m: Number(mom1m.toFixed(2)),
      momentum_3m: Number(mom3m.toFixed(2)),
    },
  };
}

function volatility(kline: KlinePoint[]): SubSignal {
  const closes = kline.map(k => k.close);
  const atr = computeATR(kline, 14);
  const last = closes.length - 1;
  const atrVal = atr[last];
  const atrPct = (atrVal / closes[last]) * 100;

  // 历史波动率（20 日年化）
  const returns: number[] = [];
  for (let i = Math.max(1, last - 19); i <= last; i++) {
    returns.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length;
  const hvol = Math.sqrt(variance * 252) * 100;

  // 低波动有利于建仓（轻微看多）
  let score = 0;
  if (hvol < 20) score += 30;
  else if (hvol < 35) score += 10;
  else if (hvol > 50) score -= 30;

  return {
    name: 'volatility',
    signal: score > 10 ? 'bullish' : score < -10 ? 'bearish' : 'neutral',
    score: Math.max(-100, Math.min(100, score)),
    weight: 0.15,
    details: {
      atr: Number(atrVal.toFixed(2)),
      atr_pct: Number(atrPct.toFixed(2)),
      hist_vol_annualized: Number(hvol.toFixed(1)),
      regime: hvol < 20 ? 'low' : hvol < 35 ? 'medium' : 'high',
    },
  };
}

function volumeAnalysis(kline: KlinePoint[]): SubSignal {
  const last = kline.length - 1;
  if (last < 21) {
    return { name: 'volume', signal: 'neutral', score: 0, weight: 0.15, details: {} };
  }

  const volumes = kline.map(k => k.volume);
  const closes = kline.map(k => k.close);
  const volEma20 = computeEMA(volumes, 20);
  const recentVol = volumes[last];
  const avgVol = volEma20[last];
  const volRatio = avgVol > 0 ? recentVol / avgVol : 1;

  const priceUp = closes[last] > closes[last - 1];
  const priceDown = closes[last] < closes[last - 1];

  let score = 0;
  // 放量上涨 = bullish，放量下跌 = bearish，缩量 = neutral
  if (volRatio > 1.5 && priceUp) score += 50;
  else if (volRatio > 1.5 && priceDown) score -= 50;
  else if (volRatio > 1.2 && priceUp) score += 25;
  else if (volRatio > 1.2 && priceDown) score -= 25;

  return {
    name: 'volume',
    signal: score > 15 ? 'bullish' : score < -15 ? 'bearish' : 'neutral',
    score: Math.max(-100, Math.min(100, score)),
    weight: 0.15,
    details: {
      current_volume: recentVol,
      avg_volume_20d: Number(avgVol.toFixed(0)),
      volume_ratio: Number(volRatio.toFixed(2)),
      price_direction: priceUp ? 'up' : priceDown ? 'down' : 'flat',
    },
  };
}

export function analyzeTechnical(kline: KlinePoint[]): TechnicalResult {
  if (kline.length < MIN_DATA_POINTS) {
    return {
      subSignals: [],
      composite: { signal: 'neutral', confidence: 10, details: { reason: 'insufficient_data' } },
    };
  }

  const closes = kline.map(k => k.close);
  const subSignals = [
    trendFollowing(closes, kline),
    meanReversion(closes),
    momentum(closes),
    volatility(kline),
    volumeAnalysis(kline),
  ];

  const weightedScore = subSignals.reduce((sum, s) => sum + s.score * s.weight, 0);
  const normalizedScore = Math.max(-100, Math.min(100, weightedScore));
  const confidence = Math.min(100, Math.abs(normalizedScore) + 20);

  return {
    subSignals,
    composite: {
      signal: normalizedScore > 15 ? 'bullish' : normalizedScore < -15 ? 'bearish' : 'neutral',
      confidence: Math.round(confidence),
      details: Object.fromEntries(subSignals.map(s => [s.name, `${s.signal} (${s.score})`])),
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/hyh/code/StockAI/sidecar && bun test quant/technical.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add sidecar/quant/types.ts sidecar/quant/technical.ts sidecar/quant/technical.test.ts
git commit -m "feat(quant): add technical analysis module with 5 strategies"
```

---

## Task 3: Fundamental Analysis — Fetch & Score Financial Metrics

**Files:**
- Create: `sidecar/quant/fundamental.ts`
- Create: `sidecar/quant/fundamental.test.ts`

- [ ] **Step 1: Write failing tests for fundamental analysis**

Create `sidecar/quant/fundamental.test.ts`:

```typescript
import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import {
  parseEastmoneyFinancials,
  parseYahooFinancials,
  scoreFundamentals,
  fetchFundamentals,
} from './fundamental';
import type { FinancialMetrics } from './types';
import type { RealtimeQuote } from '../../shared/types';

describe('parseEastmoneyFinancials', () => {
  test('从东方财富 API 响应中提取财务指标', () => {
    const response = {
      data: [{
        WEIGHTAVG_ROE: 18.5,
        XSJLL: 32.0,
        XSMLL: 45.0,
        ZCFZL: 42.3,
        LD_RATIO: 1.8,
        YYZSRTBZZ: 15.2,
        GSJLRTBZZ: 12.8,
      }],
    };
    const metrics = parseEastmoneyFinancials(response);
    expect(metrics.roe).toBeCloseTo(18.5, 1);
    expect(metrics.grossMargin).toBeCloseTo(45.0, 1);
    expect(metrics.netMargin).toBeCloseTo(32.0, 1);
    expect(metrics.debtToAsset).toBeCloseTo(42.3, 1);
    expect(metrics.revenueGrowth).toBeCloseTo(15.2, 1);
    expect(metrics.netIncomeGrowth).toBeCloseTo(12.8, 1);
  });

  test('数据为空时返回空对象', () => {
    const metrics = parseEastmoneyFinancials({ data: [] });
    expect(metrics.roe).toBeUndefined();
  });
});

describe('parseYahooFinancials', () => {
  test('从 Yahoo Finance 响应中提取财务指标', () => {
    const response = {
      quoteSummary: {
        result: [{
          financialData: {
            returnOnEquity: { raw: 0.165 },
            grossMargins: { raw: 0.438 },
            profitMargins: { raw: 0.255 },
            debtToEquity: { raw: 85.5 },
            currentRatio: { raw: 1.07 },
            revenueGrowth: { raw: 0.049 },
            earningsGrowth: { raw: 0.108 },
          },
          defaultKeyStatistics: {
            trailingPE: { raw: 29.4 },
            priceToBook: { raw: 48.2 },
            enterpriseValue: { raw: 3_200_000_000_000 },
          },
        }],
      },
    };
    const metrics = parseYahooFinancials(response);
    expect(metrics.roe).toBeCloseTo(16.5, 0);
    expect(metrics.grossMargin).toBeCloseTo(43.8, 0);
    expect(metrics.revenueGrowth).toBeCloseTo(4.9, 0);
  });
});

describe('scoreFundamentals', () => {
  test('优质公司各维度 bullish', () => {
    const metrics: FinancialMetrics = {
      roe: 20, grossMargin: 40, netMargin: 15,
      debtToAsset: 35, currentRatio: 2.0,
      revenueGrowth: 15, netIncomeGrowth: 18,
      pe: 18, pb: 2.5,
    };
    const result = scoreFundamentals(metrics);
    expect(result.composite.signal).toBe('bullish');
  });

  test('高负债低增长公司 bearish', () => {
    const metrics: FinancialMetrics = {
      roe: 5, grossMargin: 15, netMargin: 3,
      debtToAsset: 80, currentRatio: 0.8,
      revenueGrowth: -5, netIncomeGrowth: -10,
      pe: 50, pb: 8,
    };
    const result = scoreFundamentals(metrics);
    expect(result.composite.signal).toBe('bearish');
  });

  test('返回 4 个维度子信号', () => {
    const metrics: FinancialMetrics = { roe: 12, pe: 20 };
    const result = scoreFundamentals(metrics);
    expect(result.dimensions).toHaveLength(4);
    expect(result.dimensions.map(d => d.name)).toEqual([
      'profitability', 'growth', 'financial_health', 'valuation',
    ]);
  });

  test('指标全部缺失时返回 neutral', () => {
    const result = scoreFundamentals({});
    expect(result.composite.signal).toBe('neutral');
    expect(result.composite.confidence).toBeLessThan(30);
  });
});

describe('fetchFundamentals', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('A 股调用东方财富接口', async () => {
    let calledUrl = '';
    globalThis.fetch = mock(async (url: string) => {
      calledUrl = url;
      return new Response(JSON.stringify({
        data: [{ WEIGHTAVG_ROE: 15, XSJLL: 20, XSMLL: 35, ZCFZL: 40, LD_RATIO: 1.5, YYZSRTBZZ: 10, GSJLRTBZZ: 8 }],
      }));
    }) as typeof fetch;

    const result = await fetchFundamentals('601012', 'A股');
    expect(calledUrl).toContain('eastmoney');
    expect(result.roe).toBeCloseTo(15, 0);
  });

  test('美股调用 Yahoo Finance 接口', async () => {
    let calledUrl = '';
    globalThis.fetch = mock(async (url: string) => {
      calledUrl = url;
      return new Response(JSON.stringify({
        quoteSummary: {
          result: [{
            financialData: {
              returnOnEquity: { raw: 0.20 },
              grossMargins: { raw: 0.45 },
              profitMargins: { raw: 0.25 },
              debtToEquity: { raw: 100 },
              currentRatio: { raw: 1.2 },
              revenueGrowth: { raw: 0.08 },
              earningsGrowth: { raw: 0.12 },
            },
            defaultKeyStatistics: {},
          }],
        },
      }));
    }) as typeof fetch;

    const result = await fetchFundamentals('AAPL', '美股');
    expect(calledUrl).toContain('yahoo');
    expect(result.roe).toBeCloseTo(20, 0);
  });

  test('网络失败返回空对象', async () => {
    globalThis.fetch = mock(async () => { throw new Error('network'); }) as typeof fetch;
    const result = await fetchFundamentals('AAPL', '美股');
    expect(result).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/hyh/code/StockAI/sidecar && bun test quant/fundamental.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement fundamental.ts**

Create `sidecar/quant/fundamental.ts`:

```typescript
import type { FinancialMetrics, FundamentalResult, SubSignal } from './types';
import { logger, toErrorMessage } from '../utils';

export function parseEastmoneyFinancials(json: { data?: Record<string, number>[] }): FinancialMetrics {
  const row = json?.data?.[0];
  if (!row) return {};
  return {
    roe: row.WEIGHTAVG_ROE ?? undefined,
    grossMargin: row.XSMLL ?? undefined,
    netMargin: row.XSJLL ?? undefined,
    debtToAsset: row.ZCFZL ?? undefined,
    currentRatio: row.LD_RATIO ?? undefined,
    revenueGrowth: row.YYZSRTBZZ ?? undefined,
    netIncomeGrowth: row.GSJLRTBZZ ?? undefined,
  };
}

interface YahooFinancialData {
  returnOnEquity?: { raw: number };
  grossMargins?: { raw: number };
  profitMargins?: { raw: number };
  debtToEquity?: { raw: number };
  currentRatio?: { raw: number };
  revenueGrowth?: { raw: number };
  earningsGrowth?: { raw: number };
}

interface YahooKeyStats {
  trailingPE?: { raw: number };
  priceToBook?: { raw: number };
  enterpriseValue?: { raw: number };
}

export function parseYahooFinancials(json: {
  quoteSummary?: { result?: Array<{ financialData?: YahooFinancialData; defaultKeyStatistics?: YahooKeyStats }> };
}): FinancialMetrics {
  const item = json?.quoteSummary?.result?.[0];
  if (!item) return {};
  const fd = item.financialData ?? {};
  const ks = item.defaultKeyStatistics ?? {};
  return {
    roe: fd.returnOnEquity?.raw != null ? fd.returnOnEquity.raw * 100 : undefined,
    grossMargin: fd.grossMargins?.raw != null ? fd.grossMargins.raw * 100 : undefined,
    netMargin: fd.profitMargins?.raw != null ? fd.profitMargins.raw * 100 : undefined,
    debtToAsset: fd.debtToEquity?.raw != null ? fd.debtToEquity.raw / 2 : undefined,
    currentRatio: fd.currentRatio?.raw,
    revenueGrowth: fd.revenueGrowth?.raw != null ? fd.revenueGrowth.raw * 100 : undefined,
    netIncomeGrowth: fd.earningsGrowth?.raw != null ? fd.earningsGrowth.raw * 100 : undefined,
    pe: ks.trailingPE?.raw,
    pb: ks.priceToBook?.raw,
  };
}

export async function fetchFundamentals(
  symbol: string,
  market: 'A股' | '美股',
): Promise<FinancialMetrics> {
  try {
    if (market === 'A股') {
      return await fetchEastmoneyFundamentals(symbol);
    }
    return await fetchYahooFundamentals(symbol);
  } catch (err) {
    logger.warn(`基本面数据抓取失败 (${symbol}): ${toErrorMessage(err)}`);
    return {};
  }
}

async function fetchEastmoneyFundamentals(code: string): Promise<FinancialMetrics> {
  const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_F10_FINANCE_MAINFINADATA&columns=WEIGHTAVG_ROE,XSJLL,XSMLL,ZCFZL,LD_RATIO,YYZSRTBZZ,GSJLRTBZZ&filter=(SECURITY_CODE="${code}")&pageSize=1&sortColumns=REPORT_DATE&sortTypes=-1`;

  const resp = await fetch(url, {
    headers: { Referer: 'https://emweb.securities.eastmoney.com' },
  });
  if (!resp.ok) throw new Error(`东财财务 HTTP ${resp.status}`);
  const json = await resp.json();
  return parseEastmoneyFinancials(json);
}

async function fetchYahooFundamentals(symbol: string): Promise<FinancialMetrics> {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=financialData,defaultKeyStatistics`;

  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!resp.ok) throw new Error(`Yahoo Finance HTTP ${resp.status}`);
  const json = await resp.json();
  return parseYahooFinancials(json);
}

function scoreProfitability(m: FinancialMetrics): SubSignal {
  let score = 0;
  let counted = 0;
  if (m.roe != null) { counted++; score += m.roe > 15 ? 1 : m.roe > 8 ? 0 : -1; }
  if (m.netMargin != null) { counted++; score += m.netMargin > 10 ? 1 : m.netMargin > 5 ? 0 : -1; }
  if (m.grossMargin != null) { counted++; score += m.grossMargin > 30 ? 1 : m.grossMargin > 15 ? 0 : -1; }

  const normalized = counted > 0 ? (score / counted) * 60 : 0;
  return {
    name: 'profitability',
    signal: normalized > 20 ? 'bullish' : normalized < -20 ? 'bearish' : 'neutral',
    score: Math.round(normalized),
    weight: 0.25,
    details: {
      ...(m.roe != null && { roe: Number(m.roe.toFixed(1)) }),
      ...(m.netMargin != null && { net_margin: Number(m.netMargin.toFixed(1)) }),
      ...(m.grossMargin != null && { gross_margin: Number(m.grossMargin.toFixed(1)) }),
    },
  };
}

function scoreGrowth(m: FinancialMetrics): SubSignal {
  let score = 0;
  let counted = 0;
  if (m.revenueGrowth != null) { counted++; score += m.revenueGrowth > 10 ? 1 : m.revenueGrowth > 0 ? 0 : -1; }
  if (m.netIncomeGrowth != null) { counted++; score += m.netIncomeGrowth > 10 ? 1 : m.netIncomeGrowth > 0 ? 0 : -1; }

  const normalized = counted > 0 ? (score / counted) * 60 : 0;
  return {
    name: 'growth',
    signal: normalized > 20 ? 'bullish' : normalized < -20 ? 'bearish' : 'neutral',
    score: Math.round(normalized),
    weight: 0.25,
    details: {
      ...(m.revenueGrowth != null && { revenue_growth: Number(m.revenueGrowth.toFixed(1)) }),
      ...(m.netIncomeGrowth != null && { net_income_growth: Number(m.netIncomeGrowth.toFixed(1)) }),
    },
  };
}

function scoreFinancialHealth(m: FinancialMetrics): SubSignal {
  let score = 0;
  let counted = 0;
  if (m.debtToAsset != null) { counted++; score += m.debtToAsset < 60 ? 1 : m.debtToAsset < 75 ? 0 : -1; }
  if (m.currentRatio != null) { counted++; score += m.currentRatio > 1.5 ? 1 : m.currentRatio > 1 ? 0 : -1; }

  const normalized = counted > 0 ? (score / counted) * 60 : 0;
  return {
    name: 'financial_health',
    signal: normalized > 20 ? 'bullish' : normalized < -20 ? 'bearish' : 'neutral',
    score: Math.round(normalized),
    weight: 0.25,
    details: {
      ...(m.debtToAsset != null && { debt_to_asset: Number(m.debtToAsset.toFixed(1)) }),
      ...(m.currentRatio != null && { current_ratio: Number(m.currentRatio.toFixed(2)) }),
    },
  };
}

function scoreValuation(m: FinancialMetrics): SubSignal {
  let score = 0;
  let counted = 0;
  if (m.pe != null) { counted++; score += m.pe < 25 ? 1 : m.pe < 40 ? 0 : -1; }
  if (m.pb != null) { counted++; score += m.pb < 3 ? 1 : m.pb < 5 ? 0 : -1; }

  const normalized = counted > 0 ? (score / counted) * 60 : 0;
  return {
    name: 'valuation',
    signal: normalized > 20 ? 'bullish' : normalized < -20 ? 'bearish' : 'neutral',
    score: Math.round(normalized),
    weight: 0.25,
    details: {
      ...(m.pe != null && { pe: Number(m.pe.toFixed(1)) }),
      ...(m.pb != null && { pb: Number(m.pb.toFixed(2)) }),
    },
  };
}

export function scoreFundamentals(metrics: FinancialMetrics): FundamentalResult {
  const dimensions = [
    scoreProfitability(metrics),
    scoreGrowth(metrics),
    scoreFinancialHealth(metrics),
    scoreValuation(metrics),
  ];

  const hasData = dimensions.some(d => Object.keys(d.details).length > 0);
  if (!hasData) {
    return {
      dimensions,
      composite: { signal: 'neutral', confidence: 10, details: { reason: 'no_data' } },
    };
  }

  const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0);
  const weightedScore = dimensions.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight;
  const confidence = Math.min(100, Math.abs(weightedScore) + 30);

  return {
    dimensions,
    composite: {
      signal: weightedScore > 15 ? 'bullish' : weightedScore < -15 ? 'bearish' : 'neutral',
      confidence: Math.round(confidence),
      details: Object.fromEntries(dimensions.map(d => [d.name, `${d.signal} (${d.score})`])),
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/hyh/code/StockAI/sidecar && bun test quant/fundamental.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add sidecar/quant/fundamental.ts sidecar/quant/fundamental.test.ts
git commit -m "feat(quant): add fundamental analysis with 4-dimension scoring"
```

---

## Task 4: Scoring & Orchestrator

**Files:**
- Create: `sidecar/quant/scoring.ts`
- Create: `sidecar/quant/scoring.test.ts`
- Create: `sidecar/quant/index.ts`

- [ ] **Step 1: Write failing tests for scoring**

Create `sidecar/quant/scoring.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { computeComposite } from './scoring';
import type { AnalystSignal } from '../../shared/types';

describe('computeComposite', () => {
  test('两个 bullish 信号合成 bullish', () => {
    const tech: AnalystSignal = { signal: 'bullish', confidence: 75, details: {} };
    const fund: AnalystSignal = { signal: 'bullish', confidence: 60, details: {} };
    const result = computeComposite(tech, fund);
    expect(result.signal).toBe('bullish');
    expect(result.score).toBeGreaterThan(60);
  });

  test('一个 bullish 一个 bearish 合成接近 neutral', () => {
    const tech: AnalystSignal = { signal: 'bullish', confidence: 70, details: {} };
    const fund: AnalystSignal = { signal: 'bearish', confidence: 70, details: {} };
    const result = computeComposite(tech, fund);
    expect(result.score).toBeGreaterThan(35);
    expect(result.score).toBeLessThan(65);
  });

  test('两个 bearish 信号合成 bearish', () => {
    const tech: AnalystSignal = { signal: 'bearish', confidence: 80, details: {} };
    const fund: AnalystSignal = { signal: 'bearish', confidence: 65, details: {} };
    const result = computeComposite(tech, fund);
    expect(result.signal).toBe('bearish');
    expect(result.score).toBeLessThan(40);
  });

  test('score 始终在 1-100 范围', () => {
    const extreme: AnalystSignal = { signal: 'bullish', confidence: 100, details: {} };
    const result = computeComposite(extreme, extreme);
    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/hyh/code/StockAI/sidecar && bun test quant/scoring.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement scoring.ts**

Create `sidecar/quant/scoring.ts`:

```typescript
import type { AnalystSignal } from '../../shared/types';

const WEIGHTS = { technical: 0.55, fundamental: 0.45 };

function signalToScore(s: AnalystSignal): number {
  const base = s.signal === 'bullish' ? 70 : s.signal === 'bearish' ? 30 : 50;
  const offset = ((s.confidence - 50) / 50) * 20;
  return base + (s.signal === 'bearish' ? -offset : offset);
}

export function computeComposite(
  technical: AnalystSignal,
  fundamental: AnalystSignal,
): { signal: 'bullish' | 'bearish' | 'neutral'; score: number } {
  const techScore = signalToScore(technical);
  const fundScore = signalToScore(fundamental);
  const raw = techScore * WEIGHTS.technical + fundScore * WEIGHTS.fundamental;
  const score = Math.round(Math.max(1, Math.min(100, raw)));
  const signal = score >= 60 ? 'bullish' : score <= 40 ? 'bearish' : 'neutral';
  return { signal, score };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/hyh/code/StockAI/sidecar && bun test quant/scoring.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Create sidecar/quant/index.ts orchestrator**

```typescript
import type { QuantBundle } from '../../shared/types';
import type { FinancialMetrics } from './types';
import { getKline } from '../kline';
import { getQuote } from '../kline';
import { analyzeTechnical } from './technical';
import { fetchFundamentals, scoreFundamentals } from './fundamental';
import { computeComposite } from './scoring';
import { detectMarket } from '../../shared/market';
import { logger, toErrorMessage } from '../utils';

export interface QuantDeps {
  getKline?: typeof getKline;
  getQuote?: typeof getQuote;
  fetchFundamentals?: typeof fetchFundamentals;
}

export async function fetchQuantBundle(
  symbol: string,
  deps: QuantDeps = {},
): Promise<QuantBundle> {
  const _getKline = deps.getKline ?? getKline;
  const _getQuote = deps.getQuote ?? getQuote;
  const _fetchFundamentals = deps.fetchFundamentals ?? fetchFundamentals;

  const market = detectMarket(symbol);

  const [klineResult, quoteResult, fundamentalsResult] = await Promise.allSettled([
    _getKline({ symbol, period: '1d', range: '1y' }),
    _getQuote(symbol),
    _fetchFundamentals(symbol, market),
  ]);

  const kline = klineResult.status === 'fulfilled' ? klineResult.value : [];
  const quote = quoteResult.status === 'fulfilled' ? quoteResult.value : null;

  let fundamentalsRaw: FinancialMetrics =
    fundamentalsResult.status === 'fulfilled' ? fundamentalsResult.value : {};

  if (quote) {
    if (quote.pe != null && fundamentalsRaw.pe == null) fundamentalsRaw.pe = quote.pe;
    if (quote.pb != null && fundamentalsRaw.pb == null) fundamentalsRaw.pb = quote.pb;
    if (quote.marketCap != null) fundamentalsRaw.marketCap = quote.marketCap;
  }

  if (klineResult.status === 'rejected') {
    logger.warn(`K 线获取失败: ${toErrorMessage(klineResult.reason)}`);
  }

  const technicalResult = analyzeTechnical(kline);
  const fundamentalResult = scoreFundamentals(fundamentalsRaw);
  const composite = computeComposite(technicalResult.composite, fundamentalResult.composite);

  return {
    symbol,
    technical: technicalResult.composite,
    fundamental: fundamentalResult.composite,
    composite,
    fetchedAt: Date.now(),
  };
}
```

- [ ] **Step 6: Verify all quant tests pass**

Run: `cd /Users/hyh/code/StockAI/sidecar && bun test quant/`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add sidecar/quant/scoring.ts sidecar/quant/scoring.test.ts sidecar/quant/index.ts
git commit -m "feat(quant): add scoring module and fetchQuantBundle orchestrator"
```

---

## Task 5: CLI Integration — --quant Action & Enhanced Prompt

**Files:**
- Modify: `sidecar/cli-handlers.ts`
- Modify: `sidecar/index.ts`
- Modify: `sidecar/prompts.ts`
- Modify: `sidecar/prompts.test.ts`

- [ ] **Step 1: Add buildEnhancedPrompt to prompts.ts**

Add after the existing `buildAnalysisPrompt` function in `sidecar/prompts.ts`:

```typescript
import type { QuantBundle } from '../shared/types';

/**
 * 构建含量化分析上下文的增强 prompt
 */
export function buildEnhancedPrompt(
  symbol: string,
  news: StockNews[],
  quant: QuantBundle,
  contentLimit = 1000,
): string {
  const quantSection = formatQuantSummary(quant);
  const newsSection = buildAnalysisPrompt(symbol, news, contentLimit);

  return `${quantSection}

${newsSection}

请结合量化分析数据和新闻信息，给出综合研判。在 JSON 中额外增加两个字段：
"technicalView": "对技术面指标的文字解读（1-2 句话）",
"fundamentalView": "对基本面指标的文字解读（1-2 句话）"`;
}

function formatQuantSummary(quant: QuantBundle): string {
  const t = quant.technical;
  const f = quant.fundamental;
  const td = t.details;
  const fd = f.details;

  return `[量化分析摘要]

技术面信号：${translateSignal(t.signal)}，置信度 ${t.confidence}%
${td.alignment ? `- EMA 排列：${td.alignment === 'bullish' ? '多头排列' : td.alignment === 'bearish' ? '空头排列' : '交叉纠缠'}` : ''}
${td.rsi ? `- RSI(14)：${td.rsi}${Number(td.rsi) < 30 ? '（超卖）' : Number(td.rsi) > 70 ? '（超买）' : '（中性区间）'}` : ''}
${td.macd_trend ? `- MACD：柱状量${td.macd_trend === 'expanding' ? '放大' : '收缩'}` : ''}
${td.adx ? `- ADX：${td.adx}${Number(td.adx) > 25 ? '（趋势明确）' : '（趋势较弱）'}` : ''}
${td.volume_ratio ? `- 成交量比：${td.volume_ratio}（相对20日均量）` : ''}

基本面信号：${translateSignal(f.signal)}，置信度 ${f.confidence}%
${fd.roe ? `- ROE: ${fd.roe}%` : ''}
${fd.net_margin ? `- 净利率: ${fd.net_margin}%` : ''}
${fd.revenue_growth ? `- 营收增长: ${fd.revenue_growth}%` : ''}
${fd.pe ? `- PE: ${fd.pe}` : ''}
${fd.pb ? `- PB: ${fd.pb}` : ''}
${fd.debt_to_asset ? `- 资产负债率: ${fd.debt_to_asset}%` : ''}

综合量化评分：${quant.composite.score}/100（${translateSignal(quant.composite.signal)}）`;
}

function translateSignal(signal: string): string {
  return signal === 'bullish' ? '看涨' : signal === 'bearish' ? '看跌' : '中性';
}
```

Note: Add the `QuantBundle` import to the existing import line at the top of `prompts.ts`:

```typescript
import type { StockNews, QuantBundle } from '../shared/types';
```

- [ ] **Step 2: Add tests for buildEnhancedPrompt to prompts.test.ts**

Append to `sidecar/prompts.test.ts`:

```typescript
import { buildEnhancedPrompt } from './prompts';
import { createMockQuantBundle, createMockNews as mockNews2 } from '../shared/test-utils';

describe('buildEnhancedPrompt', () => {
  const news = [mockNews2({ title: '测试新闻' })];
  const quant = createMockQuantBundle({
    technical: { signal: 'bullish', confidence: 72, details: { rsi: 45, adx: 28, alignment: 'bullish', volume_ratio: 1.3, macd_trend: 'expanding' } },
    fundamental: { signal: 'neutral', confidence: 55, details: { roe: 16.5, pe: 22, net_margin: 12 } },
    composite: { signal: 'bullish', score: 68 },
  });

  test('包含量化分析摘要标题', () => {
    const prompt = buildEnhancedPrompt('AAPL', news, quant);
    expect(prompt).toContain('[量化分析摘要]');
  });

  test('包含技术面信号', () => {
    const prompt = buildEnhancedPrompt('AAPL', news, quant);
    expect(prompt).toContain('看涨');
    expect(prompt).toContain('72%');
  });

  test('包含基本面指标值', () => {
    const prompt = buildEnhancedPrompt('AAPL', news, quant);
    expect(prompt).toContain('ROE: 16.5%');
    expect(prompt).toContain('PE: 22');
  });

  test('包含综合评分', () => {
    const prompt = buildEnhancedPrompt('AAPL', news, quant);
    expect(prompt).toContain('68/100');
  });

  test('包含 technicalView/fundamentalView 要求', () => {
    const prompt = buildEnhancedPrompt('AAPL', news, quant);
    expect(prompt).toContain('technicalView');
    expect(prompt).toContain('fundamentalView');
  });

  test('仍包含原有新闻列表', () => {
    const prompt = buildEnhancedPrompt('AAPL', news, quant);
    expect(prompt).toContain('测试新闻');
  });
});
```

- [ ] **Step 3: Run prompt tests**

Run: `cd /Users/hyh/code/StockAI/sidecar && bun test prompts.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Add handleQuant to cli-handlers.ts**

Add to the `createHandlers` return object in `sidecar/cli-handlers.ts`, after `handleAnalyzeOnly`:

```typescript
    async handleQuant(symbol: string) {
      if (!symbol) {
        out(errorEnvelope('ERR_MISSING_PARAM', '未提供股票代码'));
        return;
      }
      try {
        const { fetchQuantBundle } = await import('./quant');
        const bundle = await fetchQuantBundle(symbol);
        out(successEnvelope(bundle));
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_QUANT', error));
      }
    },
```

- [ ] **Step 5: Enhance handleAnalyzeOnly to accept optional QuantBundle**

In `cli-handlers.ts`, modify `handleAnalyzeOnly` to accept an optional `quantJson` parameter. Add at the top of the function, after news parsing:

```typescript
    async handleAnalyzeOnly(symbol: string, news: StockNews[], config: ResolvedConfig, quantJson?: string) {
```

Inside the try block, after the news validation, before calling `analyzeOnly`:

```typescript
        let quant: import('../shared/types').QuantBundle | undefined;
        if (quantJson) {
          try {
            quant = JSON.parse(quantJson);
          } catch { /* ignore parse error, proceed without quant */ }
        }
```

Then pass quant to the analysis. This requires updating the `analyzeNewsWithLLM` signature — we'll handle that by passing quant through the prompt. Modify the `analyzeOnly` call:

```typescript
        const analyzeOnly = deps._analyzeOnly ?? (await import('./analysis')).analyzeNewsWithLLM;
        const analysis = await analyzeOnly(symbol, news, config.provider, {
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          model: config.modelName,
        }, undefined, quant);
```

- [ ] **Step 6: Add --quant routing in sidecar/index.ts**

Add to the `COMMAND_TABLE` array in `sidecar/index.ts`:

```typescript
  {
    // --quant symbol
    flag: '--quant',
    extract: (args, idx) => ({ configStr: '{}', actionParam: args[idx + 1] }),
  },
```

Add a case to the switch statement, before `default`:

```typescript
    case '--quant':
      await Handlers.handleQuant(actionParam || '');
      break;
```

Also update `--analyze-only` to pass quant file path. In the existing `--analyze-only` case, after reading news from file, add:

```typescript
        const quantPath = args[idx + 4]; // optional 5th arg
```

Wait — the `--analyze-only` case uses `parseArgs` which extracts `newsJson` at `args[idx + 3]`. We need to add `quantJson` at `args[idx + 4]`. Modify the COMMAND_TABLE entry for `--analyze-only`:

```typescript
  {
    flag: '--analyze-only',
    extract: (args, idx) => ({
      configStr: args[idx + 1] || '{}',
      actionParam: args[idx + 2],
      newsJson: args[idx + 3],
      quantJson: args[idx + 4],
    }),
  },
```

Add `quantJson` to the `ParsedArgs` interface:

```typescript
interface ParsedArgs {
  action: string;
  configStr: string;
  actionParam?: string;
  newsJson?: string;
  quantJson?: string;
}
```

Update the `--analyze-only` switch case to pass `quantJson`:

```typescript
    case '--analyze-only':
      try {
        const config = resolveConfig(rawConfig);
        if (!newsJson) {
          outputJson(errorEnvelope('ERR_MISSING_PARAM', '未提供 news 文件路径'));
          return;
        }
        let news: StockNews[] = [];
        try {
          news = JSON.parse(await Bun.file(newsJson).text());
        } catch (err) {
          outputJson(errorEnvelope('ERR_MISSING_PARAM', `读取 news 文件失败: ${toErrorMessage(err)}`));
          return;
        }
        await Handlers.handleAnalyzeOnly(actionParam || '', news, config, quantJson);
      } catch (error) {
        outputJson(errorEnvelopeFromUnknown('ERR_CONFIG', error));
      }
      break;
```

Note: Also update the destructuring of `parseArgs` result to include `quantJson`:

```typescript
  const { action, configStr, actionParam, newsJson, quantJson } = parseArgs(args);
```

- [ ] **Step 7: Update analyzeNewsWithLLM to accept optional QuantBundle**

In `sidecar/analysis.ts`, add the quant parameter:

```typescript
export async function analyzeNewsWithLLM(
  symbol: string,
  news: StockNews[],
  providerType: string = 'openai',
  config: { apiKey?: string; baseUrl?: string; model?: string } = {},
  deps: AnalysisDeps = {},
  quant?: QuantBundle,
): Promise<AIAnalysisResult> {
```

Add the import at the top:

```typescript
import type { AIAnalysisResult, FullAnalysisResponse, MarketBundle, StockInfo, StockNews, QuantBundle } from '../shared/types';
```

Then pass `quant` to the provider's `analyze` method:

```typescript
    return await provider.analyze(symbol, news, quant);
```

- [ ] **Step 8: Update AIProvider interface and implementations**

In `sidecar/ai.ts`, update the `analyze` signature:

```typescript
import type { AIAnalysisResult, StockNews, QuantBundle } from '../shared/types';

export interface AIProvider {
  readonly kind: ProviderKind;
  analyze(symbol: string, news: StockNews[], quant?: QuantBundle): Promise<AIAnalysisResult>;
}
```

In `sidecar/providers/openai.ts`, update `analyze`:

```typescript
import type { AIAnalysisResult, StockNews, QuantBundle } from '../../shared/types';
import { buildAnalysisPrompt, buildEnhancedPrompt, SYSTEM_PROMPT } from '../prompts';

  async analyze(symbol: string, news: StockNews[], quant?: QuantBundle): Promise<AIAnalysisResult> {
    const prompt = quant
      ? buildEnhancedPrompt(symbol, news, quant, PROVIDER_PROFILES.openai.contentLimit)
      : buildAnalysisPrompt(symbol, news, PROVIDER_PROFILES.openai.contentLimit);
```

Apply the same pattern to `sidecar/providers/anthropic.ts` and `sidecar/providers/ollama.ts` — add the `quant?: QuantBundle` parameter, import `buildEnhancedPrompt`, and choose the enhanced prompt when quant is available.

- [ ] **Step 9: Run all sidecar tests**

Run: `cd /Users/hyh/code/StockAI && bun run test`
Expected: All tests PASS

- [ ] **Step 10: Commit**

```bash
git add sidecar/prompts.ts sidecar/prompts.test.ts sidecar/cli-handlers.ts sidecar/index.ts sidecar/analysis.ts sidecar/ai.ts sidecar/providers/openai.ts sidecar/providers/anthropic.ts sidecar/providers/ollama.ts
git commit -m "feat(quant): integrate --quant CLI action and enhanced LLM prompt"
```

---

## Task 6: Rust Layer — fetch_quant_bundle Command

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add fetch_quant_bundle to SidecarManager**

In `src-tauri/src/lib.rs`, add to the `SidecarManager` impl block:

```rust
    async fn fetch_quant_bundle(
        app_handle: &tauri::AppHandle,
        symbol: String,
    ) -> Result<String, String> {
        Self::run(app_handle, vec!["--quant".to_string(), symbol]).await
    }
```

- [ ] **Step 2: Add Tauri command**

Add after the existing `analyze_news` command:

```rust
#[tauri::command]
async fn fetch_quant_bundle(
    app_handle: tauri::AppHandle,
    symbol: String,
) -> Result<String, String> {
    SidecarManager::fetch_quant_bundle(&app_handle, symbol).await
}
```

- [ ] **Step 3: Register in invoke_handler**

Add `fetch_quant_bundle` to the `generate_handler!` macro call:

```rust
        .invoke_handler(tauri::generate_handler![
            start_analysis,
            fetch_market_bundle,
            analyze_news,
            list_models,
            get_stock_info,
            search_stocks,
            fetch_kline,
            fetch_realtime_quote,
            fetch_quant_bundle
        ])
```

- [ ] **Step 4: Update analyze_news to pass quant file**

Modify `SidecarManager::analyze_news` to accept an optional quant JSON string:

```rust
    async fn analyze_news(
        app_handle: &tauri::AppHandle,
        symbol: String,
        news: serde_json::Value,
        config: serde_json::Value,
        quant: Option<String>,
    ) -> Result<String, String> {
```

After creating the `path_arg`, add:

```rust
        let mut args = vec!["--analyze-only".to_string(), config_json, symbol, path_arg];
        if let Some(q) = quant {
            args.push(q);
        }
        Self::run(app_handle, args).await
```

Update the `analyze_news` Tauri command to accept optional quant:

```rust
#[tauri::command]
async fn analyze_news(
    app_handle: tauri::AppHandle,
    symbol: String,
    news: serde_json::Value,
    quant: Option<String>,
) -> Result<String, String> {
```

And pass it through:

```rust
    SidecarManager::analyze_news(&app_handle, symbol, news, settings_val, quant).await
```

- [ ] **Step 5: Verify Rust compiles**

Run: `cd /Users/hyh/code/StockAI/src-tauri && cargo check`
Expected: No errors

- [ ] **Step 6: Run Rust tests**

Run: `cd /Users/hyh/code/StockAI/src-tauri && cargo test`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(tauri): add fetch_quant_bundle command and quant passthrough"
```

---

## Task 7: Frontend — IPC, Hook, Mock Data

**Files:**
- Modify: `src/lib/ipc.ts`
- Modify: `src/lib/dev-mocks.ts`
- Create: `src/hooks/useQuantData.ts`
- Create: `src/hooks/useQuantData.test.ts`
- Modify: `scripts/sidecar-bridge.ts`

- [ ] **Step 1: Add MOCK_QUANT to dev-mocks.ts**

In `src/lib/dev-mocks.ts`, add the import and mock:

```typescript
import type { QuantBundle } from '../../shared/types';
```

Add to existing import at line 1:

```typescript
import type {
  StockInfo,
  StockSearchResult,
  KlinePoint,
  RealtimeQuote,
  MarketBundle,
  StockNews,
  AIAnalysisResult,
  QuantBundle,
} from "../../shared/types";
```

Append at the end:

```typescript
export const MOCK_QUANT: QuantBundle = {
  symbol: "AAPL",
  technical: {
    signal: "bullish",
    confidence: 72,
    details: { rsi: 45, adx: 28, alignment: "bullish", volume_ratio: 1.3, macd_trend: "expanding" },
  },
  fundamental: {
    signal: "neutral",
    confidence: 55,
    details: { roe: 16.5, pe: 22, net_margin: 12, pb: 2.8 },
  },
  composite: { signal: "bullish", score: 68 },
  fetchedAt: Date.now(),
};
```

- [ ] **Step 2: Add fetchQuantBundle to ipc.ts**

Add the import:

```typescript
import type { QuantBundle } from '../../shared/types';
```

Update the import from dev-mocks:

```typescript
import { MOCK_STOCKS, MOCK_MODELS, MOCK_KLINE, MOCK_QUOTE, MOCK_BUNDLE, MOCK_AI_RESULT, MOCK_QUANT } from "./dev-mocks";
```

Add the function:

```typescript
/** 拉取量化分析数据（技术面 + 基本面，不调 LLM） */
export async function fetchQuantBundle(symbol: string): Promise<QuantBundle> {
  if (!isTauri()) return devBridgeInvoke<QuantBundle>("fetch_quant_bundle", { symbol }, MOCK_QUANT);

  try {
    const raw = await invoke<string>("fetch_quant_bundle", { symbol });
    return parseServiceResponse<QuantBundle>(raw);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(typeof error === 'string' ? error : String(error));
  }
}
```

Update existing `analyzeNews` to pass optional quant:

```typescript
export async function analyzeNews(symbol: string, news: StockNews[], quant?: QuantBundle): Promise<AIAnalysisResult> {
  const quantJson = quant ? JSON.stringify(quant) : undefined;
  if (!isTauri()) return devBridgeInvoke<AIAnalysisResult>("analyze_news", { symbol, news, quant: quantJson }, MOCK_AI_RESULT);

  try {
    const raw = await invoke<string>("analyze_news", { symbol, news, quant: quantJson });
    return parseServiceResponse<AIAnalysisResult>(raw);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(typeof error === 'string' ? error : String(error));
  }
}
```

- [ ] **Step 3: Create useQuantData.ts**

Create `src/hooks/useQuantData.ts`:

```typescript
import { useEffect, useRef, useState } from "react";
import type { QuantBundle } from "../../shared/types";
import { fetchQuantBundle } from "../lib/ipc";

export type QuantDataStep = "idle" | "fetching" | "ready" | "error";

export interface UseQuantDataResult {
  step: QuantDataStep;
  quant: QuantBundle | null;
  error: string | null;
  refetch: () => void;
}

type FetchFn = (symbol: string) => Promise<QuantBundle>;

export function useQuantData(symbol: string, fetcher: FetchFn = fetchQuantBundle): UseQuantDataResult {
  const [step, setStep] = useState<QuantDataStep>("idle");
  const [quant, setQuant] = useState<QuantBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestRequestId = useRef(0);
  const [trigger, setTrigger] = useState(0);

  useEffect(() => {
    if (!symbol) return;

    const requestId = ++latestRequestId.current;
    setStep("fetching");
    setError(null);

    fetcher(symbol)
      .then(bundle => {
        if (requestId !== latestRequestId.current) return;
        setQuant(bundle);
        setStep("ready");
      })
      .catch(err => {
        if (requestId !== latestRequestId.current) return;
        const msg = err instanceof Error ? err.message : "量化分析失败";
        setError(msg);
        setStep("error");
        setQuant(null);
      });
  }, [symbol, trigger, fetcher]);

  function refetch() {
    setTrigger(t => t + 1);
  }

  return { step, quant, error, refetch };
}
```

- [ ] **Step 4: Write useQuantData tests**

Create `src/hooks/useQuantData.test.ts`:

```typescript
import { describe, test, expect, mock } from "bun:test";
import { renderHook, waitFor } from "@testing-library/react";
import { useQuantData } from "./useQuantData";
import { createMockQuantBundle } from "../../shared/test-utils";

describe("useQuantData", () => {
  test("初始状态为 idle", () => {
    const fetcher = mock(async () => createMockQuantBundle());
    const { result } = renderHook(() => useQuantData("", fetcher));
    expect(result.current.step).toBe("idle");
    expect(result.current.quant).toBeNull();
  });

  test("有 symbol 时自动 fetch", async () => {
    const bundle = createMockQuantBundle({ symbol: "AAPL" });
    const fetcher = mock(async () => bundle);
    const { result } = renderHook(() => useQuantData("AAPL", fetcher));

    await waitFor(() => expect(result.current.step).toBe("ready"));
    expect(result.current.quant).toEqual(bundle);
    expect(result.current.error).toBeNull();
  });

  test("fetch 失败时 step 为 error", async () => {
    const fetcher = mock(async () => { throw new Error("网络错误"); });
    const { result } = renderHook(() => useQuantData("AAPL", fetcher));

    await waitFor(() => expect(result.current.step).toBe("error"));
    expect(result.current.error).toBe("网络错误");
    expect(result.current.quant).toBeNull();
  });

  test("symbol 变化时重新 fetch", async () => {
    const fetcher = mock(async (sym: string) => createMockQuantBundle({ symbol: sym }));
    const { result, rerender } = renderHook(
      ({ sym }) => useQuantData(sym, fetcher),
      { initialProps: { sym: "AAPL" } },
    );

    await waitFor(() => expect(result.current.step).toBe("ready"));
    expect(result.current.quant?.symbol).toBe("AAPL");

    rerender({ sym: "601012" });
    await waitFor(() => expect(result.current.quant?.symbol).toBe("601012"));
  });
});
```

- [ ] **Step 5: Add bridge route for fetch_quant_bundle**

In `scripts/sidecar-bridge.ts`, add after the `fetch_realtime_quote` route:

```typescript
      if (cmd === "fetch_quant_bundle") return runAndRespond(["--quant", args.symbol], "quant");
```

- [ ] **Step 6: Run frontend tests**

Run: `cd /Users/hyh/code/StockAI && bunx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/ipc.ts src/lib/dev-mocks.ts src/hooks/useQuantData.ts src/hooks/useQuantData.test.ts scripts/sidecar-bridge.ts
git commit -m "feat(frontend): add fetchQuantBundle IPC, useQuantData hook, dev bridge"
```

---

## Task 8: Frontend UI — QuantScoreCard & Dashboard Integration

**Files:**
- Create: `src/components/QuantScoreCard.tsx`
- Modify: `src/components/AnalysisPanel.tsx`
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/hooks/useAIAnalysis.ts`

- [ ] **Step 1: Create QuantScoreCard component**

Create `src/components/QuantScoreCard.tsx`:

```tsx
import React, { useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import type { QuantBundle, AnalystSignal } from '../../shared/types';

interface QuantScoreCardProps {
  quant: QuantBundle | null;
  loading: boolean;
  error: string | null;
}

function signalIcon(signal: string) {
  if (signal === 'bullish') return <TrendingUp className="w-4 h-4" />;
  if (signal === 'bearish') return <TrendingDown className="w-4 h-4" />;
  return <Minus className="w-4 h-4" />;
}

function signalColor(signal: string): string {
  if (signal === 'bullish') return 'text-emerald-400';
  if (signal === 'bearish') return 'text-rose-400';
  return 'text-amber-400';
}

function signalBg(signal: string): string {
  if (signal === 'bullish') return 'bg-emerald-500/10 border-emerald-500/20';
  if (signal === 'bearish') return 'bg-rose-500/10 border-rose-500/20';
  return 'bg-amber-500/10 border-amber-500/20';
}

function signalLabel(signal: string): string {
  if (signal === 'bullish') return '看涨';
  if (signal === 'bearish') return '看跌';
  return '中性';
}

function SignalCard({ title, signal, expanded, onToggle }: {
  title: string;
  signal: AnalystSignal;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex-1 p-3 rounded-xl border ${signalBg(signal.signal)} text-left transition-all hover:brightness-110`}
    >
      <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{title}</div>
      <div className={`flex items-center gap-1.5 ${signalColor(signal.signal)} font-bold text-sm`}>
        {signalIcon(signal.signal)}
        {signalLabel(signal.signal)}
      </div>
      <div className="text-xs text-gray-500 mt-1">{signal.confidence}/100</div>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
          {Object.entries(signal.details).map(([k, v]) => (
            <div key={k} className="text-[10px] text-gray-500 flex justify-between">
              <span>{k}</span>
              <span className="text-gray-300">{v}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-1 flex justify-center">
        {expanded ? <ChevronUp className="w-3 h-3 text-gray-600" /> : <ChevronDown className="w-3 h-3 text-gray-600" />}
      </div>
    </button>
  );
}

const QuantScoreCard: React.FC<QuantScoreCardProps> = ({ quant, loading, error }) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="mb-6 p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center gap-3 text-gray-400 text-xs">
        <Loader2 className="w-4 h-4 animate-spin" />
        正在计算量化指标…
      </div>
    );
  }

  if (error || !quant) return null;

  return (
    <div className="mb-6">
      <div className="flex gap-2 mb-3">
        <SignalCard
          title="技术面"
          signal={quant.technical}
          expanded={expanded === 'tech'}
          onToggle={() => setExpanded(expanded === 'tech' ? null : 'tech')}
        />
        <SignalCard
          title="基本面"
          signal={quant.fundamental}
          expanded={expanded === 'fund'}
          onToggle={() => setExpanded(expanded === 'fund' ? null : 'fund')}
        />
      </div>
      <div className={`p-2 rounded-lg text-center text-xs font-medium ${signalBg(quant.composite.signal)} ${signalColor(quant.composite.signal)}`}>
        综合信号：{signalLabel(quant.composite.signal)} {quant.composite.score}/100
      </div>
    </div>
  );
};

export default QuantScoreCard;
```

- [ ] **Step 2: Update AnalysisPanel to accept quant props**

In `src/components/AnalysisPanel.tsx`, add the import:

```typescript
import QuantScoreCard from './QuantScoreCard';
import type { QuantBundle } from '../../shared/types';
```

Extend `AnalysisPanelProps`:

```typescript
interface AnalysisPanelProps {
  stockInfo?: StockInfo;
  record: AIAnalysisRecord | null;
  analyzing: boolean;
  error: string | null;
  hasNews: boolean;
  providerLabel: string;
  modelLabel: string;
  onAnalyze: () => void;
  // 新增量化分析
  quant: QuantBundle | null;
  quantLoading: boolean;
  quantError: string | null;
}
```

Update the component destructuring:

```typescript
const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  stockInfo, record, analyzing, error, hasNews, providerLabel, modelLabel, onAnalyze,
  quant, quantLoading, quantError,
}) => {
```

Add the `QuantScoreCard` inside the component, right after `StockInfoCard`:

```tsx
      {stockInfo && <StockInfoCard info={stockInfo} />}

      {/* 量化评分卡片 */}
      <QuantScoreCard quant={quant} loading={quantLoading} error={quantError} />
```

Also, after the existing AI 分析结果 section (inside the `{result && (` block), add technicalView and fundamentalView display if present. After the cons section, add:

```tsx
          {(result.technicalView || result.fundamentalView) && (
            <div className="mt-6 space-y-3">
              {result.technicalView && (
                <div className="p-4 bg-sky-500/5 border-l-4 border-sky-500 rounded-r-xl">
                  <div className="text-xs text-sky-400 mb-1 font-bold">技术面解读</div>
                  <div className="text-sm leading-snug">{result.technicalView}</div>
                </div>
              )}
              {result.fundamentalView && (
                <div className="p-4 bg-violet-500/5 border-l-4 border-violet-500 rounded-r-xl">
                  <div className="text-xs text-violet-400 mb-1 font-bold">基本面解读</div>
                  <div className="text-sm leading-snug">{result.fundamentalView}</div>
                </div>
              )}
            </div>
          )}
```

- [ ] **Step 3: Update useAIAnalysis to pass quant**

In `src/hooks/useAIAnalysis.ts`, update the type and callback:

```typescript
import { AIAnalysisResult, StockNews, QuantBundle } from "../../shared/types";
import { analyzeNews } from "../lib/ipc";

type AnalyzeFn = (symbol: string, news: StockNews[], quant?: QuantBundle) => Promise<AIAnalysisResult>;
```

Update the `analyze` callback signature:

```typescript
  const analyze = useCallback(async (news: StockNews[], quant?: QuantBundle) => {
```

And pass quant through:

```typescript
      const result = await runner(symbol, news, quant);
```

Update the `UseAIAnalysisResult` interface:

```typescript
  analyze: (news: StockNews[], quant?: QuantBundle) => Promise<void>;
```

- [ ] **Step 4: Wire everything in Dashboard.tsx**

In `src/components/Dashboard.tsx`, add imports:

```typescript
import { useQuantData } from '../hooks/useQuantData';
```

Inside the component, add after the `useAIAnalysis` call:

```typescript
  const { step: quantStep, quant, error: quantError } = useQuantData(currentSymbol);
```

Update the auto-analyze effect to also pass quant:

```typescript
  useEffect(() => {
    if (!settings.autoAnalyze) return;
    if (step !== 'ready' || news.length === 0) return;
    if (autoFlowSymbol === currentSymbol) return;
    setAutoFlowSymbol(currentSymbol);
    analyze(news, quant ?? undefined);
  }, [step, news, currentSymbol, settings.autoAnalyze, autoFlowSymbol, analyze, quant]);
```

Update the `AnalysisPanel` props:

```tsx
        <AnalysisPanel
          stockInfo={stockInfo}
          record={record}
          analyzing={analyzing}
          error={aiError}
          hasNews={news.length > 0}
          providerLabel={providerLabel}
          modelLabel={modelLabel}
          onAnalyze={() => analyze(news, quant ?? undefined)}
          quant={quant}
          quantLoading={quantStep === 'fetching'}
          quantError={quantError}
        />
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd /Users/hyh/code/StockAI && bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Run all tests**

Run: `cd /Users/hyh/code/StockAI && bun run test`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/QuantScoreCard.tsx src/components/AnalysisPanel.tsx src/components/Dashboard.tsx src/hooks/useAIAnalysis.ts
git commit -m "feat(ui): add QuantScoreCard and integrate quantitative analysis in dashboard"
```

---

## Task 9: Final Integration Test & Cleanup

**Files:**
- All files from previous tasks

- [ ] **Step 1: Run full test suite**

Run: `cd /Users/hyh/code/StockAI && bun run test`
Expected: All tests PASS

- [ ] **Step 2: Type check**

Run: `cd /Users/hyh/code/StockAI && bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Rust check**

Run: `cd /Users/hyh/code/StockAI && cd src-tauri && cargo check && cargo test`
Expected: All pass

- [ ] **Step 4: Verify QuantScoreCard stays under 200 lines**

Run: `wc -l /Users/hyh/code/StockAI/src/components/QuantScoreCard.tsx`
Expected: Less than 200 lines

- [ ] **Step 5: Start dev server and test manually**

Run: `cd /Users/hyh/code/StockAI && bun tauri dev`

Test:
1. Enter a stock symbol (e.g., 601012 or AAPL)
2. Verify QuantScoreCard appears with technical/fundamental signals
3. Verify signals show loading state while fetching
4. Verify clicking a signal card expands to show details
5. Click "AI 分析" and verify the result includes technicalView/fundamentalView
6. Verify error cases: QuantBundle failure doesn't block news/analysis flow

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: integration adjustments for quantitative analysis"
```
