# 「等用户」只有一个 owner（花钱路）

状态：🚧 实施中（分支 `integration/core-a-salvage-20260921`，未 push）· 2026-09-22

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

A 等用户 = 审批闸一个 owner｜B 待决身份锚 `operationId` 不锚 `quoteId`｜C 重启一律作废待决（含落盘的报价卡）｜
D × = 真终态，删 `dismiss` / `cardHidden` 的「用户 × 了」那一支｜E 待决时用户打字 = 对这道闸的回答｜F 只扣一次要有端到端证明。

## 先查别人

1. **依赖里有没有现成的等待机制**：有，而且我们已经在用。pi 的 `before_tool` 钩子
   （`node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js:400-440` `prepareToolCall` →
   `config.beforeToolCall`）在工具执行**之前**跑、不计入工具预算；返回形状只有 `{block, reason, terminate}`
   （`dist/types.d.ts:37-47`：「Returning `{ block: true }` prevents the tool from executing. The loop emits
   an **error** tool result instead」）。**由此得出一条硬约束**：想要「成功形状的『用户没同意』」，
   不能走 `block`——那一支在 pi 里**只能**产出 error result。只能放行，让工具执行自己返回那句话。
2. **同类产品怎么表达「用户拒绝」**：MCP elicitation（规范 2025-06-18，
   https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation）的响应是三值
   `action: "accept" | "decline" | "cancel"`，**三个都是正常结果，不是 JSON-RPC error**；
   本仓 `approvalReceipt.ts:136` 的 `APPROVAL_DECIDED_BY` 已经按它建模（`human:elicitation`）。
   Claude Code 的权限提示：用户在提示上打字 = 拒绝 + 这句话作为给模型的反馈，回合继续处理它。
   → 我们的偏差：无。`declined` 走成功形状、打字即回答，都是对齐。
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
   │   · 进程重启（C）                                → cancelled{restart}（既有）│
   ▼                                                                          │
 execute（工具真正执行，≤60s 预算，此刻**没有任何等待**）◀──────────────────────┘
   · confirmed  → 返回「已开始生成 N 镜」（成功形状；提交已由 confirm 那条既有链完成）
   · declined   → 返回「用户没同意，这次不生成」（**成功形状**，不是 isError → 不重试、不进熔断）
   · 全自动     → 既有 `decideByPolicyAfterDraft`（一个字不改）
```

落盘字段：**不新增等待态字段**。等待只活在内存里的 `waiter` 表（与审批闸的 `waiting` 同性质：进程死则等待死）。
盘上只有 Run 账本的 `generationPlan.state`：`draft` →（present）→ `draft`（可见）→ `sealed` → `submitted`；× → `cancelled`。

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
    启动（项目打开）时把「已 present、未决」的计划一律 `cancel`；用户重启后要生成，再说一句。
(b) × 之后：`cancelled`，投影与落地都不认。
(c) lane 被删 / 切对话：`close()` → `cancelAll('window-closed')` → waiter settle cancelled → **同时 cancel 那份计划**（否则卡留在面板上没人等它）。

**Q4 对非 lane 入口（外部 MCP `nomi_operation_gate`、分镜编辑器「提交执行计划」）有没有副作用？**
它们出的卡没有 waiter——confirm / × 照旧工作，settle 是 no-op。C 的启动作废对它们同样生效（外部宿主重启后重新请求即可），
这是裁决 C 的字面范围（「含落盘的报价卡」）。

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
                             decline                                   **不转移**：留在「未决」，回 `spend_pending_confirmation`（reason=client_declined）+ ticket
                             cancel                                    **不转移**：同上（reason=client_cancelled）——规范原话 cancel=「没做出明确选择」，处置建议是 prompt again later
                             超时（300 s）                              **不转移**：同上（reason=client_timeout）
                             宿主不支持 elicitation                     **不转移**：同上（reason=client_unsupported），一个字节都不发
   外部宿主 · ticket          phase=decide + 有效 ticket                confirmed
                             phase=decide + 显式「用户说不」             declined（与 × 同一条边、同一个终态）
                             ticket 过期 / 被用过 / 绑定对不上           不转移；回可行动的拒绝（重新 request）
   任何回答者                 进程重启（裁决 C）                         cancelled{restart}——ticket 随内存一起没了，盘上的未决计划启动时作废
```

**为什么 decline / cancel / 超时在外部是「不转移」，而在面板上 × 是终态**：面板的 × 是**人的手势**（主进程铸的
`human-gesture` attestation 带 webContentsId / frameId）；宿主回的 decline 可能是宿主**自己替人答的**（Codex 实测 100% 自动 decline）。
把一个不可证明来自人的「不」落成终态，就是今天那条根因（链路当场结束、报价被丢）。只有**显式**的「用户说不」才走 declined。

**「只扣一次」这条不变量怎么共用**——ticket **不是**第二条花钱路，它是收据之前的那一张凭据：

| 环节 | owner（今天就在） | ticket 接在哪 |
|---|---|---|
| 把「同意」变成收据 | `rpcServer.ts:205-215` `nomi_verify_client_generation_gate`（今天铸 `client_elicitation`）；由 `mcpGateConfirmation.ts:153-165` 在 accept 后调 | ticket 验过之后**在同一处**铸收据，attestation 加第三种 `client_relayed`（与 `human-gesture` / `policy-full-auto` 并列，账本上分得清是谁点的头） |
| 收据 → 决门 → 消费 → 开跑 | `generationSpendDecision.ts:80-99` `decideGenerationSpend`，**全仓只有这一份**（door-map：两扇写口都调它） | 不改。ticket 路是它的**第三个调用方**，不是第二份实现 |
| 同一张收据批不动第二次 | `consumeReceipt`（一次性）+ `spendGrant.ts:98-110` 出站硬闸 + `providerIdempotencyKey` | 不改。ticket 自己再加一层一次性（绑 `operationId + contractHash + maximumCost + 过期时刻`）：它防「改了参数还用旧授权 / 同一张票批两次」，**不防** AI 自问自答——那条由花费上限与宿主审批面管（PLAN §2.6） |
| 第二次 decide（重复调用） | 本方案反方评审 Q1(a)：计划已 `sealed/submitted` → 不再出价，返回「这一笔已经在跑」 | 同一条边：带着已消费的 ticket 再调 = 成功形状的「已在跑」，不是错误、不是第二笔 |

**本刀落地后，宿主侧要接上来时不需要拆我的东西——凭的是这四条**：
1. 待决身份锚 `operationId`（裁决 B）：ticket 绑的也是它，不会和 `quoteId` 的刷新打架；
2. 「用户说不」只有一个终态：`generation.cancel`。`dismiss` / `cardHidden` 的 (b) 义删掉之后，宿主侧的显式拒绝直接复用这条边；
3. lane 的 waiter 注册表对「不是 lane 出的卡」是 **no-op**（反方评审 Q4）：外部宿主出的价、它自己 confirm，不会误 settle 任何回合；
4. 本轮**不碰** `mcpGateConfirmation.ts` / `mcpSemanticGenerationFlow.ts` / `rpcServer.ts` / `mcpTrustDowngrade.ts`，也不碰 `executionContract.ts`、不新增对 `src/config/modelArchetypes/` 的 import（那条会话要搬它）。

**开放问题（都是产品行为，要用户拍板，本文不设计）**：
- 「按次数 / 秒数 / 额度预授权」（PLAN 方案 D、Q2、Q3）：上限的数、有效期、在哪里改、撤销入口；
- 外部宿主出价时，Nomi 面板上要不要同时出那张兜底卡——用户 09-21 的约束是「别把 MCP 用户指回 Nomi」，
  但本机 GUI 用户同时开着 Nomi 时这张卡是否还该出现，没有拍过板；
- ticket 过期后盘上那份「未决」计划由谁收走（惰性：下一次触碰时按 declined 处理；还是定时扫）。
  在拍板之前，裁决 C 的启动作废是它唯一的兜底清扫。

## 6. 步骤与验收门

1. 复现并修 ③（E）：真 Electron、真页面输入，零额度 loopback。
2. A + B + F：waiter 注册表、preflight 出卡并等、execute 读结局、`generate` 声明同步；C：启动作废。
3. D 主进程半：× → cancel，删 dismiss 一支，落地不认 cancelled。
4. （等主会话通知）合并 ④ + 渲染层调用点。
5. 验收：spend 全部走查绿 + 新增六条（× 后 5 秒节点数不变 / 同回合再 generate 不出第二笔 / 重启后 pending 作废 /
   看卡 >90 秒再确认仍成功 / 文稿方案 generate 端到端成功 / 待决时打字两种卡各一条）+ `mcp-l2-journeys` + `elicitation-first`；
   run4 = 同 18 句全量跑到、走查像真人一样答卡。

回滚：每步一个 commit；2 与 3 各自可独立 `git revert`（3 不依赖 2 的 waiter）。
