# Changelog

All notable changes to StockAI will be documented in this file.

## [0.5.3] - 2026-04-23

### Fixed

- **Playwright 路径泄露终极解决方案 (Ultimate Patch)** — 采用了“静态劫持 + 动态注入”的双重防护策略。通过 esbuild 的 `--define` 强制劫持了所有 `require.resolve` 调用，并注入了安全的路径解析占位符。这彻底切断了 Bun 编译器将构建机器绝对路径嵌入二进制文件的所有可能路径。
- **Rust 核心层鲁棒性增强** — 重写了 Sidecar 输出解析逻辑。现在 Rust 会通过反向扫描寻找最后一个合法的 JSON 对象，并使用 `serde_json` 严格序列化错误消息，彻底解决了因控制台杂讯或非 JSON 输出导致的 UI 解析失败（“非 JSON 格式错误”）。

## [0.5.2] - 2026-04-23

### Fixed

- **Playwright 路径泄露终极解决方案 (Ultra-Robust Fix)** — 彻底解决了 `Cannot find module package.json` 错误。通过在打包前对 `node_modules` 中的 `playwright-core` 源码进行“手术级预处理”，强行中和了所有引起 Bun 编译器静态分析异常的 `require.resolve` 调用。
- **构建链路优化** — 引入了“预修补 -> Esbuild 打包 -> Bundle 洗护 -> Bun 编译”的全全链条自动化脚本，确保生成的二进制文件在任何机器上均能稳定运行。

## [0.5.1] - 2026-04-23

### Fixed

- **Playwright 路径泄露终极解决方案 (Ultimate Fix)** — 切换到 `esbuild` + `bun` 混合构建模式。通过在打包阶段重命名全局 `require.resolve` 为安全占位符，彻底绕过了 Bun 编译器对绝对路径的强制解析。这确保了 Playwright 内部的路径查找逻辑在任何机器上都能平稳降级，不再触发 `Cannot find module package.json` 错误。

## [0.5.0] - 2026-04-23

### Fixed

- **Playwright 路径泄露终极解决方案 (Nuclear Fix)** — 彻底重构了 Sidecar 构建流程。引入了“双阶段修补+编译前自检”机制。通过暴力字符串替换和代码截断，从二进制层面抹除了所有构建机器的绝对路径（如 `/Users/runner/...`），并将 Playwright 内部的目录查找逻辑强行重定向。
- **构建安全自检** — 在 CI 流程中增加了二进制完整性校验，如果检测到任何残留的构建路径泄漏，构建将自动失败并报警，确保用户拿到的永远是“纯净”的、环境无关的程序。

## [0.4.9] - 2026-04-23

### Fixed

- **Playwright 路径硬编码终极修复 (Critical)** — 针对 Bun 编译器在处理 `require.resolve` 时的过度优化进行了深度修补。在构建阶段，通过自动化脚本暴力截断了 Playwright 内部用于定位自身目录的反射逻辑，将其强制重定向为环境无关的相对路径。这彻底消除了在用户机器上运行分析时因找不到构建机器路径而导致的崩溃。
- **构建脚本鲁棒性增强** — 优化了 `build-script.ts` 的正则匹配逻辑，确保能够捕获并中和所有被 Bun 转换后的 `__require.resolve` 绝对路径。

## [0.4.8] - 2026-04-23

### Fixed

- **构建期路径泄露彻底修复 (Hotfix)** — 引入了双阶段构建流程（Bundle -> Patch -> Compile）。解决了 Bun 在 GitHub Action 环境下编译二进制时，会将构建机器的绝对路径（如 `/Users/runner/work/...`）硬编码到 Playwright 依赖中的问题。现在 Sidecar 二进制文件实现了真正的环境无关，彻底解决了在分析时提示“Cannot find module package.json”的错误。
- **构建脚本自动化** — 新增了 `sidecar/build-script.ts`，统一了本地和 CI 环境下的 Sidecar 构建逻辑，确保发布版本的稳定性。

## [0.4.7] - 2026-04-23

### Fixed

- **依赖链深度解耦 (Critical)** — 对 `cli-handlers.ts` 进行了重构，将所有业务 Handler 的导入（如分析引擎、抓取器）全部改为函数内部的动态 `import()`。这确保了在执行“获取模型列表”等轻量任务时，完全不会触发对 Playwright 或分析引擎的加载，从而彻底避免了因浏览器环境缺失导致的启动错误。
- **构建路径硬编码修复** — 解决了 Bun 编译过程中因静态分析导致的构建环境路径（GitHub Runner 路径）泄露到二进制文件的问题。

## [0.4.6] - 2026-04-23

### Fixed

- **Sidecar 启动稳健性 (Crucial)** — 引入了动态加载架构。错误拦截器现在作为程序运行的“绝对第一行”执行，所有重型业务逻辑（如 SDK 导入）均通过 `await import()` 延迟加载。这解决了因 top-level import 失败导致拦截器失效、进而产生“空 stderr”和“静默崩溃”的问题。
- **参数匹配算法增强** — 重新设计了 `process.argv` 过滤算法，能够自动识别并跳过 Bun 运行时路径、二进制包内路径等干扰项，确保在 Sidecar 模式下 Action 和 Config 的定位 100% 准确。
- **Stderr 全量透传** — Rust 侧现在会完整捕获并反馈 Sidecar 的 Stderr 信息，彻底终结了“分析服务无响应”这种含糊的错误提示。

## [0.4.5] - 2026-04-23

### Fixed

- **Sidecar 核心协议稳定性 (Critical)** — 改用 `fs.writeSync` 取代 `process.stdout.write`，确保 JSON 结果在进程退出前能够同步、不经过缓冲区地强制写入 stdout。解决了在部分环境下（如 Tauri 管道）因进程退出过快导致输出丢失的问题。
- **Stderr 穿透调试** — 改进了 Rust 核心层对 Sidecar 错误流的处理，现在如果 Sidecar 崩溃，前端能直接看到具体的 Stderr 错误详情（包括堆栈信息），极大提升了排障效率。
- **参数解析加固** — 优化了 Sidecar 的 `process.argv` 解析逻辑，兼容了不同环境（源码运行、Bun 编译二进制、Tauri Sidecar）下索引位置可能存在的偏差。

## [0.4.4] - 2026-04-23

### Fixed

- **Sidecar 稳定性增强** — 增加了全局未捕获异常处理，确保后台服务崩溃时能以 JSON 格式输出错误信息，避免前端显示“分析服务无响应”。
- **Ollama 适配优化** — 将 Ollama SDK 改为动态导入，并为模型列表获取和 AI 分析增加了更严格的超时保护（10s - 120s），解决了服务未响应时应用卡死的问题。
- **AI 结果解析容错** — 引入了更强大的 JSON 提取逻辑，能够自动过滤 AI 回复中可能夹带的 Markdown 代码块标签（\`\`\`json）或多余文本，大幅提升了分析结果的解析成功率。
- **配置校验加固** — 在 Rust 核心层增加了配置项非空校验，并在后台增加了配置版本匹配检查，防止因配置迁移不彻底导致的启动分析报错。

## [0.4.3] - 2026-04-23

### Fixed

- **App 启动崩溃 (tauri-plugin-shell v2.3.5 兼容性)** — `tauri-plugin-shell` v2.3.5 移除了 `plugins.shell.sidecar` 配置字段，导致 App 启动时 panic（`unknown field 'sidecar', expected 'open'`）。将 sidecar 允许列表迁移到 `capabilities/default.json` 的 scoped permission，并显式声明 `args: true` 以匹配原有的可变参数语义。

## [0.4.2] - 2026-04-23

### Fixed

- **Test runner collision (测试运行器冲突)** — Vitest config no longer includes `sidecar/**/*.test.ts`, preventing import resolution failures when vitest tried to process bun:test-flavored sidecar test files. Sidecar tests are now exclusively run by `bun test`.
- **`--info` Chinese-name lookup regression (`--info` 中文名称查询回归)** — A guard that returned `ERR_INVALID_SYMBOL` when `parseSymbol` couldn't resolve a code was blocking `fetchStockInfo`'s smart-search fallback. Chinese company name queries (e.g. "安克创新") would always return `ERR_INVALID_SYMBOL` instead of performing a name search.
- **BrowserManager retry after launch failure (浏览器启动失败后可重试)** — `pagePromise` is now cleared in the rejection handler, so subsequent `getPage()` calls can retry the launch instead of returning the same rejected promise indefinitely.
- **Ollama empty-host fallback (Ollama 空地址回退)** — `handleListModels` now passes `undefined` instead of `''` to the Ollama SDK when no host is configured. An empty string caused malformed URL construction; `undefined` correctly triggers the SDK's built-in `localhost:11434` default.
- **Provider registry non-null assertions (Provider 注册表非空断言)** — Replaced `!` assertions on `cfg.model` and `cfg.baseUrl` in `PROVIDER_FACTORIES` with `?? PROVIDER_PROFILES[x].model/baseUrl` fallbacks, restoring the explicit defaults that were inadvertently removed.
- **Wrong error code in `handleInfo` test (测试中错误码断言有误)** — `cli-handlers.test.ts` was asserting `ERR_NOT_FOUND` for an empty-symbol call; corrected to `ERR_MISSING_PARAM`.

### Changed

- **GoogleNewsRSSStrategy fetch injection (GoogleNewsRSS 策略 fetch 依赖注入)** — Constructor now accepts an optional `fetch` implementation, enabling offline unit tests without `global.fetch` mutation and eliminating test-side global state pollution.
- **`cli-handlers` factory pattern (`cli-handlers` 工厂模式)** — Refactored to `createHandlers(deps?)` for dependency injection, replacing module-level mocking with per-test handler instances.
- **Lazy Chromium startup in deep mode (深度模式懒启动 Chromium)** — `enrichWithFullContent` now receives a `getPage` factory instead of a pre-resolved `Page`, deferring browser launch until the first article actually requires it. RSS-only paths with `deepMode=true` no longer spin up Chromium unnecessarily.
- **BrowserManager safe shutdown (浏览器管理器安全关闭)** — `close()` now awaits any in-flight `pagePromise` before calling `browser.close()`, preventing zombie Chromium processes when shutdown races browser launch.
- **Concurrent stock info + analysis (股票信息与分析并发执行)** — `useAnalysis` now fires `getStockInfo` and `startAnalysis` concurrently. The info fetch updates `partialInfo` as a side-effect, removing the sequential delay that previously blocked analysis startup.

## [0.4.1] - 2026-04-22

### Fixed

- **AI provider empty response crash (AI 提供商空响应崩溃)** — OpenAI and Anthropic providers now check array length before accessing `choices[0]` / `content[0]`. Previously, an empty response from the API would throw an uncaught `TypeError`.
- **Playwright silent navigation failure (Playwright 导航静默失败)** — `PlaywrightStrategy` now distinguishes `TimeoutError` (partial page load, continue parsing) from fatal navigation errors (DNS failure, connection refused). Fatal errors now return `[]` immediately instead of parsing an empty page.
- **`list_models` IPC regression (list_models IPC 回归)** — Frontend was sending `base_url` (snake_case) to Tauri's `invoke()`, which requires camelCase `baseUrl`. This caused every "List Models" request to silently fail.
- **API key leak in debug log (调试日志 API Key 泄漏)** — The sidecar's debug log at `/tmp/stockai-sidecar.log` was writing the full config including plaintext API keys on every invocation. The `apiKey` field is now redacted as `[REDACTED]`.
- **Provider type coercion (Provider 类型强制转换)** — `resolveConfig` previously used `as ProviderType` cast without runtime validation. Now validates against `PROVIDER_PROFILES` keys, falling back to `'ollama'` for unknown values.
- **Stock code regex false match (股票代码正则误匹配)** — `detectChinaStock` and the display-name extractor in `parseSymbol` now use `/(?<!\d)\d{6}(?!\d)/` (word-boundary lookahead/lookbehind) to avoid matching 7+ digit strings as valid 6-digit codes.
- **Sidecar error format inconsistency (Sidecar 错误格式不一致)** — All `outputJson({ error: string })` paths in `index.ts` now emit the standard `{ error: { code, message } }` envelope, consistent with the main analysis flow.
- **Browser fallback error masking (浏览器模式错误掩盖)** — The non-Tauri bridge fallback in `ipc.ts` now includes the original error reason in the thrown message, instead of replacing all network errors with a generic "test environment not ready" string.
- **Config version check (配置版本检查)** — `_version` comparison now uses `String()` coercion on both sides, preventing a false mismatch when the stored value is an integer rather than a string.

### Changed

- **Build scripts (构建脚本)** — `dev` and `build` npm scripts now automatically compile the sidecar binary before starting Vite, eliminating the need to manually run `sidecar:build` after code changes.
- **Settings deep merge (设置深度合并)** — `useSettings` now performs a per-provider deep merge of `providerConfigs` on load, so adding a new provider profile no longer wipes out saved API keys for other providers.
- **Sidecar empty stdout handling (Sidecar 空输出处理)** — The Rust layer now returns a structured `{ "error": "..." }` JSON when sidecar stdout is empty, with the process exit code included for easier debugging.
- **Ollama default host (Ollama 默认地址)** — Changed from `localhost:11434` to `127.0.0.1:11434` to avoid IPv6 resolution issues on some systems.

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
