# Unified Runtime + Dynamic Modules + MCP Generation Design

> 状态：设计稿（2026-08-22）。本文件已获产品方向确认，待用户复核后再生成实施计划；本阶段不改运行时代码。

## 1. 目标与不做项

### 基线证据

本设计以 `origin/main` commit `ae53045bb094ca1db0cb6aefe1fa7a7e0baa6b07` 为代码基线。干净 sibling worktree 的基线结果为：

```text
pnpm run typecheck  ✅
pnpm run test       ✅ 659 test files / 5938 tests, 1 skipped
```

当前共享工作树的冲突和未跟踪文件不属于本设计的证据；实施时必须重新在自己的 sibling worktree 记录基线。

### 目标

把 Nomi 的 Agent/Production/MCP 接口收敛为一个可恢复的执行内核，并先交付一条真实、可验证的 MCP AI 生成闭环：

```text
MCP initialize
→ 读取项目/能力上下文
→ 动态提出一镜计划
→ 预检与一次审批
→ 提交一个 GenerationJob
→ 进度、取消、断线恢复、幂等对账
→ 本地 Artifact 与真实预览
→ 生成剪辑区 Adopt Proposal（不自动落轴）
```

“做图”“做视频”“宣传片”不再是运行时硬编码的唯一流程。它们保留为可选 Recipe，给模型一组默认模块和参数；真正执行的路径由本次 `ExecutionContract` 冻结。

### 当前不做

- 不先迁移全量 `EditorDocument` 或 Timeline v2。
- 不先做完整 `brand.promo`、多镜头短剧、完整 NLE 或本地访谈剪辑。
- 不先接 Remotion/HyperFrames 的生产渲染器。
- 不把所有底层 provider API 暴露成 MCP 工具。
- 不允许 Skill、外部 Agent 或 widget 直接拥有花费、写时间轴、导出权限。
- 不让动态组合执行任意远程代码或未经注册的模块。

## 2. 关键决策

### 2.1 固定骨架，动态模块，冻结合同

固定的是不可跳过的宿主流程：

```text
ContextSnapshot
→ CapabilityCatalog
→ PlanCandidate
→ Preflight
→ TypedGate
→ ExecutionSnapshot
→ RuntimeTask / GenerationJob
→ Verify / Reconcile
→ Artifact
→ Adopt / Export decision
```

动态的是当前任务需要的模块、顺序、并行分支和参数。模型、Skill、用户输入和项目上下文只负责提出选择；在任何付费、外部提交或项目写入前，宿主把选择编译成不可变的 `ExecutionContract`。

因此本方案不是“没有 Workflow”，而是“不预先把每个用户任务写死成一条 Workflow”。每次运行都会产生一张受约束、可审计、可恢复的临时执行图。

### 2.2 五层对象边界

| 层 | 责任 | 明确不负责 |
|---|---|---|
| Runtime | 状态、事件、能力、权限、预算、恢复、幂等 | 具体审美和供应商参数 |
| Module | 一个有输入/输出/能力/副作用合同的语义能力 | 活跃项目状态的独立副本 |
| Skill | 方法、判断规则、Prompt/QA 指导，按需加载 | 权限、计费、写项目 |
| Recipe | 可替换的模块组合和默认参数 | 当前 Run 的事实和凭证 |
| Adapter | provider、资产传输、渲染器或 MCP transport 的翻译 | 第二套时间轴或第二套 Run |

模块 `kind` 使用闭集：`workflow | route | check | renderer | connector | knowledge`。首片只允许 Nomi registry 中已安装、已审核、已 hash 固定的模块。

### 2.3 现有对象不重复造真相源

现有 `ProductionContract` 继续表示一次 Production Run 的业务/预算/用户可审合同；新的 `ExecutionContract` 只表示一次操作或一镜的编译执行描述；Storyboard 只是它的一个 payload adapter，必要时保留 `StoryboardExecutionContract` 兼容别名。

```text
ProductionContract  = run / job-set / budget / approval envelope
ExecutionContract   = one operation/shot compiled execution binding
Storyboard payload  = story-specific input/output portion
ProductionRun       = durable orchestrator and event owner
RuntimeTask         = provider-neutral execution boundary
AssetRecord         = existing asset identity/provenance owner
MCP/UI/Canvas       = transport or projection, not truth source
```

本文中的 `GenerationJob` 是业务概念，不要求新增平行类型；首片优先复用现有 `ProductionJob`/`RuntimeTask`，只补 typed `executionBinding`。不得同时引入新的 `AssetRegistry`、`EditorDocument` 写入源来复制现有 Asset identity 或 Timeline 状态。若未来确实需要新类型，必须先给出 ownership ADR 和迁移测试。

当前 ownership 对账：

| 现有边界 | 继续作为 owner | 本设计只增加 |
|---|---|---|
| `electron/runtime.ts` | provider-neutral `TaskRequest`/`runTask` 执行边界 | module/task envelope、fingerprint、reconcile hook |
| `electron/productionRun/` | durable Run、预算、gate、事件、outbox、恢复 | `executionBinding` 和 contract 关联 |
| `electron/capabilityCore/` | MCP dispatcher、tool projection、host transport | stage-aware tool exposure、typed output |
| 现有 Asset/transport store | Asset identity、local materialization、lease/privacy | contract 输入版本和 provenance binding |
| Canvas/Timeline | 当前项目事实和用户可见投影 | P5 的 Proposal adapter，不先迁移 owner |

任何新模块都必须引用这些 owner，不能在模块内部保存第二份项目、Run 或资产状态。

## 3. 合同设计

### 3.1 ModuleManifest

```ts
type ModuleManifest = {
  id: string
  kind: 'workflow' | 'route' | 'check' | 'renderer' | 'connector' | 'knowledge'
  version: string
  contentHash: string
  inputs: ArtifactContract[]
  outputs: ArtifactContract[]
  requiredCapabilities: CapabilityExpr[]
  allowedTools: string[]
  allowedCommands: string[]
  validatorRefs: string[]
  executorRef: string
  approvalPolicy: ApprovalPolicy
  sideEffectClass: 'read' | 'propose' | 'paid' | 'project_write' | 'publish'
  retryPolicy: RetryPolicy
}
```

`allowedTools` 是宿主注册表的上限，不是 Skill 文本中提到工具名的结果。模块缺失、hash 不一致、能力不满足或工具不存在时，编译失败且不得产生候选产物。

### 3.2 ExecutionContractV1

```ts
type ExecutionContractV1 = {
  contractVersion: 1
  contractId: string
  source: { kind: string; artifactId: string; version: number; hash: string }
  operation: { kind: string; module: { id: string; version: string; contentHash: string } }
  project: { projectId: string; revision: number }
  inputs: {
    promptParts: PromptPart[]
    assetRefs: Array<{
      assetId: string
      role: string
      version: number
      stateId: string
      required: boolean
    }>
    params: Record<string, unknown>
  }
  capabilitySnapshot: CapabilitySnapshot
  outputs: { artifactKinds: string[]; destination: 'project_asset' | 'canvas' | 'timeline' | 'export' }
  policy: { gateId: string; maxSpend: number; approvalHash: string }
  execution: {
    requestFingerprint: string
    idempotencyKey: string
    runtimeTaskId: string
  }
  ledger: FieldLedgerEntry[]
  warnings: string[]
}
```

`ExecutionContract` 必须记录解析后的模块、Skill/body hash、能力快照、输入资产版本、provider 参数映射、丢弃字段和警告。运行中更新 Skill、模型目录或模块版本不会改变已经冻结的合同。

### 3.3 PlanCandidate 与 Gate

外部 Host 或 Nomi 内部 Agent 可生成 `PlanCandidate`，但候选只能包含模块、参数、依赖、成本估算和验收要求；不能携带 `approved`、`providerTaskId`、`assetId` 或伪造质量 verdict。

第一版 Gate 类型：

- `generation_plan_review`：审阅计划、模型、参考图、预估成本；
- `generation_submit`：批准一次付费/外部提交；
- `artifact_adopt`：批准把已验证 Artifact 提案写入项目；
- `export_publish`：后置，首片不实现。

每个 DecisionRecord 必须绑定 `gateKind + targetHash + projectRevision + costScope + actor + expiresAt`。重复相同决议返回原 receipt；不同 hash 或过期 receipt 一律拒绝。

### 3.4 Host planning 与 Skill provenance

当 Claude/Codex/WorkBuddy 等外部 Host 已经提供模型时，Nomi 优先通过 `nomi_get_generation_context` 返回 schema、能力目录、已选资产摘要和限制，由 Host 生成 `PlanCandidate`；这一步默认不再调用 Nomi 额外的付费/模型规划器。Host 只能提交候选，不能提交批准、provider task 或质量通过结果。Host 断线时 Run 保持 `awaiting_candidate`，不会静默切换到另一模型。

Skill 证据必须区分 `discovered`、`loaded`、`applied` 三态，记录 `skillId/version/contentHash/source/selectedSections/stage/inputHash/outputArtifactIds`。缺失 Skill 不得写 `version: "declared"` 伪装成功；缺正文 hash 时合同编译失败。

## 4. MCP 第一切片

### 4.1 语义工具面

不继续膨胀现有裸 `nomi_generate`。新增或收口一组高层语义工具，内部统一走现有 `ProductionRun`/`runtime.runTask`：

```text
nomi_get_generation_context
nomi_submit_generation_plan
nomi_preview_execution
nomi_decide_generation_gate
nomi_start_generation
nomi_get_run / nomi_subscribe_run
nomi_get_artifact
nomi_propose_adopt_artifact
```

`nomi_generate` 在迁移期只作为 `legacy` 兼容入口，不能另有一套 provider、预算或资产写入逻辑；最终切换时删除旧写语义，而不是长期双写。

### 4.2 工具曝光策略

工具目录按 Run/Stage 暴露子集：

| 状态 | 可见能力 |
|---|---|
| 未预检 | context、能力查询、计划提交 |
| 计划待审 | preview、修改候选、读取 gate |
| 已批准未提交 | start（仅当前 contractHash） |
| provider 处理中 | get/subscribe/cancel/reconcile |
| Artifact 已验证 | get_artifact、propose_adopt |
| Adopt 已批准 | 项目写入由唯一 Command/Production 入口执行 |

MCP `tools/list_changed` 或模块目录刷新不能改变已冻结 Run 的合同；最多影响下一次 Run。

### 4.3 单镜生命周期

第一片只支持 `generation.single-shot`：一个已审合同、一个 shot、一个 provider job、一个本地 Artifact。支持单参考图或无参考图；首尾帧、音频、多镜头和复杂连续性作为能力条件，缺失时明确 `blocked` 或拆成后续模块，不能填空字符串伪装支持。

生成完成后只登记 Artifact 和预览，不自动插入剪辑区。`propose_adopt_artifact` 生成可撤销 Proposal，后续 P5 再接现有 Canvas/Timeline 写入路径。

## 5. 分阶段路线与退出条件

### P0：基线与 ownership ADR

**交付：** 当前 `origin/main` 基线报告、对象 ownership 矩阵、旧方案迁移表、模块/合同命名 ADR。

**测试与证据：** typecheck、全量单测、现有 MCP zero-credit journey、重复真相源扫描。

**退出条件：** 能列出每个字段由谁写、谁投影、谁恢复；没有新的第二 Run/第二 Asset owner。

### P1：Runtime + Module + Asset boundary

**交付：** 给现有 `electron/runtime.ts`、Capability Core、资产传输策略和 ProductionRun 加 typed module/task envelope；不重写 provider。

**测试与证据：** fake module registry、schema/能力/工具 allowlist、资产 lease/expiry/privacy、模块原子替换、未知模块 fail-closed。

**退出条件：** 一个现有 image 或 video adapter 能通过统一 `RuntimeTask` 执行，重复命令返回同一 receipt，且没有付费调用前的隐藏网络请求。

### P2：ExecutionContract compiler

**交付：** PlanCandidate → ExecutionContract 的纯编译器；接入现有 storyboard/plan.attach binding，补 canonical hash、field ledger、module/capability/asset-state/fingerprint。

**测试与证据：** plan→node→runtime request→ProductionJob 字段守恒；未知字段、失效 asset version、能力降级、旧 contract migration fixture；contract hash 稳定性。

**退出条件：** 同一输入和同一 registry snapshot 生成相同 contract；任何 warning/dropped field 都可在 preview 中解释；无合同不得进入 provider submit。

### P3：MCP AI generation single-shot

**交付：** 上述 MCP 工具、一次 typed gate、单镜真实 Job、Artifact/preview、外部 host 和 Nomi 右侧 Agent 共用 receipt。

**测试与证据：** real Electron stdio + real MCP client、零额度 fake provider、一次真实 provider smoke、progress、cancel、restart、duplicate callback、submission_unknown、跨项目拒绝。

**退出条件：** 真实外部 Agent 从 context 到 artifact 完整走通；批准前 providerCalls=0；成功路径 provider submission=1；重启不重复扣费；Artifact 可在项目中重开读取。

### P4：生产恢复与受控扩展

**交付：** `ProductionJob.executionBinding`（contractHash、shotId、moduleRef、asset refs、fingerprint、capability snapshot）、reconcile/cancel/lease、有限并发和局部重试。

**测试与证据：** fault injection（503、进程崩溃、断线、迟到回调、provider unknown）、预算 reservation/settlement、依赖波次；不放宽 QA 阈值。

**退出条件：** 所有终态都有结构化 error/nextAction/receipt；retry scope 不会误重跑已提交 provider job。

### P5：剪辑区 Adopt 窄接入

**交付：** Artifact → EditProposal → Apply/Undo 的最小桥；时间轴仍是现有事实源，必要时只做 projection/adapter，不启动全量 EditorDocument v2。

**测试与证据：** stale revision、伪造 asset/job lineage、原子 apply/compensation、重开恢复、截图走查；Apply 前后真实预览对账。

**退出条件：** 用户能在剪辑区看到、批准、撤销一个生成结果；生成模块不能绕过 Proposal 直接落轴。

### P6：动态模块与 Renderer 子项目

音频、审片、参考图选择、Remotion/HyperFrames 分别作为独立 module/renderer 子项目；各自重新经过 sandbox、静态检查、真实预览/导出 parity 和六角色评审，不阻塞 P3。

### P7：完整 Editor/Workflow 产品化

全量 EditorDocument/Timeline v2、本地访谈剪辑、完整 Agent Workbench、`brand.promo`/drama Recipe、多宿主 lease 和大规模 QA 只能在 P3–P5 证明内核成立后启动。它们不再是 MCP 首片的前置依赖。

## 6. 每阶段统一验收合同

每个阶段必须产出 `PhaseEvidence`：

```ts
type PhaseEvidence = {
  phaseId: string
  commitSha: string
  inputSnapshotHash: string
  testCommands: Array<{ command: string; exitCode: number; summary: string }>
  journeyArtifacts: string[]
  screenshotsOrMediaEvidence: string[]
  sixRoleReviews: RoleReview[]
  adversarialReview: AdversarialVerdict
  knownRisks: string[]
  rollbackRef: string
  verdict: 'passed' | 'blocked' | 'needs_attention'
}
```

### 六角色评审硬问题

- **CTO：** 是否仍只有一个 Runtime/Run/Asset 写真相？是否有未经合同冻结的 provider 或时间轴写入？
- **PM：** 用户是否能用一句话完成目标？是否少了不必要的确认？成本/下一步是否可理解？
- **设计：** MCP 对话、Nomi 面板和剪辑区是否形成一个连续控制面，而不是三个重复卡片？失败/等待/恢复是否清楚？
- **前端：** loading、needs attention、cancelled、unknown、stale、reconnect 是否都有可操作状态？是否通过真实入口走查？
- **后端：** schema、权限、预算、幂等、lease、outbox、reconcile 是否由主进程强制？
- **真实用户：** 不看内部术语，能否完成任务、知道花了什么、失败后能否只重做坏的一步？

### 对抗评审最小矩阵

1. Skill 文本提及未授权工具，调用必须被拒。
2. Host 伪造 `approved`、`providerTaskId`、`assetId` 或 quality pass，schema 必须拒绝。
3. 旧 `planHash`、旧 project revision、外国 projectId、过期 receipt 必须拒绝。
4. 同一 `idempotencyKey`、重复回调、断线重连不得产生第二次 provider submit 或第二个资产。
5. provider 返回 unknown/503/无法取消时，系统必须停在可恢复状态，不能自动盲重提。
6. 恶意 Skill/网页/资产文本不能改变 tool allowlist、预算或审批策略。
7. 缺失字体、素材、renderer、音频或能力时必须 blocked/needs_attention，不能伪造完成。
8. 人工模拟器不能通过直接 IPC、文件系统或 provider SDK 伪造通过结果。

## 7. 回滚与停止规则

- P0–P3 只新增受 feature flag 控制的语义入口；旧入口只读或显式标为 legacy，不双写项目事实。
- 每次 provider submit 前保存 contract、input fingerprint、预算 reservation 和备份；提交未知时只 reconcile，不自动再扣费。
- 每次项目写入使用 Proposal/command receipt；apply 中断时全量 compensation，无法补偿则 `needs_recovery`，保留旧状态。
- 任何阶段出现 P0/P1、重复扣费、跨项目写入、无法恢复的 artifact 丢失或 preview/export 不一致，立即关闭 flag，回到上一阶段，不继续扩模块。
- 旧项目迁移、删除旧字段、切换唯一写 owner、安装/升级 renderer 都属于不可逆闸，必须有 copy-on-write、恢复命令和用户可见 receipt。

## 8. 旧方案的处理方式

### 保留为决策来源

- `docs/superpowers/specs/2026-08-08-agentic-production-experience-design.md`：Nomi-authoritative、CAS、预算 ledger、outbox、submission_unknown、诚实进度和安全投影。
- `docs/superpowers/plans/2026-08-20-storyboard-execution-contract-v2.md`：Storyboard IR、canonical hash、field ledger、reference roles、continuity checkpoint；改为通用 envelope 的 payload。
- `docs/plan/2026-08-09-production-mcp-finalization.md` 与 MCP 对话原生计划：真实 stdio、GUI gate、progress、artifact、restart 和 zero-credit journey。

### 明确后置或拆分

- `2026-08-21-agent-editor-workbench` 的全量 EditorDocument/Timeline migration：移到 P7。
- 本地访谈 Agent、完整 Agent Editor UI：独立子项目，P5 后再评估。
- Remotion/HyperFrames：P6 renderer 子项目。
- `brand.promo`/`drama.short`：Recipe/Workflow registry 子项目，不阻塞单镜生成。
- Electron 大版本升级、多宿主 lease、完整 Run Center：独立风险批次，不混入 P0–P3。

## 9. 评审与交付流程

1. 本设计稿由用户复核；未通过前不写实施计划。
2. 用户通过后，使用 writing-plans skill 生成 `docs/superpowers/plans/2026-08-22-unified-runtime-mcp-generation-plan.md`，每个步骤都写精确文件、失败测试、命令、预期输出、commit 和回滚点。
3. 实施计划按 P0→P3 先交付第一条闭环；P4–P7 只保留依赖和进入条件，不提前开工。
4. 每批完成后保存 `PhaseEvidence`、六角色 verdict、对抗报告和截图/媒体证据，用户复核后才进入下一批。
5. 最终发布前再做一次综合六角色评审、独立对抗评审、真实 MCP host 矩阵和完整 gates；没有证据的“完成”不成立。

## 10. 外部架构对账

本设计吸收了以下只读审查结论：Claude Code 的 Skill/MCP/Subagent/Workflow/Hook 分层；Codex 的 per-step tool router、Thread/Turn/Item 事件和审批；Hermes 的动态 registry、Skill bundle、SQLite recovery；Pi 的动态 extension 与渐进 Skill（但不复制其无 sandbox 和未完成 durable harness）；DeepSeek Harness 的 pluginized runtime、typed tool layer、approval service 和动态 workflow seam。共同结论是：固定 runtime 不变量，动态能力目录，副作用前冻结合同；不把 Skill 文本当安全边界，也不把会话日志当付费 Job 真相。
