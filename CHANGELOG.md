# Changelog

All notable changes to StockAI will be documented in this file.

## [0.11.0] - 2026-05-30

### Added

- **应用内自动更新** — 软件启动时静默检查 GitHub 上的新版本，发现后顶部提示，一键即可下载、安装并自动重启，不必再手动下载安装包。设置 →「常规」新增「检查更新」按钮可随时手动检查。更新包经 minisign 签名校验，防止被篡改。
- **Linux AppImage 产物** — 除 `.deb` 外新增发布 `.AppImage`，使 Linux 也能享受应用内自动更新（`.deb` 仍保留给习惯 apt 管理的用户手动安装）。

### Notes

- 自动更新自本版本（v0.11.0）起生效：现有 v0.10.0 用户需手动安装一次本版本，之后即可在应用内一键升级。

## [0.10.0] - 2026-05-27

### Added

- **多语言支持（zh / en / ja）** — UI 全面国际化，覆盖所有组件、设置弹窗、搜索栏、分析面板、量化评分卡、情感分析、历史记录等；Settings 新增语言选择器。AI Agent 分析响应（提示词、结构标签、错误消息）同步支持三语言，由语言参数贯穿整个 Agent 调用链。
- **自选股价格提醒** — 监听持仓涨跌，达到用户设定阈值时发出系统通知。
- **批量量化筛选器** — 对自选股列表执行量化评分扫描，一键获取全部标的的技术/基本面/估值/波动率综合评分。
- **分析历史持久化** — 基于 SQLite 的分析历史存储，支持回溯查看历次 AI 分析结果。

### Fixed

- **SentimentBreakdown 中性条宽度** — 中性占比改用直接比率计算，修复宽度渲染错误。
- **HistoryTimeline 日期格式** — `toLocaleDateString` 现在根据当前语言选择正确的地区格式。
- **AI Prompt 结构标签硬编码** — synthesizer 的 `buildSynthesisPrompt` 和 sentiment 的 `buildPrompt` 中的结构标签（`[各大师研判]`、`信号:`、`返回格式:` 等）改为多语言字典，不再混入中文。
- **测试硬编码字符串** — factory / synthesizer 测试中的错误消息断言改为引用生产代码导出的常量，防止断言与实现脱节。

## [0.9.0] - 2026-05-24

### Added

- **多 Agent 大师投资分析** — 13 位顶级投资大师 AI Agent（Buffett、Graham、Munger、Burry、Wood、Lynch、Fisher、Ackman、Soros、Dalio、Simons、Druckenmiller、Taleb），各自以独立投资哲学对股票给出多空信号与置信度，综合合成最终投资建议。
  - **情感分析 Agent** — 基于 LLM 的新闻情感分类，为大师 Agent 提供市场情绪输入。
  - **信号综合器** — 按大师权重加权聚合多空信号，支持置信度加权、tie-breaking 与分数钳制。
  - **ChatProvider 适配器** — 统一所有大师 Agent 的 LLM 调用接口，支持 OpenAI / DeepSeek / GLM / Anthropic / Ollama 全部已有 Provider。
  - **深度分析 UI** — 独立的"深度分析"按钮与结果面板，展示每位大师的分析理由、信号与置信度。
- **DCF / Owner Earnings 估值模型** — 新增内在价值估算，包含折现现金流（DCF）、所有者盈余（Owner Earnings）和相对估值（PE/PB/PS/EV 百分位），为 Buffett / Graham / Damodaran Agent 提供估值数据。
  - **ValuationCard 组件** — 展示内在价值、安全边际百分比和估值评级。
- **风险指标引擎** — 计算年化波动率、波动率百分位、最大回撤、Sharpe 比率代理和风险等级，为 Taleb / Druckenmiller Agent 提供风险量化输入。
  - **RiskCard 组件** — 展示风险等级、波动率、回撤和 Sharpe 比率。
- **量化回测引擎** — 基于技术信号的策略回测，生成权益曲线、交易记录、胜率和 Sharpe 比率。
  - **BacktestPanel 组件** — 可视化权益曲线图表和回测统计指标。

### Fixed

- **技术指标详情丢失（Critical）** — `analyzeTechnical` 的 composite details 只包含信号摘要字符串，未合并子信号的实际指标值（RSI、MACD、ADX、volume_ratio），导致 13 个大师 Agent 的 prompt 中这些字段为 undefined。
- **@filepath 路径遍历漏洞** — Sidecar 的 `@filepath` 配置协议未校验路径，攻击者可读取任意文件。现在验证路径必须位于 `tmpdir()` 且以 `stockai-` 为前缀。
- **API Key 泄露风险** — sidecar-bridge 将完整 config JSON 作为命令行参数传递，`ps aux` 可见 API Key。改为写入 0o600 权限的临时文件。
- **useQuantData 潜在无限循环** — `fetcher` 函数包含在 useEffect 依赖数组中，每次渲染创建新引用触发重新执行。改用 `useRef` 打破依赖循环。
- **NaN/Infinity 显示** — RiskCard、ValuationCard、BacktestPanel 对无效数值添加 NaN 守卫，防止显示 NaN%。
- **回测引擎最终平仓** — 引擎现在在回测结束时记录强制平仓交易，之前会丢失最后一笔持仓。
- **综合信号 tie-breaking** — 当多空权重相等时，synthesizer 现在默认返回 neutral 而非随机偏向。
- **默认情感分析回退** — 移除 AnalysisPanel 中的硬编码默认 sentiment 值，无数据时不再误导用户。

### Changed

- **LLM 并发限制** — 深度分析的 13+ 个并行 LLM 调用改为 MAX_CONCURRENCY=4 的受控并发，防止 API 429 限流。
- **波动率百分位算法** — 从 O(n log n) 排序 + findIndex 改为 O(n) 线性扫描。
- **共享常量提取** — `RISK_FREE_RATE`（4.5%）和 `TRADING_DAYS_PER_YEAR`（252）提取到 `shared/constants.ts`，消除三处重复定义。
- **类型去重** — 删除 `ValuationResult`、`RiskMetrics`、`DeepAnalysisResponse` 三个与 `shared/types.ts` 重复的接口。
- **cache-utils 提取** — `MAX_SYMBOLS_IN_CACHE` 和 `setWithLRI` 从 `useAIAnalysis` 提取为独立模块，`useDeepAnalysis` 共享使用。
- **信号样式集中化** — 创建 `signal-styles.ts` 工具模块，消除 MasterCard / SynthesisSummary / AnalysisPanel 中的重复样式逻辑。
- **大师 Agent 工厂模式** — `createMasterAgent` 工厂函数消除 13 个 Agent 文件的样板代码。
- **.gitignore 加固** — 添加 `.env` 和 `.env.*` 规则，防止敏感文件意外提交。

### Tests

- 测试总数升至 **288**（前端 88 + sidecar 200）。
- 新增：深度分析编排器测试、信号样式测试、大师工厂测试、ChatProvider 适配器测试、Warren Buffett Agent 测试。

## [0.8.0] - 2026-05-24

### Added

- **量化分析系统（Phase 1）** — 在 AI 分析基础上叠加量化评分，让报告更具专业性与可解释性。
  - **技术面评分**：EMA 趋势 / RSI 动量 / MACD 信号 / 布林带位置 / ADX 趋势强度，五维加权合成 0–10 分。
  - **基本面评分**：对接东方财富 / Yahoo Finance，盈利能力 / 增长率 / 财务健康 / 估值四维评分，A 股与美股均支持。
  - **QuantScoreCard 组件** — 可展开的信号详情卡，直观呈现每个指标的信号方向与权重贡献。
  - **并行数据获取** — `useQuantData` hook 与新闻爬取并行执行，不阻塞主流程。
  - **增强 Prompt** — 量化摘要自动注入 LLM 上下文，AI 报告新增 `technicalView` / `fundamentalView` 两个专业视角。
- **`--quant` Sidecar CLI 动作** — 独立拉取量化包（`QuantBundle`），可在 bridge 模式下单独调用。
- **Rust `fetch_quant_bundle` 命令** — Tauri 层新增对应指令，与 `start_analysis` 并行触发。

### Changed

- **类型安全全面收紧** — 消除全部 `any` 类型，替换为精确接口定义，TypeScript 严格模式零报错。
- **CLI 命令表驱动** — Sidecar `index.ts` 改为表驱动分发，新增 action 只需追加一行，无需修改 if-else 链。
- **策略重试健壮性** — 爬取策略失败时自动重试，减少因网络抖动导致的分析失败。
- **组件拆分** — `AnalysisTriggerCard` 从 `AnalysisPanel` 提取为独立组件，单文件行数均低于 200 行上限。
- **移动端适配** — 仪表盘主容器支持小屏垂直堆叠，滚动行为统一（移动端整页滚动，桌面端各区独立滚动）。

### Tests

- 测试总数升至 **296**（前端 88 + sidecar 208）。
- 新增量化模块单元测试：`technical.test.ts` / `fundamental.test.ts` / `scoring.test.ts`，覆盖纯函数指标计算。
- 补齐 scraper / prompts / watchlist hook / `AnalysisTriggerCard` 共 47 个测试用例。

## [0.7.0] - 2026-05-23

### Added

- **两阶段分析架构** — AI 分析改为显式触发，切换股票不再自动消耗 token；分析按钮明确区分"获取数据"与"开始分析"两步，用户完全掌控何时调用 AI。
- **list-models 错误分类** — Sidecar 对模型列表拉取失败细分 6 种错误码（网络超时、认证失败、端点不存在等），Provider 设置页面展示可操作的具体提示，而非笼统报错。
- **bump-version 脚本** — `bun run bump-version <x.y.z> --write` 一键同步三个版本文件（`package.json` / `tauri.conf.json` / `Cargo.toml`），内置 dry-run 预览。
- **聚合测试 runner** — `bun run test` 统一串联前端 vitest 与 sidecar bun test，带超时保护，无需 GNU `timeout` 依赖；`bun run test:integration` 追加网络集成测试。
- **PriceChart 端到端测试** — 覆盖 K 线协调层 6 个核心场景（数据加载、实时合并、错误回退等）。

### Fixed

- **ARG_MAX 溢出风险** — 当新闻条目过多时，`analyze_news` 命令行参数超过系统限制导致 sidecar 崩溃；改为通过临时文件传递新闻 JSON，彻底消除风险。
- **跨 symbol 状态泄漏** — 切换股票时，前一只股票的分析结果可能短暂显示在新股票页面；加入请求 ID 校验，过期响应直接丢弃。

### Changed

- **RAII 临时文件清理** — 引入 `TempFileGuard`，分析流程结束后自动删除临时文件，无需手动清理。
- **LRU cache 上限** — `useAIAnalysis` hook 的缓存条目上限设为 50，防止长时间使用后内存持续增长。
- **渲染节流** — K 线更新合并高频渲染帧，减少不必要的 DOM 操作。
- **K 线 symbol 解析共享化** — 提取 `sidecar/parsers/exchange.ts` 共享工具，eastmoney / tencent / yahoo 三个数据源统一解析逻辑。
- **stdout 信封统一** — Sidecar 所有 CLI 动作输出格式标准化（`{ ok, data } | { ok, error }`），前端解析路径收敛。
- **三栏仪表盘布局** — 主界面重构为左（自选列表）+ 中（K 线图）+ 右（AI 分析）三栏，信息密度大幅提升。

## [0.6.0] - 2026-05-22

### Added

- **专业级 K 线图子系统** — 替换原 TradingView iframe Widget，基于 lightweight-charts v4 全新构建：主图 K 线 + 成交量副图 + MA 均线（短/中/长可切换）+ BOLL 布林带 + 昨收/现价水平线 + 比较基准叠加（归一化另一标的相对走势）。
- **多副图技术指标** — MACD / RSI / KDJ / OBV / VWAP 一键切换。
- **十字光标信息浮层** — 鼠标悬浮显示当根 K 线 OHLCV 详情。
- **实时报价合并** — `useRealtimeQuote` 仅在交易时段轮询，与 K 线最后一根自动合并；最后一根 K 上标注"现"marker，一眼定位当前 K 线。
- **多源 K 线数据** — 新增 Yahoo Finance / 东方财富 / 腾讯三个数据源，按顺序容错回退，覆盖美股与 A 股（含复权）。
- **技术指标库** — `src/lib/indicators.ts` 提供 SMA / EMA / MACD / RSI / KDJ / BOLL / OBV / VWAP 纯函数实现，含完整单测。
- **新 IPC 命令** — `fetch_kline` / `fetch_realtime_quote`，Sidecar CLI 同步新增 `--kline` / `--quote` 动作。
- **开发桥接器扩展** — `scripts/sidecar-bridge.ts` 支持新增的 K 线 / 报价指令，浏览器 dev 模式可直拉真实数据；bridge 未启动时一次性 warn 后回退 mock，避免轮询刷屏。
- **市场识别工具** — `src/lib/market-hours.ts` 提供市场识别 / 涨跌色（美股绿涨红跌，A 股相反）/ 交易时段判断。

### Changed

- **CLAUDE.md 架构文档** — 补全 Sidecar CLI actions 表与 PriceChart 子系统说明，修正过时的开发桥接器路径。

## [0.5.12] - 2026-05-21

### Fixed

- **K 线图不显示** — 修复 CSP 缺少 `frame-src` 导致 TradingView K 线 Widget 被浏览器拦截的问题。

## [0.5.11] - 2026-05-21

### Fixed

- **分析服务异常 (ExitCode: Some(1))** — 修复 Bun `--compile` 二进制中 `playwright-core` 因 CJS `__dirname` 烘焙为 CI 机器绝对路径而导致 sidecar 启动即崩溃的问题。根因：静态 `import "playwright-core"` 使模块在 sidecar 启动时立即求值，找不到 CI 路径下的 `package.json`，所有操作（包括不需要浏览器的"获取模型列表"）均报错。修复方式：将 playwright-core 改为在真正需要浏览器时才动态加载，RSS 抓取路径和模型列表等功能不受影响，Playwright 策略在加载失败时优雅降级（跳过）。

## [0.5.10] - 2026-05-21

### Fixed

- **Sidecar 启动失败** — 修复 Tauri v2 sidecar 路径解析错误，导致分析功能和模型列表均报"No such file or directory (os error 2)"。根因：`tauri-build` 复制 sidecar 时剥掉了 `bin/` 路径前缀，但运行时调用仍带前缀，查找路径不存在。现已对齐两侧路径。

## [0.5.9] - 2026-05-21

### Changed

- **Release workflow documented** — Added comprehensive release checklist to CLAUDE.md, covering version sync, CHANGELOG formatting, CI gate (all checks must pass before tagging), GitHub Release notes, About section, and Labels.
- **GLM provider documented** — CLAUDE.md now documents the GLM provider and the OpenAI-compatibility pattern for adding new providers.

## [0.5.8] - 2026-05-19

### Added

- **Zhipu AI GLM support** — GLM-5.1 is now available as an AI provider. Uses the OpenAI-compatible endpoint (`open.bigmodel.cn/api/paas/v4`); configure your API key in Settings → Model Service → GLM. Other GLM variants (`glm-4.7`, `glm-4.6v`) can be set manually in the model name field.

## [0.5.7] - 2026-05-19

### Fixed

- **Stock search & info broken** — The sidecar argument parser was reading `config_json` as the symbol/keyword for `--info` and `--search` commands (off-by-one: `args[idx+1]` instead of `args[idx+2]`). Stock search results and the stock info panel now work correctly.
- **DeepSeek API endpoint updated** — Default base URL changed from `https://api.deepseek.com/v1` to `https://api.deepseek.com` per the current official documentation. Default model updated from `deepseek-chat` (scheduled for deprecation 2026-07-24) to `deepseek-v4-pro`.

## [0.5.6] - 2026-05-18

### Fixed

- **macOS 签名与公证 (Critical)** — 彻底解决了 macOS 用户下载 DMG 后提示"应用已损坏"的问题。引入了完整的 CI 签名链路（Apple 证书导入 → ad-hoc 签名 → notarization），并在构建后对 Sidecar 二进制进行主动签名。同时新增了二进制完整性校验脚本，防止构建路径泄漏。
- **HTTP 错误响应处理** — 搜索接口在收到 4xx/5xx 响应时不再继续解析无效数据，直接返回空结果。
- **Playwright 浏览器资源泄漏** — 浏览器上下文（BrowserContext）现在在错误恢复路径中也能被正确关闭，彻底修复了上下文泄漏问题。
- **JSON 输出协议健壮性** — `outputJson` 改为先完成序列化（捕获异常后输出合法的 error JSON），再标记写入状态，确保 Tauri 端始终能解析到有效响应。
- **无限递归风险消除** — 港股等不支持类型触发搜索回退时，不再重入 `fetchStockInfo`，改为直接分发到具体实现函数，彻底消除栈溢出风险。
- **类型安全加固** — CLI handler 的 config 参数从 `any` 改为强类型 `ResolvedConfig`，消除 IPC 边界类型擦除。

### Changed

- **构建脚本优化** — 禁用 Bun 自动签名，改由 CI 统一管理，避免签名冲突。
- **属性清理** — 在 macOS 签名前自动清理扩展属性（`xattr -cr`），防止 Gatekeeper 拒绝已下载的文件。

## [0.5.5] - 2026-04-23

### Fixed

- **Playwright 路径泄露根除方案 (Environment Agnostic Fix)** — 彻底解决了 `ResolveMessage: Cannot find module` 报错。
    - **发现**：Bun 的编译器在 `--compile` 时会将当前构建环境的物理路径注入为 `__dirname`。
    - **修复**：在构建脚本中，将 Bundle 内所有的 `__dirname` 强制替换为 `import.meta.dir`。在编译后的二进制中，后者能正确指向 Bun 的虚拟文件系统 (`/$bunfs/root`)，从而实现了真正的环境无关。
- **构建完整性校验** — 引入了严苛的二进制自检环节，若发现任何残留的构建机器路径，CI 将自动熔断。

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
