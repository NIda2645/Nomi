#!/usr/bin/env bash
# PreToolUse(Bash) hook：安全门岗**加固层**——防 AI / 定时 agent 用「绕过」手法把敏感数据
# （微信聊天记录 / db_key / 私有配置）塞进 git。
#
# 核心扫描在 git pre-commit hook（scripts/check-no-secrets.mjs，对所有 commit 生效）。
# 本 hook 只专拦「绕过 pre-commit」的两条路（AI/agent 没有正当理由走它们）：
#   ① git commit --no-verify / -n  → 唯一能跳过 pre-commit 的方式，禁止。
#   ② git add -f / --force          → 强制 add 被 .gitignore 挡掉的文件（多半是微信数据），禁止。
#
# fail-open：脚本自身任何异常一律放行（exit 0），绝不卡死正常 git 操作。
set +e

INPUT="$(cat)"
CMD="$(printf '%s' "$INPUT" | python3 -c 'import sys,json
try:
    print(json.load(sys.stdin).get("tool_input",{}).get("command",""))
except Exception:
    print("")' 2>/dev/null)"

# 非 git 命令 → 放行
printf '%s' "$CMD" | grep -Eq 'git[[:space:]]' || exit 0

# ① git commit --no-verify / -n（跳过 pre-commit 安全扫描）
if printf '%s' "$CMD" | grep -Eq -- 'git[[:space:]]+commit[[:space:]]+([^&|;]*[[:space:]])?--no-verify' \
   || printf '%s' "$CMD" | grep -Eq -- 'git[[:space:]]+commit[[:space:]]+-[a-zA-Z]*n([[:space:]]|$)'; then
  cat >&2 <<'EOF'
⛔ 安全门岗：git commit --no-verify / -n 会跳过 pre-commit 敏感数据扫描。
反馈雷达持续产生微信聊天记录 / db_key，这类绝不能进 git（会 push 到公开 GitHub、历史永久留存）。
去掉 --no-verify 正常提交，让安全门岗扫过 staged 内容再放行。
EOF
  exit 2
fi

# ② git add -f / --force（强制 add 被 gitignore 保护的文件）
if printf '%s' "$CMD" | grep -Eq -- 'git[[:space:]]+add[[:space:]]+([^&|;]*[[:space:]])?(-[a-zA-Z]*f([[:space:]]|$)|--force)'; then
  cat >&2 <<'EOF'
⛔ 安全门岗：git add -f / --force 会强制加入被 .gitignore 挡掉的文件。
docs/feedback/ 下的微信记录、welive.yaml、db_key、*.db 正是靠 .gitignore 保护的。
如确需 add 某个安全文件，去掉 -f，并确认它不匹配 .gitignore 的敏感规则。
EOF
  exit 2
fi

exit 0
