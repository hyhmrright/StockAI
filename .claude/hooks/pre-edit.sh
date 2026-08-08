#!/usr/bin/env bash
# Claude Code PreToolUse hook（Edit|Write|MultiEdit）。
# stdin 只能读一次，故一次性取出「目标路径 + 本次写入的全部新内容」，再依次做两道检查：
#   ① 编辑 CI 门禁文件 → 仅警告（stderr），不阻断
#   ② 疑似硬编码 API Key → exit 2 阻断
# key 只应存于 Tauri store，运行时经 Rust 的 @config 哨兵写 0o600 临时文件注入 Sidecar，绝不入源码。

# 第 1 行是 file_path，其余是新内容（Write.content / Edit.new_string / MultiEdit.edits[].new_string）。
payload=$(python3 -c "
import sys, json
d = json.load(sys.stdin).get('tool_input', {})
parts = [d.get('content') or '', d.get('new_string') or '']
parts += [(e.get('new_string') or '') for e in (d.get('edits') or [])]
print(d.get('file_path') or '')
print(chr(10).join(parts))
" 2>/dev/null)

file=$(printf '%s' "$payload" | head -1)
content=$(printf '%s' "$payload" | tail -n +2)

# ① CI 门禁文件提醒：这些文件一旦改错，要么放行坏代码，要么全员推不上去。
case "$file" in
  *lefthook.yml|*/.github/workflows/*|*biome.json)
    echo "⚠️  正在编辑门禁文件：$file —— 确认此改动有意为之（改坏会让 CI 失效或全员无法推送）。" >&2
    ;;
esac

# ② 硬编码 API Key 扫描。
# 注：sk-/AIza 之外的形态（如 GLM 的 {id}.{secret}）未覆盖——点分格式误报率过高，
#     此处是防御纵深而非完备校验。
hits=$(printf '%s' "$content" | grep -nE 'sk-(ant-)?[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,}' 2>/dev/null)
if [ -n "$hits" ]; then
  echo "⚠️  检测到疑似硬编码 API Key，禁止写入源码（key 只应存于 Tauri store，运行时经 Rust→Sidecar 注入）。命中：" >&2
  echo "$hits" >&2
  exit 2
fi

exit 0
