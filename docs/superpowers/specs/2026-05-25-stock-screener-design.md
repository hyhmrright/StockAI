# Stock Screener — Design Spec

> Sub-project 2 of 3: Stock Screener
> Sub-project 1: Analysis History Persistence (done) | Sub-project 3: Push Notifications/Alerts

## Overview

Batch-scan the user's watchlist stocks using existing quantitative analysis engines (technical, fundamental, valuation, risk) and display results sorted by composite score. No LLM calls — pure quant.

## Architecture

Frontend-only feature. Reuses existing `fetchQuantBundle` IPC (which calls sidecar `--quant`). No new backend code needed.

## Data Flow

1. User clicks "开始扫描" in the screener UI
2. `useScreener` hook iterates over the watchlist, calling `fetchQuantBundle(symbol)` with `MAX_CONCURRENCY = 3`
3. Each completed result is pushed to `results[]`; UI updates progress in real-time (e.g. "3/10 完成")
4. On completion, results are sorted by `composite.score` descending
5. Results are saved to `history.db` as a single record with `type = 'screener'`

## Hook: `useScreener`

Located at `src/hooks/useScreener.ts`:

```typescript
interface ScreenerResult {
  symbol: string;
  name: string;
  quant: QuantBundle;
}

interface UseScreenerResult {
  results: ScreenerResult[];
  scanning: boolean;
  progress: { done: number; total: number };
  scan: (items: WatchlistItem[]) => void;
  clear: () => void;
}
```

- `scan(items)`: starts the batch scan with controlled concurrency
- Cancellation: if `scan()` is called while already scanning, the previous run is abandoned (via request ID pattern, same as `useAIAnalysis`)
- Errors for individual stocks are silently skipped (logged to console); partial results are still displayed
- `clear()`: resets results

## UI

### Entry Point

A "筛选" (Screen) button next to the "历史" button in `AnalysisPanel`, or a tab/toggle in the Watchlist panel area.

### Screener Panel (`src/components/Screener/`)

**ScreenerPanel** — the main container:
- "开始扫描" button with progress indicator during scan
- Results table sorted by composite score

**ScreenerTable** — the results table:

| Column | Source |
|--------|--------|
| 股票代码 | `symbol` |
| 名称 | watchlist item `name` |
| 综合评分 | `quant.composite.score` (0-10) |
| 技术面 | `quant.technical.signal` (bullish/bearish/neutral badge) |
| 基本面 | `quant.fundamental.signal` |
| 估值 | `quant.valuation?.signal` (undervalued/overvalued/fair) |
| 风险 | `quant.risk?.riskLevel` (low/medium/high) |

Clicking a row calls the existing `onSelect(symbol)` to switch Dashboard to that stock's detail view.

### States
- **Idle**: "开始扫描" button, no results
- **Scanning**: progress bar + partial results table (rows appear as they complete)
- **Done**: full results table, "重新扫描" button

## Auto-Save

On scan completion, save the full results array to `history.db`:
- `type`: `'screener'`
- `symbol`: comma-joined list of scanned symbols (e.g. `"AAPL,TSLA,NVDA"`)
- `resultJson`: `JSON.stringify(results)`

This reuses the existing `saveAnalysisRecord` from `db.ts`. The `AnalysisType` union in `shared/types.ts` needs to be extended to include `'screener'`.

## Types

Add to `shared/types.ts`:
```typescript
// Extend AnalysisType
export type AnalysisType = 'ai' | 'deep' | 'quant' | 'backtest' | 'screener';
```

Add `ScreenerResult` interface to `shared/types.ts`.

Update `001_create_history.sql` CHECK constraint — but since the DB is already created, add a new migration `002_add_screener_type.sql` that is effectively a no-op for new installs (SQLite CHECK constraints can't be ALTERed). Instead, skip the CHECK constraint update and rely on the application-level AnalysisType union for validation — the existing CHECK will reject 'screener' inserts on existing DBs.

**Revised approach**: Remove the CHECK constraint entirely in migration 002, since the TypeScript `AnalysisType` union is the authoritative source of valid types. This makes future type additions zero-migration.

## Testing

- `useScreener` hook: mock `fetchQuantBundle`, verify concurrency control, progress updates, sorting, error resilience
- `ScreenerTable` component: renders rows with correct data, click handler fires
- `ScreenerPanel` component: button states, progress indicator

## File Changes

### New files
- `src/hooks/useScreener.ts`
- `src/hooks/useScreener.test.ts`
- `src/components/Screener/ScreenerPanel.tsx`
- `src/components/Screener/ScreenerTable.tsx`
- `src-tauri/migrations/002_drop_type_check.sql`

### Modified files
- `shared/types.ts` — extend `AnalysisType`, add `ScreenerResult`
- `src-tauri/src/lib.rs` — add migration 002
- `src/components/AnalysisPanel.tsx` — add screener button
- `src/components/Dashboard.tsx` — screener auto-save effect
