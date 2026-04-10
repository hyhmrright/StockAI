# Changelog

All notable changes to StockAI will be documented in this file.

## [0.2.0] - 2026-04-10

### Changed

- **Rust layer simplified** — Tauri core is now a transparent proxy: reads config and spawns the sidecar, with all business logic moved to the sidecar. `lib.rs` reduced from ~200 lines to ~80 lines.
- **Shared constants** — Provider default URLs and model names consolidated in `shared/constants.ts`, eliminating duplication between frontend and sidecar.
- **Scraper robustness** — Strategy base interface extended with result validation; scrapers now retry and fall back gracefully on partial failures.
- **Prompt improvements** — Analysis prompt restructured for clearer output and more consistent sentiment scoring.

### Added

- **Sidecar bridge** (`scripts/sidecar-bridge.ts`) — HTTP bridge server for E2E and browser-based testing; allows the UI to call the real sidecar binary without Tauri.
- **`sidecar/utils.ts`** — Extracted shared utility functions (timeout wrapper, error normalization) used across sidecar modules.

## [0.1.3] - 2026-04-09

### Added

- **Multi-provider AI support** — Added Anthropic Claude and DeepSeek providers; settings panel redesigned as a dropdown with independent per-provider config storage
- **Google News search strategy** — New primary scrape strategy that searches Google News by stock name/code, fixing zero-result failures for small-cap A-shares (e.g. STAR Market 688xxx) that have no Google Finance quote page
- **Stock info card** — Displays exchange label (STAR Market / SSE / SZSE / BSE), stock name, latest price, and change% above analysis results
- **Mixed-format input** — Accepts inputs like "锴威特688693"; automatically extracts the Chinese display name and 6-digit code
- **Sina Finance API** — Fetches real-time A-share price data (price, change, change%) from `hq.sinajs.cn`

### Fixed

- **Silent analysis failure** — Fixed compiled Bun sidecar not flushing stdout buffer when connected to a pipe (`process.exit()` skips flush in full-buffered mode)
- **Rust stdout race condition** — Removed `break` on `Terminated` event to drain all pending stdout events before the loop exits

### Changed

- Default AI provider changed to Ollama (`qwen3.5:9b`)

## [0.1.2] - 2026-04-09

### Improved

- **Architecture refactor** — Shared type definitions (`shared/types.ts`) as single source of truth across frontend and sidecar; eliminated 3 duplicate interface definitions
- **JSON config passing** — Rust→Sidecar config injection changed from fragile positional CLI args to single JSON parameter; adding new config fields now requires changes in 2 files instead of 4+
- **Provider factory** — AI provider creation moved to `providers/registry.ts` factory; `analysis.ts` no longer imports concrete providers
- **Unified error handling** — Extracted `toErrorMessage()` utility; all error catch blocks use type-safe `instanceof` checks instead of `as any`
- **Centralized config** — Magic numbers (timeouts, content limits, model defaults) consolidated in `sidecar/config.ts`
- **Runtime validation** — Sidecar JSON responses validated before rendering; malformed AI output now shows clear error message
- **Component extraction** — Dashboard (207→140 lines), SettingsModal (177→140 lines) via AnalysisPanel and ProviderSelector components
- **Shared FormInput** — OpenAI/Ollama settings forms share a common input component
- **Store singleton** — `src/lib/store.ts` ensures all hooks share one store instance with retry-on-failure
- **OllamaForm debounce** — Model list fetch debounced (500ms) to prevent IPC spam on every keystroke
- **PriceChart placeholder** — Replaced misleading hardcoded mock data with honest "coming soon" placeholder

### Fixed

- **`page.evaluate` compiled binary bug** — Inline arrow function for Playwright evaluate to prevent breakage in Bun-compiled sidecar binary
- **Settings migration** — `model→provider` field rename with backward-compatible migration that persists to store
- **Default aiModel mismatch** — Fixed default Ollama model name being used with OpenAI provider

### Added

- **Test suite expansion** — 12→34 unit tests (exchange detection, provider factory, withTimeout, sad-path validation, HTML resilience)
- **Integration test isolation** — Flaky scraper test renamed to `.integration.ts`, excluded from default `bun test` (86s→82ms)
- **SentimentBar data-testid** — Tests decoupled from Tailwind CSS class names

### Removed

- Dead `AnalysisPayload` export and unused `canHandle()` from ScrapeStrategy interface

## [0.1.1] - 2026-04-06

### Fixed

- **A-share support** — Google Finance and Yahoo Finance now correctly resolve Shanghai (SHA/.SS), Shenzhen (SZE/.SZ), and Beijing BSE (BJS/.BJ) exchanges; Chinese stock codes like `601012` or `隆基绿能601012` no longer cause JSON parse errors
- **Editable watchlist** — watchlist now supports add/remove with persistence via `tauri-plugin-store`; previously hardcoded and read-only
- **Functional settings toggles** — "Auto Analyze" and "Deep Mode" toggles in General Settings now save state and take effect
- **Deep mode wired end-to-end** — `deepMode=false` now skips full article extraction for faster analysis; the setting flows from UI → Rust → Sidecar CLI args
- **Error propagation** — sidecar errors are now returned as structured JSON to the frontend instead of silently discarding stdout

### Changed

- Removed `-alpha` label; the core pipeline is stable

## [0.1.0] - 2026-04-06

### Added

- **Core analysis pipeline** — full end-to-end flow: stock symbol input → news scraping → AI analysis → scored result
- **Multi-source scraping** — Playwright-based scraper with Strategy pattern supporting Google Finance and Yahoo Finance; extracts full article body for the first 3 results
- **AI provider support** — OpenAI (GPT-4o default) and Ollama (local models) via pluggable `AIProvider` interface
- **Dashboard UI** — three-column layout with Watchlist, Search/Analysis panel, and results
- **PriceChart** — interactive price chart powered by lightweight-charts
- **SentimentBar** — bullish/bearish visual indicator
- **Settings modal** — per-provider configuration (API key, base URL, model name) persisted locally via `tauri-plugin-store`
- **Config injection** — Tauri core reads `settings.json` and injects config into Sidecar via CLI args at runtime
- **News body extraction** — deep content fetch for richer AI analysis context
- **Persistent settings** — all API configurations stored locally, never leaves the device

### Infrastructure

- GitHub Actions CI — cross-platform build validation (macOS ARM64, Ubuntu 24.04, Windows)
- GitHub Actions Release — automated installer builds triggered on version tags
- Pre-push hooks via lefthook — TypeScript type-check before every push
- Multi-layer test suite — Vitest (frontend), Bun test (sidecar unit), Cargo test (Rust)

### Architecture

- Clean Architecture with unidirectional dependency flow: UI → Tauri Core (Rust) → Sidecar (Bun)
- Sidecar communicates via stdout JSON; stderr reserved for debug logs
- Anti-Corruption Layer via DTOs in `src/lib/api-types.ts`
