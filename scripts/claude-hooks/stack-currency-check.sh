#!/usr/bin/env bash
# PreToolUse hook（Write|Edit）—— 「选型/引入新框架先实查最新现役框架」的精准提醒（R5 扩展）。
# 设计：2026-06-21 用户要求——「每次整方案可能加新框架时，一定要查最新核心框架/技术栈，变成 hook 肯定会做」。
# 触发：写 docs/plan/*.md（方案选型时刻）或动 package.json（加依赖时刻）→ 软注入一条 Context7+web 查最新提醒。
# 非阻断（additionalContext）+ fail-open；纯版本号/脚本改动可忽略。完整规则见 CLAUDE.md R5 / engineering-rules R5。
# 兜底：用户消息含「框架/SDK/依赖/协议/规范/导入导出/MCP」等词时，self-check.sh 的【先查别人 · R5】块会再提醒一次（2026-10-02 起不再每轮常驻）。
set +e
INPUT="$(cat)"
SC_INPUT="$INPUT" python3 <<'PY' 2>/dev/null
import os, sys, json
try:
    d = json.loads(os.environ.get("SC_INPUT", "") or "{}")
except Exception:
    sys.exit(0)  # 解析失败 → 放行
fp = ((d.get("tool_input", {}) or {}).get("file_path", "") or "").replace("\\", "/")
hit_pkg = fp.endswith("package.json")
hit_plan = "/docs/plan/" in fp and fp.endswith(".md")
if not (hit_pkg or hit_plan):
    sys.exit(0)
what = "动 package.json（加依赖）" if hit_pkg else "写 docs/plan 方案"
msg = (
    f"【R5 · 选型实查最新（hook 提醒）】你正在{what}。若这一步可能引入新框架 / 新技术栈："
    "① 先 Context7（resolve-library-id + query-docs）拉它**最新**文档 + 版本/发布日期；"
    "② web 扫一眼有无更对路的**现役**框架；"
    "③ 别凭记忆判断框架能力 / 新旧 / 是否被取代（栽过：凭印象把现役 Mastra 一刀切挡回，实查后改口）；"
    "④ 涉及取舍给用户对比表（R3）；"
    "⑤ 碰框架/SDK/运行时（含它没用过的层）→ 先四列表「它提供/我们用了/我们另写了/我们拆散了」+ 参考实现逐层对照（R5.4）；碰外部也读写的格式/协议/契约 → 先找规范，写「规范链接/我们的偏差/偏差理由」（R5.5）。"
    "纯版本号 / 脚本 / 文案改动可忽略本条。"
)
print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "additionalContext": msg}}))
sys.exit(0)
PY
exit 0
