# StockAI Architecture

Three-layer architecture with strictly unidirectional dependencies: **UI → Tauri Core (Rust) → Sidecar (Bun)**

## 0. 跨层契约（`shared/`）

`shared/` 是三层唯一的共享来源，四个入口：

| 文件 | 内容 |
|------|------|
| `shared/types/` | 全部 DTO，按界限上下文分文件（`envelope` / `provider` / `stock` / `quant` / `chat` / `masters` / `backtest` / `screener` / `history`），`shared/types/index.ts` 是 barrel。**调用方一律 `from '../shared/types'`，不要直接 import 子文件**——子文件划分是内部组织，barrel 才是对外契约。 |
| `shared/actions.ts` | Sidecar CLI 动作清单（见 §4），三层布线的单一来源 |
| `shared/constants.ts` | `PROVIDER_PROFILES` / `STATIC_MODELS` / 默认大师列表等 |
| `shared/market.ts` | `detectMarket` 函数 |

前端与 Sidecar 各自 re-export，**不得在各层重复定义**。

## 1. Frontend (`src/`)

React + TypeScript + Vite。唯一 IPC 入口是 `src/lib/ipc.ts`，它按 `shared/actions.ts` 的清单组装 argv 后调用 Rust 的单个 `invoke_sidecar` 命令。Dev-only mock 数据集中在 `src/lib/dev-mocks.ts`，仅在浏览器模式且 sidecar-bridge 未启动时使用。全局 Store 单例在 `src/lib/store.ts`。

**Hook 分层**（避免各自手搓重复的异步状态机）：

| Hook | 职责 |
|------|------|
| `useSymbolFetch` | 按 symbol 自动抓取的通用四态机（`idle→fetching→ready\|error`）+ requestId 竞态守卫。`useStockData` / `useQuantData` 是它的薄封装。 |
| `useSymbolScopedAsync` | 按 key（symbol，或 symbol+配置指纹）分桶的异步结果仓库：结果 / error / in-flight 全部隔离，LRI 限容。`useAIAnalysis` / `useDeepAnalysis` / `useChat` 共用。 |
| `useAnalysisSuite` | 一只股票的完整分析套件——组合上述 hook + 大师权重 + RAG 预热，向 UI 暴露一个 `AnalysisSuite` 对象。`Dashboard` 只传这一个 prop 给 `AnalysisPanel`。 |
| `useReportIndexWarmup` | 切标的时 fire-and-forget 触发财报 RAG 建索引，把交易所平台抓取挪出 chat 首答关键路径。 |

新增「按 symbol 取数」或「按 symbol 缓存异步结果」的能力时，复用上面两个基础 hook，不要再抄一份竞态守卫。

## 2. Tauri Core (`src-tauri/src/lib.rs`)

Rust 层做三件事：

- 暴露**唯一**的命令 `invoke_sidecar(args, payload, configOverride)`。它不认识任何具体 action，只做两件事：
  - 把 argv 里的 `@config` 哨兵替换为 0o600 临时配置文件的 `@路径`（含 apiKey 的配置**永不进 argv**——`ps` / 活动监视器可见）
  - 把 `@payload` 哨兵替换为临时 JSON 文件的裸路径（规避 macOS ARG_MAX ≈ 256KB）

  两个哨兵的字面量与 `shared/actions.ts` 保持一致，由 `cargo test` 的 `test_slot_sentinels_match_shared_manifest` 守住。临时文件由 `TempFileGuard`（RAII）在 drop 时清理，覆盖 panic / 提前 return 所有退出路径。
- 配置来源：默认取 `settings.json` 的 `app_settings`（`required_settings()`，缺失即报错）；`configOverride` 非空时改用它（列模型要用表单当前编辑值，可能尚未保存）。**Settings schema 由 Sidecar 的 `resolveConfig` 校验，Rust 不重复定义。**
- 桌面端（`#[cfg(desktop)]`）注册 `tauri-plugin-updater` + `tauri-plugin-process`，支撑应用内自动更新（前端 `src/hooks/useUpdater.ts` + `UpdateBanner`/`settings/UpdateChecker`）。更新源与签名运维见 `release-checklist.md`。

**因此新增 Sidecar 能力时本文件无需改动。**

配置解析结果的权威定义是 `sidecar/configResolver.ts` 的 `ResolvedConfig`（含 `roles` 角色分级模型、`selectedMasters`、`language`、`deepMode` 等）。`_version` 与 `CONFIG_VERSION` 不匹配时抛出，提示用户重新保存配置。`ProviderType` 定义在 `shared/types`：`"openai" | "ollama" | "anthropic" | "deepseek" | "glm"`；`deepseek` 与 `glm` 走 OpenAI 兼容协议，在 `providers/registry.ts` 的工厂表中复用 `OpenAIProvider`，仅默认值不同（`shared/constants.ts` 的 `PROVIDER_PROFILES`，`sidecar/config.ts` 仅 re-export）。

## 3. Sidecar (`sidecar/`)

Bun 进程，主流程两步：

1. **Scrape** (`scraper.ts`)：按 `StrategyRegistry.getStrategies()` 顺序尝试策略，首个返回非空结果即停止。顺序为 RSS 优先（`strategies/google-news-rss.ts` 原生覆盖 A 股、绕过 reCAPTCHA），其次 Playwright 策略（`google-news.ts` / `google.ts` / `yahoo.ts`）。Chromium 懒启动——仅 Playwright 策略或深度正文提取才触发，纯 RSS 路径可节省 1–3 秒。`deepMode=true`（默认）时对前 3 条抽取正文。纯解析助手（HTML / 交易所识别）在 `sidecar/parsers/{html,exchange}.ts`，与网络层解耦。
2. **Analyze** (`analysis.ts`)：委托 `providers/registry.ts` 工厂创建 provider，再调 `provider.analyze()`。Prompt 构建统一在 `prompts.ts`。

结果以 JSON 字符串写 stdout，由 Tauri 捕获返回前端。**stdout 只允许有最终 JSON，调试日志一律走 stderr。**

### HTTP 抓取策略（`sidecar/http.ts`）

所有对外部数据源的请求**一律经 `fetchWithPolicy(url, policy)`**，它统一注入 `HTTP_DEFAULTS`（`sidecar/config.ts`）的 User-Agent 与超时。不要在数据源模块里另写 UA 字面量或 `AbortSignal.timeout(...)`——那是「同一个决策表达多次」，会在需要统一调整时漏改。

`policy.fetchImpl` 是各数据源模块统一的**测试注入点**，配合 `parsers/` 的纯函数，让抓取链路可离线测试。真网络断言放 `*.integration.ts`（不进默认套件）。

## 4. Sidecar CLI 动作（`shared/actions.ts`）

「一个能力叫什么、吃哪些参数」只在 `shared/actions.ts` 的 `SIDECAR_ACTIONS` 声明一次，三层各自派生：

- **Sidecar**（`sidecar/index.ts`）：`parseArgs` 按 flag 匹配 argv、按 `slots` 逐位取参；`DISPATCH` 表把参数交给 `cli-handlers/` 的 handler
- **Rust**：泛化 `invoke_sidecar`，只认哨兵（见 §2）
- **前端**（`src/lib/ipc.ts`）：`buildActionArgs` 组装 argv

`ipc: false` 的 action 表示**仅 CLI 调试入口、无前端调用方**（业务链路里由 sidecar 内部直接调对应函数）。`shared/actions.test.ts` 交叉校验清单与 `ipc.ts`、`index.ts` 的一致性——防止再出现「sidecar handler + Rust command 都写好了，前端却没调用方」的半截布线。

**新增一个能力 = 两处改动**：`shared/actions.ts` 加一条 + `cli-handlers/` 对应领域文件实现 handler + `sidecar/index.ts` 的 `DISPATCH` 加一行。Rust 与 ipc.ts 的调用管道不动。

当前动作：`--list-models` / `--search` / `--kline` / `--quote` / `--bundle` / `--analyze-only` / `--quant` / `--index-reports` / `--backtest` / `--deep-analysis` / `--chat` / `--screen`（以上 `ipc: true`）；`--fundamentals-history` / `--market-snapshot` / `--info`（`ipc: false`，CLI 调试用）；无 flag 时为默认全流程分析模式（`<symbol> <@config>`，向后兼容）。另有 `--check` 健康自检，在参数解析前短路处理。

### handler 分组（`sidecar/cli-handlers/`）

handler 按领域分文件，各组是一个 `createXxxHandlers(ctx)` 工厂，由 `index.ts` 合并成单一 `Handlers` 对象。新增 handler 时按下表对号入座：

| 文件 | 覆盖的 handler |
|------|----------------|
| `models.ts` | `handleListModels`（+ `fetchProviderModels` 真实端点拉取、`RawConfig`） |
| `market-data.ts` | 不调 LLM 的纯数据：`handleInfo` / `handleSearch` / `handleKline` / `handleQuote` / `handleQuant` / `handleFinancialHistory` / `handleMarketSnapshot` / `handleBacktest` |
| `analysis.ts` | LLM 分析链路：`handleAnalysis` / `handleFetchBundle` / `handleAnalyzeOnly` / `handleDeepAnalysis` |
| `conversation.ts` | `handleChat` 及其前置的 `handleIndexReports`（财报 RAG 预热） |
| `screener.ts` | `handleScreen`（自成一组：有独立的 `ERR_SCREEN_*` 错误码分类） |
| `context.ts` | 共享的 `HandlerContext`（输出通道 `out` + 测试注入点 `deps` + `requireSymbol` 守卫）与 `HandlerDeps` |

**两条铁律**：

- **重依赖必须留在函数体内 `await import()`**。各文件顶层只准 import `utils` / `shared/constants` / 类型——`cli-handlers` 在启动路径上，顶层拖入 playwright 一系会让 Bun `--compile` 的二进制在无浏览器环境直接崩（历史事故）。
- **每个 handler 的所有出口都要写一次且仅一次信封**（`successEnvelope` / `errorEnvelope`）。`outputJson` 有重复写入检测，会抛 `[PROTOCOL]`。

## Multi-Agent 系统（`sidecar/agents/`）

13 位投资大师 Agent（巴菲特、芒格、格雷厄姆、伯里、伍德等）各自持有独立的分析视角，统一实现 `MasterAgent` 接口（`agents/types.ts`）。数据流：`agents/registry.ts`（注册表）→ `agents/synthesizer.ts`（聚合评分）→ `agents/sentiment.ts`（情绪综合）。`agents/masters/factory.ts` 的 `createMasterAgent` 统一处理语言指令注入、响应解析与容错，各大师只提供 `meta` + `SYSTEM_PROMPT` + `buildUserPrompt`。`agents/chat-adapter.ts` 适配各 AI provider 的对话格式。

新增大师要动**四处**（其中两处漏了不报错）：`agents/masters/<id>.ts` 实现、`agents/registry.ts` 注册、`agents/masters/masters-common.test.ts` 的 `ALL_MASTER_FILES`（漏了静默漏测）、`src/components/DeepAnalysis/master-meta.ts` 的 `MASTER_META`（漏了前端不显示姓名）。走 `/new-master-agent` 技能可自动覆盖。

> **`MasterMeta` 是 shared 单一来源的一处已知例外**：数据在 `agents/masters/*.ts` 与 `src/components/DeepAnalysis/master-meta.ts` 各存一份。前端不能 import `sidecar/`（单向依赖），当前只能双写。**这不是待修的违规**——真要收敛，得把 `MASTER_META` 表挪进 `shared/constants.ts` 供两侧取用。

## 量化评分子系统（`sidecar/quant/`）

入口 `quant/index.ts` 并发拉数（K 线 / 报价 / 财务 / 资金流，`Promise.allSettled` 容错），再组装为 `QuantResult`（类型在 `quant/types.ts`）；`QuantDeps.fetchImpl` 是统一注入点。

| 分组 | 模块 | 说明 |
|------|------|------|
| 复合分入参 | `technical.ts` / `fundamental.ts` / `valuation.ts` / `volatility.ts` | 前两者产出 composite 信号，后两者分别提供估值快照与风险指标 |
| 聚合 | `scoring.ts` | 技术 + 基本面加权为基准，blend 估值方向，按风险向中性收敛（缺估值/风险自动降级），产出 1–100 分与 bullish/bearish/neutral |
| 派生 | `levels.ts` / `fundflow.ts` / `factors.ts` | 价位推导、资金流、给大师 Agent 用的因子集 |
| 独立能力 | `market-snapshot.ts` / `nl-screen.ts` / `fundamental-history.ts` / `roe-annualize.ts` | 各自对应一个 CLI action 或被选股/财报链路调用，不进复合分 |

前端对应 `useQuantData` hook 与 `QuantScoreCard` 组件。**新增维度先想清楚是「进复合分」还是「派生/独立」**——进复合分要改 `scoring.ts` 的权重口径，属于口径变更，不是加法。

## K 线数据源（`sidecar/kline/`）

`kline/index.ts` 的 `KLINE_SOURCES` 是「哪些源、按什么顺序」的唯一声明：A 股 `腾讯 → 东财`，美股 `Yahoo`。`getKline` / `getQuote` 依次尝试，首个成功即返回，全部失败抛最后一个错误；不提供该能力的源（如东财无报价接口）自动跳过。**新增数据源只需在对应市场的数组里加一行**，不必改控制流。各源统一接受 `KlineSourceDeps.fetchImpl`，回退逻辑因此可离线测试（`kline/index.test.ts`）。

## 回测引擎（`sidecar/backtest/`）

`engine.ts` 实现策略回测，导出 `MIN_BACKTEST_BARS`；默认策略参数在 `backtest/types.ts` 的 `DEFAULT_BACKTEST_PARAMS`（唯一来源，调用方只补 `symbol` / `period`）。通过 `--backtest <symbol>` 触发，前端对应 `src/components/Backtest/BacktestPanel.tsx`。

## PriceChart Subsystem

前端 `src/components/PriceChart/` 是独立子系统，封装 TradingView lightweight-charts **v5** 主图。职责按「实例 / 数据 / 叠加层」分开，新增图元时对号入座、不要往 `ChartCanvas` 里塞：

| 文件 | 职责 |
|------|------|
| `useChartInstance.ts` | 建 chart 与全部常驻 series、订阅十字光标、market 变更时整体重建；持有所有 series/句柄 ref 并返回给下游 |
| `ChartCanvas.tsx` | 只负责把数据喂进 series（K 线 / 成交量 / MA / 比较基准）与对数坐标切换 |
| `useBollOverlay` / `useChartOverlays` / `usePriceLines` | 各叠加层：BOLL 三轨、AI 价位线 + 回测买卖点/净值、昨收/现价水平线 |

`QuoteHeader` / `Toolbar` / `SubChart` / `CrosshairTooltip` 拆分页面区块，`index.tsx` 编排并通过 `useRealtimeQuote`（仅交易时段轮询）合并 K 线尾根与实时价。
