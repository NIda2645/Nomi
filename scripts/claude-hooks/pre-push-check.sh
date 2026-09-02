#!/usr/bin/env bash
# PreToolUse hook（命中 Bash 的 `git push`）= push 前的**真闸门**（R11 + P3 决策点强制）。
# 设计见 docs/plan/2026-06-17-discipline-system-overhaul.md（杠杆 1）。
#
# 规则：
#  · 非 git push → 放行（exit 0）。
#  · outgoing 改动全是 doc/hook（.md / docs/ / .claude/）→ 放行（这类不需五门，R11 例外）。
#  · 五门新鲜标记 .claude/.gates-ok 在 30 分钟内 → 放行（`pnpm run gates` 全过才盖戳）。
#  · 否则 → **block(exit 2)** 弹清单，逼我先过五门 + 完成对账 + 真机走查。
#  · **fail-open**：脚本自身任何异常 → 放行（exit 0），绝不卡死推送。
set +e

INPUT="$(cat)"
CMD="$(printf '%s' "$INPUT" | python3 -c 'import sys,json;
try:
    d=json.load(sys.stdin); print(d.get("tool_input",{}).get("command",""))
except Exception:
    print("")' 2>/dev/null)"

# 只管 git push；其余一律放行。
printf '%s' "$CMD" | grep -Eq 'git[[:space:]]+push' || exit 0

# **推送发生在哪棵树,就查哪棵树**。命令形如 `cd <path> && git push ...` 时以那个目录为准。
# 为什么不能只信 CLAUDE_PROJECT_DIR:它固定指向**会话**那棵 worktree,而这台机器常有 20+ 棵并行。
# 拿 A 树的戳记去评判 B 树的推送,两个方向都会错:
#   · 误放——A 刚过五门、B 根本没过,照样放行(闸门形同虚设);
#   · 误杀——B 已 gates 全绿,却被 A 那枚过期戳记拦下。
# 2026-09-02 实测误杀:在 nomi-brand-mark 里 gates 连过两轮,仍被会话树的过期戳记拦了三次。
CD_TARGET="$(printf '%s' "$CMD" | sed -n 's/^[[:space:]]*cd[[:space:]]\{1,\}\([^&;|]*\).*/\1/p' | head -1 | sed 's/[[:space:]]*$//' | tr -d "\"'")"
ROOT=""
if [ -n "$CD_TARGET" ] && [ -d "$CD_TARGET" ]; then
  ROOT="$(cd "$CD_TARGET" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null)"
fi
[ -z "$ROOT" ] && ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -z "$ROOT" ] && exit 0   # 拿不到根 → 放行
MARKER="$ROOT/.claude/.gates-ok"

cd "$ROOT" 2>/dev/null || exit 0

# 没有 outgoing commits（已同步/无新提交）→ push 是 no-op，放行。
git rev-parse origin/main >/dev/null 2>&1 && [ -z "$(git log origin/main..HEAD --oneline 2>/dev/null)" ] && exit 0

# outgoing 改动文件（HEAD 相对 origin/main）。拿不到就跳过这层判断（不放行也不误杀，继续看标记）。
CHANGED="$(git diff --name-only origin/main...HEAD 2>/dev/null)"
if [ -n "$CHANGED" ]; then
  # 全部命中 doc/hook → 放行
  if ! printf '%s\n' "$CHANGED" | grep -Ev '(\.md$|\.txt$|^docs/|^\.claude/)' | grep -q .; then
    exit 0
  fi
fi

# 五门标记 30 分钟内 → 放行
if [ -n "$(find "$MARKER" -mmin -30 2>/dev/null)" ]; then
  exit 0
fi

# 到这里 = 有代码改动 + 五门标记缺失/过期 → 拦
cat >&2 <<'EOF'
⛔ push 闸门（R11 + P3）：本次有代码改动，但没有「五门刚过」的标记。

push 前必须：
  1) 五门全过 —— 跑 `pnpm run gates`（filesize→tokens→lint→typecheck→test→build，全过自动盖戳放行）。
  2) 用户可见改动？—— 和获批样张逐项对账 + 真机走查（截图人眼判断），全绿 ≠ 完成（P3/R13）。
若确已过五门只是没走 gates 脚本：`touch .claude/.gates-ok` 即可放行。
（doc/hook-only 改动会自动放行，不会卡到这里。）
EOF
exit 2
