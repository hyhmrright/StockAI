---
name: release-notes
description: 按 release-checklist 双语模板，从 git log 生成中英对等的 Release Notes 草稿
disable-model-invocation: true
---

# 生成双语 Release Notes

为发版生成「中英对等」的 Release Notes 草稿，严格遵循 `.claude/rules/release-checklist.md` 第 5 节的模板与写作要点。

## 用法

`/release-notes [起始 tag] [目标版本号]`
- 起始 tag 缺省取最近一个 tag（`git describe --tags --abbrev=0`）
- 目标版本号缺省取 `package.json` 的 `version`

## 实施步骤

### 1. 收集变更

```bash
PREV=$(git describe --tags --abbrev=0 2>/dev/null)
git log "${PREV}..HEAD" --pretty=format:'%s' --no-merges
```

读取 `.claude/rules/release-checklist.md` 拿到双语模板与写作要点（必须实时读取，模板可能已更新）。

### 2. 归类 commit

按 commit 前缀归入模板分区：
- `feat` → ✨ 新特性 / New Features
- `fix` → 🐛 修复 / Bug Fixes
- `perf` / 体验类 → ⚡ 性能 & 体验 / Performance & UX
- `refactor` / `chore` / `docs` / `test`：仅当对用户有可感知影响才写入，否则略去（Release Notes 面向用户，不是 changelog）

### 3. 改写为「面向用户」

每条都要回答「**对用户的影响是什么**」，而非技术描述。对照写作要点逐条检查：
- 新特性优先写最吸引人的，不按实现顺序
- 性能项优先给具体数字（如「冷启动减少 1–3 秒」）
- 禁用「fix some bugs」「minor improvements」这类空话

### 4. 套用双语模板输出

严格用模板结构：中文在前、英文在后、`---` 分隔。**中英文信息量必须对等**，不得一方比另一方少。安装步骤直接复制模板的三平台说明（替换版本号占位符 `x.y.z`）。

### 5. 交付

输出完整 Markdown 草稿供用户复制到 GitHub Release。不直接调用 `gh release`——发布动作由用户在确认草稿后自行执行（参见 release-checklist 第 5 节）。
