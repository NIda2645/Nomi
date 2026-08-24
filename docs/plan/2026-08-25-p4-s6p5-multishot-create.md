# P4 S6.5 — 语义多镜 create 双入口 + APIMart 真付费全链验收

> 切片 S6.5（P4 收尾）。前置：S1-S6（PR #153 已 MERGED 进 origin/main）。纪律同 S1-S6。
> 计划真相源：`docs/superpowers/plans/2026-08-24-p4-multishot-continuity.md` §3.1（create 双入口原文）/§4（失败语义）/§5（验收门）/§6（T1/T2/T3 拍板）。
> S6 plan §10 审查裁定（2026-08-25）：付费验收顺延到本切片走真入口执行。
> 开关：沿用现有语义面 `NOMI_MCP_GENERATION_SINGLE_SHOT_V1`（E0：create/plan/preview）+ `..._E1_V1`（E1：gate/start）。**不新增 MULTISHOT_V1 标志**（见岔路裁定 §2.0）。

## 0. 一句话

给语义多镜生成链装上**生产入口**：MCP 语义 `create` 面接受 `plan`（逐镜 client 给）或 `scriptText`（planner 拟稿）两种多镜草稿，落到 durable `generation.seal` 带 shots[]+planHash → 复用既有 S1-S6 下游（gate 多镜投影 → 锚检查点 → S4 调度 → S5 落地 → S6 返工）。零额度 E2E 走真入口验全链；再走真入口跑 APIMart 真付费一次验全链（2 镜 + 1 锚 + 返工）。

## 1. 家底核实（file:line，已实读 origin/claude/p4-s6-rework-acceptance）

**入口缺口（本切片要补的那一个）**：
- 语义 `create` 只收单 candidate：`mcpGenerationTools.ts:633-636`（`deps.operations.create({... candidate: normalizeVideoCandidate(candidateFrom(params.candidate) ...)})`）——无 shots 入口。
- durable store `seal` 只发 `{contract}` 不带 shots：`productionGenerationOperationStore.ts:78-90`（payload `{ contract }`）。而 reducer `generation.seal` **已支持** `payload.shots`/`planHash`/`shotPrices`：`productionRunReducer.ts:342-368`（`sealGenerationShots(currentPlan, command.payload.shots)`；L368 `...(sealedShots ? { shots, planHash } : {})`）。→ **plan.shots 只在 seal 时从 payload 落**，草稿期不需要携带 shots。
- durable store `create` policy 只白名单顶层 candidate 的 model：`productionGenerationOperationStore.ts:53-57`（`allowedModels: [input.candidate.modelId]`）——多镜锚(image-model)+镜(video-model)不同 model，提交时 policy 会拒非白名单 model（S4 e2e `setup` L99 显式给 `allowedModels: ["image-model","video-model"]` 证此）。→ create 多镜须把**所有 shot 的 provider/model 并集**写进 policy。

**下游已就绪（本切片不动，只驱动）**：
- MCP `gate_request` 已对有 shots 的 sealed op 出多镜投影：`mcpGenerationTools.ts:718-746`（`multiShotGateProjectionFor(sealed)` + PLAN 级 receipt ceiling + `shots:{...}` 键）；单镜无 shots 走扁平卡 L747-765。
- store 投影 shots 回 operation：`productionGenerationOperationStore.ts:19-31`（plan.shots → operation.shots）。
- appIntegration `start` 分流：`appIntegration.ts:423-444`（`operation.shots.length>0` → landCanvasBestEffort + createMultiShotBatchScheduler + runToQuiescence）；单镜 L446。
- 定价：`catalogPricingResolver.ts`（createCatalogModelPricingResolver / createCatalogShotPriceResolver）；`shotPricing.ts`（deriveShotPrice / buildMultiShotGateProjection）。
- 锚圣经：`anchorBible.ts`（isVisualAnchorKind / ANCHOR_META_KEYS）。
- 调度器需 `plan.state==='submitted'`：`multiShotBatchScheduler.ts:178`（`batchActive = state==='submitted' && shots.length>0`）。

**⚠️ 连带根因 bug（本切片顺手修，P2）**：appIntegration `start` 多镜分支（L423-444）kick 调度器但**从不发 `generation.submit`**——sealed+approved 的 plan 停在 `sealed`，`batchActive` 恒 false，调度器空转。single-shot 走 `submission.start` 内部会转 submitted（`productionGenerationSubmission.ts:~430`）；S4/S5 e2e 用 `setup()` 直发 `generation.submit`（e2e L103）绕过 appIntegration 才没暴露。真入口一走就必现——**正是"没有生产入口"的直接后果**。修：多镜 start 分支在 kick 前发 `generation.submit`（经 durable store）。

## 2. 岔路裁定（无第二真相 / §4 原文 + P1）

**2.0 不新增 MULTISHOT_V1 开关，多镜 create 是既有 `create` 能力的**形状扩展**（收 shots[]）不是新能力。** 理由：① 计划 header 写的 `NOMI_MCP_GENERATION_MULTISHOT_V1` 全仓不存在——S1-S6 全走测试注入，从没接语义面，flag 从没被 wire；② E0_SCOPE 已含 `create`（`mcpGenerationPolicy.ts:15`），多镜 create 走同一 capability、同一 gate/start，加新 flag = 造并行开关面（违 P1）。单 provider v1=APIMart 由 policy allowedProviders 收口（既有机制）。**记录：与计划 header 的 flag 名不一致，按代码现实裁定，plan §2.0 明写。**

**2.1 扩现有 `nomi_operation_create`（语义 create）不碰 `nomi_generate`。** 任务书说"扩展 nomi_generate→'create'"，但实查：`nomi_generate` 是 LEGACY 低层工具（`mcpToolCatalog.ts:389` method='generate'）直接建画布节点+真生成，**不走 seal**；语义 create 是 `nomi_operation_create`（`mcpGenerationTools.ts:77` → capability 'create' → durable Run → seal）。落 `generation.seal 带 shots[]` 只能扩语义 create。**记录此澄清**（P1：不造并行 create 工具、不复制 planning handler）。

**2.2 seal 适配器加可选 shots 透传，reducer 不动。** store `seal(projectId, operationId, contract, shots?, planHash?, shotPrices?, now)`——payload 加 `shots/planHash/shotPrices`（reducer 已消费）。单镜调用不传 = 逐字节等同今天（回归门）。

**2.3 多镜草稿的顶层 candidate = 第一个 shot 的 candidate。** reducer seal 硬要顶层 contract.candidateId/Revision == 顶层 draft candidate（`productionRunReducer.ts:337`）。故 create 多镜时：draft 顶层 candidate 用 shots[0].candidate；seal 时顶层 contract = compile(shots[0].candidate)，shots[] 各带自己子合同。与 S4 e2e `setup` 同构（L99-101 top=shots[0].contract）。

**2.4 per-shot 子合同在 handler 内 compile+seal，不信 client 给的 contractHash。** client `plan` 入口只给逐镜 candidate 声明（prompt/model/mode/references/params/role/included），handler 用 `compileExecutionContract` 算每镜子合同 hash、planHash=stableHash(所有子合同 hash + 顺序)。防 client 伪造 hash 绕预算。

**2.5 scriptText 入口：seam 建齐 + v1 生产 planner 不接（有意裁剪）。** handler 入口、`planStoryboard` dep、镜表→shots 映射（含 role/prompt/model 继承与 defaults 兜底）**全建齐并 stub-测**（`mcpMultiShotCreateEntrance.e2e.test.ts` scriptText 用例证映射）。但**生产 LLM planner（真拟镜）v1 不接**——appIntegration 不注入 `planStoryboard`，于是给 scriptText 时返回人话错误「未启用剧本自动拟镜，请提供逐镜计划（shots）」。裁定理由：① **plan 入口是承重的真实生产路径**——全真 E2E + 付费验收都走它；② 任务自身付费验收 §4 用的就是 plan/shots 入口，不是 scriptText；③ 真 LLM 分镜 planner（prompt 设计 + 结构化抽取 shot + 逐镜选型 + 自己的 eval）是独立 mini-feature，半吊子接会破 R5「接模型前逐项对账」与 P3 质量门，硬塞进本切片= gold-plating。D4：缺口明着标（错误文案指向 plan 入口），不藏。生产 planner 作遗留（§9）。

**2.6 锚复用：项目已有同名角色锚默认复用素材（§3.1 原文）。** create 多镜时，若 shot 声明的锚 role 名在项目已有同名锚节点 → 复用其素材（references 指向既有 asset），不新建锚 shot；否则新建 role='anchor' shot（S4 调度器会先跑锚+检查点）。**v1 最小**：E2E 与付费验收用"新锚 shot"路径（调度器已验）；"复用既有素材"作数据层支持 + 单测，UI 入口不做（禁做零 UI）。

## 3. 实现分解

### A. 语义 create handler 多镜入口（`mcpGenerationTools.ts`）
1. `create` capability 分流：`params.shots`（数组）或 `params.scriptText`（字符串）存在 → 多镜路径；否则单镜（今天，字节不动）。
2. 多镜 `plan` 入口：校验 `params.shots`（≥1、每项 candidate 合法、role/included 可选、shotId 唯一或自动生成）→ 每镜 `candidateFrom` + `normalizeVideoCandidate` → 存草稿（顶层=shots[0]，其余 shots 暂存在 handler 侧待 seal）。
   - **难点**：草稿期 shots 存哪？durable plan 草稿只挂顶层 candidate。方案：create 时把 shots 声明**暂存进 operation 的一个 draft 字段**（GenerationOperation 加可选 `draftShots?`），或——更干净——**create 直接 seal**？不行，seal 前要 preview/gate。
   - **裁定**：GenerationOperation + durable plan 草稿加可选 `shots?`（草稿态，无 contract）。create 多镜写入 draft.shots（各带 candidate、role、included，无子合同）；seal 时 handler 读 draft.shots，逐镜 compile 子合同，组 sealed shots[] + planHash 传 store.seal。**store.create 需支持 shots 草稿透传** → createGenerationDraft 加可选 shots。
3. `scriptText` 入口：`deps.storyboardPlanner?(scriptText)` → 镜表 → 映射 shots[] → 同 plan 入口落草稿。planner 是新 dep（E2E stub）。
4. `gate_request` 多镜 seal：当 draft.shots 存在 → 逐镜 compile 子合同、组 sealed shots[]（included 才带子合同）+ planHash + shotPrices(从 resolveModelPricing derive) → `deps.operations.seal(..., { shots, planHash, shotPrices })`。**multiShotGateProjectionFor 已能投影**（读 operation.shots）。
5. 校验失败走结构化 code + i18n（用户可见）；内部错误人话化。

### B. durable store 适配（`productionGenerationOperationStore.ts`）
1. `create` 支持多镜：input 加可选 `shots`；policy allowedProviders/allowedModels = 所有 shots 的 provider/model 并集（单镜=今天）；透传 shots 给 createGenerationDraft。
2. `seal` 签名加 `shots?/planHash?/shotPrices?`，payload 透传（reducer 已消费）。
3. operationFromRun 已投影 shots（L19-31）——草稿态 shots（无 contract）也要投影（去掉 `plan.shots.length>0` 门里对 planHash 的依赖，草稿无 planHash）。核实草稿投影不破单镜。

### C. durable 草稿支持 shots（`productionRunRepository.ts` createGenerationDraft + reducer）
1. createGenerationDraft input 加可选 `shots`；写进 `generationPlan.shots`（草稿态：candidate+role+included，无 contract）。
2. reducer `generation.seal`：顶层 contract 匹配不变；sealedShots 从 payload（已实现）。**注**：草稿已有 shots、seal payload 也给 shots → 以 payload 为准（payload 带子合同，草稿的是无合同占位）。核实 sealGenerationShots 只认 payload。

### D. GUI-live 付费验收前置：appIntegration start 修 submitted（`appIntegration.ts`）
1. 多镜 start 分支（L423-444）：kick 调度器**前**，经 durable store 发 `generation.submit`（转 sealed→submitted），否则 batchActive 恒 false。
2. 核实单镜分支（L446 submission.start 内部转 submitted）不受影响。

### E. E2E（零额度 loopback，真入口）
- **新增 `mcpMultiShotCreateEntrance.e2e.test.ts`**（或加进 `multiShotBatchScheduler.e2e.test.ts`）：
  1. `plan` 入口全真：构造 planning handler（真 store + 真 repository + loopback provider）→ 调 create({shots:[anchor, shot1, shot2]}) → preview → gate_request（断言多镜投影 display.shots 齐 + PLAN receipt ceiling）→ gate_decide(receipt) → start → 断言调度器跑：锚→检查点→approve→2 镜→artifact。**不变量：每 Job ≤1 submit、总请求=锚数(1)+镜数(2)=3**（§5.1）。
  2. `scriptText` 入口 stub planner：断言镜表→shots 映射正确（shots 数、role、prompt）→ 同上落 seal。
  3. 断言：单镜 create（无 shots）路径逐字节等同（回归门，复用现有单镜 E2E 14 断言不动）。
- 断言数目标：plan 入口 ≥8、scriptText 入口 ≥4、submitted-fix 回归 ≥2。

### F. i18n
- 多镜 create 校验失败文案（shots 空/子合同不匹配/model 未白名单/planner 失败）走 i18n（zh-CN+en）。

## 4. APIMart 真付费验收（§5.3 / S6 plan §6，额度已授权）
1. 隔离 profile：`evals/lib/isoApp.mjs` prepareIsolation 拷真 catalog（safeStorage 同机解密）；**设 `NOMI_CAPABILITY_DIR` 指隔离目录**（防串真 Nomi 的 advert/token）。
2. 起隔离 GUI app（`tests/ux/_launchApp.mjs` isolate + 真 catalog settingsDir + `NOMI_MCP_GENERATION_SINGLE_SHOT_V1=1 ..._E1_V1=1 APIMART_E2E=1 NOMI_SPEND_OK=1`）。
3. 读隔离 capability-core advert JSON（port+token）→ `POST 127.0.0.1:port/rpc`（Bearer token，body `{method,params}`，method=nomi_* 工具名）走真入口：session_open → operation_create({shots:[anchor,shot1,shot2] 最低规格：最短时长/最低档/n=1}) → preview → request_generation_gate。
4. 付费 gate 让卡真弹 GUI（renderer 网关）；Playwright 点确认（真收据）→ decide_gate(receipt) → start。**卡截图=验收证据。** 备选：body 加 spendConfirmed:true 预批（rpcServer 2026-08-18 拍板）——首选真卡取证。
5. 等真生成完成（`nomi_subscribe_run` 事件轮询 / run 状态，**别墙钟 sleep 当完成信号**）；产物落画布 → ffprobe 验时长/编码 → 截图。
6. **S6 返工腿**（连带验 S6）：在真完成镜节点上 → 选中 → 版本条「第1/1版」→ 展开 →「重拍这镜」→ 单镜确认卡 → 确认 → 真返工出第2版 → 版本条切回旧版→再切新版。截图。
7. 记账：逐步真实请求数（断言=锚1+镜2+返工1=4）、每步价格、总花销、状态迁移表；**key 绝不进日志/报告/仓库**。体验摩擦逐步记（等待无反馈/文案看不懂/吓一跳），报告单列一节。
8. 截图全部自己 Read 亲眼看过再写结论。
9. 失败分类：401 停下报告、参数不支持→回官方 API 文档对账（R5）、超时→查 reconcile；禁 blanket retry 烧钱。

### 4.1 交付时实做记录（harness `tests/ux/p4-s6p5-multishot-paid.e2e.mjs`）
实做踩到并解决的三件事（写下来免后来人重踩）：
- **lease 拿法不是直发 HTTP**：语义 gate 确认编排（request→等卡→decide→start 一气呵成）住 stdio 层 `mcpSemanticGenerationFlow.ts`，HTTP `/rpc` 只做 raw dispatch。故 harness 用 **stdio MCP 子进程**（不是直 POST），且要：① 在 GUI 里先 `createBlankProject` 打开项目 → 它成 `openProjectId`；② stdio 子进程带**注册客户端证明** `NOMI_MCP_CLIENT=claude` + `NOMI_MCP_CLIENT_PROOF=HMAC(capToken,"nomi-mcp-client:v1:claude")`，否则 `current_project` bootstrap 拒发 lease；③ session_open 用 `bootstrap:{mode:'current_project', clientSessionNonce}` 拿 lease。
- **语义调用别传 projectId**：dispatcher 用 lease.projectId 覆盖，传了不一致的（如目录名≠workspace id）当场 `project_scope_changed`。production 读工具（get_run/get_artifact）用 lease 返回的 projectId。
- **operationId 服务端生成**：`nomi_operation_create` 工具 schema 不收 operationId → 服务端发 UUID；后续 preview/gate/get_run 全用 create 返回的 operationId（预挑一个传进去会「Run not found」）。
- **零额度干跑已 9 断言全绿**（`S6P5_DRY_RUN_NO_SPEND=1`）：真语义入口 create({shots})→preview→request_gate 把**真多镜卡弹到 live GUI**，卡显「2 镜 / apimart Seedance 2.0（text_to_video）/ 术语人话（无封存物化合同）/ 固定 footer / 倒计时」（截图 `01-multishot-confirm-card.png` / `00-gate-pending-state.png` 亲验）。证明 create 双入口经真 GUI RPC 全链通——付费前的链路确证。
- **观察到的卡显示摩擦**（S2/S3a 存量、非本切片）：卡上「总时长 未知 / 画幅 未知」即使 shot 传了 duration=4/size=16:9 仍显未知；「价未知 / ¥0」因真 catalog 未给 apimart per-model pricing。记为摩擦。

## 5. 回归（全保持）
- 单镜 E2E 14/14、S3a、elicitation、S4 批次、S5 走查、S6 J2 返工 + 版本条走查。
- 单镜 create/seal 路径字节不动；appIntegration 单镜 start 分支不动。

## 6. 门禁
`check:filesize`→`check:tokens`→`check:i18n`→`check:heavy-path`→`check:test-waits`→`check:walkthroughs`→`check:test-types`→`lint:ci`→`typecheck`→`test`→`build`（`pnpm run gates`），真退出码（**别管道接 test/build**）。

## 7. 禁做
UI（零 UI 切片，无样张）、S7 legacy 收敛、配音、插镜命令层（§10 遗留）、新 orchestration runtime（不引 LangGraph 等）。除已有 S6 版本条/占位控件外不加新常驻控件。

## 8. 回滚
关 `NOMI_MCP_GENERATION_SINGLE_SHOT_V1` 即回（多镜 create 在语义面之下）；单 PR 可回滚；单镜/legacy 零触及。

## 8.5 付费验收发现的连带 gap（锚检查点无生产审批入口）

实做付费验收时实查发现：**anchor_checkpoint 门在生产没有任何审批入口**——① `production.decide-gate`（`nomi_decide_gate`）显式只放行 creative 门（`dispatcher.ts:378-380` `gate.scope==='stage'` 且 gateId 前缀 direction/sample/freeze），anchor_checkpoint（scope='anchor_checkpoint'）被硬拒「必须回 Nomi 决定」；② appIntegration 的 scheduler 不设 `anchorAutoReleaseMs`（生产不自动放行）；③ 渲染层无「定妆照检查点」审批 UI（S4 建了门、S5 落了占位，但审批卡未接）。→ 带锚的多镜批次一走到检查点就**停死无路可走**（测试靠 `repository.execute` 直发 gate.decide 或 `anchorAutoReleaseMs` 绕过，掩盖了这个 UI/入口缺口）。

**裁定**：这是 S4/S5 的连带 gap，**修全要么加 MCP 审批工具+scheduler 重踢、要么加渲染层检查点卡（后者是 UI，本切片禁做）**——超出「create 入口」范围。故：① **付费验收改用 2 视频镜（无锚）**跑主证（create 入口→真花钱→真 APIMart 生成→落地→返工，检查点不在链上）；② 检查点审批入口作**发现的 issue** 上报 + spawn 后续任务。带锚的 create 入口逻辑本身已由零额度 E2E 全证（含锚检查点→approve→镜批，`mcpMultiShotCreateEntrance.e2e.test.ts` 用测试 gate.decide approve 检查点）。

## 9. 遗留（交付时更新）
- **scriptText 生产 LLM planner 不接（v1 有意裁剪，见 §2.5）**：seam + 映射建齐并 stub-测；appIntegration 不注入 `planStoryboard` → scriptText 返回人话错误指向 plan 入口。真 planner（LLM 拟镜 + 结构化抽取 + 逐镜选型 + eval）作独立后续切片。
- 锚"复用既有同名素材"入口不做（§3.1 显式入口留后续）；本切片锚=新 role='anchor' shot（调度器已验先跑锚+检查点）。
- 插镜命令层不做（continuity plan §10 遗留，durable 无追加 shot 命令；滚 S7）。
