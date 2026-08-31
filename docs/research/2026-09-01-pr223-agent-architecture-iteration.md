# PR #223 Agent 架构对照审计与下一轮迭代稿

日期：2026-09-01  
用途：交给下一位负责审核的 AI，作为 PR #223 的复核输入、整改任务书和验收清单。  
结论类型：`Observed`（代码/分支直接观察）、`Measured`（命令测量）、`Inferred`（由代码路径推导）、`Proposed`（下一轮方案）。

## 0. 一句话结论

PR #223 已经把“主进程 Host 拥有项目绑定、提案、审批、幂等和能力执行”的安全骨架搭出来了，但它目前仍是 Draft，不能按“Agent 已完成”合并或对外宣称完成。

真正需要下一轮解决的不是再加一批工具，而是收拢四个真相源：

1. Host 持久化线程与 Pi SDK 上下文目前没有接成一个生命周期；协调器强制 `ephemeral`，再把历史全文拼成 prompt，导致上下文、压缩和缓存设计在关键入口失效。
2. 工具选择是基于正则和静态 profile 的投影，不是课程材料所说的“核心工具 → 搜索/发现 → 精确加载”的动态工具集。
3. Skill、MCP、工具结果都已经有部分 schema/权限防线，但“模型可见文本”和“外部/用户提供内容”的信任等级还没有在 prompt 与结果投影层显式隔离。
4. PR 混入了大量与 Agent Host 无关的 provider/MCP/画布/发布变更；当前 PR 头与 `origin/main` 不能无冲突合并，且巨壳、性能、Phase 2B、真实桌面旅程等门仍未关闭。

推荐策略：先冻结合并，重建一个以 Host 为唯一 durable conversation owner 的 Phase 1.1；然后补齐动态工具/上下文工程/信任投影；最后以真实用户任务和打包 Electron 旅程验收，再去掉默认关闭闸门。

## 1. 审计范围、基线与证据等级

### 1.1 分支与提交基线

本轮实际对照了当前可见的相关引用，而不是只读工作树：

| 引用 | 提交 | 用途 | 观察 |
|---|---|---|---|
| `origin/main` | `5730b957` | 本次复核的当前主线真相 | 工作树 HEAD `7b70993bb` 是其父提交，不能混称为最新 main |
| `origin/pr-223-head` | `48c019da` | PR 当前头 | 53 个提交；仍是 Draft |
| `origin/pr-223-merge` | `20238c8e` | GitHub 生成的旧 merge ref | 不是当前 PR 头，不能当最新合并结果 |
| `origin/codex/project-agent-host-phase1-20260827` | `48c019da` | PR 源分支 | 与 PR head 同提交 |
| `pr223-finish` | `24e7d609` | 本地相关收尾分支 | 不是 PR 当前头 |
| `origin/codex/canvas-plugin-system-20260830` | `df505971` | 同期画布插件分支 | 独立变更，不能假设已包含在 PR 可合并树中 |
| `origin/codex/provider-model-expansion-20260830` | `18406c28` | 同期 provider 分支 | 独立变更，和 PR 存在重叠风险 |

直接证据：

- `git diff --stat origin/main...origin/pr-223-head`：767 个文件，约 95,443 行新增、14,756 行删除。这个规模已经不是一个可轻易审查的 Phase 1 小 PR。
- `git merge-tree --write-tree origin/main origin/pr-223-head` 返回冲突，冲突包括 `docs/ARCHITECTURE-NOW.md`、`package.json`、`scripts/check-file-sizes.mjs`、`electron/assets/projectAssetStore.ts`、`electron/capabilityCore/apimartGenerationProvider.ts`、`electron/capabilityCore/generationRuntimeAdapter.ts`、`electron/productionRun/productionGenerationSubmission.ts`、`src/workbench/generationCanvas/nodes/InlineParameterBar.tsx` 等。
- GitHub PR 页面显示 PR #223 标题为 “wip: project agent host phase 1 checkpoint”，状态为 Draft；PR 描述自己列出 Phase 2B 生产切换、重复 `canvas.read` 路径、巨壳、性能、全量 gate、打包 GUI 旅程等未完成项。[PR #223](https://github.com/aqm857886159/Nomi/pull/223)

本地 `pnpm run delivery:preflight` 因当前 checkout 是 detached HEAD 而停止；`pnpm run radar:models` 因环境缺少 `tsx` 而停止。这两项是本轮环境/交付证据，不是 Agent 代码通过或失败的结论。

### 1.2 当前主线的事实底座

`docs/ARCHITECTURE-NOW.md:35-60` 明确：主线当前 Agent runtime 是 Pi SDK 0.84.3；工具按 capability 选择而不是按 skillKey；creation 与 generation 仍是两份 area history；Preview 尚未挂 Agent；React Flow 是唯一画布内核；内部 Agent 与 MCP 是两套入口合同、共享领域实现。该文件是“现在是什么”，不能被 PR 中的计划文档替代。

## 2. 你提供的材料到底给出了什么架构要求

这些材料不是要我们逐字照抄某个产品，而是共同指向一条工程原则：**模型只负责提出结构化意图；Host 负责验证、授权、执行、持久化、错误恢复和向模型投影结果。**

| 材料主题 | 可落到 Nomi 的硬要求 | 本轮对照结论 |
|---|---|---|
| Function Calling / Structured Output | 模型输出不可信；schema 校验不等于业务校验；调用必须经过执行器和结果回传 | Nomi 已有 Zod 输入合同、Host 审批和 canonical capability；通用 runtime 仍把 `result` 暴露成 `unknown`，缺少统一结果投影/大小/脱敏门 |
| Claude Code 工具调用链 | schema/type → 语义校验 → normalization → pre-hook → authorization → execute → post-hook；工具结果再进入下一轮模型上下文 | `createHostTools` 做了输入解析和 Host dispatch；各 adapter 分散实现后半段，没有一个可观测的统一 pipeline receipt |
| Deferred Loading / 动态工具集 | 工具多时不能把所有 schema 常驻上下文；先给少量核心工具，搜索/发现后再精确加载 | `agentChatPolicy.ts` 用正则选 profile，并把整组 schema 投影给模型；没有模型可调用的 discover/load 工具生命周期 |
| MCP 硬伤 | 工具描述和结果可能携带 prompt injection；annotations 不等于安全证明；客户端必须确认、校验、清洗 | Nomi MCP capability projection 已有显式白名单、连接证明和 output schema；本地 Agent 的 Skill/MCP 内容还没有同等的 taint/隔离标记 |
| Skills 渐进披露 | frontmatter/index 常驻；完整 SKILL.md 按需加载；references/scripts 最后加载 | Nomi 有 index 与 `load_skill`，但 overflow 名称仍被一次性拼进 prompt，且选中的 skill body 直接进入 system prompt |
| System Prompt / Context Rot | prompt 是行为控制系统；静态前缀稳定、动态后缀后置；模块化 section、明确数据边界 | `composeAgentSystemPrompt` 只是字符串 join；没有 section id/version/stability/hash/诊断；动态上下文在 Host 入口被全文重放 |
| 上下文压缩 | 压缩不能只“变短”，必须保留决定、约束、待办、标识符、最近交互，并可验证 | Pi 事件只计数/告警；没有 Nomi-owned summary schema 和质量 gate |
| Cache | cache 的前提是 tools → system → messages 前缀逐字节稳定；变化应在动态后缀 | 代码注释宣称 prefix/KV 稳定，但每 turn 新建 SDK session，且没有本轮可验证的 provider cache read/write 收据 |
| JIT Context | index → search → read；按任务临近程度取上下文，不要预加载整个项目 | 当前项目线程主要是 `executionPrompt` 全量重放用户/助手文本；没有统一的项目索引/搜索/读取预算器 |

外部原始依据：Anthropic 工具调用说明了模型返回结构化 tool call、客户端执行后再回传 `tool_result`，并支持 `strict` schema；工具定义与结果也计入输入成本。[Anthropic Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview)；缓存要求稳定前缀、显式 breakpoint 和稳定工具顺序。[Anthropic Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)；MCP 工具规范要求 input/output schema，且 annotations/描述不能被当作安全证明，客户端应做校验和人工确认。[MCP Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)。

## 3. 当前 PR 的真实链路

### 3.1 正向路径（已经做对的部分）

1. `src/workbench/ai/projectAgentTurnCommands.ts:101-105` 创建带 binding、threadId、recordId 的 `contextRef`。
2. `electron/projectAgentHost/projectAgentHost.ts` 维护按项目 binding 分区的 FIFO Host、快照仓库和重启恢复。
3. `electron/projectAgentHost/projectAgentExecutionCoordinator.ts:643-702` 在 Host 侧捕获 request，绑定项目，合并 sticky tool profile，再入队；`dispatchFresh:714-728` 对 revision conflict 做有限重试。
4. `electron/ai/agentChatV2.ts:47-127` 选择模型、工具、system prompt，并进入 `agentContextHost.run`。
5. `electron/harness/runtime/pi/run.mts:79-105` 建立 Pi session；工具调用先通过 `hooks.awaitToolConfirmation`，再进入 Host。
6. Host 侧再按 canonical capability 分发到 document/canvas/timeline/generation/production adapter，落 proposal/receipt/settlement。
7. `electron/projectAgentHost/projectAgentExecutionHelpers.ts:57-83` 将 tool call 投影成 Host item；特定导出任务在 `:85-122` 以 output schema 做二次识别。

这条链的价值是：renderer 不直接拥有领域写入，审批与幂等不由模型或 UI 决定，MCP 与内部 Agent 可以共享 capability owner。这是 PR 最应保留的骨架。

### 3.2 关键断点

#### 断点 A：Host durable transcript 与 Pi snapshot 是两套上下文 owner

- `agentChatV2.ts:67` 通过 `agentContextHost.run(payload.history, ...)` 支持 persistent context。
- 但 `projectAgentExecutionCoordinator.ts:655-666` 明确把 Host request 改成 `history: { kind: "ephemeral" }`。
- `projectAgentExecutionCoordinator.ts:1161-1167` 每次执行都读取 Host snapshot，再调用 `executionPrompt(...)`；后者 `projectAgentExecutionHelpers.ts:44-55` 把此前所有用户/助手文本拼成一个新 prompt。
- `run.mts:51-80` 每 turn 创建新 SDK session；只有 request 带 `snapshot` 才 import Pi snapshot。

结论：**持久化 context service 存在，但 PR 的主 Host 执行路径绕开了它。** 这不是一个局部性能问题，而是上下文所有权冲突。随着线程长度增加，历史文本每轮重复发送，且不会携带 tool item 的结构化结果；Pi 的 compaction 也无法跨 turn 累积。用户会看到“刚才说过的话又被重新解释”、长线程变慢、模型丢失工具结果或在压缩后失去 ID。

#### 断点 B：工具“缩小”了，但还不是 Deferred Loading

`agentChatPolicy.ts:82-98` 对 capability 返回整组 descriptor；`:138-167` 用中英文正则推断 intent；`:169-185` 为了缓存稳定让 sticky profile 只增不减；`:193-249` 再把 generation、timeline、media、production 等组投影出来。

这比无脑广播全部工具好，但仍有两个结构性问题：

1. 工具集合在模型看到第一轮前已经由正则决定，模型不能发现一个未加载的工具；语义不匹配时只能依赖 profile 规则覆盖。
2. sticky union 只增不减，线程越长工具 schema 越多，恰好反向制造 Context Rot；“缓存稳定”与“上下文小”在这里发生冲突。

#### 断点 C：Skill index 名义有上限，实际 overflow 仍是无上限字符串

`nomiSkillResources.mts:64-83` 把描述限制为 24 个，但 `:80-82` 把其余所有 skill 名称 join 成一行。技能数量一多，index 仍线性增长。更重要的是 `agentContext.ts:49-70` 将 `skill.body` 原样并入 system prompt，并把文件路径以文本交给模型。

这会同时造成 token 浪费和信任混淆：user skill 是用户数据/方法论，不应拥有“最高优先级”或改变 Host policy 的能力；路径、外部 CLI 指令、隐藏提示都应被当作不可信内容，而不是 system instruction。

#### 断点 D：Compaction 只有 SDK 事件，没有 Nomi 质量合同

`run.mts:200-205` 只在 `compaction_end` 时增加计数并在失败时发 warning；`RuntimeContextMetadata` 只有请求数、压缩数、保留消息数。没有发现一份由 Nomi 验证的 summary schema 来固定：决定、用户约束、待办、精确 ID、文件/制品、审批/receipt、未解决问题。

因此“压缩成功”并不等于“任务语义保留”。下一轮必须把 summary 当成有版本的项目制品，而不是只信 SDK 的 opaque snapshot。

#### 断点 E：Prompt composition 没有稳定/动态/不可信分层

`composeAgentSystemPrompt`（`agentContext.ts:73-97`）把 identity、panel、skill、memory 做简单 join；注释提到 cache stability，但对象中没有 section id、稳定等级、版本、hash 或观测字段。`agentChatV2.ts:88-100` 的 memory/skill index 每轮都会变化，memory 失败还在 `:93` 被静默吞掉。

建议把 prompt 由纯函数生成的 section 对象组成，并显式分为：`static-trusted`、`dynamic-project`、`user-data`、`external-untrusted`。这样才能测量哪些字节应该稳定、哪些变化是预期、哪些内容不能执行。

#### 断点 F：通用 runtime 结果仍是 `unknown`

`runtimePort.ts:29-37,59-65` 的 `RuntimeToolDecision.result` 和 tool-result event 是 `unknown`。虽然每个 canonical capability 都声明 `outputSchema`（例如 `canvasRead.ts:302`、`canvasWrite.ts:409`、`mcpCapabilityProjection.ts:119-137`），但 Pi 通用桥 `run.mts:101-104` 直接把 decision.result 转成模型文本，Host item 也主要保存 `resultRef`。

这意味着“每个能力有 schema”还没有成为“模型永远只收到经过统一校验和脱敏的结果”。下一轮应把 output validation、大小限制、路径/凭据清洗、错误码和 receipt 引用放在唯一 runtime→model 投影边界。

#### 断点 G：巨壳和变更范围让审查本身失真

按 PR 头的 `scripts/check-file-sizes.mjs`（`MAX_LINES=800`）静态计算，超过 800 行的变更文件包括：

| 文件 | 行数 | 备注 |
|---|---:|---|
| `electron/projectAgentHost/projectAgentExecutionCoordinator.ts` | 1908 | PR 白名单基线 1702，已增长 |
| `electron/capabilityCore/verifiedCapabilityInvocation.ts` | 1257 | 已在白名单，但仍是高风险大壳 |
| `electron/projectAgentHost/projectAgentReducer.ts` | 936 | 白名单基线 919，已增长 |
| `src/workbench/NomiStudioApp.tsx` | 908 | 既有大壳，需避免继续吸收 Agent 逻辑 |
| `electron/main.ts` | 842 | 白名单基线 836，已增长 |
| `src/ui/onboarding/OnboardingDrawer.tsx` | 819 | 既有大壳 |
| `electron/productionRun/productionRunService.ts` | 816 | 白名单基线 806，已增长 |
| `electron/projectAgentHost/projectAgentState.ts` | 809 | 新/未锁定的 Agent state 大壳 |
| `electron/capabilityCore/mcpGenerationTools.ts` | 803 | 新/未锁定的大壳 |

这与 PR 描述的“4 个文件过 800 行”不完全一致，说明 PR body、门岗基线和当前 head 已发生漂移；审核必须以当前 head 重新跑 gate，不能沿用旧描述。

## 4. 根因分类（按 P2/R21，不把症状当根因）

| ID | 级别 | 状态 | 症状 | 直接原因 | 类根因 | 最早共享边界 |
|---|---|---|---|---|---|---|
| RC-01 | P0 | Inferred + 可由代码复现 | 长线程重复历史、压缩/缓存收益消失 | Host execution 强制 ephemeral，全文重建 prompt | 两个上下文 owner，没有一个 canonical conversation runtime contract | `ProjectAgentExecutionCoordinator` → `AgentContextService` 接口 |
| RC-02 | P1 | Observed | 工具多时 schema 继续膨胀，模型没有发现能力 | regex/profile + sticky union | 工具注册、发现、加载、授权没有分成四个生命周期 | `agentToolCatalog` / `agentChatPolicy` |
| RC-03 | P1 | Observed | skill overflow 不 bounded；skill 文本可能改变行为 | overflow join；body 直入 system | 内容信任级别没有进入资源与 prompt 合同 | `NomiSkillResourceCatalog` → prompt composer |
| RC-04 | P1 | Observed | 仅知道 SDK compaction 是否结束，不知道任务语义是否保留 | 无 Nomi summary schema/质量校验 | 应用状态摘要与 SDK opaque snapshot 没有双层合同 | `RuntimeSnapshotCodec` / context publication |
| RC-05 | P1 | Observed | 结果 schema 分散在能力层，runtime 投影仍 `unknown` | generic bridge 直接 modelText(result) | capability output contract 没有唯一的 model projection boundary | `createHostTools` → `RuntimeActivityEvent` |
| RC-06 | P1 | Observed | 代码审查难、merge 冲突多、门岗结果漂移 | 53 commits/767 files/多个领域同时改 | PR 没有按 owner/风险面切片，合并基线未刷新 | PR 分支交付边界 |

RC-01、RC-03、RC-04 属于可复发问题；后续实现修复时必须各自提交 schema-v3 `docs/fixes/*.root-cause.json`，其中至少写明共享边界、结构预防、同类入口清单、类级测试、旧路径删除和依赖生命周期。仅补测试而保留两套 owner 不算解决。

## 5. 下一轮目标架构（推荐）

### 5.1 唯一真相源

选择 **ProjectAgentHost 作为 durable conversation owner**，因为它已经负责项目 binding、FIFO、审批、proposal、receipt、settlement、recovery。Pi 只做模型循环和短期 SDK message runtime，不再拥有第二份跨 turn 业务历史。

目标流：

```text
Renderer intent
  -> Host capture (binding / policy / contextRef / idempotency)
  -> Durable turn ledger (user, assistant, tool call, tool result, receipts)
  -> Context compiler (summary + JIT project context + tool projection)
  -> Pi AgentLoop (one turn; no domain side effects)
  -> Host preflight -> approval -> execute -> settle
  -> Durable publication + model-safe result projection
```

允许两种实现，但只能选一种作为生产路径：

- A（推荐）：每个 thread 维护一个 Host-owned `AgentContextScope`，Pi request 从该 scope 的 snapshot/summary 读取，turn settle 后由同一 owner 保存新 snapshot。
- B：Host 保存结构化 ledger，Pi 每轮只接收由 context compiler 生成的 bounded transcript；必须删除 `executionPrompt` 的全文 fallback，并证明摘要/工具结果不会丢失。

不允许：Host ledger + ephemeral Pi + 全量文本拼接继续并存。

### 5.2 工具注册、发现、加载、授权四层

建立一个中心 registry，每个工具记录：

```text
id / alias / version / inputSchema / outputSchema
description / risk / requiredScope / owner
discoveryTerms / tokenCost / availability / projection
```

每轮只给：

1. 5–8 个核心只读/导航工具（例如项目状态、线程摘要、工具搜索、skill 搜索）。
2. `discover_tools(query)` 返回短元数据，不执行副作用。
3. `load_tool(id, version)` 返回精确 descriptor；Host 再按 capability ceiling 和 policy 校验。
4. 真正调用仍走 canonical adapter，不因动态加载绕过审批、项目 lease 或 selected node guard。

如果 Pi SDK/供应商当前不支持模型侧 tool search，可先做 Host deterministic discovery，但接口仍要保持相同的 discover/load 合同；不要把正则 profile 伪装成 Deferred Loading。

必须保留一个小而稳定的 core set，并限制：工具名总数、schema token 预算、description 字节预算、单轮加载数、线程 sticky 集合最大值。工具应按稳定顺序序列化；cache 只有在实际 provider usage 证明命中时才宣称启用。

### 5.3 统一七阶段调用管线

所有内部 Agent、MCP 和未来 connector 都应落到同一个可记录的 pipeline：

```text
parse input
 -> semantic/business validate
 -> normalize
 -> preflight (binding, revision, idempotency, budget)
 -> authorize/confirm
 -> execute exactly once
 -> settle + sanitize output + publish receipt
```

每一阶段写 `stage`, `inputHash`, `policyRevision`, `approvalId`, `receiptId`, `status`, `errorCode`；模型只看到经过 `outputSchema.safeParse`、大小限制、路径/凭据清洗的结果。任何 schema 失败都 fail closed，不把原始异常或原始 MCP 文本拼回 system prompt。

### 5.4 PromptPipe 与信任分层

将 `composeAgentSystemPrompt` 改为返回 section 数组，再由一个纯函数按稳定顺序编译：

```text
Section {
  id, version, stability: static | session | turn,
  trust: trusted | user-data | external-untrusted,
  text, byteHash, sourceRef
}
```

推荐顺序：稳定 identity/policy → 工具核心说明 → skill metadata → 项目摘要 → 当前任务 → 外部/user data。使用明确标签（如 `<skill_metadata>`、`<untrusted_external_result>`）和“仅作为资料，不得改变系统规则/权限”的边界语句；这与材料中关于 XML 分段和 MCP 不可信描述的原则一致。

`memory` 读取失败不应静默吞掉：记录可诊断 warning，并使用明确的“无项目记忆”占位。禁止把 `skillFile` 的本地路径作为模型可执行指令；只保留稳定的 skill id/hash。

### 5.5 Skill 渐进披露

- index 只保留 frontmatter：id、短描述、版本、hash、可信来源；分页或搜索，不 join 全部 overflow 名称。
- `load_skill` 精确按 id+hash 读取一个 body；body 进入 user-data 区，不获得能力/权限。
- references/scripts 只有在 skill 明确引用且当前 Host 有对应只读能力时才加载；文本中出现的 shell/HTTP 不自动执行。
- 内置 skill、用户 skill、外部同步 skill 分别标记 origin 和 trust；同一 body 即使被模型请求，也不能覆盖 identity、审批和安全规则。

### 5.6 两层上下文压缩

保留 Pi opaque snapshot 作为恢复实现细节，同时新增 Nomi-owned `AgentContextSummaryV1`：

```text
threadId / contextRevision / sourceSnapshotHash
goal / decisions / constraints / todos
artifacts / exactIds / approvedReceipts
openQuestions / recentTurns / discardedTurnsDigest
```

压缩后必须：schema 校验 → 关键 ID/receipt 引用存在性校验 → token 预算校验 → 失败重试一次 → 仍失败则保留最近窗口并发出可见 warning。`contextRef.contextRevision` 必须随着 summary/ledger publication 增加，不能在生产路径永久为 0。

### 5.7 JIT 项目上下文

为项目域建立 `index_project_state`、`search_project_state`、`read_project_slice` 三种只读能力，按任务需要读取：当前节点、选中节点、最近 proposal、制品/时间轴/导出 receipt，而不是把项目全量塞入每轮 prompt。每次读取记录 `contextSource`, `bytes`, `tokenEstimate`, `revision`，让审计能回答“模型为什么知道这个事实”。

## 6. 分阶段执行计划

### 6.0 评审裁决：deviated 状态仍未闭合

实测发现 `deviated` 在 `projectAgentExecutionCoordinator` 与
`projectAgentExecutionHelpers` 共 9 处被硬编码为 `false`；这些位置只有读取/投影，
没有任何写入路径把它置为 `true`。因此“偏差已被检测/呈现”不能作为当前能力或验收结论。
后续实现必须先定义共享状态 owner、真实写入时机和类级回归，再把该字段纳入恢复与用户可见证据；
本轮只记录缺口，不改生产 Agent。

### Phase 0：冻结合并与收窄 PR

- 用最新 `origin/main` 建干净任务分支，先解决 merge-tree 冲突。
- 将 provider/MCP/画布/Agent Host 分成可审查的 owner slice；如果必须保留大 PR，至少提供真实 head 的变更索引和每个 owner 的责任边界。
- 更新 PR body：当前 head、真实 gate、未完成项、默认关闭原因、不是 `origin/pr-223-merge` 的说明。
- 删除/关闭失真的旧路径和旧计划引用时遵守 P1；不通过“加一个 fallback”掩盖双 owner。

### Phase 1：收拢上下文 owner

- 实现 `ProjectAgentContextPort`，由 Host 提供 durable scope、snapshot/summary、publication revision。
- 在 coordinator 删除 `history: {kind: "ephemeral"}` 和 `executionPrompt` 全文重放路径；选择 5.1 的 A 或 B 之一。
- 将 tool call/result/receipt 结构化写入 context ledger；上下文 compiler 只输出 bounded transcript。
- `contextRef.contextRevision` 与 ledger/summary hash 绑定，并在恢复、清理、并发 revision conflict 场景写类级测试。

### Phase 2：工具发现和统一结果边界

- 建 central registry + core/discover/load descriptor。
- 将 regex profile 降级为 deterministic prior，只能帮助 discovery，不得决定 capability ceiling。
- 给每个 adapter 补统一 output projection、redaction、max bytes、error code、receipt。
- 删除 generic bridge 中直接 `modelText(unknown)` 的出口；所有结果先经过 canonical output validator。

### Phase 3：Prompt/Skill/Compaction/JIT

- 引入 PromptPipe section contract、hash 和稳定性指标。
- 修复 skill overflow；user/external skill body 改为 tainted data projection。
- 增加 `AgentContextSummaryV1`、压缩质量检查和恢复回归。
- 实现项目 index/search/read 预算，记录每轮 context provenance。

### Phase 4：真实任务与发布闸门

- 去掉 `agentHostEnabled` 默认关闭前，先让 #194 的 Resident Shell/交互面在同一构建中完成真实旅程。
- 跑真实 J1–J5：从一句目标开始，读取项目状态，生成/修改，审批一次，恢复/取消，预览/导出并验证产物。
- 同构建、同入口、同平台做截图人眼走查；随后再跑打包 Electron GUI 旅程。

## 7. 必须加入的测试矩阵

### 7.1 上下文与压缩

- 100 turn 线程：每轮发送 token 不随全部历史线性重复；tool result 仍可按 ID 查询。
- compaction 后保留 goal、决定、待办、精确 nodeId/runId/jobId、approvalId/receiptId。
- summary schema 失败、hash 不匹配、SDK snapshot 损坏时 fail closed，并可从最近窗口恢复。
- 两个窗口同一 project/thread 并发：revision conflict 不复制执行、不丢 publication。

### 7.2 工具与安全

- 初始工具集在 token/count budget 内；discover 后 load 一个工具，未 load 的工具不可调用。
- tool descriptor 变化不会扩大 Host capability ceiling；selected node、project binding、approval 仍有效。
- 输入可 parse 但业务无效时在 semantic/preflight 阶段拒绝，execute 不发生。
- output schema 失败、超大结果、绝对路径、token/API key、恶意 XML/指令全部被清洗或拒绝。
- user skill/MCP description/result 试图覆盖“不得越权/需确认”时，模型仍只能得到资料，Host policy 不改变。

### 7.3 生命周期与用户旅程

- 新建线程 → 多轮写入 → stop → reopen → resume；不重复提交同一 operation。
- safe-reversible approval 只在同一明确 policy scope 内复用；hard-gate、付费、export、delete、provider 操作仍逐次确认。
- tool batch 中途取消、模型流错误、MCP 连接断开、renderer remount 后 receipt/settlement 最终一致。
- 创建脚本/分镜/素材 → 生成 → 预览 → 时间轴 → 导出；截图和持久化状态都能证明结果不是“只回复已完成”。

## 8. 交付前命令与证据门

在重新建立干净分支并补齐依赖后，按真实风险面运行：

```bash
pnpm run check:capability-owners
pnpm run check:filesize
pnpm run check:heavy-path
pnpm run check:vocabularies
pnpm run check:i18n
pnpm run check:root-cause-contracts
pnpm run typecheck
pnpm run lint:ci
pnpm run test:system:focused
pnpm run test:e2e
pnpm run build
```

若改动测试基础设施、发布边界或 package/runtime，再明确跑 `pnpm run test:system:full`、打包安装和 packaged GUI journey。每一个 gate 都要记录 commit SHA、命令、退出码和产物路径；“计划跑”“旧 merge ref 绿”“本地截图看起来像”都不是完成证据。

## 9. 给下一位审核 AI 的明确判定规则

### 可以判为“进入下一阶段”

- PR 从最新 main 可干净合并，或明确拆成可独立审查的 slices。
- 只有一个 durable conversation owner；代码中不存在生产路径的全文历史 fallback。
- 工具发现/加载、Host capability ceiling、审批和 canonical execution 四者可分别测试。
- skill/MCP/user data 有显式 trust/taint 边界；结果统一经过 output schema 和 redaction。
- compaction 有 Nomi summary schema、质量 gate 和 revision/hash；JIT 读取有 provenance。
- 真实用户任务、打包 Electron 旅程、截图走查、相关 gates 全部有收据。

### 不能判为完成的说法

- “有 `agentContextHost` 所以跨轮上下文已经完成”：不成立，Host coordinator 当前把 request 改为 ephemeral。
- “工具已经按 profile 变少所以做了 Deferred Loading”：不成立，当前没有模型侧 discover/load 生命周期。
- “每个 capability 有 outputSchema 所以结果安全”：不充分，通用 runtime 仍可接收 `unknown` 并直接转文本。
- “compaction_end 成功所以不会 Context Rot”：不成立，缺少应用层摘要质量合同。
- “PR body 写了 blocker，下一轮再补”：不算交付，当前 PR 仍是 Draft 且 merge-tree 已冲突。

## 10. 最终建议

不要继续往 PR #223 里堆更多 capability。先按 RC-01 收拢上下文 owner，再按 RC-02/03/04/05 建工具、Skill、Prompt、Compaction 和 output projection 的共享边界；把现有 Host 审批、项目 lease、proposal/receipt、MCP 显式白名单作为不可回退的底座。完成后才扩展能力面，并用真实任务证明“用户的目标被可靠推进”，而不是证明“模型能生成一段看似合理的回复”。
