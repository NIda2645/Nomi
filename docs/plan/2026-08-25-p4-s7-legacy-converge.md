# P4 S7 — legacy 批量路径收敛（批量只剩一台机器）

日期：2026-08-25 · 分支：`claude/p4-s7-legacy-converge` · 基线：origin/main @ 1a3465be（含 #162 F15 冻结门操作者）
计划源：`docs/superpowers/plans/2026-08-24-p4-multishot-continuity.md` §3.6/§7（S7 独立成片）+ `docs/superpowers/plans/2026-08-22-nomi-unified-editor-runtime.md` §7-8（legacy 处理纪律 + 回滚）+ F15 plan §5（S7 收敛注记）

---

## 0. 裁定（先给结论 —— D5）

**本片交付 = S7a：把「批量只剩一台机器」这条不变量做成结构门岗 + 收敛已可收敛的那一处（brand.promo 冻结门 → 语义检查点判据统一），并把三台机器的真实边界白纸黑字固化。S7b（brand.promo `driveGeneration` 整条播报驱动 → 语义调度器）只出排期、不动工。**

**为什么不是「一把梭把三台合成一台」**（D3 第一性 + D6 讲清取舍）：

实查后三台机器的**真实收敛成本天差地别**，硬凑一片=违反 R9（巨壳）+ P3（半成品）+ 会把当前**唯一现役**的 GUI 生成主路径置于风险：

| 机器 | 现状（file:line 实读） | 现役性 | 收敛成本 | 本片处置 |
|---|---|---|---|---|
| **#3 legacy MCP 路** `mcpGenerationPolicy.ts` | **已经是「显式标 legacy + fail-closed」**：`classifyRoute` 把 `generate`/`nomi_generate`/`production.start`/`production.control`/`production.decide-gate`/`nomi_start_playbook` 标 `legacy`；`guardLegacyGenerationRoute`（`generationDispatcher.ts:77`）见语义 binding 就抛 `legacy_path_forbidden`（不双写项目事实）；模块 docstring 白纸黑字「deliberately does not route legacy generation calls」 | 兼容入口 | **0（已合规）** | **验证 = 通过**，加一条门岗钉死「不回退」 |
| **#1 GUI 画布 runner 批量** `generationRunController.ts:394 runGenerationNodesByPlan` | 渲染层自有派发循环（`runGenerationNodesBatch` 并发池 + 波次串行）；自己的 spend-grant（`mintSpendGrant`）+ 确认漏斗（`useSpendConfirmStore`）+ 队列台账（`generationQueueStore`）+ 结果堆叠（`addNodeResult`）；**无 ProductionRun / 无 receipt ledger / 无 observe 轮 / 无 durable 状态**。**5 个入口**（见 §2.1） | **默认现役的唯一 GUI 批量路径**（语义调度器默认关，见 §1.3） | **数周级架构迁移** | **显式冻结 + 门岗**（不塞新功能；新功能只进语义调度器） |
| **#2 brand.promo `driveGeneration`** `productionRunDriverOps.ts:206` | 主进程顺序循环，逐 job `production.generate-node`；自己的样片门/冻结门/预算边界；**无 observe 轮、无退避、无 driveScheduler 15s 续踢** | 现役 MCP 工具 `nomi_start_playbook` | **中（需把播报剧本移植到 shots[]+scheduler）** | **本片收敛冻结门判据（§3.2）+ S7b 排期整体收编** |

**根据（不是脑补）**：`2026-08-22-nomi-unified-editor-runtime.md` **line 103**「Canvas/Timeline = 当前项目事实和用户可见投影 | **P5 的 Proposal adapter，不先迁移 owner**」+ **line 505**「flag 关闭时新语义工具返回 `feature_disabled`，**旧 `nomi_generate` 的付费/写 Canvas 语义不变**」。即：**架构上就规定了 Canvas owner 迁移是 P5，不是 S7**。北极星的第二个分支（「显式标 legacy 冻结不再喂新功能」）正是为 #1 这种情况准备的——它**不是妥协，是既定 sequencing**。硬把 #1 塞进默认关的语义调度器 = 既违 sequencing 又拿现役主路径冒险，且落一个巨壳。

**S7a 的真实价值**（D1 用户摩擦 / D2 结构约束）：
- 把「批量只剩一台机器」从**口号变成机器每次拦的门岗**（`check:batch-machines`）：任何人新造第四台批量派发循环、或给冻结的 legacy 路加新功能 → 当场报红。这才是 P2「修完这类还能从别的入口出现吗」的结构保证。
- 收敛 #2 的冻结门判据到语义检查点的**同一判据源**（消除「两套冻结语义」漂移的种子），把 F15 §5 点名的 S7 收敛项落地。
- 三台机器的边界/归属**白纸黑字固化**（本文档 + 代码注释 + 门岗），下一个 agent 不用重新考古。

---

## 1. 家底核实（file:line，全部实读过 origin/main @ 1a3465be）

### 1.1 三台批量机器的确证

**语义侧（正牌，S1–S6.5 已合 main）**：
- `electron/productionRun/multiShotBatchScheduler.ts:125 createMultiShotBatchScheduler`（406 行）——**无自有状态**的派生调度器；`runToQuiescence` 跑到静止点（锚齐+检查点等待 / halt / 完成）。
- `electron/productionRun/batchScheduleDerivation.ts:deriveBatchPlan`（343 行）——纯派生「下一批可派发集合」（jobs[]+ledger 重算，崩溃恢复=同函数重跑）。
- `electron/productionRun/anchorCheckpoint.ts:41 buildAnchorCheckpointGate`——锚亮相检查点：**Run-native gate**（`scope:'anchor_checkpoint'`），事实在 Run gate 列表（不在渲染层 store），gate 状态决定放行/拦镜。
- `electron/capabilityCore/appIntegration.ts:374/480/403 driveScheduler`——生产入口：`operation.shots?.length > 0` → 建 scheduler + `driveScheduler`（15s `REKICK_DELAY_MS` 续踢慢供应商，#158 死锁修复）；单镜走 `submission.start` 扁平入口。
- `electron/capabilityCore/mcpGenerationMultiShot.ts:160 createMultiShotCreateHelpers`（235 行）——S6.5 生产入口（scriptText/plan → shots[] → seal）。

**legacy 侧（本片对象）**：见 §0 表 #1/#2/#3 的 file:line。

### 1.2 冻结/锚：两套并行判据（F15 §5 收敛对象）

**legacy `meta.frozen` 轨**（画布节点概念）：
- 写：`src/workbench/generationCanvas/fixation/freezeAnchor.ts:22 confirmAnchorLook`（#162/F15 刚装的唯一操作者，写 `meta.frozen={at,by:'user'}`）。
- 判据镜像：`src/workbench/generationCanvas/model/anchorBibleKeys.ts`（渲染层）≡ `electron/capabilityCore/anchorBible.ts`（权威），`anchorBible.equivalence.test.ts` 钉死等价。
- 读（GUI 批量）：`dependencyWaves.ts:67 isUnfrozenVisualAnchor` → 引用未冻结锚的镜头标 `unfrozen-anchor` blocked。
- 读（brand.promo 播报驱动）：`productionRunDriverOps.ts:427 readUnfrozenAnchors` → `requestRenderer('production.check-frozen')` → `src/workbench/capability/capabilityApplyHandler.ts:550` 读渲染层 store 的 `meta.frozen`（同一 `anchorBibleKeys` 镜像）。

**语义 `anchor_checkpoint` 轨**（Run/Job 概念）：
- `anchorCheckpoint.ts` + `multiShotBatchScheduler.ts:196 openCheckpoint`：锚 **job 出图后** 开 Run gate，用户过目**全部锚**（新生成+复用）→ 批准放行镜头。判据 = **job 就绪 + gate 决议**，**不读 `meta.frozen`**。

**关键事实**：`production.check-frozen` 桥（PR #156 已合）+ `freezeAnchor.ts`（#162 已合）→ **三台机器读写冻结已共用同一份 `anchorBible` 判据源**（GUI 写 = brand.promo 读 = 同一 `meta.frozen`+同一镜像判据）。F15 §5 说的「GUI 定妆写的 `meta.frozen` 与 headless checkpoint 合并成一条语义链」在**判据层已天然贯通**；剩下的漂移风险 = **判据函数各写各的**（GUI 用 `anchorBibleKeys.isAnchorFrozen`，headless 用 `anchorBible.isAnchorFrozen`，靠 equivalence test 保等价而非同源）。S7a 把这条漂移种子按 §3.2 收掉。

### 1.3 语义调度器默认关（决定 #1 现役性的决定性事实）

`mcpGenerationPolicy.ts`：语义面（含多镜）门在 `NOMI_MCP_GENERATION_SINGLE_SHOT_V1` + `..._E1_V1`；`readFlag` 未设即 `false`（`mcpGenerationPolicy.ts:76`）。**无独立 `MULTISHOT_V1` flag**（P4 plan §3.6 提过但从未实现为独立开关，多镜搭单镜 flag 的车）。→ **默认构建里 GUI 用户只有一条现役批量路径 = 画布 runner（#1）**。这是「#1 现在不能拆、只能冻结」的硬约束：拆了默认无批量可用。

---

## 2. 收敛映射表（旧路径 → 新走法）

| 旧路径 | 现役入口 | 新走法（北极星映射） | 本片动作 |
|---|---|---|---|
| #3 `nomi_generate`/`generate`/`production.*`/`nomi_start_playbook` 携带语义 binding | MCP | **已收敛**：`legacy_path_forbidden` 拒双写，语义 binding 只能走 `nomi_operation_create` | 加门岗钉死判据集不回退 |
| #1 GUI `runGenerationNodesByPlan`（5 入口） | GUI 画布 | **显式冻结**：既有行为逐字节保留（现役唯一 GUI 批量），**不加新功能**；新批量能力（合同/收据/预算/检查点/慢供应商韧性）只进语义调度器；Canvas owner 迁移 = P5 Proposal adapter | 打 `@legacy-batch-frozen` 标记 + 门岗禁新增派发循环 |
| #2 brand.promo `driveGeneration` 冻结门（`readUnfrozenAnchors`） | MCP playbook | 冻结判据收敛到与语义检查点**同一判据源** | **本片收敛**（§3.2） |
| #2 brand.promo `driveGeneration` 整条顺序循环 | MCP playbook | 组装 shots[] → 走 `multiShotBatchScheduler` | **S7b 排期**（§6） |

---

## 3. 改动清单（按根因层）

### 3.1 结构门岗 `check:batch-machines`（P2 通用性：把不变量做成机器每次拦）

新 `scripts/check-batch-machines.mjs` + `scripts/batch-machines-baseline.json`（棘轮只减不增，逐字对齐 `check:heavy-path.mjs` 的 RULES/baseline/`--update-baseline`/exit-code 骨架）。

**判据不猜「像不像循环」，钉「谁能碰 provider-submit 原语」**（实读校准，见 §1 census）——这是低噪音的关键（heavy-path 教训「宁可漏报，不要噪音」）：

1. **`runGenerationNode(` 调用点白名单**（渲染层 submit 原语）：实测只在 `generationRunController.ts`（5 处：worker 循环 + 单节点变体）、`generationCanvasTools.ts`（单节点 agent 工具）、`capabilityApplyHandler.ts`（单节点 capability apply）。门岗钉死「调用 `runGenerationNode(` 的**文件集**⊆ 这三个」。新批量机器要在渲染层派发，必然新增一个调用点 → 报红。
2. **`production.generate-node` 请求点白名单**（主进程 durable submit 原语）：实测只有 `productionRunDriverOps.ts`（brand.promo 驱动，1 处）+ e2e fixture + capability 声明。门岗钉死请求 `'production.generate-node'` 的**文件集**⊆ 已知。新主进程批量驱动要么走语义 `submission` facade（正道，本门岗不拦），要么新造 `production.generate-node` 请求点 → 报红。
3. **legacy MCP 判据集不回退**：`mcpGenerationPolicy.ts` 的 `LEGACY_GENERATION_ROUTES` 必须恒含六条 legacy 路（`generate`/`nomi_generate`/`production.start`/`production.control`/`production.decide-gate`/`nomi_start_playbook`）；少一条 → 报红（防误把某条挪出 legacy 分类 → 语义 binding 从旧路穿透双写项目事实）。
4. **冻结判据只准两处**（§3.2）：`meta.frozen` 的 `at>0` 判据 + `referenceSheet===true` 视觉锚判定的**函数实现文件集** = {`anchorBible.ts`, `anchorBibleKeys.ts`}；第三处 → 报红。

**加门岗必先验它会红**（R17 铁律）：提交前用临时文件各造一处违规（新增 `runGenerationNode` 调用点 / 挪走一条 legacy 路 / 第三处 frozen 判据）证明报红、再删。规则清单以脚本 `RULES` 为准，别在文档里数条数。

### 3.2 冻结判据「双源镜像」定型 + 禁第三份实现（守住 F15 §5「一条语义链」）

**实读修正（别乱收）**：`anchorBibleKeys.ts:1-7` 白纸黑字——渲染层**反向 import 不了 electron 主进程模块**，故 `anchorBibleKeys.ts` 是**故意的纯镜像**（键名+判据），由 `anchorBible.equivalence.test.ts` 逐项钉死 === electron `anchorBible.ts`。这是 Nomi 既有的「**重复 + 等价测试守恒**」先例（同 `nodeKindDomain`）。**所以不能把镜像收成一处**——收了渲染层就编译不过。两源镜像 + equivalence test **就是正确终态**。

**真实漂移种子**不是「有两份镜像」，是「**冒出第三份独立实现**」：某天有人在别处又手写一遍 `frozen.at > 0` 判据（不走这两个模块），equivalence test 管不到它，两套冻结语义就此分叉。F15 §5 说的「合并成一条语义链」在 main 上**判据层已贯通**（GUI 写 `meta.frozen` = brand.promo 经 `production.check-frozen` 读同一 `meta.frozen`，同一 `anchorBibleKeys` 镜像；PR #156+#162 合成），S7a 的任务是**把这条链焊死、禁止第三份实现把它劈开**。

**动作**（零行为改动）：
- `check:batch-machines` 规则 4：`meta.frozen` 判据（`frozen` 对象的 `at > 0` 读取、`referenceSheet === true` 的视觉锚判定）的**函数实现只准出现在 `anchorBible.ts`（权威）与 `anchorBibleKeys.ts`（镜像）两处**；任何第三个文件出现该判据签名 → 报红，指回这两处 + equivalence test。
- 在 `anchorCheckpoint.ts` 顶部加一条**交叉引用注释**：点明语义 `anchor_checkpoint` gate（job 就绪+决议）与 legacy `meta.frozen` 轨（GUI dependencyWaves / brand.promo readUnfrozenAnchors）是冻结/锚的两条轨，共读 `anchorBible` 判据；S7b 收编 #2 时后者并入前者（见 §6）。让下一个 agent 一眼看清两轨关系，不重新考古。

### 3.3 legacy 冻结标记（把边界写进代码，不只写文档）

- `runGenerationNodesByPlan`/`runGenerationNodesBatch` 顶部注释升级为 `@legacy-batch-frozen`：一句话说清「现役唯一 GUI 批量派发；冻结=不加新功能，新批量能力进 `multiShotBatchScheduler`；Canvas owner 迁移见 P5」+ 指回本 plan。
- `mcpGenerationPolicy.ts` 的 `LEGACY_GENERATION_ROUTES` 加注释指回本 plan 的收敛映射表。

### 3.4 不新增用户可见 UI（确认条/卡片形态零改动）

本片纯结构/门岗/注释/判据同源，**不碰任何用户可见面**（确认条、检查点卡、占位三态、i18n 文案一律不动）。→ 不触发 R8 样张门 / R13 走查截图门的「新 UI」臂（仍跑既有走查回归）。

## 4. 删除清单（收编即删旧循环）

**S7a 的诚实边界**：本片**不删整条自有循环**（#1 冻结保留、#2 整体收编排到 S7b），故删除行数**不是本片荣誉指标**——本片的结构收益是**门岗 + 判据焊死 + 边界固化**。会删的（实施时全扫确认，有就删、没有就诚实报「本片无删除」）：

- 若 §3.2 门岗扫出 `meta.frozen` 判据的**第三处独立实现**（该有的只有权威+镜像两处）→ 删并改引用镜像。预扫签名：`frozen` 对象 `.at > 0` 的独立读取 + `referenceSheet === true` 的独立视觉锚判定。
- 若发现 legacy 路上**已死的分支**（被上游门岗永远拦掉、无调用者的导出）→ 删。

（S7b 收编 #2 才是删除大头：`driveGeneration` 的顺序循环整段 → scheduler 派生，预估删 ~120 行。见 §6。）

## 5. 回归门（全部现有回归必须绿 —— 不动项）

单镜链字节不动（回归门）：
- 单镜 E2E 14 断言、S3a、S4–S6.5 批量套件、#156/#158 e2e、F15 走查、全部 `tests/ux` 走查（`check:walkthroughs`）。
- 画布单节点生成（`confirmAndRunNode`/`regenerateNodeInPlace`）字节不动。

本片新增：
- `check:batch-machines` 门岗自测（含「新造第四台循环报红」阳性对照）。
- 判据同源不变量（`anchorBible.equivalence.test.ts` 继续绿 + 新增「判据只在一处实现」的门岗断言）。

`pnpm run gates` 全链真退出码（不用管道接 test/build，防吞退出码）：
`check:filesize` → `check:tokens` → `check:i18n` → `check:heavy-path` → `check:batch-machines`(新) → `check:controls` → `check:walkthroughs` → `lint:ci` → `typecheck` → `test` → `build`

## 6. S7b 排期（切片理由 + 下一片范围）

**S7b = brand.promo `driveGeneration` 整条播报驱动 → 语义调度器**（独立 PR，自带回归+回滚）：

- **范围**：把 `productionRunDriverOps.ts:206 driveGeneration` 的顺序 job 循环（+ 样片门 + 冻结门 + 预算边界）改为「组装 `generationPlan.shots[]` → `createMultiShotBatchScheduler` 驱动」；brand.promo 的 direction/storyboard 前置阶段保留，只把**生成段**收编。
- **删除大头**：`driveGeneration` 的 `for (job of jobs)` 提交循环、其自有样片门注入、`readUnfrozenAnchors` 冻结门分支（改用语义 `anchor_checkpoint`）——预估删 ~120 行自有循环。
- **回归门**：brand.promo 付费验收（APIMart 低规格）+ 现有 production run 套件 + J3 事故恢复。
- **为什么单独成片**：#2 现役（`nomi_start_playbook` 是 live 工具），收编需真付费验收兜底；与 S7a 的门岗/判据同源解耦，各自可回滚。**不与 S7a 捆绑**（P4 plan §3.6「S7 独立成片，不与返工/付费验收捆绑」的同款纪律，S7 内部再切一层同理）。

**S7c（更远，非承诺）**：#1 GUI 画布 runner → 语义调度器，**依赖 P5 Proposal adapter**（Canvas owner 迁移）先落地；语义面从默认关转默认开需产品拍板。本片不排期，记 backlog。

## 7. 回滚

- 本分支独立 PR，未 merge 前 `git worktree remove` 即净。
- `check:batch-machines` 门岗纯新增脚本 + baseline，回滚 = 删脚本 + package.json 一行 + `gates` 编排一行。
- §3.2/§3.3 注释与判据同源为**零行为改动**（不改任何运行时分支），回滚风险=0。
- 未触任何 feature flag；单镜链与语义调度器现状不变。

## 8. 冲突警戒（避让在飞 agent）

push 前 rebase 最新 origin/main。已知在飞：
- `generationCanvas/spend/*` + preload gate 通道（形象确认卡 agent）→ **本片不碰 spend/preload**。
- `generationCanvas/components/*`（#157 canvas model picker，OPEN）→ 本片只碰 `runner/*` 注释 + `productionRun/*` 注释 + 新 `scripts/*`，**不碰 components**。
- i18n 大改（术语 agent）→ 本片**零新增 i18n 键**（无用户可见文案改动）。
