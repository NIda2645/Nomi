# 「等用户」只有一个 owner（花钱路）

状态：🚧 实施中（分支 `integration/core-a-salvage-20260921`，未 push）· 2026-09-22 · 主会话二次裁决 6 条已并入（C 改窄、decline 不发票、ticket 绑定、确认面排序约束、外部等待改短、规范版本更正）

## 0. 它在解决哪个真实摩擦

三件事，用户都撞得到，根是同一个——**「这一刻在等用户」这件事有三个 owner，各说各话**：

| # | 用户看到的 | 证据 | 今天等在哪 |
|---|---|---|---|
| ① | 在付费卡上点 ×，画布上**多出一个节点** | `agent-spend-card.walk.mjs` 红（合并 ③ 起）；探针：占位 `…t4bk` 被删，新 id `…ig1k` 冒出来 | 等在 Run 账本（`cardHidden` + 面板 1.5 秒轮询）。× 走 `dismiss`，不是终态，落地投影照旧认它 |
| ② | 让 Agent「生成一下」文稿方案，**三轮实测一次没成过** | run1 吞异常 / run2 过期清单 / run3 `generate did not finish within 60s` | 等在**工具执行里**（`presentStoryboardAuthoring → requestRendererDecision`，无超时，等人点头），撞写类工具 60 秒预算 |
| ③ | 有卡待答时继续打字，**15 句石沉大海** | run3 A3 之后 15 轮 `tools=[]`、各 30 秒 | 等在审批闸（`laneApprovalGate`），但闸外那两种等待它不知道 |

审批闸（`electron/agentLane/laneApprovalGate.ts`）是 report-C §三 已经确立的那一个 owner：等待住在
`before_tool`（**不受工具超时管**）、被打断时 resolve 不 reject、重启不复活卡、记录走 `drainNotes`。
另外两处等待没有这些性质里的任何一条。

## 1. 主会话已定的裁决（2026-09-22，技术岔路；产品行为与用户此前拍板一致）

A 等用户 = 审批闸一个 owner｜B 待决身份锚 `operationId` 不锚 `quoteId`｜
C **重启作废的是「那一次出价」，不是「那份计划」**（2026-09-22 二次裁决，改窄）：启动时把「已 present、未决」的计划
**退回 draft / 未 present**——待决、报价卡、内存里的 ticket 作废；计划本身（镜头、参数、锚点）留着，用户再说一句就能重新出价。
**不写 `cancelled`**：应用重启不是用户说「不」，× 才是。过期清扫同理，一律「退回 draft」｜
D × = 真终态，删 `dismiss` / `cardHidden` 的「用户 × 了」那一支｜E 待决时用户打字 = 对这道闸的回答｜F 只扣一次要有端到端证明。

**不变量：金额永远不是闸的判据。** 闸只问「这一次出价（`operationId` + 合同指纹）有没有被一个可追溯的回答者同意过」，
不问「多少钱」。金额只用于**展示**与「你确认的是不是你看到的那个数」的现时性校验（`quoteId`）；不进任何授权凭据的绑定，
不作为放行 / 拦截的条件。按额度放行是另一件事（预授权，开放问题），不许从这道闸里长出来。

## 先查别人

1. **依赖里有没有现成的等待机制**：有，而且我们已经在用。pi 的 `before_tool` 钩子
   （`node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js:400-440` `prepareToolCall` →
   `config.beforeToolCall`）在工具执行**之前**跑、不计入工具预算；返回形状只有 `{block, reason, terminate}`
   （`dist/types.d.ts:37-47`：「Returning `{ block: true }` prevents the tool from executing. The loop emits
   an **error** tool result instead」）。**由此得出一条硬约束**：想要「成功形状的『用户没同意』」，
   不能走 `block`——那一支在 pi 里**只能**产出 error result。只能放行，让工具执行自己返回那句话。
2. **同类产品怎么表达「用户拒绝」**：MCP elicitation 的响应是三值
   `action: "accept" | "decline" | "cancel"`，**三个都是正常结果，不是 JSON-RPC error**；
   本仓 `approvalReceipt.ts:136` 的 `APPROVAL_DECIDED_BY` 已经按它建模（`human:elicitation`）。
   Claude Code 的权限提示：用户在提示上打字 = 拒绝 + 这句话作为给模型的反馈，回合继续处理它。
   → 我们的偏差：无。`declined` 走成功形状、打字即回答，都是对齐。规范版本与偏差表见 §5c（2026-09-22 联网实查，更正了本节初稿引的 2025-06-18）。
3. **仓库里有没有**：
   - 等待 owner：`electron/agentLane/laneApprovalGate.ts:250-280`（race signal、resolve-on-abort、`restored` 不复活卡）；
   - 「待决时打字」已有**半个**实现：`laneHost.mts:650-652` 对 steering 消息 `gate.answer(..., 'deny', …)`——
     但它对提问卡也用 deny（该用 `answer`），而且只在 `command.kind !== 'follow-up'` 时生效；
   - 真终态已经存在：`productionRunReducer.ts:386` `generation.cancel` → `state: "cancelled"`；
   - 「全自动不出卡」的单一判官：`spendDecidedByPolicy`（`policySpendDecision.ts`），沿用不动。
4. **在不在护城河上**：不在。这是一个通用的「人在回路」状态机，没有理由自研第二套——所以方向是**删**，不是加。

## 2. 状态机

一次 `generate` 调用（内部 lane）的一生。**身份 = `operationId`**（B）；`quoteId` 只是卡上那一刻的报价指纹，
留给「你确认的是不是你看到的那个数」这条现时性校验用，不参与等待的寻址。

```
                    ┌─ 全自动档 ─────────────────────────────────────────────┐
 before_tool        │  spendDecidedByPolicy = true → 闸放行，不出卡            │
 (preflight)        └───────────────────────────────────────────────┬────────┘
   │                                                                 ▼
   ├─ 其余档位 → present(operationId)（卡出现）→ 登记 waiter[operationId] ──等──┐
   │                                                                          │
   │   事件（谁能触发）                          结局                          │
   │   · 面板「生成 ¥X」→ confirmPendingSpend 成功   → confirmed               │
   │   · 面板 × → discardPendingSpend 成功           → declined                │
   │   · 用户在 composer 打字（E）                    → declined + 反馈正文     │
   │   · 按停止 / 关窗 / 切项目（cancelAll）          → cancelled（既有）       │
   │   · 进程重启（C）                                → 回合侧 cancelled{restart}（既有）；│
   │                                                    计划侧**退回 draft / 未 present**  │
   ▼                                                                          │
 execute（工具真正执行，≤60s 预算，此刻**没有任何等待**）◀──────────────────────┘
   · confirmed  → 返回「已开始生成 N 镜」（成功形状；提交已由 confirm 那条既有链完成）
   · declined   → 返回「用户没同意，这次不生成」（**成功形状**，不是 isError → 不重试、不进熔断）
   · 全自动     → 既有 `decideByPolicyAfterDraft`（一个字不改）
```

落盘字段：**不新增等待态字段**。等待只活在内存里的 `waiter` 表（与审批闸的 `waiting` 同性质：进程死则等待死）。
盘上只有 Run 账本的 `generationPlan.state`：`draft`（`cardHidden`，未 present）→（present）→ `draft`（可见）→ `sealed` → `submitted`；
× → `cancelled{declined}`（终态）；**重启 / 出价过期 → 退回 `draft`（`cardHidden`，未 present）**——`sealed` 且门还在 waiting 的，
先按既有的 `revokeWaitingGenerationAuthorization` 撤掉那次未决授权再解封。「未 present」用的就是 `cardHidden` 的 (a) 义，不新增字段。

文稿方案（②）：`presentStoryboardAuthoring` 的「等用户在分镜编辑器里点头」同样挪到 preflight——
工具执行里只剩「读这次决定的结果」。

## 3. 门表（`node scripts/door-map.mjs`，2026-09-22）

| 符号 | 写口 | 说明 |
|---|---|---|
| `decideGenerationSpend` | `appIntegrationSpendConfirm.ts:391`（面板确认）、`generationTransportAdapters.ts:368`（全自动代答） | 两扇都保留：封印→铸收据→决门→消费→开跑这条链**只有一份**，差别只在 attestation 是人点的还是策略代答的 |
| `dismissGenerationPlan` | `productionRunReducer.ts:221` 一扇 | **删**（D） |
| `cardHidden`（读 7 扇） | 其中 `productionPendingSpend.ts:106` 是 live 语义 (a)「草稿还没摆到用户面前」；`productionGenerationPlanEdits.ts:243` 是 (b)「用户 × 了」 | (b) **删**；(a) 保留——它是落盘字段，改名要迁移用户已有账本，不在这一刀 |
| `plan.detach-shot-nodes` | 渲染层 `ProductionCanvasLandingHost.tsx:143` | **保留**：它服务的是「用户自己手动删占位」（任务书 D 末句：手动 detach 不受影响）。× 不再**依赖**它 |
| pending 投影读口 | `listPendingSpendConfirms` / `projectPendingSpendConfirm`（`productionPendingSpend.ts`） | 保留；新增一条判据：`cancelled` 的计划不投影（今天靠 `plan.state !== "draft"` 已经成立，补测试钉住） |

## 4. 删除清单（P1，同 commit）

- `dismissGenerationPlan`（`productionGenerationPlanEdits.ts`）、reducer 的 `generation.dismiss` 分支、
  `operations.dismiss`（memory store 与 production store 两支）、`GenerationOperationStore.dismiss` 接口成员；
- `discardPendingSpend` 内部从 `operations.dismiss` 改走 `operations.cancel`——**IPC 名不变**，所以渲染层此刻一行不用动；
- `laneExtendedTools.spendCardResult`（isError + STOP 那一支）与 `user_sees_spend_card` 这个**失败码**、
  第一轮加的 `waiting` 轴里它那一项（等待不再以失败的形状出现，这条轴对它就没有意义了）；
- `generate` 动词声明里「出卡后 STOP」的措辞；
- 落地：`buildMaterializeShotsPayload` 对 `state === "cancelled"` 的计划返回 null（× 之后不复活，**不再靠** detach 抢跑）。

## 5. 反方评审（自己做的，答案写在这里）

**Q1 哪条边会让钱花两次？**
(a) 确认后同一回合模型再调一次 `generate`：第二次 preflight 时计划已 `submitted` → 不 present、不登记 waiter，
    execute 返回「这一笔已经在跑」。幂等由既有的 `providerIdempotencyKey` + `generation.patch:<op>:v<planVersion>` 键兜底。**要一条走查证明（F）。**
(b) 面板确认与「用户打字=拒绝」同时到：`confirmPendingSpend` 成功返回**之后**才 settle confirmed；打字那条先到则 settle declined
    并 `cancel`——此后 `confirmPendingSpend` 的 `pendingFor()` 为空，返回 `no pending generation to confirm`，一分钱不花。
    **waiter 只认第一次 settle**（与闸的 `noted` 同理）。
(c) 全自动档：不经 waiter，既有路径一个字不改。

**Q2 哪条边会让回合永远挂着？**
(a) 卡出来了但渲染层没画（窗口没开 / 不在该项目）：`hasUserInterface=false` → 既有的 `denied-by-policy`，不等。
(b) 用户把卡晾着：等待不设超时是**刻意的**（`laneApprovalGate.ts:268`「等待期不花一分钱」）；按停止 / 关窗 / 切项目 → `cancelAll`。
(c) present 自己抛了（供应商没配好等）：preflight 里 catch → 不登记 waiter，直接 `block` 带 `ModelFacingRefusal` 正文（这是真错误，error 形状是对的）。
(d) 改参换了 quoteId：waiter 锚 operationId，不受影响（B）。
(e) **confirm 成功但 settle 丢了**（IPC 处理器与 lane 不在同一个对象里）：settle 走一个进程内的注册表
    （与 `beginPolicySpendDecision` 同形），`confirmPendingSpend` 的 `finally` 里按结局 settle；注册表查不到 waiter = 这张卡不是 lane 出的（外部 MCP / 分镜编辑器），no-op。

**Q3 哪条边会让卡变孤儿？**
(a) 重启：waiter 没了而盘上的计划还是「已 present 的 draft」→ 卡还会被投影出来、还能点确认——**这就是 C 要堵的**。
    启动（项目打开）时把「已 present、未决」的计划**退回 draft / 未 present**（不是 `cancel`）：卡不再投影、旧 ticket 随内存没了；
    镜头与参数都还在，用户重启后说一句「生成」= 对同一份草稿重新出价，不用重写分镜。× 过的计划不受这条影响——它早已是终态。
(b) × 之后：`cancelled`，投影与落地都不认。
(c) lane 被删 / 切对话：`close()` → `cancelAll('window-closed')` → waiter settle cancelled → **同时 cancel 那份计划**（否则卡留在面板上没人等它）。

**Q4 对非 lane 入口（外部 MCP `nomi_operation_gate`、分镜编辑器「提交执行计划」）有没有副作用？**
它们出的卡没有 waiter——confirm / × 照旧工作，settle 是 no-op。C 的启动回退对它们同样生效（外部宿主重启后重新 request 即可，
草稿还在），这是裁决 C 的字面范围（「含落盘的报价卡」）。

**评审发现的一处要向主会话报备的偏差**：裁决 D 写「删 detach 补救往返」。数门之后：那个观察者同时服务
「用户手动删占位 → 不复活」（裁决 D 自己的末句要保住的行为），删掉它会把手动删除弄坏。所以**保留观察者**，
只保证 × 不再依赖它（落地不认 `cancelled`）。

## 5b. 外部 MCP 宿主作为「回答者」——同一道闸的对外投影（**本轮不实现，只留好这一格**）

另一条会话的方案 `~/Desktop/nomi-scratch-0921/_video-breakdown-mcp-session/mcp-paid-path/PLAN.md`（缺口 1）要把
「elicitation 非 accept 一律当拒绝」改成三态，并在宿主接不住 elicitation 时回落到对话式两步确认（报价 + 一次性 ticket）。
它**不是第二套状态机**：内部 lane 与外部宿主的差别只有一处——**谁在等**。内部是 Nomi 的回合挂在审批闸上等；
外部是宿主那边的模型在等，Nomi 这边只有一份「已出价、未决」的计划。两边共用的是下面这张图的**右半**。

```
                         已出价 · 未决（身份 = operationId；盘上 = draft 可见 / sealed 且门 waiting）
   回答者                      事件                                   落到哪条边
   ─────────────────────────────────────────────────────────────────────────────────────────
   面板（人点）              「生成 ¥X」 / ×                           confirmed / declined
   全自动档（策略）           spendDecidedByPolicy                      confirmed（不出卡）
   外部宿主 · elicitation     accept                                    confirmed
                             decline                                   **不转移，且这次响应不发 ticket**（reason=client_declined）。正文对 AI 说：
                                                                       「宿主回了 decline；如果用户其实没看到确认，就把报价转述给他，
                                                                       拿到他明确的同意后再 request 一次」
                             cancel                                    **不转移 + ticket**（reason=client_cancelled）——规范原话 cancel=「没做出明确选择」，处置建议是 prompt again later
                             超时（远短于宿主工具超时，见下）            **不转移 + ticket**（reason=client_timeout）——等待从这一刻起发生在**对话里**，不在一次 `tools/call` 里
                             宿主不支持 elicitation                     **不转移 + ticket**（reason=client_unsupported），一个字节都不发
                             （以上四种「不转移」的返回**全部是成功形状**，非 isError：没有任何东西坏了，只是还没人点头。
                               错误形状会让宿主模型重试 / 进熔断 / 向用户报「出错了」——三样都是错的）
   外部宿主 · ticket          phase=decide + 有效 ticket                confirmed
                             phase=decide + 显式「用户说不」             declined（与 × 同一条边、同一个终态）
                             ticket 过期 / 被用过 / 绑定对不上           不转移；回可行动的拒绝（重新 request）
   任何回答者                 进程重启 / 出价过期（裁决 C）               **退回 draft / 未 present**——ticket 随内存一起没了；计划本身留着，重新 request 即重新出价
```

**为什么 decline 不发 ticket，另外三种发**：cancel / 超时 / 不支持 = 「没有人回答过」，下一步自然是换一条路再问一次，ticket 就是那条路的
凭据。decline 是「有一个回答者说了不」——哪怕它多半是宿主替人答的，也不能在**同一次响应**里递上一张「拿这个就能花钱」的票：那等于
对一个「不」回一句「那你自己批吧」。要走下一步，AI 必须先回到对话里拿到用户明确的同意，再 request（那一次才可能拿到 ticket）。

**为什么外部 elicitation 的等待必须很短**：它等在一次 `tools/call` **里面**，而宿主对工具调用有自己的超时（常见量级 ~60 秒）——
这和 §0 的 ② 是**同一种病**（等人等在工具执行预算里）。所以不写 300 秒；写「远短于宿主工具超时，到点落『不转移 + ticket』，
让真正的等待发生在对话里」。具体秒数 = 宿主侧那一轮的调研项（逐个宿主实测它的工具超时，不拍脑袋）。

**为什么 decline / cancel / 超时在外部是「不转移」，而在面板上 × 是终态**：面板的 × 是**人的手势**（主进程铸的
`human-gesture` attestation 带 webContentsId / frameId）；宿主回的 decline 可能是宿主**自己替人答的**（Codex 实测 100% 自动 decline）。
把一个不可证明来自人的「不」落成终态，就是今天那条根因（链路当场结束、报价被丢）。只有**显式**的「用户说不」才走 declined。

**「只扣一次」这条不变量怎么共用**——ticket **不是**第二条花钱路，它是收据之前的那一张凭据：

| 环节 | owner（今天就在） | ticket 接在哪 |
|---|---|---|
| 把「同意」变成收据 | `rpcServer.ts:205-215` `nomi_verify_client_generation_gate`（今天铸 `client_elicitation`）；由 `mcpGateConfirmation.ts:153-165` 在 accept 后调 | ticket 验过之后**在同一处**铸收据，attestation 加第三种 `client_relayed`（与 `human-gesture` / `policy-full-auto` 并列，账本上分得清是谁点的头） |
| 收据 → 决门 → 消费 → 开跑 | `generationSpendDecision.ts:80-99` `decideGenerationSpend`，**全仓只有这一份**（door-map：两扇写口都调它） | 不改。ticket 路是它的**第三个调用方**，不是第二份实现 |
| 同一张收据批不动第二次 | `consumeReceipt`（一次性）+ `spendGrant.ts:98-110` 出站硬闸 + `providerIdempotencyKey` | 不改。ticket 自己再加一层一次性，绑 **`operationId + contractHash + 过期时刻 + 发给谁`**（发给谁 = 那个 MCP 客户端身份 / 连接；规范安全节原话：Servers MUST bind elicitation requests to the client and user identity）。**`maximumCost` 不进绑定**，只用于展示——金额不是闸的判据（§1 不变量）；参数变了由 `contractHash` 管，价格单独变了由既有的 `quoteId` 现时性校验管。它防「改了参数还用旧授权 / 同一张票批两次 / 别的连接捡到票」，**不防** AI 自问自答——那条由宿主审批面管（PLAN §2.6） |
| 第二次 decide（重复调用） | 本方案反方评审 Q1(a)：计划已 `sealed/submitted` → 不再出价，返回「这一笔已经在跑」 | 同一条边：带着已消费的 ticket 再调 = 成功形状的「已在跑」，不是错误、不是第二笔 |

**本刀落地后，宿主侧要接上来时不需要拆我的东西——凭的是这四条**：
1. 待决身份锚 `operationId`（裁决 B）：ticket 绑的也是它，不会和 `quoteId` 的刷新打架；
2. 「用户说不」只有一个终态：`generation.cancel`。`dismiss` / `cardHidden` 的 (b) 义删掉之后，宿主侧的显式拒绝直接复用这条边；
3. lane 的 waiter 注册表对「不是 lane 出的卡」是 **no-op**（反方评审 Q4）：外部宿主出的价、它自己 confirm，不会误 settle 任何回合；
4. 本轮**不碰** `mcpGateConfirmation.ts` / `mcpSemanticGenerationFlow.ts` / `rpcServer.ts` / `mcpTrustDowngrade.ts`，也不碰 `executionContract.ts`、不新增对 `src/config/modelArchetypes/` 的 import（那条会话要搬它）。

**确认出现在哪里——用户已经拍过板（2026-09-22 原话：「在哪里用 mcp 就把东西设计在哪里，不能在 nomi 应用里弹」）**：
- 目标形态：待决带**来源**（lane / 外部宿主 / 分镜编辑器）；面板**只投影非外部来源**的待决；外部来源的确认只经宿主
  （elicitation，或对话式两步 + ticket）。
- **本轮不改这条投影**——今天外部宿主出的价仍会投影到面板上，那张卡是它此刻唯一能被人点头的地方。
- **P1 排序约束（写死）**：「删掉外部来源的应用内确认」与「宿主侧两步确认落地」必须是**同一个 commit**。先删后补 = 中间那段
  外部用户没有任何地方能点头（付费路断）；先补后删 = 两个确认面并行（同一笔出价两处可批，违反 P1）。

**开放问题（都是产品行为，要用户拍板，本文不设计）**：
- 「按次数 / 秒数 / 额度预授权」（PLAN 方案 D、Q2、Q3）：上限的数、有效期、在哪里改、撤销入口；
- 确认面只剩**一个**没拍的点：外部宿主在出价、而用户本机恰好开着 Nomi 时，面板上要不要出现一条**被动的、不可点的**痕迹
  （「Claude Code 正在请求生成 ¥X」）。可点的卡已经定了不出。
- ticket / 出价过期后的清扫节奏（惰性：下一次触碰时退回 draft；还是定时扫）。两种做法的**落点已定**——退回 draft，不是 declined。

## 5c. 规范版本：链接 / 我们的偏差 / 偏差理由（R5⑤，2026-09-22 联网实查原文）

**仓库实际协商的版本**：`electron/capabilityCore/mcpProtocol.ts:86-89`——`PROTOCOL_VERSION = '2025-11-25'`，
`SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25','2025-06-18','2025-03-26','2024-11-05']`。`mcpElicitation.ts:1-16` 按 2025-11-25 的线形说话
（`elicitation/create` 服务端主动请求；URL 模式带 `elicitationId` + `notifications/elicitation/complete`）。

| 规范 | 与本方案有关的条文 |
|---|---|
| [2025-11-25 · client/elicitation](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation) | 三值 `accept / decline / cancel`，都是 `result`，不是 JSON-RPC error。decline =「User explicitly declined」，建议处置 offer alternatives；cancel =「dismissed without making an explicit choice」，建议处置 prompt again later。URL 模式是这一版**新增**的，规范自己标了「may change in future protocol revisions」。安全节：**Servers MUST bind elicitation requests to the client and user identity**。 |
| [2026-07-28 · changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog) + [client/elicitation](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation) | **三值语义逐字未变**（Response Actions 一节原文相同）。变的是**怎么送达**：① 服务端主动请求整条废掉，改成 Multi Round-Trip Requests——`tools/call` 先回 `InputRequiredResult`（`resultType:"input_required"` + `inputRequests`），客户端拿到用户回答后**重发原请求**并带 `inputResponses`（SEP-2322）；② 删 `elicitationId` 与 `notifications/elicitation/complete`，跨重试的关联改由服务端自己编进 `requestState`；③ 协议无状态化、删 `initialize` 握手与协议级会话，「需要跨调用状态的服务端，用**服务端铸的显式句柄、当普通工具参数传**」（SEP-2567）；④ 所有 result 必带 `resultType`。 |

**对本方案的含义**：
- 三值 → 边的映射（§5b 那张表）在两个版本下**都成立**，不用跟着版本改。
- 2026-07-28 把「等人」从**一次调用里面**挪到了**两次调用之间**——和本文的方向（等待不许住在工具执行预算里）是同一个判断。
  我们的「不转移 + ticket、等待发生在对话里」在新版下不是权宜，是规范自己选的形状；ticket =「服务端铸的显式句柄、当普通工具参数传」，
  正是 SEP-2567 指的那种东西。
- 「发给谁」的绑定：2025-11-25 下可以绑连接 / 会话；2026-07-28 删了协议级会话，届时要绑 `clientInfo` + 传输层身份（stdio = 那个子进程；
  HTTP = 授权主体）。**绑定项的名字写「发给谁」，不写 sessionId**，就是为了不被这次改版带走。

| 我们的偏差 | 理由（只许是领域约束） |
|---|---|
| 最高只协商到 2025-11-25，没跟 2026-07-28 | 不是本方案造成的偏差，也不在本轮范围：升级 = 换掉握手 / 会话 / 订阅整层，走「升版本四步协议」单独立项。本文只保证**不往会被删的东西上绑**（不绑 `elicitationId`、不绑 `Mcp-Session-Id`）。 |
| decline 在外部**不落终态**（规范建议处置是 offer alternatives，没说不能当终态，但多数实现当「用户拒绝」处理） | 领域约束 = 这一步花真钱，且实测有宿主 **100% 自动回 decline**（Codex）——那个「不」不可证明来自人。把它落成终态 = 付费路在该宿主上永远走不通。规范对 decline 的定义是「**User** explicitly declined」；宿主替人答的不满足这个定义，我们按规范的字面收紧，不是放宽。 |
| 对话式两步确认（ticket）不是 elicitation | 扩展放在标准的扩展点上：ticket 是**普通工具参数**，返回是**普通成功 result**，不新增方法、不新增 capability、不改线形。宿主不支持 elicitation 时规范本来就要求服务端自己兜（2026-07-28 Error Handling：「Servers SHOULD NOT assume that elicitation requests will always succeed」）。 |

## 6. 步骤与验收门

1. 复现并修 ③（E）：真 Electron、真页面输入，零额度 loopback。
2. A + B + F：waiter 注册表、preflight 出卡并等、execute 读结局、`generate` 声明同步；C：启动时「已 present、未决」退回 draft / 未 present。
3. D 主进程半：× → cancel，删 dismiss 一支，落地不认 cancelled。
4. （等主会话通知）合并 ④ + 渲染层调用点。
5. 验收：spend 全部走查绿 + 新增六条（× 后 5 秒节点数不变 / 同回合再 generate 不出第二笔 / 重启后 pending 作废 /
   看卡 >90 秒再确认仍成功 / 文稿方案 generate 端到端成功 / 待决时打字两种卡各一条）+ `mcp-l2-journeys` + `elicitation-first`；
   run4 = 同 18 句全量跑到、走查像真人一样答卡。

回滚：每步一个 commit；2 与 3 各自可独立 `git revert`（3 不依赖 2 的 waiter）。
