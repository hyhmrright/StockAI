# Changelog

All notable changes to StockAI will be documented in this file.

## [0.4.0] - 2026-04-20

### Added

- **Real-time quotes in search suggestions (实时搜索建议行情)** — The search dropdown now integrates live price and change% for each stock. Powered by Sina Finance batch quote API for instantaneous market feedback as you type.
- **Enhanced smart search fallback (智能搜索回退增强)** — `getStockInfo` now supports searching by name. If the input is not a standard ticker, the system automatically finds the best match and retrieves its data.

### Changed

- **Search result schema (搜索结果数据结构)** — `StockSearchResult` extended with optional `price`, `change`, and `changePercent` fields.
- **Sidecar search logic (Sidecar 搜索逻辑)** — `searchStocks` now performs parallel fetching for suggestions and real-time quotes, merging them before returning to the UI.
- **UI layout optimization (UI 布局优化)** — Search suggestions now use a space-between layout with improved visual clarity and red/green color coding for price changes.

### Fixed

- **US ticker parsing (美股代码解析)** — Improved `parseSymbol` logic to recognize a wider variety of US ticker formats.
- **Smoke test stability (冒烟测试稳定性)** — Refined unknown symbol validation in smoke tests to align with the current service contract.

## [0.3.0] - 2026-04-17

### Changed (breaking internal refactor — no user-visible API changes)

- **Settings schema 单一真源** — 移除 Rust 层 `AppSettings`/`ProviderConfig` 结构体；Rust 现在把 `app_settings` 作为 `serde_json::Value` 透传给 Sidecar，由 `configResolver.ts` 负责版本校验与字段解析。先前同一 schema 在前端 TS / Rust / Sidecar 三处重复定义，新增字段易漏同步。
- **Provider 档案合并** — 原本分散在 `PROVIDER_DEFAULTS`（baseUrl+model）、`CONTENT_LIMITS`（截断）、`TIMEOUTS`（超时）三处的 provider 配置统一合并为 `PROVIDER_PROFILES: Record<ProviderType, ProviderProfile>`。新增 Provider 时 TypeScript 会强制补齐所有字段。
- **Sidecar 共享类型路径统一** — 删除 `sidecar/types.ts` 桥接文件；所有 Sidecar 代码直接从 `../shared/types` 导入 `StockNews` / `AIAnalysisResult`。消除"两条等价导入路径"的歧义。
- **Chromium 懒启动** — `scraper.ts` 现在通过 `ScrapeContext.getPage()` 延迟启动浏览器。A 股 RSS 成功 + `deepMode=false` 的路径完全跳过 Chromium 启动（省 1-3s）。
- **Strategy 接口与实现分离** — `base.ts` 拆分为 `interface ScrapeStrategy`（所有策略）+ `abstract class PlaywrightStrategy`（模板方法）。`GoogleNewsRSSStrategy` 不再继承 `ScrapeStrategy` 并伪装 `getUrl()` 返回空串——现在直接实现接口，消除 Liskov 违规。
- **符号归一化独立模块** — `StrategyRegistry.getEnhancedSymbol` 移至 `sidecar/symbol.ts`，让策略注册表只负责策略排序。
- **内容提取独立模块** — `scraper.ts` 中的 `extractFullContent` / `heuristicContentExtraction` / `htmlToMarkdown` 拆到 `sidecar/content-extractor.ts`，让 `scraper.ts` 只剩编排。
- **Provider 类暴露 `kind` 字段** — `AIProvider` 接口新增 `readonly kind: ProviderKind`，使工厂派发结果可被单测断言（先前只能验证"有 analyze 方法"）。
- **System prompt 集中化** — 原来三个 provider 各自硬编码 system prompt，现在统一使用 `prompts.ts` 的 `SYSTEM_PROMPT` 常量。

### Added

- **5 个新测试文件** — `sidecar/symbol.test.ts`、`sidecar/content-extractor.test.ts`、`sidecar/stock-info.test.ts`、`sidecar/strategies/registry.test.ts`，以及 `sidecar/parsers/exchange.test.ts` 的 `parseSymbol` 用例补全。测试总数从 57 增至 82。
- **`performFullAnalysis` 依赖注入** — 新增可选 `deps` 参数接受 scrape / fetchInfo / enhance / createProvider 的 mock，替代 `mock.module()` 全局替换，解决 bun:test 跨文件 mock 状态泄漏。

### Fixed

- **API Key 误导性提示** — 设置界面的"本地加密存储"改为"仅存储在本地应用数据目录"。tauri-plugin-store 默认不加密，原提示可能让用户误判安全边界。
- **Smoke-test 错误降级阶段** — 原测试断言一个已删除的 mock 错误消息，导致 phase 4 永远失败。改为验证"未知 symbol 返回空数组"的真实行为契约。

## [0.2.3] - 2026-04-10

### Fixed

- **Settings version display** — Settings panel now shows the real app version read from `tauri.conf.json` via `getVersion()` API instead of the hardcoded `v0.1.3` string.
- **A-share code-only search (zero results)** — Root cause identified: Google's headless-browser CAPTCHA blocked all Playwright-based Google News search results. Fix: A-share queries now use the Google News RSS feed (no JavaScript required, no CAPTCHA). RSS returns up to 40 articles per search.
- **A-share GBK encoding** — Sina Finance API (`hq.sinajs.cn`) returns GBK-encoded text; `resp.text()` decoded it as UTF-8, producing garbled company names. Fixed by reading `arrayBuffer()` and decoding with `TextDecoder('gbk')`.
- **Config version migration** — When settings stored in the old format (missing `_version`) are loaded, the migrated settings are now written back to the store so that the Rust layer reads the correct version on analysis. Previously only React state was updated.
- **Empty stdout fallback** — If the sidecar produces no stdout output (crash or hang), the Rust layer now returns a structured `{"error":"..."}` JSON instead of an empty string, preventing the generic "分析服务无响应" error from masking the real cause.

### Changed

- **A-share news strategy** — For A-share pure-code inputs (e.g. `300866`), the sidecar now fetches the company name from Sina Finance first, then passes `"公司名+code"` to the scraper so the RSS query uses `"公司名" 股票` (exact-match, high hit rate).
- **`extractExternalLinks`** — Two-pass regex scan (direct links + Google redirects) merged into a single-pass alternation regex for cleaner code.
- **`todayISO()` utility** — Extracted shared `new Date().toISOString().split('T')[0]` pattern to `sidecar/utils.ts`.

## [0.2.2] - 2026-04-10

### Fixed

- **A 股纯代码搜索零命中** — 用户仅输入 6 位代码（如 `300866`）时，搜索词由 `"300866" 股票 新闻`（精确匹配）改为 `300866 股票 新闻`（宽松匹配）。中文财经新闻标题几乎不出现纯数字代码，加引号导致搜索零结果；有股票名称时（如 `隆基绿能601012`）仍使用精确匹配。
- **Sidecar binary 过期** — 重新编译 binary，使其包含 v0.2.1 中所有已提交的修复（configResolver、outputJson guard、logger 统一等）。

## [0.2.1] - 2026-04-10

### Added

- **`sidecar/analysis.test.ts`** — Unit tests for `performFullAnalysis`: normal path, empty news guard, non-blocking `stockInfo` failure, and AI fallback degradation (rating 50 / neutral)
- **`src/lib/ipc.test.ts`** — Unit tests for `parseAnalysisResponse` covering all validation branches: valid response, empty/whitespace input, `error` field propagation, malformed `rating`, non-array `news`, missing `analysis` field

### Fixed

- **stdout single-write guard** — Sidecar now throws `[PROTOCOL]` on double `outputJson()` calls; Rust layer uses last-non-empty-line extraction to tolerate any spurious output
- **DOM content selector** — Fallback container ranking now sorts by paragraph count first (correctness fix), with text length as tiebreaker; paragraph counts are cached to avoid O(n²) DOM traversal
- **Dead code removal** — Removed `NVDA_REAL` / `FAIL` test fixture branches from production `scraper.ts`; removed unused `strategies/utils.ts`

### Changed

- **Config versioning** — `CONFIG_VERSION = "2"` added; sidecar throws on version mismatch rather than silently misreading fields; frontend stamps version on every save with one-time legacy migration
- **IPC abstraction** — `startAnalysis()` returns `FullAnalysisResponse` directly; all JSON parsing, error extraction, and schema validation centralized in `ipc.ts`
- **Provider registry** — Replaced `switch/case` with `PROVIDER_FACTORIES` data map; unknown provider types now emit a warning before falling back to OpenAI
- **Logger unification** — All `console.error()` calls replaced with structured `logger` across sidecar, analysis, and all AI providers
- **`performFullAnalysis` decomposed** — Split into `fetchMarketData` (parallel stock info + news) and `analyzeWithAI` (AI call with fallback)
- **Browser config centralized** — `BROWSER_LAUNCH_ARGS` and `BROWSER_CONTEXT_DEFAULTS` extracted to `sidecar/config.ts`; `playwright-core` pinned to exact version `1.59.1`

## [0.2.0] - 2026-04-10

### Added

- **Sidecar bridge** (`scripts/sidecar-bridge.ts`) — HTTP bridge server for E2E and browser-based testing; allows the UI to call the real sidecar binary without Tauri.
- **`sidecar/utils.ts`** — Extracted shared utility functions (timeout wrapper, error normalization) used across sidecar modules.

### Changed

- **Rust layer simplified** — Tauri core is now a transparent proxy: reads config and spawns the sidecar, with all business logic moved to the sidecar. `lib.rs` reduced from ~200 lines to ~80 lines.
- **Shared constants** — Provider default URLs and model names consolidated in `shared/constants.ts`, eliminating duplication between frontend and sidecar.
- **Scraper robustness** — Strategy base interface extended with result validation; scrapers now retry and fall back gracefully on partial failures.
- **Prompt improvements** — Analysis prompt restructured for clearer output and more consistent sentiment scoring.

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
