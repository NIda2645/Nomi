#!/usr/bin/env bash
# UserPromptSubmit hook —— 每条用户消息前注入「三闸自检」+「最近栽过的坑」。
# 重构（2026-06-17，docs/plan/2026-06-17-discipline-system-overhaul.md）：从平铺 9 条 → 按「三个决策时刻」
# 组织(杠杆2)；顶部吐 violations.log→数据驱动、会变、针对真实毛病(杠杆3，抗横幅失明)。
# 升级（2026-06-21，docs/plan/2026-06-21-context-handoff-and-self-iterating-control-files.md，S2）：
# 改为按「踩坑次数 hits」排序取前 2——反复犯的优先顶眼前，不再单纯按时间。兼容旧平铺行。
# 升级（2026-10-02，规则体系瘦身）：常驻只留约 0.7 KB，其余拆成关键词块；用户消息改从 stdin JSON 读（见下）。
# 升级（2026-09-03）：新增设计流程关键词检测，命中时注入一行提示；注入正文按可机器化分诊瘦身（详见 docs/engineering/rule-enforcement-audit.md）。
# 完整规则仍以 CLAUDE.md 为单一真相源。stdout 在 exit 0 被 harness 注入上下文。
set +e
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
LOG="$ROOT/.claude/violations.log"

if [ -s "$LOG" ]; then
  echo "⚠️ 最近栽过的坑（别重蹈 · 来自 violations.log，按踩坑次数排序，反复犯的优先）："
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$LOG" <<'PY'
import sys
rows = []
for ln in open(sys.argv[1]).read().splitlines():
    if not ln.strip():
        continue
    parts = [p.strip() for p in ln.split('|')]
    if len(parts) >= 5 and parts[1].startswith('hits='):
        # 软 prune：status=dead 的行留历史但不再顶眼前（S1）
        if any(p.replace(' ', '') == 'status=dead' for p in parts[5:]):
            continue
        try:
            hits = int(parts[1][5:])
        except Exception:
            hits = 1
        last = parts[3].replace('last=', '')
        rows.append((hits, last, parts[4]))
    else:
        rows.append((1, '', ln))  # 兼容旧平铺行
rows.sort(key=lambda r: (r[0], r[1]), reverse=True)
for hits, _last, text in rows[:2]:
    tag = '(×%d) ' % hits if hits > 1 else ''
    print('   · %s%s' % (tag, text))
PY
  else
    grep -v '^[[:space:]]*$' "$LOG" | tail -2 | sed 's/^/   · /'
  fi
  echo ""
fi

# ── 关键词触发的块：只在用户这条消息命中时才注入（其余时候一个字都不占）─────────────────────────
# 为什么拆出来：每轮常驻只留「删掉它 Claude 就会犯错」的一小段（调研报告 §一.1：规则越长越被无视）；
# 其余按场景在命中时注入——这是确定性触发（UserPromptSubmit 的 stdout 进上下文），不靠 agent 自觉去翻 CLAUDE.md。
# 搬走的每一段 → 由什么触发，对照表在 docs/plan/2026-10-01-rule-reminders-slimming.md。
# 用户这条消息从哪来：官方 hooks 文档里 UserPromptSubmit 通过 stdin 的 JSON（`prompt` 字段）给；没有任何文档化的 CLAUDE_USER_PROMPT
# 环境变量——旧版只读那个环境变量，关键词块很可能从来没命中过。所以先读 stdin，环境变量只当兜底（测试里用）。
PROMPT="${CLAUDE_USER_PROMPT:-}"
if [ -z "$PROMPT" ] && [ ! -t 0 ]; then
  PROMPT="$(node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(String(JSON.parse(d).prompt||""))}catch{}})' 2>/dev/null)"
fi
hit() { echo "$PROMPT" | grep -qiE "$1"; }

# 设计 / 用户可见改动（R8、§1.5 控件层级、nomi-design-flow）
if hit '设计|样张|界面|mockup|改这个面|重做|改下这个|加个面板|布局怎么|改界面|UI 怎么|UI怎么|出个样|新增.*(面板|页面|界面|区域)|这个 UI|这个UI|新页面|新面板|画新'; then
  echo "【设计流程】（原则全文 docs/engineering/principles-detail.md）走 nomi-design-flow 技能：先看真实 UI → 组件复用 → 样张带 data-* 挂点与异常态 → 逐件走读（禁纯统计表）→ 拍板后产契约（pnpm run check:mockup-contracts）。用户可见改动先读 docs/design/nomi-design-system.md 并出可体验样张、用户拍板(R8)；改/扩现有 UI 先看它真实样子；加/挪控件先过 §1.5 控件层级（L1 常驻 / L2–L4 · 一功能一个家 · 先分组→去重→归位→最后才收纳）"
  echo ""
fi
# 画新面（没有 before，§1.5 自动失效）
if hit '新页面|新面板|新界面|画新|新增.*(面板|页面|界面|区域)|从零.*(设计|做)'; then
  echo "【画新面 · 三件产物】任务卡「谁 在什么时刻 做完哪一件事就走」｜v1（只有一件事，刻意少得让人不安）/ v2 / v3 减法梯度，默认推 v1｜删除清单「没放什么 · 为什么 · 要它时怎么找」｜卡点表「①怎么知道有这功能 ②动手前知不知道要付出什么 ③空了/错了看到什么 ④凭什么信结果对、错了怎么回头」＋必答「这条路几步·能不能砍掉一步」"
  echo ""
fi
# 碰框架 / 三方库 / 外部格式（R5.1 / R5.4 / R5.5）
if hit '框架|三方库|第三方|SDK|依赖|package\.json|升级|引入|接入|协议|规范|格式|导入|导出|MCP|技能包|schema|供应商 API'; then
  echo "【先查别人 · R5】结论默认是接入（P0），凭记忆判断 = 没查｜碰三方库的 API → Context7 查官方文档(R5.1)｜碰框架/SDK/运行时或它没用过的层 → 四列表「它提供/我们用了/我们另写了/我们拆散了」＋参考实现逐层对照（一致·有意不同[理由须是领域约束]·没想到）(R5.4)｜碰外部也读写的格式/协议/契约 → 先找规范，写「规范链接/我们的偏差/偏差理由」，扩展只放标准的扩展点(R5.5)"
  echo ""
fi
# 报完成 / 交付（R13 第二、三档）
if hit '做完|修好|验收|走查|交付|给你看|可以合了|完成了'; then
  echo "【报完成前 · R13】（P3 全文 docs/engineering/principles-detail.md）Agent/工具/契约改动 → 要有真实模型数字：工具写对率 + 回合成功率，实验室基线只证外观｜功能交付 → 建 ≥2-3 条真实用户任务跑通闭环、冒出的问题全修掉｜画布/性能/导入/导出测试 → 素材必须是 NOMI_REAL_MEDIA_DIR 登记过的真素材，合成夹具证明不了任何事"
  echo ""
fi
# 修 bug（P2 全文在 docs/engineering/principles-detail.md）
if hit 'bug|回归|根因|修复|崩|卡死|报错'; then
  echo "【修根因 · P2】动生产代码前走 .agents/skills/root-cause-remediation：分清症状/直接原因/类根因，先 node scripts/door-map.mjs 数门，修在最早共享边界；同一处近 14 天第三次修 → 先选补/重写/删并写特征测试(R21.2)。全文 docs/engineering/principles-detail.md"
  echo ""
fi
# 命令 / 门岗（全表在 docs/engineering/commands.md）
if hit 'gates|check:|门岗|命令|pnpm run'; then
  echo "【命令全表】CLAUDE.md 只留最常用 5 条；各门岗、冒烟、数门、评审命令的全表在 docs/engineering/commands.md；push 前按风险面分层见 docs/engineering/delivery-and-review.md"
  echo ""
fi
# 交付 / 合并 / 交工评审
if hit '合并|merge|收据|verify-merged|preflight|开 ?PR|交工|Ponytail|review:branch|推送'; then
  echo "【交付 · R11/R22/R25】开任务先 pnpm run delivery:preflight｜合并规矩：CI 绿 + 扫描干净就合，最多 3 个在等收据，任何一个收据红了立刻停、交人定修还是回滚｜交工前 pnpm run review:branch（PR 正文 ## Ponytail 节逐条表态）｜细则 docs/engineering/delivery-and-review.md"
  echo ""
fi

cat <<'EOF'
【动手前 · 到这三刻必停（详解 CLAUDE.md、docs/engineering-rules.md）】
① 动手前：这段是我们独有的吗？不是 → 先找现成的接入(P0)｜重要改动先 grill：一轮批量问、每题带默认、连带面单独成题（纯 bug 修复不问）｜多文件先写 docs/plan(R4)｜取舍给对比表(R3)
② 报完成前：全绿≠完成(P3)。截图要自己亲眼 Read 过、来自用户将跑的那个构建；没闭环别说「做完」(R13)
③ push 前：pnpm run gates 全过(R11/R22)
贯穿：修根因不修症状(P2)｜加新必删旧(P1)｜同一处第三次修 → 先选补/重写/删(R21.2)
EOF
