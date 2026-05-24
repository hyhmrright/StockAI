# Phase 4: Risk Management & Portfolio Analysis

## Overview

Add risk assessment capabilities to StockAI: volatility metrics, drawdown analysis, and multi-stock correlation. This enriches the analysis with risk-adjusted signals that the master agents (especially Taleb and Druckenmiller) can use. Also provides a portfolio-level view when analyzing multiple stocks.

## Components

### 1. Volatility Calculator (`sidecar/quant/volatility.ts`)
Uses existing K-line data (already fetched in `fetchQuantBundle`):
- Daily returns volatility (annualized: daily_std × √252)
- Historical volatility percentile (current vs 1-year range)
- ATR-based volatility (already computed in technical.ts, reuse)
- Maximum drawdown (peak-to-trough from K-line data)
- Sharpe-like ratio proxy: (annualized return - risk_free) / volatility

### 2. Risk Signal (`shared/types.ts`)
```typescript
interface RiskMetrics {
  annualizedVolatility: number;      // e.g. 0.35 = 35%
  volatilityPercentile: number;      // 0-100, current vs historical
  maxDrawdown: number;               // e.g. -0.25 = -25%
  sharpeProxy: number;               // annualized return / volatility
  riskLevel: 'low' | 'medium' | 'high';
}
```

### 3. Portfolio Correlation (optional, multi-stock)
When user has multiple stocks in watchlist:
- Pairwise correlation matrix from daily returns
- Portfolio diversification score
- This is a stretch goal — implement if time permits

## Integration

1. `QuantBundle.risk?: RiskMetrics` — computed from K-line data
2. Taleb agent prompt gets volatility/drawdown data
3. Druckenmiller agent gets risk-adjusted momentum signals
4. Frontend: risk metrics section in QuantScoreCard or separate RiskCard
5. Portfolio correlation: new section in watchlist view (stretch)

## File Structure
```
sidecar/quant/
  volatility.ts       — NEW: computeRiskMetrics(kline)
  types.ts            — add RiskMetrics
  index.ts            — wire into fetchQuantBundle
shared/types.ts       — add RiskMetrics to QuantBundle
src/components/RiskCard.tsx — NEW: volatility/drawdown display
```

## Graceful Degradation
- If K-line data insufficient (<30 days): skip volatility, return undefined
- Portfolio correlation only available with 2+ stocks with overlapping date ranges
