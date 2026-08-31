# Nomi Agent 根因研究总稿：从“工具调用器”到“可恢复的创作工作执行器”

日期：2026-09-01  
用途：给下一位审核/实现 AI 的总输入。本文汇总 PR #223 代码证据、Nomi 已有架构文档、用户提供的 Agent 课程材料，以及 Claude、Codex、Pi、Hermes、OpenHands、LangGraph 等成熟方案的一手资料。

状态标签：

- `Observed`：源码或官方资料直接写明；
- `Measured`：可复现计数、分支比较或测试数据；
- `Inferred`：由多个证据推导的机制；
- `Proposed`：下一轮建议，必须经过实现和真实任务验证。

## 0. 总判定

Nomi 当前真正缺的不是“再加几个工具”，甚至也不只是“把工具延迟加载”。根因是 Agent 的产品对象还没有被稳定地定义为：

> **围绕一个创作目标，持续读取项目事实、形成可编辑计划、请求必要确认、执行一次可验证的领域动作、观察结果、处理失败并在重启后继续的工作执行器。**

如果 Agent 只是“LLM + 50 个工具”，模型就会被迫选择 Nomi 内部的函数名、状态机步骤和 UI 动作；如果 Agent 只是“聊天 + prompt”，安全、可恢复、付费和版本冲突就会回到隐式约定。正确抽象在两者之间：

```text
用户目标
  -> Nomi Task / Operation（耐久身份）
  -> Context Compiler（只取当前需要的事实）
  -> Agent Loop（推理、计划、工具批次）
  -> Typed Proposal / Action（模型只提出意图）
  -> Host Policy（绑定、版本、预算、审批、幂等）
  -> Domain Authority（文稿 / 画布 / 时间轴 / ProductionRun）
  -> Observation / Receipt
  -> Agent 继续、结束、重试或等待用户
```

因此本轮建议不以“是否使用 Deferred Loading”作为第一决策，而以四个根因闸为顺序：

1. 先定义 Agent 的唯一工作对象和生命周期；
2. 再把模型面收敛到用户意图级接口，隐藏内部状态机；
3. 再把上下文、工具、Skill、MCP、审批和结果投影放进同一条可恢复控制面；
4. 最后才为真实存在的长尾工具引入 Deferred Loading。

## 1. 研究问题与证据方法

### 1.1 本轮真正要回答的问题

- Agent 的最小、稳定、可恢复抽象是什么？
- 哪些状态应由模型循环拥有，哪些必须由 Nomi Host/领域 owner 拥有？
- 成熟 Agent 是如何处理 context、tool、approval、interrupt、compaction、resume、events 的？
- Nomi PR #223 的代码和已批准设计，在哪些共享边界上发生了落差？
- 哪些能力应保留、合并、移出模型面或延后，而不是直接加工具/加子 Agent？

### 1.2 本轮材料

本轮使用了：

- 用户提供的 9 份课程材料：Function Calling/Structured Output、Claude Code tool loop、Deferred Loading、MCP、Skills、System Prompt/Context Rot、Compaction、Cache、JIT Context；
- Nomi PR #223 当前头 `origin/pr-223-head@48c019da`、本次复核的最新 `origin/main@5730b957`、旧 merge ref、同期 Agent/Canvas/Provider 分支；
- Nomi 当前事实文档 `docs/ARCHITECTURE-NOW.md`；
- Nomi 已批准设计与研究：`docs/superpowers/plans/2026-08-24-unified-agent-master-plan.md`、`docs/superpowers/specs/2026-08-22-unified-runtime-mcp-generation-design.md`、`docs/research/2026-08-24-agent-harness-survey.md`、`docs/guide/agent-runtime-source-reading-and-adaptation.md`；
- 官方资料：Anthropic、OpenAI、Pi、Hermes、OpenHands、LangGraph、MCP。

### 1.3 证据边界

官方产品的机制可以作为设计证据，但不能证明 Nomi 已实现同等行为。尤其是 provider-managed conversation、云端 sandbox、encrypted reasoning、tool search beta，都必须适配 Nomi 的本地优先、项目绑定、预算和回执模型。

## 2. 从第一性定义 Agent

### 2.1 Agent 不是模型，也不是工具列表

模型只产生下列几类输出：

1. 直接回答；
2. 结构化查询；
3. 结构化计划/提案；
4. 结构化工具调用；
5. 需要用户输入/确认；
6. 结束、失败或等待。

模型不能拥有：项目写权限、额度、API key、Provider task identity、ProductionRun 账本、最终用户批准、真实文件/节点/时间轴的版本真相。

所以 Agent 的核心不是“能调用多少函数”，而是一个**受约束的反馈控制环**：

```text
observe -> decide -> propose -> authorize -> effect -> observe
```

只要其中任何一段有第二个 owner，问题就会从另一个入口、provider、旧历史或重试路径重新出现。

### 2.2 Nomi 的 Agent 应该是什么

Nomi 不是通用 coding agent，也不是 NLE 自动化脚本。它的最小业务对象是“一个项目里的一条创作目标”，例如：

> 把这段旁白变成 6 个镜头，保持角色和场景一致，先给我可编辑分镜和预览，确认后再生成。

这条目标需要：文稿、分镜、生成计划、参考素材、时间轴、ProductionRun、审批和失败恢复，但用户不应该学习这些内部对象的名字。

因此，Nomi Agent 应由四层构成：

| 层 | 责任 | 不能做什么 |
|---|---|---|
| Cognitive loop | 理解目标、规划、选择下一步、解释结果 | 不直接写项目、不批准付费 |
| Control plane / Host | Thread、Operation、队列、审批、context revision、事件、恢复 | 不复制文稿/画布/ProductionRun 真相 |
| Capability adapters | 输入/输出 schema、preflight、effect、settlement、幂等 | 不自行创建第二本账 |
| Domain authorities | Document、Canvas、Timeline、Asset、ProductionRun、Provider | 不直接被模型或 renderer 绕过 |

这与 Nomi 已批准规格中“transport/projection 不是事实源、统一 capability 负责 typed output 与 stage-aware exposure”的边界一致（`docs/superpowers/specs/2026-08-22-unified-runtime-mcp-generation-design.md:90-101`），也与总方案中“12 个语义工具、一个控制面”的目标一致（`docs/superpowers/plans/2026-08-24-unified-agent-master-plan.md:14-41`）。

## 3. 顶尖成熟方案共同说明了什么

### 3.1 Claude / Anthropic

**官方工具循环（Observed）**：Claude 输出 `tool_use`，应用执行，再以 `tool_result` 回传；模型从不直接执行代码。[Tool Use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works)

**工具设计（Observed）**：官方建议合并相关操作，减少选择歧义；工具描述要说明“什么时候用”，而不只是“能做什么”。[Managed Agents Tools](https://platform.claude.com/docs/en/managed-agents/tools)

**Tool Search（Observed）**：工具少于 10 个、每次都用或定义很小时，普通调用更合适；超过 10 个、定义超过约 10k tokens、选择准确率下降或工具库持续增长时，才进入 search/deferred loading。[Tool Search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)

**Context engineering（Observed）**：长循环会不断增长上下文，目标是每轮保留最小的高信号 token 集合，而不是把所有数据塞给模型。[Effective Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

**长任务（Observed）**：Anthropic 的长运行 harness 研究指出，compaction 保连续性但不一定解决 context anxiety；在阶段边界使用结构化 handoff/reset 能把“旧上下文”转换成可验证的任务制品。[Harness Design for Long-Running Apps](https://www.anthropic.com/engineering/harness-design-long-running-apps)

**权限（Observed）**：Claude Code 将 sandbox（技术边界）和 permission policy（何时需要批准）分开，使用 deny→ask→allow；官方也承认 approval fatigue，因此减少低风险确认、把高风险动作交给分类器/人工，而不是每个底层函数都弹窗。[Permissions](https://code.claude.com/docs/en/permissions)、[Sandboxing](https://www.anthropic.com/engineering/claude-code-sandboxing)

**对 Nomi 的启示（Inferred）**：

- 先做少量意图级工具，再为长尾工具 search；
- compaction 之外必须有阶段 handoff（如 script → storyboard → generate → review）；
- 审批是动作类别/风险边界的事，不是工具数量的事；
- Skill 是流程知识，MCP 是外部连接，二者不能混成“可执行插件”。

**Managed Agents（Observed）**：Anthropic 进一步把长运行 Agent 拆成可替换的 `session / harness / sandbox`：session 是 context window 之外的追加式事件日志，harness 负责按位置取片、上下文编译和恢复，sandbox 只负责 hands；通过 `execute / provision / wake / getSession / emitEvent` 这类窄接口解耦 brain 与 hands，凭证留在 vault/proxy，不进入执行环境。[Scaling Managed Agents](https://www.anthropic.com/engineering/managed-agents)

**对 Nomi 的补充启示（Inferred）**：把 `ProjectAgentHost` 做成独立的本地控制面；Electron renderer、Pi loop、provider/sandbox 都只能通过稳定接口读写 durable event log。context 是 event log 的投影，不是第二本账；执行环境崩溃后可重建，不能把项目事实绑在一次 Electron 进程或一次模型 session 上。

### 3.2 Codex / OpenAI

**模型循环与结构化 item（Observed）**：OpenAI 对 Codex loop 的描述是：模型产生 final 或 tool call；执行结果作为结构化 item 追加回输入，直到 assistant 终止；reasoning、function call、function output 都是可关联的 item，而不是拼进一段模糊文本。[Unrolling the Codex Agent Loop](https://openai.com/index/unrolling-the-codex-agent-loop/)

**控制面（Observed）**：Codex App Server 将 Thread、Turn、Item、approval、interrupt、steer、resume/fork、compaction 做成可序列化协议；`item/completed`、`turn/completed` 是终态事件，不是“收到了流就算完成”。[Codex App Server](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)

**状态（Observed）**：OpenAI Conversations/Responses 将消息、tool call、tool output 作为持久 items，可跨 session/device/job 继续。[Conversation State](https://developers.openai.com/api/docs/guides/conversation-state)

**tool search（Observed）**：OpenAI Agents SDK 将 hosted tools、FunctionTool、MCP、ToolSearch 区分；namespace 先过滤，tool search 发现后再把精确定义带入运行。[Agents SDK Tools](https://openai.github.io/openai-agents-python/tools/)

**权限（Observed）**：Codex 把 sandbox 与 approval policy 分开；MCP 不自动继承 shell sandbox，需要自己的 guardrail、approval 和数据出站规则。[Running Codex Safely](https://openai.com/index/running-codex-safely/)、[MCP Tools and Connectors](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)

**Harness 效率（Observed）**：OpenAI 的近期 harness 工程文章将 deferred discovery、单工具输出上限、稳定的追加式 model-visible history、确定性工具序列化和运行时 approval policy 作为控制 context bloat 与缓存抖动的基础，而不是依赖 prompt 约束。[GPT-5.6 Harness Efficiency](https://openai.com/index/gpt-5-6-frontier-intelligence-efficiency/)

**对 Nomi 的启示（Inferred）**：

- Host 应保存结构化 tool call/result/approval，而不是把历史重新拼成 prompt；
- `TurnState` 是当前控制态，ProductionRun/预算/Artifact 仍属于 Nomi domain authority；
- pending approval、interrupt、steer、resume 必须有可恢复状态；
- tool search 不会替代模型面抽象，只处理真正的长尾。

### 3.3 Pi Agent / Pi Harness

**Agent loop（Observed）**：Pi 把 loop、stream/event sink、tool execution、steering、follow-up、`transformContext`、`convertToLlm`、before/after hooks 作为窄接口；tool batch 完成后才处理 steering；可声明 sequential/parallel；stream error 必须终止为明确状态。[Pi Agent Loop](https://github.com/earendil-works/pi/blob/main/packages/agent/src/agent-loop.ts)

**Compaction（Observed）**：Pi 的 compaction 在 context window 接近阈值时触发，生成结构化 summary/first-kept-entry，并从持久 session 重建；RPC 事件暴露 compaction start/end、tokensBefore、estimatedAfter、retry 等信息。[Pi Compaction](https://pi.dev/docs/latest/compaction)、[Pi RPC](https://pi.dev/docs/latest/rpc)

**对 Nomi 的启示（Inferred）**：

- Pi 适合做内部 AgentLoop adapter，不适合成为 Nomi 项目/ProductionRun 的真相源；
- Nomi 应使用 `transformContext` 风格的 request-only context compiler，而不是改变 durable history；
- Nomi 需要把 Pi 的 tool batch、steer、abort、compaction 事件接入自己的 Host settlement barrier。

### 3.4 Hermes Agent

Hermes 的官方实现把 prompt、tool/provider failover、压缩、重试、预算、持久化放在一个可观测 loop；每轮先追加用户消息，做 preflight/context compression，再调用模型，执行 tool calls，再回环。中断时丢弃未完成 API 线程响应，不写入 history；context engine 用深拷贝快照和 host timeout，超时不发布外部 durable state；并发 worker 有 start-order gate，late worker 不能二次写结果。[Hermes Agent Loop](https://github.com/xgaisystems/hermes-agent-NousResearch/blob/main/website/docs/developer-guide/agent-loop.md)、[Context Engine](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/context-engine-plugin.md)、[Tool Executor](https://github.com/NousResearch/hermes-agent/blob/main/agent/tool_executor.py)

**对 Nomi 的启示（Inferred）**：

- “中断”不是杀掉请求那么简单：未提交响应不能污染历史；已产生的外部副作用则要进入 uncertain/reconcile；
- 压缩必须在 preflight，不能等模型快爆了再临时拼一段摘要；
- 并行只适合无冲突只读工作，副作用动作要有 lock scope 和完成顺序。

### 3.5 OpenHands / LangGraph / DeepSeek Harness

**OpenHands（Observed）**：Agent 是无状态、事件驱动的 reasoning-action loop；每个 step 可暂停/恢复；Condenser 只读 View，可返回新 View 或 Condensation event；高风险 action 由 SecurityAnalyzer 决定 direct/confirmation。知识 Skill 按触发词激活，repository skill 常驻。[OpenHands Agent SDK](https://docs.openhands.dev/sdk/arch/agent)

**LangGraph（Observed）**：checkpointer 按 `thread_id` 保存短期图状态，store 保存跨线程长期事实；节点有 retry/timeout/error handler；`interrupt()` 暂停并由 checkpointer 恢复；超时会清理该 attempt writes，补偿可用 Saga/Command 路由。[Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)、[Fault Tolerance](https://docs.langchain.com/oss/python/langgraph/fault-tolerance)

**DeepSeek Harness（Nomi 既有研究记录）**：会话日志是唯一真相源，实时 agent 观测与 capability 事实分域；事件 producer/consumer 不代替 durable session。见 `docs/research/2026-08-24-agent-harness-survey.md:24-27`。

**共同启示（Inferred）**：

- conversation/history、短期运行态、长期 facts、domain effects 需要分层但不能互相复制；
- 每个可恢复工作都需要 thread/operation/checkpoint/attempt 身份；
- 事件用于观察，事实提交后才发布；
- condenser/compaction 只生成新 View/summary，不原地破坏 durable history。

## 4. Nomi PR #223 的根因对照

### RC-01：Agent 没有唯一的 durable conversation/control owner（P0）

**Observed：**

- `electron/ai/agentChatV2.ts:67` 有 `agentContextHost.run`；
- `electron/projectAgentHost/projectAgentExecutionCoordinator.ts:655-666` 却将 request 强制为 `history: { kind: "ephemeral" }`；
- `:1161-1167` 调用 `executionPrompt`；
- `electron/projectAgentHost/projectAgentExecutionHelpers.ts:44-55` 将所有旧 user/assistant 文本全文拼回新 prompt；
- `electron/harness/runtime/pi/run.mts:51-80` 每 turn 新建 Pi session，只有携带 snapshot 才恢复。

**机制：** Host ledger 记录一份历史，Pi 每轮拿到另一份 ephemeral prompt；tool items/receipt 不是连续的结构化上下文，compaction 不能跨 turn 真正工作，历史 token 线性重复。

**用户后果：** 长线程变慢，模型重复询问或丢失 tool result/ID；停止、重启、恢复和阶段切换容易出现“看似继续、实际重新猜”。

**修复：** Host 选作 durable conversation owner；使用一个 `AgentContextScope` 或 bounded context compiler；删除 `history: ephemeral` 和 `executionPrompt` 生产 fallback。`contextRef.contextRevision` 与 ledger/summary hash 绑定递增。

### RC-02：模型面与内部 capability/状态机一对一投影（P0/P1）

**Measured：** `agentToolCatalog.ts` 六组 descriptor 合计约 50 个模型工具，而 canonical registry 约 20 个 capability；`canvas-agent` 基础 projection 约 33 个，production profile 可达约 43 个。

**机制：** alias、operation alias、UI 状态动作和领域 capability 都进入同一 `RuntimeToolDescriptor` 列表。generation 的 create/submit/preview/gate/start、production 的 subscribe/decide/review/materialize 都被模型当成可选择函数。

**用户后果：** 模型在选择 Nomi 内部流程，而不是选择用户意图；错误选择、重复推进、误触发确认/提交的概率上升。

**修复：** canonical capability 留在内部；模型面改成约 12–18 个 semantic tools，普通任务只投影 6–10 个。将 gate/approve/progress/materialize 等移到 Host/UI event；长尾再 search/load。

### RC-03：上下文工程被当成 prompt 拼接（P1）

**Observed：** `agentContext.ts:73-97` 仅 join identity/panel/skill/memory；`agentChatV2.ts:88-100` 每轮重算 memory/skill；`run.mts:144-146` 仅以字符串方式注入 current context。

**机制：** 没有 section id/version/stability/trust/hash，也没有 JIT context provenance；memory 失败还在 `:93` 静默吞掉。

**修复：** PromptPipe sections + static/session/turn stability + trusted/user/external trust；项目 context index/search/read；动态内容后置；记录 token/bytes/source。

### RC-04：Compaction 没有应用层质量合同（P1）

**Observed：** `run.mts:200-205` 只记录 `compaction_end` 次数并发 warning；runtime metadata 没有决定、约束、待办、精确 ID、receipt 的结构。

**机制：** SDK snapshot 是否成功不等于创作任务语义是否保留；阶段切换时没有结构化 handoff/reset。

**修复：** 增加 `AgentContextSummaryV1`，schema 校验关键 ID/receipt，压缩失败保留最近窗口并显式告警；在 script/storyboard/generate/review 阶段边界生成 handoff artifact。

### RC-05：工具输出合同没有在唯一边界闭合（P1）

**Observed：** capability 层有 `outputSchema`，例如 `canvasRead.ts:302`、`canvasWrite.ts:409`、`mcpCapabilityProjection.ts:119-137`；但 `runtimePort.ts:29-37,59-65` 的 result 为 `unknown`，`run.mts:101-104` 可直接 `modelText(decision.result)`。

**修复：** runtime→model 只有一个 output projection：safeParse、尺寸限制、路径/凭据清洗、error code、receiptRef、provenance；schema 失败 fail closed。

### RC-06：事件结束与业务 settlement 没有统一 barrier（P1）

**机制推导：** Pi 的 `turn_end`/`agent_end` 是 loop 事件，Host 还要写 assistant/tool/proposal/task、等待 approval、flush ledger、处理外部 uncertain/reconcile。若 UI 把低层 end 当完成，会产生“卡显示完成但账本未 settle”。

**修复：** 定义 `execution_settled`：队列状态终结、effects/approval 已落账、持久化 flush 完成、外部任务明确 done/uncertain；只有该事件才能让 UI 显示完成。

### RC-07：PR 交付边界不是真正可审查的 Agent slice（P0）

**Measured：** PR head 与 `origin/main` 有约 767 文件差异；`merge-tree` 有多个领域冲突；当前 head 的 giant files 包括 coordinator 1908 行、state 809 行、mcpGenerationTools 803 行等。PR body 仍列出旧 blocker，且默认 `agentHostEnabled` 关闭，等待 #194 交互面。

**修复：** 先刷新 main，拆 owner/风险面；每个修复保持单一语义 owner，不能通过继续合并更多 provider/MCP/UI 变更来掩盖 Agent 核心未闭环。

## 5. 推荐目标架构：一条控制面，三种状态，四种投影

### 5.1 三种状态

```text
Conversation state
  模型/用户可见的结构化消息、计划、tool call/result、summary

Execution state
  当前 Operation / Attempt / approval / queue / lease / checkpoint / cancel

Domain state
  Document / Canvas / Timeline / Asset / ProductionRun / Provider / Artifact
```

Conversation state 不复制 domain state；execution state 不冒充 conversation；三者通过稳定引用关联：`threadId`, `turnId`, `operationId`, `toolCallId`, `approvalId`, `receiptId`, `runId`, `artifactId`, `contextRevision`。

### 5.2 四种投影

同一个 canonical capability 可有四种投影，但不能共享一个“所有字段都给所有入口”的 DTO：

1. **Model projection**：最少字段、用户意图级名字、下一步可决策结果；
2. **Host execution projection**：完整绑定、policy、precondition、hash、idempotency；
3. **UI projection**：状态、进度、审批卡、撤销入口；
4. **MCP projection**：协议 schema、lease、外部信任、脱敏、approval。

### 5.3 AgentLoop 与 Host 的职责

```text
Host.accept(intent)
  -> durable Operation/Turn
  -> contextCompiler(snapshot, summary, JIT facts)
  -> Pi AgentLoop.run/continue
      -> model final / typed query / typed proposal / tool call / ask user
  -> Host.preflight
      -> deny / ask / allow
  -> domain adapter effect
  -> Host.settle + append item + receipt
  -> event stream / next loop / wait
```

Host 可以借 Pi 的 loop、hook、steering、compaction 机制，但不得把 Pi `SessionManager` 变成 Nomi 的项目事实源。

## 6. 重新定义模型工具面：从“函数目录”到“创作意图目录”

### 6.1 第一批建议工具

建议先把模型面控制在 12–14 个高频语义工具：

1. `project_context`：读取当前项目、目标、选区、最近事实；
2. `document_read`：按 `scope` 读取全文/选区；
3. `document_edit`：按严格 `operation` 提交可撤文稿编辑；
4. `canvas_read`：按节点/结果/版本读取画布事实；
5. `canvas_plan`：分镜/站位/运镜等形成可编辑计划；
6. `canvas_edit`：批量 create/set/connect 的 typed operations；
7. `canvas_maintenance`：delete/tidy 的硬门动作；
8. `media_query`：search/inspect/range/waveform 的只读查询；
9. `timeline_read`：完整时间轴或范围读取；
10. `timeline_edit`：preview/apply/undo 一个可审查 EditPlan；
11. `export_job`：status/verify；start/cancel 仅在 Host approval 后发生；
12. `generation_plan`：create/patch/preview；
13. `generation_status`：read/reconcile/cancel；
14. `production_run`：create/read/control；artifact 内容读取可作为独立低频工具；
15. `skill_load`：读取一份经过 hash/visibility 校验的知识包。

数量不是硬 KPI；关键是普通创作请求只看到与目标相关的 6–10 个，且每个工具对应清晰用户意图、安全边界和结果合同。

### 6.2 必须移出普通模型面的动作

至少这些动作应成为 Host/UI event 或内部 execution transition：

- `nomi_start_generation`：只有用户确认后的 Host event 能启动；
- `decide_production_gate`、`review_production_artifact`：不能由模型伪造用户批准；
- `subscribe_production_run`：进度由 event stream 推送，模型只在需要时读状态；
- `materialize_production_storyboard`：从已批准 Artifact 进入 Canvas 的 Host/UI command；
- 低层 `arrange_*`、`create_camera_move` 等若只是 plan branch，不应分别成为模型选择分支。

### 6.3 什么时候才启用 Deferred Loading

满足任一条件再启用：

- 模型面长期超过 10 个且真实错误率上升；
- tool schema 确实超过约 10k tokens；
- 长尾 MCP/provider 工具库持续增长；
- A/B 证明语义合并后仍有选择冲突。

实现时保留 3–5 个高频核心工具常驻；`discover_tools` 只返回短 metadata；`load_tool` 精确返回 versioned schema；加载不能扩大 Host capability ceiling。

## 7. 用户提供的九份材料如何落到架构

### Function Calling / Structured Output

落点：模型是 untrusted intent emitter；每个调用经过 schema、业务语义、normalization、preflight、approval、effect、settlement。不能用自然语言解析工具决策，也不能把 free-form error 直接塞回下一轮。

### Claude Code tool pipeline

落点：把 `createHostTools` 与各 adapter 的逻辑收成一条带 receipt 的 pipeline；每阶段可观察、可重试或明确终止。

### Deferred Loading

落点：仅处理长尾，不替代 semantic tool design；动态 discovery 是资源获取层，不是权限层。

### MCP

落点：MCP 是 transport/control-plane，不是 Nomi 内部 Agent 的第二大脑；描述、结果、URL、图片和远端行为都按 external-untrusted 处理。

### Skills

落点：Skill 提供 procedural knowledge，不授予 capability；index 常驻、body 按需、references 最后；user Skill 不得覆盖 system policy。

### System Prompt / Context Rot

落点：PromptPipe section 有稳定等级和 trust；项目事实按 JIT 取；静态规则、动态项目、外部数据分开缓存和观测。

### Compaction

落点：轻压缩维持同一 Operation；阶段 handoff/reset 形成新的可验证上下文；保留 decisions/constraints/todos/exact IDs/receipts。

### Cache

落点：只有 provider usage 证明 cache hit 才宣称 cache；稳定 tools/system 前缀，动态内容后置；每 turn 新 session 不能假设跨 turn cache。

### JIT Context

落点：`index → search → read`，每次读取写 provenance、字节数和 revision；模型不默认读取整个项目。

## 8. 下一轮实施顺序

### Phase 0：冻结现有 PR

- 以最新 `origin/main` 重建干净分支；不要在冲突树上继续加功能；
- 将 PR 拆成 Host/runtime、semantic projection、context/compaction、UI/真实旅程四类 slice；
- 更新 PR body 和证据索引，删除过时 blocker/状态描述；
- 不改变已批准的 Nomi domain authority、预算、receipt、Undo 和 React Flow 单内核。

### Phase 1：先闭合 Agent 生命周期

- 定义 `Operation / Attempt / Step / Item / Checkpoint / Settlement`；
- Host 成为唯一 durable conversation/control owner；
- 删除 `history: ephemeral` + `executionPrompt` 生产 fallback；
- 实现 `run` / `continue` / `interrupt` / `steer` / `resume` 语义；
- 只有 settlement barrier 后才发 completed。

### Phase 2：模型面语义合并

- 生成 `modelToolSurfaceManifest`，记录每个模型工具到 canonical capability 的映射；
- 先实现 `generation_context + generation_plan + generation_status` 纵向切片；
- 移除 model-facing start/decide/review/subscribe/materialize；
- 对旧 alias 只保留 versioned reader/MCP compatibility，不重新暴露给新模型。

### Phase 3：Context/Prompt/Compaction

- PromptPipe section contract、trust、hash、stability；
- `AgentContextSummaryV1` + 关键 ID/receipt 校验；
- stage handoff artifact；
- 项目 index/search/read；
- context provenance、token budget、cache read/write 观测。

### Phase 4：统一结果和外部信任

- output schema、redaction、path/URL/credential scrub、size limit 唯一化；
- Skill/MCP/user data 进入 tainted projection；
- MCP approval、allowed_tools、出站数据记录；
- Host policy 继续是唯一权限边界。

### Phase 5：真实任务与 Deferred Loading

- 用真实任务 A/B 比较旧 projection 与 semantic projection；
- 只有指标显示长尾问题仍存在时才增加 discover/load；
- 运行打包 Electron 的 J1–J5：目标 → 计划 → 用户确认 → 执行 → 预览/导出 → 重启恢复。

## 9. 研究驱动的验收指标

### Agent 生命周期

- 30+ turns 重启后，user/tool/result/receipt 可恢复，不出现全文重复 prompt；
- interrupt、steer、follow-up、next-turn 语义可区分；
- tool batch 只执行一次，未知外部结果进入 reconcile，不盲重提；
- UI 只有 settlement 后显示完成。

### 模型面

- 普通创作任务首轮 ≤ 10 个工具；
- semantic projection 的错误工具率、重复调用率、无效参数率低于旧面；
- 每个模型工具能映射到清晰 user intent、risk、result kind；
- Host-only transition 不能由模型直接触发。

### 上下文

- 100 turn 线程的发送 token 不按全文历史重复增长；
- compaction 保留 goal/decisions/constraints/todos/exact IDs/receipts；
- JIT 读取有 source/revision/bytes/token provenance；
- provider cache 命中有实际 usage receipt，没有证据不能写“已缓存”。

### 安全

- MCP/Skill injection、恶意 URL、凭据、超大输出被标记/清洗/拒绝；
- output schema 失败不会进入模型上下文；
- dynamic tool load 不扩大 project lease、selected node、approval、budget；
- user gate 不可由模型工具伪造。

### 产品体验

- 用户只需表达创作目标，不需要学习 Nomi 内部 tool/operation 名称；
- 计划是可编辑、可预览、可撤销的中间产物；
- 失败显示具体步骤、人话原因和下一步；
- 页面切换不换 Agent，手动编辑不被静默覆盖，已确认任务不重复扣费。

## 10. 交给下一位审核 AI 的明确任务

请不要从“给每个 capability 增加 descriptor”开始。必须按以下顺序：

1. 先画出 Agent 的 `observe → decide → propose → authorize → effect → settle` 生命周期；
2. 读取 PR #223 的 Host、Pi runtime、ProductionRun、Artifact 和现有设计规格，列出每个状态的唯一 owner；
3. 生成 50 个当前 descriptor 的 `keep / merge / host-only / delete` 映射；
4. 实现一个 semantic tool vertical slice，并删除同一提交中的旧 model projection；
5. 补 context/summary/settlement 证据，再评估是否需要 Deferred Loading；
6. 用真实创作任务和打包 Electron 旅程验收，不以单元测试全绿代替用户闭环；
7. 每个 recurring/high-risk 根因写 schema-v3 root-cause contract，说明共享边界、结构预防、同类入口、类级测试和旧路径删除。

## 11. 最后判断

成熟产品的共同答案不是“工具越多越先进”，而是：**模型循环要小，控制面要清楚，状态要耐久，领域副作用要有唯一 authority，复杂能力通过意图级接口和按需知识逐步显现。**

Nomi 已经有很有价值的 Host、Capability Registry、ProductionRun、proposal/receipt、project lease 和 React Flow 单内核。下一步不是推翻它们，也不是继续把内部动作投影给模型，而是把已批准的“12 语义工具、一个常驻 Agent、一个确认面、一个事件/任务事实链”真正落回代码。工具减少只是结果；根因修复是让 Agent 终于围绕“用户要完成什么创作工作”运行，而不是围绕“仓库里有哪些函数”运行。
