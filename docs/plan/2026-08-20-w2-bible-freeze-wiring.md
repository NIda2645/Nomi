# W2 · 一致性地基（圣经冻结 + I2V 默认路径）：实现方案（2026-08-20）

> 探明对象：蓝图 `docs/plan/2026-08-19-dialogue-draft-quality-blueprint.md` §二幕1-2 + §三 W2。
> 验收对象：`tests/ux/draft-journey.e2e.mjs` 幕 2（今为 pending，line 84-85）——W2 点亮它。
> 现状依据：`docs/research/2026-08-19-nomi-draft-capability-inventory.md`（定妆卡/参考边现状）＋ B 报告 §3.3（ViMax static/dynamic 分离）。
> 复用不重造：W1 刚落地的 shotVerify 审片环（`electron/capabilityCore/shotVerify*`）、参考键投影（`taskParams.projectReferencesOntoBodyKeys`，commit 2669373a）、抽帧基建（`extractVideoFrameToAsset`）、gate/elicitation 确认基建。
>
> 本文件只做侦察 + 方案，**不改任何代码**。所有结论带 file:line。
> **一句话现状复核（关键，决定整个方案形状）**：全仓 `grep -rn 'static_features|frozen|characterBible|圣经'` 在 electron/src 命中 **0 处业务代码**——「冻结」「static/dynamic 圣经」当前**完全不存在**，W2 是从零建这层结构。而它要挂靠的**下游强制点已经现成**（`dependencyWaves` 的 `hasUsableResult` 拦截、production run 的 gate 机制、`first_frame`/`firstFrameUrl` 两跳接力线），W2 的活是「加一个更严的判据 + 一层编排」，不是造新引擎。

---

## 0. 一图看清 W2 要动的三条线

```
① 圣经数据模型（Q1）
   PlanAnchor.description（单串自由文本）        storyboardPlan.ts:20-37
     → 扩 static/dynamic 字段 + frozen 状态           ← 落 node.meta（passthrough 自动持久化）
   全资产大师 V3.0（自由文本资产卡）             assetMasterPrompt.ts（525 行，纯文本产出）
     → 内容生成器不变，产出「落进」结构化字段

② 冻结门（Q2）——「未冻结锚被引用 → 拒发批量生成」
   GUI 批量：buildDependencyWaves 的 hasUsableResult 判据    dependencyWaves.ts:16-20,55-60
     → 精化为「视觉锚必须 frozen，不只是 hasUsableResult」    ← 结构强制，任何路径都过
   production run：plan.attach → 生成前              productionRunService.ts:418-469
     → 新增「冻结门」gate（样片门语义扩展，scope:'stage'）
   单镜 generate（nomi_generate）：不拦（单镜=自由操作，语义见 §2.4）

③ I2V 默认两跳（Q3/Q4）——「参考图→首帧 I2I→I2V」
   headless nomi_generate 现状：一跳直发                core.ts:366-424（单次 runTaskFn）
     → 新增两跳编排（首帧 I2I → firstFrameUrl 喂 I2V）    ← 复用 §Q4 first_frame 线
   GUI 已有等价：keyframe + first_frame 边              storyboardPlan.ts:361-396（现成，不动）
   与 W1 审片环接缝：首帧过检 → 才 I2V（可选，见 §Q3-D）
```

**核心判断（对齐 T2/D2）**：W2 全部是「加更严判据 + 一层编排」，**四条现成机制**（依赖波次拦截 / gate / first_frame 两跳线 / shotVerify）各承一段，无一处需要造新引擎或改红队不变量。最大的**未定量风险**在「圣经字段该落哪、GUI/headless 双侧读写如何同构」（Q1）——这也是本方案花最多篇幅论证的地方。

---

## 1. 圣经数据模型落哪（Q1）

### 1.1 今天 character/scene 锚的 meta 结构（file:line）

**锚在两个层面各有一份形态，且已单向打通**（盘点 §3 复核属实）：

| 层 | 形态 | 字段 | 证据 |
|---|---|---|---|
| **分镜 IR**（结构化中枢） | `PlanAnchor` 对象 | `id/kind/name/description/carrier/scope?/variants?` | `storyboardPlan.ts:20-37` |
| **画布节点**（落地后） | `GenerationCanvasNode.meta: Record<string,unknown>` | 自由 map，落画布时写 `referenceSheet:true`（`storyboardPlan.ts:329`） | `generationCanvasTypes.ts:139`；meta 消费 `shotNumbering.ts:32` |

**关键事实**：
- `PlanAnchor.description` 今天是**单串自由文本**（`storyboardPlan.ts:26-27`），承载「角色的标准描述」——**没有 static/dynamic 分离**。ViMax 的分离（B §3.3：身份只看 static、服装 dynamic 允许换）在此无对应字段。
- 落画布时 `buildAnchorSheetPrompt(anchor)`（`storyboardPlan.ts:247-277`）把 `description` 整串拼进定妆卡 prompt——身份 DNA 与服装混在一坨。
- 节点 `meta` 是 `Record<string, unknown>` 且**持久化 schema 是 `z.array(z.unknown()).passthrough()`**（`projectRecordSchema.ts:21,25`）——**任意 meta 字段自动落盘、无需改 schema**。这是 Q1「GUI/headless 双侧读写同构」的地基：加 `meta.frozen` / `meta.staticFeatures` 不触碰任何 schema，两侧读的是同一份 `node.meta`。

**全资产大师 V3.0 的产出形态**（`assetMasterPrompt.ts`，用户当场抓出的遗漏，盘点补遗）：
- 它是**创作助手「素材规划」模式的领域规范**（`creationAiModes.ts:2,40` 引入），产出**纯中文自由文本资产卡**（角色卡/场景卡/道具卡）。
- 其 §B.8 明写「最终交付仅保留分隔标识 + 中文AI提示词正文」（`assetMasterPrompt.ts:349`）——**故意不结构化**，为的是直接拿去生图。它内部**确实区分**「基础面容锚点=static」（`:264-272`，脸型/眉眼/骨相/肤色/局部识别点）与「服装层次/特殊状态=dynamic」（`:280-284`，内外套腰下足 + 伤势/污垢/战损），**但只在 prompt 组织顺序里体现，不落成字段**（`:314` 组织顺序把二者串成一段）。

### 1.2 结论：static/dynamic + frozen 落**节点 meta**，不落独立结构（P1 单一真相源）

**判据（对齐 P1「加新必删旧、无并行版」+ D2「从约束推」）**：

1. **落哪**：锚的权威身份在**画布节点**（生成时读的是节点，`core.ts:324` `snapshot.nodes.find`、身份轴对照读的是 `anchorDescriptionsForNode` 取源节点 prompt，`core.ts:491-500`）。故 static/dynamic/frozen **落进 `node.meta`**：
   ```
   node.meta = {
     referenceSheet: true,          // 已有：这是参考卡
     staticFeatures?: string,       // 新：身份 DNA（脸型/发色/骨相/标志物）——身份轴对照基准
     dynamicFeatures?: string,      // 新：服装/配饰/状态（允许跨镜变，不进身份匹配）
     frozen?: { at: number, by: 'user' },  // 新：冻结状态（时间戳 + 谁冻的，story-order 无关）
   }
   ```
   - **为什么不建独立结构**：独立表要新持久化字段（改 `projectRecordSchema`）+ 新的「节点↔圣经条目」绑定关系（又一处双向同步，违反盘点第 10 条「数据流单向一次性转换」原则）。而 meta 是**passthrough 自动持久化**、**生成路径本就读节点**——落 meta 是「贴着现有真相源」的最小改动。
   - **为什么 frozen 是对象不是布尔**：交付/审计要显示「XX 冻结于何时」；且未来若要「改了 static 特征自动解冻」，需要时间戳判据。布尔省不了多少、堵死扩展。

2. **`PlanAnchor` 同步扩字段**（IR 侧）：`storyboardPlan.ts:20-37` 加 `staticFeatures?/dynamicFeatures?`，落画布时（`storyboardPlanToCreateNodesArgs`，`:321-333`）写进 `PlanCreatedNode.meta`（`applyCanvasToolCall.ts:283` 透传 meta）。**`description` 保留**（向后兼容 + 文本锚仍用它拼 prompt，`:280-288`）——static/dynamic 是「description 的结构化细化」，不是替代。若二者都在，`buildAnchorSheetPrompt` 优先用 static+dynamic 分区（身份 DNA 段 + 变体行），退化到 description（旧草稿无新字段时）。

3. **GUI/headless 双侧读写同构怎么保证**：
   - **写**：GUI 经 `applyCanvasToolCall`（渲染层）、headless 经 `addProjectNodes`（`core.ts:218`）→ 两条都最终落 `node.meta`，**同一份 `Record<string,unknown>`**。
   - **读**：冻结门读 `node.meta.frozen`（GUI 在 `dependencyWaves`、headless 在新增的 core 侧检查，见 §2）；身份轴对照读 `node.meta.staticFeatures ?? node.prompt`（`core.ts:anchorDescriptionsForNode` 精化——优先用 static 当身份基准，比整串 prompt 更准）。
   - **同构守恒（照 W1 的 equivalence 先例）**：static/dynamic 的**语义键名**（`'staticFeatures'`/`'dynamicFeatures'`/`'frozen'`）是纯字符串常量，两侧共用一个 `electron/capabilityCore` 侧的 const（如 `ANCHOR_META_KEYS`），src 侧镜像 + `equivalence.test` 钉死——**杜绝「GUI 写 `staticFeatures`、headless 读 `static_features`」的键名漂移**（这正是 memory `connection-reference-bugs` 那类「槽读 meta、生成读边」分裂的同型风险）。

### 1.3 内容生成器 = 全资产大师 V3.0，不另写第二套（P1）

蓝图幕 1 明写「圣经内容由全资产大师 V3.0 生成」。**落地方式**：V3.0 产出自由文本资产卡（现状不变），由**分镜规划师**（`runStoryboardPlanner`，产出结构化 `StoryboardPlan`）在拆资产/拆镜头时，把「面容锚点」填进 `staticFeatures`、「服装/状态」填进 `dynamicFeatures`——即 V3.0 的 §B.3 字段本就分好了 static/dynamic 两组（`assetMasterPrompt.ts:264-284`），规划师照它填结构化字段即可，**不新写拆资产 prompt**。道具卡（V3.0 §C）顺带补「道具锚无专用节点种类」缺口——但道具走文本锚/通用 image 已能落地（`storyboardPlan.ts:228-232`），道具专用节点种类是 W2 的**可选精修**，不是冻结门的前置。

> ⚠️ **诚实边界**：V3.0 是 chat 模式（`creationAiModes.ts`），产出自由文本；规划师把它「翻」进结构化字段是**一次 LLM 转换**（同「剧本→分镜」的文本级单向转换，盘点 §3）。W2 不做「V3.0 资产卡↔结构化锚」的双向活同步（复杂度不换质量，对齐蓝图 §五数据流原则）。

---

## 2. 冻结门的执行点（Q2）

### 2.1 「批量生成」在本仓的两个真身（先厘清拦哪里）

**关键：MCP 没有「批量生成」工具**——`nomi_generate` 是**单镜**（`mcpToolCatalog.ts:251`、dispatcher `'generate'` case `dispatcher.ts:260`）。批量只在两处发生：

| 批量路径 | 落点 | 花钱边界 | 证据 |
|---|---|---|---|
| **A. GUI 批量** | `buildDependencyWaves` → `runPlanWithToasts` | 铸一颗 grant 绑整批（`mintSpendGrant(plan.waves.flat())`） | `batchPlanPreview.ts:35,95-178` |
| **B. production run** | `driveGeneration` 逐 job 提交 | plan.attach 建 job + contract gate → gate.decide 批准 → ready → 逐 job | `productionRunDriverOps.ts:249-353`；`productionRunService.ts:418-469` |

冻结门要拦的就是这两条。**单镜 `nomi_generate` 不拦**（§2.4 论据）。

### 2.2 拦截层 A（GUI 批量）：精化 `hasUsableResult` 判据

`buildDependencyWaves`（`dependencyWaves.ts:31-106`）**已经在做结构强制**——source 锚「无可用结果」→ target 镜头标 `blocked: 'missing-upstream'`（`:55-60`），跑了必裸跑就拦下。这是**冻结门的天然母体**：

- **今天的判据**：`hasUsableResult(sourceNode)`（`:16-20`）= 源节点有 `result.url || result.thumbnailUrl`。
- **W2 精化**：对**视觉锚**（`meta.referenceSheet === true` 且 kind 是 character/scene/prop）追加一条——不只要 `hasUsableResult`，还要 `meta.frozen`。即「锚生成了图但没冻结 → 依然拦下，理由从『上游没生成』升级为『锚未冻结』」。
- **纯函数、可单测**（`dependencyWaves.ts` 现有 `.test.ts`，`:115` 行内）：给一个「有 result 但无 frozen」的锚 + 引用它的镜头 → 断言镜头进 `blocked`，reason 新增 `'unfrozen-anchor'`（扩 `blocked.reason` 联合类型 `:11`）。
- **人话文案**：`describeBlockedNotice`（`batchPlanPreview.ts:55-65`）加一支「N 个镜头的角色/场景卡还没冻结，先在卡上点『冻结』」（i18n key，R15 双语）。**结构强制不靠 agent 自觉**——波次规划器直接把未冻结锚的下游踢出本批。

### 2.3 拦截层 B（production run）：新增「冻结门」gate（样片门语义扩展）

production run 的 job 在 `plan.attach`（`productionRunService.ts:418-469`）时创建（`status:'authorization_required'`）+ 一道 contract gate。**冻结门插在这之后、job 提交之前**：

- **形态**：新增一道 gate，`scope:'stage'`（与样片门/方向门同档——**可逆创意门**，`productionRunDriverOps.ts:323` 样片门就是 `scope:'stage'`），`gateId: 'gate-freeze-v{planVersion}'`，`jobIds:[]`（不授权花钱，只呈现「有 N 个锚待冻结」）。
- **注入时机**：`driveGeneration` 逐 job 前，检查「本 run 的锚节点是否全部 frozen」——用 `production.verify-shots` 的同款渲染层桥（`runQaStage` 已建此桥，`productionRunDriverOps.ts:137-158`）读画布锚的 `meta.frozen`。有未冻结 → 设冻结门 waiting + `return`（停在门上，同样片门 `:333` 的停法）。
- **为什么复用 gate 而非新造**：蓝图 §五明写「冻结门 = 样片门语义扩展，不新造第二套确认系统」。样片门（`shouldSampleGate`/`hasWaitingSampleGate`，`:104-113`）已是「生成前停一次看过再继续」的窗口化机制——冻结门是它的「更早一站」（看锚 vs 看首镜）。gate.decide 批准钩子重踢 `driveGeneration`（`productionRunService.ts:415` resume 重踢先例）。
- **决策形态**：走 `nomi_decide_gate`（`dispatcher.ts:215-240` `production.decide-gate`）——但当前只放行 `gate-direction-`/`gate-sample-` 前缀（`dispatcher.ts:229-231` `creativeGate` 判据 + `mcpProtocol.ts:232-234`）。**冻结门要加进这个白名单**（两处 `startsWith` 各加 `|| gateId.startsWith('gate-freeze-')`）。

### 2.4 冻结确认走什么形态：elicitation-first + App 卡兜底（复用既有基建）

蓝图幕 2「点『冻结』」是 **Block 档视觉确认**。**复用既有确认基建，不新造**：

- **elicitation-first**：`mcpProtocol.ts` 已有 `elicitBooleanConfirm`（`:186-210`）+ `elicitCreativeGateDecision`（`:220-262`）。冻结门作为「创意门」的一种，**走同一条 seam**——`nomi_decide_gate` 决定冻结门时，协议层 `elicitCreativeGateDecision` 弹「确认冻结这批锚?」（`:255-261` 的 message/description 模板改成冻结语义）。真人 accept 才 `production.decide-gate` 表态（`dispatcher.ts:232-238`）。
- **App 卡兜底**：不支持 elicitation 的客户端（Claude Code 不声明 elicitation，见 memory `claude-code-lacks-elicitation-capability`）→ `mcpProtocol.ts:346-357` 已有「未生效：改在 Nomi 中决定这道创意门」的兜底文案，冻结门天然继承。**用户在 Nomi 里点锚卡上的『冻结』按钮**（GUI 侧新增控件，见 §6）也直接决定这道 gate（渲染层 gate.decide）。
- **会话信任**：冻结是**每项目一次的仪式**（对齐蓝图「会话信任把它压到每项目一次」）——但**冻结本身不该走 spend/plan 信任的自动放行**（它是视觉确认，不是免问付费）。冻结门 gate 决定后，同项目**同一批锚不重复问**（gate 已 approved 就幂等，`productionRunService.ts:478-480` 先例）。

### 2.5 单镜 generate 与批量的语义差别（Q2 明问）

| | 单镜 `nomi_generate` | 批量（GUI/production） |
|---|---|---|
| 冻结门 | **不拦** | **拦** |
| 理由 | 单镜是「用户/agent 明确要这一张」的**自由可撤操作**（同 `core.addProjectNodes` 的「单节点不弹方案门」哲学，`core.ts:220-221`；同 `mcpProtocol.ts:388` 单节点不算方案）。生成一张锚卡本身、或手动重滚一镜，不该被冻结门挡——**冻结门管的是「一次性放一大批下游镜头」的一致性风险**，不是管单张图。 |
| 落点 | 无 | GUI=`dependencyWaves`；production=`driveGeneration` 前的冻结门 |

**这也解决了一个真实死锁**：锚卡自己就是「单镜生成」（要先出图才能冻结）——若单镜也拦冻结门，锚卡永远生成不出来。单镜放行 = 锚可生成 → 用户看图点冻结 → 批量放行。**语义闭环**。

---

## 3. I2V 默认两跳（Q3）

### 3.1 现状：headless 一跳直发（file:line）

`nomi_generate` → `core.generateOnProject`（`core.ts:297-488`）：构造**一个** `request`（`:366-381`）→ **一次** `runTaskFn`（`:385`）→ 轮询终态 → 落节点。**带参考图时 kind 按目录 derive**（`:336-340`，W1d commit 2669373a），video+参考 → `image_to_video`——即**参考图直接喂 I2V**，中间**没有「先出首帧图」这一跳**。

对比 GUI：`storyboardPlanToCreateNodesArgs` 的 `keyframe` 分支（`storyboardPlan.ts:361-396`）**已实现两跳**——建一张 image 首帧节点（I2I，连锚的 character_ref/style_ref 参考边）→ 用 `first_frame` 边喂 video 节点。这是「参考图→首帧 I2I→I2V」的 GUI 版。**headless 缺这一跳**（盘点第 6 条 D#6：视频→视频首帧接力未实现；此处是「参考图→首帧→I2V」的首帧那跳）。

### 3.2 两跳在 headless 怎么编排

**推荐：新建 electron 纯编排模块 `i2vTwoHopOrchestrate.ts`（或并进 core 的一个薄 hook），由 `generateOnProject` 在「video intent + 有视觉锚参考 + 模型支持 first_frame」时走两跳**：

```
两跳编排（headless，video 镜）：
  第 1 跳（首帧 I2I）：
    runTaskFn({ kind:'image_edit'/'text_to_image', prompt:首帧描述,
                extras:{ referenceImages:[锚参考图], firstFrame 不设 } })
      → 得首帧图 url（落一张 image 资产/可选落节点，见 §3.3）
  第 2 跳（I2V）：
    runTaskFn({ kind:'image_to_video', prompt:运动描述,
                extras:{ firstFrameUrl:首帧图url, referenceImages:[锚参考图] } })
      → 得视频 url → 落节点
```

- **首帧图怎么喂进 I2V wire**：`firstFrameUrl` extras → `referenceInputParams`（`archetypeInput.ts:26-28`）投影成 `first_frame_url` body 键——**这条线现成**（T5 尾帧接力就靠它，`generationReferenceResolver.ts:22-24`）。headless 只需在第 2 跳把首帧 url 填进 `extras.firstFrameUrl`。
- **模型支持判据**：并非所有 video 模型有 first_frame 槽。**按目录 derive**（同 `referenceModeForIntent` W1d 判据，`core.ts:336-338`）：模型无 first_frame 能力 → **降级为一跳**（参考图直发 I2V，即今天行为）。**T2V 降级为无参考兜底**（蓝图幕 2「T2V 降级为无参考兜底」）——无锚参考 → 直接 text_to_video。
- **额度语义（Q3 明问，spendGrant 不动前提下）**：两跳 = **两次 vendor 调用**（首帧图 + 视频）。落在**同一颗 grant 的同 nodeId 预算内**——复用 W1 已证的「首帧那跳吃 grant 一次、视频那跳吃一次」。但 `maxAttemptsPerNode=3`（`spendGrant.ts:27-28`）默认给「1 首发 + 2 重试」，若两跳都算「首发」会吃掉 2 次预算，只剩 1 次给审片重试。**两个解**（对比表见 §3.4）：
  - **解 A（推荐）**：首帧图那跳走**独立 grant**（图是便宜的、且首帧图是「中间产物」不是「这一镜的最终交付」），视频那跳 + 审片重试共用镜头 grant 的 3 次。语义清晰：「首帧图 1 颗 grant、视频镜 1 颗 grant（含 2 次重试预算）」。
  - **解 B**：两跳同 grant，`maxAttemptsPerNode` 提到 4（首帧 1 + 视频 1 + 重试 2）——但这**改 spendGrant 默认**（违反 §10 硬不动项）。**否决**。

### 3.3 首帧图落不落节点/资产

- **落资产（必须）**：首帧图要当 I2V 的 `firstFrameUrl`，必须是 `nomi-local://` 资产（`extractVideoFrameToAsset`/`writeAsset` 同款落盘，第 2 跳才引用得到）。
- **落节点（可选，推荐落）**：GUI 版落一个 `meta.storyboardKeyframe:true` 的 image 节点（`storyboardPlan.ts:369`，不占镜号）。headless 两跳**建议同样落一个 keyframe 节点**——好处：① 首帧图可回看/可单独重滚；② 与 GUI 形态同构（P4）；③ 审片可对首帧判分（§3.4）。代价：headless 多建一个节点（`addNodes` 一次）。**若落节点破坏「单镜 generate 只碰一个节点」的简洁性**，可退化为「只落资产不落节点」——但那样 GUI/headless 两跳形态不同构，取舍留实现时按「是否让 draft-journey 幕 5 的两跳可断言」定。

### 3.4 与 W1 审片环的接缝：首帧判分 → 过检才 I2V？

**推荐两跳内嵌一次「首帧判分」**（对齐 ViMax best-of-k：先在**首帧图**上判身份/构图，过检才推 I2V——视频比图贵得多，坏首帧不该白跑 I2V）：

```
第 1 跳出首帧图 → shotVerify 判分（复用 W1 的 verifyAndMaybeRetry，isVideo=false）
   过检（passed）→ 第 2 跳 I2V
   不过 → 定向重试首帧（K≤2，复用 W1 regenerate 线）→ 仍不过 → 红标 + 仍推 I2V（诚实标注，不阻断）
```

- **复用 W1，不新造**：`verifyAndMaybeRetry`（`shotVerifyOrchestrate.ts:184`）对图片镜 `isVideo:false` 直接判 `frameSourceUrl`（`:135`）——首帧图正是这个形态。首帧判分 = 在两跳中间插一次 W1 审片环（K≤2、定向重试、红标全继承）。
- **接缝取舍**：「首帧过检才 I2V」vs「先 I2V 再对视频首帧判分」——前者省钱（坏首帧不推视频，ViMax 实证做法），后者简单（一跳直发 + 事后判）。**推荐前者**（省的是视频那次贵调用），但**首帧判分失败/超时 → 照常推 I2V**（W1 韧性铁律 `shotVerifyOrchestrate.ts:184-207`：判分绝不阻断生成）。
- **额度**：首帧判分走 W1 的 `image_to_prompt` 文本路（`shotVerifyDeps.ts:145-160`）——**不花生成额度**（`runtime.ts` 早于 grant 校验返回，W1 §2 已证）。首帧重试吃首帧那颗 grant 的重试预算（解 A 下首帧独立 grant 的 3 次）。

---

## 4. 首尾帧锚定（Q4）

### 4.1 StoryboardPlan 加 ffDesc/lfDesc 字段（B 报告 §3.2）

`PlanShot`（`storyboardPlan.ts:39-70`）现有 `keyframe:{prompt}`（首帧图计划）。W2 补 ViMax 的**首/尾帧描述分解**：

```
PlanShot 扩（storyboardPlan.ts:39-70 + zod planShotSchema :99-121）：
  ffDesc?: string   // 纯静态首帧快照（景别/角度/构图/光/人物位置）——B §3.2 ff_desc
  lfDesc?: string   // 纯静态尾帧快照（须与首帧+运动逻辑自洽）——B §3.2 lf_desc
```
- **最小可行版**：`ffDesc` 复用现有 `keyframe.prompt`（首帧图 prompt 就是 ffDesc 的落地）——即 W2 只需**显式加 `lfDesc`**（尾帧描述），`ffDesc` 语义上已被 keyframe 承载。若要严格对齐 ViMax 两分解，把 `keyframe.prompt` 重命名/别名为 `ffDesc`（向后兼容保留 `keyframe.prompt` 读取）。
- **zod + 编译期漂移守卫**：`planShotSchema`（`:99-121`）加 `ffDesc/lfDesc` optional string，`_planSchemaToType`/`_planTypeToSchema`（`:142-143`）自动守恒。

### 4.2 相邻镜续接（上镜尾帧→下镜首帧参考）的最小可行版

蓝图幕 5「尾帧锚定续接」+ 盘点第 6 条（视频→视频首帧接力抽帧**尚未实现**，`storyboardPlan.ts:397-399` 明写「不连 shot→shot 链」）。**最小可行版**：

```
落画布时（storyboardPlanToCreateNodesArgs）：
  相邻两镜 shot[i]、shot[i+1] 都是 video →
    连一条边 shot[i](video) --first_frame--> shot[i+1](video)
    （source 是视频节点 → resolver 走「尾帧接力」：抽 source 视频尾帧当 target 首帧）
```
- **「视频→尾帧抽帧」是否现成**（Q4 明问）：**现成**。`extractVideoFrameToAsset({which:'last'})`（`extractVideoFrame.ts:108`，`which:'last'` 取末尾 0.1s 帧 `:82-88`）已实现。且 `first_frame` 边的**尾帧接力语义已建**——`generationReferenceResolver.ts:22-24,96-108` 明写「first_frame 边的源是 video 节点时→抽源视频尾帧填 firstFrameUrl」。**故相邻镜续接 = 连一条 `first_frame` 边（source 是前一镜视频）**，抽帧线全现成，W2 只需在 `storyboardPlanToCreateNodesArgs` **解除「不连 shot→shot 链」的限制**（`:397-399` 改为「相邻 video 镜连 first_frame 链」）。
- **代价/风险**：连了链 → 依赖波次变深（`dependencyWaves` 把后镜排到前镜之后），批量不再全并发（对齐 `batchPlanPreview.ts:112-123` 的多波提示，用户已知）。且首镜无前镜（无尾帧可接）→ 首镜走「参考图→首帧」两跳（§3），后镜走「上镜尾帧→首帧」——**首镜和后镜的首帧来源不同**，编排要分支（首镜 I2I 首帧、后镜抽帧首帧）。**最小可行版可只做「首帧两跳」（§3），相邻续接作为 W2 的可选精修**（蓝图幕 5 的完整形态），先把「参考图→首帧→I2V」打通（收益最大，对齐 T2「视觉锚定是抓手」）。

---

## 5. L2 幕 2 点亮的断言设计（Q5）

`draft-journey.e2e.mjs:84-85` 幕 2 今为 pending。W1 已建 mock 基建（`_mcpJourney.mjs`：`nomi-mock-judge` text 模型 + `BAD_SHOT_MARKER` + SSE judge）。**幕 2 三条断言**：

### 5.1 未冻结拒批量（结构断言）
- **难点**：MCP 无「批量生成」工具（§2.1），幕 2 在 L2（真 stdio + headless）里没有 GUI 的框选批量。**两个测法**（对比 §5.4）：
  - **测法 A（推荐，走 production run）**：`nomi_start_playbook` 起一个 run → 走到 plan.attach（锚+镜头 job）→ **断言冻结门 gate 出现且 waiting**（锚未冻结）；`nomi_get_run` 读投影里 `gates` 含 `gate-freeze-*` status waiting。这是「未冻结 → 拦住批量（run 停在冻结门）」的结构断言。但 production run 起链较重（需 direction/storyboard 阶段），L2 现有 `production-mcp-journey.e2e.mjs` 已有 fixture 可复用。
  - **测法 B（轻，纯函数层）**：幕 2 不走真 run，而在 L1 单测 `dependencyWaves.test.ts` 断言「有 result 无 frozen 的锚 → 下游镜头进 blocked（reason:'unfrozen-anchor'）」。L2 幕 2 只做「锚 meta.frozen 能写能读」的端到端浅断言（加节点带 meta.frozen → read_canvas 读回）。
- **推荐组合**：**结构强制的核在 L1（测法 B 的纯函数断言，铁律层）**，L2 幕 2 用**测法 A 的 production 冻结门 gate 断言**（旅程层证「批量真被冻结门拦住」）。二者各司其职（同 W1 的 L1/L2 分工，`w1-shot-verify-wiring.md:234-236`）。

### 5.2 冻结后强制引用
- 冻结锚（写 `meta.frozen`）→ 再走批量 → **断言镜头不再进 blocked**（冻结门放行）。测法 A：decide 冻结门 approved（`nomi_decide_gate`）→ `nomi_get_run` 断言 run 从「停在冻结门」转「继续生成」（jobs 开始 submit）。

### 5.3 冻结确认恰 1 次
- 全旅程 elicitation 计数（`mcp.elicitationCount()`，`_mcpJourney.mjs:391`）——冻结门决定弹**恰 1 次** elicitation（对齐横切断言 `draft-journey.e2e.mjs:200-205` 的「Block 确认 ≤4」）。冻结门决定后同项目不重复问（gate 幂等）。断言：冻结前后 `elicitationCount` 差 === 1。

### 5.4 mock 环境怎么测（对比表）

| 测法 | 覆盖 | 起链成本 | 冻结状态怎么造 | 判 |
|---|---|---|---|---|
| A. production run 冻结门 gate | 「批量被冻结门拦→决定→放行」端到端 | 重（需 storyboard 阶段，复用 production fixture） | 锚 job 的节点 `meta.frozen` 由渲染层桥读（`runQaStage` 同款 `production.verify-shots` 桥读 meta） | ✅ 旅程层 |
| B. dependencyWaves 纯函数 | 「未冻结锚→下游 blocked」结构强制 | 无（L1 裸测） | fixture node 直接带/不带 `meta.frozen` | ✅ 铁律层 |
| C. 单镜 generate 不拦 | 「单镜放行、锚可生成」 | 轻（幕 5 已有单镜路） | N/A（单镜本就不拦） | ✅ 顺带验 |

**推荐：L1 用 B（结构核）+ L2 幕 2 用 A（旅程）+ C 顺带（幕 5 已覆盖单镜不拦）。** 先红后绿：旧构建下无 frozen 概念 → 冻结门 gate 不存在 → 测法 A 断言「gate-freeze 出现」必红；接上后绿（同 W1 `w1-shot-verify-wiring.md:236` 的 pending→pass）。

---

## 6. 改动量与分层（Q6）

### 6.1 任务拆解（文件 × 改动 × 新测 × 先红后绿）

| # | 文件 | 改动 | 性质 | 新测 | 先红怎么证 |
|---|---|---|---|---|---|
| T1 | **新** `electron/capabilityCore/anchorBible.ts` | `ANCHOR_META_KEYS` 常量（`staticFeatures`/`dynamicFeatures`/`frozen`）+ `isAnchorFrozen(node)`/`anchorStaticFeatures(node)` 纯函数 | **纯函数**（单一真相源，electron 侧） | `anchorBible.test.ts` | — |
| T2 | **新** `src/.../anchorBible.equivalence.test.ts` | 钉 src 侧读 meta 的键名 === electron 常量（防漂移，照 nodeKindDomain 先例） | 该测本身 | 故意改 src 侧键名一字 → 红 |
| T3 | `src/workbench/generationCanvas/agent/storyboardPlan.ts`（403 行） | `PlanAnchor` 加 `staticFeatures?/dynamicFeatures?`（`:20-37`）+ zod（`:83-97`）；`buildAnchorSheetPrompt` 优先用 static/dynamic 分区（`:247-277`）；落画布写进 `PlanCreatedNode.meta`（`:321-333`）；`PlanShot` 加 `ffDesc/lfDesc`（`:39-70,99-121`）；相邻 video 镜连 `first_frame` 链（解除 `:397-399` 限制） | 纯函数（转换器） | 扩 `storyboardPlan.test.ts`：static/dynamic 落 meta、相邻镜连链 | 断言「锚 meta 含 staticFeatures」在旧转换器红 |
| T4 | `src/workbench/generationCanvas/runner/dependencyWaves.ts`（115 行） | `hasUsableResult` 旁加「视觉锚须 frozen」判据；`blocked.reason` 加 `'unfrozen-anchor'`（`:11`） | 纯函数 | 扩 `dependencyWaves.test.ts`：有 result 无 frozen 锚→下游 blocked | 断言 blocked reason=unfrozen 在旧代码红 |
| T5 | `src/workbench/generationCanvas/components/batchPlanPreview.ts`（186 行） | `describeBlockedNotice`（`:55-65`）加「N 锚未冻结」人话（i18n，R15 双语） | 接线薄 | 靠 T9 端到端 |
| T6 | **新** `electron/capabilityCore/i2vTwoHop.ts` | 两跳编排 `generateViaTwoHop`（首帧 I2I → 首帧判分[复用 W1]→ I2V），DI 可裸测；模型无 first_frame → 降级一跳 | **纯编排**（DI） | `i2vTwoHop.test.ts`：桩注入 runTask→断言两次调用、首帧判分接 W1、降级路径 | 模块不存在即红 |
| T7 | `electron/capabilityCore/core.ts`（500 行） | `generateOnProject` 在「video intent + 有视觉锚 + 模型支持 first_frame」时走 T6 两跳（可选 hook，默认一跳=行为不变）；`anchorDescriptionsForNode`（`:491-500`）优先用 `staticFeatures` | 薄 hook | 扩 `core.test.ts`：两跳分支 + 默认一跳回归 | 断言两跳产两资产在旧 core 红 |
| T8 | `electron/productionRun/productionRunDriverOps.ts`（481 行） | `driveGeneration`（`:249` 前）加冻结门检查：锚未 frozen → 设 `gate-freeze-v{n}`（scope:'stage'）waiting + return；decide 重踢 | 接线 | 扩 `production-mcp-journey`：未冻结→冻结门 waiting | qa 现无冻结门，断言在旧代码红 |
| T9 | `electron/capabilityCore/dispatcher.ts`（272）+ `mcpProtocol.ts`（555） | `creativeGate` 白名单加 `gate-freeze-`（`dispatcher.ts:229-231`、`mcpProtocol.ts:232-234`）；`elicitCreativeGateDecision`（`:255-261`）冻结语义文案 | 接线薄 | 靠 T10 | — |
| T10 | `tests/ux/draft-journey.e2e.mjs`（222 行） | 幕 2 从 pending 转真断言：未冻结→拒批量（production 冻结门）/ 冻结后放行 / 确认恰 1 次 | 幕 2 断言 | **先红后绿**：旧构建无 frozen→冻结门不存在→断言红；接上转绿 |
| T11（可选精修） | 道具专用节点种类 + 相邻镜续接完整版 | 补道具锚节点 kind（`storyboardPlan.ts:228-232`）；相邻镜尾帧→首帧完整链（§4.2） | — | — | — |

### 6.2 分层 + ≤800 行保证

- **新模块 2 个 + 现有全 <800**：`anchorBible.ts`(~60) / `i2vTwoHop.ts`(~140)；触碰的现有文件增量都小——`core.ts` 500→~540（+40 两跳 hook）、`storyboardPlan.ts` 403→~470（+67 static/dynamic + ffDesc + 链）、`dependencyWaves.ts` 115→~140、`driveGeneration` +~30、`dispatcher/mcpProtocol` 各几行。**全部远低于 800**。
- **哪些是纯函数、哪些是接线**（Q6 明问）：
  - **纯函数**（同入参恒同结果、裸测）：`anchorBible`（frozen 判据/static 取值）、`storyboardPlan` 转换器扩展（static/dynamic 落 meta、连链）、`dependencyWaves` 冻结判据、`i2vTwoHop` 编排（DI 桩注入）、`buildRetryDirective`（W1 已有，两跳复用）。
  - **接线**（薄、靠端到端覆盖）：`core.ts` 两跳 hook、`driveGeneration` 冻结门注入、`dispatcher/mcpProtocol` 白名单+文案、`batchPlanPreview` 人话。
  - **领域逻辑不进传输层**：冻结判据住 `anchorBible`（纯）+ `dependencyWaves`（纯）；两跳策略住 `i2vTwoHop`（纯编排）；传输层（dispatcher/mcpProtocol）只放行 gate + 弹确认；core 只调编排。三层边界干净（同 W1 §9）。

---

## 7. 风险与不动项

**硬不动**：
- `electron/spendGrant.ts` **一字不动**（§3.2 解 A：两跳 = 首帧独立 grant + 视频镜 grant，都在现有 `maxAttemptsPerNode=3` 内；不提 max 到 4）。红队不变量（令牌只主进程铸、`assertAndConsumeSpendGrant` 逐次硬校验、按 node 计次封顶）全保持。
- `projectRecordSchema` **不改**（§1.2：`node.meta` 是 `passthrough`，frozen/static/dynamic 自动持久化，无需新字段）。
- production run 状态机核心**不改**（冻结门是 gate 增量，走既有 `gate.add`/`gate.decide` 命令，同样片门；`plan.attach`/reducer 不动）。
- W1 shotVerify 环**复用不改**（首帧判分直接调 `verifyAndMaybeRetry`，`isVideo:false`——现成路径 `shotVerifyOrchestrate.ts:135`）。

**风险点（实现前要小验证）**：
1. **首帧图节点落不落的取舍**（§3.3）：落节点=GUI/headless 同构 + 可断言，但破坏「单镜 generate 只碰一个节点」的简洁。实现前一步先定「draft-journey 幕 5 是否要断言两跳产两资产」——要断言就落节点。R5 小验证。
2. **模型 first_frame 能力 derive 的确切目录判据**（§3.2）：`referenceModeForIntent`（`core.ts:337`）是否覆盖「有无 first_frame 槽」，还是要另读 mode.slots。实现前 grep 确认（同 W1d 的参考模式 derive 路，`catalogTaskActions.ts:176` `mode.slots.some(slot.kind==='first_frame')` 是渲染层判据，headless 需等价）。R5 小验证。
3. **production 冻结门读锚 frozen 的桥**（§2.3）：`runQaStage` 用 `production.verify-shots` 桥读画布（`productionRunDriverOps.ts:143`）——冻结门要读锚的 `meta.frozen`，需确认这个桥/或新加一个 `production.check-frozen` 桥能读到锚节点 meta（渲染层读画布 store 的 node.meta）。实现前钉桥的确切形状。
4. **相邻镜续接的首镜/后镜首帧来源分支**（§4.2）：首镜=参考图两跳首帧、后镜=抽前镜尾帧——编排分支要写清，否则首镜没前镜时抽帧会失败。最小可行版先只做首帧两跳、续接留精修，规避此风险。
5. **static/dynamic 由谁填**（§1.3）：规划师把 V3.0 自由文本「翻」进结构化字段是一次 LLM 转换，转换质量看底座模型（同「剧本→分镜」）。诚实边界：W2 建字段 + 冻结门结构强制，但「填得准不准」不在结构可保范围（对齐 D4 诚实标注）。

**P1 收敛检查（无并行版）**：
- **冻结判据收敛为一份**（`anchorBible.isAnchorFrozen` electron 单一真相源 + equivalence 钉 src 镜像）——GUI（dependencyWaves）与 headless（core/production）读同一判据。✅
- **两跳首帧判分复用 W1 审片环**（不新造 judge）——首帧判分 = `verifyAndMaybeRetry(isVideo:false)`，与镜头判分同一份核。✅
- **首帧接力线复用现成 first_frame/firstFrameUrl 机制**（`archetypeInput.ts:26-28` + `generationReferenceResolver` 尾帧接力）——headless 只填 `extras.firstFrameUrl`，不造新 wire。✅
- **冻结确认复用 gate/elicitation 基建**（`elicitCreativeGateDecision` + App 卡兜底）——不新造第二套确认系统（对齐蓝图 §五）。✅

---

## 附：5 句摘要

1. **数据模型落点**：static/dynamic 特征 + frozen 状态**落 `node.meta`**（`Record<string,unknown>` 且持久化是 `z.passthrough()`，`projectRecordSchema.ts:21,25`——**自动落盘、零 schema 改动**）；`PlanAnchor` 同步扩 `staticFeatures?/dynamicFeatures?`（`storyboardPlan.ts:20-37`，`description` 保留向后兼容）。内容生成器 = 全资产大师 V3.0 不变（其 §B.3 本就分好 static/dynamic 两组，规划师照填），**当前全仓 0 处 frozen/圣经代码，W2 从零建这层**。GUI/headless 同构靠「electron 侧 `anchorBible.ts` 键名常量 + src 镜像 equivalence 守恒」（照 nodeKindDomain 先例）。
2. **冻结门拦截层**：MCP **无批量工具**（`nomi_generate` 是单镜）——批量只在 ① GUI `buildDependencyWaves`（精化 `hasUsableResult`→加 frozen 判据，`dependencyWaves.ts:16-20,55-60`）② production run（`driveGeneration` 前新增 `gate-freeze` gate，样片门语义扩展 scope:'stage'）两处拦。**单镜不拦**（自由可撤操作 + 破死锁：锚自己要单镜生成才能冻结）。确认走 elicitation-first（复用 `elicitCreativeGateDecision`）+ App 卡兜底，不新造第二套。
3. **两跳编排结论**：headless 现状一跳直发（`core.ts:385` 单次 runTask）；两跳 = 新 `i2vTwoHop.ts`（首帧 I2I → **首帧判分复用 W1** `verifyAndMaybeRetry(isVideo:false)` 过检才推 → I2V），首帧图落资产（喂 `firstFrameUrl`→`first_frame_url` body 键，**这条线现成** `archetypeInput.ts:26-28`）、建议落 keyframe 节点（GUI 同构）；模型无 first_frame 槽 → 降级一跳、无锚 → 降级 T2V。额度：**首帧独立 grant + 视频镜 grant（含审片重试），spendGrant.ts 不动**。「视频→尾帧抽帧」`extractVideoFrameToAsset({which:'last'})` **现成**（`extractVideoFrame.ts:108`）。
4. **最大风险**：Q1 圣经字段落点的双侧同构——键名漂移（GUI 写 `staticFeatures`/headless 读 `static_features`）是 memory `connection-reference-bugs` 同型隐患，靠 `anchorBible` 单一常量 + equivalence 测钉死；次风险是「首帧图落不落节点」的取舍（影响 draft-journey 幕 5 可断言性）+ 模型 first_frame 能力 derive 的确切目录判据 + production 冻结门读锚 meta 的桥形状（三条 R5 小验证）。static/dynamic「填得准不准」看底座模型，不在结构可保范围（诚实标注）。
5. **改动量**：新增 2 个 <200 行 electron 模块（`anchorBible` ~60 / `i2vTwoHop` ~140）+ 扩 4 个纯函数（storyboardPlan/dependencyWaves 转换器与判据）+ 薄接线（core 两跳 hook +40 / driveGeneration 冻结门 +30 / dispatcher+mcpProtocol 白名单几行）；改动现有文件增量小（全 <800）；harness 幕 2 从 pending 转真断言（L1 用 dependencyWaves 纯函数验结构核 + L2 用 production 冻结门 gate 验旅程，先红后绿）。**spendGrant.ts / projectRecordSchema / production 状态机核心 / W1 审片环全部不动**。

---

## 遗留（W2 收尾时补记 · 2026-08-20）

> 前任凌晨中断，接续时补记。以下为实现落地后与方案有出入/需留给后续波的事项，逐条讲清「为什么/后果/怎么处置」。

1. **【裁定 A · 必须刻进 W3】MCP 单镜循环可绕冻结门 → W3 批次闸落地时，MCP 批量语义必须同样过冻结门。**
   - **为什么**：冻结门当前只拦两处「批量」——GUI 依赖波次（`dependencyWaves`）与 production run（`driveGeneration` 前的 `gate-freeze`）。而 MCP 的 `nomi_generate` 是**单镜**、按设计**不拦**冻结门（自由可撤 + 破死锁：锚要先单镜出图才能冻结，§2.4/§2.5）。
   - **后果**：一个外部 agent 若**用一串 `nomi_generate` 单镜循环**把整部片子逐镜生成（而非走 GUI 框选批量或 production run），就**完全绕过了冻结门**——一致性地基对这条路是失效的。今天没有「MCP 批量生成」工具（§2.1），所以这条绕行路**目前只是理论口**，但 W3「批次确认闸」一旦给 MCP 加上批量语义（无论是新 `nomi_generate_batch` 工具，还是让 playbook 路径逐镜自驱），**那条新批量入口必须和 GUI/production 一样过冻结门**（读同一份 `anchorBible.unfrozenVisualAnchors` 判据），否则 W3 会开一个新的绕行口。
   - **处置**：W3 落 MCP 批量语义时，在批量入口处（受理前）复用 `anchorBible` 判据拦未冻结锚的下游——与 `dependencyWaves`/production 冻结门**同一份真相源**，不另写第二套。**单镜 `nomi_generate` 维持不拦**（死锁论证不变）。

2. **【L2 幕 2 的实际落法与方案 §5.1 测法 A 有出入 —— 诚实记录】**
   - **方案原设想（§5.1 测法 A）**：L2 幕 2 走 production run 冻结门 gate 端到端断言（起 run → 停在冻结门 → decide → 放行）。
   - **实现时发现不可达（读代码定的结论）**：`draft-journey.e2e.mjs` 是**纯 headless MCP**（无 GUI 窗口，`_mcpJourney.mjs` 契约）。而 production 冻结门端到端要跨三道渲染层/GUI 墙：① `plan.attach` **不在 MCP dispatcher 白名单**（只 start/get/events/artifact/control/decide-gate，`dispatcher.ts:152-240`），只能经渲染层 IPC（`window.nomiDesktop.productionRuns.command`）；② 合同门 `gate-contract-*` 是 `budget_envelope` 花钱门、**非 creativeGate**，`nomi_decide_gate` 拒批（`dispatcher.ts:229-231`），必须渲染层批准；③ headless E2E fixture（`productionRunE2eFixture.ts`）storyboard 是 `anchors:[]`、且**未实现** `production.check-frozen`。三者叠加 → 冻结门在 headless MCP 面**结构上到不了**。此外 headless `nomi_add_nodes`（`NodeSpec`）**不收 `meta`**、`nomi_read_canvas`（`readCanvas` 投影）**不回 `meta`** —— 连「写/读 frozen meta」的浅断言（测法 B）在 MCP 面也不可达。
   - **实际落法（faithful 的 headless 版）**：L2 幕 2 = **require 已构建的真判据** `dist-electron/capabilityCore/anchorBible.js`（headless 冻结门 + production 冻结门 + GUI 波次镜像共用的**同一个谓词**，equivalence 钉死），对三种锚形态判「未冻结锚被挑出（拒批量）/ 冻结后放行 / 镜头节点非锚（单镜不拦破死锁）」+ 真在 headless 画布落「锚 + 镜头 + character_ref 边」验批量拓扑。先红后绿：stash 掉 `electron/anchorBible.ts` + 清 dist 产物 → 幕 2 `Cannot find module '.../anchorBible.js'` 直接红；接回即绿（已实测）。
   - **拦截「流程」的真实归宿在 L1**（诚实边界，D4）：「镜头→blocked」全波次流程 = `dependencyWaves.test.ts`；「production 停在冻结门→零 provider 调用→decide 放行→提交」+「冻结确认恰 1 次（fixture 桥只在放行前问一次、`hasApprovedFreezeGate` 短路）」= `productionRunDriver.test.ts`（走真 reducer→driver→gate→fixture 路，即 MCP production run 会走的同一条 electron 路径，只是绕开传输层白名单直接调 service）。**gate 的执行面本就是渲染层/production，不是 headless MCP 可达面** —— 这不是缺陷，是「单镜自由、批量才锁」的正确架构。
   - **留给未来**：若要 L2 真机走查冻结门端到端（含截图眼见链），正确归宿是 **GUI production 旅程**（`production-mcp-journey.e2e.mjs`）加一段 freeze 段 + 给 fixture 补 `production.check-frozen` + storyboard 带一个锚——那是 R13 走查而非 headless L2 的活，本次未做（不 gold-plate，超出「接续收尾幕 2」范围）。

3. **【圣经内容生成器（V3.0 填 static/dynamic）尚未接线 —— 结构就位、填充待接】**
   - 本次落地了**结构**：`PlanAnchor.staticFeatures/dynamicFeatures`（+zod）、落画布透传进 `node.meta`（GUI 路 `applyCanvasToolCall`）、`buildAnchorSheetPrompt` 分区、`anchorBible` 判据。但「由分镜规划师从全资产大师 V3.0 资产卡的『基础面容锚点/服装层次』**填**进这两个字段」这条 LLM 转换（§1.3）**尚未接线** —— 规划师 prompt 还没教它产出 static/dynamic 分组。故当前 static/dynamic 字段**能落能读能判、但常空**（规划师没填）。这是 W2 的「填充」半边，结构半边已足以让冻结门跑起来（冻结判据只看 `referenceSheet`+`frozen`，不看 static/dynamic 是否非空）。留 W2 后续或并进 W4 镜头语言字段化时一起接。

4. **【方案 §3/§4 的 I2V 两跳 + 首尾帧锚定未实现 —— 本次范围只到冻结门】** `i2vTwoHop.ts`、首帧判分接缝、`ffDesc/lfDesc`、相邻镜 `first_frame` 续接链均**未落**（brief 明确本次只收尾「圣经 meta + 冻结门」）。方案 §3/§4 的侦察结论仍有效，留后续波按图施工。
