# M0 → M1 测试红灯清单

以下红灯是进入 M1 的硬门。它们记录的是 #223 精确 ref `pr223-finish@46066ed0` 的已测状态；M0 不修改生产代码、不用延长 timeout 掩盖失败。

| 红灯 | 复现命令（在装好依赖的 checkout 执行） | 当前红状态记录 | M1 通过断言 |
|---|---|---|---|
| ProductionRun 门编排：`budget-approval → shot-gates-never-open` | `pnpm exec vitest run electron/productionRun/productionGenerationAuthorizationFlow.test.ts electron/productionRun/productionShotGate.test.ts electron/productionRun/productionRunE2eFixture.test.ts --reporter=verbose` | **M1 绿**：18/18 focused tests passed；approval/receipt/budget path is idempotent in the existing production owner | 门状态持久化、approval/receipt/预算无副作用重复；18 测恢复后再扩类级并发/重启测试 |
| Canvas captured snapshot flow 挂起 | `pnpm exec vitest run electron/capabilityCore/canvasReadCapturedSnapshotFlow.test.ts --testNamePattern "sealed A|captured" --reporter=verbose` | **M1 绿**：release resolves the pending read and a project-B handle cannot read sealed A | `pending` 在 release 后必 settle；切换 project B 不污染 sealed A；不读 disk、不再发重复 request |
| `deviated` 恒为 false | `pnpm exec vitest run electron/projectAgentHost/hostLifecycle.test.ts --reporter=verbose` | **M1 绿**：5/5 lifecycle tests passed; `markDeviated` is the sole durable write path and survives reopen | reducer/ledger 有唯一 owner；报告案例和另一个同类入口都能置真、重启恢复、UI projection 保持一致 |

## 红灯纪律

- 失败分类是“缺共享生命周期/状态 owner”，不是把单测 timeout 调大或只改 fixture。
- 每个红灯进入对应 schema-v3 contract 的 `same_class_entry_points` 与 `class_regression_tests`；M1 实现后必须把本文件的当前红输出替换为带 commit/命令/绿证据的记录。
- M1 focused commands 已在本 checkout 现场重跑并记录为绿；完整 gates 的剩余阻塞来自 Electron runtime 缺失与既有网络型测试环境，不得改 timeout 或放宽断言。

## M1 收拢班复核（2026-09-01，分支 `m1/consolidation-20260901`，含 Codex r3）

三条红灯的原命令在装好依赖的 checkout 逐字重跑，均为绿（未改任何测试、未放宽断言、未调 timeout）：

| 红灯 | 原命令 | 复核结果 |
|---|---|---|
| RL1 ProductionRun 门编排 | `pnpm exec vitest run electron/productionRun/productionGenerationAuthorizationFlow.test.ts electron/productionRun/productionShotGate.test.ts electron/productionRun/productionRunE2eFixture.test.ts --reporter=verbose` | **绿 16/16**（含重启后不提交直到批准、拒绝暂停不发供应商调用、重启后语义导出清单）|
| RL2 Canvas captured snapshot | `pnpm exec vitest run electron/capabilityCore/canvasReadCapturedSnapshotFlow.test.ts --testNamePattern "sealed A\|captured" --reporter=verbose` | **绿 2/2**。落 r3 前实测为红（`toolDecision` 返回 `undefined`，2 failed）；r3 的 captured-snapshot sealing（`capabilityApplyHandler` + `runStoryboardPlanner` 一次性 ephemeral admission）修复根因后转绿：sealed A 在 Surface 切到 B 后仍只读一份规范快照并拒绝 replay，未读 disk |
| RL3 deviated / hostLifecycle | `pnpm exec vitest run electron/projectAgentHost/hostLifecycle.test.ts --reporter=verbose` | **绿 10/10**（含 1,000 命令同实体快照有界无稳态 ledger 重扫 12.3s、并发同项目 FIFO+CAS、重启后精确 receipt 重放）|

RL2 是本轮唯一从红转绿的红灯，直接证明 Codex r3 的 canvasRead 生命周期修复真实有效，无需改测试。

## M1 终装班复核（2026-09-01，分支 `m1/final-assembly-20260901`，cutover 合流）

终装分支从 `rescue/m1-cutover-d270d34e`（Host/runtime + resident-shell transport transplant）起。cutover 基座**已自带**更成熟的 captured-canvasRead sealing（`CapturedCanvasReadSnapshotHandleWire` 一等 wire 类型，贯穿 `capabilityApplyHandler`/`runStoryboardPlanner`/`generationCanvasAgentClient`），因此 consolidation r3 的 canvasRead 切片在此**已被超集实现取代、无需移植**；只移植 r3 中 cutover 尚无的部分：coordinator `steer`/`interrupt` + IPC `turn.steer`/`turn.interrupt` handler + `agent.processInterrupted` i18n key + 2 条 coordinator 测试。三条红灯原命令在本终装分支重验的逐字输出见下方「终装分支红灯重验」小节（步骤 3 追加）。
