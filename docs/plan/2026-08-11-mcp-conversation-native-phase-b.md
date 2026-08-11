# MCP 对话原生 · Phase B 实施 Plan（执行：Opus / 验收：Fable）

> 依据：[P0 plan](2026-08-11-mcp-conversation-native-p0.md)（Phase A 已全部落 main `f6e0b88f`）+ [研究文档](../research/2026-08-11-mcp-experience-research.md) §7.5 五门模型 + **获批样张** [mockup](../design/mockups/2026-08-11-mcp-conversation-native-experience.html)（六幕 × 终端/桌面双形态，2026-08-11 用户拍板）。
> 实现必须与样张贰幕（定方向）、肆幕（样片与汇报）、叁幕（信任档位行）逐项对账（R8）。
> **执行纪律**：每个工单独立 commit + 全测绿再进下一个；单文件 ≤800 行（R9）；所有用户可见文字 zh-CN + en（R15）；**禁止 push**——完成后留在本 worktree 等验收（Fable 验收后统一落 main）。

## 体验目标（Phase A 之后还缺什么）

Phase A 后：钱的门是真的（预算弹窗/对话确认），创意的门是哑的——方向门只有「批准」两个字（批的是什么看不见）、分镜要跳去 Nomi 看、样片门不存在（合同一批就全批量）、打扰程度没有档位。Phase B 把「在对话里做创意决策」补全：

1. **定方向**：AI 拟 2-3 个方向候选，对话里弹选择框 10 秒选定（桌面端=可点的选项卡）
2. **样片门**：合同批准后先出第 1 镜当样片，看过满意再继续——配合顺序提交，喊停最多亏 1 镜钱
3. **信任档位**：嫌烦说「别问了直接出」→ 只留钱门；控制欲强可开全程确认
4. **确认竞态修死**：两个审批同时来不再互相覆盖（实锤的单槽 bug）

## 已核实技术事实（2026-08-11 grep 实证，禁止凭记忆推翻；标 ❓ 的先读代码再动）

| 事实 | 位置 |
|---|---|
| ProductionGate 无候选载荷字段（gateId/scope/status/planHash/jobIds/title/summary/createdAt/expiresAt/contract?） | productionRunTypes.ts |
| 方向内容有独立 artifact：`artifact-direction-v1` kind='direction' → `.nomi/runs/{runId}/direction-v1.json`，随 createDraft 创建（仅 brand.promo） | productionRunRepository.ts:234 附近 |
| ❓ direction-v1.json 当前写入的内容结构未知——动它前先读 repository 里的写入代码 | 同上 |
| **spendConfirm store `pending: Pending \| null` 单槽——二次 requestConfirm 直接覆盖，前一个 resolve 永不触发**（A3 疑点实锤） | src/workbench/generationCanvas/spend/spendConfirm.ts:43,56 |
| driveGeneration 是**顺序 for 循环逐镜提交**——喊停敞口天然=1 镜；暂停语义三件套已锁（提交门/收尾落停/resume 重踢，productionRunPauseSemantics.test） | productionRunService.ts driveGeneration |
| productionRunService.ts **正好 800 行顶格**——任何新增前必须先做 B0 抽层 | wc -l |
| ACTIVE_JOB_STATUSES / applyRunControl / settlePauseIfQuiet 已抽在 productionRunControl.ts（可复用） | productionRunControl.ts |
| RENDERER_COMMAND_TYPES 白名单：run.status / run.control / gate.decide / artifact.adopt / plan.attach / policy.refresh / job.reconcile | productionRunIpc.ts:8 |
| renderer 依赖 GUI 进程（requestRenderer → rendererBridge）；GUI 关着时 driver 的 LLM 类 op 失败 → needs_attention（现状既有边界，B 不扩 scope，靠错误契约转述「打开 Nomi 继续」） | rendererBridge.ts |
| ❓ gate.decide 对「已 approved 的 gate 再次 decide」的行为未证——B4 先写测试证伪/证实再修 | productionRunRepository.ts:328 |
| elicitation 枚举单选/多选 + 默认值是 MCP 官方规范能力（2025-11-25 SEP-1330），Claude Code v2.1.76+ / Codex 均支持 | 研究文档 §1 |
| 工具结果/进度文案收口在 mcpToolResults.ts（双语）；进度桥 mcpProgress.ts；新工具注册处 mcpProtocol.ts TOOLS | capabilityCore/ |
| MEANINGFUL_EVENT_TYPES 含 gate.waiting/gate.decided——事件流已能透出门 | productionRunService.ts:74 |

## 工单（按序执行，每单一 commit）

### B0 · 前置抽层（不做功能）
service 顶 800 行。把 driveGeneration / proposeStoryboard / driveExport / driveReconciliation 等 driver 编排函数抽到新层 `electron/productionRun/productionRunDriverOps.ts`（保持行为零变化，依赖经参数注入维持可测性——参照 productionRunControl.ts 的抽法）。
**验收**：service 余量 ≥120 行；全测绿（181+ 不减）；抽出文件也 ≤800。

### B1 · 创意方向门带方案（样张贰幕上半）
- driver 在 direction 阶段（createDraft 后异步 / 或首次 get 时惰性）经 renderer 新 op `production.plan-directions` 让 LLM 拟 **2-3 个候选**（每个 `{ key, title, oneLiner }`），写入 direction-v1.json（读❓现有结构后合并，别 clobber）；GUI 关着产不了 → 保持现状 gate（title/summary 兜底），错误契约转述「打开 Nomi 后我再拟方向」。
- 投影：nomi_get_run / nomi_subscribe_run 的 gate.waiting 带 `directionCandidates`（经 projection sanitizer，别漏内部路径）。
- 新 MCP 工具 `nomi_decide_gate(projectId, runId, gateId, decision: approved|rejected, choiceKey?)` → dispatcher → service.command gate.decide（payload 带 choiceKey，写进事件留痕）。agent 侧用法写进工具 description：**先用 elicitation 枚举（候选 + 「都不要，用户自己描述」）问真人，拿到 accept 才准调本工具**。
- 渲染端：SpendConfirmDialog 的 plan kind（方向门现走它）显示候选单选（radio 行，选中默认第一个）；决议 payload 同带 choiceKey。
- mcpToolResults：gate.waiting 转述带候选清单（双语）。
**验收**：journey 测试扩「三选一」段（elicitation 帧 → decide 工具 → 事件含 choiceKey）；R15 过门。

### B2 · 样片门 + 窗口化定档（样张肆幕）
- driveGeneration：第 1 镜 adopted 后若 run 无 `gate-sample-v{planVersion}`（且信任档位非 budget_only）→ 建 sample gate（scope 'stage'，jobIds=[]，summary 带样片 artifact 引用）+ run.status → 新状态？**不加新状态**（P1 极简）：复用 `awaiting_storyboard_review`？语义不符——改用：run 停在 running + gate.waiting（waitingGate 分支已让面板/转述显示「等确认」，primaryAction open-gate 已通）。提交循环在 sample gate waiting 时 break（与暂停同一花钱边界检查处加一个条件）。
- 批准 → 继续循环（gate.decide approved 钩子 kick driveGeneration，参照 gate-contract 钩子写法）；拒绝 → run.control pause 语义落 paused + 转述「改提示词后可继续」。
- 顺序提交=窗口 1 保持不变，在 pauseSemantics 测试加一条「循环必须顺序」的守护断言（防未来并发化悄悄放大敞口）。
- mcpToolResults / i18n：样片门等待与决议文案（双语，终端给深链看图、桌面端后续 B6 卡内看图——本单不做 widget）。
**验收**：driver 测试扩样片门段（2 镜批次：镜 1 后停门 → 批准 → 镜 2 才提交）；journey 断言样片门转述。

### B3 · 信任档位（样张叁幕合同行）
- 类型：AutomationPolicy / contract 增 `trustLevel: 'key_confirm' | 'budget_only' | 'confirm_all'`，默认 key_confirm，随输入 derive 勿 hardcode 散落。
- 门跳过：budget_only → direction/sample gate 自动 approved（事件留痕 `gate.decided` + message 注明「按档位自动批准」）；confirm_all → 每镜提交前 gate（本期只留 TODO 事件钩子，不实现每镜门——范围控制，plan 注明）。预算门**任何档位都不跳**。
- 呈现：ProductionContractSummary / SpendConfirmDialog contract 行显示档位（i18n 双语）；nomi_start_playbook inputSchema 增可选 `trustLevel`；mcpToolResults 合同/状态转述带档位。
- 对话改档：`nomi_control_run` action 增 `set_trust`（payload trustLevel）→ 写 policy + 事件留痕（「别问了直接出」= agent 调它降 budget_only）。
**验收**：单测三档位跳门矩阵（预算门永不跳）；journey 断言降档后方向门自动过且留痕。

### B4 · 确认竞态收口（A3 的实锤部分）
- spendConfirm store：`pending` 单槽 → **FIFO 队列**（一次显示一个，前一个决议后出下一个；被覆盖 bug 根治）。保持对外 API 不变（requestConfirm 返回 Promise）。
- gate.decide 幂等：先写测试证「对已 approved gate 重复 decide」行为，若抛错/重复副作用 → 收口为幂等 no-op（同 commandId 已幂等，异 commandId 同决议也应安全）。
- 并发审批测试：两个 run 同时 contract gate.waiting → 两个弹窗先后出现、各自独立批准、互不覆盖（渲染层测试 + service 层测试各一）。
**验收**：新增测试全绿；模拟双 run 并发场景不再丢 resolve。

### B5 · 旅程与走查扩展（R16 收口）
- A7 journey 测试扩成五门全链（方向三选一 → 分镜确认 → 合同 → 样片门 → 完成/控制）。
- tests/ux/production-mcp-journey.e2e.mjs 扩：方向候选断言 + 样片门断言 + 截图点（fixture 零额度）。
**验收**：e2e 全过；截图供 Fable 眼见链。

### B6 · widget gate 卡（**不在本次范围**，验收后另开：方向门=选项卡/样片门=卡内图，mcpAppWidget.ts 基建）

## 不动项
现有 14 个工具的名字与既有语义（只加 nomi_decide_gate、扩 control 的 set_trust）；SpendConfirmDialog 视觉骨架（只加候选单选与档位行）；预算门永不跳过；MEANINGFUL_EVENT_TYPES 语义；Phase A 的暂停花钱语义（pauseSemantics 测试是回归红线）。

## 回滚
每工单独立 commit；新 gate kind / 新字段全部增量，老 run 文件无新字段时按默认档位/无候选兜底（向后兼容读）。

## 验收流程（Fable 执行，Opus 勿代）
① 逐工单对照本 plan 验收标准；② 全套 vitest + `pnpm run gates` 亲见退出码；③ production-mcp-journey e2e 跑通 + 截图逐张亲眼 Read；④ 与样张贰/叁/肆幕逐项对账；⑤ cherry-pick 落 main（干净基线五门）。
