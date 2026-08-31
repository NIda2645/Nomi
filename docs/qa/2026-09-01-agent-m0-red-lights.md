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
