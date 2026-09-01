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

终装分支从 `rescue/m1-cutover-d270d34e`（Host/runtime + resident-shell transport transplant）起。cutover 基座**已自带**更成熟的 captured-canvasRead sealing（`CapturedCanvasReadSnapshotHandleWire` 一等 wire 类型，贯穿 `capabilityApplyHandler`/`runStoryboardPlanner`/`generationCanvasAgentClient`），因此 consolidation r3 的 canvasRead 切片在此**已被超集实现取代、无需移植**；只移植 r3 中 cutover 尚无的部分：coordinator `steer`/`interrupt` + IPC `turn.steer`/`turn.interrupt` handler + `agent.processInterrupted` i18n key + 2 条 coordinator 测试。

### ⚠️ 阻塞发现：cutover 基座自带 ~47 个测试回归 + RL2 挂起（非本终装工作引入）

装依赖后在**合流前的干净 source-1 commit** 与**合流后**分别跑全量 `vitest run`，逐条比对：

- **本终装的 step1（合流三源）/step2（三档回正）/i18n 修复引入的新失败 = 0**（`comm -13` 干净比对：合流前 51 失败、合流后 47 失败，差集仅一条 antigravity flake 抖动）。RL1 16/16 绿、RL3 10/10 绿。
- **cutover 基座本身携带 ~47 个测试红**，分布：`mcpSpendTrust`(7·elicitation 路返回 undefined)、`generationProviderBootstrap`(4)、`apimartGenerationProvider`(3)、`productionRunCore`/`productionRunDriver`/`productionSampleGate`/`productionTrustLevel`/`productionQaVerify`/`productionRunPauseSemantics`(共 ~11)、`mcpLauncherLocale`、`residentToolDisplay`、`runGenerationBatchTool`、`nomiSkillResources` 等。
- **根因不是「旧基线 delta」，合流 origin/main 修不掉**：cutover（`d270d34e`）落在 98 commit 前的旧 main（merge-base `7bf7e27f`）上，且是 **607 文件的近全树 transplant**；上列失败源文件逐一验证均为 **[CUTOVER-MODIFIED][main=base]**——即 cutover 自己改动这些源、改坏了它们的测试，而 main 从没动过这些文件（合流无内容可并）。已按纪律合入最新 `origin/main`（59e1f6c0，解 3 冲突），失败从 49→47（只修掉了 skillPackage/exportJobIpc 这类 main 侧确有演进的少数）。
- **RL2 挂起**：RL2 命令匹配 2 测——`sealed A…rejects replay` 绿；`…one canonical snapshot after selection and project switch` **30s 超时挂起**（隔离单跑也挂）。该测 `canvasReadCapturedSnapshotFlow.test.ts` 为 **cutover-new**、其源（`canvasReadPortResolver`/`canvasReadSurfaceIpc`/`agentChatV2Ipc`/`canvasReadCapturedSnapshotRegistry`）全为 [CUTOVER-MODIFIED][main=base]——cutover 自身 canvasRead 实现的死锁/未 settle bug。故 consolidation 证据表的「RL2 绿 2/2」在 cutover 基座上**不成立**（consolidation 走的是 r3 的 canvasRead 路径、cutover 走的是另一套，后者这条挂）。

**结论/需编排者裁决**：cutover 基座是一份 607 文件的 WIP transplant，自带 ~47 个自身回归 + RL2 死锁，横跨 MCP-elicitation / 生成供应商安全 / ProductionRun 门 / 常驻 UI 投影多个子系统——**超出「三源合流 + r3 重接 + 三档回正 + 红灯重验」的既定范围**，且这些修复涉及安全敏感逻辑（付费信任、供应商引导）与核心流程门，逐个需要「Codex transplant 意图 vs main」的对账，不是机械修。合理解分歧巨大（① 就地修 47 回归；② 在**当前 main** 上只重接真正新增的 M1 Host/runtime 文件、避开 344 处宽泛 revert；③ 对非核心-M1 的 cutover 改动做外科式回 main）。按决策自治纪律（架构岔路、影响大、多个分歧巨大合理解）**停下上报**，不擅自选一条烧数轮。step1–3 的 M1 交付本身已完成且零新增失败，可独立对账。
