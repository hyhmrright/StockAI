# 审查团队（Review Team）

**模式：** Agent 团队 — fan-out/fan-in。4 个审查员并行审查同一变更集，leader 汇总去重。

## 团队构成

| 成员 | agent_type | 审查维度 | 输出 |
|------|-----------|---------|------|
| api-key-security | `api-key-security-reviewer` | API key 传递链安全、日志泄漏、redact 覆盖 | `_workspace/review_api-key-security.md` |
| i18n-consistency | `i18n-consistency-reviewer` | zh/en/ja key 对齐、硬编码 UI 文案 | `_workspace/review_i18n.md` |
| layer-boundary | `layer-boundary-reviewer` | 单向依赖、shared 单一来源、stdout 纯净、config 流转、注册纪律 | `_workspace/review_layer-boundary.md` |
| code-quality | `code-quality-reviewer` | 逻辑 bug、组件 200 行、hook 抽取、测试解耦、注释中文 | `_workspace/review_code-quality.md` |

全部 `model: "opus"`。

## 执行步骤

### 1. 确定审查范围
默认审查未提交变更：`git diff`（含 `git diff --staged`）。用户指定 PR/文件/commit 时以其为准。把范围（文件列表 + diff）写入 `_workspace/00_scope.md`。

### 2. TeamCreate
```
TeamCreate(team_name: "review-team", members: [
  { name: "api-key-security", agent_type: "api-key-security-reviewer", model: "opus",
    prompt: "审查 _workspace/00_scope.md 列出的变更。按你的清单审查 API key 安全，结果写 _workspace/review_api-key-security.md。与其他维度重叠的发现 SendMessage 转交，避免重复。" },
  { name: "i18n-consistency", agent_type: "i18n-consistency-reviewer", model: "opus",
    prompt: "审查变更的 i18n 三语对齐与硬编码文案，写 _workspace/review_i18n.md。" },
  { name: "layer-boundary", agent_type: "layer-boundary-reviewer", model: "opus",
    prompt: "审查三层架构边界与 stdout 纯净，写 _workspace/review_layer-boundary.md。" },
  { name: "code-quality", agent_type: "code-quality-reviewer", model: "opus",
    prompt: "审查逻辑正确性与质量约束，写 _workspace/review_code-quality.md。" },
])
```

### 3. TaskCreate
每个审查员一个审查任务，指向 `_workspace/00_scope.md`，assignee 对应成员。无跨任务依赖（纯并行）。

### 4. 并行审查 + 互通
审查员各自认领任务、独立审查。跨维度发现（如「硬编码文案同时是组件超 200 行」）通过 SendMessage 转交对口审查员，避免两份报告重复同一条。leader 监控，成员空闲即收到通知。

### 5. Fan-in 汇总（leader）
全部完成后，leader `Read` 四份 `review_*.md`：
1. **去重**：同一文件:行号的重复发现合并，保留最严重维度的描述。
2. **按严重度排序**：逻辑 bug / 架构契约破坏 / 安全高危 > i18n 缺字、约束违反 > 风格。
3. 产出**统一审查报告**：每条含 `维度 | 文件:行号 | 问题 | 后果 | 修复建议`。
4. 给出整体结论：可合并 / 需修复后再合并（列出阻塞项）。

### 6. 清理
`TeamDelete`。保留 `_workspace/`。向用户呈现统一报告。若用户接着要求「修复这些」，按发现逐项修复（可转交对应工程师 Agent 或直接改），改后建议重跑相关审查员复验。

## 与全局工作流衔接

用户全局 CLAUDE.md 的代码变更流程是 simplify→review→commit。本审查团队对应 review 环节；审查通过且用户认可后，按其全局规则自动 commit & push（直推 main 模型，见项目记忆 workflow-direct-to-main）。

## 错误处理

- 某审查员失败：重试 1 次；再失败在报告标注「X 维度未覆盖」并继续。
- 范围为空（无 diff）：提示用户无变更可审，不起团队。
