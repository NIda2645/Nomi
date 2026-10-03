#!/usr/bin/env bash
# SessionStart hook —— 工程体系三个数，一行（和每日雷达同一个位置）。判断与格式全在 scripts/eng-metrics.mjs。
# 只看趋势，**不作为任何通过条件**：任何一项拿不到就在行里明说「—（原因）」，脚本自己永远 exit 0；
# CI 数据一天只打一次 API（缓存在 .claude/eng-metrics-cache.json）。fail-open：脚本缺失就静默跳过。
set +e
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -f "$ROOT/scripts/eng-metrics.mjs" ] || exit 0
echo "【工程三个数】$(node "$ROOT/scripts/eng-metrics.mjs" 2>/dev/null)"
exit 0
