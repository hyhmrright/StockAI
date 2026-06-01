# 发布团队（Release Team）

**模式：** 顺序执行 + 门禁（单 Agent）。发版偏确定性顺序，CI 全绿是硬闸门，团队通信收益低，故用单一 `release-manager` 执行，leader 监控门禁。

## 构成

| 成员 | agent_type | 角色 |
|------|-----------|------|
| release-manager | `release-manager` | 按 7 步 release-checklist 执行全流程 |

`model: "opus"`。委托 `/release-notes` 技能生成双语 Notes。

## 执行方式

发版以**子 Agent**调用 `release-manager`（顺序门禁流程无需 TeamCreate 开销）：

```
Agent(subagent_type: "release-manager", model: "opus",
  prompt: "执行 StockAI <x.y.z> 发版，严格按 .claude/rules/release-checklist.md。逐门禁回报，CI 未绿则停。每步结果写 _workspace/release_log.md。")
```

> 若用户希望 leader 全程紧盯并在每个门禁处确认，也可保持在主线程逐步执行（不起子 Agent），按下方步骤亲自驱动。两种方式门禁规则一致。

## 7 步门禁（摘要，详见 release-checklist.md）

1. **版本号三文件同步** — `bun run bump-version <x.y.z>` dry-run → 确认 → `--write`。校验 `tauri.conf.json`/`Cargo.toml`/`package.json`。
2. **CHANGELOG.md** — 顶部插入 `## [x.y.z] - YYYY-MM-DD`，从 git log 提炼对用户的影响。
3. **CI 全绿门禁（硬）** — `gh run list --branch main --limit 5`，非 success **禁止打 tag**。
4. **打 tag** — `git tag vx.y.z && git push origin vx.y.z`，CI 自动构建三平台并 publish。AppImage 上传超时 → `gh run rerun <id> --failed`。
5. **覆盖双语 Release Notes** — `/release-notes` 生成 → `gh release edit vx.y.z --notes-file ...`。核对 title、中英对等、产物齐全、**latest.json 已上传**。校验 `gh release view vx.y.z --json assets,body -q '.assets|length, (.body|length)'`。
6. **仓库 About**（按需）— 新功能/平台时更 Description/Topics。
7. **Labels**（按需）。

## 门禁与高风险纪律

- 第 3 步 CI 未绿 → **硬停**，报告失败 job，不强推 tag。
- 版本号未在三文件对齐 → 不进入第 4 步。
- `git push --force`、`git reset --hard`、`--no-verify`、对已推送 commit `--amend`/rebase → 需**用户显式授权**（用户全局高风险操作规则），release-manager 不擅自执行。
- Release CI 直接 publish（非 Draft），tag 一推即上线并推送自动更新——故打 tag 前务必确认前 3 步就绪。

## 上下文确认（续跑）

若 `_workspace/release_log.md` 已存在（如 CI 重跑后续作），读取后从中断门禁继续，不重复已完成步骤（已 bump 的版本号、已写的 CHANGELOG 不重做）。

## 测试场景

**正常流**：用户「发 v0.12.2」→ bump-version dry-run 预览 → 确认 → write → CHANGELOG 插条目 → `gh run list` 确认 main 全绿 → 打 tag 推送 → CI 绿后 `/release-notes` 生成双语 → `gh release edit` 覆盖 → 校验 12 产物 + latest.json → 完成。

**错误流**：第 3 步 `gh run list` 显示最新 run failure → 硬停，报告失败 job 名 → 不打 tag → 待用户修复 main 并 CI 再次全绿后，从第 3 步续跑。
