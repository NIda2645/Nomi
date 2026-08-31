# Nomi Agent 根因解决方案与执行计划

日期：2026-09-01  
用途：作为 PR #223 后续实现、审核 AI、对抗评审和真实创作验收的统一输入。  
范围：Agent Host、Pi runtime、模型工具面、Context/Compaction、Provider/ProductionRun 副作用、权限/信任、PR 拆分与验证。

本文不是“再列一遍问题”。它回答：每一个根因具体由谁负责、在哪个边界修、旧路径如何删除、怎么证明没有从另一个入口复发。

## 0. 最终目标

Nomi Agent 的产品对象定义为：

> 围绕一个创作目标，读取项目事实，形成可编辑计划，请求必要确认，执行一次可验证的领域动作，观察结果，处理失败，并在重启后继续的创作工作执行器。

用户应该只表达“我要完成什么视频工作”，不需要学习 Nomi 的内部函数名、状态机步骤、Provider task ID 或 ProductionRun gate。

目标控制环：

```text
observe → discover Skill → load Skill → decide → propose → authorize → effect → settle → observe
```

其中：

- 模型只能产生意图、查询、计划、提案和结构化调用；
- Host 负责 Thread/Turn/Item、策略、审批、预算、恢复和事件账本；
- capability adapter 负责 canonical schema、preflight、幂等和 effect；
- Skill 负责方法论、流程知识和输出约束，但不授予工具、项目写入、预算或付费权限；
- Document、Canvas、Timeline、Asset、ProductionRun、Provider 各自保持唯一事实源；
- renderer 只消费事件投影，不拥有 Agent 或副作用状态。

## 1. 证据与约束

### 1.1 本地证据

本计划以以下真实材料为基线：

- PR #223：`origin/pr-223-head@48c019da1d580dba90b157833fc1170370a802a4`；
- 当前主线基线（本次复核）：`origin/main@5730b957`；工作树 HEAD 为其父提交 `7b70993bb`，因此不能把工作树 HEAD 误称为最新 main；
- [统一 Agent 总体方案](../superpowers/plans/2026-08-24-unified-agent-master-plan.md:14-41,100-152)：已经确定“一个控制面、12 个语义工具、一个确认面、事件/任务事实链”，并批准受控 Pi AgentSession；
- [统一运行时与 MCP/生成设计](../superpowers/specs/2026-08-22-unified-runtime-mcp-generation-design.md:90-101,205-220,330-365,473-560)：规定 transport/projection 不是事实源，要求 typed output、lease、幂等、预算、receipt 和恢复；
- [Agent harness 调研](../research/2026-08-24-agent-harness-survey.md:18-50)：记录 Thread→Turn→Item、事件溯源、单审批信道、压缩、Skill 渐进披露、maxTurns 和 v1 不做 subagents；
- [Agent runtime 适配指南](../guide/agent-runtime-source-reading-and-adaptation.md:8-24,41-82,117-188)：区分 Codex control plane、Pi loop、Pi harness 与 Nomi domain authority；
- PR #223 代码：`electron/ai/agentChatV2.ts`、`electron/harness/agentChatPolicy.ts`、`electron/harness/tools/agentToolCatalog.ts`、`electron/harness/runtime/pi/run.mts`、`electron/projectAgentHost/projectAgentExecutionCoordinator.ts`、`electron/projectAgentHost/projectAgentExecutionHelpers.ts`、`electron/harness/runtime/runtimePort.ts`。

### 1.2 外部一手证据

- Anthropic：[工具设计](https://platform.claude.com/docs/en/managed-agents/tools)、[Tool Search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)、[Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)、[长运行 Harness](https://www.anthropic.com/engineering/harness-design-long-running-apps)、[Managed Agents](https://www.anthropic.com/engineering/managed-agents)、[Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)；
- OpenAI：[Codex loop](https://openai.com/index/unrolling-the-codex-agent-loop/)、[Codex Harness/App Server](https://openai.com/index/unlocking-the-codex-harness/)、[Conversation state](https://developers.openai.com/api/docs/guides/conversation-state)、[MCP/Connectors](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)、[Harness efficiency](https://openai.com/index/gpt-5-6-frontier-intelligence-efficiency/)、[Background mode](https://developers.openai.com/api/docs/guides/background)；
- Pi：[agent loop](https://github.com/earendil-works/pi/blob/main/packages/agent/src/agent-loop.ts)、[compaction](https://pi.dev/docs/latest/compaction)、[RPC](https://pi.dev/docs/latest/rpc)；
- Hermes：[agent loop](https://github.com/xgaisystems/hermes-agent-NousResearch/blob/main/website/docs/developer-guide/agent-loop.md)、[tool executor](https://github.com/NousResearch/hermes-agent/blob/main/agent/tool_executor.py)；
- OpenHands：[Agent SDK architecture](https://docs.openhands.dev/sdk/arch/agent)；LangGraph：[persistence](https://docs.langchain.com/oss/python/langgraph/persistence)、[fault tolerance](https://docs.langchain.com/oss/python/langgraph/fault-tolerance)。

外部产品的性能数字、云端 sandbox 和 provider-managed conversation 不作为 Nomi 已有能力，只作为边界设计证据。

## 2. 根因到解决方案总表

| 根因 | 缺失不变量 | 最早共享修复边界 | 具体方案 | 必删旧路径 | 主要证明 |
|---|---|---|---|---|---|
| RC-01 状态 owner 分裂 | 一个 Thread/Turn 只有一个 durable control owner | `ProjectAgentHost` | append-only event ledger + Thread/Turn/Item/Checkpoint | `history:{kind:'ephemeral'}` 生产路径、全文 `executionPrompt` replay | 重启/断线/renderer remount 不重复 effect |
| RC-02 模型面暴露内部状态机 | 一个用户意图对应一个 semantic tool | `modelToolSurfaceManifest` | alias 合并、Host-only transition、按阶段投影 | 旧 alias/`create-submit-start-gate` 原样 model projection | 工具选择/重复调用/无效参数下降 |
| RC-03 Context 只是字符串拼接 | 每个输入 section 有稳定性、信任、版本、来源和预算 | `ContextCompiler` | PromptPipe + JIT index/search/read + provenance | 全量 skill/项目/历史字符串 join | 100 turn 不线性复制、恶意内容不能改 policy |
| RC-04 Compaction 无语义合同 | 摘要必须保留目标、决策、约束、待办、精确 ID、receipt | Host summary publisher | `AgentContextSummaryV1` + stage handoff | 只记 compaction 次数的“成功”判断 | 摘要损坏/缺 ID 时 fail closed |
| RC-05 输出合同不闭合 | 任意进入模型的结果先过唯一 typed/safe projection | `runtime → model` adapter | safeParse、redact、size cap、error code、receiptRef | `unknown` 直接 `modelText()` | schema violation=0 进入模型上下文 |
| RC-06 effect 与完成态无 barrier | UI completed 必须晚于所有 effect/approval/ledger settle | `EffectExecutor` + Host reducer | prepare→approve→lock→effect→receipt→settle；unknown/reconcile | 以 `agent_end`、stream close 或 provider response 当完成 | settled-before-complete=0、重复扣费=0 |
| RC-07 PR 变更范围不可审查 | 一个 PR 只改变一个风险面且从最新主线可合并 | 交付分支与验证编排 | stack PR、每层独立 gates、无跨域冲突 | 在 767 文件冲突树继续堆 capability | merge-tree 干净、每层可独立回滚 |

## 3. 目标数据模型与状态机

### 3.1 Host durable primitive

```ts
type ThreadStatus = 'idle' | 'running' | 'awaiting_input' | 'interrupted' | 'failed' | 'completed'
type TurnStatus = 'queued' | 'running' | 'awaiting_approval' | 'settling' | 'interrupted' | 'failed' | 'completed'
type ItemKind = 'user' | 'assistant' | 'reasoning' | 'tool_call' | 'tool_result' | 'approval' | 'compaction' | 'receipt' | 'handoff'

interface AgentThread {
  schemaVersion: 1
  threadId: string
  projectBinding: { projectId: string; immutableProjectUuid: string; projectGeneration: number }
  status: ThreadStatus
  revision: number
  contextRevision: number
  nextSeq: number
  summaryRef?: string
  updatedAt: string
}

interface AgentTurn {
  schemaVersion: 1
  turnId: string
  threadId: string
  status: TurnStatus
  userGoalRef: string
  baseRevision: number
  contextRef: { contextRevision: number; compileHash: string }
  attemptId?: string
  idempotencyKey: string
  lastSeq: number
}

interface AgentItem {
  schemaVersion: 1
  itemId: string
  threadId: string
  turnId: string
  seq: number
  kind: ItemKind
  lifecycle: 'started' | 'streaming' | 'completed' | 'failed' | 'declined'
  payloadRef: string
  payloadHash: string
  trust: 'trusted' | 'project' | 'user' | 'external'
  createdAt: string
}

interface ToolReceipt {
  schemaVersion: 1
  receiptId: string
  toolCallId: string
  operationId: string
  attemptId: string
  stage: 'validated' | 'authorized' | 'executed' | 'settled' | 'uncertain' | 'reconciled' | 'compensated'
  inputHash: string
  outputHash?: string
  approvalId?: string
  policyRevision: string
  effectStatus: 'not_started' | 'in_flight' | 'applied' | 'unknown' | 'failed' | 'cancelled'
}
```

不变量：`seq` 单调递增；同一 `itemId` 只能有一次 terminal；同一 `(operationId, contractHash, idempotencyKey)` 不得产生第二次 effect；旧 lease/epoch/receipt 一律拒绝；完整 payload 留在 Host store，模型只拿 projection。

### 3.2 生命周期

```text
acceptIntent
  → append user Item
  → compile bounded context
  → Pi loop
  → assistant final | typed query | typed proposal | tool call | ask user
  → preflight(validate + normalize + bind + revision + budget + idempotency)
  → approval.pending → approved | declined | cancelled
  → lock/barrier
  → effect
  → typed output projection
  → append tool result + receipt
  → settle ledger and context snapshot
  → execution_settled
  → turn.completed / awaiting_input / failed
```

`execution_settled` 的条件必须同时满足：所有 Item terminal；队列清空；approval 已持久化解决；每个外部 effect 已分类为 done/failed/cancelled/unknown；receipt、预算、artifact 和 context snapshot 已 flush；没有待写入的副作用。Pi 的 `agent_end`、stream close、provider 返回都不是完成条件。

## 4. 每个根因的完整解决方案

### RC-01：唯一 durable conversation/control owner

**现状机制：** `projectAgentExecutionCoordinator.ts:655-666` 强制 `history: { kind: 'ephemeral' }`；随后 `executionPrompt` 与 `projectAgentExecutionHelpers.ts:44-55` 把历史文本重新拼回；`run.mts:51-80` 每轮新建 Pi session。于是 Host ledger、Pi session、prompt replay 各有一份真相。

**解决方案：** `ProjectAgentHost` 成为唯一 durable owner。Pi 只能接受 Host 产出的 `CompiledContext` 并返回结构化 Item；Pi session 是可替换的 loop implementation，不得保存项目事实。Host 每次 turn 原子提交 event、receipt 和 context snapshot。

**迁移步骤：**

1. 加 `AgentThread/Turn/Item/Checkpoint` schema 和 reducer invariants；
2. 将 renderer request 转为 `acceptIntent(projectBinding, idempotencyKey)`；
3. 先双读验证 Host ledger 与旧路径的结果，不双写 effect；
4. 切换 Pi adapter 只接收 `CompiledContext`；
5. 删除生产路径 `history: ephemeral` 和全文 `executionPrompt` fallback；
6. renderer 只订阅 `thread/turn/item/approval/execution_settled` 事件；
7. 重启恢复按 `threadId + seq + contextRevision` replay，已 settle operation 不重新 dispatch。

**类级测试：** 30+ turn 重启恢复；renderer remount；两个并发 turn 的 revision CAS；旧 session 消失；同一 idempotencyKey 重放只返回旧 receipt；event log 截断/篡改 fail closed。

### RC-02：模型面从内部函数目录改为创作意图目录

**现状机制：** `agentToolCatalog.ts` 把 document/canvas/timeline/production/generation/skills 汇成约 50 个 descriptor；`agentChatPolicy.ts` 的 regex profile 和 sticky profile 只是静态筛选，无法表达用户目标、阶段和风险。

**解决方案：** 建立 `SemanticToolDescriptor`，canonical capability 仍保留内部完整动作，但 model projection 只暴露用户意图。

```ts
interface SemanticToolDescriptor {
  name: `nomi_${string}`
  version: string
  intent: string
  capabilityRefs: string[]
  inputSchema: JSONSchema
  outputSchema: JSONSchema
  sideEffect: 'none' | 'proposal' | 'external'
  execution: 'parallel' | 'sequential'
  risk: 'read' | 'project_write' | 'paid_external'
  disclosure: 'eager' | 'deferred'
  availability: { phases: string[]; requiredScopes: string[] }
}
```

首批模型工具建议 12–14 个：`project_context`、`document_read`、`document_edit`、`canvas_read`、`canvas_plan`、`canvas_edit`、`canvas_maintenance`、`media_query`、`timeline_read`、`timeline_edit`、`generation_plan`、`generation_status`、`production_run`、`skill_load`。普通任务只投影相关的 6–10 个。

以下动作移出普通模型面：`start_generation`、`decide_production_gate`、`review_artifact`、`subscribe_run`、`materialize`。它们由 Host/UI event 或 semantic submit 内部阶段驱动，模型可以提出计划，但不能伪造真人批准。

**迁移步骤：**

1. 从 registry 生成 `modelToolSurfaceManifest`，每个 intent 记录 capabilityRefs、risk、effect、phase；
2. 先做 generation 纵向切片：`generation_plan` + `generation_status`；
3. 同一提交删除旧 generation create/submit/start/gate 的 model descriptors；
4. 将 canvas/timeline/document 逐组迁移；
5. 对旧外部 MCP 名称只保留 versioned compatibility reader，不把 alias 重新暴露给新模型；
6. registry 改动不得改变已冻结 Run 的 descriptor、contractHash 或权限上限。

**Deferred Loading 闸门：** 只有当语义合并后仍满足“长期超过 10 个工具、schema 明显超过约 10k tokens、长尾库持续增长、选择错误率上升”之一，才启用 `discover_tools → load_tool(versioned schema) → invoke`。discover/load 不能扩大 lease、budget、approval 或 capability ceiling；真实 capability ID 仍用于审批和 guardrail。

### RC-03：Context Compiler、JIT 和信任投影

**现状机制：** `agentContext.ts:73-97` 以字符串 join identity/panel/skill/memory；`nomiSkillResources.mts:64-83` 虽有限制仍把 overflow skill 名称拼成一行；current context 以字符串注入，缺 source revision、trust、hash 和 token provenance。

**解决方案：** 引入 request-only `ContextCompiler`，持久 history 不被修改。每个 section 带 `id/version/stability/trust/sourceRef/sourceRevision/byteHash/tokenEstimate/priority`。

```text
稳定 trusted policy/identity
  → thread summary + handoff
  → 当前 task refs / project index
  → 只读 JIT index/search/read
  → 已加载 semantic tool schema
  → 最近结构化 Items
  → 新用户输入
  → external/user/MCP 内容（tainted，最后）
```

硬预算：核心工具 3–5 个常驻；单轮工具描述、Skill body、外部结果、总 token/bytes 都有上限；超预算按 priority 淘汰并记录 omitted refs/warning；动态数据不进入稳定前缀。

**迁移步骤：**

1. 定义 `ContextSection`、`CompiledContext`、`compileHash`；
2. 将 project context 拆为 `index_project_state/search_project_state/read_project_slice`；
3. Skill 变为 index→SKILL.md→references/scripts 的三级 progressive disclosure；
4. 所有外部文本标记 trust/taint，并在进入模型前做 injection/provenance 检查；
5. 记录每轮 token、bytes、section hash、cache usage 和省略原因；
6. 删除全量目录 join 和静默吞掉 memory 失败的路径。

**类级测试：** 100 turn 输入 token 不按全文历史线性增长；相同 revision 的 compileHash 稳定；预算超限可诊断；恶意 Skill/MCP 文本不能修改 policy；JIT 读取带 sourceRef/revision；renderer 切换不改变 context owner。

### Skill：方法论资源，不是权限或执行器

这部分必须单独说明，因为 Skill 在产品里很重要，但它和 capability、Workflow Pack 不是同一种东西。

| 对象 | 解决什么问题 | 是否能直接产生副作用 |
|---|---|---|
| Skill | “应该怎么做”——拆镜方法、角色一致性检查、提示词写法、审片标准 | 不能 |
| Semantic capability | “系统能做什么”——读画布、生成计划、写节点、查状态 | 由 Host 授权后才能 |
| Workflow Pack | “一条创作流程如何编排”——剧本→分镜→生成→预览→导出 | 只能声明流程，不能绕过 Host |

**现有代码对照：** 主线已经通过 `electron/harness/context/agentContext.ts` 的 `buildSkillSystemPrompt` 将指定 Skill 正文注入 system prompt；PR #223 又增加了 `nomiSkillResources.mts`、`load_skill`、Skill content hash 和 `skillRead` transport。这说明 Skill 并非遗漏，而是当前仍有两条并行语义：一条是“每轮直接把 Skill 正文塞进 prompt”，另一条是“资源目录 + load_skill”。

**目标 Skill 生命周期：**

```text
Skill Catalog metadata
  → resolve by user goal / explicit skill key
  → load exact name + version + contentHash
  → validate manifest + visibility + trust
  → compile into ContextSection (procedural, tainted if user/external)
  → model uses method to form semantic proposal
  → Host independently checks capability / lease / budget / approval
  → effect and receipt
```

必须遵守四条边界：

1. Skill 可以提供方法论、检查清单和输出格式，不能把 `requestedCapabilities` 变成权限升级；
2. `skillKey + packageVersion + contentHash` 必须冻结到 Turn/Run，运行中 Skill 文件变化不能改变当前任务；
3. Skill 正文、references、MCP 返回和用户导入内容都要带 trust/taint，不能覆盖 system policy、approval 或 project lease；
4. Skill 中提到的 CLI、HTTP、文件工具不自动执行，只有当前 Host 明确提供对应 capability 才能调用。

因此，模型面可以保留一个低风险 `skill_load`，但它只返回经过 hash/大小/信任校验的知识资源。加载 Skill 本身不需要付费确认；Skill 诱导出的生成、写入、导出仍必须重新经过 Host 的 effect pipeline。

**Skill 验收：** 同一 hash 的加载结果可重现；缺失/篡改/超大 Skill fail closed；恶意 Skill 不能调用未声明 capability、伪造 approval 或改变预算；阶段 handoff 记录所用 Skill 的 key/version/hash；同一创作任务在内部 Agent 与外部 MCP 入口使用同一 Skill 资源版本。

### MCP：外部入口的协议投影，不是第二套 Agent

你说的 MCP 工具必须单独看。Nomi 当前主要实现的是 **Nomi 作为 MCP Server**：Claude Code、Codex、Cursor 通过 `mcpNodeLauncher`/`mcpStdioServer` 连接 Nomi；协议层在 `electron/capabilityCore/mcpProtocol.ts`，能力投影在 `mcpCapabilityProjection.ts`，工具目录在 `mcpToolCatalog.ts`，认证与客户端身份在 `security.ts`/`mcpVerify.ts`。`mcpProtocol.ts:1-9` 明确把它定义为唯一 MCP server 实现，而不是另一套 Agent loop。

所以必须区分三种数量：

1. **Canonical capability 数量**：Nomi 内部真正拥有的业务能力；
2. **Model projection 数量**：Pi/内嵌 Agent 看到的语义工具，目标约 12–14 个；
3. **MCP projection 数量**：外部 Claude/Codex/Cursor 看到的 MCP tools/resources/prompts，受协议兼容、elicitation、widget 和客户端差异影响。

这三者可以有不同的展示颗粒度，但不能有不同的执行真相。每个 MCP tool 必须通过 `capabilityId + version + authority + lease + contractHash` 映射到同一 canonical adapter；MCP alias 不能绕过 Host 的预算、审批、ProductionRun、Proposal/Undo 或 settlement。

**MCP 的目标链路：**

```text
Claude/Codex/Cursor
  → MCP initialize / client identity
  → tools/list + resources/list（短目录）
  → semantic tool call / resource read
  → Nomi MCP projection
  → Host capability preflight
  → 同一份 plan/contract/approval/receipt/effect
  → structured result + progress + elicitation/widget
```

MCP 的确认语义也不能复制：支持 elicitation 的客户端在客户端完成一次确认；不支持时由 Nomi GUI 兜底；两者最终都由主进程铸造同一类 approval receipt。`docs/superpowers/specs/2026-08-23-mcp-client-first-authorization-design.md:15-19,57-75,114-145` 和 `docs/handoff/2026-08-24-semantic-single-shot-p1-p3-handoff.md:44-76,232-272` 已经定义了这条边界。

**本轮方案对 MCP 的修正：** 之前“12–14 个工具”的数字只针对内嵌模型面，不能直接当作 MCP 工具删减清单。MCP 还需要一次独立的 `tools/list` 全量盘点：逐个标记 `keep semantic / merge alias / resource-only / host-only / deprecated`，并验证 MCP 与 GUI 产生同一个 Run、同一个 contractHash 和同一个 receipt。若现有 MCP 目录仍有几十个工具，先做 canonical 映射和执行路径去重，再决定是否减少公开工具数量；不能因为“模型面少了”就宣称 MCP 已收敛。

**MCP 专项验收：**

- `tools/list` 与 `tools/call` 使用同一 resolver，不能“看不见但能调”；
- 未登记客户端、旧 lease、旧 project generation、错误 audience 一律拒绝；
- MCP/GUI 同一意图生成同一个 `operationId/runId/contractHash`；
- elicitation 与 GUI fallback 不产生双重确认；
- `notifications/cancelled`、stdio 断开、RPC 超时进入同一 cancel/unknown/reconcile 语义；
- MCP structured result、文本兜底、widget、进度通知都只来自同一 safe projection；
- 外部 MCP/Skill 文本为 tainted，不得改变 Nomi policy、预算或 capability ceiling；
- MCP no-cost、packaged stdio、断线重连、真实 Claude/Codex/Cursor host 都要分别验证，不能把 generic loopback 当成真实宿主证据。

### System Prompt、KV Cache 与 Context Cache

这三件事不能混成“把 prompt 写得更长”或“缓存应该会命中”。

**System Prompt 的解决方案：** 将 prompt 拆成带版本和 hash 的 sections：

```text
system policy / identity（稳定、trusted）
→ capability contract（稳定、按阶段）
→ Skill metadata/body（按 session/turn 加载）
→ project facts / current selection（动态）
→ external MCP/user content（tainted，最后）
```

每个 section 记录 `sectionId/version/stability/trust/sourceRef/sourceRevision/byteHash/tokenEstimate`。System policy 只在 Host 生成，Skill、MCP、项目文本不能覆盖它；模型不能通过 prompt 自己声明“已批准”“可以花钱”或“忽略规则”。

**KV Cache 的真实边界：** KV cache 多数由 Provider 内部管理，Nomi 不能把“前缀稳定”当作命中证明。Nomi 能做的是：

- 稳定内容放前面，动态内容放后面；
- 工具和 section 按确定性顺序序列化；
- 不在每轮重写无变化的 system/tool 前缀；
- 记录 Provider 返回的 `cached_tokens` 或等价 usage 字段；
- 没有 usage receipt 时只写“尝试保持缓存友好”，不能宣称“已命中缓存”。

**Context Cache / Compaction 的边界：** Host 的 summary/checkpoint 是业务恢复缓存，Provider KV cache 是性能优化，两者不能互相替代。session 重启、模型切换、Skill 版本变化和 contextRevision 变化都可能使 Provider cache 失效，但不能影响 Host 的可恢复账本。

**验收：** 同一静态前缀在相同 revision 下 hash 稳定；100-turn 发送 token 不因全文历史重复而线性膨胀；cache usage 有真实 receipt；动态项目事实后置；Skill/MCP 内容变化不会悄悄改变稳定 policy 前缀。

### 护栏（Guardrails）：不能把 Prompt 当安全边界

护栏按最早可强制的边界分四层：

1. **执行环境层**：Electron 主进程、utility process、workspace roots、文件/网络权限和 Provider/MCP proxy；凭据只在 vault/broker，不能进入模型或 Skill。
2. **Host 策略层**：project lease、project generation、capability ceiling、phase、budget、approval policy、fencing epoch。
3. **契约层**：输入 schema、语义校验、版本/hash、幂等键、锁范围、输出 schema、大小上限。
4. **内容层**：Skill、MCP、用户素材、URL、网页结果全部标记 trust/taint，做 prompt-injection、路径、凭据、超大 payload 和恶意 URL 检查。

任何一层拒绝都产生稳定 machine error 和 `nextAction`；不能通过换工具名、换 MCP transport、伪造 `approved`、修改 prompt 或绕过 UI 重试。护栏必须在 Host/capability adapter 强制，模型只负责提出意图。

### 审批、预算和成本：把“能不能做”与“要不要花钱”分开

Nomi 现有设计已经有 ProductionRun、预算 ledger、reservation、HumanApprovalReceipt、MCP elicitation 和 GUI fallback；本方案不是重造，而是把它们接到统一 Agent lifecycle。

审批分三层：

- **连接授权**：允许 Claude/Codex/Cursor 连接 Nomi，不代表允许花费；
- **计划批准**：允许采用当前 plan/contract，不产生 Provider call；
- **执行批准**：绑定当前项目、模型、素材、参数、价格快照、cost scope、contractHash 和过期时间，消费一次 receipt 后才加入 submit scope。

成本闸门固定为：

```text
plan/preview（零 provider call）
→ resolver 重新计算价格与能力
→ reservation preview
→ 一次 HumanApprovalChallenge
→ 主进程验证 gesture/attested MCP elicitation
→ CAS 消费 HumanApprovalReceipt
→ budget reservation + provider idempotency key
→ submit
```

必须禁止：

- 模型参数里的 `approved: true` 代替 receipt；
- Skill、MCP widget 或 renderer 自己铸造 receipt；
- planning scope 直接升级为 submit scope；
- Provider 超时后自动再次扣费；
- 同一 contract 重试产生第二个 reservation/provider call；
- 价格、模型、素材或项目 revision 变化后继续使用旧 approval。

MCP 支持 elicitation 时在当前 Claude/Codex/Cursor 内确认；不支持时由 Nomi GUI 兜底，但两条路径必须回答同一个 challenge，不能双重确认。审批 request、resolved、item completed、effect settled 的顺序都要落入 Host ledger。

**成本验收：** 未确认时 provider call=0、reservation=0；同一 command/idempotency key 只产生一个 reservation 和 receipt；未知提交只能 reconcile；预算 actual/reserved/unsettled 单调且可解释；用户看到的确认卡始终显示模型、范围、价格、冻结项和失败/取消后的费用归属。

### RC-04：语义 Compaction 与阶段 Handoff

**解决方案：** Pi opaque snapshot 只作 loop 恢复细节；Host 另持有 `AgentContextSummaryV1`，并在阶段边界生成 `HandoffArtifact`。

```ts
interface AgentContextSummaryV1 {
  schemaVersion: 1
  threadId: string
  contextRevision: number
  sourceEventRange: { from: number; to: number }
  sourceSnapshotHash: string
  goal: string
  decisions: string[]
  constraints: string[]
  todos: string[]
  artifacts: Array<{ kind: string; id: string; revision: number; hash: string }>
  exactRefs: { nodeIds: string[]; runIds: string[]; approvalIds: string[]; receiptIds: string[] }
  openQuestions: string[]
  discardedTurnsDigest: string
}

interface HandoffArtifact {
  handoffId: string
  fromPhase: string
  toPhase: string
  summaryRef: string
  requiredReads: string[]
  pendingOperations: string[]
  approvedReceipts: string[]
  sourceEventRange: { from: number; to: number }
  artifactHash: string
}
```

**触发与发布：** token threshold 或 script→storyboard→generate→review 阶段边界触发；先写 `summary_started`，生成后校验 schema、ID、hash 和 budget，再写 `summary_published` 并递增 contextRevision。失败最多重试一次；仍失败保留最近窗口并显式告警，禁止发布“成功摘要”。

**类级测试：** 缺 nodeId/runId/approvalId/receiptId、hash mismatch、snapshot 损坏全部 fail closed；handoff 后新 harness 不读取旧全文仍能继续；summary 前后关键决策和 receipts 完整；压缩期间 stop 不产生 late summary。

### RC-05：唯一 typed output projection

**现状机制：** capability 层虽有 outputSchema，但 `runtimePort.ts:29-37,59-65` 仍为 `unknown`，`run.mts:101-104` 可直接 `modelText(decision.result)`。

**解决方案：** 只允许一个 runtime→model 出口：

```ts
function projectToolResult(raw: unknown, descriptor: SemanticToolDescriptor, receipt: ToolReceipt): ModelToolResult {
  const parsed = descriptor.outputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: { code: 'output_contract_invalid', retryable: false, userSafeMessage: '工具返回格式无法验证' }, receiptRef: receipt.receiptId }
  const safe = capBytes(redactSecretsAndPaths(parsed.data))
  return { ok: true, data: safe, receiptRef: receipt.receiptId, provenance: { operationId: receipt.operationId, revision: receipt.policyRevision } }
}
```

顺序固定：safeParse → secret/path/URL scrub → max bytes/tokens → error normalization → receiptRef/provenance → deterministic serialization。原始异常和完整媒体路径只存 Host ledger；模型收到摘要、错误码、下一步和引用。

**类级测试：** 合法结果通过；schema mismatch、超尺寸、凭据/路径注入、恶意 URL fail closed；任何未过 projection 的 `unknown` 不得进入 prompt；output schema violation 计数为 0。

### RC-06：副作用事务与 settlement barrier

**解决方案：** 所有写项目、扣费、生成、提交、materialize 都走统一 EffectEnvelope：

```ts
interface EffectEnvelope {
  operationId: string
  toolCallId: string
  capabilityId: string
  projectId: string
  runId?: string
  contractHash: string
  requestFingerprint: string
  providerIdempotencyKey?: string
  attemptId: string
  fencingEpoch: number
  lockKey: string
  phase: 'prepared' | 'awaiting_approval' | 'effect_pending' | 'accepted' | 'unknown' | 'settled' | 'failed' | 'cancelled'
  approvalReceiptId?: string
  providerTaskId?: string
}
```

执行固定为：

```text
prepare (纯函数、规范化、hash)
→ approval/reservation/lease CAS
→ WAL append effect.prepare
→ lock/fencing barrier
→ provider/domain effect
→ output projection
→ WAL append effect.settle
→ receipt + budget + artifact 原子更新
```

取消与不确定结果：

- approval 前取消：`cancelled`，provider call=0；
- effect 尚未 dispatch：可取消；
- 已写 submit intent 但响应丢失：`unknown/submission_unknown`，只能 reconcile，禁止盲重提；
- provider cancel 不等于本地 settled，必须查询到终态；
- 只有 `definitely_not_submitted` 才允许新 attempt；
- 恢复时 `prepared` 可继续，`effect_pending/unknown` 先 reconcile，`settled` 幂等跳过。

并发策略：连续 read-only calls 可并发；遇到写入、生成、预算、materialize 等 barrier 时切段，barrier 前全部完成后才启动后段；结果按模型原调用顺序写回；中断后未开始调用写 `cancelled/skipped`，不得 late emit。

**类级测试：**

- 同 key 重放不产生第二次 provider call/reservation/artifact；
- 两个并发 submit 只有一个 winner；
- 断电模拟覆盖 prepare、submit intent、provider accepted、receipt persist、settle 五个断点；
- unknown 启动只 reconcile；
- `agent_end` 后仍有 retry/queue/effect/pending write 时不得发 `execution_settled`；
- 只有 durable flush、外部 done/unknown、队列为空才允许 UI 完成；
- 任意事件重复/乱序重放不得增加副作用。

### RC-07：把 PR 变成可审查的交付切片

PR #223 当前约 767 文件差异，merge-tree 存在跨域冲突，且 coordinator 等文件超过 800 行。解决方式不是继续在原 PR 上补功能，而是从最新 `origin/main` 重建 stack：

| 顺序 | 分支/PR | 只负责 | 明确不做 | 验证 |
|---|---|---|---|---|
| A | `agent-host-lifecycle` | Thread/Turn/Item、ledger、resume/interrupt、settlement reducer | 不改模型工具目录 | contracts、recovery、type/lint |
| B | `agent-semantic-projection` | semantic manifest、generation 纵向切片、删除旧 alias | 不改 UI/Provider 实现 | tool A/B、schema、focused tests |
| C | `agent-context-compaction` | ContextCompiler、SummaryV1、Handoff、JIT | 不新增 provider | 100-turn、compaction、provenance |
| D | `agent-output-trust` | output projection、redaction、MCP/Skill trust | 不改变 domain authority | adversarial output/MCP tests |
| E | `agent-ui-journey` | 事件投影、approval/interrupt/resume/settled UI、真实 Electron 旅程 | 不重造 runtime | J1–J5 packaged Electron |

每个 PR 必须从最新主线创建独立 worktree；每层完成后删除同一语义的旧路径，禁止运行时双引擎、双 owner 或 fallback。PR 合并前执行 `git merge-tree --write-tree origin/main <head>`，必须无跨域冲突。

## 5. 验证与评审体系

### 5.1 机器验证

每一层按真实风险触发：

- 始终：contracts、typecheck、lint、changed/sibling tests；
- Host：recovery、CAS、event replay、interrupt/resume；
- semantic tools：descriptor count、alias deletion、schema/property tests；
- context：100-turn token budget、summary/hash、taint/provenance；
- effect：idempotency、unknown/reconcile、budget/receipt、lock/barrier；
- UI：打包 Electron、renderer remount、页面切换、真实任务；
- 发布边界：package reachability、ASAR、安装运行时、目标平台。

### 5.2 真实创作任务验收

至少跑完整闭环：

1. 用户输入一个视频目标；
2. Agent 读取项目事实并生成可编辑计划；
3. 用户修改/确认计划；
4. Host 执行生成或项目写入；
5. 结果进入画布/时间轴，用户可预览、撤销、重跑；
6. 中途停止、关闭窗口、重启 Electron；
7. 恢复后不重复扣费、不重复写节点、不丢 receipt；
8. 最终导出或明确失败下一步。

指标：普通任务首轮模型工具 ≤10；错误工具率、重复调用率、无效参数率低于旧 projection；30+ turns 可恢复；settled-before-complete=0；重复 effect=0；summary 关键 ID 保留率=100%；schema violation 进入模型=0。

### 5.3 六角色评审

每个 stack PR 在实现前和实现后各评一次：

- CTO：边界、可替换性、长期维护成本；
- 设计：用户是否理解当前步骤、确认、失败和撤销；
- PM：是否直接服务创作者产出高质量视频，是否扩大成通用 NLE；
- 前端：事件投影、断线重连、renderer 无状态化、可访问性；
- 后端：schema、幂等、事务、预算、恢复、provider 差异；
- 真实用户：不看内部术语，能否只用自然语言完成目标。

### 5.4 对抗/红队/紫队评审

**红队（攻击系统）：**

- 恶意 Skill、MCP 返回 prompt injection、伪造 approval、外链/凭据/路径注入；
- provider 超时、断线、重复回调、错误 task ID、未知提交状态；
- 并发两个 submit、旧 lease、旧 project generation、旧 UI frame；
- compaction 丢 ID、summary hash 篡改、event 重放/乱序/截断；
- renderer remount、应用崩溃、网络断开、用户连续点击停止/重试。

**蓝队（证明系统可恢复）：**

- 展示每个攻击在 Host 哪个共享边界被拒绝或被分类为 unknown；
- 展示 durable event、receipt、budget、artifact 没有重复变化；
- 展示 UI 只根据 `execution_settled` 宣布完成。

**紫队（闭环验证）：**

- 将红队输入转成固定 regression fixture；
- 每个 fixture 至少有一个“报告案例测试”和一个“同类入口测试”；
- 对抗结果必须回写 schema-v3 root-cause contract 的 `same_class_entry_points`、`prevention.artifacts`、`class_regression_tests`；
- 任何只修单一 provider、单一工具名或单一页面的补丁不得通过。

## 6. 实施里程碑与停止条件

### 6.0 本轮里程碑验收门的实测阻塞项（I-1）

在进入下一里程碑前，必须把以下两个已复现病点作为硬门，而不是只写“待补测试”：

- **productionRun 门编排破坏**：`budget-approval → shot-gates-never-open`，共 18 个测试受影响；
  实测记录为 `pr223-finish@46066ed0`。在门编排恢复并有持久化/零副作用证据前，M1 不得宣称通过。
- **canvasRead 挂死**：`canvasReadCapturedSnapshotFlow.test.ts:467` 出现挂起；必须先定位等待/快照
  生命周期的共享根因并记录可复现结果，不能用延长超时掩盖。

另有一项状态模型缺口：`projectAgentExecutionCoordinator` 与
`projectAgentExecutionHelpers` 共 9 处将 `deviated` 写死为 `false`，只有读取、没有置真路径。
该事实必须在状态 owner、持久化和类级测试中闭合；本计划当前只记录并阻止过早推进，不改生产 Agent。

### M0：基线冻结（1 个短迭代）

交付：owner map、PR 切片、代码/文档索引、schema-v3 contracts 草案。  
停止条件：没有明确唯一 owner、旧路径清单或类级测试，不进入写码。

### M1：Host 生命周期（1–2 个迭代）

交付：Thread/Turn/Item ledger、CAS、resume/interrupt、settlement reducer。  
停止条件：30+ turn 重启恢复失败、重复 effect、低层 end 被当完成，必须停在 M1 修根因。

### M2：语义工具面（1–2 个迭代）

交付：generation semantic slice、旧 alias 删除、manifest 和 A/B 指标。  
停止条件：模型仍需学习内部 gate/start/subscribe，或普通任务工具数 >10 且没有解释。

### M3：Context/Compaction（1–2 个迭代）

交付：PromptPipe、JIT、SummaryV1、HandoffArtifact、provenance。  
停止条件：摘要缺精确 ID/receipt、预算不可观测、恶意外部内容能影响 policy。

### M4：Effect/Trust（1–2 个迭代）

交付：EffectEnvelope、统一 output projection、reconcile、MCP/Skill trust。  
停止条件：未知提交会盲重提、schema 失败进入 prompt、凭据进入模型/执行环境。

### M5：真实创作闭环与 Deferred Loading（1–2 个迭代）

交付：打包 Electron J1–J5、红蓝紫队回归、工具面 A/B。  
停止条件：真实用户无法从目标走到可编辑视频，或仅靠 UI loading 掩盖状态不一致。

Deferred Loading 只有在 M2 A/B 证明语义合并仍不足时才进入 M5；否则不引入。

## 7. 不可照搬与明确保留

可以借鉴：Thread/Turn/Item、append-only event、request-only context transform、Skill progressive disclosure、tool search 的发现层、typed output、approval/interrupt/resume、unknown/reconcile、settlement barrier。

不能照搬：云端 provider-managed conversation、opaque encrypted reasoning、云 sandbox 的租户模型、后台响应的保留策略、第三方 MCP 的默认信任、把 Codex/Hermes 的执行器直接当 Nomi domain authority。

必须保留 Nomi 护城河：本地优先、project binding、ProjectLease、预算/receipt/幂等、Proposal/Undo、ProductionRun、锚一致性、人工确认和 React Flow 单一交互内核。

## 8. 交给下一位实现/审核 AI 的任务书

1. 先读取本计划、本地现状文档和 PR #223 精确 refs，不从旧方案猜现状；
2. 先提交 M0 的 owner map、schema-v3 contracts、旧路径清单和测试红灯；
3. 只实现 M1 Host lifecycle，禁止顺手加工具、Provider 或 UI；
4. M1 通过后实现一个 semantic generation slice，并在同一提交删除旧 model projection；
5. 每个 changed production path 都补同类入口、故障恢复和对抗 fixture；
6. 每个 PR 通过六角色和红蓝紫队评审后，才进入下一里程碑；
7. 最终必须用打包 Electron 完成真实创作任务，不能以“单元测试全绿”宣布完成。

最终完成标准不是“工具数量降下来了”，而是：用户可以用自然语言完成一条视频创作主链，Agent 在长任务、失败、重启、人工编辑和 Provider 不确定状态下仍然可恢复、可解释、可撤销、不重复扣费。
