# 规则体系：动手那一刻的提醒 + 规则文件瘦身

> 状态：🚧 进行中（第一段：提醒 hook，已推；第二段：瘦身 + 雷达 SessionStart + 重写判据并入 R21.2，本次推到同一个 PR）
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

## 第二段（同一 PR）

| | 瘦身前 | 瘦身后 |
|---|---|---|
| `CLAUDE.md` | 151 行 / 31,992 字节 | 97 行 / 约 13.7 KB（−57%）；加粗从 109 处降到每段至多一两处 |
| `self-check.sh` 每轮常驻注入 | 1,917 字节（#948/#949 之后；此前 2,824） | 640 字节（−67%）；其余按用户消息关键词注入，命中才占字节 |

（原方案估 CLAUDE.md 约 11 KB，实测 13.7 KB：中文每字 3 字节，估算偏乐观。）

### 搬走的每一段：去了哪、用到时由什么触发

| 搬走的段 | 去了哪 | 用到时由什么触发（确定性，不靠自觉） |
|---|---|---|
| 常用命令大表（约 3.9 KB） | `docs/engineering/commands.md` | CLAUDE.md「常用命令」一节直接指向；`self-check.sh`【命令全表】块（消息含 gates / check: / 门岗 / 命令）；`package.json` 是真相源 |
| push 前分层（R22）、交付身份（R11）、Ponytail（R25） | `docs/engineering/delivery-and-review.md` | `self-check.sh`【交付】块（消息含 合并 / merge / 收据 / verify-merged / preflight / 开 PR / 交工 / Ponytail / review:branch / 推送）；pre-push 闸门自己拦没过的、没收据的 |
| 三个每日雷达 + 三日竞品雷达 | `docs/engineering/daily-radars.md`；技能 `nomi-*-radar` | **SessionStart hook `daily-radar.sh` 直接跑脚本并注入结果**；失败明说「今天没查成」；一天一次、失败下次重试 |
| P2 / P3 / P5 全文 | `docs/engineering/principles-detail.md`；CLAUDE.md 各留一两行 | `self-check.sh`【修根因】【报完成前】【设计流程】块都带指针；P2 另有 `root-cause-remediation` 技能 |
| 三闸段（CLAUDE.md） | 删（和 `self-check.sh` 逐句重复） | 常驻 640 字节仍在每轮注入三刻与贯穿原则 |
| L0 ① 里的 R5.1 / R5.4 / R5.5 细节 | `self-check.sh`【先查别人 · R5】块；`stack-currency-check.sh`（PreToolUse · 写 docs/plan 或动 package.json）追加一句 R5.4 / R5.5 | 消息含 框架 / SDK / 依赖 / 协议 / 规范 / 格式 / 导入导出 / MCP / 技能包 等；或写方案文档 / 动 package.json 的那一刻 |
| 画新面三件产物、控件层级 §1.5、R8 | `self-check.sh`【画新面】【设计流程】块；`docs/design/nomi-design-system.md` | 消息含 设计 / 样张 / 界面 / 新页面 / 新面板 / 画新 等 |
| 规则索引里各行的长解释 | `docs/engineering-rules.md`（原本就有详解，索引里是重复） | 索引一行一条，详解按需翻；R5 / R13 等关键块由上面几条 hook 注入 |
| 多会话统御长段 | `docs/engineering/agent-orchestration-playbook.md` §19（原本就有）；CLAUDE.md 留 3 条硬规矩 | 协调 / 实施会话读 CLAUDE.md 时直接看到；细节指向 §19 |

**一个事实顺带修了**：旧版 `self-check.sh` 靠未文档化的 `CLAUDE_USER_PROMPT` 环境变量判断关键词，官方 hooks 文档里 UserPromptSubmit 的用户消息走 stdin 的 JSON，那个环境变量没有任何文档——设计关键词提示很可能从来没命中过。现在先读 stdin，环境变量只当测试兜底，`scripts/self-check-hook.node-test.mjs` 真起 hook、喂官方形状 JSON 断言每个块都会出现、注入里点名的文件都真实存在。

### 重写判据并入 R21.2

- L1 三行在 CLAUDE.md；L2 一节详解在 `docs/engineering-rules.md` R21.2（含「试用到 10-15，用我们自己的提交历史校准」）。
- **和原 R21.2 合并，不并存**：原来「同一层 7 天第三份合同 → 交一份结构评审文档」改成「→ 簇里最新那份合同写 `rewrite_decision`: { decision: patch|rewrite|delete, characterization_test: <路径> }」。`check:symptom-cluster` 不再读 `docs/audit`（删了 `readAudits`）；`check:root-cause-contracts` 校验写了的字段：测试文件存在，**选 rewrite 时那份测试必须出现在本次 diff 里**。整簇在 2026-10-02 之后才受管，更早的聚簇已按旧规矩处理过，不追溯。
- 合同：`docs/fixes/2026-10-01-rewrite-decision-merges-r21-2.root-cause.json`。

### 两条新规矩

- **合并**：CI 绿 + 扫描干净就合；最多 3 个合并在等收据（`quality-gate.yml` 按 SHA 分组，每个合并提交各跑一套），任何一个收据红了立刻停止再合，交人定修还是回滚。落在 `docs/engineering/delivery-and-review.md`、编排手册 §19.3、hook 的【交付】块。
- **PR 切法**：一个概念一个 PR、按阶段攒；PR 内提交小而清楚、合并保留每个提交；跨概念 / 热修 / 别的线等着它 / 大到审不过来才拆。落在编排手册 §19.3a、CLAUDE.md R27 一行。

### 没做的

- 原清单里「SessionStart 按分支或角色注入「你是协调会话还是实施会话」」没做：判断角色没有可靠信号，且 CLAUDE.md 的 3 条硬规矩已让两类会话都直接看到。
- 阈值（14 天、第 3 次、7 天簇）全是试用值，试用到 10-15 用 `.claude/reuse-reminders.log` 与提交历史回测。
