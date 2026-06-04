# StockAI 竞品差距重估报告（v2）

> 更新日期：2026-06-04 · 上一版：本文档 v1（见下方附录，2026-05-31）
> 本版基线：代码实测（见各处文件证据）· 调研：6 赛道（AI 研究工具 / 量化评级 / 多 Agent / A 股消费级 / 图表 AI / 风控组合），8-agent 并行工作流产出

## A. 状态校正

v1（2026-05-31）把「对话追问 / 虚拟大师组合 / 缓存」列为最高 ROI 三件套。实测结果：**前两项已 ship，缓存仍缺**，且多项 v1 判定需修正。

| v1 P0/P1 项 | 实测状态 | 文件证据 |
|---|---|---|
| 对话式追问（v1 称最高 ROI 缺口） | ✅ **已做** | `sidecar/chat.ts`（system prompt 已含「不要编造财务数据」抗幻觉约束 + `buildContextBlock` 拼 news/quant/analysis）、`src/hooks/useChat.ts`、`src/components/ChatPanel.tsx` |
| 虚拟大师组合 / 命中率榜 / 净值曲线 | ✅ **已做** | `src/lib/masterPortfolio.ts`、`useMasterPortfolio.ts`、`MasterPortfolio/MasterPortfolioPanel.tsx`；口径诚实（仅非中性信号计入、mark-to-current） |
| 13 大师结果缓存（TTL/LRU） | ❌ **仍缺** | `deep-analysis.ts` 无任何缓存层。同股重复点全量重跑 15 次 LLM 调用 |
| deepMode 正文喂大师 | ✅ **已修** | `factory.ts:12` `formatNewsForPrompt` 被各大师真实调用，正文截 200 字注入 prompt（v1 §8#2 已过时） |
| 大师并发上限 4 保守 | ✅ **已修** | `cli-handlers.ts:277` 实传 `concurrencyForProvider`（云端 8 / Ollama 2）（v1 §8#3 已过时） |
| 独立风控层（波动率→仓位上限%） | ❌ **仍缺** | `quant/volatility.ts` 无仓位逻辑；`risk` 仅作展示维度 |

**需修正的 v1 判定：**

1. **「对话是最高 ROI 缺口」已过时。** 对话本体已 ship。新真差距是**对话背后的财报/转录 RAG + inline 溯源**——竞品（Perplexity/Fiscal.ai/Bloomberg）的对话建立在文档 RAG 上，StockAI 的 `chat.ts` 上下文只有「新闻标题 + 量化摘要 + 分析结论」，问「营收为何下滑」时无据可依。

2. **「四维量化评分」名不副实，被 v1 低估。** 实测 `scoring.ts:3` `WEIGHTS = { technical: 0.55, fundamental: 0.45 }`，`computeComposite` **只接 2 个参数**；`valuation`/`risk` 在 `quant/index.ts` 算完后只挂在 bundle 上展示，**从未进复合分**。所有竞品总分都综合 ≥3 维（Seeking Alpha 5 因子、Stockopedia QVM 三维）。改动极小、收益明确的真缺口（但会波及 backtest 阈值/screener 排序，需配测试重校准）。

3. **「A 股原生 = 护城河」口径收窄。** StockAI 只是 `detectMarket` 代码识别沪深北，**真正的 A 股原生数据（资金流/龙虎榜/连板/概念/F10）一项都没有**。同时 TradingAgents 已能经 Yahoo `.SS/.SZ` + GLM/Qwen 中国端点跑 A 股。护城河应收窄为「桌面端 + 本地隐私 + 多 provider + 大师叙事 + 下载即用 + 中文打磨」。

4. **「抗幻觉 = nice-to-have」升级为 must-have。** EU AI Act 对高风险金融 AI 合规截止 2026-08（要求可解释 + 准确性保证）；Fiscal/Perplexity/Bloomberg/东财妙想全员强制溯源。溯源已是 2026 全赛道**及格线**。

## B. 2026 新动向（v1 未覆盖）

- **抗幻觉从卖点变法规刚需**：EU AI Act 2026-08 合规截止；学界涌现 FinGround（atomic claim 验证 + 段落/单元格级 citation）等「LLM 当 critic/auditor」框架。**inline 可点击溯源**成赛道及格线。
- **财报/转录 RAG 成标配**：Perplexity（via Quartr）、Fiscal.ai（无限转录）、Bloomberg（跨财报转录问答）全部把财报电话会 RAG 作为对话核心。**A 股财报/业绩说明会 RAG 在中文消费级几乎无竞品**——可独占差异化。
- **A 股消费级整条赛道 v1 完全没覆盖**：同花顺 i 问财（NL 选股事实标准，日均 500 万用户）、东财妙想（2025-03 全量开放，EDB+ 公告信源标注抗幻觉）、券商系涨乐（2026 评测综评反超传统软件）。**NL 选股 + 诊股卡 + 资金流/概念**是 A 股用户认知里「正经炒股软件」的门面。
- **图表 × AI 是独立新赛道**：TradingView 2026-04 才上线对话式 AI Chart Copilot（窗口期仍早）；ChartingLens 把「对话在图上画线 + NL 回测 + 权益曲线叠加」打成 $9.99/月产品。StockAI 后端（quant/backtest/scraper）已具备，缺的只是前端用 `createPriceLine`/`setMarkers` 叠加——而这两个 API **已在 `ChartCanvas.tsx:131/207/210` 使用**。
- **风控/组合是成熟独立赛道**：PortfolioPilot（组合分 0-1000 信用分隐喻）、Nitrogen（Risk Number 1-99 + 「95% 概率 -7%~+12%」翻译）、ai-hedge-fund 精确公式 `position_limit = 0.20 × vol_multiplier × corr_multiplier`。**A 股端几乎无消费级风控竞品 → 蓝海**。
- **多 Agent 标杆迭代**：ai-hedge-fund 扩到 14 位具名大师 + 引入「近期更准 agent 动态加权」；TradingAgents v0.2.4 加「持久化决策日志让 agent 从历史交易学习」。**StockAI 的 `master_signals` 已落账但只喂净值展示，未回流为动态权重**。
- **北向资金硬约束**：2024-05 起监管已取消实时披露、改季度。**任何「实时北向资金」功能都是做废弃功能**，必须剔除。

## C. 更新版差距清单（按 ROI 排序）

> 已剔除已 ship 项（chat、master portfolio、13 大师、四维评分子系统本体、三语、多 provider、K 线图、deepMode 正文注入、provider 感知并发）。仅保留实测确认未做的。

| # | 缺口 | 对标谁 | 差异化价值 | 成本 | 三层实现要点 | 优先级 |
|---|---|---|---|---|---|---|
| 1 | **valuation/risk 回灌复合分** | Seeking Alpha 5 因子 / Stockopedia QVM | 「四维评分」名副其实；当前 2 维让两维白算 | low | Sidecar：`scoring.ts` 扩 `computeComposite` 接 valuation/risk + 重校准 backtest 阈值 | **P0** |
| 2 | **13 大师结果缓存（LRU+TTL）** | ai-hedge-fund Cache | 同股重复点从 15 次 LLM → 秒级；直接省 token/钱 | low | Sidecar 新增 `cache.ts`，key=`symbol+newsHash+masterSet+lang+model`，在 `deep-analysis.ts` 前插中间层，<100 行 | **P0** |
| 3 | **独立风控层：波动率→建议仓位上限%** | ai-hedge-fund `risk_manager.py` / Nitrogen | 把分析转成可执行动作；A 股无竞品=蓝海 | low | Sidecar 新增 `quant/position-sizer.ts`（`risk.volatilityPercentile` 已算→阶梯映射 base 20%×vol_mult）；前端结果卡加「建议仓位 X%」 | **P0** |
| 4 | **量化评分可下钻 pass/fail check 清单** | Simply Wall St 雪花 / Seeking Alpha 因子下钻 | 打开黑箱「凭啥判 bullish」；补 2026 可解释入场券 | med | Sidecar：各 scorer 已有 if 阈值判断，结构化吐 `{check,passed,actual,threshold}[]`；前端 QuantScoreCard 折叠面板 | **P0** |
| 5 | **大师分歧度可视化** | TradingAgents bull/bear 辩论 | 「13 人中 9 看涨 4 看跌」比单一共识度信息量大 | low | `computeConsensus`（`synthesizer.ts:35`）已有数据；前端加多空计数柱状图，纯展示层 | **P1** |
| 6 | **AI 结论叠加到 K 线图（支撑/阻力/目标/止损价格线）** | TradingView Copilot / ChartingLens | 「低成本高感知」；后端已有、API 已用 | low | Sidecar quant/analysis 多吐 `levels:{price,label,type}[]`；前端 `ChartCanvas` 循环 `createPriceLine`（已在用） | **P1** |
| 7 | **回测结果叠加主图（买卖 marker + 权益曲线）** | ChartingLens / TrendSpider | BacktestPanel 与 PriceChart 当前割裂 | med | 前端用 `setMarkers`（已在用）打买卖箭头 + SubChart 加 equity line | **P1** |
| 8 | **波动率翻译成「亏多少」+ 单一风险数字** | Nitrogen「95% 概率 -7%~+12%」| σ 散户看不懂；翻译后秒懂 | low | `volatility.ts` 已有年化 σ，用 ±1.96σ√t 折算半年区间；前端波动率维度旁加一行 | **P1** |
| 9 | **AI 回答 inline 溯源徽章** | 东财妙想 EDB / Fiscal.ai / Perplexity | 2026 法规级刚需；抗幻觉最强信号 | med | prompt 要求 LLM 输出 `sourceRef`→新闻 index/财务字段；前端渲染可点击角标 | **P1** |
| 10 | **A 股特色数据（资金流/概念板块/龙虎榜/F10）** | 同花顺/东财/大智慧 | A 股「是不是正经炒股软件」的门面 | med-high | Sidecar 加 AKShare 风格抓取策略（资金流/概念/涨停池免费可爬）；分阶段做 | **P1** |
| 11 | **财报/转录 RAG（喂对话+反哺历史财务）** | Perplexity/Fiscal.ai/Bloomberg | A 股财报 RAG 中文消费级无竞品；解轨道 B 历史财务阻塞 | high | A 股走巨潮/互动易转录；先 BM25 检索存现有 SQLite | **P2** |
| 12 | **大师专属因子代码预计算** | ai-hedge-fund（`analyze_moat`/DCF） | 抗幻觉硬底座 | high | 前置依赖多期历史财务；各大师加 `computeFactors()` | **P2** |
| 13 | **大师信号回流为 synthesizer 动态权重** | ai-hedge-fund「近期更准 agent 加权」 | 复用已落账 `master_signals` | med | `synthesizer.ts` 本地加权投票读历史命中率 | **P2** |
| 14 | **NL 选股 + 全市场基本面快照** | 同花顺 i 问财 | 从「个股分析器」升级为「选股入口」 | high | Sidecar `--screen <nl>`：LLM 解析 NL→结构化条件 | **P2** |
| — | 手动画线工具 / 实时北向资金 / 代客下单 | — | 偏离定位 / 监管已废弃 / 合规风险 | — | — | **skip** |

## D. 本会话实现（2026-06-04）

挑选标准：low 成本 + 高 ROI + 纯局部 + 实测确认未做。本会话落地 **#2 缓存 + #3 风控层**（#1 因波及回测阈值/screener 排序，blast radius 大，留后续单独处理）。

- **#2 13 大师结果缓存**：新增 `sidecar/cache.ts`（LRU + TTL），`deep-analysis.ts` 入口加缓存中间层。验收：同 symbol+config 二次调用不触发 LLM、TTL 过期重算、改 lang/model/newsHash 即 miss、LRU 上限防内存泄漏。
- **#3 波动率→建议仓位上限%**：新增 `sidecar/quant/position-sizer.ts`（纯公式，base 20%×波动率阶梯），`shared/types.ts` 加 `positionGuidance` 字段，前端结果卡加一行 + 三语 i18n。UI 文案明示「仓位上限参考，非投资建议」。

## E. 一句话结论

StockAI 的护城河是**「下载即用 + 免费自带 key + 桌面本地隐私 + 13 大师中文叙事 + 多 provider + 三语」的产品化打磨**（而非「A 股原生」——A 股特色数据一项未做、开源框架已能跑 A 股）；最该补的那一刀是 **把「算了却没用」的资产接通**——valuation/risk 回灌复合分(#1)、13 大师缓存(#2)、波动率转仓位上限(#3)——三项全是 low 成本、纯局部、复用现成数据，且同时补齐「四维名副其实 + 抗幻觉可解释 + 可执行风控」这三条 2026 入场券。

---

# 附录：v1 首版分析（2026-05-31，历史版本）

> 下方为首版分析，部分判定已被上方 v2 校正（chat / 虚拟组合已 ship、正文白抓已修、并发已改）。保留作为 ai-hedge-fund 逐文件比对（§3）、虚拟大师组合设计（§7）、性能体检（§8）的参考底稿。

## v1 · StockAI 竞品分析与差距评估

> 调研时间：2026-05-31 · 数据窗口 2024–2026。本文为产品规划内部参考，业绩数字多为各家自报回测（含幸存者/前视偏差风险），价格随促销浮动，引用处已注明。

## 0. 一句话定位

StockAI 的「引擎」——**多大师 Agent + 量化评分 + 回测 + AI 新闻分析**——在开源界已被 `virattt/ai-hedge-fund`（MIT，~60k star）近乎 1:1 复刻，**能力清单本身不再是壁垒**。但全球没有任何产品把这套引擎做成「**普通投资者下载即用 + 原生覆盖 A 股 + 成品级桌面体验**」。StockAI 的护城河不在「有几个大师」，而在 **可用性 + 本地化（A 股/中文/隐私）+ 产品打磨**。差距集中在三块：**交互形态（对话/问答）**、**A 股本地化数据**、**数据源质量**。

---

## 1. 横向全景对比（22 款产品）

| 产品 | 赛道 | AI 形态 | 大师? | 量化评分 | 回测 | A股 | 形态 | 价位/年 |
|---|---|---|---|---|---|---|---|---|
| **StockAI** | 综合 | 多大师Agent+四维 | ✅13 | ✅四维 | ✅单股 | ✅原生 | 桌面 | 免费/自带key |
| ai-hedge-fund | 大师Agent | 18agent | ✅13 | ✅ | ✅大师策略 | ❌ | CLI+Web | 开源MIT |
| TradingAgents | 多agent | 多空辩论 | ❌职能 | ✅ | ✅ | CN分支 | 库/CLI | 开源 |
| **Validea** | 大师选股 | ❌纯量化 | ✅20+ | ✅规则 | ✅组合20年 | ❌ | Web | $270–900 |
| GuruFocus | 大师+估值 | ❌量化 | 持仓 | GF Score | ✅ | ❌ | Web | ~$90–240 |
| Morningstar | 评级 | Quant外推 | ❌ | ✅星级+护城河 | — | 部分 | Web | ~$420 |
| Zacks | 评级 | ❌量化 | ❌ | ✅Rank+VGM | 自报 | ❌ | Web | 免费+付费 |
| Seeking Alpha | 评级+社区 | ❌量化 | ❌ | ✅五因子A-F | ✅ | ❌ | Web | $299–2400 |
| TipRanks | 评级聚合 | ❌聚合 | ❌ | ✅8因子 | 自报 | 部分 | Web | 付费 |
| Danelfin | AI评分 | ✅ML预测 | ❌ | ✅AI Score | 自报 | ❌ | Web | $336–950 |
| FinChat/Fiscal | AI问答 | ✅Copilot | ❌ | 部分 | ❌ | ? | Web | ~$470 |
| Perplexity Fin | AI搜索 | ✅问答+agent | ❌ | ❌ | ❌ | 弱 | Web | Pro含 |
| Public Alpha | 券商+AI | ✅副驾+Agent | ❌ | ❌ | ❌ | ❌ | App | 免费 |
| eToro | 社交跟单 | ✅Tori+组合 | ❌ | ❌ | — | ❌ | App | 免佣 |
| TradingView | 图表霸主 | ✅Copilot(beta) | ❌ | 筛选 | ✅Pine | 部分 | Web | $155–600 |
| Tickertape(印) | 研究 | ✅情绪+预测 | ❌ | ✅Scorecard | ❌ | ❌(印) | Web | ~$29 |
| Moomoo | 券商 | ✅日报+形态 | ❌ | ❌ | ❌ | 港美 | App | 免佣 |
| 同花顺问财 | 综合 | ✅NL选股+大模型 | ❌ | ✅诊股 | ✅ | ✅✅ | App/PC | 免费+会员 |
| 东财妙想 | 综合 | ✅大模型+研报 | ❌ | ✅ | ❌ | ✅✅ | App | 免费 |
| 雪球 | 社区 | 弱 | ❌ | ❌ | 组合 | ✅ | App | 免费 |
| Composer | 无代码量化 | ✅NL建策略 | ❌ | ✅ | ✅秒级 | ❌ | Web | 订阅 |
| Stockopedia | 量化评分 | ❌因子 | ❌ | ✅StockRank | ✅ | ❌ | Web | ~$300 |

**独占格**：同时打勾「多大师 + 量化 + 回测 + A股原生 + 桌面」的，全表仅 StockAI 一家。ai-hedge-fund 最接近，但缺 A 股 + 缺产品化。

---

## 2. 四赛道纵向梯队（StockAI 的深度坐标）

### 梯队 A｜投资大师选股（核心赛道）
```
浅 ① 持仓跟踪      Dataroma(免费)/WhaleWisdom/HedgeFollow/GuruFocus   "大师现在买了啥"
   ② 量化规则打分   Validea / AAII / Stock Rover                     "符合大师规则吗"(0-100%,可复现,20年回测)
深 ③ AI 语义分析    ★StockAI / ai-hedge-fund / GuruAgents            "大师本人会怎么评"(灵活,不可复现)
```
- **Validea = 商业鼻祖**：20+ 大师量化模型（Buffett/Graham/Lynch/Greenblatt/O'Shaughnessy…），纯规则打分 0–100% match，付费信任锚是「**大师策略组合 + 20 年净值跑赢 S&P**」。它**没有** Burry/木头姐这类叙事型当代人物——这是 LLM 路线（StockAI）的天然优势。
- 第 ③ 层目前几乎全是开源未商业化 → StockAI 做成桌面成品有**先发卡位**。

### 梯队 B｜评分体系方法论
```
公允价值折现型  Morningstar 星级(DCF+护城河+不确定性带)  ← 金标准
盈利修正型      Zacks Rank(只看EPS预期修正)
多因子相对排名  Seeking Alpha Quant(A+~F,行业内分位) / Zacks Style
分析师情绪聚合  TipRanks(8因子) / MarketBeat
AI预测型        Danelfin / 晨星Quant / ★StockAI量化四维
```
StockAI 方法论不落后，差距在**呈现层可解释性**（见 §5 借鉴清单）。

### 梯队 C｜AI 渗透度
```
0档 无AI          screener.in / justETF / Finviz / Koyfin
1档 摘要+情绪      Tickertape / Webull News
2档 结构化评分     楽天×BridgeWise(AI目标价) / Moomoo(自动日报) / Danelfin   ← StockAI 量化评分
3档 AI副驾/Agent   Public Alpha / eToro Tori / Webull Vega / ★StockAI多大师
```
StockAI 横跨 2–3 档，**不落后**。方向性信号：**Public 2025/6 主动砍社交 feed 全面转 AI**，验证「AI 内容 > 社交」。

### 梯队 D｜图表能力
```
展示型图表   ★StockAI(lightweight-charts: K线+指标+实时合并)
交互分析型   TradingView(画线/Pine脚本/图上回测/多图)
```
**建议不正面拼**——TradingView 的 Pine + 10 万社区脚本是十年护城河。

---

## 3. 关键竞品深拆：ai-hedge-fund（StockAI 的开源镜像）

> 源码逐文件比对（ai-hedge-fund MIT，借鉴思路合规）。本质差异不在「几位大师」，而在**喂给大师的数据质量**和**信号如何变成可验证决策**。

| 维度 | ai-hedge-fund | StockAI | 谁强 |
|---|---|---|---|
| 大师 prompt | **先用代码算因子**（护城河/owner earnings/三阶段DCF），LLM 只收敛判断，prompt 明令 "Do not invent data" | 阈值写进 prompt 文本让 **LLM 自己套**（ROE>15% 等），无预计算 | ai-hedge-fund |
| 数据注入 | 结构化多期（10 期 ttm + line items：净利/capex/D&A/股本…），每位大师按需取不同字段 | `quant.fundamental.details` 当期快照 + **5 条新闻标题** | ai-hedge-fund |
| 每位大师专属逻辑 | 巴菲特独有 `analyze_moat`/DCF；伍德独有 R&D/TAM | 全走同一 `createMasterAgent` 工厂，仅 prompt 措辞不同 | ai-hedge-fund |
| 决策收敛 | risk_manager(波动率+相关性算仓位)→ portfolio_manager 代码先圈**合法动作+max股数**，LLM 在集合内挑 | synthesizer 让 LLM 出 signal/confidence，**有本地加权投票兜底** | 偏 ai-hedge-fund（但 StockAI 兜底更稳） |
| 风控 | **独立 risk agent**：60日波动率→仓位上限(低波25%/高波10%)，相关>0.8 砍 0.7x | **无独立风控**，波动率仅作评分维度不转化为仓位约束 | ai-hedge-fund（StockAI 明显缺口） |
| 回测 | BacktestEngine 逐日**重放整条多agent管线**→组合净值/Sharpe，真回测"大师策略" | `runBacktest` 仅按**单一技术合成分**(MA/RSI 滑窗)，**一行大师/LLM 都没碰** | ai-hedge-fund（本质差距） |

**StockAI 反而更强**：A 股原生（ai-hedge-fund 依赖美股付费数据源，A股几乎不可用）、桌面化产品形态、多 provider + 多语言（zh/en/ja 全链路）、新闻深度抓取、本地兜底更稳健、自实现并发限流。

**一句话总评**：ai-hedge-fund 强在「用确定性代码把财务因子算透、LLM 只收敛」+ 真风控 + 真大师策略回测的完整闭环；StockAI 强在产品化/A股/多provider/新闻深抓，但大师子系统是「喂量化摘要+新闻标题让 LLM 自由发挥」。**最该补三块：(a) 大师专属因子预计算、(b) 独立风控层、(c) 让回测真正回测大师信号而非纯技术分**。

### 关键文件索引
- ai-hedge-fund：`src/agents/warren_buffett.py`（因子预计算典范）、`portfolio_manager.py:96-157`（合法动作约束）、`risk_manager.py:270-317`（波动率/相关性仓位）、`src/backtesting/engine.py:132-161`（大师策略回测）
- StockAI：`sidecar/agents/masters/factory.ts`（同质化工厂）、`masters/warren-buffett.ts:39-73`（数据注入薄）、`agents/synthesizer.ts`（单点收敛+本地兜底）、`backtest/engine.ts:76-103`（纯技术回测，无大师）、`quant/scoring.ts`

---

## 4. StockAI 差距分析

### 功能差距（按「该不该补」分级）

**🔴 强烈建议补（全球/国内已成标配）**
1. **对话式追问（Chat with your stock）** — 全球 ~10/13 竞品标配。StockAI 是「触发式一次性分析」，无法追问。改造成本低（已有 provider 抽象 + 抓取上下文）。
2. **财报/公告/新闻问答（RAG）** — Aiera/FinChat/Perplexity/Bloomberg 全做，最普适杀手级用例。已抓正文，差一个针对抓取内容的问答入口。
3. **A 股特色数据** — 资金流向、龙虎榜、涨跌停/连板、F10、概念板块、研报聚合。国内「专业度」硬门槛。⚠️北向资金实时披露 2024 起被监管收紧为延迟/汇总，别再当卖点。

**🟡 值得做（差异化加分）**
4. 自然语言选股（对标问财；六家传统巨头都没有，2025 分水岭）
5. 多空辩论机制（抄 TradingAgents，升级 synthesizer）
6. 组合管理 / 持仓成本追踪（现仅自选股）
7. 可溯源 / 抗幻觉（Perplexity 带引用、Danelfin 无黑箱）

**⚪ 可不做（壁垒高/不符定位）**：券商下单集成、可视化 agent 拖拽编排、正面拼图表引擎。

### 性能差距

| 维度 | 现状 | 差距/风险 |
|---|---|---|
| 数据源质量 | Google News RSS 抓取 + K 线多源回退 | 商用对手用 S&P CapitalIQ/LSEG/Bloomberg 授权数据，结构化、时效高。抓取路线**稳定性与数据深度是天花板** |
| 分析延迟 | 见 §6 性能体检 | 15 次 LLM 调用，无缓存 |
| 实时性 | 仅交易时段轮询 | 对手有 WebSocket/Level-2 |
| 可解释性 | 大师评分聚合 | 缺因子下钻（Danelfin/Stockopedia 卖点） |

### 图表功能成熟度差距清单（vs TradingView）
画线标注工具（lightweight-charts 先天缺）、自定义指标脚本、图上回测可视化（引擎已有、缺叠加层）、多图布局、多标的对比叠加、盘前盘后、秒级周期、自动形态识别、告警系统。**优先补三件**：画线标注 → 回测结果图上可视化 → 多周期对比。

---

## 5. 借鉴清单（汇总两轮调研）

| # | 借鉴 | 抄谁 | 价值 |
|---|---|---|---|
| 1 | **虚拟大师组合 + 净值曲线 + 命中率榜** | eToro CopyTrader | 极高·独占（见 §7 设计） |
| 2 | **大师专属因子预计算**（代码算、LLM 判断） | ai-hedge-fund | 抗幻觉关键 |
| 3 | **独立风控层**（波动率→建议仓位上限%） | ai-hedge-fund | 低成本高感知 |
| 4 | **回测真正回测大师信号**（非纯技术分） | ai-hedge-fund | 修认知落差 |
| 5 | 量化评分可下钻（通过/未通过 check 项）+ 展示**大师分歧度** | Simply Wall St / Seeking Alpha | 信任·低成本 |
| 6 | 不确定性带（用波动率维度做代理，数据缺失→收敛中性） | Morningstar | 防虚假精确 |
| 7 | 结构化 AI 输出（目标价区间 + 同业相对位置） | 楽天×BridgeWise | 可决策 |
| 8 | 多期历史财务注入（trend > snapshot） | ai-hedge-fund | 判断持续性 |
| 9 | 体检红旗清单 + 恐惧贪婪指数（呈现层傻瓜化） | Tickertape | 易读 |
| 10 | 诚实披露口径（连**卖出端/低分股**表现都披露） | Seeking Alpha | 可信度 |
| 11 | MCP server 对外暴露（让外部 AI 助手查询） | Groww MCP | 新趋势·低成本 |

**A 股战略空白**：A 股**没有消费级的「中证版晨星/Seeking Alpha」**——只有机构端（朝阳永续/Wind）和分散研报/金股。把「量化四维 + 多大师 + 可下钻」做成中文消费级桌面产品，**在 A 股几乎无正面竞品**，比在美股红海拼 Validea/Danelfin 更可行。

---

## 6. 机会矩阵（按 ROI 排序）

| 优先级 | 动作 | 差异化价值 | 实现成本 |
|---|---|---|---|
| **P0** | 对话式追问 | 高(全球标配) | 低 |
| **P0** | 虚拟大师组合+净值榜 | 极高(独占) | 中 |
| **P0** | 13大师缓存 + 修「正文白抓」 | 高(体感+成本) | 低 |
| **P1** | 量化评分可下钻+大师分歧度 | 高(信任) | 低 |
| **P1** | 独立风控层(波动率→仓位) | 高(感知) | 低 |
| **P1** | A股特色数据(资金流/龙虎榜/F10) | 高(国内门槛) | 中 |
| **P1** | 大师专属因子预计算(抗幻觉) | 高(可信) | 中 |
| **P2** | 自然语言选股 | 中(对标问财) | 中-高 |
| **P2** | 回测回测大师信号 | 中(修认知) | 中-高 |
| **P3** | MCP server 对外暴露 | 中(新趋势) | 低 |
| ❌ | 拼图表引擎/券商下单 | — | 极高 |

---

## 7. 虚拟大师组合设计方案

### 核心约束
LLM 大师的历史 signal **无法重现**（不能对过去每天重跑 13×LLM——太贵 + 前视偏差）。故采用双轨：

- **轨道 A · 前向跟踪（主力·诚实·差异化）**：从上线起，每次深度分析落账 `(masterId, symbol, signal, confidence, 当时价, ts)`，之后用真实行情持续重估净值。零前视、复用已产出的 `MasterSignal`、是 eToro「Popular Investor 业绩史」同构物。缺点：需时间积累。
- **轨道 B · 量化代理回测（冷启动补充）**：把大师风格翻译成确定性规则（如 Validea），历史回测立刻出曲线。**必须 UI 明示「策略代理回测，非 AI 实判」**，否则违背诚实披露。
  > ⚠️ **数据约束（2026-05-31 落地时发现）**：轨道 B 对**价值派大师不可行**——它需要历史每个时点的 ROE/PE/负债率等基本面数据跑「巴菲特规则」，但 `quant` 只有当期快照、无历史财务序列（见 §3 ai-hedge-fund 对比「缺多期历史财务」）。没有历史基本面，价值派（巴菲特/芒格/格雷厄姆/林奇…占多数）无法代理回测；仅技术/动量派（伯里/德鲁肯米勒）可。**轨道 B 的前置是先补历史财务数据能力**，否则只能退化成纯技术回测（失去「大师」意义）。

### 与现有代码的接口（高复用）
| 复用 | 怎么接 |
|---|---|
| `MasterSignal{masterId,signal,confidence,reasoning}` | 轨道 A 落账原始记录，已在产出，零改造 |
| `synthesizer.computeLocalSynthesis` | 直接得「议会共识组合」持仓方向 |
| `backtest/engine.ts`（dailyReturns/computeSharpe/computeMaxDrawdown/equityCurve） | 净值计算直接复用，只换信号源 |
| `kline/` 多源 K 线 | 重估持仓市值的价格源 |
| `@tauri-apps/plugin-sql`（分析历史已在用） | 落账表载体 |

**数据结构（SQLite）**
```
master_signals_log(id, master_id, symbol, signal, confidence, price_at, ts)
master_nav_daily(master_id, date, nav, benchmark_nav)
-- 命中率榜 = master_signals_log 聚合：signal 方向 vs 后续 N 日真实涨跌
```

**新增 CLI action**（延续 `--quant`/`--backtest` 模式）
- `--master-portfolio <masterId>`：该大师虚拟组合 `equityCurve + 指标 + 当前持仓`
- `--master-leaderboard`：13 大师历史命中率/收益排行

**UI 落点**：`BacktestPanel` 旁加「大师战绩」Tab，或大师卡片加迷你净值 sparkline + 命中率徽章（呼应 Tickertape 傻瓜化结论 + Moomoo 虚拟交易大赛可玩性）。

**MVP 切法**：① 轨道 A 落账（零 LLM 成本）✅ **已 ship（commit ef85992，master_signals 表 + 深度分析时落账）** → ② 命中率榜 + ③ 净值曲线 ✅ **已 ship（commit fbd231c，展示层）** → ④ 轨道 B（**阻塞于历史财务数据**，见上方约束）。

> **②③ 落地实现说明（2026-05-31）**：偏离上文「新增 CLI action」方案——`master_signals` 是纯前端 `@tauri-apps/plugin-sql` 表，sidecar 独立进程读不到，故 `--master-leaderboard` 会破坏单向分层。改为**全前端聚合**：`src/lib/masterPortfolio.ts`（纯计算，命中率 + NAV 顺序复利，9 单测）+ `useMasterPortfolio`（懒加载、按 symbol 去重并发回查现价）+ `MasterPortfolio/` UI（折叠面板 + SVG 净值 sparkline + 诚实口径披露），挂在 `AnalysisPanel`。**口径**：仅方向信号(排除中性) · 自记录价 mark-to-current · NAV 等额全仓顺序复利(含未平仓浮盈)。**同时修了落账 bug**：此前 `saveMasterSignals` 没传 priceAt（恒 null，无法裁决），现传 `stockInfo.price`。**已知性能取舍**：刷新时对历史全部 symbol 各拉一次报价，随表增长无上限——表大了再上 SQL 侧聚合/缓存。

**风险**：业绩展示必须诚实披露口径（样本量/是否模拟/时间窗）。Seeking Alpha「连卖出端都披露」是正面教材，Zacks/TipRanks「只晒买入端回测」是反面。

---

## 8. 13 大师链路性能体检

### 调用图谱
一次深度分析 = **15 次 LLM 调用**（13 大师 + 1 情绪 + 1 综合）。13 大师按 `MAX_CONCURRENCY=4` 跑 → 4 批串行；情绪与大师并行；综合串在最后。

### 延迟模型
设单次 LLM 往返 `t`（3–8s）：大师阶段 `≈4t` + 综合 `≈1t` = **LLM 部分 ≈5t ≈ 15–40s**，加抓取 2–5s。
Token 粗估 ≈ 15k–25k input + ~3k output（GPT-4o 类 $0.04–0.07/次，DeepSeek/GLM 便宜约 10×）。

### 五个真问题（按 ROI）
| # | 问题 | 证据 | 建议 |
|---|---|---|---|
| 1🔴 | **无结果缓存** | 全链路无 cache，同股+同新闻重复点全量重跑 | `(symbol+newsHash+masterSet+lang+model)` 为 key 做 TTL≈10min LRU |
| 2🔴 | **deepMode 抓的正文，大师没吃到** | `warren-buffett.ts:69` 只喂 5 条**标题**；正文仅 sentiment 用 | 大师 prompt 注入正文摘要，或纯大师路径关 deepMode |
| 3🟡 | 并发上限 4 偏保守 | `deep-analysis.ts:8` 写死 4 | 按 provider 区分：云端 8–10，**Ollama 1–2** |
| 4🟡 | synthesize LLM 可省 | 已有 `computeLocalSynthesis` 兜底 | 默认本地合成，仅用户展开「委员会点评」才调 LLM |
| 5🟡 | 情绪 prompt 输入膨胀 | `sentiment.ts:31` 每条塞 300 字正文 | 情绪也限条数/只用标题+短摘要 |

**健壮性 ✅**：每大师 try/catch 降级 + synthesize 本地兜底 + 抓取 allSettled，容错扎实。
**结论**：架构合理，两个「漏钱点」——无缓存、正文白抓——修完体感和成本明显改善，改动局部低风险。

---

## 9. 主要来源

- **大师/对冲基金**：[ai-hedge-fund](https://github.com/virattt/ai-hedge-fund) · [TradingAgents](https://github.com/TauricResearch/TradingAgents) · [Validea](https://www.validea.com/gurus) · [GuruFocus](https://www.gurufocus.com/glossary/gf_score) · [GuruAgents arXiv:2510.01664](https://arxiv.org/abs/2510.01664)
- **评分体系**：[Morningstar Ratings](https://www.morningstar.com/company/ratings) · [Zacks Rank](https://www.zacks.com/stocks/zacks-rank) · [SA Quant](https://help.seekingalpha.com/premium/quant-ratings-and-factor-grades-faq) · [TipRanks Smart Score](https://www.tipranks.com/glossary/s/smart-score) · [Danelfin](https://danelfin.com/how-it-works) · [Simply Wall St 开源模型](https://github.com/SimplyWallSt/Company-Analysis-Model)
- **AI 原生分析**：[FinChat/Fiscal.ai](https://www.wallstreetzen.com/blog/finchat-io-fiscal-ai-review/) · [Public Alpha](https://public.com/alpha) · [Perplexity Finance](https://www.perplexity.ai/finance) · [Aiera](https://aiera.com/platform/) · [Bloomberg AI](https://professional.bloomberg.com/products/bloomberg-terminal/ai/)
- **图表/筛选/社区**：[TradingView Pricing](https://www.tradingview.com/pricing/) · [Finviz Elite](https://finviz.com/elite) · [Seeking Alpha](https://seekingalpha.com/subscriptions)
- **中国市场**：[同花顺 i问财](https://www.iwencai.com/) · 东方财富妙想 · 雪球 · [2025 券商金股(新浪)](https://finance.sina.com.cn/roll/2025-12-31/doc-inhesxnh9012817.shtml)
- **其他地区/社交**：[Tickertape](https://www.tickertape.in/) · [screener.in](https://www.screener.in/) · [Groww MCP](https://groww.in/updates/groww-mcp) · [楽天×BridgeWise](https://www.rakuten-sec.co.jp/web/info/info20250718-01.html) · [eToro CopyTrader](https://www.etoro.com/copytrader/how-it-works/) · [Webull Vega](https://www.webull.com/news/13833094760489984)
