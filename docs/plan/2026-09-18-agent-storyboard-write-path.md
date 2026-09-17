# Agent 分镜写入路径调查：`draft_shots` 的产出落在哪、为什么不是分镜表

> 状态：只读调查 + 方案（未改生产代码）· 2026-09-18 · 基线 `origin/main` = `18641f951`（2026-09-17 23:39 +0800）
> 方法：纯读代码 + git 历史 + 一支不起 Electron、不调模型的 `tsx` 探针（§7）。所有结论带 file:line 或 commit；拿不准的进 §6「未证实」。

## TL;DR

1. **`draft_shots` 成功后产物落在主进程的 `ProductionRun.generationPlan`**（durable，`.nomi/runs/<runId>/`），再被 `canvasLandingHost` 投影成画布上的 **image/video 占位节点 + 一个「分镜组·…」编组**。它**从不**写 `storyboardDesignsByDocumentId`，也**从不**产生 `shot_table` 节点。用户点「新建方案」后看的分镜页读的是 `storyboardDesignsByDocumentId`——两份账本之间**没有任何投影**。
2. **但你那 5 轮里连第 1 条都没走通**：多镜 `draft_shots`（≥2 镜，或任一镜带 `role`）在宿主 handler 里**必然抛错**——`draftShotFromPlan` 要求每镜带一个完整 `candidate`（`candidateId/revision/moduleId/providerId/modelId/mode`），而动词翻译层只送 `{prompt, taskKind, modelId, …}` 这种语义字段。探针实证（§7）：过了 `generationPlanInputSchema`，死在 `mcpGenerationMultiShot.ts:124` 的 `ZodError: Required`。**你已修的 `durationSec`/`title` 两处不解决这一条**——修完仍然 0 节点。「第 5 轮调了 4 次、节点仍 `[]`」与此完全吻合（每次失败 → 模型重试）。
3. 判定：**这不是「缺一条投影」，是一次没做完的迁移留下的两套并行实现（P1 违规）**——2026-09-14 `afe85411d` 把 lane 上唯一能写分镜方案的动词（`nomi_storyboard_write` / `propose_storyboard_plan`）删了、点名 `draft_shots` 接班，但 `draft_shots` 写的是另一份账本；「新建方案」入口、分镜页、SKILL.md、golden-path 走查全部还指着旧账本，且那条走查从切换那天起就没在任何 CI 里跑过。
4. 推荐：先修 (2) 那个 bug（一处、共享边界、必须做）；再按 §5 方案 B 把分镜表变成 **Run 落地节点的表格表示**（与 2026-09-01 拍板「分镜表 = 画布节点的表格表示版」同向），而不是往两份账本之间加同步（方案 A）。

---

## 1. 事实表：两份状态、谁写、谁读、谁投影

| | **账本 A：`ProductionRun.generationPlan`** | **账本 B：`storyboardDesignsByDocumentId`** |
|---|---|---|
| 住哪 | 主进程；每个 Run 一份 `generationPlan { operationId, state, cardHidden, candidate, shots[] }`（`electron/productionRun/productionRunTypes.ts:225-259`），持久化在项目 `.nomi/runs/<runId>/`（`productionRunRepository.ts:234-272`） | 渲染层 zustand（`src/workbench/workbenchDocumentSlice.ts:18`），随项目记录持久化（`src/workbench/project/projectRecordSchema.ts:67`；`workbenchProjectSession.ts:21,35`） |
| 谁写（Agent 侧） | `draft_shots` 动词（`electron/shared/agentCapabilities/verbs/writeVerbs.ts:108-132`）→ `laneVerbTransport.ts:55-71` 翻成 `GENERATION_METHODS.plan {operation:'create'\|'patch', cardHidden:true}` → `laneExtendedDesktopPorts.ts:178-181` 交给生成适配器 → `generationTransportAdapters.ts:67-86` 用 `generationPlanInputSchema` 校验、`:97-105` 换成 `create` 方法、`:213-226` 以 `origin.host="nomi"` 调 planning → `mcpGenerationTools.ts:504-533` → `productionGenerationOperationStore.ts:72-101` `owner.createGenerationDraft(...)` | **今天 lane 上没有任何动词能写它。** 渲染层写入口 `applyCanvasToolCall.ts:252-289`（`patch_shots`）与 `:291+`（`propose_storyboard_plan`）只经 `nomi_canvas_plan`/`nomi_canvas_edit` 可达，即**外部 MCP 宿主**（`electron/surfacePortPreloadBridge.ts:114`；`electron/shared/agentCapabilities/canvasWrite.ts:176,454,531`）。lane 的三个画布写动词映射表 `verbs/verbSemanticInput.ts:61-87` 只认 `arrange_canvas / make_artifact / stage_shot`，头注释 `:58-59` 明说旧名「不在这里兼容」 |
| 谁写（用户侧） | 付费卡上改参数 `revise`（`productionGenerationOperationStore.ts:173-192`） | 「新建方案」按钮（`DocumentListSidebar.tsx:395-403 → :121-125`）、方案编辑器逐字段编辑（`setStoryboardPlan` `workbenchDocumentSlice.ts:250-305`）、`addStoryboardDesign :185-207`、新建项目的起手架（§2.4） |
| 谁读 | 报价卡 `productionPendingSpend.ts:67-111`（`cardHidden` 时不投影 `:82-85`）；任务中心；画布落地链 | 分镜页 `StoryboardWorkspace.tsx:20-23`、`StoryboardPlanEditor.tsx:69`、侧栏方案列表 `DocumentListSidebar.tsx:36`、`ShotTableNode.tsx:34` |
| 投影到画布 | `create/patch/present` 每次 `notifyPlanChanged`（`productionGenerationOperationStore.ts:98-99,114-115`）→ `appIntegration.ts:171-174` → `canvasLandingHost.ts:89-92 landDraftOnCanvas`（**只在项目开着时**）→ `multiShotCanvasLanding.ts:117-189 buildMaterializeShotsPayload`（节点 kind 恒 `image`/`video` `:106-110`，组名 `分镜组·<goal>` `:186`）→ `requestRenderer("production.materialize-shots")` `:214` → 渲染层 `src/workbench/capability/multiShotCanvasLanding.ts:152-305`（`create_canvas_nodes` `:230`，编组 `:261-268`，立刻落盘 `:302`） | `workbenchStore.ts:241-244` 把 `applyStoryboardPlanProjection` 注入 slice → `ensureStoryboardShotTable.ts:9-18` 建一个 **`kind:'shot_table'`** 节点（`source.kind='storyboard'`，`electron/shared/canvas/shotTable.ts:50-60`）→ `projectStoryboardDesign`（`storyboardProjection.ts:72-82`）**只更新已绑定的节点，不建节点**；生成类节点由行内动作按需建（`storyboardRowActions.ts:118 materializeShotRow → :97 create_canvas_nodes`） |
| A ↔ B 之间 | **无。** `shot_table` 的 source 只有 `storyboard` 与 `deconstruction` 两种（`shotTable.ts:50-78`），没有 `run`/`production`；grep 全仓无任何 `generationPlan → StoryboardDesign` 或反向的转换 | |

结论一句话：**Agent 现在只能写 A；用户点「新建方案」看的是 B；A 落地成画布节点组，B 落地成一张 `shot_table`。两者是两条互不相识的落地链。**

## 2. 五个问题的答案

### Q1 `draft_shots` → `create` 之后产物在哪

调用链（每一跳 file:line 见 §1 表「谁写」行）。落点：`owner.createGenerationDraft` 建一个新 Run，`run.generationPlan.candidate` = 第一镜候选、`run.generationPlan.shots[]` = 每镜 `{shotId, role, included, candidate}`（`productionGenerationOperationStore.ts:76-95`；`mcpGenerationTools.ts:511-513`「顶层 candidate = 第一个 shot 的 candidate」）。`cardHidden:true` 存在 `plan.cardHidden`（`productionRunTypes.ts:233`），报价卡投影跳过它（`productionPendingSpend.ts:82-85`）。

建完立刻 `notifyPlanChanged` → 落画布（§1「投影到画布」行）。渲染层节点带 `metadata.productionRunId / productionShotId / materializationOperationId=canvas-landing:<runId>`（`src/workbench/capability/multiShotCanvasLanding.ts:214-221`），`shotId→nodeId` 再经 `plan.bind-shot-nodes` 写回 Run（`canvasLandingHost.ts:71-79`）。

单镜（1 镜且无 `role`）走 `laneVerbTransport.ts:65-69` 的单镜 create → `semanticCandidateFromParams`（`mcpGenerationTools.ts:520-526`）→ 也落画布（`buildMaterializeShotsPayload` `:127-133` 专门兼容无 `shots[]` 的单镜）。

### Q2 分镜表读的是哪份

`storyboardDesignsByDocumentId[activeDocumentId]` 里 `activeStoryboardId` 那份（`StoryboardWorkspace.tsx:20-23`），编辑器 `StoryboardPlanEditor.tsx:69`。画布上的 `shot_table` 节点也只认 `source.kind='storyboard'` + `documentId/designId`（`ensureStoryboardShotTable.ts:10-13`，`shotTableActions.ts:28,46`）。**不读 Run。**

### Q3 有没有投影 / 产品怎么设想

- **没有 A→B 投影**（§1 末行）。
- 产品设想（v2 工具面，2026-09-14）：`docs/plan/2026-09-14-agent-tool-face-v2.md:88`——「20 动词下**分镜是草稿直接落画布、卡在 `generate`**」；同文 `:74`「对外 `nomi_canvas_edit` 的 operation 分支含分镜写入（`propose_storyboard_plan`/`patch_shots`），它们在内部面**归 `draft_shots`**」。也就是说 v2 的设计是：**Agent 拆的分镜 = 画布上的草稿节点组，不再经过「分镜方案」**。这与根因合同 `docs/fixes/2026-09-11-agent-generation-second-door.root-cause.json` 的不变量「只有 `draft_shots` 能造出生成类节点」和 `2026-09-10-agent-draft-single-ledger.root-cause.json`「plan candidate 是意图、画布节点是它的投影」一致，也与 2026-09-01 拍板「分镜表 = 画布节点的表格表示版」（`docs/lessons/shot-table-is-a-projection-of-canvas-nodes.md`）同向。
- **但读侧一处都没跟着改**：「新建方案」按钮仍然 `storyboardPlannerLauncher()`（`DocumentListSidebar.tsx:124`）→ 常驻 Agent 发 `agentResident.storyboardRequest`「把当前文稿拆成一份分镜方案…」并挂 `workbench.storyboard.planner` 技能（`ProjectAgentResidentShell.tsx:240-250`；`src/i18n/locales/agentResident.ts:7`）；用户随后看的分镜页读 B。SKILL.md 自己也自相矛盾：`:44` 「通过一次 `draft_shots` 调用产出」、`:50` 「草稿落在画布上」，而 `:203` **「绝不调用写画布/生成类工具——你只产出方案对象，落画布与生成由用户确认后系统处理」**（这一句是 2026-06-13 `44304dd42` 时代为 `propose_storyboard_plan` 写的，`draft_shots` 那些句子是 2026-09-15 `8bd61d0f4` 加的，两代指令叠在一起）。frontmatter `:3` 的 description 还是「不直接落画布或生成」。**4/5 轮模型只读不写、把三镜写成聊天文字，读侧这三处指令就是直接原因**。
- 「这 5 轮为什么没触发投影」：没有投影可触发；而且第 5 轮的写入本身没成功（Q5 补充 / §3）。

### Q4 `starter-doc-*` 两镜空白起手架

- 新建空项目时 `src/workbench/project/projectRepository.ts:171-186` 直接往项目记录塞一条 design：`id: \`starter-${seededDocument.id}\``（文档 id 由 `mintDocumentId` 造成 `doc-<uuid>`，`workbenchTypes.ts:198-203`，所以拼出来就是 `starter-doc-<uuid>`）、`title` 空、`plan: createEmptyStoryboardPlan()`。
- 2 镜 / video / 5 秒的出处：`src/workbench/generationCanvas/agent/storyboardPlan.ts:234-247`——`shots: [1,2].map(index => ({ index, shotId: \`shot-${index}\`, shotKind:'video', durationSec:5, anchorIds:[], prompt:'' }))`；配套判据 `isEmptyStoryboardPlan :249-258`。设计动机见 `docs/fixes/2026-09-05-empty-project-storyboard-entry.root-cause.json`（空项目要能进分镜编辑器）与 `2026-09-05-storyboard-starter-projection.root-cause.json`（planner 结果要**替换**这个起手架：`setStoryboardPlan` 的 `replaceEmptyStarter`，`workbenchDocumentSlice.ts:262`）。
- 你 5 轮落盘「完全相同且是空的」= 从来没有人调过 `setStoryboardPlan(…, createNew=true)`，起手架原样躺着。

### Q5 历史：从来没接上，还是接上过又断了

**接上过，2026-09-14 断的。** 时间线（全部 git 可查）：

| 日期 | commit | 事件 |
|---|---|---|
| 2026-06-13 | `44304dd42` | `propose_storyboard_plan` 激活，SKILL.md 写下「绝不调用写画布/生成类工具」 |
| 2026-08-25 | `852dcbd27` | P4 S6.5 多镜 `create` 入口：`draftShotFromPlan` 要求每镜带完整 `candidate`（`mcpGenerationMultiShot.ts:121-126`）；语义→候选的合成只给了 `scriptText` 分支（`draftShotFromStoryboard :133-169`） |
| 2026-09-08 | `a369215de` | 切 pi lane 时给 `generationPlanInputSchema.shots[]` 加了 `prompt/taskKind/modelId/...` 语义字段（`generationPlanSchemas.ts:55-68`）——**schema 收了，handler 从没学会展开它** |
| 2026-09-10 | `dc113e712` | `ensureStoryboardShotTable`：B → `shot_table` 节点接通；同日走查 `docs/audit/2026-09-10-shot-table-storyboard-walk.md` 「点『新建分镜方案』，真实模型返回三个图片镜头并审批保存」「复验立即生成表节点成功」——**那天的写入走的是 `nomi_canvas_plan → propose_storyboard_plan → setStoryboardPlan`（账本 B）**（`git grep propose_storyboard_plan dc113e712 -- electron/shared/agentCapabilities/canvasWrite.ts:174,446,469`） |
| 2026-09-11 | `a12dded21` | 动词声明化：lane 上仍有 `nomi_storyboard_write`（operation=`propose_storyboard_plan`/`patch_shots`） |
| 2026-09-14 | `afe85411d` | **20 动词替换 37 名**：`git show afe85411d` 删掉 `nomi_storyboard_write` 整段（diff 第 221-256 行），只留一句「旧名不在这里兼容」（`verbSemanticInput.ts:58-59`）。`--stat` 里**没有任何 storyboard/shotTable 文件被改**——账本 B 的 Agent 写入口被删，没有接班者 |
| 2026-09-14 | `4753f64af` | lane 走一张 typed 传输表；`draft_shots` 翻成 `nomi_generation_plan create`（今天的 `laneVerbTransport.ts`） |
| 2026-09-15 | `8bd61d0f4` / `2b9af6c48` | SKILL.md 改成「一次 `draft_shots`」（但 `:203` 那句没删）；`golden-path.e2e.mjs` 改成发 `draft_shots`（`:191-197`，带 `title`）却仍断言 **账本 B** 里有 3 镜（`planFromPayload :117-121` 读 `storyboardDesignsByDocumentId`；`:223-226`；分镜页 3 行 `:240`）。`docs/plan/2026-09-14-agent-tool-face-v2.md:88` 自述「这些 Electron 走查未在本机重跑」；`test:golden` 只在 `package.json:149`，**不在任何 workflow / `test:e2e` / `check:walkthroughs` 里** |

所以 09-10 的「复验成功」是真的，但它证明的是账本 B 那条链；09-14 把那条链的 Agent 入口删了以后，没有任何一条自动化证据再跑过「Agent 拆镜头 → 用户在表里看到」。

## 3. 判定

**两套并行实现（P1 违规），根源是一次只做了写侧、没做读侧的迁移；叠加一个让新写侧在多镜时恒失败的 bug。**

- 不是「缺一条投影」：v2 设计（§2.3）明确不想要 B 作为 Agent 分镜的落点；补一条 A→B 同步等于把被删的第二个 owner 从后门请回来。
- 不是「产品设计上本来就要用户手动落表」：产品入口「新建方案」的行为定义（`ProjectAgentResidentShell.tsx:243`「把当前文稿拆成一份分镜方案」）与 v2 设计（草稿直接落画布）是两份互相矛盾的产品叙述，没有人拍板过「用户手动把 Agent 的草稿抄进表里」。
- 叠加 bug（必修，独立于路线选择）：多镜 `draft_shots` 在 `mcpGenerationMultiShot.ts:124` 恒抛。证据：§7 探针；`resolveCreateShots :235-239` 对 `params.shots` 逐镜调 `draftShotFromPlan`，后者 `parsers.candidateFrom(raw.candidate)` = `generationCandidateSchema.parse(undefined)`（`mcpGenerationTools.ts:309-311`；schema `generationPlanSchemas.ts:22-28`）。错误经 `safeFailure`（`generationTransportAdapters.ts:56-65`）变成 `generation_execution_failed` + ZodError JSON，再由 `laneExtendedTools.ts:61-65` 包成「`draft_shots could not complete … Read the current project state … before requesting a new action`」回给模型——模型的自然反应就是换个写法再试，这正是「调了四次」。**渲染层零报错是必然的：整条路没碰渲染层。** 现有测试没有一条把语义 `shots[]` 送进真 handler：`laneExtendedDesktopPorts.test.ts:88-121` 与 `tests/system/agent-tool-face-real-model.mjs:107` 都把生成适配器 stub 掉；`mcpGenerationTools.test.ts:695-698` 的多镜用例用 `shotFrom(...)` 带完整 candidate；只有 `scriptText` 用例（`:707-730`）走到候选合成。

## 4. 所有权问题（单独点名）

**「Agent 拆出来的一份分镜」有两个 owner，各带一条落画布链、各有一套编辑动作，却共用同一个 UI 入口和同一个词。**

| | 账本 A（Run） | 账本 B（StoryboardDesign） |
|---|---|---|
| 行的真相 | `PlanCandidate`（provider/model/mode/prompt/parameters/references） | `PlanShot`（shotKind/durationSec/anchorIds/keyframe/params/scene/profile 骨架…） |
| 编辑 | `generation.patch` / `revise`（改候选 revision → 重绑定节点） | 编辑器逐字段、`patch_shots`、行覆写 `storyboardOverrideActions` |
| 落画布 | `canvasLandingHost` → `materializeShots`（`canvas-landing:<runId>` 幂等章） | `storyboardRowActions.materializeShotRow`（按 design/shot 绑定） |
| 花钱 | `generate` 出卡 → 封印/收据 | 行内 `confirmAndRunNode` → spendConfirm |
| 谁能写 | 内部 lane（`draft_shots`）、外部 MCP（`nomi_operation_*`） | UI、外部 MCP（`nomi_canvas_edit` 分镜 operation）；**内部 lane 不能** |

这已经不只是「表没同步」：同一个用户任务（把剧本拆成可生成的镜头）在内部 Agent 和外部 MCP 宿主上会落进**不同的账本、不同的画布对象、不同的付费门**。`docs/plan/2026-09-14-agent-tool-face-v2.md:74` 已经承认这一点（外部面暂留分镜 operation 是因为「MCP 侧的生成面还没收编」），但没有登记到期日。按 R17 这算「登记不是防线」的那类欠账。

顺带一条事实澄清（不是判断）：09-11 合同把 `propose_storyboard_plan` 描述成「一次落一整排永不出卡的生成类节点」；**在 HEAD 上**账本 B 的投影只建一张 `shot_table`、只更新已绑定节点（`ensureStoryboardShotTable.ts:14-17`；`storyboardProjection.ts:72-82`），生成类节点由行内动作按需建并经 spendConfirm。也就是说今天的 B 并不绕付费门——删它的理由是「一效果一动词」，不是安全。这影响方案 A 的代价评估，不影响判定。

## 5. 修法选项

### 前置（不论选哪条都要做）：修多镜 `draft_shots` 的候选合成

- **改哪层**：`electron/capabilityCore/mcpGenerationMultiShot.ts` `resolveCreateShots` 的 `params.shots` 分支——当一镜没有 `candidate` 时，按 `draftShotFromStoryboard`（`:133-169`）的同一条路合成候选（它已经会从 `prompt/modelId/modeId/durationSeconds/parameters/references` + `defaultModelForTaskKind` 合成 `candidateId/revision/moduleId/providerId/mode`）。`taskKind` 的推断复用 `:299-316` 那段（`anchor→text_to_image`，有 references→`image_to_video`，否则 `text_to_video`）。**不要**在 `laneVerbTransport` 里造候选（它不认目录，而且外部 MCP 语义面同样会撞这条）。
- **门岗**：给 `mcpGenerationTools.test.ts` 加一条「语义 `shots[]`（无 candidate）→ create 成功且 `operation.shots[i].candidate.modelId` = 默认模型」；`laneVerbTransport.test.ts` 已有的「翻出的方法名被适配器认」再加一层「翻出的参数被 handler 接受」（对着真 `createGenerationPlanningHandler` + 内存 store 跑一遍 `draft_shots` 三镜）。先验它会红：§7 探针就是红的样子。
- **代价**：一处、小；**连带**：外部 MCP 的 `nomi_operation_create` 语义多镜同时被修好（同一入口）。
- 同时把 `skills/workbench-storyboard-planner/SKILL.md:203` 那句删掉、`:3` description 改成与 `:44/:50` 一致（这是 4/5 轮不调工具的直接原因）。

### 方案 A：补一条 A→B 投影（`generationPlan` → `StoryboardDesign`）

- **改哪层**：主进程 `notifyPlanChanged` 之后多发一条 `requestRenderer('storyboard.upsert-from-run')`；渲染层把 `shots[].candidate` 映射成 `PlanShot` 写进 `setStoryboardPlan(..., createNew=true)`，`replaceEmptyStarter` 自然吃掉起手架。
- **代价**：中；**连带**：从此每一份 Agent 分镜有两份真相（Run 候选 vs PlanShot），用户在表里改一行要反向 `generation.revise`，Run 侧 `patch` 又要盖回表——就是 09-10 单账本合同刚刚消灭过的那种「两个账本分叉」（`docs/fixes/2026-09-10-agent-draft-single-ledger.root-cause.json` `class_root`）。`shotKind/durationSec/anchorIds/keyframe/scene/profile` 在候选里没有对应物，映射必然有损。**不推荐**：它是症状修法，把 §4 的两个 owner 焊死。

### 方案 B（推荐）：分镜表读 Run 落地的节点；「新建方案」入口对准账本 A

- **改哪层**：
  1. `electron/shared/canvas/shotTable.ts` 加第三种 source `{ kind:'production', runId }`；行从画布上 `metadata.productionRunId === runId` 的节点派生（节点已带 `productionShotId/productionShotRole/candidate 戳`，`src/workbench/capability/multiShotCanvasLanding.ts:214-221`），左半列按现行「片种模板 derive」规则、右半列按该节点模型 `mode.slots`（照 `docs/lessons/shot-table-is-a-projection-of-canvas-nodes.md` 两半列纪律）。
  2. 主进程落地成功后（`canvasLandingHost` 已知 runId+groupId）在同一事务里建那张 `shot_table` 节点（复用 `ensureStoryboardShotTable` 的形状，source 换成 `production`），整批仍一个 Cmd+Z。
  3. 分镜页/侧栏「方案」列表增加一类条目 = 有 `shot_table(production)` 的 Run；「新建方案」按钮语义改成「让 Agent 起草」，落地后自动激活该表（不再制造/依赖 `starter-*` design；起手架只在用户手动新建方案时出现）。
  4. 表内改提示词/模型 → 走既有 `generation.revise`（候选 revision +1 → `rebindLandedShots` 同步节点），不新增写路径。
- **代价**：大于 A，但方向对：账本 A 成为 Agent 分镜唯一 owner，表是节点投影（拍板一致），付费门只有 `generate` 一条。
- **连带影响谁**：`StoryboardPlanEditor` 要能以「只读候选 + revise」模式渲染一类新 source；`golden-path.e2e.mjs:223-240` 的断言改读画布节点组与 `shot_table(production)`；`docs/plan/2026-09-14-agent-tool-face-v2.md:74` 的外部面欠账要登记到期日（外部 MCP 的 `propose_storyboard_plan` 与内部 `draft_shots` 最终应收敛到同一入口）。账本 B 保留给用户手写方案，**但要在方案里明写它的去留日期**，否则 §4 的双 owner 长期存在。

### 方案 C：把 lane 上的分镜写动词加回来（恢复 09-10 的 B 链）

- **改哪层**：`writeVerbs.ts` 加回一个写 `canvas.write propose_storyboard_plan` 的动词；SKILL.md 改回「产出方案对象」。
- **代价**：最小、一天内可见「表里有三镜」；**连带**：直接推翻 09-11 合同的不变量「同一效果只有一个动词」（`check:tool-face mutual-tiebreak` 会红），并把 §4 的双 owner 固化成模型可见的两个工具——正是 09-11 那份合同要消灭的「多扇门」。只适合作为**可丢弃的对照原型**证明用户体验，不适合合入。

**推荐：前置 bug 修 + 方案 B。** 理由：D2（结构优先）——问题的根在「一份分镜两个 owner」，A 和 C 都是在两个 owner 之间修桥；B 是把 Agent 那一半彻底归到已被三份拍板/合同选定的 owner 上，剩下的 B 账本才有可能在后续一刀退役。D4（诚实）——B 落地前，「新建方案」入口应该先按前置修好后的真实行为改文案（Agent 起草落画布、在分镜组里看），别再让用户等一张不会出现的表。

## 6. 未证实

- **那 4 次 `draft_shots` 的真实 tool_result 文本**：我没有你那 5 轮的 lane 转录（`.nomi/agent-sessions/**/*.jsonl`）。结论「每次都死在 `candidate` 校验」是从 HEAD 代码 + 探针推出的必然，不是从转录读出的。请对照转录里 4 条 `draft_shots` 的结果，预期看到 `generation_execution_failed` 与 `"received": "undefined"`。若其中有单镜无 `role` 的调用，它应当已经落了一个节点——那就与「nodes 仍 `[]`」矛盾，需要再查 `isProjectOpen`（`canvasLandingHost.ts:90`）当时是否为假。
- **你那棵树里的修法是否碰到了候选合成**：任务书只说修了 `durationSec→parameters.duration` 与删 `title`。若你已经顺手合成了 candidate，前置项就是已完成，其余判定不变。
- **外部 MCP 宿主今天的多镜 `nomi_operation_create`（语义 `shots[]`）是否同样失败**：同一 handler、同一分支，按代码应当同样失败；没跑外部宿主实证。
- **golden-path 最近一次真跑的结果**：文件历史与 `docs/plan/2026-09-14-agent-tool-face-v2.md:88` 都说没重跑；我也没跑（任务纪律：不起 Electron）。按代码它至少在 `:223-226` 必红（三个独立理由：`title` 被 strict 拒；多镜候选缺失；即便成功也不写账本 B）。

## 7. 探针（可复跑，不起 Electron）

`scratch/probe-multishot.ts`（本分支未提交脚本，命令与输出如下；`tsx` 直接跑 `electron/` 源码）：

```ts
import { verbToTransportCall } from '<repo>/electron/agentLane/laneVerbTransport'
import { draftShotFromPlan } from '<repo>/electron/capabilityCore/mcpGenerationMultiShot'
import { generationCandidateSchema, generationPlanInputSchema } from '<repo>/electron/shared/agentCapabilities/generationPlanSchemas'

const call = verbToTransportCall({ toolCallId: 't1', toolName: 'draft_shots', args: { shots: [
  { prompt: '镜1 月光纸船', taskKind: 'text_to_video', modelKey: 'seedance' },
  { prompt: '镜2 水面安静', taskKind: 'text_to_video', modelKey: 'seedance' },
  { prompt: '镜3 远景',     taskKind: 'text_to_video', modelKey: 'seedance' },
] } })
generationPlanInputSchema.safeParse(call!.call.args).success            // → true
draftShotFromPlan((call!.call.args as any).shots[0], 0, {
  candidateFrom: (v) => generationCandidateSchema.parse(v), record: (v, l) => v as any })
```

输出（2026-09-18，HEAD `18641f951`）：

```
1) transport call: { lane: "generation", call: { toolName: "nomi_generation_plan",
   args: { operation: "create", shots: [ { prompt, taskKind, modelId }, ... ], cardHidden: true } } }
2) generationPlanInputSchema ok? true
3) draftShotFromPlan THREW: ZodError [ { "code": "invalid_type", "expected": "object",
   "received": "undefined", "path": [], "message": "Required" } ]
```

即：翻译层 ✓ → 入参 schema ✓ → handler 多镜分支 ✗（`mcpGenerationMultiShot.ts:124`）。
