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

## M1 修复班（改判路线① · 2026-09-01，分支 `m1/final-assembly-20260901`）

编排者改判走路线①「就地根修回归」。基线锚点确证：**origin/main 全量 vitest 全绿（9095 通过 / 0 失败）**，故 delta 目标 = tip 也须 0 失败；cutover 基座每一条失败都是相对 main 的回归。合流最新 origin/main（0cb4b887）后逐簇根修：

**已根修 9 簇（47→12 失败，各一 commit，均附全仓实扫 + 无 collateral 验证）：**
| 簇 | 失败数 | 根因（一句） | commit |
|---|---|---|---|
| mcpSpendTrust | 7 | 测退役路 nomi_generate（cutover 成体系退役 + 写了退役测试锁意图），过时测试 + 孤儿模块 → 删 | `5df73eff` |
| apimart + generationProviderBootstrap | 7 | cutover 新增 direct-key/cert 凭据模型但漏给 APIMART_VENDOR_SEED 设 credentialMode:"direct-key" → cert 占用守卫哑火 | `bf59cde9` |
| productionRunCore + anchorCheckpoint e2e | 5 | cutover 把通用字段 gateId 列进 GENERATION_BINDING_MARKERS，legacy 防火墙误伤免费可逆门 decide-gate → 豁免该路径 | `0cbbb706` |
| launcherLocale + residentToolDisplay + runGenerationBatchTool | 3 | ①cutover 驮回 pre-08-28 旧 locale 测试期望 ②kind 判别符测试不一致 ③退役 run_generation_batch 漏清 gate.ts | `6eaa2a83` |
| exportJobIpc | 6 | cutover 新增 listExportJobs 调用方但漏在 runtime 桶再导出 → 首测崩溃级联 5 条 | `87683498` |
| nomiSkillResources | 1 | 损坏包（正文含 NUL）占 seenDirs 遮蔽同目录合法包 → 加控制字符校验跳过不占坑 | `7dcc5a24` |
| composeAgentSystemPrompt | 6 | cutover 回退两条已发布用户可见修复（机器串闸 + locale 感知语言规则）→ 外科恢复，保留 cutover 正当新增 | `05f9f4ec` |

**剩 12 失败 = 3 簇，其一为真架构岔路需编排者裁决：**
- **ProductionRun legacy-playbook 生成路（10 失败：driver 4 / sampleGate 2 / trustLevel 2 / qa 1 / pause 1）= 不可调和的 fork**。同一 `brand.promo` playbook 合约门批准后：cutover 的 `productionRunDriver.test.ts`「interrupts unsubmitted legacy jobs」断言**不得调 production.generate-node**、job 落 needs_attention（`legacy_generation_writer_retired`）、**无视频产物**；而 shipped 的 `productionSampleGate`/`productionRunPauseSemantics`/`productionQaVerify`（与 main 逐字一致、main 全绿）断言**必须调 generate-node**、镜 1 adopt 出视频产物、样片门 waiting。**没有单一实现能同时满足**——cutover 想退役 brand.promo 整条 legacy 生成、shipped 契约要它照常工作。这是产品级不可逆取舍（退役核心 production 生成路 or 保留），落在**付费/生成关键代码**上，无 landed plan 文档。按纪律停下上报，不擅自选边（选边即改一批安全敏感测试期望迁就另一批）。
- **RL2 `canvasReadCapturedSnapshotFlow`（1）**：cutover-new 子系统的 async 死锁（surface-a 等待非注册 surface 就绪 30s 挂），非 fork、可修但需深挖 cutover 新 canvasRead 编排。
- **agent-runtime-wiring（1）**：pi（NodeNext 岛）构建隔离——`agentChatV2.ts:19` 直 import pi 源 `.mjs`（解析到 `.mts`）把 1 个 pi 文件拖进 CommonJS 宿主程序，破坏「岛不入宿主」断言。需给 pi 模块设计 `.d.mts` 声明或改消费边界，非一行改。

**门禁现状**：typecheck 三配置全绿；lint:ci **红但非本班引入**——cutover 基座自带 99 warning（>82 棘轮 17 条，session 起点 0cb4b887 同为 99，本班 9 修 warning delta=0），属继承债；test 门因上述 12 失败红。**gates 全绿 + delta=0 需先裁决 ProductionRun fork**（决定退役还是保留 legacy 生成路），再据裁决完成剩余 3 簇 + 清继承 lint 债。9 簇修复本身已验证独立可对账。

### M2 红灯：ProductionRun legacy-playbook writer retirement（M1 明确保留现役）

编排者裁决：`brand.promo` 的 ProductionRun legacy-playbook 生成路是活产品功能，M1 保留 shipped 的 `production.generate-node` / `production.export` 行为；替代生成管线与 legacy writer 退役属于 M2，不在本分支通过改写生产契约完成。

- **复现命令**：`pnpm exec vitest run electron/productionRun/productionRunDriver.test.ts electron/productionRun/productionSampleGate.test.ts electron/productionRun/productionTrustLevel.test.ts electron/productionRun/productionQaVerify.test.ts electron/productionRun/productionRunPauseSemantics.test.ts --reporter=verbose`
- **当前红态（M2）**：该命令在 M1 已全绿，但 M2 退役断言仍为红灯：legacy job 在合同/样片/信任/QA/暂停语义下仍会调用 `production.generate-node`，并可落地视频；M1 不把这组断言伪装成已完成，也不删除现役行为。
- **M2 通过断言**：替代管线 shipped 后，恢复并通过迁出的 retired-writer assertions：legacy `submit_intent_persisted` 不再进入 `production.generate-node`，job 持久化为 `needs_attention` + `legacy_generation_writer_retired`，无 video artifact、arrange 或 export；冻结/非冻结两条路径与 sampleGate、pauseSemantics、QA verify 的退役行为均有类级覆盖，并确认新管线承担等价生成、落地、编排和导出闭环。
