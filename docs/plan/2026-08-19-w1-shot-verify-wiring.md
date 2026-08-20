# W1 · 审片环接进 MCP/对话生成路径：实现方案（2026-08-19）

> 探明对象：蓝图 `docs/plan/2026-08-19-dialogue-draft-quality-blueprint.md` §三 W1。
> 验收对象：`docs/plan/2026-08-19-experience-acceptance-harness.md` 幕 5b/6 断言。
> 现状依据：`docs/research/2026-08-19-nomi-draft-capability-inventory.md`（shotVerify 已建、只挂 `batchPlanPreview.ts:170-178`，MCP/production run 零引用——本文件复核**属实**：`grep -rln 'shotVerify' electron/` 空集）。
>
> 本文件只做侦察 + 方案，不改任何代码。所有结论带 file:line。

---

## 0. 一图看清两条生成路径（W1 要接的是它们）

```
路径①  nomi_generate（MCP 直接单镜生成）
  mcpProtocol.tools/call('nomi_generate')            electron/capabilityCore/mcpProtocol.ts:414-452
    → transport.invoke('generate', built, {spendConfirmed})
    → mcpStdioServer.invoke                            mcpStdioServer.ts:108-124
        GUI 开着 → callViaRpc → rpcServer → dispatchAndEnrich
        GUI 关着 → dispatchAndEnrich(磁盘/confirmed 网关)  mcpResultEnrichLive.ts:72-80
    → dispatch('generate')                             dispatcher.ts:253-254
    → core.generateOnProject                           core.ts:264-400   ★单镜生成落点
    → enrichResultForMethod('generate')  (缩略图/预览链)  mcpResultEnrichLive.ts:37-58
    → buildToolResultPayload → buildToolOutcome        mcpToolResults.ts:465-497  ★结果文案/结构

路径②  production run playbook（nomi_start_playbook 编排）
  driveGeneration 逐 job                              productionRunDriverOps.ts:219-348
    → requestRenderer('production.generate-node')      ops.ts:261（**走渲染层生成**，非 core.ts）
    → 落 artifact.add（adopted）                        ops.ts:281-284
    → 'qa' stage 目前只 markComplete（**空 QA 段**）     ops.ts:328  ★playbook 的天然审片落点
```

**关键差异**：路径①在**主进程 core.ts** 生成；路径②在**渲染层**生成（driver 只发 `production.generate-node` IPC）。这决定了「共享编排」怎么收（见 §8）。

---

## 1. shotVerify 的家底（Q1）

| 文件 | 路径 | 性质 | 依赖 |
|---|---|---|---|
| `shotVerify.ts` | `src/workbench/generationCanvas/agent/shotVerify.ts` | **纯函数**（组 prompt / 解析判决 / 判偏差） | 唯一 import：`import type { ReconcileDeviation } from './reconcile'`（**type-only**） |
| `shotVerifyRunner.ts` | 同目录 | 纯编排（DI，可裸测） | type-only `./reconcile` + 值 import `./shotVerify` |
| `shotVerifyJudge.ts` | 同目录 | **重渲染层接线** | `desktop/bridge`、`workbenchAiClient`、`desktopClient`、`assistantModelPref`、`windowUrlParam` —— electron 主进程**都够不到** |
| `gatherShotVerifyInputs.ts` | 同目录 | 纯函数（画布 node/edge → 入参） | `generationCanvasTypes`、`generationNodeKinds`（src 类型） |
| `shotVerifyStore.ts` | 同目录 | zustand + 编排入口 `verifyShotsAndReport` | 动态 import 上述 + 画布 store |

**导出签名（要复用的核）**：
- `shotVerify.ts`：`SHOT_VERIFY_DIMENSIONS`、`SHOT_VERIFY_PASS_THRESHOLD=3`、`activeDimensions(ctx)`、`normalizeShotScore(score)`、`buildShotVerifyPrompt(ctx: ShotVerifyContext): string`、`parseShotVerifyVerdict(text): {scores, reason}`、`deviationsFromVerdict(ctx, verdict): ShotContentDeviation[]`、`contentDeviationsToReconcile(...)`。类型 `ShotVerifyContext`、`ShotVerifyDimensionKey='identity'|'composition'|'continuity'`。
- `shotVerifyRunner.ts`：`verifyGeneratedShots(shots, deps): Promise<ReconcileDeviation[]>`、类型 `ShotVerifyInput`、`ShotVerifyDeps={extractFrame, judge, visionAvailable}`。

**能不能被 electron 主进程 import？——不能，且这是 rootDir 硬限制**：`electron/tsconfig.json` `rootDir: "."`，`include: ["**/*.ts"]`——electron production 代码反向 import `src/` 会越 rootDir 编译失败（盘点第 25 行提示的先例已在仓内验证：`electron/capabilityCore/nodeKindDomain.ts:1-9` 明写「单一真相源在 src，但 electron production 反向 import 不了 src」）。

**结论：判分「纯逻辑核」必须以 electron 侧为准，用 nodeKindDomain 的「纯镜像 + equivalence.test 钉同构」先例复用**。

### 方案 1A：把纯核搬进 electron，src 侧改成 re-export（P1，无并行版）

`shotVerify.ts` 只依赖 `type ReconcileDeviation`（一个字段结构，不是运行时值），迁移代价极低：

1. 新建 `electron/capabilityCore/shotVerifyCore.ts` = `src/.../shotVerify.ts` 的**逐字搬迁**（组 prompt / 解析 / 判偏差），把 `ReconcileDeviation` 的 `kind/shotNodeId/where/field/expected/actual/reason` 就地内联成本文件的 `ContentDeviation` 类型（不 import src）。**这是新的单一真相源**。
2. `src/.../shotVerify.ts` 改为**从 electron 侧 re-export**——但 src 同样 import 不了 electron（正反都被 rootDir 挡）。故采用 nodeKindDomain 的**镜像 + equivalence 守恒**而非物理 re-export：
   - electron 侧 `shotVerifyCore.ts` 持权威核；
   - src 侧 `shotVerify.ts` 保留（渲染层用），但新增 `shotVerify.equivalence.test.ts`（vitest 可同时 import 两侧）钉死：`SHOT_VERIFY_DIMENSIONS` 逐项 `===`、`SHOT_VERIFY_PASS_THRESHOLD` 相等、`buildShotVerifyPrompt` 对同一批 fixture ctx 产出**逐字节相同**的 prompt、`parseShotVerifyVerdict` 对同一批脏输入解析结果相同。任一侧漂移即红。
   - 这是本仓既定模式：`electron/capabilityCore/nodeKindDomain.equivalence.test.ts:27-78` 就是这么钉 `NODE_KIND_DEFAULT_SIZE` 等 `=== src registry`。

> 备选（**不推荐**）：把 prompt/解析核抽到一个既不属 src 也不属 electron 的 `shared/` 顶层目录双向 include。经查本仓无此惯例（无 `shared/` include 在两个 tsconfig），引入它=造第三真相源目录，比镜像+equivalence 重。**按仓内先例走镜像。**

---

## 2. VLM 判分通道（Q2）

### 渲染层现状
`shotVerifyJudge.ts:31-51`：judge = `sendWorkbenchAiMessage({ mode:'chat', attachments:[{url:frameImageUrl, kind:'image'}], agentModelKey/agentVendorKey: getAssistantModelPref() })`。即走**创作助手的多模态 chat 链路**，判分模型 = 用户设的 assistant 偏好（`getAssistantModelPref()`）。

### 主进程/headless 等价通道——**已存在，且天然免费**
- `runTask`（`electron/runtime.ts:368`）对 `kind:'image_to_prompt'`（或 `chat`）→ `billingKindForTaskKind` 归到 `'text'`（`electron/catalog/types.ts:432`：`chat/prompt_refine/image_to_prompt → 'text'`）。
- 文本分支在 `runtime.ts:461` `if (wantedKind === "text") return executeTextTask(...)` —— **在这一行之前没有任何 `assertAndConsumeSpendGrant`**（grant 只在 image/video/audio 路 `runtime.ts:393/407/474` 消费）。
- `executeTextTask`（`electron/textTaskRunner.ts:16-42`）：`kind:'image_to_prompt'` 时取 `firstReferenceImage(request)` 作 `imageUrl` → `streamTextTask`。
- `streamTextTask`（`electron/ai/streamTextTask.ts:59-130`）：`imageUrl` 存在 → 组多模态 message `[{type:'text',text}, {type:'image',image}]`（line 66-67），走 AI SDK `streamText`，返回 `raw:{choices:[{message:{content:text}}]}`（line 126）。http(s) URL 走 URL 引用、data:/nomi-local 原样字符串（line 39-48）。

**判分模型选谁（headless 没有 assistant pref）**：`resolveOnboardingAgentFromCatalog()`（`electron/catalog/catalogStore.ts:286-310`）= 取 catalog 里**第一个 enabled 且有可用 key 的 `kind:'text'` 模型**。这是 headless「语言大脑」的既定单一入口（onboarding/评测都用它）。W1 判分复用它，不新造选择器（P4/P1）。

**判分花不花额度、走哪个 key**：
- **不花生成额度**——文本路在 grant 校验之前返回，`assertAndConsumeSpendGrant` 根本没被调（`runtime.ts:461` 早于 `:474`）。这与渲染层「judge 走 chat、不过付费闸」语义**一致**。
- 走的是**该 text 模型 vendor 的 API key**（`resolveOnboardingAgentFromCatalog` 解出的 `apiKey`）。即判分消耗的是「语言大脑」那次 chat token（真实成本存在但不进 spendGrant 预算，也不弹付费卡）。
- 诚实标注（写进蓝图/harness）：**判分的 token 成本不在确认闸披露的「生成预算」内**，但它只是一次小 chat（k=2 → 每镜 ≤2 次判分调用），量级远小于重试一次视频。

> 视觉可用性降级：非多模态 text 模型 → judge 返回非 JSON → `parseShotVerifyVerdict` 抛错 → runner 逐镜 catch 跳过（`shotVerifyRunner.ts:72-77`）。`visionAvailable()` 在 headless 恒 true（同渲染层策略），靠逐镜 try/catch 优雅降级。**若 catalog 无任何 text 模型 → `resolveOnboardingAgentFromCatalog` 返回 null → 整体跳过判分（仅生成、不审片），不报错。**

---

## 3. 插桩点推荐（Q3）

### 候选与评估

| 候选 | 位置 | 判 |
|---|---|---|
| A. `core.generateOnProject` 成功后 | `core.ts:394` 落结果之后 | ❌ 领域逻辑（判分/重试编排）塞进「单镜生成执行口」，会把 core.ts 从 400 行推向臃肿；且 core 是**传输无关执行核**，审片重试属**编排策略**，不该住这。且**只覆盖路径①**，路径②（production run 走渲染层）吃不到。 |
| B. `dispatchAndEnrich` 包装层 | `mcpResultEnrichLive.ts:72-80` | ❌ 该层职责是「dispatch 后恰好一次富化缩略图」，是结构收口点，塞判分重试会污染它单一职责；且它拿不到「重试要重发 generate」的语义（重试=再调 dispatch，会递归）。 |
| C. `runTask` 内部 | `runtime.ts` | ❌ runTask 是 vendor 出口硬闸所在，最不该加编排；且判分本身要再调 runTask（judge），自引用。 |
| **D（推荐）. 新建 `shotVerifyOrchestrator`（electron 纯编排），由 `generateOnProject` 生成成功后调用一次** | 新模块 `electron/capabilityCore/shotVerifyOrchestrate.ts` | ✅ 见下 |

### 推荐 D：新编排模块 + core 里一个薄 hook

**分层**（严格照「领域逻辑不进传输层、单文件 ≤800」）：

```
electron/capabilityCore/
  shotVerifyCore.ts          §1 迁来的纯核（组 prompt/解析/判偏差），~140 行  ← 单一真相源
  shotVerifyOrchestrate.ts   新：判分→不过→定向重试→标注 的纯编排（DI），~120 行
  shotVerifyDeps.ts          新：judge/extractFrame 的 electron 真实接线（薄），~60 行
```

- `shotVerifyOrchestrate.ts` 导出 `verifyAndMaybeRetry(input, deps): Promise<ShotVerifyOutcome>`：
  - 入参：镜头节点快照（id/title/prompt/锚描述/前镜/产物 url/isVideo）+ 重试预算 K + k（选优）+ retryPrompt 模板；
  - deps 注入：`judge(prompt, imageUrl)`（走 §2 的 `runTask({kind:'image_to_prompt'})`）、`extractFrame(videoUrl)`（复用主进程抽帧，见下）、`regenerate(node, retryDirective)`（回调**同一个 grant/同一节点**再发 vendor，见 §4）、`visionAvailable()`；
  - 返回 `ShotVerifyOutcome { verdict, passed:boolean, retries:number, finalDeviations, redFlagged:boolean }` —— 供 §7 塞进结果。
  - **纯编排、可裸 node 单测**（judge/regenerate 全注入桩）。
- `core.generateOnProject` 末尾（`core.ts:394-399` 之间，落结果后、return 前）加一个**可选** hook：
  ```
  input.verifyDeps?  →  const outcome = await verifyAndMaybeRetry(...)
                        把 outcome 挂到返回对象（core 不认识判分细节，只透传 outcome 对象）
  ```
  core 只多 ~15 行「若提供了 verifyDeps 就调一次并把 outcome 挂上」，判分/重试细节全在 orchestrate 模块。**默认不传 verifyDeps = 行为逐字节不变**（batchPlanPreview 现有渲染层路径、纯 CLI 评测路径都不受影响）。

**谁注入 verifyDeps**：`dispatcher.ts` 的 `'generate'` case（`:253`）从 `DispatchContext` 取一个新的可选 `makeVerifyDeps`，由 `mcpStdioServer.invoke`（`:116-124`）和 `rpcServer` 注入真实实现（judge=runTask chat、extractFrame=主进程抽帧、regenerate=回调 core 的内部再生成）。**这样领域策略住 orchestrate、传输层只注入 deps、core 只透传**——三层干净。

**抽帧（视频镜首帧）**：渲染层 judge 用 `getDesktopBridge().video.extractFrame`（`shotVerifyJudge.ts:23-30`）。主进程侧需等价能力。经查主进程已有抽帧基建（`production.generate-node` 下游/`localizedAsset.probeLocalizedDurationSeconds` 同域有 ffmpeg 接线）——**待落地时确认主进程 ffmpeg 抽帧函数的确切导出**（本轮未逐行钉到函数名，列为实现前一步的 R5「读官方/读现有代码」小验证；若主进程无现成抽帧，图片镜先接、视频镜首帧 fallback 用 providerUrl 或 poster，与渲染层「视频镜 extractFrame 失败→跳过」同策略降级，不阻断）。

### production run 路径②的对称落点
路径②生成在渲染层（`ops.ts:261` `production.generate-node`）。**最省的收敛**：production 的 `'qa'` stage（`ops.ts:328` 现为空 `markComplete`）里，driver 发一个新 IPC `production.verify-shots` 给**渲染层**，渲染层直接复用**现成的 `verifyShotsAndReport`**（`shotVerifyStore.ts:90`）——路径②天然吃回渲染层那套原生实现，零重复。W1 先把路径①（`nomi_generate`）做实做全（harness 幕 5b/6 就是路径①），路径②的 qa-stage 接线作为 W1 的第 2 小步（同一 orchestrate 语义，渲染层复用现成 store）。

---

## 4. 重试的钱：落在同一颗 grant 预算内吗（Q4）

**结论：能，天然落在同一颗 grant 的同一节点预算内，且会话信任下重试不再问人。三处证据：**

1. **grant 按 nodeId 计次，默认 3 次覆盖「1 首发 + 2 重试」**：
   `spendGrant.ts:17-22` grant 结构 `nodeBudgets: Map<nodeId, 剩余次数>`；`:27-28` `DEFAULT_MAX_ATTEMPTS_PER_NODE = 3`，注释明写「1 次首发 + 最多 2 次自动重试」；`assertAndConsumeSpendGrant(grantId, nodeId)`（`:79-102`）**按 nodeId 扣减**——只要重试**重发的是同一个 node id**，就从这颗 grant 的同一 node 预算里扣，扣到 0 拒发。K≤2 重试正好卡在 3 的预算内。

2. **headless `makeConfirmedGateway` 铸的 grant 覆盖几次**：
   `gateway.withPreApprovedSpend`（`gateway.ts:86-93`）`confirmSpend: () => mintSpendGrant({ nodeIds:[info.nodeId] })` —— **没传 `maxAttemptsPerNode`**，故吃默认 3（`spendGrant.ts:53`）。渲染层网关同理（`gateway.ts:170` `mintSpendGrant({nodeIds:[info.nodeId]})`）。**即当前每颗 grant 已经天然给单节点 3 次预算**，重试无需改 grant。

   ⚠️ **但有一个真实约束**：`core.generateOnProject` **每次调用 mint 一颗新 grant**（`core.ts:307` `gateway.confirmSpend`）。W1 的重试若设计成「orchestrate 回调 `regenerate` → 再走一遍 `generateOnProject`」，会 mint **第二颗** grant（又是 3 次）——预算不会「超发」（每次都是合法的真人/信任授权），但**这不叫「同一颗 grant 内重试」**。要让重试真正落在**同一颗 grant**，`regenerate` 回调必须**复用首发那次的 grantId + 同 nodeId 再调 `runTask`**，不再走 `confirmSpend`。这要求把首发的 `grantId` 从 `generateOnProject` 内部透出给 orchestrate（core 已有 `grantId`，`core.ts:307`）。**推荐做法**：`generateOnProject` 把 `grantId` 一并交给 orchestrate 的 `regenerate` deps，重试 = 直接 `runTaskFn({vendor, request:{...同 nodeId, extras:{grantId}}})`，吃同一颗 grant 的剩余 2 次。这样 K≤2 严格受 grant 硬闸封顶——**跑飞的 agent 循环也超不过 3 次/节点**（红队不变量不破）。

3. **会话信任路径下重试不再问人**：
   `mcpProtocol.ts:418-422`：`spendTrust.isTrusted(projectId)` → `countPass` + `invoke(..., {spendConfirmed:true})`，**不弹 elicitation**。会话信任是「本会话该项目免逐次问」（`mcpSpendTrust.ts:20` 上限 20 次），而 W1 重试发生在**单次 `nomi_generate` 调用内部**（orchestrate 复用 grantId 直发 runTask），**根本不经过 mcpProtocol 的 per-call 询问**——连 `countPass` 都不触发（那是 tool-call 级的）。故重试对人**完全无感**，无论是否会话信任。信任只影响「首发那一次要不要问」，重试在 grant 硬闸内自动跑。

**一句话**：`maxAttemptsPerNode=3` 是为重试量身定的封顶；只要重试复用**首发 grantId + 同 nodeId** 直发 runTask，就天然落在同一颗 grant、K≤2、不问人、不超发。**spendGrant.ts 一字不用动**（见 §9 不动项）。

---

## 5. L2 stub 判分的干净注入法（Q5）

两条路评估：

### (a) 判分模型走 model catalog（isolated catalog 配 `nomi-mock` 判分模型 + mock server 返回判分 JSON）——**推荐**

**为什么可行且干净**：§2 已证 headless judge = `resolveOnboardingAgentFromCatalog()` 选**第一个 enabled 有 key 的 `kind:'text'` 模型** → `streamTextTask` → AI SDK POST `/v1/chat/completions`。当前 `writeIsolatedCatalog`（`tests/ux/_mcpJourney.mjs:156-182`）**只配了 image/video mock 模型，没有 text 模型**——所以判分在 L2 现在根本起不来。补两处即可让判分在**真 stdio server + 零额度**下返回可控低分：

1. **扩 `writeIsolatedCatalog`**：加一个 `nomi-mock` vendor 下的 text 模型
   ```
   { modelKey:'nomi-mock-judge', vendorKey:'nomi-mock', kind:'text', enabled:true, ... }
   ```
   （`nomi-mock` vendor 已是 `authType:'none'` → keyStatus ok，`_mcpJourney.mjs:162-165`，天然可执行、免 key。）
2. **扩 `startMockVendorServer`**（`_mcpJourney.mjs:65-93`）：加 `/v1/chat/completions` 处理，**按请求 SSE 流**返回判分 JSON（AI SDK 默认 `stream:true`）。复用仓内既有 SSE mock 形状（`local-gateway-onboarding.walk.mjs:68-77`：`text/event-stream` + `data:{...delta...}` 帧 + `data:[DONE]`）。**可控低分**：mock 读 `body.messages` 里的 prompt/图，**按镜头 prompt 里的约定标记路由**——例如 harness 给「坏镜」的 prompt 埋一个不可见约定串（如 shot title `#BAD` 或 prompt 含特定 token），mock 命中就返回 `{"scores":{"identity":1,...},"reason":"注入的坏判分"}`，否则返回全 5 档。判分低于阈值 → orchestrate 触发重试 → harness 断言「注入坏判分镜头 100% 走重试」（幕 5b）。

**这条路为什么合铁律（P1，不许环境变量逃生口）**：生产路径**没有任何分叉**——生产/L2 都走同一个 `resolveOnboardingAgentFromCatalog → streamTextTask → /v1/chat/completions`。L2 唯一的不同是**catalog 里那个 text 模型指向 mock server**（数据隔离，`NOMI_SETTINGS_DIR` 沙箱），代码路径逐字节相同。没有 `if (test) return fakeScore`，没有 env 开关判分行为。判分模型是谁、判分怎么调，**生产和 L2 是同一份代码**；变的只是 catalog 数据 + mock 端点行为——这正是 `writeIsolatedCatalog` 现有的隔离哲学（`_mcpJourney.mjs:149-155` 注释：ISOLATED synthetic catalog）。

### (b) judge 依赖注入参数——**不推荐作为 L2 主路**

把 orchestrate 的 `judge` deps 在测试里换成返回固定 JSON 的桩，能让 orchestrate 单测（L1）可控——**这条本来就要有**（orchestrate 纯编排的裸测靠注入 judge 桩，§6/§8）。但**不能拿它当 L2 旅程验收**：L2 的价值是「真 stdio server 端到端」（`draft-journey.e2e.mjs:11` 明写「传输=真 in-Electron MCP stdio server」），judge deps 是主进程内部注入点，跨不过 stdio 边界——测试进程注入不进子进程的 core。**故 (b) 服务 L1 机制层，(a) 服务 L2 旅程层，两者不冲突、各司其职**（正是 harness §一 三层金字塔的 L1/L2 分工）。

**推荐：L1 用 (b) 桩注入验 orchestrate 分支矩阵；L2 用 (a) mock-catalog-judge 验端到端重试真被走到。生产路径固定真判分（真 text 模型），零逃生口。**

---

## 6. 定向重试 prompt 的落位（Q6）

ViMax「保背景换角色」重试指令（`docs/research/2026-08-19-script-to-video-frameworks.md §3.5` 原文）+ 判分 rubric prompt 应住**electron 侧纯逻辑模块**：

- rubric prompt 已在 `shotVerifyCore.ts`（§1 迁来）的 `buildShotVerifyPrompt` 里——**不新造**，迁移即得。
- 定向重试指令模板 → 放进 `shotVerifyOrchestrate.ts` 的一个纯函数 `buildRetryDirective(deviations, shotCtx): string`（读判分出的偏差轴 → 拼「保持背景/构图/光线不变，仅修正 <身份/构图> 到与锚一致」的 directive，供 `regenerate` 拼进重发 prompt）。纯函数、可单测（给定 deviations 断言 directive 文本含关键约束、不含角色名污染——顺带对齐 W4 的污染词铁律）。
- **两者都在 electron/capabilityCore，纯逻辑、零 electron import，可裸 node 单测**（同 shotVerifyCore 边界）。

---

## 7. 交付标注的形状（Q7）

生成结果经 `buildToolOutcome`（`mcpToolResults.ts:214`）的 `nomi_generate` 分支（`:465-497`）出去，其 `outcome.kind:'generation'`（`:490-495`）就是**扩点**。

**扩 `structuredContent.nomiOutcome`（`ToolOutcome.outcome`，`mcpToolResults.ts:145-149`）**——在 generation outcome 里加审片字段：
```
outcome: {
  kind:'generation', projectId, params, nextActions, openInNomi,
  // 新增：
  verify: {
    passed: boolean,                 // 三轴均 ≥3.5(shotVerify 口径)
    retries: number,                 // 实际重试次数
    scores: { identity, composition, continuity },  // 1-5 档
    flagged: Array<{ dimension, score, reason }>,    // 红标：仍不达标的轴
    suggestion: string | null,       // 「建议重滚 #N」类
  }
}
```
模型据此稳定读「过检数/红标/建议」（harness 幕 6：结果结构含 passed/flagged/建议/深链），不必从文本抠。

**文本文案（R15 两语言）**：在 `nomi_generate` 文本段（`:482-487`）追加审片行，用**本文件既有的 `L(ctx, zh, en)` 内联双语 helper**（`mcpToolResults.ts:15`）——本仓 MCP 结果文案就是内联双语、不走 i18n key（`electron/i18n.ts` 是另一套 desktopT，MCP outcome 一律 `L()`）。示例：
```
L(ctx, '审片：通过', 'Review: passed')                                  // passed 且 retries=0
L(ctx, `审片：重试 ${n} 次后通过`, `Review: passed after ${n} retr${...}`)  // passed 且 retries>0
L(ctx, `⚠️ #${idx} 身份相似度第 ${s} 档，低于阈值，建议重滚`, `⚠️ #${idx} identity scored ${s}/5, below bar — consider re-rolling`)  // flagged
```
诚实标注不达标镜头（蓝图 D4）：红标进文本 + 结构化 `flagged`，不藏。

**数据从哪来**：§3 的 `verifyAndMaybeRetry` 返回 `ShotVerifyOutcome` → core 透传挂到 generate 返回对象 → `buildToolOutcome` 读它填上述字段。`buildToolOutcome` 是纯函数、已有 `mcpToolResults.test.ts` 覆盖，加字段直接补测。

---

## 8. 实现任务拆解（文件 × 改动 × 新测 × 先红后绿）

| # | 文件 | 改动 | 新增测试 | 先红怎么证 |
|---|---|---|---|---|
| T1 | **新** `electron/capabilityCore/shotVerifyCore.ts` | 从 `src/.../shotVerify.ts` 逐字迁纯核（prompt/解析/判偏差），`ReconcileDeviation` 内联 | — | — |
| T2 | **新** `src/.../shotVerify.equivalence.test.ts` | 钉 electron 核 === src 核（维度/阈值/prompt 逐字节/解析同结果） | 该测本身 | 故意把 electron 核某维度 anchor 改一字 → 测红（守恒生效） |
| T3 | **新** `electron/capabilityCore/shotVerifyOrchestrate.ts` | `verifyAndMaybeRetry(input, deps)` + `buildRetryDirective`（纯编排+纯函数，DI） | `shotVerifyOrchestrate.test.ts`：judge 桩返回低分→断言触发 regenerate、K≤2 封顶、仍败标 red、首镜不评 continuity；directive 含「保背景」不含角色名 | 桩注入 judge=低分，断言「regenerate 被调 ≤2 次且 outcome.flagged 非空」——**当前无此模块，测不存在即红** |
| T4 | **新** `electron/capabilityCore/shotVerifyDeps.ts` | judge=`runTask({kind:'image_to_prompt', extras:{referenceImages:[frameUrl], modelKey: resolveOnboardingAgentFromCatalog().modelId, ...}})`；extractFrame=主进程抽帧（待钉函数）；regenerate=复用首发 grantId+同 nodeId 直发 runTask | 接线薄，靠 T6 端到端覆盖 | — |
| T5 | `electron/capabilityCore/core.ts` | `generateOnProject` 末尾（`:394` 后）加可选 hook：有 `verifyDeps` 就调 `verifyAndMaybeRetry` 并把 outcome 挂返回；透出首发 grantId 给 regenerate。默认不传=行为不变 | `core.test.ts` 加：不传 verifyDeps → 逐字节同旧返回（回归）；传桩 verifyDeps → 返回带 verify outcome | 加断言「返回对象含 verify 字段」在旧 core 下红（字段不存在） |
| T6 | `electron/capabilityCore/dispatcher.ts` + `mcpStdioServer.ts` + `rpcServer.ts` | `DispatchContext` 加可选 `makeVerifyDeps`；`'generate'` case 注入；两个 transport 提供真实 deps（headless=T4，GUI-RPC 复用同一 T4 或渲染层现成 store） | — | — |
| T7 | `electron/capabilityCore/mcpToolResults.ts` | `buildToolOutcome` generation 分支加 `outcome.verify` + 文本审片行（`L()` 双语） | `mcpToolResults.test.ts` 加：给带 verify 的 result → outcome.verify.passed/flagged 正确、文本含审片行两语言 | 断言 outcome 含 verify 在旧代码红 |
| T8 | `tests/ux/_mcpJourney.mjs` | `writeIsolatedCatalog` 加 `nomi-mock-judge`（kind:text）；`startMockVendorServer` 加 `/v1/chat/completions` SSE，按 prompt 标记返回可控判分 JSON | 该 helper 被 T9 消费 | — |
| T9 | `tests/ux/draft-journey.e2e.mjs` | 幕 5b/6 从 `pending` 转真断言：注入 1 坏镜（prompt 埋标记）→ 断言判分低→重试被走到→交付 outcome.verify.flagged 有红标、深链齐 | 幕 5b/6 断言 | **先红后绿铁律**（harness §五）：先在**旧 electron 构建**下跑 T9 → 判分环未接、outcome 无 verify → 断言红；接上后转绿。stash/开关法证「旧代码下该断言红」 |
| T10 | production run 路径② | driver `qa` stage（`ops.ts:328`）发 `production.verify-shots` IPC → 渲染层复用 `verifyShotsAndReport` | `production-mcp-journey.e2e.mjs` 加 qa 判分断言（可 W1 第 2 小步） | qa 现为空 markComplete，加「qa 后有判分事件」断言在旧代码红 |

**先红后绿总策**（harness §五 + §一 L1/L2 分工）：
- L1（T3/T5/T7）：judge 桩注入低分，断言重试分支/outcome 字段——**模块/字段不存在即红**，实现后绿。
- L2（T9）：真 stdio + mock-catalog-judge（T8）返回坏镜低分，断言「注入坏判分镜头 100% 走重试 + 交付带红标」——**在旧 electron 构建（判分未接 MCP）下跑必红**（`draft-journey.e2e.mjs:145` 现在就是 pending 明写「shotVerify 未接 MCP 路径，不假测」），接上后 pending→pass。

---

## 9. 分层设计 + ≤800 行保证

- 新模块 4 个，全在 `electron/capabilityCore/`，各自单一职责、都 <200 行：`shotVerifyCore.ts`(~140) / `shotVerifyOrchestrate.ts`(~120) / `shotVerifyDeps.ts`(~60) / directive 并入 orchestrate。
- 触碰的现有文件增量都小：`core.ts` +~15（400→~415）、`mcpToolResults.ts` +~30（544→~574）、`dispatcher.ts` +~5、`runtime.ts` **0**（judge 复用现成 text 路，不改 runtime）。全部**远低于 800**。
- **领域逻辑不进传输层**：判分/重试策略住 `shotVerifyOrchestrate`（纯）；传输层（dispatcher/stdioServer/rpcServer）只**注入 deps**；core 只**透传 outcome**、不认识判分语义；runtime 完全不碰。三层边界干净。
- **纯核 + 薄接线**惯例（同 `mcpResultEnrich`(纯) / `mcpResultEnrichLive`(接线)、`shotVerify`(纯) / `shotVerifyJudge`(接线)）：core/orchestrate 纯、deps 薄接线。

---

## 10. 风险与不动项

**硬不动**：
- `electron/spendGrant.ts` **一字不动**（§4 已证 `maxAttemptsPerNode=3` 天然够重试；重试复用首发 grantId+同 nodeId 即落预算内）。红队不变量（令牌只主进程铸、`assertAndConsumeSpendGrant` 逐次硬校验、按 node 计次封顶）全部保持。
- `batchPlanPreview.ts:170-178` 现有渲染层判分路径**行为不变**——W1 走的是 electron 侧新核 + equivalence 守恒，src 侧 `shotVerify.ts` / `shotVerifyStore.ts` / `verifyShotsAndReport` 保留原样继续服务手动画布路径。

**P1 收敛方案（两条路径可收敛成一份共享判分编排吗）**：
- **判分「纯核」收敛为一份**（`shotVerifyCore.ts` 单一真相源 + equivalence 钉 src 镜像）——组 prompt/解析/判偏差全站唯一实现，杜绝并行版。✅
- **判分「编排」半收敛**：路径①（`nomi_generate`）用 electron 侧 `shotVerifyOrchestrate`（主进程生成 → 主进程判分）；路径②（production run）生成在渲染层，**直接复用渲染层现成 `verifyShotsAndReport`**（不在主进程重造）。两条编排**共用同一纯核**（buildShotVerifyPrompt/parse/deviations），差别只在「谁调 judge/谁抽帧」这层接线——这是**由生成发生在哪进程决定的、不可消除的接线差异**，不是并行的业务逻辑。故**核 100% 收敛、接线按进程边界各接一处**，符合 P1（无第二份判分逻辑），不是并行版。
- 判分模型选择收敛为一份：渲染层 `getAssistantModelPref()` / headless `resolveOnboardingAgentFromCatalog()` —— 这两个是各自环境的既定「语言大脑」入口，本就该分（渲染层有用户偏好、headless 无），不属重复。

**风险点（实现前要小验证）**：
1. **主进程视频抽帧函数**：本轮未逐行钉到 electron 主进程「视频→首帧 image url」的确切导出（渲染层用 `desktopBridge.video.extractFrame`）。实现前一步先 grep 确认主进程 ffmpeg 抽帧接线；若无，图片镜先接、视频镜首帧降级用 poster/providerUrl 或跳过（与渲染层「extractFrame 失败→跳过该镜」同策略，不阻断生成）。R5 小验证。
2. **AI SDK stream mock 形状**：`streamTextTask` 走 AI SDK `streamText`，mock `/v1/chat/completions` 必须回 SSE（`body.stream` 时）——已在 `local-gateway-onboarding.walk.mjs:68-77` 有可复用形状，照抄即可，但要确认 AI SDK openai-compatible provider 对 SSE 帧格式的确切要求（Context7 查 `ai` SDK / 读该 walk 已验形状）。
3. **判分成本诚实披露**：判分 token 不进 spendGrant 预算（§2），确认闸的「预估额度」目前只算生成——蓝图幕 4 写了「含审片重试预算」，需在确认闸披露里把「+k 次判分 chat + ≤K 次重试生成」讲清（重试生成才是真花钱大头，判分是小 chat）。这是文案/披露事项，不是硬闸改动。

---

## 附：5 句摘要

1. **判分通道**：headless 判分复用 `runTask({kind:'image_to_prompt'})` → `executeTextTask` → `streamTextTask`（多模态 chat），判分模型走 `resolveOnboardingAgentFromCatalog()`（第一个可用 text 模型），**在 `runtime.ts:461` 早于任何 grant 校验返回 → 判分不消耗生成额度**、走该 text 模型的 key，与渲染层 judge 语义一致。
2. **插桩点**：推荐新建 electron 纯编排模块 `shotVerifyOrchestrate`，由 `core.generateOnProject` 生成成功后调一次（可选 hook，默认不传=行为不变）；判分纯核从 src 迁进 `electron/capabilityCore/shotVerifyCore.ts` 作单一真相源、src 侧留镜像 + equivalence.test 钉同构（照 nodeKindDomain 先例）。领域策略住 orchestrate、传输层只注入 deps、core 只透传 outcome——三层干净、全文件 <800。
3. **stub 注入**：L2 走 (a)——扩 `writeIsolatedCatalog` 加 `nomi-mock-judge`(kind:text) + 扩 `startMockVendorServer` 加 `/v1/chat/completions` SSE 按 prompt 标记返回可控低分 JSON；生产/L2 同一份代码，只差 catalog 数据指向 mock，**零环境变量逃生口**（P1）。judge deps 桩注入服务 L1 机制层单测，不当 L2 主路。
4. **最大风险**：主进程视频首帧抽帧函数本轮未钉到确切导出（渲染层用 desktopBridge），实现前需 grep 确认；无则图片镜先接、视频镜降级跳过（同渲染层策略）。次风险：AI SDK SSE mock 帧格式（有可复用形状）、判分成本在确认闸的诚实披露（文案事项）。
5. **改动量**：新增 4 个 <200 行 electron 模块 + 2 个测试文件；改动现有文件增量小（core +~15、mcpToolResults +~30、dispatcher/stdioServer/rpcServer 各几行、runtime 0、**spendGrant 0**）；harness 扩 mock-judge + 幕 5b/6 转真断言。重试复用首发 grantId+同 nodeId 直发 runTask，K≤2 天然落在 `maxAttemptsPerNode=3` 硬闸内、不问人、不超发。
