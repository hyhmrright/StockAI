# Analysis History Persistence — Design Spec

> Sub-project 1 of 3: Analysis History Persistence & Comparison
> Sub-project 2: Stock Screener | Sub-project 3: Push Notifications/Alerts

## Overview

Save every analysis result (AI, deep, quant, backtest) to a local SQLite database and provide a timeline UI for browsing and comparing historical analyses per stock.

## Architecture

Follows the existing three-layer pattern: **React UI → Tauri Rust → SQLite**. The Rust layer owns the database and exposes Tauri commands; the frontend calls them via IPC, same as all other data operations.

### Storage

- **Engine**: SQLite via `tauri-plugin-sql`
- **Database file**: `history.db` in the Tauri app data directory (`appDataDir`)
- **Schema migrations**: managed by `tauri-plugin-sql`'s built-in migration system

## Data Model

### Table: `analysis_records`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK AUTOINCREMENT | Auto-increment primary key |
| `symbol` | TEXT | NOT NULL | Stock symbol (e.g. `AAPL`, `600519`) |
| `analyzed_at` | INTEGER | NOT NULL | Analysis timestamp, Unix milliseconds |
| `type` | TEXT | NOT NULL | Analysis type: `'ai'` / `'deep'` / `'quant'` / `'backtest'` |
| `result_json` | TEXT | NOT NULL | Full result JSON (`AIAnalysisResult` / `DeepAnalysisResult` / `QuantBundle` / `BacktestResult`) |
| `stock_info_json` | TEXT | | `StockInfo` snapshot at analysis time |
| `news_json` | TEXT | | News snapshot used for analysis (ai/deep types only) |

**Index**: `(symbol, type, analyzed_at DESC)` — covers the primary query pattern of "all records for a given stock and type, newest first."

### Design decisions

- `result_json` stores the full JSON blob rather than decomposed columns because the four analysis types have very different schemas. Decomposition would create many nullable columns and require schema migrations whenever a result type changes.
- No separate "comparison" table — comparison is a frontend-only operation (diff two records side by side).

## Rust Layer API

### New Tauri commands

All four commands follow the same pattern as existing commands (`fetch_market_bundle`, `analyze_news`, etc.).

#### `save_analysis_record`

- **Input**: `{ symbol: String, analysis_type: String, result_json: String, stock_info_json: Option<String>, news_json: Option<String> }`
- **Output**: `i64` (the new record's id)
- **Behavior**: `INSERT INTO analysis_records` with `analyzed_at = current Unix ms`, returns `last_insert_rowid()`

#### `get_analysis_history`

- **Input**: `{ symbol: String, analysis_type: Option<String>, limit: Option<i64>, offset: Option<i64> }`
- **Output**: `Vec<AnalysisRecordSummary>` — each contains `id, symbol, analyzed_at, type, result_json, stock_info_json`
- **Behavior**: `SELECT ... WHERE symbol=? [AND type=?] ORDER BY analyzed_at DESC LIMIT ? OFFSET ?`
- **Note**: `news_json` is excluded from list queries to reduce IPC payload size

#### `get_analysis_detail`

- **Input**: `{ id: i64 }`
- **Output**: Full `AnalysisRecord` including `news_json`

#### `delete_analysis_records`

- **Input**: `{ ids: Vec<i64> }`
- **Output**: `i64` (number of rows deleted)

### Initialization

- Add `tauri-plugin-sql` to `src-tauri/Cargo.toml`
- Register the plugin in `run()` alongside existing plugins
- Place migration SQL in `src-tauri/migrations/001_create_history.sql`
- The migration system ensures idempotent table creation; future schema changes go in numbered migration files

### Design decisions

- Rust does NOT parse `result_json` — it stores and retrieves opaque JSON strings. This avoids duplicating TypeScript type definitions in Rust.
- The `analyzed_at` timestamp is set server-side (Rust layer) at insert time, ensuring consistency regardless of frontend clock.

## Frontend Layer

### IPC functions (`src/lib/ipc.ts`)

Four new functions mirroring the Rust commands:

```typescript
saveAnalysisRecord(params: SaveAnalysisParams): Promise<number>
getAnalysisHistory(params: HistoryQuery): Promise<AnalysisRecordSummary[]>
getAnalysisDetail(id: number): Promise<AnalysisRecord>
deleteAnalysisRecords(ids: number[]): Promise<number>
```

Browser dev mode returns mock data, consistent with existing IPC functions.

### Types (`shared/types.ts`)

```typescript
interface AnalysisRecordSummary {
  id: number;
  symbol: string;
  analyzedAt: number;
  type: 'ai' | 'deep' | 'quant' | 'backtest';
  resultJson: string;
  stockInfoJson: string | null;
}

interface AnalysisRecord extends AnalysisRecordSummary {
  newsJson: string | null;
}

interface SaveAnalysisParams {
  symbol: string;
  analysisType: 'ai' | 'deep' | 'quant' | 'backtest';
  resultJson: string;
  stockInfoJson?: string;
  newsJson?: string;
}

interface HistoryQuery {
  symbol: string;
  analysisType?: 'ai' | 'deep' | 'quant' | 'backtest';
  limit?: number;
  offset?: number;
}
```

### Hook: `useAnalysisHistory(symbol: string)`

Located at `src/hooks/useAnalysisHistory.ts`:

- Loads the history record list for the given symbol (reverse chronological, paginated)
- Exposes: `records`, `loading`, `loadMore()`, `remove(ids: number[])`
- Uses `useRef` + force-render pattern consistent with `useAIAnalysis` / `useDeepAnalysis`
- Cache keyed by symbol (same `Map<string, ...>` pattern as other hooks)

### Auto-save integration

Auto-save is orchestrated in `Dashboard.tsx` (not inside individual hooks), because Dashboard is the only place that has all context: `symbol`, `stockInfo`, `news`, and the analysis results. Each hook only knows its own slice.

A `useEffect` in Dashboard watches for analysis completion (e.g. `record` changing in `useAIAnalysis`, `result` in `useDeepAnalysis`, etc.) and calls `saveAnalysisRecord` fire-and-forget (failure logs to console, does not block user flow).

| Trigger | When | Type | Includes `newsJson`? |
|---------|------|------|---------------------|
| `useAIAnalysis.record` changes | AI analysis completes | `'ai'` | Yes |
| `useDeepAnalysis.result` changes | Deep analysis completes | `'deep'` | Yes |
| `useQuantData.quant` changes | Quant data ready | `'quant'` | No |
| Backtest result changes | Backtest completes | `'backtest'` | No |

Each save includes `stockInfoJson` (from current `StockInfo`). Deduplication: skip save if the latest record for the same `(symbol, type)` has an `analyzedAt` within the last 60 seconds — prevents double-saves from React strict mode or rapid re-renders.

### UI: `AnalysisHistory` component

Located at `src/components/AnalysisHistory/`:

**Entry point**: A clock icon button in the top-right of `AnalysisPanel`. Clicking it toggles the history panel.

**Timeline list**:
- Records displayed in reverse chronological order
- Each entry shows: analysis type badge (AI / Deep / Quant / Backtest), relative timestamp ("3 hours ago"), key metric summary (e.g. rating score, signal direction, composite score)
- Lazy pagination via "Load more" at bottom

**Detail modal**:
- Clicking a record opens a modal with the full analysis result
- Reuses existing display components in read-only mode: `AnalysisPanel` result section, `QuantScoreCard`, `RiskCard`, `ValuationCard`, `BacktestPanel`
- Shows the `StockInfo` and news snapshot from the time of analysis

**Delete**:
- Checkbox selection on each record
- "Delete selected" button with confirmation
- Refreshes the list after deletion

### Design decisions

- No new page or route — embedded within the existing `AnalysisPanel` area, preserving the single-page architecture
- Detail modal reuses existing result components to avoid duplicate rendering logic
- Timeline list loads summaries only (no `news_json`); full data fetched on detail open

## Testing Strategy

### Rust tests

- Migration SQL creates table correctly (in-memory SQLite)
- `save_analysis_record` → `get_analysis_history` read/write roundtrip
- `get_analysis_history` pagination and type filtering
- `delete_analysis_records` removes records

### Frontend tests

- `useAnalysisHistory` hook: mock IPC returns, verify `records` state, `loadMore` pagination, `remove` list refresh
- Auto-save integration: verify `useAIAnalysis.analyze()` success triggers `saveAnalysisRecord` call
- `AnalysisHistory` component: timeline list rendering, detail modal open, multi-select delete interaction

### Not tested

- `tauri-plugin-sql` internals
- SQLite engine SQL semantics

## File changes summary

### New files
- `src-tauri/migrations/001_create_history.sql`
- `src/hooks/useAnalysisHistory.ts`
- `src/components/AnalysisHistory/index.tsx`
- `src/components/AnalysisHistory/HistoryTimeline.tsx`
- `src/components/AnalysisHistory/HistoryDetailModal.tsx`
- Tests for all of the above

### Modified files
- `src-tauri/Cargo.toml` — add `tauri-plugin-sql` dependency
- `src-tauri/src/lib.rs` — register plugin, add 4 commands
- `shared/types.ts` — add history-related types
- `src/lib/ipc.ts` — add 4 IPC functions
- `src/lib/dev-mocks.ts` — add mock data for history
- `src/components/Dashboard.tsx` — add auto-save effects for all analysis types
- `src/components/AnalysisPanel.tsx` — add history button entry point
