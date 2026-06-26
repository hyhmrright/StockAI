#!/usr/bin/env bash
# Claude Code PreToolUse hook（Edit|Write|MultiEdit）。
# 写入前扫描内容，命中疑似硬编码 API Key（sk-/AIza 形态）则 exit 2 拦截。
# key 只应存于 Tauri store，运行时经 Rust→Sidecar CLI 注入，绝不入源码。
# 注：sk-/AIza 之外的形态（如 GLM 的 {id}.{secret}）未覆盖——点分格式
#     误报率过高，此处为防御纵深而非完备校验。

# 从 stdin 一次性取出本次写入的全部新内容（Write.content / Edit.new_string /
# MultiEdit.edits[].new_string）。
content=$(python3 -c "import sys,json; d=json.load(sys.stdin).get('tool_input',{}); p=[d.get('content') or '', d.get('new_string') or '']; p+=[(e.get('new_string') or '') for e in (d.get('edits') or [])]; print(chr(10).join(p))" 2>/dev/null)

hits=$(printf '%s' "$content" | grep -nE 'sk-(ant-)?[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,}' 2>/dev/null)
if [ -n "$hits" ]; then
  echo "⚠️  检测到疑似硬编码 API Key，禁止写入源码（key 只应存于 Tauri store，运行时经 Rust→Sidecar CLI 注入）。命中：" >&2
  echo "$hits" >&2
  exit 2
fi
exit 0
