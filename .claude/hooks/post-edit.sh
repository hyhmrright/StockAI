#!/usr/bin/env bash
# Claude Code PostToolUse hook（Edit|Write|MultiEdit）。
# stdin 只解析一次，依次执行四道检查；任一需拦截即 exit 2。
# 抽成脚本（而非 settings.json 内联）的收益：每次编辑仅 1 次 stdin 解析
# （原先 4 个内联 hook 各解析一次）、可读、各 block 可独立开关。

# 仓库根：优先 Claude Code 注入的 CLAUDE_PROJECT_DIR，回退 git。
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"

# 被编辑文件的绝对路径（只解析一次 stdin）。
file=$(python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null)
[ -n "$file" ] || exit 0

# ① Sidecar stdout 纯净守卫：sidecar/*.ts 里的 console.log 会污染 JSON 输出。
case "$file" in
  */sidecar/build-script.ts|*/sidecar/*.test.ts) ;;
  */sidecar/*.ts)
    hits=$(grep -nE 'console\.log' "$file" 2>/dev/null)
    if [ -n "$hits" ]; then
      echo "⚠️  Sidecar stdout 只能输出最终 JSON，以下 console.log 会污染输出，请改用 console.error / logger（最终结果用 utils.ts 的 outputJson）：" >&2
      echo "$hits" >&2
      exit 2
    fi
    ;;
esac

# ② rustfmt 校验（.rs）。
case "$file" in
  *.rs)
    if command -v rustfmt >/dev/null 2>&1; then
      if ! out=$(rustfmt --edition 2021 --check "$file" 2>&1); then
        echo "⚠️  rustfmt: $file 格式不符（lefthook pre-push 会拦 tsc/cargo check），运行 rustfmt --edition 2021 修复：" >&2
        echo "$out" | head -40 >&2
        exit 2
      fi
    fi
    ;;
esac

# ③ format-on-edit：源码目录 ts/tsx 即时 biome 格式化（写盘）。
#    取舍：format-on-write 会改写刚编辑的文件，理论上可能与编辑器的文件状态
#    追踪产生轻微 stale 摩擦——如有困扰，注释掉本 case 即可退回
#    「仅 lefthook 门禁 + 手动 bun run format」。
case "$file" in
  */src/*|*/sidecar/*|*/shared/*|*/scripts/*)
    case "$file" in
      *.ts|*.tsx)
        if [ -n "$root" ] && [ -x "$root/node_modules/.bin/biome" ]; then
          "$root/node_modules/.bin/biome" format --write "$file" >/dev/null 2>&1
        fi
        ;;
    esac
    ;;
esac

# ④ 相关测试回归：编辑源文件若存在同名 *.test.ts(x) 则跑，失败 exit 2。
case "$file" in
  *.test.ts|*.test.tsx) tf="$file" ;;
  *.ts) tf="${file%.ts}.test.ts" ;;
  *.tsx)
    base="${file%.tsx}"
    if [ -f "$base.test.tsx" ]; then tf="$base.test.tsx"; else tf="$base.test.ts"; fi
    ;;
  *) exit 0 ;;
esac
[ -f "$tf" ] || exit 0
[ -n "$root" ] || exit 0
case "$tf" in
  */sidecar/*) out=$(cd "$root/sidecar" && bun test "$tf" 2>&1); rc=$? ;;
  *) out=$(cd "$root" && "$root/node_modules/.bin/vitest" run "$tf" 2>&1); rc=$? ;;
esac
if [ "$rc" -ne 0 ]; then
  echo "❌ 相关测试未通过（$tf），编辑已写入但回归失败，请修复：" >&2
  echo "$out" | tail -20 >&2
  exit 2
fi
exit 0
