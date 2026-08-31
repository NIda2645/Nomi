# P4 形象确认卡（锚检查点渲染层）——接 #156 决议链

日期：2026-08-25
分支：`claude/p4-anchor-checkpoint-card`（worktree `/Users/aoqimin/Desktop/nomi-checkpoint-card`）
上游：接 PR #156（`production.decide-gate` 放行 `anchor_checkpoint` + service post-decide 钩子自动续踢批次）。
状态：实施中。

## 一句话

带锚（定妆照）的多镜批在锚生成完后停在一道**免费质量门**（`anchor_checkpoint`）。#156 已把 headless 决议链打通（dispatcher/MCP/钩子），但**渲染层没有卡** → 真人过目/开拍/重拍这条路只在 MCP 侧有。本任务把获批样张实现成真卡、接到既有决议链、走查+截图。

## 样张拍板记录

- **2026-08-25 用户批准**（原话「可以的」），五个决策定稿：
  1. **同轨道宿主**：形象确认卡与花钱确认卡走同一条对话框轨道（`SpendConfirmDialog` 家族，`useSpendConfirmStore.requestConfirm`），不另造并行卡（P1 一功能一个家）。
  2. **零内部词**：卡上不出现「锚/检查点/冻结/封存/物化/合同」任何一个。
  3. **两句承诺**：说明行明说「这一步不新增花费」+「不满意哪张就重拍哪张，只花那一张的钱」。
  4. **重拍联动**：重拍选中 → decide rejected + 对选中锚走 S6 返工链（`reworkShot`），新 attempt 完成后检查点重新武装、卡再弹。
  5. **自动放行可配脚注**：生产默认不设 `anchorAutoReleaseMs` → 默认不显示脚注；仅当 run 配了自动放行才显示倒计时（详见下「自动放行」裁定）。

## 决议链接线核实（#156 真实 API，逐条对账）

读源码核实结果（file:line）：

- **门形状**（`electron/productionRun/anchorCheckpoint.ts`）：`scope:"anchor_checkpoint"`、`gateId:"gate-anchor-checkpoint-{runId}"`、`status:"waiting"|"approved"|"rejected"`、`jobIds:[...anchorJobIds]`、`title`/`summary` 是**英文 agent-facing 标签**（渲染层用 i18n 覆盖，不上屏）。授权**零预算**（repository 预算授权分支只认 `budget_envelope`）。
- **决议 API**：渲染层走既有 `productionRunApi.command(projectId, runId, { type:'gate.decide', payload:{ gateId, status:'approved'|'rejected' }})`（= `preload.ts` `nomi:production-runs:command` → repository → service.command）。**与所有其它门同一条命令**，无需新 IPC。service post-decide 钩子（`productionRunService.ts:611-618`）见到 `isAnchorCheckpointGate` 即 `kickBatchSchedulerForRun` 自动续踢批次——**开拍后我不用手动踢**。
- **approved 语义**：放行镜头批（钩子重踢 scheduler，剩余镜在已批预算内生成，不新增授权）。
- **rejected 语义**（`batchScheduleDerivation` + e2e `anchorCheckpointApproval.e2e.test.ts:182-215`）：门停在 `rejected`、**零新提交、定妆照保留**；derivation 对 rejected 是**免费空 tick**，只在**有新 attempt**（经 S6 返工链重出形象 stage）后才重派锚。故「重拍这张」= decide rejected **+** 对选中锚 `reworkShot`（`productionRunApi.rework(projectId, runId, shotId)`）。
- **数据取用**（渲染层）：门的 `jobIds` = 锚 jobId；对每个锚 `job`（`run.jobs`，`job.metadata.shotId` 关联 `run.generationPlan.shots` 里 `role==='anchor'` 的镜）取 `candidate.prompt` 作名称、经 `job.jobId` 找 `run.artifacts`（`artifact.jobId` 匹配、kind image、status ready/adopted）取 `thumbnailRelativePath`/`projectRelativePath` → `buildNomiLocalAssetUrl` 出定妆照缩略图。read 投影返回完整 run（`repository.read` 返回整个 `ProductionRun`，`generationPlan.shots` 含 role/nodeId、gates、jobs.metadata、artifacts.jobId 全在）。

## 收到检查点 gate 的渲染层通道（选既有，不新造）

既有链路已完备，检查点门天然流过，无需新通道：

- `useActiveProductionRun`（`useProductionStatus` 用）每 1.5s poll 当前项目 run 投影 → `productionRunStore`。
- `buildProductionRunView(run)`：`waitingGate = run.gates.find(status==='waiting')` → 检查点门就是这个 waiting gate → `primaryAction:'open-gate'`、`targetId: gate.gateId`。
- `TaskCenterPanel`（顶栏 TaskCenterButton 常驻、任意视图可开）渲染 `ProductionRunTaskCard`，卡上主按钮点击 → `onPrimaryAction('open-gate')` → `useProductionStatus.onPrimaryAction`。

**改动点**（都在既有分诊逻辑里加一条 `anchor_checkpoint` 分支，非新造）：
1. `productionRunView.ts` `gateKindOf`：加 `'checkpoint'` 门类（`scope==='anchor_checkpoint'`），`decisionHome` 归 `'nomi'`（免费门但决定在 Nomi）、文案 key 用 `checkpointGate`。
2. `useProductionStatus.ts` `onPrimaryAction`：检查点门分支调 `requestConfirm({ kind:'anchorCheckpoint', anchorCheckpoint:{...} })`，approved → `gate.decide approved`；「先不拍」→ 不 decide、直接 return（门保持 waiting）；「重拍选中」→ decide rejected + 逐个 `productionRunApi.rework(pid, rid, shotId)`。
3. `spendConfirm.ts`：`SpendConfirmRequest` 加 `kind:'anchorCheckpoint'` + `anchorCheckpoint?: {...}` 载荷 + `onRework?`/`onDefer?` 回调（沿用既有「请求对象带回调」模式，不改 boolean 契约）。
4. `SpendConfirmDialog.tsx`：`kind==='anchorCheckpoint'` 时渲染新 body 组件 `AnchorCheckpointCard`（与 `ProductionContractSummary`/`MultiShotContractSummary` 同款——`SpendConfirmDialog` 渲染滚动内容区、body 组件画网格）。
5. 新组件 `spend/AnchorCheckpointCard.tsx`：定妆照 2 列网格 + 底行（名称 + 徽标 + 重拍钮）+ 两句承诺说明行。
6. 新纯函数 `spend/anchorCheckpointView.ts`：run + gate → `AnchorCheckpointCardModel`（可单测，签名不吃 playhead 类漂移源）。

## 重开入口裁定

**结论：复用既有任务中心 run 状态卡，不建新常驻控件。**

理由：「先不拍」= 不 decide → 门保持 `waiting` → `buildProductionRunView` 持续返回 `primaryAction:'open-gate'` → `ProductionRunTaskCard` 持续显示主按钮 → 再点即重开。任务中心顶栏常驻、任意视图可开（§1.5：挂在已有 run 状态条目上，禁新常驻控件）。满足任务「等待中的检查点卡能再唤出」要求，零新增控件预算。

## 自动放行脚注裁定

- 生产**有意不设** `anchorAutoReleaseMs`（#156）→ 默认**不显示**脚注。
- 门带 `expiresAt`（默认 24h TTL），但那是「决策过期」不是「自动开拍」，**不当倒计时显示**（显示会误导成「不管它就会自己开拍花钱」）。
- 仅当 run 真配了自动放行（`anchorAutoReleaseMs`）才显示倒计时脚注。**Per-gate 取消自动放行**：#156 门机制不透出 per-gate 覆盖入口（无 `anchorAutoReleaseMs` 的 per-gate 取消 API）。故按任务指示：**脚注只显示倒计时、不带取消链接**，并在此记录。因生产默认路径根本不显示脚注，此分支为诚实兜底（若未来配了自动放行也不至于把用户吓到）。

## 词汇红线

卡上零内部词。i18n zh+en 全量新增，放**独立区块** `generationCommon.production.checkpoint`（减少与在飞 F15 改 `generationCommon.ts` 的冲突面）。push 前 rebase origin/main。

## 不动项

- 不改 #156 的 headless 决议链（dispatcher/mcpProtocol/service 钩子/batchSchedulerKick）——只在渲染层接线。
- 不改 `SpendConfirmDialog` 其它 kind 分支的视觉/行为。
- 不改 `ProductionRunTaskCard` 的既有分诊（只在 view/status 加检查点分支）。
- 不新建 IPC 通道、不新建常驻控件、不新建设置面。
- 「新拍 vs 复用上集」徽标：origin/main 无 reuse 标记（`nomi-anchor-reuse` 分支在飞、未合）→ **默认全标「新拍」**，但 view 函数留 `reused` 位，reuse 机制落地后填即可（D4 诚实交付：不伪造复用态）。

## 回滚

单分支单 PR，`git revert` 或关 PR 即回滚。渲染层改动不触碰 durable 数据，无迁移。

## 验收门

- 零额度走查（`tests/ux/`，`_assert.mjs` + 阳性对照）：pin 停在检查点的 run → 卡弹 → 断言标题/徽标/两句承诺可见 + 零内部词 → 点开拍 → 断言 decide approved 发出且卡收 → 重开路径 → 重拍选中态 + 主按钮变形。光/暗截图各一组，自己 Read 亲眼看。
- E2E：渲染层 IPC → dispatcher decide → 钩子续踢（#156 e2e 已盖 headless 半程；补渲染层半程接线断言，不重复造）。
- 门禁全链真退出码（不用管道接 test/build）：`check:filesize` → `check:tokens` → `check:i18n` → `check:heavy-path` → `lint:ci` → `typecheck` → `test` → `build`。
