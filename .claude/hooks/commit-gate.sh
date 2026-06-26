#!/usr/bin/env bash
# Claude Code PreToolUse(Bash) 门禁：拦 `git commit`，强制「提交前先跑
# simplify→review」这道靠自觉必被跳过的流程，把它从记忆变成机制。
#
# 逻辑：
#   - 非 git commit 命令              → 放行
#   - 命令已显式声明 REVIEWED=1       → 放行（人已确认审查完成，留痕可审计）
#   - 暂存区为空 / 全为纯文档         → 放行（纯文档是规则里唯一豁免）
#   - 暂存区含代码/配置且未声明审查   → exit 2 阻断，列出待审文件 + 下一步
#
# 注：本闸只能「逼出一个有意识、留痕的决定」，无法验证审查的推理本身——
#     REVIEWED=1 是诚信检查点，不是密码学证明。但它把「隐形跳过」变成
#     「显式声明」，从此可被审计/质问。基础设施异常时 fail-open（不拦），
#     以免 git 上下文异常时卡死正常提交。

cmd=$(python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)

# 只关心 git commit（git log/diff 等含 commit 字样的只读命令不受影响）。
case "$cmd" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

# 已显式声明审查完成 → 放行。只认 env 前缀形态（REVIEWED=1 git ...），
# 避免 commit message 里偶含 REVIEWED=1 而误放行。
case "$cmd" in
  *"REVIEWED=1 git"*) exit 0 ;;
esac

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$root" ] && cd "$root" 2>/dev/null || exit 0

staged=$(git diff --cached --name-only 2>/dev/null)
[ -n "$staged" ] || exit 0

# 剔除纯文档（*.md/.mdx/.txt、docs/ 下、LICENSE、CHANGELOG）后还剩什么。
nondoc=$(printf '%s\n' "$staged" | grep -viE '\.(md|mdx|txt)$|(^|/)docs/|(^|/)LICENSE|(^|/)CHANGELOG')
[ -n "$nondoc" ] || exit 0  # 全文档 → 豁免放行

echo "🛑 提交流程门禁：暂存区含非文档改动，提交前必须先走 simplify→review。" >&2
echo "   待审文件：" >&2
printf '%s\n' "$nondoc" | sed 's/^/     • /' >&2
echo "" >&2
echo "   请按序执行：" >&2
echo "     ① Skill: agent-skills:code-simplification" >&2
echo "     ② Skill: agent-skills:code-review-and-quality（有问题→修→回①）" >&2
echo "   完成后在 commit 前加 REVIEWED=1 显式声明，例如：" >&2
echo "     REVIEWED=1 git commit -m \"...\"" >&2
exit 2
