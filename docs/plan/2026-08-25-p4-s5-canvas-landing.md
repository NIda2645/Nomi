# P4 S5 — 多镜产物画布落地（best-effort + 补齐 + 整批一撤 + 三态占位 + reconcile）

> 切片 S5，纪律同 S3a。前置：S1 #132 / S2 #138 / S3a #143 / S4 #148 全链在 origin/main。
> 计划真相源：`docs/superpowers/plans/2026-08-24-p4-multishot-continuity.md` §3.4 / §4 / §6 T2；
> `docs/superpowers/plans/2026-08-24-unified-agent-master-plan.md` §4.3 词汇表。
> 开关：`NOMI_MCP_GENERATION_MULTISHOT_V1`（在 `SINGLE_SHOT_V1`+`E1_V1` 之上），默认关。

## 0. 一句话

批次确认（S3a 卡）后：项目正开 → 尽力把「锚 + 勾选镜」落成占位节点 + 编组（组也打幂等章）；
项目没开/落失败**不影响生成**（Job 只从合同派生，§1 铁律）；生成过程中逐镜回填 result（一个填一个 = 「逐个冒」）；
占位三态可区分（排队/生成中/已停）；整批物化 = 一个 Cmd+Z；打开项目时按 `run.jobs[].nodeId × artifacts` 幂等 reconcile 补齐；
顺带把 S4 遗留的 `resumeUnfinishedRuns` 接上启动/开项目触发。

## 1. 家底核实（file:line，已实读）

- **幂等物化通道**：`src/workbench/capability/capabilityApplyHandler.ts:413-510`（`production.materialize-storyboard`）——
  今天只建节点（`materializationOperationId` 防重复），返回 `bindings`(nodeId+provider+model)；**无 txn、无编组、无 result 回填**。
- **整批事务样板**：`src/workbench/generationCanvas/agent/proposalTxn.ts:60-77`（`suppressUndoBarriers`+事务自打一个 barrier）。
  跨 await 分段 txn 样板：`src/workbench/generationCanvas/nodes/useNodeImageEditing.ts:185-196,219-274`（`inSplitTxn` 每次同步段单独包）。
  `src/workbench/generationCanvas/events/canvasGestureContext.ts:21-30` **明令 ctx 不得跨 await**（`withCanvasGestureContext` 只包同步 fn）。
- **建组 API**：`src/workbench/generationCanvas/store/canvasGraphActions.ts:378(createGroup)/400(groupSelectedNodes)`
  ——两者都调 `pushUndoSnapshot`，受 ctx `suppressUndoBarriers` 抑制（`canvasUndoJournal.ts:39-40`）。
- **result 写入**：`canvasRunActions.ts:140-173`（`addNodeResult` 自动并 history + `emitRunUpdated`）；`rollbackHistory:175-184` 数据层已有（本切片不接 UI）。
- **materialize 绑 nodeId 到 job**：`electron/productionRun/productionRunArtifactOperations.ts:179-213`
  ——渲染层建节点 → `bindings` → `plan.attach` 命令写 `job.nodeId`（reducer `productionRunReducer.ts:693-715`）。
  这是 **legacy driver 路径**；语义多镜链（S1-S4）的 job **今天没有 nodeId**（scheduler 按 shotId 派发，`multiShotBatchScheduler.ts:116-129`）。
- **S4 调度器接入点**：`electron/capabilityCore/appIntegration.ts:255-287`（gate 确认后 `start` → 多镜走 `scheduler.runToQuiescence()`）。
  `openProjectId`（`rendererBridge.ts:47,168` / `appIntegration.ts:319` 的 `isProjectOpen`）= 项目是否正开。
  `requestRenderer(op,payload,timeoutMs)`（`rendererBridge.ts`）= 主进程 → 渲染层反向请求；窗口不可用 throw `RendererUnavailableError`（调用方降级）。
- **进度三态派生**：`electron/productionRun/batchScheduleDerivation.ts`（`BatchProgress` total/completed/inFlight/pending + `CheckpointStatus` + `BudgetHalt`）——纯派生，无第二真相。
- **`resumeUnfinishedRuns`**：`productionRunService.ts:665-721`（已定义，**未接启动触发**）；`main.ts:632` 的 `nomi:capability:active-project` IPC = 开/切/关项目上报点。
- **渲染层已轮询 Run**：`src/workbench/production/useActiveProductionRun.ts`（每 1.5s poll `run.jobs[]`）——三态占位的信号源，直接读 Run，不建第二 store。
- **失败态视觉语言**：`src/workbench/generationCanvas/nodes/NodeErrorReport.tsx`（复用，重试钮本切片只留位不接线，S6 接）。
- **状态色**：`tailwind.config.ts:57-58` 有 `--nomi-danger/--nomi-warning`（根层），但**未映射进 color 对象**；`--nomi-success` 根本不存在（§3.7「补根层成功色」）。本切片补 `--nomi-success`(light+dark) + 映射 `nomi.warning/nomi.success`。

## 2. 无第二真相源的岔路裁定（§4 表：整批撤销 × 在飞 Job）

计划原文（§3.4）：「恢复补落**不复活用户刚撤掉的节点**（以撤销事实为准）——实现提示：撤销时给 Run 记一个 canvas-detached 事实或按本地撤销标记判断，**选与「无第二真相」一致的方案**」。

**裁定 = job 侧记 `nodeId` 幂等失效（不另立本地撤销标记）**：
- reconcile 补齐的判据 = `job.nodeId` 指向的节点在画布上**是否还存在**。存在 → 只回填 result；不存在 → **视撤销事实决定是否补建**。
- 关键区分「从没建过」vs「建了又被撤」：
  - 从没建过（项目没开时确认）：job **没有 nodeId** → reconcile 按 shotId 补建 + `plan.attach` 写回 nodeId。
  - 建了又被撤（整批 Cmd+Z）：job **有 nodeId 但节点已删** → 记 Run 事实 `canvas.node.detached`（job.status→保留，加 `nodeId` 清除 + 一个 detached 标记），reconcile **不再补建**（§4：以撤销事实为准）。
- 为何不用「本地撤销标记」：撤销标记是渲染层 store 的状态，跨会话/跨窗口不可靠（会成第二真相）。**Run 的 job.nodeId 生命周期就是单一真相**：有 nodeId+节点在=回填；有 nodeId+节点没=已撤（detached，不补）；无 nodeId=待建。
- 撤销发生时如何通知 Run：整批 txn 的补偿删除节点后，渲染层发一条 `production.detach-canvas-nodes`（nodeIds）→ 主进程对每个 job 记 detached。**若此刻窗口/项目关（不可能，撤销必在窗口内）忽略**。落地：detach 是「用户在画布上删了这些节点」的忠实映射，任何删节点路径（不止整批撤销）都可触发同一记账 → 通用（P2）。

> 这条岔路本身有多个合理解，但计划已给「与无第二真相一致」的方向，且 job.nodeId 方案不新增状态源、天然幂等、跨会话稳定 → **不停下上报，按此实现**（决策自治 P0：架构方向计划已定，非「分歧巨大的多个合理解」）。

## 3. 实现分解

### A. 设计系统：补根层成功色（先行，其余依赖它）
- `tailwind.config.ts`：`:root` 加 `--nomi-success`(oklch light) + dark 覆盖；color 对象加 `nomi.warning`/`nomi.success` 映射。
- 修既有隐性坏点：`AutomationPermissionsSection.tsx:249` 的 `text-nomi-success` 之前解析为空（顺带修好）。
- 过 `check:tokens`（根层定义，非作用域）；`check:tokens` 棘轮只减不增。

### B. 渲染层新 capability op（`capabilityApplyHandler.ts`）
1. **`production.materialize-shots`**（确认即落 + reconcile 补齐**共用**，P1 一个家）：
   入参 `{ projectId, runId, materializationOperationId, shots:[{shotId, role, title, prompt, kind, sceneOneLiner, existingNodeId?}], groupName }`。
   - 项目≠活动 → throw（同现有守卫）；活动项目才动 store。
   - 幂等章：`materializationOperationId`（复用现有 §1 通道的去重逻辑：扫 `node.meta.materializationOperationId`==本 op 且 `materializationShotId` 已建的跳过）。
   - **组也打章**：组 `meta`(NodeGroup 无 meta → 用组名内嵌 op？→ 见下)。NodeGroup 无 meta 字段 → 加 `materializationOperationId?` 到 NodeGroup 类型（最小扩），reconcile 建组前先查有无同章组，有则复用不重建。
   - **整批一个 txn**：`withCanvasGestureContext({source:'runtime',txnId,suppressUndoBarriers})` 逐同步段包（跨 await 分段，ctx 不跨 await）；事务自打一个 barrier（N 节点+边+组=一个 Cmd+Z）。
   - `role:'anchor'` 落 cast/scene 分类，`role:'shot'` 落 shots 分类，编进「分镜组·<计划名>」。
   - 返回 `bindings`(nodeId+shotId+provider+model)，供主进程 `plan.attach` 写回。
2. **`production.attach-shot-result`**：入参 `{ projectId, runId, nodeId, shotId, result:{type,url,thumbnailUrl?,providerUrl?,...} }`。
   - **运行时断言 `result.url` 必须 `nomi-local://`**（providerUrl 另存 `meta.providerUrl`；R17：grep 抓不住，断言写 op 里）。
   - 节点已删 → 静默跳过（返回 `{ skipped:'node-removed' }`，主进程据此在任务中心明示「画布节点已移除」）。
   - `addNodeResult(nodeId, result)`（自动并 history + emit）。
3. **`production.detach-canvas-nodes`**：渲染层整批撤销/删节点后调（其实反向：渲染层是**主动方**，通过既有 canvas 事件 → 主进程记账）。见 D。

### C. 三态占位（渲染层，读 Run 派生）
- 新 hook/组件：占位节点从 `useActiveProductionRun().run.jobs[]` 派生每个 `nodeId` 的批次态：
  - `job.status ∈ {planned,authorization_required,authorized,submit_intent_persisted}` → **排队中（第 n/N）**（accent/中性）。
  - `∈ {submitting,provider_accepted,polling,retry_wait,downloading,validating_*}` → **生成中**（沿用 NodeGeneratingOverlay 语言）。
  - `∈ {ready,adopted}` → 完成（result 已回填，占位退场）。
  - `∈ {needs_attention,detached,cancelled_remote,too_late}` 且 run halt/急停 → **已停**（`--nomi-warning` 非 danger）+ 一句人话 + 提额/继续入口占位（入口 S6 接线，本切片留位）。
  - `job.status` 失败（provider 拒）→ 失败态（复用 NodeErrorReport 视觉），**重试钮留位不接线**（注「S6 接线」）。
- **禁「永远等待生成」假进度**：占位态严格由 job.status 决定；无对应 job 的占位（reconcile 前）显「排队中」不显「生成中」。
- **进度通知稳定 id 原位更新**「已完成 3/7」：复用批量通知的稳定 id 模式（`canvas-batch-production.walk.mjs:390` 的 `data-batch-stable` 同款），不堆 toast。

### D. 整批撤销 × 在飞 Job（§4 语义）
- 整批 txn 提交后，**记住这批 nodeIds ↔ runId**（渲染层轻映射，仅用于「撤销时通知主进程」，非真相源）。
- 用户 Cmd+Z 撤这批 → 节点被删 → 渲染层监听 `canvas.node.deleted`（或撤销后 diff）→ 对被删且属某 run 的 nodeId 发 `production.detach-canvas-nodes`（IPC → 主进程 job 记 detached，清 nodeId）。
- 撤销≠急停：产物仍进素材库 + Run（result 回填走 addNodeResult，若节点已删则 `attach-shot-result` 返回 skipped → 任务中心明示「画布节点已移除」）。
- 恢复补齐不复活：reconcile 见 job 有 detached 标记（或 nodeId 已清且曾 detached）→ 不补建（§2 裁定）。

### E. 主进程编排（`appIntegration.ts` + service）
1. **确认即落**：多镜 `start`（`appIntegration.ts:271`）在 kick scheduler **之前**：若 `isProjectOpen(projectId)` → 尽力 `requestRenderer('production.materialize-shots', {...})`（超时短、catch `RendererUnavailableError`/任何错误 → 只记 warn 不阻断）→ 拿 bindings → `plan.attach`（或新 `job.bind-node` 命令）写 `job.nodeId`。**失败/项目没开都继续 kick scheduler**（Job 从合同派生，§1）。
2. **打开项目 reconcile + resume**：`main.ts` 的 `nomi:capability:active-project` → 新 `service.reconcileOpenProject(projectId)`：
   - 对该项目所有活跃 run：`requestRenderer('production.materialize-shots', {...按 run.jobs[].nodeId × plan.shots 补缺 + 已完成 result 回填})`（幂等，跑两次不重复）。
   - 已完成 job（ready/adopted）有 artifact → `production.attach-shot-result` 回填。
   - 顺带 `resumeUnfinishedRuns(projectId)`（S4 遗留接上）+ app 启动时对已知项目也扫一次。
3. **detach 记账命令**：新 reducer 命令 `job.detach-node`（清 job.nodeId + 标 detached），或复用现有命令扩 payload。
   - **result 回填遇节点已删**：主进程侧在 materialize/attach 回来 skipped 时，往任务中心/通知发「画布节点已移除」。

### F. 文案 i18n（zh-CN + en）+ data-* 锚点
- 占位三态文案、halt 占位、失败占位、进度通知、组名「分镜组·<计划名>」、任务中心「画布节点已移除」全走 i18n。
- data-* 锚点：`data-shot-placeholder-state`（queued/generating/stopped/failed）、`data-production-shot-node`、`data-batch-progress` 等，供走查断言。

## 4. 失败/撤销/重启语义对齐（§4 表）

| 时刻 | S5 行为 | 落点 |
|---|---|---|
| 确认时项目正开 | 尽力落占位+组（幂等章）；失败不阻断生成 | appIntegration `start` + materialize-shots |
| 确认时项目没开 | 不落；job 无 nodeId | 跳过 materialize，直接 kick scheduler |
| 打开项目 | 幂等补落缺失节点/组 + 回填已完成 result；resume 未完批次 | active-project → reconcileOpenProject + resumeUnfinishedRuns |
| 生成完成一镜 | 逐镜 attach-shot-result（url 断言 nomi-local://）| attach-shot-result op |
| 整批撤销 | ≠急停；节点删→job 记 detached；产物仍进库+Run | detach-canvas-nodes → job.detach-node |
| 回填遇节点已删 | 静默跳过 + 任务中心明示「画布节点已移除」 | attach 返回 skipped |
| 恢复补齐 | 不复活刚撤掉的节点（detached 不补） | reconcile 读 job detached |
| 预算 halt/急停 | 占位「已停」warning 非 danger + 人话 + 提额/继续入口占位（S6 接线）| 三态派生 |
| 失败镜 | 失败态（NodeErrorReport 语言），重试钮留位不接线 | 三态派生 |

## 5. 不动项（碰了=回归）

- Job 从封存合同派生，**绝不依赖画布 bindings**；画布落节点失败不影响生成（§1 铁律）。
- 单镜 E2E 14/14、S3a 34/34、elicitation 5/5、S4 批次 3/3 全保持。
- 调度器无自有持久状态；reconcile 幂等（materializationOperationId + 组章）。
- 唯一 spendConfirm 漏斗不动；S3a 卡不动（只在文案上确认「生成并放入画布分镜组」已在 S3a body）。
- legacy 批量路径不动（S7 收敛）。ctx 不跨 await。

## 6. 验收门

1. **J1 画布侧**（零额度 loopback）：确认→占位+组出现→镜头逐个填充→全部完成→**一个 Cmd+Z 整组消失**→素材库产物仍在。
   光/暗截图：落组全景、三态同屏（构造排队+生成中+已停并存）、完成态。
2. **J3 补齐**：模拟「确认时项目未开」→打开项目→节点+组+result 自动补齐幂等（跑两次不重复）。
3. 回归：单镜 14/14、S3a 34/34、elicitation 5/5、S4 批次 3/3。
4. `pnpm run gates` 全绿（含 check:test-types / check:test-waits）。
5. R13 走查截图亲读（file 绝对路径列表交付）。

## 7. 回滚

开关默认关；单 PR 可回滚；关 `MULTISHOT_V1` 即回 S1-S4 现状（落地全在多镜 start 分支 + 新 op，单镜/legacy 零触及）。

## 8. 岔路与遗留（交付时更新）

- 重试钮接线 / 版本切换 UI = S6。
- 提额续拍/继续 halt 的**入口按钮**本切片留位（占位文案 + data 锚点），接线 S6。
- APIMart 真付费验收 = S6（本切片零额度 loopback）。
