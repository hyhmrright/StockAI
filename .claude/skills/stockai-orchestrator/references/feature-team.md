# 功能开发团队（Feature Team）

**模式：** Agent 团队 — pipeline + 并行实现。架构师出蓝图 → 前后端并行实现（实时对齐接口 shape）→ QA 增量验证。

## 团队构成

| 成员 | agent_type | 角色 | 输出 |
|------|-----------|------|------|
| architect | `feature-architect` | 跨层蓝图、数据流、构建顺序（只读） | `_workspace/feature_blueprint.md` |
| backend | `backend-engineer` | Sidecar + Rust 实现 | `sidecar/`、`src-tauri/` + `_workspace/feature_backend.md` |
| frontend | `frontend-engineer` | shared 类型 + React/hooks + i18n | `src/`、`shared/types.ts`、`src/i18n/*` + `_workspace/feature_frontend.md` |
| qa | `integration-qa` | 边界面交叉比对 + 跑测试 | `_workspace/feature_qa.md` |

全部 `model: "opus"`。

## 前置：brainstorming

功能需求若模糊，**先与用户用 superpowers:brainstorming 厘清意图与边界**，再起团队。需求清晰后写入 `_workspace/00_requirement.md`。

## 执行步骤

### 1. TeamCreate
```
TeamCreate(team_name: "feature-team", members: [
  { name: "architect", agent_type: "feature-architect", model: "opus",
    prompt: "读 _workspace/00_requirement.md，产出跨三层实现蓝图到 _workspace/feature_blueprint.md，含数据流、改动清单、构建顺序、i18n/安全/测试影响点、验收标准。工程师提问时实时澄清。" },
  { name: "backend", agent_type: "backend-engineer", model: "opus",
    prompt: "按蓝图实现 sidecar/ 与 src-tauri/ 改动，写测试。实现后把接口/DTO 实际 shape SendMessage 给 frontend。摘要写 _workspace/feature_backend.md。" },
  { name: "frontend", agent_type: "frontend-engineer", model: "opus",
    prompt: "按蓝图实现 src/ 与 shared/types.ts 前端侧及三语 i18n。对接 backend 回报的实际 shape。摘要写 _workspace/feature_frontend.md。" },
  { name: "qa", agent_type: "integration-qa", model: "opus",
    prompt: "每个模块实现完即做增量 QA：交叉比对前后端 shape、跑相关测试与 tsc。不一致直接 SendMessage 给责任工程师。判定写 _workspace/feature_qa.md。" },
])
```

### 2. TaskCreate（带依赖）
```
TaskCreate(tasks: [
  { title: "出蓝图", assignee: "architect" },
  { title: "后端实现", assignee: "backend", depends_on: ["出蓝图"] },
  { title: "前端实现", assignee: "frontend", depends_on: ["出蓝图"] },
  { title: "增量 QA", assignee: "qa", depends_on: ["后端实现","前端实现"] },
])
```
后端与前端任务都只依赖蓝图，故蓝图完成后**并行**实现。

### 3. Pipeline 执行
- **阶段 1**：architect 出蓝图，完成后 SendMessage 通知 backend + frontend。
- **阶段 2（并行）**：backend 与 frontend 同时实现。关键纪律——**backend 一旦确定接口/DTO shape，立即 SendMessage 给 frontend**（前后端 shape 不一致是最大 bug 源，参见 QA 哲学）。蓝图歧义时向 architect 提问，必要时 architect 更新蓝图并广播。
- **阶段 3（增量）**：某模块两侧就绪后，qa 立即交叉比对该模块边界面 + 跑测试，不一致直接通知责任工程师当场修，而非等全部完成。

### 4. 收尾（leader）
1. TaskGet 确认全部完成、qa 判定 PASS。
2. 汇总改动清单与测试结果向用户呈现。
3. `TeamDelete`，保留 `_workspace/`。

### 5. 衔接审查与提交
功能实现 + QA PASS 后，按用户全局 CLAUDE.md 流程：simplify → 起**审查团队**（review-team.md）复审 → 通过后自动 commit & push（直推 main）。即「功能开发 → 审查」可链式串联。

## 错误处理

- 工程师实现失败：重试 1 次；再失败 leader 介入或把该子任务转给另一工程师。
- QA 三次仍 FAIL：报告中标注该模块未通过，交还用户决策，不强行标记完成。
- 蓝图与实现冲突：以实现期发现的真实约束为准，architect 更新蓝图，不删冲突记录。

## 测试场景

**正常流**：用户「让分析结果支持导出 CSV」→ brainstorming 厘清 → architect 蓝图（新增 sidecar `--export` flag + 前端按钮 + i18n key）→ backend 实现 flag 并回报输出 shape → frontend 加按钮/hook 对齐 shape + 三语 key → qa 比对 shape + 跑 vitest/bun test 全绿 → 审查团队复审 → commit。

**错误流**：frontend 按蓝图假设字段名 `exportUrl`，backend 实际返回 `path` → qa 比对发现不一致 → SendMessage 通知双方 → 约定以 backend 的 `path` 为准，frontend 改 → qa 复验 PASS。
