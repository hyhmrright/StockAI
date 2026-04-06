# Changelog

All notable changes to StockAI will be documented in this file.

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
