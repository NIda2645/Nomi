#!/usr/bin/env bash
# SessionStart hook —— 每日雷达：会话一开就跑「用户反馈 / 供应商模型」两个确定性脚本，把结果注入上下文，
# 再提醒「论文雷达 / 三日竞品雷达」。判断与格式全在 scripts/daily-radar-session.mjs（可被 node-test 直接测）。
# 失败时明说「今天没查成」，绝不说成「没有新东西」；一天只成功跑一次，失败的下次会话重试。
# 普通 stdout 在 SessionStart 会进上下文（官方 hooks 文档）。细则见 docs/engineering/daily-radars.md。
set +e
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -f "$ROOT/scripts/daily-radar-session.mjs" ] || exit 0
exec node "$ROOT/scripts/daily-radar-session.mjs"
