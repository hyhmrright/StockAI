# Phase 5: Backtesting Framework

## Overview

Add a lightweight backtesting engine that validates master agent signals against historical data. Users can see how each master's buy/sell signals would have performed over the past 1-5 years on any stock.

## Architecture

```
Historical K-line data (already available via getKline)
    ↓
Backtest Engine: simulate entry/exit at signal points
    ↓
Performance metrics: total return, max drawdown, win rate, Sharpe
    ↓
Results UI: equity curve chart + per-master performance table
```

## Components

### 1. Signal Generator (`sidecar/backtest/signal-generator.ts`)
For backtesting, we can't call LLM for historical dates. Instead:
- Use quantitative signals only (technical + fundamental + valuation)
- Generate buy/sell signals at each historical point based on composite score thresholds
- Per-master signal approximation: each master's emphasis weights applied to quant data

### 2. Backtest Engine (`sidecar/backtest/engine.ts`)
```typescript
interface BacktestConfig {
  symbol: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  signalThreshold: { buy: number; sell: number };  // composite score thresholds
}

interface BacktestResult {
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  winRate: number;
  sharpeRatio: number;
  trades: TradeRecord[];
  equityCurve: { date: string; value: number }[];
}
```

### 3. Trade Simulator
- Long-only (no shorting for simplicity)
- Entry: composite score crosses above buy threshold
- Exit: composite score crosses below sell threshold, or trailing stop
- Transaction cost: 0.1% per trade (configurable)

## Integration

- New CLI action: `--backtest <symbol> <config-json>`
- New Tauri command: `run_backtest`
- Frontend: new BacktestPanel with equity curve (reuse lightweight-charts) + stats table
- Accessible from the analysis view as a tab or expandable section

## File Structure
```
sidecar/backtest/
  engine.ts           — BacktestEngine class
  signal-generator.ts — generate quant-only signals for historical dates
  types.ts            — BacktestConfig, BacktestResult, TradeRecord
sidecar/cli-handlers.ts — add handleBacktest
src/components/Backtest/
  BacktestPanel.tsx    — container
  EquityCurve.tsx      — lightweight-charts equity line
  StatsTable.tsx       — performance metrics table
```

## Limitations
- Quantitative signals only (no LLM backtesting — too expensive and non-deterministic)
- No position sizing optimization
- Look-ahead bias mitigation: signals computed with data available at each historical point only
- A-share data may have gaps; engine handles missing dates gracefully
