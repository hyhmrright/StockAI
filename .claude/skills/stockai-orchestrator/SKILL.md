---
name: stockai-orchestrator
description: StockAI 的总编排器，按请求类型分诊到「审查 / 功能开发 / 发布」三个 Agent 团队。代码改完要审查、跨三层加新功能、发版出新版本、以及对这些结果的后续修改/重跑/补充/更新/部分重做时，都用此技能。简单单点问题或单文件小改可直接处理，无需起团队。
---

# StockAI Orchestrator

StockAI 的总编排器，把请求分诊到三个专家 Agent 团队，协调多 Agent 协作产出。复用项目已有的审查员、生成技能与发布清单。

## 实行模式：混合（Hybrid）

| 工作流 | 模式 | 模式选择理由 |
|--------|------|------|
| 审查（Review） | Agent 团队（fan-out/fan-in） | 4 个审查员并行，发现互通、避免重复报告，交叉验证提升质量 |
| 功能开发（Feature） | Agent 团队（pipeline + 并行实现） | 架构师→前后端并行实现→QA，工程师间实时对齐接口 shape |
| 发布（Release） | 顺序执行 + 门禁（单 Agent） | release-checklist 偏确定性顺序，CI 全绿是硬闸门，团队通信收益低 |

## Phase 0：分诊（必做第一步）

判断请求属于哪类工作流，路由到对应 reference：

| 信号 | 工作流 | 加载 reference |
|------|--------|------|
| 「审查这段/这个 PR」「改完了帮我看看」「能合并吗」「review」「提交前检查」 | **审查** | `references/review-team.md` |
| 「加个功能」「新增 X」「跨层实现 Y」「让它支持 Z」 | **功能开发** | `references/feature-team.md` |
| 「发版」「出 vx.y.z」「release」「打 tag」「更新版本」 | **发布** | `references/release-team.md` |
| 「加 provider / 大师 / 抓取策略」 | **直接技能**（无需团队） | 触发 `/add-provider`、`/new-master-agent`、`/new-strategy` |
| 单点事实问题、单文件 typo/注释小改 | **直接处理** | 不起团队 |

分诊不明确时，向用户澄清属于哪类，而非默认起最大的团队。

## Phase 1：上下文确认（后续作业支持）

起团队前确认是初次还是续作：

1. 检查 `_workspace/` 是否存在。
2. 决定执行模式：
   - **`_workspace/` 不存在** → 初次执行，建 `_workspace/`，进入对应工作流。
   - **存在 + 用户要求部分修改/补充/重跑某部分** → 部分重执行：只重启相关 Agent，读取旧产物增量更新。
   - **存在 + 提供了新输入（新的审查对象/新功能/新版本）** → 新执行：把旧 `_workspace/` 移到 `_workspace_prev/`，再建新的。
3. 部分重执行时，把旧产物路径写进 Agent 提示，让其读取并基于反馈改进。

## Phase 2：加载工作流 reference 并执行

读取 Phase 0 选定的 reference 文件，按其中的团队构成、TeamCreate/TaskCreate 配置、数据流与门禁执行。各 reference 自带：

- **审查**：`references/review-team.md` — 4 审查员 fan-out（api-key-security / i18n-consistency / layer-boundary / code-quality），leader 汇总去重成统一报告。
- **功能开发**：`references/feature-team.md` — feature-architect 出蓝图 → backend-engineer + frontend-engineer 并行实现（实时对齐 shape）→ integration-qa 增量验证。
- **发布**：`references/release-team.md` — release-manager 按 7 步清单执行，CI 全绿硬门禁，双语 Notes 覆盖。

## 数据传递协议

- **文件基**（跨 Phase/Agent 产物）：统一写 `_workspace/`，命名 `{workflow}_{agent}_{artifact}.md`；最终报告/产物输出到用户指定处或仓库，`_workspace/` 保留供审计。
- **消息基**（团队内实时）：`SendMessage` 用于审查员互通发现、前后端对齐接口 shape、QA 反馈。
- **任务基**（团队协调）：`TaskCreate`/`TaskUpdate` 管理依赖与认领，每团队成员 4~6 个任务为宜。

## 错误处理

| 情况 | 策略 |
|------|------|
| 某 Agent 失败/中止 | 1 次重试；再失败则在报告中标注该维度缺失并继续，不阻塞其余 |
| 过半 Agent 失败 | 停下，告知用户并确认是否继续 |
| 团队成员数据冲突 | 标注出处后并列保留，不删除 |
| 发布 CI 未绿 | 硬停，报告失败 job，不强推 tag |
| 高风险 git 操作（force/reset --hard/--no-verify） | 需用户显式授权，不擅自执行 |

## 测试场景

**正常流（审查）**：用户「改完了，审一下」→ Phase 0 判为审查 → Phase 1 建 `_workspace/` → 读 review-team.md → TeamCreate 4 审查员 + TaskCreate → 并行审查写各自 `review_*.md` → leader Read 汇总去重 → 输出统一报告（按严重度排序）→ 保留 `_workspace/`。

**错误流（功能开发）**：integration-qa 发现前后端 DTO shape 不一致 → SendMessage 通知 backend-engineer 字段:行号 → backend 修正并重发 shape → frontend 对齐 → QA 复验转 PASS → 若三次仍 FAIL，报告中标注该模块未通过并交还用户决策。

## 完成后

执行完一个工作流后，简要询问用户是否需要调整团队构成/流程（Phase 7 进化）；有反复出现的反馈（同类 ≥2 次）则主动提议改对应 Agent/技能，并在 CLAUDE.md 变更历史登记。
