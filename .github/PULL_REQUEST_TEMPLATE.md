<!--
感谢提交 PR！请填写以下内容，并确保通过检查清单。
Thanks for the PR! Please fill in the sections and complete the checklist.
-->

## 改动说明 / What does this PR do?

<!-- 简要描述这个 PR 做了什么、为什么 / Briefly describe what and why -->

## 关联 Issue / Related Issue

<!-- 如有，关联 issue：Closes #123 / Link the issue if any -->

## 改动类型 / Type of change

- [ ] 🐛 Bug 修复 / Bug fix
- [ ] ✨ 新功能 / New feature
- [ ] 🔄 重构 / Refactor
- [ ] 📝 文档 / Documentation
- [ ] ⚡ 性能 / Performance
- [ ] 🧪 测试 / Tests

## 影响的层 / Layers affected

- [ ] 前端 `src/` / Frontend
- [ ] Tauri Core `src-tauri/` / Rust core
- [ ] Sidecar `sidecar/`
- [ ] 共享层 `shared/` / Shared (single source)

## 检查清单 / Checklist

- [ ] `bun run test` 全部通过 / All tests pass
- [ ] `bunx tsc --noEmit` 与 `cargo check` 无报错 / Type checks clean
- [ ] 新增逻辑有对应单元测试 / New logic has unit tests
- [ ] 行内注释使用简体中文 / Inline comments in Simplified Chinese
- [ ] UI 组件 < 200 行 / UI components under 200 lines
- [ ] 新增 UI 文案已在 `src/i18n/zh.json` 加 key 并三语对齐 / i18n keys added and aligned (zh/en/ja)
- [ ] 跨层改动已同步 `shared/` 唯一来源 / Cross-layer changes update the shared source

## 截图 / Screenshots（如有 UI 改动 / if UI changed）
