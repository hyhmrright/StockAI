# Release Checklist

发版时必须按顺序完成以下所有步骤，缺一不可：

## 1. 版本号同步（3 个文件）

| 文件 | 字段 |
|------|------|
| `src-tauri/tauri.conf.json` | `version` |
| `src-tauri/Cargo.toml` | `version`（`[package]` 段） |
| `package.json` | `version` |

一键同步：`bun run bump-version <x.y.z>` 先 dry-run 预览，确认后 `bun run bump-version <x.y.z> --write` 写盘。

## 2. CHANGELOG.md

在文件顶部插入新版本条目，格式：

```
## [x.y.z] - YYYY-MM-DD

### Added / Fixed / Changed
- ...
```

## 3. 确认 main 分支 CI 全绿

打 tag 前，必须确认 `main` 分支的所有 CI checks 均已通过：

```bash
gh run list --branch main --limit 5
```

若最新 run 状态不是 `completed / success`，**禁止打 tag**。找到失败的 job、修复后重新推送，等 CI 再次全绿后再继续。

## 4. 打 Tag 触发 Release CI

```bash
git tag vx.y.z
git push origin vx.y.z
```

CI（`release.yml`）会自动构建三平台产物，**并直接发布（publish）为正式 Release**（不是 Draft）。也就是说，tag 一推、CI 一绿，Release 就公开上线、自动更新立即推送给老用户——**没有「人工 review Draft 再发布」这道闸门**，所以打 tag 前务必确认第 3 步 CI 全绿、版本号与 CHANGELOG 都已就绪。

> **自动更新前置条件（首次配置后长期有效）**：仓库 Secrets 须包含 `TAURI_SIGNING_PRIVATE_KEY` 与 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（由 `bun tauri signer generate` 生成的 minisign 私钥及密码），且 `tauri.conf.json` 的 `plugins.updater.pubkey` 已填对应公钥。缺失时 CI 仍能出包，但**不会生成 `.sig` 与 `latest.json`**，自动更新失效。

> **已知 flaky：AppImage 上传偶发超时**。Linux 的 `.AppImage`（~100MB）经 tauri-action 上传到 Release 时偶发 `Headers Timeout Error`（**非构建问题**，AppImage 已成功打出，仅上传失败）。处理：`gh run rerun <run-id> --failed` 重跑失败的 Linux job 即可，无需改代码或重打 tag。

## 5. 覆盖 Release Notes（CI 已自动发布，需事后覆盖）

⚠️ Release 已由 CI **自动发布**，默认带的是 GitHub 自动生成的简略说明（commit 列表，~100 字符）。必须事后用双语 notes 覆盖：

```bash
# 先把下方双语模板写入临时文件，再覆盖（不会动产物，只改正文）
gh release edit vx.y.z --notes-file /tmp/stockai-vx.y.z-notes.md
```

覆盖后核对：
- **Release title**：`StockAI vx.y.z`（CI 默认就是 tag 名，如需调整 `--title`）
- **Release notes**：使用下方双语模板，**中英文各一份，内容对等**，不得省略任一语言
- 确认产物（`.dmg` / `.deb` / `.AppImage` / `.msi`）已全部上传
- **确认 `latest.json` 已上传**（自动更新清单，更新器据此比对版本；缺失则老用户收不到更新）

> 校验产物与正文长度：`gh release view vx.y.z --json assets,body -q '.assets|length, (.body|length)'`

### Release Notes 双语模板

Release Notes 分两块书写，中文在前、英文在后，中间用 `---` 分隔。目标读者是「从未用过这个项目的开发者/投资者」，行文要让人立刻明白「这版更新了什么、值不值得装、怎么装」。

```markdown
## StockAI vx.y.z

> 一句话概括本版本核心价值（例：支持 GLM / K 线图 / 两阶段分析，让 AI 分析更快更省 token）

### ✨ 新特性 / New Features
- **功能名称**：一句话说明这个功能解决了什么问题，用户能感知到什么变化
- ...

### 🐛 修复 / Bug Fixes
- 修了什么，之前会怎么出错，现在行为是什么
- ...

### ⚡ 性能 & 体验 / Performance & UX
- 具体数字优先（「冷启动减少 1–3 秒」「LRU cache 上限防止内存泄漏」）
- ...

### 📦 安装 / Installation

**macOS**（当前构建矩阵仅出 Apple Silicon，无 Intel x64 dmg）
1. 下载 `StockAI_x.y.z_aarch64.dmg`（Apple Silicon）
2. 打开 DMG，将 StockAI 拖入 Applications
3. 首次启动若提示「无法验证开发者」：系统设置 → 隐私与安全性 → 仍要打开

**Windows**
1. 下载 `StockAI_x.y.z_x64-setup.exe`，双击安装，按向导操作即可

**Linux**
1. 下载 `StockAI_x.y.z_amd64.deb`
2. `sudo dpkg -i StockAI_x.y.z_amd64.deb`

**首次配置**
打开应用 → 右上角设置 → 填入 AI 提供商（OpenAI / DeepSeek / GLM / Anthropic / Ollama）的 API Key → 保存，即可开始使用。

### 🔗 相关链接
- [README（中文）](../blob/main/README.zh-CN.md) · [README (English)](../blob/main/README.md)
- 问题反馈：[Issues](../issues) · 功能建议：[Discussions](../discussions)

---

## StockAI vx.y.z

> One-liner on the core value of this release (e.g. GLM support / K-line charts / two-phase analysis for faster, cheaper AI insights)

### ✨ New Features
- **Feature name**: What problem it solves and what the user will notice
- ...

### 🐛 Bug Fixes
- What was broken, how it failed, what it does now
- ...

### ⚡ Performance & UX
- Prefer concrete numbers ("cold-start 1–3 s faster", "LRU cache cap prevents memory growth")
- ...

### 📦 Installation

**macOS** (current build matrix ships Apple Silicon only — no Intel x64 dmg)
1. Download `StockAI_x.y.z_aarch64.dmg` (Apple Silicon)
2. Open the DMG and drag StockAI into Applications
3. If macOS says "cannot verify developer": System Settings → Privacy & Security → Open Anyway

**Windows**
1. Download `StockAI_x.y.z_x64-setup.exe` and run the installer

**Linux**
1. Download `StockAI_x.y.z_amd64.deb`
2. `sudo dpkg -i StockAI_x.y.z_amd64.deb`

**First-time setup**
Open the app → Settings (top-right) → enter your AI provider API Key (OpenAI / DeepSeek / GLM / Anthropic / Ollama) → Save. Done.

### 🔗 Links
- [README (中文)](../blob/main/README.zh-CN.md) · [README (English)](../blob/main/README.md)
- Bug reports: [Issues](../issues) · Feature requests: [Discussions](../discussions)
```

**写作要点**（每次发版对照检查）：
- 每条改动都要说「对用户的影响」，不只是技术描述
- 新特性优先写最吸引人的，不按实现顺序
- 安装步骤要完整可执行，复制进终端就能跑
- 中英文内容必须对等，不得一方比另一方信息量少
- 避免「fix some bugs」「minor improvements」这类无意义措辞

## 6. 更新 GitHub 仓库 About

进入 GitHub → 仓库首页 → 右上角齿轮（Edit repository details）：
- **Description**：保持简短（≤ 100 字符），若有功能新增需同步更新
- **Website**：如有新的 landing page 或文档地址，一并更新
- **Topics**：若版本引入了新技术/新平台支持，追加对应 topic

## 7. 更新 GitHub Labels（按需）

若本版本引入了新的 issue 类型或工作流（如新增某 provider 的专属 bug 分类），进入 GitHub → Issues → Labels 添加对应标签。常规版本可跳过此步。
