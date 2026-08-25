# MCP 客户端优先授权与一次确认设计

> 状态：用户已确认方向；P0 授权/体验 seam 已实现并完成零额度回归。用户进一步确认采用“客户端内一次确认”方案：已登记 MCP 客户端的标准 elicitation 响应可以直接完成本次 challenge 的授权；不支持/未登记/连接失效时才由 Nomi GUI 兜底。真实 provider 接入仍是下一决策点。本文是 `2026-08-22-nomi-unified-editor-runtime.md` 与 `2026-08-22-mcp-ai-generation-vertical-slice.md` 的用户体验补充，不建立第二套运行时方案。
>
> 目标：在不降低项目隔离、真人审批、一次提交和崩溃恢复约束的前提下，把用户需要做的确认收敛为一次，并放在用户正在使用的 Claude Code / Codex / Cursor 等客户端里；客户端做不到时，才由 Nomi GUI 兜底。

## 1. 从用户摩擦出发

用户真正想做的是“让当前 AI 助手用 Nomi 当前项目完成一次生成”，不是学习 Nomi 的授权术语，也不是在两个软件之间来回点击。

当前方案存在五个相邻摩擦点：

| 摩擦 | 现状证据 | 用户后果 | 本设计的处理 |
|---|---|---|---|
| 连接、项目授权、生成审批混在一起 | `src/ui/onboarding/ConnectAssistantCard.tsx` 只负责写 MCP 配置；计划又要求 `session/open` 先拿 handle、随后再走 gate | 用户以为“已经接入”却还要再授权，或者连续点两次 | 连接只建立客户端身份；只读上下文复用当前项目；第一次生成把项目范围和生成审批合成一次确认 |
| 客户端确认后再回 Nomi 点一次 | `electron/capabilityCore/mcpProtocol.ts` 已有 elicitation，但旧链路传递裸 `spendConfirmed` | 同一件事被问两遍，信任感下降 | attested client 的一次 accept 由主进程直接铸 receipt；没有 attestation 才跳 Nomi，一次完成，不二次确认 |
| `session/open` 需要 host 先拿 opaque handle | 当前 canonical plan 只接受 `ProjectSelectionHandleV1`，host 没有自然的 bootstrap 入口 | 用户卡在“handle 从哪来” | 保留已签发 handle；新增 server-owned bootstrap seam，由连接身份解析当前项目，不接受 host 自报 `projectId/path` |
| 每个读取/轮询/恢复都可能重新问 | 现有 `mcpSpendTrust` 是进程内重复确认/信任地图；新 lease 也可能被误用成每步门 | 长任务变成确认马拉松 | lease 按 MCP session 复用；同一 sealed contract 的轮询、取消、重连、reconcile 不重新确认 |
| 出错时让用户看协议错误码 | RPC/MCP 已有 typed fields，但用户真正需要的是下一步 | “human_approval_required” 对用户没有行动指引 | 统一 `nextAction`：在客户端确认、打开 Nomi、重试当前预览、或等待对账；协议字段仍保留给机器 |

这些优化不改变安全事实：脱离正在等待的 elicitation 请求的 `confirm:true`、`spendConfirmed`、bearer token 或 `projectId` 都不是凭证。客户端内确认的安全依据是“已登记通道 + 服务端当前未过期 challenge 的响应关联”，不是消息里某个裸 boolean 自己声称有权限。这个取舍明确牺牲了“证明物理点击来自真人”的强保证，换取用户无需切换到 Nomi；因此无人值守/未登记连接仍不会获得语义生成权限。

## 2. 选择的用户流程

### 2.1 连接时不再增加一层授权

用户在 Nomi 设置里点击现有的“接入 AI 编程助手”后，Nomi 写入配置、完成握手并登记该客户端通道。这里不再增加“授权当前项目”第二个按钮；连接本身只表达“允许这个软件连接 Nomi”，不表达花费权限。

连接成功后，客户端可以获得当前活动项目的只读上下文租约：

```text
连接 MCP（用户已有的一次动作）
→ 主进程验证已登记客户端 + 当前活动项目
→ 静默签发 session lease(scope: read/context)
→ 助手可以读项目上下文、提出计划、展示预览
```

如果没有稳定的活动项目，或者项目已被删除、重建、改代际，不能猜路径或回退到 body `projectId`；返回可行动的 `open_in_nomi/select_project`。

### 2.2 第一次生成只问一次

当计划已经形成、主进程能重新计算模型和成本时，生成 gate 变成一次组合确认：

```text
助手里的一个确认框：
“允许 Nomi 在项目《短片 A》中，使用模型 X，最多花费 ¥Y，生成这一镜吗？”
                         ↓ 一次点击
主进程验证客户端通道 + challenge + 项目代际 + 当前价格
→ 原子升级 lease(scope: generation_submit)
→ 铸造并消费 HumanApprovalReceipt
→ 写入 Run intent / reservation / envelope
→ 只提交一次
```

该确认框只展示用户能做决定的信息：项目名、镜头摘要、模型、参考图数量、估算成本、有效期。内部 hash、nonce、provider/account namespace 仍签名保存但不要求用户阅读。

如果客户端支持 MCP elicitation 且已经是已登记客户端，确认就在客户端发生。这里采用“登记通道信任”而不是要求每个客户端实现 Nomi 专用的点击签名：服务端只接受自己刚刚发出的、仍在等待中的 challenge 响应，并把响应与已验证的客户端通道、当前项目、一次性 challenge 和过期时间绑定。这样用户只需在正在使用的 Claude/Codex/Cursor 中点一次；客户端不会因为没有 Nomi 专用 attestation 而把用户赶回另一个软件。MCP 规范并不规定具体 UI，因此 Nomi 不假定某一个软件的按钮样式。[MCP Elicitation 规范](https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation)

如果客户端没有 elicitation、未登记或连接在 challenge 期间失效，主进程返回 `human_approval_required` 和 project-scoped handoff/deep link，Nomi GUI 显示同一份确认内容。GUI 点击后直接生成 receipt，客户端只继续原请求；不再让用户在 GUI 点完又回客户端确认第二次。

### 2.3 后续只在“实质变化”时再问

同一项目、同一 MCP session、同一 sealed contract 和同一 cost scope 内：

- 读取上下文、查看预览、查看进度、取消、重连、reconcile：不再确认；
- provider 已接受但丢失 task ID：只允许 reconcile，不重新提交；
- 同一 command/idempotency key 重放：返回原 receipt/receipt result，不新增点击；
- 新项目/新项目代际、lease 过期或撤销、scope 扩大、模型/账户/价格/成本上限变化、新的 generation contract：重新确认一次；
- `artifact_adopt`、导出发布等后置高影响动作：使用各自的后置 gate，不偷借 generation receipt。

### 2.4 MCP 也必须像真实界面一样可编辑

MCP 不是只能提交一份固定表单的“窄入口”。在生成合同封存前，用户应能通过当前客户端反复调整与 UI 同一语义层的内容：模型/provider、生成模式、提示词、参考素材的添加/替换/删除/排序、画幅、时长、质量和其他当前模块声明支持的参数。每次调整都重新计算能力、成本、预览和候选合同；调整过程不产生 provider call、扣费、Asset 或真人确认。

“像 UI 一样可编辑”指语义能力和边界一致，不要求 Claude/Codex/Cursor 复制 Nomi 的控件外观。UI 能做的动作，只要当前模块/模型能力允许，就必须有一个等价的 MCP 语义操作；能力不允许时要明确返回 `unsupported_capability`/`new_draft_required`，不能静默丢字段、偷偷降级或把旧值继续沿用。

一旦真人 challenge 发出、合同封存或 provider 已提交，模型、provider、模式、输入素材、成本、幂等键和 providerTaskId 都不可原地修改。用户要改这些内容时，系统应保留当前 Run 的事实，创建新的候选/草稿并重新预览、确认；已提交的任务只能查询、取消或对账。

## 3. 信任边界与兼容策略

### 3.1 主进程仍是唯一 authority

主进程负责：

1. 从已登记客户端通道解析当前项目，不能接受 host 自报项目路径或任意 `projectId`；
2. 生成并持久化 challenge，重新计算合同、价格和 scope；
3. 验证客户端 attestation 或 Nomi GUI 的 main-process gesture；
4. 原子签发/消费 lease 和 receipt，并把消费记录交给 ProductionRun/WAL；
5. 将 challenge/receipt 与项目 UUID、代际、revision、contractHash、costScope 和 fencing epoch 绑定。

客户端和 GUI 都只是同一 challenge 的展示/回答面，不是状态 owner，也不能制造 receipt、grant、providerTaskId 或 assetId。

### 3.2 客户端能力分层

| 客户端状态 | 用户看到的动作 | Nomi 行为 |
|---|---|---|
| 已登记 + 支持 elicitation | 客户端内一次确认 | 主进程把当前等待中的 challenge 响应直接铸成 receipt；不打开 Nomi |
| 未登记、连接失效或客户端不支持 elicitation | 客户端收到清晰提示，点击“在 Nomi 确认” | 打开 Nomi 同一 challenge；一次 GUI 点击后继续 |
| 未接入/客户端不可用 | Nomi 设置里的接入提示 | 先完成连接；不进入生成，不要求用户填配置 |
| 项目失效/代际变化/权限不足 | “选择项目/重新授权” | 只给一个明确下一步；不让用户猜错误码 |

旧 `nomi_generate` 和旧 `spendConfirmed` 兼容行为在迁移完成前保留，但不得把它们描述为新 semantic generation 的安全凭证。新工具只接受主进程签发的 typed receipt/lease。

## 4. 方案不变量（用户简单，后台严格）

- 同一个用户意图最多一个可见确认；同一 challenge 重试不新增确认；
- 确认前 provider/spend/materialization 均为 0；
- 一次确认最多产生一个 sealed contract、一个 reservation、一个 provider idempotency key；
- `submission_unknown` 永远是 reconcile-only，不盲目重提；
- 不因客户端不支持 elicitation 而报“请看文档”，而是给可点击的 Nomi handoff；
- 不因安全校验而让用户输入 handle、路径、projectId、hash 或成本数字；
- 用户确认文本来自主进程重新解析的当前状态，host 提供的摘要只能作为不可信候选；
- 封存前模型、provider、模式、参数和参考素材可自由调整，且每次调整都可在预览中解释；封存后不允许原地改写；
- MCP 语义操作与 GUI 操作共享同一能力声明、合同编译器和错误边界，不为某个客户端复制一套特殊流程；
- 连接、授权、生成审批的文案各自只有一个心智：连接软件、允许本次生成、查看/撤销授权。

## 5. 交付顺序

1. **方案先行**：本设计、聚焦 UX 审计、两份 canonical plan 和 backlog 同步；没有第二套路线。用户已确认 A：标准 MCP 客户端确认优先，Nomi 仅兜底。
2. **P0 seam**：实现 bootstrap resolver/client registry；只读 lease 静默建立；组合 challenge 原子升级 generation scope + receipt；GUI/client 两条回答面共用一个 challenge。
3. **零额度验证**：fake client/fake provider 验证一次确认、无二次确认、重连复用、项目变化再问、unknown 只对账；同一用户意图在 MCP 中替换模型/provider、替换/删除/排序参考素材、切换模式和修改参数时，合同预览与 UI 语义保持一致。
4. **真实 host 走查**：至少覆盖已登记客户端、只支持 elicitation 的客户端、无 elicitation 的客户端；记录截图和用户动作数。
5. **再进入 provider/P3**：所有 UX 不变量和安全对抗证据通过后，才接真实 adapter/付费路径。

## 6. 用户验收问题

真实用户只需要回答：

1. “我在 Claude/Codex/Cursor 里点一次确认后，是否能继续，不需要再回 Nomi 点第二次？”
2. “客户端不支持时，Nomi 是否自动给我一个明确的确认入口，而不是让我自己找设置？”
3. “我是否不用理解 lease、receipt、handle、contractHash 这些词？”
4. “同一任务重连或查看进度时，是否没有被反复打断？”
5. “我能否像在 Nomi 界面里一样，在真正确认前自由调整模型、模式、参数和参考素材？”

只要答案有一项是否定，优先改体验入口或下一步提示，不通过增加说明文字来掩盖流程复杂度。

## 7. 所有用户可见面的共同 UX 底线

这里的“用户可见面”不只指 Nomi 网页或窗口，也包括 MCP elicitation、MCP structured result、进度通知、错误/恢复提示、Nomi GUI 兜底卡、任务中心和 Artifact 预览。它们必须共享同一套用户心智，不因为传输方式不同而变成两套产品。

本方案把用户提供的七条原则转成以下可验收不变量：

1. **少即是多**：每个状态只展示用户当前需要做决定的信息；模型、成本、素材和下一步是主信息，lease、receipt、hash、nonce、providerTaskId 等内部字段默认隐藏。
2. **用户控制**：可撤销的草稿/候选必须能取消、返回或重新规划；任何不可逆的 provider 提交、扣费、合同封存和工程采纳都必须有清晰的边界，不用误导性文案诱导点击。
3. **直观一致**：同一动作在 MCP、GUI、任务中心和错误恢复中使用同一动词和结果含义；不要求用户学习阶段名或协议术语。
4. **可访问**：状态不能只靠颜色表达；确认/取消、进行中/成功/失败/未知都要有文字或标准图标、键盘可达焦点和可读的状态说明。
5. **知道事情在进行**：提交前、提交中、查询中、对账中、物化中都要给即时反馈，并告诉用户现在能做什么、不能做什么。
6. **失败也可理解**：错误要说明发生了什么、是否可能已扣费、下一步只有一个主动作；`submission_unknown` 不得显示成失败后可直接重试，也不得伪装成完成。
7. **持续迭代**：每个真实用户旅程都记录可见点击数、等待节点、错误恢复动作和最终结果；截图/走查与自动断言一起作为验收证据，发现用户需要额外解释时优先简化流程而不是继续加说明。

任何新增用户可见流程在进入实现前，都要能回答五个问题：用户此刻要决定什么、主按钮是什么、当前状态是什么、失败后下一步是什么、键盘/非颜色用户如何理解它。回答不清楚就不能以“后台能力已完成”视为完成。
