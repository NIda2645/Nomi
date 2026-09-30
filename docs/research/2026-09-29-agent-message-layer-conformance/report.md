# Agent 消息层 × Vercel AI SDK / AI Elements：逐层对照与迁移方案

> 只读调研 · 对照日期 2026-09-29 · 没改任何产品代码
>
> - **对照对象**：Vercel AI SDK（`ai`）的「工具 / 转录渲染 / 控制流 / 审批」四层；参考实现是 AI Elements 源码。
> - **我们现在的版本**：`ai` 4.3.19，只在主进程跑文本任务；Agent 运行时是 pi 0.85.1。
> - **上游现状**（2026-09-29 查 npm）：`ai` 最新是 **7.0.122**；v6 是维护线，最新 6.0.296；v5 是 5.0.269；AI Elements 主干依赖 **v6**。
> - **行号基线**：分支 `claude/agent-message-layer-conformance`，基于 origin/main `f91ae82ad`。行号会漂，以路径和结论为准。
> - **登记位置**：`docs/engineering/framework-boundaries.json` → `referenceConformanceDebt` 里 id 为 `ai` 的那条，到期 2026-10-07。那条的 `doc` 字段仍指向旧路径，转正办法见附录 B。
> - **判定档**沿用 `docs/research/TEMPLATE-reference-conformance.md`：`一致` / `有意不同(理由)` / `没想到`。
> - **前作**（不重复做，直接引用）：`docs/research/2026-09-10-permission-rework-prior-art/prior-art.md` §1（pi 四列表）；`docs/research/2026-09-06-ai-elements-anatomy.md`（AI Elements 源码解剖）。
> - **协调会话复核**（2026-09-29）：抽查了三条结论，都属实：
>   - `src/workbench/ai/lane/laneClient.ts` 头注释写明「本层零状态机」；
>   - `laneProjection.ts` 的 user 段没有附件字段；
>   - `approval-requested` / `approval-responded` 在生产代码里只出现在类型、标签和设计实验室里。

## 0. 结论先行

1. **诊断对了一半。**
   - 对的：我们确实自己画了一套 UI 词表、自己拼了审批、把同一件事拆成好几份，这些地方出过真 bug（§5.4 列了 6 个已修的）。
   - 不对的：这次走查的 **24 条规则里，没有一条**会因为换用框架的那一层而消失，只有 1 条能消掉一半。
2. **分桶结果：(a) 0 条 · (b) 23 条 · (c) 1 条。** 其中 16 条根本不在任何消息层，而在画布节点、制作 Run、提示框和失败文案里。
3. **「pi 在主进程跑循环，渲染层用 AI SDK 的 UIMessage 流 + 自定义 IPC ChatTransport」这个形状，有先例（Cherry Studio），但对 Nomi 只对一半。**
   - 该要的是 UIMessage 这套**消息模型**，不必上 `useChat` + ChatTransport。
   - 上它等于给一份已经很薄的渲染层再加一个状态主人。
4. **顺序：领域先修 → 付费卡并进同一份投影 → 一次工具调用合成一个 part。**
   - 第一步修的是「批准范围 = 派发范围」、回执读 Run 状态、参考图。
   - 这三步不管以后选哪条路都不白做。
   - AI Elements 整套 UI + Tailwind 4 **不做**。
5. **有个硬前提简报没提：主进程钉在 `ai@4`，而 `package.json` 只能有一个 `ai`。**
   - 真要装 SDK，得先定主版本（v6 还是 v7），这件事比消息层本身还大。
   - 所以建议先做上面三步，**暂不装**新版本。

---

## 1. 先把事实摆平

### 1.1 简报说法逐条核对

| 简报的说法 | 结果 | 证据 |
|---|---|---|
| Agent 运行时在主进程 `electron/agentLane/*`，用 pi 0.85.1 | 属实 | `package.json` 里三个包都是 0.85.1，另有 overrides；`electron/agentLane/laneHost.mts:34,263` |
| `ai ^4.3.19` 只做简单文本任务 | 属实，需要补充 | 只调了不带 tools 的 `streamText`（`electron/ai/streamTextTask.ts:134`）和 `generateObject`（`electron/providerAdapter/compiler.ts:55`）；`ai` / `@ai-sdk/*` 的 import 全在主进程 8 个文件里 |
| 渲染层不 import `ai` | 属实 | 在 `src/` 下 grep `from 'ai'` 和 `@ai-sdk`，结果为空 |
| Agent 面板在 `src/workbench/ai/v4/*` | 属实，但少说了一层 | 面板的**数据**在 `src/workbench/ai/lane/*`（`laneClient.ts` + `laneViewModel.ts`），v4 只负责画 |
| 付费确认卡不在消息流里，渲染层每 1.5 秒轮询 `pendingSpend` | 属实 | `src/workbench/ai/v4/useAgentPanelSpendConfirm.ts:52,147-151` |
| 模型看到的是手写回执 | 属实 | `electron/agentLane/laneExtendedTools.ts:127-156`，`generateReceipt` |
| `framework-boundaries.json` 里已有 `pi` 条目 | 属实 | 共 7 条 capability；`fourColumnTable` 指向 `docs/plan/2026-09-07-agent-runtime-rebuild.md`；另一张四列表在 `2026-09-10-permission-rework-prior-art` §1 |
| react ^19.3.0 · tailwindcss 3 · @mantine/core ^8.3.18 | 属实 | 见 `package.json`。注意 `vendor/README.md` 和 `aiElementsContract.ts` 的注释还写着 React 18，已过期 |
| AI Elements 要 Tailwind 4 + shadcn | 属实 | 官方 Setup 的要求：Node 18+、React 19、Next.js 14+、AI SDK、shadcn/ui、**Tailwind CSS 4**；组件靠 `npx ai-elements@latest add` 把源码拷进仓库 |

### 1.2 简报没提、但会改变结论的五个事实

- **N1：`ai` 最新大版本是 7，不是 6。**
  - AI Elements 主干（`packages/elements/package.json`）依赖 `ai ^6.0.105`、`@ai-sdk/react ^3.0.41`、React 19.2.3、streamdown ^2.4.0。
  - 也就是说，最新的 SDK 和它的参考实现不在同一个大版本上。
- **N2：渲染层并没有手写一套消息状态机。**
  - `laneClient.ts:1-13` 写明「本层零状态机」：只存最后一份投影、通知订阅者、发命令。
  - 真正的状态机是 **pi 自带的 `reduceLaneSnapshot`**，跑在主进程（`laneHost.mts:348`）。
- **N3：pi 已经自带给远程消费者用的转录协议。**
  - 就是 `LaneTranscriptSnapshot` + `LaneWatchEvent` + 纯函数 `reduceLaneSnapshot`（见 `pi-agent-core/dist/harness/agent-harness.d.ts:472-475`、`dist/harness/runtime/reducer.d.ts`）。
  - 它和 AI SDK 的 `UIMessageChunk` 流扮演同一个角色。
- **N4：AI Elements 其实已经接了一部分。**
  - 已接：七态词表（`agentPanelV4Types.ts:17-24`），`Message` / `MessageResponse` / `MessageActions` 三件（`vendor/aiElementsPrimitives.tsx`），Streamdown 2.6.0（`src/workbench/common/NomiMarkdown.tsx:4-6`）。
  - 其余八件是有意删掉的。理由写在 `aiElementsPrimitives.tsx:4-13`：长相差太远，留着就是并行版。
- **N5：这笔债的前提已经过期。**
  - 债条目说「Vercel AI SDK 是模型调用与流式转录那条线的底座」。对 Agent 线来说，这从 #646（2026-09-09）起就不成立了：Agent 的底座是 pi，AI SDK 只剩非 Agent 的文本任务（`docs/ARCHITECTURE-NOW.md` 第 47 行）。
  - 所以「工具」和「控制流」两层应该拿 **pi** 当参考。AI SDK 只适合当「消息模型、审批状态、组件」这三样的参考。

---

## 2. AI SDK 四列表：工具 / 转录渲染 / 控制流 / 审批

> - **四列**：它提供（SDK 的能力，带版本和出处）· 我们用了 · 我们另写了 · 我们拆散了。每张表后面的「判定」是对各行的裁决。
> - **SDK 出处的缩写**：`docs` = ai-sdk.dev 文档；`src@x` = GitHub 上 `vercel/ai` 在 `ai@x` 标签处的源码；`AIE` = `vercel/ai-elements`。

### 2.1 工具

| 行 | 它提供 | 我们用了 | 我们另写了 | 我们拆散了 |
|---|---|---|---|---|
| T1 定义工具 | `tool({ description, inputSchema, execute, outputSchema?, toModelOutput? })`，运行时自动校验入参。v5 起字段叫 `inputSchema`，v4 叫 `parameters`。出处：`docs` tools-and-tool-calling | **没用。** 全仓的 `ai@4` 只调不带 tools 的 `streamText` 和 `generateObject` | 给 pi 的 `AgentHarnessTool` 写了适配层（`electron/agentLane/laneTools.mts:204-287`）。工具身份的唯一 owner 是 `electron/shared/agentCapabilities/verbDeclarations.ts` | 身份已经收进一个注册表（`modelFacingToolRegistry.ts:94`）。还没收编的只有 5 个手写的 MCP 生成工具（`mcpGenerationToolCatalog.ts:64-172`） |
| T2 入参错了怎么自纠 | 校验失败时，工具 part 进入 `output-error`；`repairToolCall` 让模型重出参数。改名发生在哪个版本**未核实** | pi 自带 AJV 预校验（`laneHost.mts:267-268`） | 按契约再 parse 一次，并按固定形状 throw（`laneTools.mts:236-241` → `laneArgumentFailure.ts`）；失败后补一个示例（`laneHost.mts:266-274`） | 有两个校验点：pi 的 AJV 和我们的 `safeParse` |
| T3 结果怎么同时回给模型和界面 | `execute` 的返回值就是 `output`，**同一个工具 part** 既是 UI 状态又是模型输入；`toModelOutput` 可以改写给模型看的那份 | pi 的「throw = isError」 | 自己的结果信封：正文 + `details.nextAction` + 失败信封（`laneTools.mts:276-285`）。面板渲染时再把给模型看的尾行摘掉（`laneViewModel.ts:454-458`） | 同一个结果有两个渲染点：给模型的文本（`renderLaneToolNextAction`），给面板的文案（`laneToolFailureText.ts`） |
| T4 工具超时和输出上限 | 文档里没找到逐工具超时，只有 `abortSignal` | pi 的 `truncateHead`（`laneTools.mts:21,103`） | 逐工具设 `timeoutMs`，闸放行后才开始计时（`laneTools.mts:245-266`）；把「花钱的工具必须提交即返回」做成装配期不变量 | — |
| T5 每回合能看到哪些工具 | `activeTools`，可以在 `prepareStep` 里逐步改 | pi 的 `activeToolNames` / `setActiveTools`（`laneHost.mts:221,314-326`） | 延迟披露的工具组，加上用 `nomi_request_tools` 切组（`laneToolCatalog.ts`） | — |

**判定：**
- **T1 有意不同。** Agent 的工具运行时就是 pi，再接一份 `tool()` 就是第二个运行时，违反 P1。
- **T2 一致 + 有意不同。** 一致的是 AJV 那一步照 pi 走。有意不同的是我们再 parse 一次，因为失败正文要同时喂给模型和面板收据。
- **T3 有意不同。** 领域约束：写类、付费类动作的回执必须说清「用户此刻看到什么」。
- **T4 有意不同。** 等审批不计时；花钱的工具不许挂在工具里等。
- **T5 一致**，跟 pi。

### 2.2 转录渲染

| 行 | 它提供 | 我们用了 | 我们另写了 | 我们拆散了 |
|---|---|---|---|---|
| R1 消息数据模型 | `UIMessage { id, role, metadata?, parts[] }`；part 有 text、reasoning、`tool-<name>` / `dynamic-tool`、source、file、`data-*`、step-start 几种。v6 加了 3 个审批态，v7 加了 `reasoning-file` | **只用了词表**：`V4ToolStatus` 七态（`agentPanelV4Types.ts:17-24`）和 `AI_ELEMENTS_TOOL_STATUSES`（`vendor/aiElementsContract.ts:7-11`）。两份都是手抄的 | 三层自有形状：pi 的 `Entry[]` → `LanePart[]`（`laneContracts.ts:40-121`）→ `V4FlowItem[]`（`laneViewModel.ts:336-495`） | **一次工具调用拆成三个 part**：`tool-call` + `tool-result` + 审批 `host-note`，渲染时按 `toolCallId` 现拼（`laneViewModel.ts:343-361,417-459`）。SDK 里这是**一个** part |
| R2 流式增量 | `UIMessageChunk` 协议，`useChat` 逐块归并，`throttle` 控制重绘频率 | pi 的 `watch` + `reduceLaneSnapshot`（`laneHost.mts:333,347-356`） | **每来一个事件，就整份重投影、整份发给渲染层**（`laneHost.mts:343-346`；`laneIpc.ts:123`），没有节流。合同文件自己写着「增量是阶段 3 的事」（`laneContracts.ts:333`） | 渲染层又全量走一遍（`laneViewModel` + `replaceEqualDeep`） |
| R3 Markdown 与流式文字 | `MessageResponse`（基于 Streamdown） | Streamdown 2.6.0 + code 和 cjk 插件；`Message` 三件已改写 | — | — |
| R4 对话容器与滚动 | `Conversation`：自动贴底 + 回到底部按钮 | 没用 | 手写的跟随到底、翻页锚点、每线程记住滚动位置（`AgentPanelV4Panel.tsx:267-397`） | — |
| R5 工具行、确认卡、附件、输入框 | `Tool`、`Confirmation`、`Attachments`、`PromptInput`，都是拷源码式分发，依赖 shadcn + Tailwind 4 + React 19 | 没用；平移过来后因为长相差太远删掉了 | `AgentPanelV4Receipt.tsx`、`AgentPanelV4Cards.tsx`、`AgentPanelV4Composer.tsx`、`useComposerAttachments.ts` | — |
| R6 历史与持久化 | 框架不管存；文档示例是由 app 自己存 `UIMessage[]` | pi 会话（JSONL）+ 分页读取 | 自定义输入消息 `nomi.input`，带附件 claim、技能和上下文（`laneDesktopInput.ts:76-96`） | 投影时漏掉了 claim 里的附件（`laneProjection.ts:253-257`），也就是 §5 的 `attachment-gone-after-send` |

**判定：**
- **R1 没想到。** 我们把它当成要抄的词表，没当成数据结构。结果是：`approval-requested` / `approval-responded` 这两个状态**在生产代码里从来没被赋过值**。
- **R2 一致 + 没想到。** 一致的是用了 pi 的增量协议；没想到的是在它上面又整份重发。
- **R3 一致。**
- **R4 有意不同。** 每线程记住滚动位置、翻页锚点都是产品需求。
- **R5 有意不同。** 付费卡里嵌着一整件生成框；我们的设计系统是 token + Tailwind 3 + Mantine。
- **R6 一致。** 持久化的框架是 pi。

### 2.3 控制流

| 行 | 它提供 | 我们用了 | 我们另写了 | 我们拆散了 |
|---|---|---|---|---|
| C1 循环怎么停 | `stopWhen`：`stepCountIs(n)`、`hasToolCall`（v7 改名 `isStepCount`）；`ToolLoopAgent` 默认最多 20 步 | pi 循环 + `terminate: true` | **没有回合请求数上限**（`laneHost.mts:99`，09-18 拍板）；换成「同一工具报同一个错，连续 3 次拦下、5 次终止」（`laneRepeatedFailure.mts`） | — |
| C2 每一步改模型输入 | `prepareStep` 可以改 model、toolChoice、activeTools、system、messages | pi 的 `transform_context` 钩子 + pi 自动压缩 | 把预算 8 万 token 换算成 pi 的 `reserveTokens`（`laneContextBudget.mts:13-18`） | — |
| C3 停止 | `useChat().stop()` + `abortSignal` | pi 的 `lane.abort()` | 先让等待中的卡以 `cancelled` 收尾，再 abort；没送出去的插话放回输入框（`laneHost.mts:720-729`） | — |
| C4 回合中用户再说话 | 没有队列，推荐直接禁用输入 | pi 的 `steer` / `followUp` | 输入意图做成纯函数；有卡在等时，用户打的字就是对那张卡的回答 | 「在等用户」有**两种表示**：`pending` 进投影，`hold` 不进投影（`laneApprovalGate.ts:108-110`）。所以等付费卡时，输入框状态是 `running`，而不是 `awaiting-approval` |
| C5 重试和续流 | `regenerate`、`resumeStream`、`maxRetries` | pi 自动重试 3 次 + `lane.resume()` | 在助手文字 part 上挂「继续 / 重试」 | — |
| C6 状态 | `status`、`error` | pi 的 `operation` | `running` 布尔值 + 看门狗（首字 90 秒 / 空闲 120 秒） | 同 C4 的两种表示问题 |
| C7 批准后怎么接着跑 | 批准后**重新发一次请求**，服务端从头重跑（无状态） | pi 的 `before_tool` 钩子：调用停在钩子里 await，批准就是 resolve 这个 promise | — | — |

**判定：**
- **C1 有意不同。** 读画布一分钱不花，所以按次数限制衡量的是干了多少活，不是风险有多大。
- **C2、C5 一致**，跟 pi。
- **C3 有意不同。** 用户刚打的字不能丢。
- **C4 一致 + 没想到。** 一致的是用了 pi 的队列；没想到的是「等用户」被拆成了两种表示。
- **C6 有意不同**，同样有 C4 那个问题。
- **C7 有意不同。** pi 是本机长驻进程，调用就停在内存里等，不需要重发请求。

### 2.4 审批

| 行 | 它提供 | 我们用了 | 我们另写了 | 我们拆散了 |
|---|---|---|---|---|
| A1 声明哪个工具要批 | v6：`needsApproval`；v7：移到调用上的 `toolApproval`，`needsApproval` 弃用 | 无 | `preflightLaneApproval`：按能力契约的效果类、用户三档和本会话授权来判 | 「要不要出付费卡」有两个 owner：画布直生成归 `spendConfirm.ts`，Agent 面板归 `spendDecidedByPolicy` |
| A2 审批状态放在哪 | **就在消息里**：工具 part 的 `state` 依次是 approval-requested → approval-responded → output-available / output-denied，另带 `approval: { id, approved?, reason? }` | 只用了词表和标签，**没有数据** | 等待中的审批放在 `LaneProjection.pending`；结局写成宿主记录 `nomi.ui.approval`；面板再把两者拼回工具行 | 同一次审批分散在三处 |
| A3 回答的词汇 | `addToolApprovalResponse({ id, approved, reason? })`：二值加一句话 | — | 4 个动作、7 种结局，另加 hold 的 4 种结局 | — |
| A4 怎么等 | 无状态，流在请求审批处结束；pi 的 RPC 可以阻塞等待，还能加超时 | pi 的 `before_tool` | 等待**不设超时**；被打断时 resolve，不 reject | — |
| A5 付费卡是第二个渠道 | 无，SDK 只有一个渠道 | 用 `gate.hold` 替「画在别处」的卡等 | **五个零件**：轮询钩子 + 转接表 `spendDecisionWaiters.ts` + hold + 手写回执 + 三选一优先链（`ProjectAgentResidentShell.tsx:155`） | 同一次批准的「显示 / 决定 / 回执」在三个边界上各有一份 |
| A6 确认卡组件 | `Confirmation`：用 `state` + `approval.approved` 控制四个槽 | 无 | 介入槽 `V4Intervention`，付费卡里嵌着整件生成框 | 「按这份清单改一改再批」协议里没有，只能用带话的 deny 凑 |

**判定：**
- **A1 有意不同。**
- **A2 没想到。** 框架的做法是把审批状态放进工具 part，我们放在外面再拼回来。
- **A3 有意不同。** 一个 `output-denied` 分不出「说了不要」「按了停」「关了窗」「重启前没答完」，而这几种给用户的文案必须不同。
- **A4 有意不同。** 等用户不计时。
- **A5 没想到。** 这是全文最值钱的一行。
- **A6 有意不同。**

### 2.5 版本矩阵

| 功能 | `ai@4.3.19`（我们） | v5 | v6 | v7 |
|---|---|---|---|---|
| `UIMessage.parts` | 有 `parts`，但仍带 `content`；工具 part 叫 `tool-invocation` | 只剩 `parts`；工具 part 叫 `tool-<name>` | 同 v5，另加审批 3 态 | 同 v6，另加 `reasoning-file` |
| `ChatTransport` | 无 | 有 | 有 | 有 |
| `DirectChatTransport` | 无 | 无 | `ai@6.0.0` 里没有，之后哪个 6.x 加的**未核实** | 有 |
| `stopWhen` | `maxSteps` | 有 | 有 | 改名 `isStepCount` |
| **工具审批** | 无 | **无**（cookbook 里是手写的） | `needsApproval` | 改为 `toolApproval` |
| `generateObject` | 有 | 有 | 已弃用，仍可用 | 未核 |
| 模块格式 / Node | CJS 可用 | 未核 | **CJS 与 ESM 双格式**，Node ≥ 18 | **只有 ESM**，Node ≥ 22 |

---

## 3. pi 和 AI SDK 怎么分工

### 3.1 各管什么

| 职责 | pi（已在用） | AI SDK | 该归谁 |
|---|---|---|---|
| 循环、会话与持久化、插话、abort 后交还队列、压缩、重试 | 全有 | 没有这些，或只有薄薄一层 | **pi** |
| 审批**等待** | `before_tool` 可以无限期 await | 流结束后等下一次请求 | **pi 钩子**（我们的闸） |
| 审批**状态展示** | 无 | 工具 part 的三个审批态 | **照 SDK 的词表** |
| 消息数据模型 | `Entry` / `AgentMessage` | `UIMessage.parts` | 渲染层照 SDK 的形状；**持久化仍用 pi** |
| UI 状态 hook | 无 | `useChat` | **先不要**（见 §3.3） |
| UI 组件 | `pi-web-ui`（lit，版本落后） | AI Elements（Tailwind 4 + shadcn） | 用我们自己的（token + Mantine） |

**一句话：** AI SDK 是一套无状态的请求 / 响应工具箱，pi 是有状态的会话运行时。pi 管的那七件事 AI SDK 一件都没有，所以 AI SDK 替换不了 pi，只能补上「消息模型和审批状态」这一层。

### 3.2 别人是怎么做的

| 谁 | 循环在哪 | 渲染层怎么拿数据 | 传输 | 出处 |
|---|---|---|---|---|
| Cherry Studio（Electron） | 主进程，AI SDK 的流 | `useChat` + `IpcChatTransport` | IPC；主进程留一个环形缓冲，重连时先重放。**踩过坑**：长流重放卡死过渲染层，后来把重放封顶在 1000 块 | PR #18743；`src/renderer/services/aiTransport/IpcChatTransport.ts` |
| assistant-ui 的 Electron 指南 | 主进程 | `useLocalRuntime` | `MessageChannel`，事件格式自定义，**不是** `UIMessageChunk` | assistant-ui.com/docs/guides/electron |
| Mastra `@mastra/ai-sdk` | 自家运行时 | `useChat` | 把自家的流转成 `UIMessage` 块，转换器要带 v5 / v6 / v7 版本参数 | mastra.ai/guides/build-your-ui/ai-sdk-ui |
| AI SDK 官方 `@ai-sdk/langchain` | LangGraph | `useChat` | 官方维护的「外部运行时 → ChatTransport」适配器 | ai-sdk.dev（providers / adapters / langchain） |
| pi 自己 | agent 进程 | 任意客户端 | RPC：确认框阻塞，直到收到按 id 匹配的回复；上游 README 没提 AI SDK | `pi-coding-agent/docs/rpc.md` |
| Ably 自定义 transport | 服务端 | `useChat` | 报告的坑：`useChat` 假设「一个请求对应一个响应」；`stop()` 立刻返回，之后还可能有尾块；人工介入需要双向通道 | ably.com/blog/custom-transport-vercel-ai-sdk |

**结论：**
- 循环放在主进程、IPC 把流送到渲染层，这是普遍做法。
- 「pi 当运行时 + `UIMessageChunk` 适配器 + `useChat`」这个组合，**没找到现成产品**。真要这么做，Cherry 踩过的坑得自己再踩一遍。

### 3.3 三种形状

| 形状 | 做法 | 得到什么 | 代价与风险 |
|---|---|---|---|
| **S1 · `useChat` + IPC ChatTransport** | 主进程把 pi 事件翻译成 `UIMessageChunk` 流 | 现成的 `status` / `stop` / `regenerate` / `throttle` | 要新写适配器和重放缓冲，渲染层多出第二个状态主人。我们的转录有大量**非追加**变化（审批结局回填、领域刷新、压缩、向上翻页），chunk 流表达不了；重放可能卡死；协议还会随大版本漂移 |
| **S2 · 只取消息模型**（推荐） | 不上 `useChat`，把投影输出改成 `UIMessage` 的形状：一次工具调用 = 一个 part，带 `state` + `approval` + `output` | 消掉「按 id 拼 part」这一类 bug；两个死掉的审批态复活；审批和付费卡进同一份投影 | 要改 `LaneProjection` 的线上合同（约 15 个产品文件 + 17 个测试文件，一个 PR 改完，不留兼容层） |
| **S3 · 现状 + 补丁** | 保留 `LanePart`，只把三件并成一个 | 最小改动 | 词表继续手抄，SDK 升级时不会报错提醒 |

**推荐：先 S3，再到 S2；S1 等触发条件出现再说。** 理由：
- S1 修不了这次走查里的任何一条。
- S1 违背 R33（一个概念一个 owner）。
- S2 先做了也不白做：S1 同样要先做这一步。

**转向 S1 的触发条件：**
- 需要 `useChat` 的某项具体能力；
- 或者每个事件整份重发，在真机上成了瓶颈（§5.5 量过，目前不是）；
- 或者决定上 AI Elements 整套 UI。

---

## 4. 付费卡怎么映射到框架的审批

### 4.1 今天一次付费批准的路径

```
模型调 generate（入参只有 { operationId }，指向 Run 账本里的草稿）
  -> pi before_tool -> 闸 preflight
  -> preflightGenerate（laneExtendedDesktopPorts.ts:194-236）
       (1) registerSpendWaiter(projectId, operationId)      进程内 Map
       (2) generation.tryExecute -> Run 账本出价            面板每 1.5 秒轮询读到
       (3) gate.hold(...)                                   替「画在别处」的卡等
  用户点「生成」
  -> confirmPendingSpend（appIntegrationSpendConfirm.ts:372-437）
       (4)「逐镜」：present(selected) 收窄计划，planVersion + 1（:384-395）
       (5) decideGenerationSpend：封印 -> 收据 -> 决门 -> 消费 -> 开跑
       (6) settleSpendWaiter({ kind: 'confirmed' })   <- 只说「批了」，不说「派了哪几镜」
  -> generateReceipt：不看任何状态，直接写「已开始，别再调 generate」（laneExtendedTools.ts:131-134）
```

**三个洞：**
1. `SpendDecision` 只有 confirmed / declined，`GenerateUserDecision` 只有 approved / declined / redirected，**都没有范围字段**。
2. 回执的批准分支不看 Run 状态。
3. 卡片标题按整单镜数写 `count: shots.length`（`agentPanelSpendCard.ts:107`），而「逐镜」档的按钮只派当前这一页。

### 4.2 映射

| 框架（v6 及以后） | 我们的对应物 | 归谁 |
|---|---|---|
| `approval-requested` + `approval.id` | `LanePendingApproval.toolCallId` + 指向 Run 账本的 `operationId` | id 由闸出；卡内容由 **Run 宿主**出 |
| 确认卡上的「请求文字」 | 报价卡正文：镜头、参数、参考图 | **Run 宿主**（`PendingSpendConfirm`）。工具入参只有 `operationId`，卡内容必须从账本来 |
| `addToolApprovalResponse` | `confirmSpend(quoteId, shotIds)` / `discardSpend` | 决定仍然走 **Run 宿主**的 IPC |
| `output-available` | 派了哪几镜 | **Run 宿主**报 → 作为工具输出 |
| `output-denied` | 用户点 × / 改口 / 被停 | 3 种都是成功形状，靠 7 种结局细分 |
| `toModelOutput` | `generateReceipt` | 改成 **Run 状态的纯函数** |

### 4.3 一次批准能不能覆盖整次调用

- 一次批准是**一个信号**，不是一份内容。它指向草稿，但不包含草稿。
- 批准的范围必须是**当时摆在卡上的那一版计划**。「只批这一镜」在框架里没有对应物，所以要在批准之前先编辑计划：收窄计划 → `planVersion + 1` → 卡上摆收窄后的那一版 → 再批。
  - 今天的代码就是这么做的，但收窄发生在点击**之后**，卡和回执都不知道收窄过。
- 下面三样必须留在我们手里：
  - 哪几镜；
  - 哪些参考图，包括画布上连着的（今天用的是 `resolveReferenceSlots(node, [], [])`，传的是空的边和空的节点，见 `spendCardReferences.ts:20,54,62`）；
  - 真正开跑了什么。
- 要补的 owner 是 **「批准范围」**：由 Run 宿主产出，同一个值同时决定卡片标题、主按钮、派发和回执。渲染层不许自己数镜头，也不许自己推算范围。

### 4.4 目标形状

```
generate 工具 part：
  state: approval-requested          <- 由投影根据 pending 派生
  approval: { id: toolCallId }
  卡内容：PendingSpendConfirm（投影时 join，不复制进转录）
        + scope：{ shotIds[] }        <- 新增，由 Run 宿主产出

用户点「生成」-> confirmSpend(quoteId, shotIds)
  -> decideGenerationSpend -> { dispatched: shotId[], notDispatched: [{ shotId, reason }] }
  -> settleSpendWaiter({ kind: 'confirmed', dispatched, notDispatched })
工具 part：approval-responded -> output-available
  output = { status, dispatched[], notDispatched[], withdrawn? }   <- 模型和界面读同一份
  generateReceipt = f(Run 账本事实, 决策)
```

### 4.5 三条边界

- 渲染层只读投影里的 `scope` 和 `dispatched`，自己不数、不推、不补。
- 回执只从 Run 账本的事实派生。
- 内部 lane 和外部 MCP 的 `generate` 用同一个回执函数，并用对等测试守住。

---

## 5. 走查发现分桶

> 数据来源：`tests/ux/full-walk/reports/20260929-0.22.4-fe57d88f6.md`，产品代码在 origin/main `4a8c4f6b3`。
> 分桶依据是报告里写的「所在模块」，再加上读对应代码，**没有重跑**。U13、U15 没有复现，所以不分桶。

**三个桶的判据：**
- **(a)** 框架的运行时或数据结构强制了这条不变量，用上框架，这类 bug 就写不出来。
- **(b)** 领域逻辑，换任何框架都得我们自己修。框架只提供一个「槽」、映射还得我们自己写的，也算 (b)。
- **(c)** 一半一半。

| # | U | 规则 | 桶 | 机制 | 位置 |
|---|---|---|---|---|---|
| 1 | U01 | `card-scope-mismatch` | **(c)** | 框架那一半：审批绑定整次调用，所以卡上显示的和被批准的是同一个对象。我们这一半：产品允许只批其中一镜，这就得靠「先收窄计划再批」，再用一个 `scope` 值统一标题、按钮、派发和回执 | `agentPanelSpendCard.ts:107,144-148`；`appIntegrationSpendConfirm.ts:384-395` |
| 2 | U02 | `receipt-claims-whole-draft-started` | (b) | 回执不看 Run 状态就写死「已开始」 | `laneExtendedTools.ts:131-134`；`spendDecisionWaiters.ts:25-27` |
| 3 | — | `receipt-maybe-submitted-but-nothing-sent` | (b) | 失败一律当「结果未知」回给模型，没去读账本里「根本没提交」这个事实 | `laneFailureFromDecision.ts:71-74`；对照 `appIntegrationSpendConfirm.ts:277,435`（那里已有 `anySubmissionStarted`） |
| 4 | — | `ui-maybe-submitted-but-nothing-sent` | (b) | 失败码相同，所以面板也跟着说「可能已经提交了」 | 同上 + `laneToolFailureText.ts` |
| 5 | U03 | `sent-references-on-canvas` | (b) | 解析参考图时传的是空的边和空的节点 | `spendCardReferences.ts:20,54,62` |
| 6 | U04 | `agent-ignores-declared-default` | (b) | 模型索引只标出默认「模式」，没标出默认「模型」 | `laneModelContext.ts:11-45`；`semanticGenerationCandidate.ts:275-293` |
| 7 | U05 | `attachment-gone-after-send` | (b) | 投影出的 user 段里没有附件字段 | `laneProjection.ts:253-257` |
| 8 | U06 | `surface-creationSelection` | (b) | 新建分镜方案时顺手把 `activeStoryboardId` 设成了它 | `workbenchDocumentSlice.ts` ← `agentStoryboardDesign.ts:30` |
| 9 | U07 | `run-stuck-pausing` | (b) | 多镜调度器从不调用 `settlePauseIfQuiet` | `productionRunControl.ts:16-33`；`multiShotBatchScheduler.ts` |
| 10 | U08 | `9a-single-version-pill` | (b) | `showSingleProductionAction` 强制显示版本数 | `NodeResultStack.tsx:295,408` |
| 11 | U09 | `9b-saved-label-lingers` | (b) | 回执窗口过期后，没有人再渲染一帧 | `useGenerationFeedback.ts:9-16,69` |
| 12–13 | U10 | `overlay-out-of-viewport`、`close-button-unreachable` | (b) | 提示框容器不避让窗口边缘 | `src/ui/toast.tsx` |
| 14 | U10 | `9c-repeated-toast` | (b) | effect 每次重跑都会再发一遍同一条提示 | `useNodeModelAutoSelect.ts` |
| 15 | U11 | `input-tokens-over-budget` | (b) | 压缩机制是 pi 的，但预算这套策略是我们配的，没守住 | `laneContextBudget.mts:9-21`；`laneTools.mts:102-127` |
| 16 | U11 | `agent-write-receipt-stuck` | (b) | `preparing` 状态没有时限，之后每次写入都会被挡住 | `laneDesktopTools.ts:119,138`；`projectAgentProposalReceiptStore.ts:350-365` |
| 17 | U12 | `failure-reason-misstated` | (b) | HTTP 400 一律说成「参数不被接受」 | `classifyError.ts:443` |
| 18 | U12 | `failure-blamed-on-wrong-vendor` | (b) | 失败提示点的是「现在选中的这家」，而不是真正失败的那家 | `useNodeModelAutoSelect.ts` |
| 19 | U12 | `raw-english-in-chinese-ui` | (b) | 主进程的英文报错原样拼进了中文界面 | `productionShotActions.ts:7-20` |
| 20 | U12 | `stale-failure-toast` | (b) | 设了 `ttl: false` 的提示，节点成功后不会收回 | `useNodeModelAutoSelect.ts:117,252` |
| 21 | U14 | `ui-operation-failed-try-later` | (b) | 兜底文案一律写「稍后再试」 | `productionShotActions.ts:7-20` |
| 22 | — | `spinner-on-finished-node` | (b) | 节点已经是终态，转圈却没收掉 | `src/workbench/generationCanvas/nodes`（按报告归属，未逐行读） |
| 23 | — | `control-partly-covered` | (b) | 版本托盘不避让右侧面板 | `NodeResultStack.tsx`（按报告归属） |
| 24 | — | `egress-to-real-vendor` | (b) | 零花费走查时，模型清单探测和素材上传打到了真实供应商。这是隔离漏网，**不算产品违反** | `modelListProbe.ts`、`assetLocalization.ts` |

### 5.3 计数

| 口径 | (a) | (b) | (c) |
|---|---|---|---|
| 按规则（24 条） | **0** | **23** | **1** |
| 只算产品违反（23 条） | 0 | 22 | 1 |
| 按 U 编号（13 个） | 0 | 12 | 1 |

**按问题出在哪一层：**
- 消息 / 审批 / 工具结果层：6 条；
- Agent 上下文与循环（pi 层）：2 条；
- **没有任何框架层的地方：16 条**。

### 5.4 反过来：消息层确实出过真 bug

这 6 个都已修好，代码注释里留有证据。这一节就是「诊断方向对」的证据。

| # | 类别 | 出了什么事 | 证据 |
|---|---|---|---|
| 1 | 三个 part 靠 id 拼，顺序一错结果就错 | 每次拒绝或回答都被读成了失败 | `laneViewModel.ts:344-355` |
| 2 | 审批协议里没有「答了」这一档 | 反问用 deny 来送答案，转录里就留下一次用户没做过的拒绝 | `laneContracts.ts:562-571`；`laneApprovalGate.ts:329-342` |
| 3 | 内容为空的中断没有对应的 part | 用户以为没停下来 | `laneProjection.ts:68-80` |
| 4 | 回执写死「有一张卡在等」 | 模型让用户去点一张并不存在的卡 | `laneExtendedTools.ts:57-71` |
| 5 | 等用户的逻辑放错了层 | 撞上 60 秒的写入预算，三轮实测一次都没成功 | `laneExtendedTools.ts:115-126`；`spendDecisionWaiters.ts` |
| 6 | 修了一处，兄弟出口没跟上 | 同一类错误一天内出现第三次 | `laneFailureFromDecision.ts` |

用框架的写法对照：#1 和 #5 用「一个 part」+「审批是消息里的一等状态」可以直接消掉；#2 能消掉一部分。

### 5.5 每个事件整份重发，成本有多大

用真实的 `projectLaneSnapshot` 加上合成的转录量了一下。脚本放在会话的临时目录里，没有进仓库。

| 已加载 parts | 投影大小 | 投影耗时 | 序列化耗时 |
|---|---|---|---|
| 50 | 62 KB | 0.03 ms | 0.11 ms |
| 250 | 308 KB | 0.07 ms | 0.41 ms |
| 1000 | 1.2 MB | 0.10 ms | 2.1 ms |
| 2500 | 3.1 MB | 0.26 ms | 6.4 ms |

**结论：** 投影本身很便宜，序列化的开销随大小线性增长。**目前还不值得为这个转向 S1。** 渲染层这一半没有量。

---

## 6. 该删什么

删和加放在同一次改动里做（P1）。

**A 领域先修：** 替换，不删文件。
- 回执的批准分支 → 改成读 Run 账本的纯函数；
- 标题里的 `count: shots.length` → 改成由 `scope` 派生；
- 三处 `resolveReferenceSlots(node, [], [])` → 改成带上画布的边；
- `SpendDecision` / `GenerateUserDecision` → 带上 `dispatched` / `notDispatched`。

**B 付费卡并进投影：**
- 删掉轮询（`useAgentPanelSpendConfirm.ts:52,54-65,102-151`）；
- 删掉「读不到」分支的一部分；
- 三选一的优先链收成两选一（`ProjectAgentResidentShell.tsx:155`）；
- 「在等用户」的两种表示合成一种（`laneComposerIntent.ts:32-35` 与 `laneApprovalGate.ts:108-110`）。

**C1 一个调用一个 part：**
- 删掉 `LanePart` 里 `tool-call` / `tool-result` 和审批 `host-note` 的拼接；
- 删掉 `laneViewModel` 里的 `slots` / `denials` / `receiptFor` / `settledStatus` / `mergeAssistantTextPerTurn`；
- 把两个死掉的审批态接上数据。

**C2**（等 Step 0 做完以后）：
- 删掉手抄的七态，也就是 `V4ToolStatus` 和 `AI_ELEMENTS_TOOL_STATUSES`，以及它们的词表登记。

**不删：**
- 7 种审批结局；
- `nomi.ui.*` / `nomi.ctx.*` 宿主记录；
- `projectLaneSnapshot`「走一遍、不重排」的规则。

---

## 7. 现在修的，哪些会原样保留

| 要修的 | 唯一 owner | 为什么换不换框架都不变 |
|---|---|---|
| 批准范围 = 派发范围 | Run 宿主：`confirmPendingSpend` + `decideGenerationSpend`，新增的 `scope` 放进 `PendingSpendConfirm` | SDK 的审批是二值，没有地方放范围 |
| 回执读 Run 状态 | `generateReceipt` 的继任者，写成纯函数 | 它本来就是工具 `output` 该有的内容 |
| 参考图（包括画布连线） | `referenceSlots.ts` + `pendingSpendReferences.ts` | 纯画布 / Run 逻辑 |
| 失败不再一律说「结果未知」 | `laneFailureFromDecision.ts` + 账本的 `anySubmissionStarted` | 领域事实 |
| 闸的语义 | `createLaneApprovalGate` | 由「本机长驻 + 创作场景」决定 |
| 投影规则 | `laneProjection.ts` | 与框架无关 |
| 压缩、超时、截断 | `laneContextBudget.mts`、`laneTools.mts` | SDK 没有这些 |

---

## 8. 顺序和大小

| 步 | 做什么 | 规模 | 风险 | 会不会逼出大爆炸 |
|---|---|---|---|---|
| **A** 领域先修 | 批准范围、回执、参考图、失败文案 | M，约 10 个产品文件 + 8 个测试 | 中，涉及花钱路径 | 否 |
| **B** 付费卡并进投影 | 不再轮询；卡的内容在投影时 join | M–L，约 10–12 个文件 + e2e | 中。**删轮询之前，先枚举清楚有没有不走 lane 的待决付费**（比如分镜编辑器的「提交执行计划」） | 否 |
| **C1** 一个调用一个 part | 字段名和 SDK 的 `ToolUIPart` 保持一致 | L，约 15 个产品文件 + 9 个使用方 + 17 个测试 | 中，线上合同要一次改完 | **是，但范围有界**（一个 PR 改 30 多个文件） |
| **Step 0** 定 `ai` 主版本 | 只有要用 SDK 的运行时或真类型时才需要 | M，主进程 8 个文件 + 三个 provider 包 | 中 | **是**，`package.json` 里只能有一个 `ai` |
| **C2** 换成 SDK 的真类型 | `import type { ToolUIPart } from 'ai'` | S | 低 | 否 |
| **D** AI Elements 整套 UI | 需要 Tailwind 4 + shadcn | **XL，价值不明**：全仓 419 个 TSX 在用 `className`，33 个文件在用 Mantine，还有 token 门岗 | 高 | **是，整个应用都要动** |
| **E** S1 传输（`useChat` + IPC） | 见 §3.3 | L | 高 | 是 |

**Step 0 的几个选项：**

| 选项 | 好处 | 代价 |
|---|---|---|
| v6 | 和 AI Elements 主干同一版；CJS 与 ESM 双格式 | 维护线，以后还得再升 v7 |
| v7 | 最新版 | 只有 ESM；改名一大串；AI Elements 在 v7 上能不能用**未核实** |
| 主进程不再装 `ai` | 消掉「两套模型调用栈」这笔旧债 | 工作量最大 |
| **暂不装（现在推荐）** | 零依赖，A / B / C1 全部照样能做 | 手抄词表不会随 SDK 升级自动报错，要登记成带到期日的债 |

**为什么这个顺序不会白做：**
- A 是 Run 宿主的事，无论走哪条路都需要。
- B 让付费卡和其他审批走同一份投影，这件事本身就该做。
- C1 是 S2 的本体，也是 S1 适配器的输出形状。
- 反过来，如果先做 S1 或 D，就得先知道审批范围、回执和投影长什么样，而这些正是 A、B、C1 要定下来的。先做它们会返工。

---

## 9. 对最初诊断的判决

**对的部分：**
- 审批这一块完全对：
  - 两个审批态只画了词表，没接数据；
  - 审批的展示被拆成三处；
  - 一次付费批准被拆成五个零件。
- 这些地方出过真 bug（§5.4）。
- 词表是手抄的，没有编译期跟随 SDK。

**不对的部分：**
1. 「下面那一层是我们手写的」不成立。下面是 pi，而且用得很满，AI SDK 替换不了它。
2. 「渲染层手写了消息状态机」不成立。渲染层只是一个没有状态的订阅者。
3. 「这就是 bug 多的原因」不成立。24 条里 0 条会因为换框架而消失，16 条根本不在消息层。
4. 这笔债的前提已经过期：Agent 的底座是 pi。
5. AI Elements 不是一个装上就能用的包。值得接的部分已经接了，剩下的会和 token-only 的设计系统正面冲突。
6. 最大的一笔成本被漏掉了：主进程的 `ai` 钉死在 v4。

**更准确的说法：**
> 我们**没有把审批当成消息的一部分**，结果「一次批准」变成了五个零件、三个 owner。修法是先理清批准范围和回执的**主人**（Run 宿主），再让投影把审批放回工具 part。要不要用 SDK 的运行时，是之后另做的独立决定。

---

## 10. 没核实的

1. `DirectChatTransport` 是从哪个版本开始有的。
2. `throttle` / `repairToolCall` 是在哪个版本改的名。
3. AI Elements 主干能不能在 `ai@7` 上用。
4. `use-stick-to-bottom` 能不能单独用。
5. `ai` 从 4 升到 6 或 7 时，provider 包该配哪些版本。
6. 付费卡有没有不走 lane 的来源（删轮询之前必须先枚举清楚）。
7. 7 种审批结局放进 `ToolUIPart` 时该放在哪。
8. 打包版和真机上的表现，以及渲染层那一半的开销。
9. 「pi + UIMessageChunk + useChat」这个组合没有找到现成产品。
10. 分桶是读代码判的，没做「换框架后重跑走查」的实验。
11. `spinner-on-finished-node` 和 `control-partly-covered` 只按报告的归属判断，没有逐行读代码。
12. Cherry Studio 的缓冲数字来自 PR 描述。

## 附录 A：证据来源

**本仓：**
- `grep -rn "from 'ai'\|@ai-sdk" src` 结果为空；
- `approval-requested` / `approval-responded` 只命中类型、标签和设计实验室；
- 在 lane 和 v4 目录里 grep throttle / debounce / requestAnimationFrame，结果为空；
- 走查报告和它的规则归类文件。

**上游：**
- npm registry 的 dist-tags；
- ai-sdk.dev 的 transport、direct-chat-transport、v6 / v7 迁移指南、chatbot-tool-usage；
- Context7：`/vercel/ai` 的 4.3.19 / 5.0.0 / 6.0.0 三个版本；
- GitHub 源码：`chat-transport.ts` 和 `direct-chat-transport.ts`；
- `vercel/ai-elements`；
- Cherry Studio PR #18743；
- assistant-ui 的 Electron 指南；
- Mastra；
- Ably；
- pi 的 README、`rpc.md` 和 reducer。

## 附录 B：登记建议（本文不改 JSON）

1. 转正这笔债（2026-10-07 到期），二选一：
   - 按 `TEMPLATE-reference-conformance.md` 的九层格式整理成对照文档，在 `frameworks[]` 里给 `ai` 补上 `referenceConformance`，并删掉这条债；
   - 或者带着理由延期。
2. 把 R1、A2、A5 登记成「没想到」，分别绑到 §8 的 A / B / C1。
3. `concept-owners.json` 补两条：「批准范围」归 Run 宿主的 scope 产出点；「一次工具调用在转录里的形状」归 `projectLaneSnapshot`。
4. C1 里「和 `ToolUIPart` 同名的本地类型」登记成一笔带到期日的债。

---

## 一屏总结

- **框架给了什么：**
  - AI SDK：消息数据模型，一次工具调用就是一个 part，同时带 state、approval、output；v6 开始有审批状态；还有流协议和 `useChat`。
  - pi（已在用）：循环、会话、插话、abort、压缩、重试、能一直等下去的审批原语、转录协议。
  - AI Elements：拷源码式的组件，要 Tailwind 4 + shadcn。
- **我们多写了什么：**
  - 两个审批态只有词表，生产里从没赋过值；
  - 一次工具调用拆成三个 part，渲染时现拼；
  - 一次付费批准拆成五个零件；
  - 每个事件整份重发（目前还不是瓶颈）。
  - 走查的分桶是 (a) 0 · (b) 23 · (c) 1。
- **该删什么：** 付费卡的轮询和三选一优先链（B）；三个 part 的拼接（C1）；手抄的七态（C2，要等 Step 0）。AI Elements 整套 UI + Tailwind 4 不做。
- **先后顺序：**
  1. A 领域先修；
  2. B 付费卡并进投影；
  3. C1 一个调用一个 part；
  4. 暂不装新 SDK；
  5. S1 等触发条件出现再说。
