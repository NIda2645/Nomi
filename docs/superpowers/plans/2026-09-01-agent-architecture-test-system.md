# Agent Architecture Test System Implementation Plan

> 状态：🚧 已确认，按 M0→M5 执行；M5 真实 provider 采用用户已授权的受控小额 canary，不得突破本计划的预算与 allowlist 上限。

## Goal

在不先修改生产 Agent 行为的前提下，建立一套可以审查、重放、故障注入、对抗和真实走查的测试系统，证明 Nomi Agent 能围绕一个视频创作目标完成可编辑、可恢复、可控成本的工作闭环。

本计划是后续实现的唯一测试系统入口。它不是“给 PR #223 多加几条单测”，也不是把所有现有命令再包一层；它要把模型行为、Host 生命周期、Context/Skill/MCP、权限/审批/预算、Provider/ProductionRun 副作用、持久化恢复和最终创作质量连接成同一份证据。

## Non-goals

- 本轮不修改 Agent 生产逻辑、不合入 PR #223、不接真实付费 provider、不把外部模型的 pass rate 当 Nomi 目标。
- 不把 MCP、Skill、Tool Search 或 KV/Context Cache 单独当成产品目标；它们必须服务于创作者完成视频任务。
- 不默认引入多 Agent；并行 evaluator 只有在所有权、撤销和失败隔离可证明后才允许进入后续阶段。
- 不用模型自评作为唯一质量结论；质量结论必须有确定性状态断言、持久化事实、轨迹证据和人审。

## Baseline and constraints

### Repository baseline

- 当前工作树是 detached HEAD `7b70993bb`，是 `origin/main@5730b957` 的父提交；不能把它称为最新 main。
- PR #223 head 为 `origin/pr-223-head@48c019da`；PR 相对 `origin/main` 的变化约 767 个文件，不能作为一个不可拆的实现批次直接推进。
- 本轮已有四份研究/根因/方案文档：
  - `docs/research/2026-09-01-pr223-agent-architecture-iteration.md`
  - `docs/research/2026-09-01-pr223-tool-surface-design-audit.md`
  - `docs/research/2026-09-01-agent-architecture-root-cause-synthesis.md`
  - `docs/research/2026-09-01-agent-architecture-solution-and-execution-plan.md`
  - 最新评测研究：`docs/research/2026-09-01-agent-evaluation-and-test-research.md`

### Existing infrastructure to reuse

| 现有能力 | 位置 | 本计划的用法 |
|---|---|---|
| Agent runtime deterministic HTTP fixture | `tests/agent-runtime/httpFixture.mts` | scripted model、网络错误、usage、compaction 和 cancellation 夹具 |
| Pi runtime tests | `tests/agent-runtime/*.test.mts` | runtime loop、snapshot、watchdog、context 和生命周期的低层回归 |
| ProductionRun contracts | `electron/capabilityCore/productionRunCore.test.ts`、`executionContract.test.ts`、`approvalReceipt.test.ts` | 合同、预算、审批和 receipt 的权威断言 |
| MCP lifecycle/contracts | `electron/capabilityCore/mcpRequestLifecycle.test.ts`、`mcpArgValidation.test.ts`、`mcpProgress.test.ts`、`nomiMcpElicitation.test.ts` | transport/projection/elicitation/cancel 的契约回归 |
| Real Electron journeys | `tests/ux/*.e2e.mjs`、`evals/lib/isoApp.mjs` | 隔离项目、截图、持久化项目和真实用户旅程 |
| Two-stage eval | `scripts/eval-run.mjs`、`scripts/eval-score.mjs`、`evals/lib/grading.mjs`、`evals/lib/judge.mjs` | 付费/真实模型运行与零额度评分分离；复用 artifact、events、scores |
| System profiles | `tests/system/profiles.mjs`、`scripts/test-system.mjs`、`scripts/test-focused.mjs` | 将新测试按 risk lane 接入现有 contracts/unit/desktop/journey/full-local 编排 |
| Existing guard/check gates | `package.json` 与 `scripts/check-*.mjs` | 不绕过 `check:root-cause-contracts`、`check:test-waits`、`check:heavy-path`、`check:ipc-sender-binding`、`typecheck` 和 `lint:ci` |

### Required engineering rules

- 改生产边界前先走 `root-cause-remediation`；本计划本身是测试设计，不以测试代码掩盖根因。
- 新增测试系统必须有明确 owner、schema version、artifact retention 和失败分类；不能只生成一段 console 输出。
- 任何涉及取舍的实现先回到用户摩擦：用户表达一个视频目标，系统应少打断、可预览、可编辑、可恢复、可解释地完成。
- 所有涉及付费或外部 effect 的首轮测试默认使用 fake provider；真实额度测试只在零额度矩阵通过后，按硬上限和明确 case 运行。

## 1. Test charter: what “good” means

### 1.1 Product-level success

一个 case 只有同时满足以下条件才算通过：

1. 用户目标被解析为可编辑的创作计划，且不要求用户学习内部工具名、receipt、lease 或 provider task id。
2. 模型只能通过当前能力目录提出语义意图；Host 重新验证项目、版本、能力、权限、预算和输入资产。
3. 需要花费、写入、上传、删除、导出或发布的动作都在唯一审批/receipt 边界内发生。
4. 每个外部 effect 最多一次；提交未知时只能对账，不能盲重提。
5. 断线、重启、renderer remount、压缩或审批中断后，系统从 durable state 继续，不重复扣费、不丢创作决策。
6. 最终项目事实、artifact、canvas/timeline 状态和事件账本可重放；用户能看到下一步和失败后的唯一主动作。
7. 视频创作质量达到 case rubric：目标/受众、分镜结构、跨镜身份、构图/节奏、素材引用、可编辑性、可导出性和真实性均达到门槛。

### 1.2 Authoritative evidence order

遇到冲突时按以下顺序判定，不以最终文本覆盖更强事实：

`持久化项目/ProductionRun 状态 → Host event ledger/receipt → contract/context hash → provider simulator facts → UI projection → assistant prose`

`agent_end`、stream close、模型说“已完成”、MCP client 的裸 boolean 和截图中的按钮状态都不能单独证明业务完成。

## 2. Test system architecture

### 2.1 Layers

| Layer | 目的 | 运行依赖 | 成本 | 通过信号 |
|---|---|---|---:|---|
| L0 Contract | schema、状态机、projection、权限、预算、幂等、hash、版本 | 纯函数/内存 | 0 | 全部 invariant 通过 |
| L1 Harness | loop、Skill、MCP、Context、压缩、取消、重连和故障恢复 | scripted model + fake services | 0 | 轨迹可重放，effect 次数正确 |
| L2 Deployment simulation | 用脱敏真实轨迹验证候选版本，避免测试意识和 live side effect | recorded trace + high-fidelity simulators | 低 | 与生产轨迹的行为/安全差异在阈值内 |
| L3 Real journey | 少量真实模型、真实 Electron、MCP client、人工视觉评审 | isolated app；必要时才真实 provider | 有预算 | J1-J5 完成且证据完整 |

### 2.2 New test-system package boundary

新增代码应集中在 `tests/agent-system/`，不得把 orchestrator 塞进现有 production 巨壳。建议目录：

```text
tests/agent-system/
  schema.mts                 # case、trace、fault、evidence、verdict schema
  fixtures.mts               # project/thread/skill/catalog/contract fixtures
  scriptedModel.mts           # deterministic ModelStep runner
  fakeProvider.mts            # submit/query/reconcile/cancel + billing ledger
  fakeMcpClient.mts           # tools/list, tools/call, elicitation, disconnect
  fakeSkillRegistry.mts       # metadata → body → references/scripts + hash/trust
  eventLedgerHarness.mts      # append/reorder/drop/duplicate/crash/replay
  faultPlan.mts               # named fault points and deterministic scheduling
  assertions.mts               # state/effect/context/security/quality assertions
  evidence.mts                 # manifest, redaction, retention, artifact links
  cases/
    creatorTasks.mts          # canonical J1-J5 tasks and rubric
    adversarialTasks.mts      # injection, poisoned Skill/MCP, scope escape
    recoveryTasks.mts         # restart/unknown/duplicate/compaction variants
  contracts/
  effects/
  context/
  security/
  properties/
  journeys/
```

目录名和文件名是设计约束，不要求一次创建全部文件；每个阶段只引入对应层的最小文件并保留可运行测试。

### 2.3 Production seam map and dependency rule

测试系统不能把目标架构当成当前事实，也不能复制一套 ProjectAgentHost/ProductionRun 控制面。实现前先维护两张明确的表：

| 类别 | 当前真实 seam（需随代码核对） | 测试可依赖方式 |
|---|---|---|
| runtime loop | `electron/harness/runtime/pi/session.mts`、`electron/harness/runtime/pi/run.mts` | 通过公开 `createControlledSession` / `runAgentTurn` 注入 scripted model 或受控 provider；不读取 SDK 私有字段 |
| context | `electron/harness/context/contextService.ts` 与现有 runtime context codec | 测 compiler/projection 的输入输出，不在测试目录复制 context 拼接逻辑 |
| production run | `electron/productionRun/productionRunRuntime.ts`、`electron/capabilityCore/executionContract.ts` | fake provider 只实现 adapter contract；effect 计数通过现有 service seam 观察 |
| MCP | `electron/capabilityCore/mcpProtocol.ts`、`mcpCapabilityProjection.ts`、catalog 实现 | fake client 只模拟 transport；不能绕过 Host/capability preflight |
| Skill | `electron/skills/skillStore.ts`、现有 `nomiMcpSkills` seam | fake registry 只提供 metadata/body/hash/trust fixture，不授予权限 |
| renderer bridge | `electron/capabilityCore/rendererBridge.ts` 与 IPC sender binding | 只验证 typed projection/source binding；renderer 不得直接调用 provider effect |
| target Host | 方案中的 `ProjectAgentHost`/Thread ledger | 只能标记为 target/planned，除非当前代码已存在并由 file:line 证明 |

依赖方向固定为：

```text
tests/agent-system/contracts
  → tests/agent-system/harness doubles
  → existing production seams
  → existing test-system/evals runner
```

测试 double 可以依赖 schema 和公开生产 seam；生产代码不得依赖 `tests/agent-system`；`scripts/test-system.mjs` + `tests/system/profiles.mjs` 是唯一 system runner；`evals/` 是唯一 deployment replay/scoring runner。若某项测试需要复制生产 reducer、budget、MCP dispatch 或 context compiler 才能通过，说明测试边界错了，应改为调用现有 seam 或先修生产契约。

单文件和模块门槛：schema 只放版本化合同与 fixture 描述；harness double 只放测试替身；assertion 只放通用断言；runner/orchestrator 不进入这些文件。任一文件接近项目 `check:filesize` 门槛，先拆分职责再加 case；不以注释或别名掩盖职责膨胀。

### 2.4 Case schema

每个 case 必须能独立重放，至少包含：

```ts
type AgentSystemCase = {
  caseId: string
  version: number
  objective: string
  initialProjectSnapshot: string
  userMessages: string[]
  allowedSkills: string[]
  allowedCapabilities: string[]
  initialToolSurface: string[]
  budget: { currency: string; maxAmount: number; maxTurns: number; maxTokens: number }
  environment: { network: 'off' | 'fixture-only' | 'allowlisted'; provider: 'fake' | 'recorded' | 'live' }
  faultPlan?: string
  expectedTerminalState: string
  forbiddenEffects: string[]
  rubric: string
  evidence: string[]
}
```

Case 版本、项目 snapshot、Skill registry snapshot、tool catalog snapshot、模型配置、随机种子、Git SHA 和测试 harness 版本都写入 run `meta.json`。case 数据不应把答案、评分规则或内部“这是测试”的提示暴露给 Agent。

## 3. Invariants to encode before implementation

### 3.1 Lifecycle/state-machine invariants

用 model-based reducer 生成合法和非法事件，权威状态包含 `Thread → Turn → Item → Attempt → Effect → Receipt → Settlement`：

- `seq` 单调递增；同一 Item 只有一个 terminal lifecycle。
- `approval.pending` 只能转为 approved/declined/cancelled/expired 一次；清理也要有事件。
- `execution_settled` 只有在 Item terminal、approval settled、effect 已分类、receipt/ledger/context snapshot flush 后才能出现。
- `turn.completed` 不能先于 `execution_settled`；`agent_end`/stream close 只可作为中间信号。
- 旧 project generation、lease、policy revision、contract hash、provider namespace 一律拒绝。
- 事件重复、乱序、缺失、断尾日志、重放和并发 append 不产生第二个 effect。

对应测试：`tests/agent-system/contracts/stateMachine.test.mts`、`eventReducer.test.mts`、`settlementBarrier.test.mts`。

### 3.2 Tool surface invariants

工具数量先从语义设计审计，不从 `tools/list` 数字出发：

- canonical model-facing actions 只保留用户能理解的能力；状态机 transition、receipt、lock、reconcile 不暴露为独立模型工具。
- 初始面只包含最小高频能力；未加载的 deferred tool 不可调用；动态发现不等于授权。
- 同一能力在 GUI、embedded Agent 和 MCP 中共享 schema、preflight、错误码和结果语义。
- tool name collision、bare namespace、deferred-only tool、错误的 ToolSearch 配对必须 fail closed。
- 每次 tool-surface 变更都记录初始 token、选择准确率、schema 错误率、无效调用率、延迟、任务质量和安全拒绝率。

对应测试：`tests/agent-system/contracts/toolSurface.test.mts`、`tests/agent-system/context/deferredLoading.test.mts`、`electron/capabilityCore/mcpVisibilityStack.test.ts` 的扩展。

### 3.3 Skill invariants

Skill 是知识与方法，不是权限：

`discover metadata → load exact version/body hash → validate trust → compile bounded section → apply with evidence → materialize`。

- metadata 不得偷偷加载完整 body；未 load 的 Skill 不得影响模型 prompt。
- Skill 不得授予工具、文件、项目、网络或预算权限。
- body、引用、脚本、registry 版本和 selected sections 都有 hash；运行中更新不改变已封存 contract。
- 恶意 Skill 只能作为不可信内容进入 context，不能改变 system policy、tool allowlist 或审批门。
- Skill 缺失、hash 不一致、版本不兼容、脚本越界时要给结构化 error 和唯一下一步。

对应测试：`tests/agent-system/context/skillLifecycle.test.mts`、`tests/agent-system/security/skillTaint.test.mts`，并扩展 `electron/capabilityCore/nomiMcpSkills.test.ts`。

### 3.4 Context/System Prompt/compaction invariants

Context compiler 为每个 section 输出：`source、trust、version、stability、priority、tokenBudget、contentHash、provenance`。

- System Prompt 的 policy 区、工具目录、项目事实、Skill、历史、临时 tool result 分区编译；项目内容不能重写 policy。
- JIT 只在需要时加载；下一轮不需要的低价值结果不复制。
- compaction 必须分类保留目标、用户决策、约束、安全/审批、精确 ID、未完成事项和创作连续性锚点；不能只测试摘要字数。
- 连续五轮 compaction、闲置后继续、tool-use 中途插入用户消息、renderer remount 和 model/effort 变化都要回归。
- cache key 只在 immutable prefix、system policy、tool schema、Skill snapshot 未变化时复用；任何 scope/权限/模型/账户/合同变化都不能错误复用。

对应测试：`tests/agent-system/context/contextCompiler.test.mts`、`compactionRetention.test.mts`、`cacheBoundary.test.mts`、`properties/contextLifecycle.property.test.mts`。

### 3.5 Approval, guardrail and cost invariants

把连接授权、计划确认、执行/花费审批分开，但同一实质动作只有一个可见 challenge：

- 只读读取不触发 spend approval；计划 preview 不产生 provider call、Asset 或扣费。
- approval 绑定 `projectUuid/generation/revision/contractHash/costScope/policyRevision/clientIdentity/challengeId`；裸 `confirm`、`spendConfirmed`、host 自报 projectId 不可信。
- preflight/guardrail 在 effect 前执行；拒绝返回结构化 tool error 让 Agent 安全替代，不能悄悄绕过。
- 预算采用 reservation→effect→settlement；失败、取消、unknown 均能对账；成本包含模型 token、工具执行和 provider 费用，分别记账。
- turn 上限、token 上限、预算上限、拒绝次数和耗时上限都是可观察终态，不得伪装成成功。

对应测试：`tests/agent-system/effects/approvalBudget.test.mts`、`guardrailPrecedence.test.mts`、`costLedger.test.mts`。

### 3.6 MCP invariants

Nomi 当前主要是“作为 MCP server 被 Claude/Codex/Cursor 消费”；MCP 是 transport/projection，不是第二个 Agent 或 authority：

- `tools/list` 与 GUI/embedded 面的 canonical capability 对齐，但不把所有内部 transition 公开。
- tools/call 使用同一 Host preflight/contract/effect/receipt；MCP structured result 只投影已验证结果。
- request cancellation、disconnect、elicitation timeout、client identity、source binding、protocol version negotiation 都有测试。
- MCP client 不可自报 path/project/receipt/approval；客户端不支持 elicitation 时走同一 challenge 的 Nomi GUI handoff，不能二次确认。
- client reconnect/resume 不重新提交已经 accepted/unknown 的 provider effect。

对应测试：`tests/agent-system/contracts/mcpParity.test.mts`、`tests/agent-system/effects/mcpReconnectRecovery.test.mts`，复用并扩展 `electron/capabilityCore/mcpRequestLifecycle.test.ts`、`mcpConversationJourney.test.ts`。

### 3.7 Effect/idempotency/recovery invariants

核心 effect fault matrix：

| 故障点 | 期望状态 | 禁止结果 |
|---|---|---|
| approval 前崩溃 | 无 reservation、无 provider call | 付费或产生 artifact |
| reservation 后、submit 前崩溃 | 可恢复 intent，submit 仍为 0 | 自动重复 reservation |
| provider accepted、task id 丢失 | `submission_unknown`，只允许 reconcile | blind retry/第二个 task |
| provider timeout、实际已接受 | query/reconcile 得到原 task | 新 task/双扣费 |
| callback 重复/乱序 | reducer 幂等，单一 terminal state | 状态回退或重复 materialize |
| cancel 在 in-flight | provider cancel 或标记 unknown，完整 receipt | 假装取消成功 |
| renderer remount | 从 Host projection 恢复 | renderer 自己再发 effect |
| app restart during approval | 恢复同一 challenge/approvalId | 新 challenge 或绕过审批 |
| ledger 断尾/分页 | 校验 hash/seq，拒绝不完整 segment 或从 checkpoint 恢复 | 静默丢事件 |

对应测试：`tests/agent-system/effects/providerFaultMatrix.test.mts`、`reconcileOnly.test.mts`、`ledgerRecovery.test.mts`。

### 3.8 Security/adversarial invariants

红队输入来自 project document、reference image metadata、Skill body、MCP tool result、provider error、web/import asset 和用户消息：

- Prompt injection 不能修改 system policy、tool allowlist、budget、approval 或 project binding。
- 恶意 Skill/MCP 不能执行未声明 script、任意路径、远程 loader、未 allowlist 网络或读取凭证。
- sandbox canary 检查进程树、cwd、文件路径、网络连接、环境变量和外传；“调用成功”不是安全证据。
- 伪造/重放/跨项目 receipt、旧 lease、错误 account/profile/endpoint namespace、providerTaskId 和 idempotency key 必须拒绝。
- out-of-scope provider、无关 Skill、坏工具、不可解目标要安全拒答并给出一个可行动替代，而不是持续探索。

对应测试：`tests/agent-system/security/promptInjection.test.mts`、`sandboxCanary.test.mts`、`receiptForgery.test.mts`、`scopeEscape.test.mts`。

## 4. Deterministic harness and fault injection

### 4.1 Scripted model

`scriptedModel.mts` 提供 provider-neutral `ModelStep`：

```ts
type ModelStep =
  | { kind: 'assistant_text'; text: string }
  | { kind: 'tool_call'; name: string; arguments: unknown; callId: string }
  | { kind: 'approval_request'; reason: string }
  | { kind: 'user_input'; text: string }
  | { kind: 'interrupt' }
  | { kind: 'malformed_output'; payload: unknown }
```

runner 必须有 `assertComplete()`：所有预期 Item、tool result、approval response 和 terminal event 都被消费，否则测试失败。不能因为模型提前说“完成”就放过未消费事件。

### 4.2 Fake provider and billing ledger

fake provider 实现 `prepare/submit/query/reconcile/cancel`，保存：

`operationId、contractHash、providerIdempotencyKey、account/profile/endpoint/model、acceptedAt、providerTaskId、billingEvents、responseFingerprint`。

支持脚本化：立即成功、超时、accepted-no-id、重复 callback、乱序 callback、429/5xx、部分输出、cancel unknown、query stale、价格变化。测试断言 effect count、reservation balance、最终成本和 materialized artifact count。

### 4.3 Fault scheduler

故障不是随机 `setTimeout`，而是带名字、序号和触发条件的 deterministic plan：

```ts
type FaultPoint =
  | 'before_context_compile'
  | 'after_approval_pending'
  | 'after_reservation'
  | 'before_provider_submit'
  | 'after_provider_accept_before_task_id'
  | 'during_callback'
  | 'before_ledger_flush'
  | 'during_compaction'
  | 'during_mcp_disconnect'
  | 'during_app_restart'
```

每次 fault run 都保存 seed、point、ordinal、recovery action 和最终 verdict，保证可重放。

### 4.4 Event perturbation

event ledger harness 支持 drop/duplicate/reorder/delay/truncated-tail/partial-write。约束：测试等待使用 event/condition，不使用私有墙钟轮询或 `Date.now()` 截止逻辑；继续遵守 `check:test-waits`。

## 5. Test suites and concrete files

### 5.1 L0 contracts

| 文件 | 覆盖 |
|---|---|
| `tests/agent-system/contracts/schemaVersion.test.mts` | case/trace/contract/receipt/run-state 版本兼容、旧读新拒绝、新字段 bump |
| `tests/agent-system/contracts/stateMachine.test.mts` | Thread/Turn/Item/approval/effect/settlement 合法转移和非法转移 |
| `tests/agent-system/contracts/toolSurface.test.mts` | canonical 工具、alias 去重、collision、deferred lookup、tool count 三种口径 |
| `tests/agent-system/contracts/skillMcpParity.test.mts` | Skill evidence、MCP/GUI/embedded semantic parity |
| `tests/agent-system/contracts/contextHash.test.mts` | section provenance、hash、预算、稳定 prefix 和 policy isolation |
| `tests/agent-system/contracts/receiptContract.test.mts` | approval/lease/receipt 绑定、重放/跨项目拒绝 |

### 5.2 L1 context/harness

| 文件 | 覆盖 |
|---|---|
| `tests/agent-system/context/skillLifecycle.test.mts` | metadata/body/reference/script 渐进加载、信任/taint、hash evidence |
| `tests/agent-system/context/compactionRetention.test.mts` | 五轮压缩、创作锚点、安全规则、ID、receipt、未完成事项保留 |
| `tests/agent-system/context/cacheBoundary.test.mts` | KV/cache/context cache 的 key 边界、命中/重写/失效及成本账 |
| `tests/agent-system/context/deferredLoading.test.mts` | 初始工具面、按需发现、未加载不可调用、JIT provenance |
| `tests/agent-system/harness/restartResume.test.mts` | Pi session 可替换、Host durable owner、renderer remount、resume |
| `tests/agent-system/harness/eventOrdering.test.mts` | item lifecycle、backpressure、terminal event、flush barrier |

### 5.3 L1 effects and security

| 文件 | 覆盖 |
|---|---|
| `tests/agent-system/effects/approvalBudget.test.mts` | connection/plan/effect gate、reservation、预算上限、拒绝/超时 |
| `tests/agent-system/effects/providerFaultMatrix.test.mts` | provider submit/query/reconcile/cancel fault matrix |
| `tests/agent-system/effects/mcpReconnectRecovery.test.mts` | MCP disconnect、cancel、elicitation、reconnect、unknown |
| `tests/agent-system/effects/costLedger.test.mts` | model token/tool/provider/compaction 成本分账和上限 |
| `tests/agent-system/security/promptInjection.test.mts` | project/Skill/MCP/provider/user 注入和 deny-and-continue |
| `tests/agent-system/security/sandboxCanary.test.mts` | 文件、网络、进程、凭证和远程 loader 边界 |
| `tests/agent-system/security/receiptForgery.test.mts` | receipt/lease/idempotency/identity 篡改与重放 |

### 5.4 Property/fuzz

| 文件 | 生成空间 | 不变量 |
|---|---|---|
| `tests/agent-system/properties/eventLedger.property.test.mts` | 事件重复、乱序、缺失、断尾、并发 | reducer 幂等、seq 单调、terminal 唯一、无第二 effect |
| `tests/agent-system/properties/contextLifecycle.property.test.mts` | section 顺序、预算、压缩边界、Skill 变更 | policy 不被污染、hash 可重现、必保留字段不丢 |
| `tests/agent-system/properties/toolSelection.property.test.mts` | 无关/坏/不可解工具与别名 | 不越权、不调用未加载工具、拒答可解释 |
| `tests/agent-system/properties/recovery.property.test.mts` | fault point × recovery action | recovery-only 对 unknown、成本守恒、无重复 materialize |

`fast-check` 已在 devDependencies 中，优先使用它；每个失败保存 seed 和最小化反例到 run artifact。

### 5.5 L2 deployment simulation

扩展现有 `evals/` 而不是再造一套 runner：

- `evals/datasets/creator-agent.mjs`：J1-J5 任务和变体，不放答案。
- `evals/lib/trace-simulator.mjs`：录制工具结果、项目 snapshot、网络/错误响应和 approval 轨迹。
- `evals/lib/trajectory-grader.mjs`：按 rubric 对 terminal project state、event ledger、cost/effect、安全结果评分。
- `scripts/eval-run.mjs` 增加 `--simulation`，仍遵守 case×trial `HARD_CAP`、断点续跑和 artifact 归档。
- `scripts/eval-score.mjs` 增加行为分、安全分、成本分、恢复分和创作质量分；judge 未校准时只能 advisory。

录制真实轨迹前先脱敏：项目名、素材、路径、token、URL、provider account、用户文本和任何答案/评分规则都不能进入 Agent 可见上下文。

### 5.6 L3 creator journeys

至少五条真实任务，不是功能点探索：

| ID | 用户任务 | 必须覆盖 |
|---|---|---|
| J1 | 从一句目标生成可编辑短视频结构 | brief intake、Skill discover/load、计划预览、无副作用 |
| J2 | 为指定镜头选择模型并加入/替换参考素材 | tool selection、asset hash、能力校验、成本预览 |
| J3 | 用户确认后执行一次生成并在画布/时间轴预览 | 单审批、reservation、provider effect、artifact materialize |
| J4 | 在审批等待或 provider unknown 时重启/断线 | approval resume、reconcile-only、无重复扣费 |
| J5 | 发现跨镜身份/节奏问题后修改并导出 | continuity rubric、编辑性、撤销/重做、导出边界 |

真实旅程沿用 `tests/ux` 与 `evals/lib/isoApp.mjs` 的隔离启动，截图必须由同构建、同入口、同平台分支产生并人工查看；自动断言不能代替人眼判断。

## 6. Creator-quality rubric

每个 J case 采用 0–4 分 rubric，分数和硬门分开：

| 维度 | 0–4 评分问题 | 硬门 |
|---|---|---|
| Goal fidelity | 是否服务原始受众/目标/时长/平台 | 目标不能反转 |
| Story/shot coherence | 镜头顺序、转场、节奏是否可理解 | 必须有可编辑结构 |
| Identity continuity | 人物/主体/风格/参考图跨镜是否一致 | 关键主体不得张冠李戴 |
| Visual quality | 构图、景别、主体位置、可读性 | 无致命破帧/空结果 |
| Editability | 用户能否改 prompt、素材、模型、参数并看到影响 | 不得生成不可解释黑盒状态 |
| Cost/approval clarity | 用户是否知道要花什么、只确认一次、失败是否可理解 | 无未授权 effect |
| Recovery quality | 重启/失败后是否继续且不重复 | unknown 不得 blind retry |
| Export/readiness | artifact、canvas/timeline、导出是否闭合 | 必须有持久化证据 |

硬门任一失败即 case fail；平均质量分只能在硬门通过后用于比较版本。

## 7. Evidence and report contract

每次 run 目录至少包含：

```text
meta.json                 # git/model/harness/case/seed/environment/budget
trace.jsonl               # append-only event sequence or references
contracts/                # compiled context/contract/approval/receipt hashes
effects.json              # fake provider calls, task ids, billing, effect count
artifacts/                # project snapshot, canvas/timeline/export refs
screenshots/              # same-build visual evidence
security.json             # blocked attempts, boundary probes, escape canaries
scores.json               # deterministic + advisory judge scores
verdict.md                # first-screen result and drill-down links
```

报告首屏必须区分：

`PASS/FAIL · behavior failure · infra error · safety violation · product friction · total tokens · estimated cost · effect count · recovery result`。

任何失败都能沿以下路径下钻：

`caseId → attemptId → event seq → context/contract hash → tool/provider simulation → project/artifact/screenshot`。

artifact 只保留最小必要内容，所有敏感字段脱敏；需要长期保留的只有 hash、结构化状态和可复现输入引用。

## 8. CI and local profiles

### 8.1 Proposed profiles

在 `tests/system/profiles.mjs` 增加以下 profile，复用现有 `scripts/test-system.mjs`：

| Profile | 运行内容 | 触发 |
|---|---|---|
| `agent-contracts` | L0 contracts + static schema/security checks | 每个 PR，始终运行 |
| `agent-focused` | changed/sibling agent tests + impacted properties | Agent/context/MCP/effect 文件变化 |
| `agent-effects` | L1 approval/provider/recovery/security | ProductionRun/MCP/Host 风险变化 |
| `agent-journeys` | J1-J5 fake-provider Electron journeys | Agent UI/Host/renderer/React Flow 变化 |
| `agent-simulation` | recorded trajectory replay + scoring | system prompt/tool/Skill/model policy 变化 |
| `agent-release` | 全 profile + packaged smoke + visual evidence | RC/release/手动发布边界 |

contracts 永远先跑；unit/desktop/journey/canvas/performance/package 仍按真实风险触发，不能因为新增 profile 就默认全量烧额度。

### 8.2 New package scripts (after confirmation only)

计划中的命令名：

```json
"test:agent:contracts": "node scripts/test-system.mjs agent-contracts",
"test:agent:focused": "node scripts/test-system.mjs agent-focused",
"test:agent:effects": "node scripts/test-system.mjs agent-effects",
"test:agent:journeys": "node scripts/test-system.mjs agent-journeys",
"test:agent:simulation": "node scripts/test-system.mjs agent-simulation"
```

这些命令只有在 profile stages、artifact schema 和 CI scope classifier 一并实现后才加入；不先写空壳命令。

## 9. Execution phases after user confirmation

### Task 1 — M0: Freeze contract and test charter

1. 在 `tests/agent-system/schema.mts` 固化 case/trace/evidence/verdict schema 和版本策略。
2. 将本地现状映射表与 `docs/ARCHITECTURE-NOW.md` 对齐，确认每个 authority/adapter 的 owner。
3. 固化 J1-J5 初始任务、rubric、预算/turn/token 上限和禁止 effect。
4. 新增一份无业务逻辑的 self-test，证明 harness 能检测“预期 Item 未消费”和“effect 次数错误”。

验收：schema 可序列化/反序列化；错误版本 fail closed；case 不含答案；无生产代码变化。

### Task 2 — M1: Deterministic Host harness

1. 实现 scripted model、fake provider、fake MCP、fake Skill registry、event ledger harness。
2. 写 L0 state/tool/Skill/MCP/context/receipt contracts。
3. 把 fake provider effect/billing 计数接入现有 ProductionRun/ExecutionContract seam，不复制第二套业务逻辑。

验收：所有 L0 通过；至少能重放一条“计划→审批→一次 fake effect→settle”轨迹；全程 0 真实额度。

### Task 3 — M2: Fault matrix and property tests

1. 实现 fault scheduler 和 event perturbation。
2. 覆盖 approval、reservation、accepted-no-id、duplicate callback、restart、compaction、disconnect、ledger tail。
3. 用 fast-check 生成事件/上下文/工具选择反例；失败保存 seed、最小反例和 recovery path。

验收：所有 fault case 满足无重复 effect、unknown reconcile-only、成本守恒、状态不可回退；`check:test-waits` 通过。

### Task 4 — M3: Context/Skill/cache and security adversarial suite

1. 接入真实 ContextCompiler/Skill resolver/MCP projection 的测试 seam。
2. 连续五轮 compaction、闲置 session、system prompt/tool/Skill ablation、cache boundary 回归。
3. 加入 prompt injection、恶意 Skill/MCP、sandbox/path/network/credential canaries。

验收：policy 不被 project content 改写；未加载工具不可调用；任何越权和凭证外传被阻断并有结构化证据。

### Task 5 — M4: Deployment simulation and creator journeys

1. 扩展 `evals` 录制/脱敏/replay；禁止评测答案污染和 live side effect。
2. 用 fake provider 跑 J1-J5，保存项目、事件、成本和截图。
3. 让六角色、红队、紫队分别复核结果；校准 grader 后才允许 judge 计入 pass。

验收：J1-J5 按硬门通过；失败可下钻；行为/基础设施/安全/产品摩擦分开；至少一轮真实 Electron 人眼走查。

### Task 6 — M5: Controlled live canary

1. 仅挑选前置层全绿、可回滚、预算明确的 1–3 个 case。
2. 真实模型/真实 MCP client 运行时只允许 allowlisted provider、最小额度、短时长和显式 run id。
3. 记录真实成本、模型版本、网络、approval mode、cache 命中和 provider result；失败不自动扩大范围。

验收：live evidence 与 simulation 差异在预先批准的阈值内；任何新安全/成本/恢复回归都回退到 L2，不继续烧额度。

## 10. Review and adversarial gates

### Six-role review

- CTO：authority、生命周期、可回滚和长期维护成本。
- 设计：确认/等待/失败/恢复是否让创作者少切换、少学习、能理解。
- PM：J1-J5 是否覆盖真实视频生产价值，而不是技术 demo。
- 前端：事件投影、renderer remount、截图、键盘和状态一致性。
- 后端：合同、预算、幂等、ledger、provider unknown/reconcile、版本迁移。
- 真实创作者：能否不读协议文档完成目标、修改、预览和导出。

### Red team

红队不负责“找一个拒绝字符串”，而是尝试在完整轨迹里：

- 把 project/Skill/MCP/provider 内容变成 policy；
- 伪造 approval/receipt/lease/identity；
- 越过预算、网络、路径、模型或项目 scope；
- 利用 accepted-no-id、重连、回调乱序和重启产生第二个 effect；
- 通过 eval awareness、答案污染或 tool simulator 缺陷让评测虚高。

### Purple team

紫队复核 harness validity：工具模拟是否足够真实、是否漏掉隐藏 approval/事件、是否能区分 infra 与 behavior、是否把评分规则泄漏给 Agent、是否存在“测试环境通过而生产环境不成立”的假阳性。

## 11. Cost and approval policy for the test system

- L0/L1/L2 默认 0 额度；fake provider 不产生真实账单。
- L3 真实模型评测额度按现有规则默认允许，但每个 run 仍受 `case × trial` 硬上限、max tokens、max turns、max budget 和 wall-clock cap 控制。
- 真实 provider 可以在 M5 接入，但只允许使用用户已授权的受控小额 canary；测试系统不能把“允许一定花费”解释成无限制生产调用。
- 每次 run 的成本估算、实际 provider bill、cache read/write、compaction token、tool overhead 分开写入 evidence；“预算耗尽”是可观测失败，不得自动重试扩大花费。
- 审批测试要覆盖 accept/decline/cancel/timeout/restart/replay；审批本身不应进入模型上下文，除非经过结构化、最小化投影。

## 12. Rollback and change control

- 测试系统每个 schema 和 profile 版本化；新 profile 先以非阻断 advisory 运行，连续稳定后再提升为 required。
- 任何测试 fixture 与生产 contract 不一致时，以生产 contract 为准修 fixture；不得通过放宽断言让旧实现继续绿。
- 若新测试揭示 PR #223 现有路径的根因问题，先记录 `docs/fixes/*.root-cause.json`（需要时 schema-v3），再改最早共享边界；不在测试代码里加 fallback。
- 若 live canary 失败，保留 trace/evidence，停止该 case 的后续额度消耗，回退至 fake/simulation；不删除失败证据。
- 取消整个测试系统不会影响生产数据；删除 artifacts 前先确认 retention 和审计需求。

## 13. Definition of done for this plan

本计划只有在以下证据齐全后才可称“测试系统完成”：

1. L0/L1/L2/L3 每层都有可运行入口和明确触发条件。
2. 至少一条 happy path、每个核心 fault point、每个 adversarial class 和 J1-J5 都有 case。
3. 运行能产出 schema-valid 的 `meta/trace/effects/contracts/scores/verdict`。
4. 无第二 effect、unknown 不重提、approval/预算/receipt/Skill/MCP/context/compaction/cache/security 都有断言。
5. 测试结果能区分行为、基础设施、安全和产品摩擦；失败能从 case 下钻到 event、contract、effect 和截图。
6. 六角色、红队、紫队评审通过；真实创作者走查没有必须靠解释文字才能完成的关键步骤。
7. 生产代码实现另开明确的 implementation PR；本测试系统方案不把“测试通过”冒充“Agent 功能已实现”。

## 14. Confirmation record

用户已确认：本计划作为 PR #223 后续验收底座，先在新分支完成测试代码与生产 Agent 架构审查，再提交一个只包含测试系统、架构方案和审查证据的 PR；由用户指定的另一个 Agent 审查该 PR，审查通过后才进入生产 Agent 改造。真实 Provider 可以接入，但只允许在审查通过且 L0–L4 证据齐全后进入 M5 受控 canary。canary 必须使用 allowlisted provider/account/model、单次与总预算、max turns/tokens、明确 run id、可回滚和完整成本收据；任何超限、未知提交或安全回归都立即停止 live，回退到 L2 simulation。
