# P4 验收门 §5.1.4 「用已有锚开新计划」锚复用入口 E2E（+ 最小归属校验）

> 归属：`electron/capabilityCore/*` + `electron/productionRun/*`。分支 `claude/p4-anchor-reuse-e2e`，sibling worktree `/Users/aoqimin/Desktop/nomi-anchor-reuse`，从最新 `origin/main`（a64424ed）建。零额度（loopback vendor）。

## 0. 背景与目标

P4 验收门 §5.1 变体 4「用已有锚开新计划」（跨集同脸）此前只有「框架支持」的口头声明，**无端到端证据**；S6.5（PR #155）报告把 anchor-reuse entrance 列为 Remaining。本切片补上那条 E2E，并修掉实查发现的一处真实缺口。

## 1. 现状裁定（实查，file:line 为证）

**入口语义已通（happy path）——锚复用不是「新机器」，是既有 references 语义的一个用法：**

- 「复用一个已有锚」= 把项目里**已有资产**作为 `character` 参考挂到每个视频镜的 `candidate.references[]`（`{ assetId, contentHash, version, role:"character" }`）。**复用的锚不是 `role:"anchor"` 的 shot**（没有要生成的东西）。
- `candidateFrom`（`mcpGenerationTools.ts:409-423`）逐条解析 references；`compileExecutionContract`（`executionContract.ts:140-159`）把 references 编进子合同并计入 `contractHash`；references 进请求指纹（`productionGenerationSubmission.ts:266-274`）→ 跨镜身份继承自该复用资产。
- 调度派生按 `role` 分区：`anchorsOf` 只取 `role==="anchor"`（`batchScheduleDerivation.ts:212-214`），`videoShotsOf` 取其余（216-219）。**复用锚不进 `anchorsOf` → 锚 0 提交；总提交 = 视频镜数**——正好是 §5.1.4 的不变量「总请求数=封存计划枚举」在「锚是复用、不是新生成」下的取值。
- reducer `sealGenerationShots`（`productionRunReducer.ts:101-126`）只校验 shotId 唯一 + 子合同匹配，**不要求存在 anchor-role shot**：一批 N 个各带 `references:[character]` 的视频镜可正常封存。
- 无 anchor-role shot → `deriveCheckpoint` 返回 `not_required`（`batchScheduleDerivation.ts:225`），批次不停锚检查点、直接连拍。（§3.2「复用的锚也要亮出来停一拍」是**渲染层/检查点 UX** 的产品诉求，走 gate/浮窗那条链，本切片不在其 scope；本切片钉的是**生产入口 + 调度不变量**，与现有 §5.1 入口 E2E 同层。）

**一处真实缺口（正是任务 §「若实查发现…」预判的那类，对抗矩阵 #3 同族）：**

- `candidateFrom` 对 references **只做结构校验**（assetId 是串、contentHash 是串、version 是整数、kind/role 是枚举），**从不校验该资产是否存在、是否属于本项目**。→ 一个**外来/不存在的 `assetId`** 今天会被静默放行，进而编进子合同、发给 provider。§4「项目已有…素材」的语义要求「复用的锚必须是本项目已有资产」，§5 对抗矩阵要求「外来/不存在的 assetId 拒绝」。**这是 anchor-reuse 入口的授权面漏洞，必须补。**

**裁定：入口 happy-path 已通（补 E2E 钉住即可）；references 归属校验是真实缺口（补最小实现 + 负向 E2E）。**故本切片 PR 前缀 `feat:`（含实现）而非纯 `test:`。

## 2. 最小实现（P1：扩展现有 shots 声明路径，不造新工具）

**唯一改动点 = create 的收敛漏斗 `resolveCreateShots`**（`mcpGenerationMultiShot.ts`，所有多镜 create 都过它；单镜 create 也在 `mcpGenerationTools.ts:577` 过 `candidateFrom`——见下「单镜同守」）：

- 给 `MultiShotHelperDeps` 加**可选**注入 `assertReferencesResolvable?(projectId, references[]) => void`（同步，抛人话 Error 即拒）。契约式依赖，**不耦合 `projectAssetStore` 内部**——`mcpGenerationMultiShot.ts` 保持纯逻辑不碰 electron（守其文件头「不碰 electron」自述）。App 层用真解析器（查 `listProjectAssets` / Run 自有 artifacts）接线；E2E 注入 fake。
- `resolveCreateShots` 解析出 draft shots 后、去重校验旁，对每个 shot 的 `candidate.references` 调 `assertReferencesResolvable`（若注入）。**未注入 → 逐字节等同今天**（不给不做校验的老测试/单镜路径强加依赖；向后兼容）。
- **单镜同守**：把同一 guard 用在 `mcpGenerationTools.ts` 的单镜 create 分支（`candidateFrom(params.candidate)` 那条，577 行）——不然「单镜引用外来资产」仍是漏的（P2 通用性：这病不止多镜，单镜同入口也有）。做法=在 handler 里对单镜 candidate 的 references 同样过注入的校验。
- 人话文案：`该参考素材在本项目中不存在或不属于本项目：<assetId>`（结构化到位、给出具体 assetId，便于客户端定位）。

**为什么在这一层**（P2 根因）：references 有三个入口（create 单镜 candidate、create 多镜 shots[].candidate、plan patch 的 references）。前两个都汇到「create 时解析 candidate」；本切片补 create 两路（新计划的授权面）。plan patch（seal 前编辑既有草稿）另立（不在 §5.1.4 scope，且 patch 走 `applyPlanCandidatePatch` 另一条，留 backlog 注明）。

## 3. E2E（照 `mcpMultiShotCreateEntrance.e2e.test.ts` 的 harness）

新文件 `electron/capabilityCore/mcpMultiShotAnchorReuse.e2e.test.ts`（与现有入口 E2E 同 harness：loopback vendor + 真 create→preview→gate→decide→start→scheduler runToQuiescence）。断言：

**T1 复用锚开新计划（正路，§5.1.4 主证）**
1. 项目已有一个角色锚**资产**（此前批次的定妆照）——E2E 里以一个已知 `{assetId, contentHash, version}` 表示，`assertReferencesResolvable` fake 认它。
2. 开新多镜计划：**无 anchor-role shot**，2 个视频镜，每镜 `references:[{...该资产, role:"character"}]`。
3. seal → scheduler `runToQuiescence`。
4. `submits` 计数 **= 2**（= 视频镜数）；`new Set(submits).size === submits.length`（每 Job ≤1 submit）；**锚 0 提交**（无 anchor-role job）。
5. 检查点 `not_required`（无 anchor-role shot，直接连拍不停）。
6. 每个视频镜的**子合同 references 携带该已有资产**（`shot.contract.references` 含该 assetId + role=character）→ 跨镜身份继承自复用锚。断言两镜都带、且是同一个 assetId。
7. 两镜产物 ready；镜 job = 2，一镜一 job。

**T2 反向：锚声明为「新生成」（对照，复用现有语义、只加一句以正对比）**
- 换成 1 个 `role:"anchor"` shot + 2 视频镜（现有 `mcpMultiShotCreateEntrance.e2e.test.ts` 已盖此形态的锚检查点+总数）：本切片只加一条**对比断言**——同样 2 视频镜，但锚是新生成时 `submits === 3`（锚+2镜）且停锚检查点；复用锚时 `submits === 2` 不停。把「复用 vs 新生成」的差异一屏点破（§5.1.4 反向要求「若锚声明为新生成则提交=锚数+镜数」）。

**T3 负向：外来/不存在 assetId 当场拒（对抗矩阵 #3）**
- `assertReferencesResolvable` fake 只认已知 assetId；create 一个引用**未知 assetId** 的多镜计划 → `rejects.toThrow(/不存在或不属于本项目/)`。
- 单镜同守：create 单镜、references 含未知 assetId → 同样 rejects（证 P2 通用性，不止多镜）。

**回归门**：本文件与现有 `mcpMultiShotCreateEntrance.e2e.test.ts`（4+2 用例）、`multiShotBatchScheduler.e2e.test.ts` 全绿；未注入 guard 的老用例逐字节不变（向后兼容）。

## 4. 不动项（碰了即回归）

- `src/workbench/generationCanvas/*`、`src/workbench/generationCanvas/components/*`、`src/i18n/*`、`electron/ai/*`——别碰（F15/157 在改）。
- 单镜链 P1–P3 E2E 不回退；未注入 `assertReferencesResolvable` 时 create 行为逐字节等同今天。
- 不改 reducer 语义、不改调度派生、不改请求指纹构成——references 归属校验是**入口层**的新校验，不动下游。
- `mcpGenerationMultiShot.ts` 仍不 import electron（纯逻辑）。

## 5. 验收门

- 新 E2E 三档全绿；`mcpMultiShotCreateEntrance.e2e.test.ts` + `multiShotBatchScheduler.e2e.test.ts` 全绿（回归）。
- push 前全链真退出码（不用管道接 test/build）：`check:filesize` → `check:tokens` → `check:i18n` → `check:heavy-path` → `lint:ci` → `typecheck` → `test` → `build`。
- 术语：入口错误文案人话（无内部词）。

## 6. 回滚

单 PR 可回滚；`assertReferencesResolvable` 可选注入——App 层不接线即回今天行为（校验不生效），E2E 自带 fake 不依赖 App 接线。
