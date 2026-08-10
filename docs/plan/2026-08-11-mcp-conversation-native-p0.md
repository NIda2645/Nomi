# MCP 对话原生体验 · 实施 Plan（P0）

> 2026-08-11 用户拍板：方向 B「把对话当界面」+ 五门确认模型 + 信任档位 + 桌面富渲染为一等增强层。
> 依据：[research](../research/2026-08-11-mcp-experience-research.md)（§7 能力清单、§7.5 确认点模型）+ 获批样张 [mockup](../design/mockups/2026-08-11-mcp-conversation-native-experience.html)（六幕 × 终端/桌面双形态）。
> 实现后必须与样张逐项对账（R8）+ 真机走查（R13）+ 真实任务 e2e（R16）。

## 分期

- **Phase A（本轮）：六条接线** —— 全部是「后端已有数据 → 接到用户眼睛/手上」，每条独立可验证、独立可回滚。
- **Phase B（次轮）：五门 × driver** —— 创意/剧本/样片门接入 playbook 编排（driver 目前是 stub，需先完成编排本身）、信任档位、粗剪门呈现、widget gate 卡。

## 已核实的地基（2026-08-11 grep 实证，别重复建设）

| 事实 | 位置 |
|---|---|
| run 状态机已有 `awaiting_direction`（方向门预留位）、`awaiting_contract`、`pausing/paused` 等 | electron/productionRun/productionRunState.ts（75 行） |
| job 状态机已有 `cancel_requested → cancelled_remote/detached/too_late` | 同上 :14-26 |
| 渲染端命令白名单已有 `gate.decide`、`run.status`、`job.reconcile` | electron/productionRun/productionRunIpc.ts:8 |
| 系统通知基建已存在 | electron/notificationIpc.ts:33 |
| 深链广播通道已存在 `nomi:production-deep-link` | electron/productionRun/productionRunDesktopLifecycle.ts |
| elicitation 发送/回收已实现（spend 用） | electron/capabilityCore/mcpProtocol.ts:380,569 |
| readOnlyHint 已声明 | mcpProtocol.ts:438 |
| **progressToken 完全未解析**（进度桥从零建） | grep 无命中 |
| mcpProtocol.ts 583 行 → 新逻辑必须拆新模块（R9 ≤800） | wc -l |

## Phase A · 六条接线

### A1 进度桥（对话里的行内进度）
- **目标**：`nomi_generate` / `nomi_start_playbook` 执行期间，客户端实时看到「镜头 3/16 · 供应商已受理 · 已用 01:42」；顺带重置 Claude Code 空闲超时（stdio 无进度 30min 会被掐）。
- **改动**：新模块 `electron/capabilityCore/mcpProgress.ts`——① tools/call 解析 `params._meta.progressToken`；② 执行期订阅 run 事件（productionRunService.readEvents 增量游标，复用 MEANINGFUL_EVENT_TYPES），事件→`notifications/progress`（progress 单调递增，message=人话阶段文本，**无真实总量不发 total，不造百分比**）；③ 挂进 mcpProtocol.ts 的 tools/call 执行路径与 mcpStdioServer 的帧发送。
- **验收**：单测断言帧序列（progressToken 透传、progress 递增、无 token 不发）；e2e 见 A7。

### A2 工具结果重写（转述的原材料 + 参数回显）
- **目标**：每个生产类工具结果 = 结构化字段齐全 + 参数回显 + 下一步动作 + 双语，模型转述质量可控（R15：结果文本是用户可见文字）。
- **改动**：新模块 `electron/capabilityCore/mcpToolResults.ts` 收口全部结果文本（替换 mcpProtocol.ts 内散落的硬编码中文——P1 改造非并行）：`structuredContent` 补 `runId/projectId/params{model,ratio,duration,refs}/budget{cap,spent}/nextActions[]`；text 首行=状态一句话，次行=参数回显（样张①⑧格式）；locale 跟 App 语言设置（zh-CN/en 两份词表，复用 src/i18n 的 key 结构、electron 侧轻量查表）。
- **验收**：单测对 4 个生产工具结果做 schema + 双语快照；`check:i18n` 不新增违规。

### A3 确认双路同源互斥（前台弹窗 / 后台对话弹框）
- **目标**：Nomi 前台 → SpendConfirmDialog（现状）；Nomi 后台/未开 → elicitation + 系统通知。**一个决定只有一份答案**：先答者生效，后到者幂等忽略，决议写回同一事件流。
- **改动**：`mcpProtocol.ts` confirmSpend 路径 + `rendererBridge.ts`：以 gate/grant id 为幂等键统一决议收口（现 pending Map 已按 id，补「已决议后二次 resolve = no-op + 收起另一路」）；前台判定用 `mainWindow.isFocused()`；elicitation 超时沿用 300s、弹窗 65s 不变。
- **验收**：单测双路并发决议幂等；blueprint 疑点「两个并发审批互相覆盖」写并发测试证伪/证实并修。

### A4 run 控制（暂停/继续/取消：对话是遥控器，面板有按钮）
- **目标**：对话说「先停一下」→ agent 调 `nomi_control_run(action)`；Nomi 状态面板出现情境控制行（进行中才显示，§1.5 L2；C1 可点即有效）。暂停保住已花预算与已完成镜头，继续从断点走。
- **改动**：① mcpProtocol.ts TOOLS 增 `nomi_control_run`（pause/resume/cancel，非只读）→ dispatcher → productionRunService 新命令 `run.pause/run.resume/run.cancel`（按状态机合法迁移，拒绝非法迁移并返回人话）；② RENDERER_COMMAND_TYPES 增同款三命令；③ `ProductionStatusPanel.tsx` 加控制行（样张肆/陆幕形态：暂停 + 取消制作 quiet 按钮，仅 working/pausing tone 显示）+ `productionRunView.ts` 补 paused 态文案映射。
- **验收**：状态机迁移单测（含 too_late 边界）；面板按钮 R13 截图对账样张。

### A5 系统通知（后台不漏事）
- **目标**：Nomi 非前台时，「等审批 / 样片等过目(Phase B) / 失败 / 完成」四类事件发系统通知，点击深链拉起对应 run。
- **改动**：`electron/productionRun/` 新薄模块 `productionNotifications.ts`：订阅 service 事件（gate.waiting / job.needs_attention / run.status.changed→completed），`mainWindow.isFocused()` 为假才发，走现有 notificationIpc 模式 + 点击发 `nomi:production-deep-link`（通道已存在）。
- **验收**：单测事件→通知触发矩阵（前台不发/后台发/类型过滤）。

### A6 错误契约（错误=原因+诊断号+出路）
- **目标**：失败回执可被 agent 直接转述成「怎么办」：`{errorCode, 人话原因, recoveryActions[], diagnosticId}`；面板描述同源（job.errorCode 现在记了不显示）。
- **改动**：A2 模块内错误分支收口（现有 errorCode/errorMessage 字段接出）+ `productionRunView.ts` danger 态带 errorCode 与恢复动作文案。
- **验收**：单测主要 errorCode → 双语人话 + 恢复动作映射表快照。

### A7 真实任务 e2e（R16，交付的一部分）
- **目标**：一条脚本扮演 MCP 客户端走通真旅程：initialize → start_playbook → 断言进度帧 → 收 elicitation 帧 → accept → control_run pause → 断言结果结构。
- **改动**：`tests/mcp/conversation-native.e2e.mjs`（低争用路径），spawn `NOMI_MCP_STDIO=1` 进程对话；Nomi 面板侧用既有 Playwright 走查法补一幕截图（R13 人眼判断）。
- **验收**：脚本进 `pnpm run test:e2e` 家族；截图亲眼 Read。

## Phase B（次轮，另出 plan 细化）
创意/剧本/样片三门接入 playbook driver（编排从 stub 转真：`awaiting_direction` 状态已在，缺 driver 推进与 gate 载荷）；信任档位（合同字段 + 门跳过逻辑 + SpendConfirmDialog 增行）；粗剪门呈现；MCP Apps gate 卡（方向门=选项卡/样片门=卡内图，复用 mcpAppWidget.ts 基建）；Codex granular elicitation 配置写入 mcpConfig。

## 不动项
13 个现有工具的名字与语义（只加 `nomi_control_run`、只扩结果字段）；SpendConfirmDialog 视觉（Phase B 才加信任档位行）；ConnectAssistantCard；画布助手对话流；MEANINGFUL_EVENT_TYPES 语义（只消费不改义）。

## 回滚
六条各自独立 commit；A2 结果字段为增量扩展（旧客户端仍读 text 首行）；A4 新工具/新命令删除即回滚，状态机不回退。

## 验收门
每条接线：单测过 + 五门 `pnpm run gates` 全绿 + 亲见退出码（v-log 07-29 坑）；整体：A7 e2e 走通 + 与样张逐项对账清单（六幕元素 ↔ 实现）+ R13 真机截图亲眼 Read。
