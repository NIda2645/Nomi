# M0 → M1 测试红灯清单

以下红灯是进入 M1 的硬门。它们记录的是 #223 精确 ref `pr223-finish@46066ed0` 的已测状态；M0 不修改生产代码、不用延长 timeout 掩盖失败。

| 红灯 | 复现命令（在装好依赖的 checkout 执行） | 当前红状态记录 | M1 通过断言 |
|---|---|---|---|
| ProductionRun 门编排：`budget-approval → shot-gates-never-open` | `pnpm exec vitest run electron/productionRun/productionGenerationAuthorizationFlow.test.ts electron/productionRun/productionShotGate.test.ts electron/productionRun/productionRunE2eFixture.test.ts`；按 `--reporter=verbose` 记录 18 个受影响测试 | `pr223-finish@46066ed0`：18 tests 受影响，budget approval 后 shot gates 不打开；计划 §6.0 标为 I-1 | 门状态持久化、approval/receipt/预算无副作用重复；18 测恢复后再扩类级并发/重启测试 |
| Canvas captured snapshot flow 挂起 | `pnpm exec vitest run electron/capabilityCore/canvasReadCapturedSnapshotFlow.test.ts --testNamePattern "sealed A|captured" --reporter=verbose`；必要时用 test runner 的默认 hang 检测，不增 timeout | `canvasReadCapturedSnapshotFlow.test.ts:467` 的 `await expect(pending).resolves...` 挂起；等待/快照 release 生命周期未闭合 | `pending` 在 release 后必 settle；切换 project B 不污染 sealed A；不读 disk、不再发重复 request |
| `deviated` 恒为 false | `git grep -n "deviated: false" 46066ed0 -- electron/projectAgentHost/projectAgentExecutionCoordinator.ts electron/projectAgentHost/projectAgentExecutionHelpers.ts`；再运行 `pnpm exec vitest run electron/projectAgentHost/projectAgentExecutionCoordinator.test.ts electron/projectAgentHost/projectAgentExecutionHelpers.test.ts` | 9 个生产写入点硬编码 `false`，只有读取没有置真路径；现有测试无法证明偏差会发布/持久化 | reducer/ledger 有唯一 owner；报告案例和另一个同类入口都能置真、重启恢复、UI projection 保持一致 |

## 红灯纪律

- 失败分类是“缺共享生命周期/状态 owner”，不是把单测 timeout 调大或只改 fixture。
- 每个红灯进入对应 schema-v3 contract 的 `same_class_entry_points` 与 `class_regression_tests`；M1 实现后必须把本文件的当前红输出替换为带 commit/命令/绿证据的记录。
- 当前工作区缺少 node_modules，以上命令在本 checkout 不能声称已现场重跑；这是环境阻塞，不是把红灯改写成“通过”。

