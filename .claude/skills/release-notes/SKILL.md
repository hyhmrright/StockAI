---
name: release-notes
description: 按 release-checklist 双语模板，从 git log 生成中英对等的 Release Notes 并写入 docs/release-notes/vx.y.z.md
disable-model-invocation: true
---

# 生成双语 Release Notes

为发版生成「中英对等」的 Release Notes，**写入 `docs/release-notes/v<x.y.z>.md`**。

> **这个文件必须随版本号、CHANGELOG 一起提交进 main，存在于被打 tag 的那个 commit 里。**
> `release.yml` 的 `verify` job 会在装依赖前校验它存在、非空、含两份 `## StockAI` 标题，缺失即数秒内失败，三平台构建不会跑。发版后不要再用 `gh release edit` 改正文——tauri-action v1 的每次重跑都会用仓库里这份覆写它。

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

读取 `.claude/rules/release-checklist.md` **第 3 节**拿到双语模板与写作要点（必须实时读取，模板可能已更新）。

### 2. 归类 commit

按 commit 前缀归入模板分区：

- `feat` → ✨ 新特性 / New Features
- `fix` → 🐛 修复 / Bug Fixes
- `perf` / 体验类 → ⚡ 性能 & 体验 / Performance & UX
- `refactor` / `chore` / `docs` / `test`：**仅当对用户有可感知影响才写入**，否则略去（Release Notes 面向用户，不是 changelog）

### 3. 改写为「面向用户」

每条都要回答「**对用户的影响是什么**」，而非技术描述。对照写作要点逐条检查：

- 新特性优先写最吸引人的，不按实现顺序
- 性能项优先给具体数字（如「冷启动减少 1–3 秒」）
- 禁用「fix some bugs」「minor improvements」这类空话

### 4. 套用双语模板写盘

严格用模板结构：中文在前、英文在后、`---` 分隔。**中英文信息量必须对等**，不得一方比另一方少。安装步骤直接复制模板的三平台说明（替换版本号占位符 `x.y.z`）。

```bash
mkdir -p docs/release-notes   # 首次发版时该目录尚不存在
```

写入 `docs/release-notes/v<x.y.z>.md`。

### 5. 本地自检（与 CI 的 verify 同口径）

别拿 CI 当 linter，推之前先在本地过一遍：

```bash
f=docs/release-notes/v<x.y.z>.md
[ -s "$f" ] && [ "$(grep -c '^## StockAI' "$f")" -ge 2 ] && echo OK || echo FAIL
```

`FAIL` 的两种成因：文件不存在/为空，或只写了一个语言版本。

### 6. 交付

向用户展示写入的完整内容供确认。**不执行 `gh release` 任何命令**——发布由 tag 触发的 CI 完成，正文自动取自这个文件（参见 release-checklist 第 3、5、6 节）。
