# Price Alerts — Design Spec

> Sub-project 3 of 3: Push Notifications / Price Alerts
> Sub-project 1: Analysis History (done) | Sub-project 2: Stock Screener (done)

## Overview

Desktop notifications when a watchlist stock's price crosses user-defined upper or lower bounds. Reuses existing `useRealtimeQuote` polling (10s interval during trading hours).

## Architecture

Frontend-only feature. No new backend code. Uses Tauri's notification API (`@tauri-apps/plugin-notification`) for system notifications.

## Data Model

Alert configs are persisted via `tauri-plugin-store` alongside the watchlist:

```typescript
interface PriceAlert {
  symbol: string;
  upperLimit?: number;  // 触发上限
  lowerLimit?: number;  // 触发下限
  enabled: boolean;
}
```

Stored under key `"price_alerts"` in `settings.json` as `Record<string, PriceAlert>`.

## Hook: `usePriceAlerts`

Located at `src/hooks/usePriceAlerts.ts`:

- Loads/saves alert configs from store (same pattern as `useWatchlist`)
- `setAlert(symbol, upperLimit?, lowerLimit?)`: create or update alert
- `removeAlert(symbol)`: delete alert
- `alerts`: `Record<string, PriceAlert>`

## Alert Checking: `useAlertMonitor`

Located at `src/hooks/useAlertMonitor.ts`:

- Takes `alerts` and watches the watchlist items
- For each symbol with an active alert, polls the quote via `fetchRealtimeQuote`
- When price crosses a threshold, fires a desktop notification and marks that direction as "fired" to avoid repeat notifications
- Reset logic: when price returns within bounds, re-arm the alert for that direction
- Poll interval: reuse the existing 10s cycle, piggyback on trading hours check

## Notification

Use `@tauri-apps/plugin-notification`:
- Install npm package and Rust plugin
- Notification title: "StockAI 价格提醒"
- Body: "AAPL 突破上限 $200.00，当前 $201.50"

## UI

Each watchlist item gets a bell icon button. Clicking opens a tiny inline form:
- Upper limit input (optional)
- Lower limit input (optional)
- Enable/disable toggle
- Active alerts show a small colored dot on the bell icon

## Testing

- `usePriceAlerts` hook: mock store, verify CRUD operations
- `useAlertMonitor` hook: mock quote fetcher, verify alert firing and re-arming
- No component tests needed — UI is minimal inline form

## File Changes

### New files
- `src/hooks/usePriceAlerts.ts`
- `src/hooks/usePriceAlerts.test.ts`
- `src/hooks/useAlertMonitor.ts`
- `src/hooks/useAlertMonitor.test.ts`
- `src/components/AlertConfig.tsx`

### Modified files
- `package.json` — add `@tauri-apps/plugin-notification`
- `src-tauri/Cargo.toml` — add `tauri-plugin-notification`
- `src-tauri/capabilities/default.json` — add `notification:default`
- `src-tauri/src/lib.rs` — register notification plugin
- `src/components/Watchlist.tsx` — add bell icon + AlertConfig per item
