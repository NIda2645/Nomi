# 规则体系：动手那一刻的提醒 + 规则文件瘦身

> 状态：🚧 进行中（第一段：提醒 hook；第二段：瘦身与重写判据，等前置合并后推进同一个 PR）
> 依据：`docs/research/2026-10-01-ai-collaboration-rules/report.md`（官方：规则文件要短、必须发生的事交给 hook；实证：接口级清单让复用率 30.0% → 67.8%）。

## 为什么

今天的 `laneContextFit` 是在「pi 已经有压缩」没人看的地方长出来的：pi 的能力登记里没有 compaction，agent 也没有任何一刻被提醒「新建文件前先看已有的」。同一文件被反复补（`laneHost.mts` 近 14 天 25 次提交里 17 次 fix）也没有任何信号。规则写在 CLAUDE.md 里，但 CLAUDE.md 约 30 KB、每轮还注入约 3 KB，越长越容易被无视。

## 第一段（本次）

| | 内容 |
|---|---|
| 新增 | pi 能力登记补 `context-compaction`（带禁止项：关掉压缩、手写裁剪）；`scripts/build-capability-index.mjs`（从两张现有登记表现算接口级清单，≤2.5 KB，不入库）；`scripts/claude-hooks/edit-time-reminder.sh` + `scripts/edit-time-reminder.mjs`（PreToolUse · Write\|Edit，两个提醒，只提醒、不拦、fail-open）；调研报告进仓库 |
| 不变 | 不拦任何写入；不新建登记表；不改 CLAUDE.md（第二段才动） |
| 回滚 | 删 `.claude/settings.json` 里那一条注册和 `edit-time-reminder.*`、`build-capability-index.*` 即可；登记表那条 capability 可单独保留 |

两个提醒：
- (a) 在 `src/`、`electron/` 下新建源码文件（路径此刻不存在、非测试、非生成）→ 注入清单，请回一行「已查：X、Y；没找到：Z」。
- (b) 改的文件近 14 天已有 ≥3 次 fix / hotfix 提交 → 注入重写判据三条与「选补/重写/删 + 特征测试」。同会话同文件同类只提醒一次；每次触发写 `.claude/reuse-reminders.log`，供 10-15 校准。阈值是试用值。

机制（已对着官方 hooks 文档核过，https://code.claude.com/docs/en/hooks）：PreToolUse 的 `hookSpecificOutput.additionalContext` 会进上下文，位置在**工具结果旁边**——提醒随写入结果一起到，不是写入前，所以它让 agent 立刻自查、重写，拦不住这一次写入；普通 stdout（exit 0）对 PreToolUse 只进调试日志，所以必须走 JSON。

## 先查别人

- **官方 hooks**：PreToolUse 回馈机制见上；`UserPromptSubmit` / `SessionStart` 的普通 stdout 才直接进上下文。结论：用 JSON 的 `additionalContext`，不写普通 stdout。
- **同类自家做法**：`scripts/claude-hooks/stack-currency-check.sh`、`model-doc-check.sh` 已经是同一形状（PreToolUse · Write|Edit · additionalContext · fail-open）。结论：沿用同一形状与注册方式，不另造机制；判断逻辑放进可被 node-test 直接测的 `.mjs`，`.sh` 只是薄壳（python3 在这台机器上是商店别名，不依赖它）。
- **清单从哪来**：RepoReuse（arXiv 2609.35357）——接口级清单有效、塞全源码无效；所以只放「模块 — 一句话职责 — 入口」，来源是现有两张登记表（`concept-owners.json`、`framework-boundaries.json`），不另起第三份。
- **重写判据**：Feathers 特征测试、Fowler Strangler Fig / Preparatory Refactoring、Sandi Metz The Wrong Abstraction、反方 Spolsky——见调研报告 §一、§二；阈值（14 天、第 3 次）没有权威数字，试用到 10-15 用我们自己的提交历史回测。

## 自己写了什么、为什么必须自己写

| 自己写的 | 为什么不能用现成的 | 理由类型 |
|---|---|---|
| `build-capability-index.mjs`（清单生成） | 没有现成工具把我们的两张登记表按目标路径筛成接口级清单 | 领域约束：登记表是 Nomi 自己的格式 |
| `edit-time-reminder.mjs`（判决 + 去重 + 日志） | Claude Code 的 hook 只给事件与回馈通道，「什么时候提醒」是 Nomi 的规则（新建 / 14 天 3 次 fix） | 领域约束：规则本身是 Nomi 的 |
| 无自写的框架能力替代件 | — | — |

## 概念占用表（R33）

| 概念 | 唯一 owner | 允许谁消费 |
|---|---|---|
| 已有能力清单（现算、不入库） | `scripts/build-capability-index.mjs#buildCapabilityIndex` | `scripts/edit-time-reminder.mjs` |
| 提醒的触发判决 | `scripts/edit-time-reminder.mjs#decideEditTimeReminder` | `scripts/claude-hooks/edit-time-reminder.sh` |
| pi 的压缩能力登记 | `docs/engineering/framework-boundaries.json`（`pi/context-compaction`） | `check:framework-boundary` |

## 验证

- `scripts/build-capability-index.node-test.mjs`：筛选、上限、**laneContextFit 场景红绿对照**（登记了 → 清单里有 pi 的压缩；拿掉登记 → 没有）、不入库。
- `scripts/edit-time-reminder.node-test.mjs`：判决表；真起 `bash edit-time-reminder.sh` 吐官方形状 JSON；同会话不重复；坏载荷静默放行；真 git 数 fix。
- 已核实：文档机制。**未核实（本次环境做不到）**：真实 Claude Code 会话里的金丝雀（headless 的 `claude -p` 在这台机器上未登录）；上线后请在新 worktree 的会话里新建一个 `electron/` 下的文件，确认工具结果旁出现「【已有能力 · 新建文件前】」。

## 第二段（同一 PR，后续推进）

CLAUDE.md 30 KB → 约 11 KB、`self-check.sh` 每轮静态注入 2.8 KB → 不到 1 KB（按用户批过的搬家清单）；三个雷达改 SessionStart hook（失败明说「今天没查成」）；重写判据并入 R21.2（合同字段 `decision`、`characterization_test`）；交付身份与编排手册两条新规矩。
