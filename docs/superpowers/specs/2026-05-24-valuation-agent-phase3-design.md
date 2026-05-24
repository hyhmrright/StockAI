# Phase 3: Valuation Agent (DCF / Owner Earnings)

## Overview

Add intrinsic value estimation to StockAI's quantitative analysis pipeline via three local computation models: Owner Earnings, DCF (three-stage with WACC), and Relative Valuation. No LLM calls — pure math. Enriches QuantBundle with valuation data that master agents (Buffett, Graham, Damodaran) consume for better-informed analysis.

## Data Source Extension

### Yahoo Finance (US Stocks)
Add modules to existing `quoteSummary` endpoint:
- `cashflowStatementHistory` → freeCashFlow, operatingCashFlow, capitalExpenditures, depreciation
- `incomeStatementHistory` → totalRevenue, operatingIncome, netIncome, ebitda, interestExpense, incomeTaxExpense
- `balanceSheetHistory` → totalDebt, cash, totalStockholderEquity, sharesOutstanding

### Eastmoney (A-Shares)
Extend `RPT_F10_FINANCE_MAINFINADATA` columns:
- `MGJYXJL` (每股经营现金流) → Operating Cash Flow per share
- `YSZKYYSR` (应收账款占营收比) → Working capital proxy
- Add endpoint `RPT_F10_FN_GMAININDICATOR` for EBITDA components

### New FinancialMetrics Fields
```typescript
freeCashFlow?: number;
operatingCashFlow?: number;
capitalExpenditure?: number;
depreciation?: number;
ebitda?: number;
interestExpense?: number;
totalDebt?: number;
cash?: number;
sharesOutstanding?: number;
enterpriseValue?: number;
effectiveTaxRate?: number;
netIncome?: number;
revenue?: number;
```

## Valuation Models

### 1. Owner Earnings (Buffett method)
```
Owner Earnings = Net Income + D&A - Maintenance CapEx - Working Capital Change
Intrinsic Value = PV(projected owner earnings) + PV(terminal value)
```
- Growth rate: capped at min(historical earnings growth * 0.7, 8%)
- Discount rate: 10% (conservative)
- Three-stage: 5yr high growth → 5yr transition → terminal at 2.5%
- 15% haircut for conservatism

### 2. DCF with Scenarios
```
FCF → project forward with multi-stage growth → discount at WACC → sum
WACC = (E/V × Re) + (D/V × Rd × (1-T))
```
- Three scenarios: Bear (0.5× growth, 1.2× WACC), Base, Bull (1.5× growth, 0.9× WACC)
- Expected value = 20% bear + 60% base + 20% bull
- Quality adjustment based on FCF volatility

### 3. Relative Valuation
- Compare current PE/PB to historical median (from existing data)
- EV/EBITDA if available
- Signal: undervalued if current < 0.8× median, overvalued if > 1.2× median

## Output Type

```typescript
interface ValuationResult {
  intrinsicValue: number | null;
  marketCap: number | null;
  marginOfSafety: number | null;
  signal: 'undervalued' | 'overvalued' | 'fair';
  confidence: number;
  models: {
    ownerEarnings?: { value: number; details: string };
    dcf?: { base: number; bear: number; bull: number; wacc: number };
    relative?: { signal: string; details: string };
  };
}
```

## Integration Points

1. `QuantBundle.valuation?: ValuationResult` — new optional field
2. `fetchQuantBundle()` passes extended metrics to `computeValuation()`
3. Master agents Buffett/Graham/Damodaran get valuation data in their `buildUserPrompt`
4. Frontend: new `ValuationCard` component below QuantScoreCard
5. Enhanced prompt: `formatValuationSummary()` added to prompts.ts

## File Structure

```
sidecar/quant/
  types.ts           — extend FinancialMetrics + add ValuationResult
  fundamental.ts     — extend fetchEastmoney/Yahoo with new fields
  valuation.ts       — NEW: computeValuation() with 3 models
  index.ts           — wire valuation into fetchQuantBundle
shared/types.ts      — add ValuationResult to QuantBundle
sidecar/agents/masters/ — update Buffett/Graham/Damodaran prompts
sidecar/prompts.ts   — add formatValuationSummary()
src/components/ValuationCard.tsx — NEW: display intrinsic value vs market price
```

## Graceful Degradation

- If FCF/capex unavailable: skip Owner Earnings + DCF, only do Relative Valuation
- If no valuation data at all: `valuation` field is `undefined`, UI hides ValuationCard
- A-shares may have limited data initially — relative valuation always works with PE/PB
