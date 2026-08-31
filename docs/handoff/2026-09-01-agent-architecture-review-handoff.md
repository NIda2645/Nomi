# Nomi Agent 架构与测试 PR 审查上下文包

状态：🚧 待外部 Agent 审查。  
用途：提交给第二位审查 Agent 的完整上下文。审查人必须以当前 PR 的实际 diff、`origin/main` 和本文列出的本地证据为准。

## 1. 审查目标

Nomi 是本地优先的 AI 视频创作工作台。最终目标不是让 Agent 多调用工具，而是让创作者用一句自然语言目标，把作品推进到可编辑、可预览、可恢复、可导出的高质量视频。

本 PR 的阶段目标：

1. 汇总 PR #223 的 Agent 架构研究、根因、生产代码改造方案和最新研究证据。
2. 先实现一套能真实抓出问题的测试系统，而不是先修改生产 Agent。
3. 审查未来生产改造的模块边界、状态 owner、依赖方向和文件规模。
4. 在外部审查完成前，不进入生产 Agent 行为改造，也不运行真实付费 Provider。

## 2. Git 与交付约束

- 原始 [PR #223](https://github.com/aqm857886159/Nomi/pull/223) 仍为 OPEN，标题为 `wip: project agent host phase 1 checkpoint`，head 为 `codex/project-agent-host-phase1-20260827`。
- PR #223 是大范围 WIP checkpoint，不作为本次最终交付入口。
- 本次工作从最新 `origin/main` 创建新分支 `codex/agent-test-system`。
- 本 PR 先提交测试系统、架构方案、研究和审查证据；生产 Agent 改造等外部 Agent 审查通过后再进入后续交付。
- 审查时重新执行：

```bash
git fetch origin --prune
git rev-parse origin/main
git rev-parse HEAD
git merge-base origin/main HEAD
git diff --stat origin/main...HEAD
```

不要把旧的 `origin/pr-223-head`、某个父提交或 GitHub REST compare 列表当成当前基线。

## 3. 用户问题与体验目标

创作者真正要做的是：“我有一个视频目标，请帮我形成结构、选素材和模型、预览、执行、修改并导出；中间不要让我学习协议和重复确认。”

用户体验底线：

- 计划可编辑；封存/付费前可调整模型、provider、模式、参数和参考素材。
- 真实 effect 前只有一个清晰确认。
- 进度、等待、失败、未知和恢复都能理解。
- 重启、断线、压缩后不重复扣费、不丢人物/风格/镜头决策。
- Canvas、Timeline、Asset、Document 各自保留事实源。
- 用户不需要理解 lease、receipt、contractHash、providerTaskId、MCP request id。

## 4. 当前候选根因

### RC-01：conversation/control owner 分裂

PR #223 的 `ProjectAgentHost`、Pi session 和 prompt replay 各保存部分状态；生产路径出现 `history: { kind: 'ephemeral' }` 与全文 `executionPrompt` 重建。风险是重启、压缩、renderer remount 或断线时状态重复/丢失。

目标方向：Host 是唯一 durable owner；Pi 只接收编译后的上下文并运行 loop；Thread/Turn/Item/Checkpoint/Event Ledger 由 Host 持有。

### RC-02：模型工具面与内部状态机耦合

PR #223 的 policy/catalog 同时做意图正则、工具筛选、sticky profile、动态投影，canonical capability 与模型可见工具可能膨胀。风险是模型选择困难、内部 transition 被误调用、工具数量掩盖语义设计错误。

目标方向：先合并为少量 semantic capabilities，再做 catalog→lookup→execute；动态加载不扩大权限、预算或 lease ceiling。

### RC-05：typed output 边界不唯一

runtime 的 `unknown`、异常和 provider payload 可能经过 `modelText()` 直接进入模型上下文或 UI。风险是把未知提交误判成可重试失败、泄露内部路径/secret、丢失 receipt/provenance。

目标方向：唯一的 runtime→Host→model/UI projection：safeParse、redact、size cap、错误归一化、receiptRef/provenance；原始异常只进 ledger。

### RC-06：effect completion barrier 缺失

`agent_end`、stream close 或 provider response 不能证明 ProductionRun、预算、receipt、artifact 和 context snapshot 已 settle。风险是 UI 已完成但后台仍有副作用，或重连/重试重复提交。

目标方向：`prepare → approval → reservation → effect → receipt → reconcile/settle → UI completed`；`submission_unknown` 只能对账，不能 blind retry。

### RC-07：交付范围和模块边界过宽

PR #223 是 WIP 大范围变更，包含 Host、MCP、Skill、Canvas/Provider 等多域。风险是审查无法定位根因、回滚边界不清、文件继续膨胀。

目标方向：每个模块有单一 owner 和向内依赖；先 schema/reducer，再 Host，再 context/tool/effect/projection；不保留双实现 fallback。

以上 RC 是候选根因。审查人必须用当前代码逐项验证，发现现状与描述不符时给出具体 file:line。

## 5. 生产代码目标架构（本 PR 不实现）

```text
ProjectAgentHost（唯一 durable control owner）
  ├─ Thread / Turn / Item / Checkpoint / Event Ledger
  ├─ ContextCompiler
  │   ├─ System Prompt policy
  │   ├─ project facts
  │   ├─ Skill evidence
  │   ├─ semantic tool catalog/JIT
  │   └─ compaction/cache boundaries
  ├─ semantic capability + preflight
  ├─ approval / budget / lease
  ├─ ProductionRun / Provider effect
  └─ receipt / reconcile / settlement
        ↓
Pi runtime（只做模型 loop、stream、tool dispatch、abort、steering、compaction hook）
        ↓
MCP / GUI / Renderer（只做 transport 和 projection）
```

审查要回答：这套分层是否可落地？哪些现有文件应归入哪个 owner？是否会产生循环依赖、第二状态源、重复 schema、巨壳或不可能的调用方向？

## 6. 文档与代码阅读顺序

### A. 现状与根因

1. `docs/research/2026-09-01-pr223-agent-architecture-iteration.md`
2. `docs/research/2026-09-01-pr223-tool-surface-design-audit.md`
3. `docs/research/2026-09-01-agent-architecture-root-cause-synthesis.md`
4. `docs/research/2026-09-01-agent-architecture-solution-and-execution-plan.md`

### B. 最新外部研究

5. `docs/research/2026-09-01-agent-evaluation-and-test-research.md`

该报告包含截至 2026-09-01 的 Anthropic Claude Code/Tool Search/Context/Managed Agents、OpenAI Codex App Server/Agents SDK/Deployment Simulation、Pi、Hermes、OpenHands、LangGraph，以及近六个月的 context、compaction、planning、sandbox 和 trajectory safety 论文。外部数字只能作为设计启发，不能直接当 Nomi 验收值。

### C. 内部 canonical 文档

6. `docs/superpowers/plans/2026-08-24-unified-agent-master-plan.md`
7. `docs/superpowers/specs/2026-08-22-unified-runtime-mcp-generation-design.md`
8. `docs/superpowers/specs/2026-08-23-mcp-client-first-authorization-design.md`
9. `docs/handoff/2026-08-24-semantic-single-shot-p1-p3-handoff.md`
10. `docs/research/2026-08-24-agent-harness-survey.md`
11. `docs/research/2026-08-24-video-agent-architecture-survey.md`
12. `docs/guide/agent-runtime-source-reading-and-adaptation.md`

这些文档包含已拍板边界：Transport/projection 不是事实源、MCP/GUI 共用同一合同、一次确认、预算/receipt/WAL/outbox/reconcile、Skill evidence、视频连续性和受控 Pi 迁移。若最新代码与旧方案冲突，以 `docs/ARCHITECTURE-NOW.md` 与当前代码为现状，以用户已拍板文档为方向，指出漂移而不是默默选择一方。

### D. 当前测试代码与基础设施

13. `docs/superpowers/plans/2026-09-01-agent-architecture-test-system.md`
14. `tests/agent-system/schema.mts`
15. `tests/agent-system/schema.node-test.mts`
16. `tests/agent-runtime/*.test.mts`
17. `electron/capabilityCore/productionRunCore.test.ts`
18. `electron/capabilityCore/mcpRequestLifecycle.test.ts`
19. `scripts/test-system.mjs`
20. `scripts/eval-run.mjs` / `scripts/eval-score.mjs`

当前 M0 已完成：case/trace/evidence/verdict schema、版本 fail-closed、J1–J5 charter、answer-free 检查和 harness mismatch self-test。M1 及之后正在实现，不能把 M0 误报成完整测试系统。

## 7. 测试系统的证明目标

### L0 合同

状态机、schema version、typed output、semantic tool surface、Skill/MCP projection、approval/receipt、context hash、cache key 和版本迁移。

### L1 确定性 Harness

Scripted Model、Fake Provider、Fake MCP、Fake Skill Registry、事件账本和故障注入；覆盖计划→审批→一次 fake effect→settle，并证明所有预期 Item 已消费。

### L2 部署模拟

脱敏真实轨迹 replay，区分模型行为、基础设施、安全违规和产品摩擦，避免评测答案污染和 live side effect。

### L3 真实创作者旅程

J1 目标→结构、J2 模型/素材、J3 一次确认→生成→预览、J4 重启/unknown→恢复、J5 连续性/节奏修改→导出。

### 硬门

- settled-before-complete = 0；
- duplicate reservation/provider submit/materialize = 0；
- unknown blind retry = 0；
- approval decline/cancel 后 effect = 0；
- late event 在 abort/settle 后 = 0；
- schema violation/secret/path 泄露到模型或 UI = 0；
- 5 轮 compaction 后关键 policy/receipt/ID/next goal 保留率先建立基线，再设阈值；
- trace 覆盖 turn/tool/approval/interrupt/effect 并在 settle 后 flush；
- 创作质量按目标、结构、身份连续性、视觉质量、可编辑性、成本清晰度、恢复和导出 rubric 评分。

## 8. 请审查人重点检查

### 生产架构

1. 画出当前实际调用图：renderer/IPC → Host → runtime → capability → ProductionRun/provider。
2. 列出每种事实的唯一 owner，以及重复状态、重复 schema、重复 projection。
3. 检查模块依赖是否单向；特别检查 runtime 是否反向依赖业务、MCP 是否绕过 Host、renderer 是否写 effect。
4. 检查文件规模、职责密度、命名和目录；指出需要拆分的具体 file:line。
5. 检查 Skill、tool catalog、Context compiler、approval/budget/receipt 是否在正确层，是否有权限提升路径。
6. 检查“先减少错误能力，再做 deferred loading”是否落到了可执行文件和指标。

### 测试架构

1. M0/M1 测试是否真的能 fail，而不是只测 fixture 自己。
2. fake provider 是否能统计 effect/billing 并表达 unknown/reconcile。
3. 是否复用现有 `scripts/test-system.mjs`、`tests/system/profiles.mjs` 和 `evals`，没有第二套 runner。
4. 事件、context、approval、cost、receipt、安全和真实创作者任务能否关联到同一 evidence manifest。
5. 是否将行为失败、infra failure、安全违规和产品摩擦分开。

### 交付与风险

1. PR 是否从最新 `origin/main` 出发，是否误纳入无关改动。
2. 是否把 PR #223 的 WIP 代码、旧方案或外部 benchmark 数字错误当成现状/承诺。
3. 真实 Provider canary 是否有 provider/account/model allowlist、单次/总预算、max turns/tokens、run id、停止条件和回滚。
4. 任何“已完成”声明是否有代码、测试输出、持久化状态和截图/轨迹证据。

## 9. 审查输出格式

请返回：

1. Executive verdict：Approve / Approve with required changes / Reject。
2. Spec compliance：逐项对照本文和测试计划，标出通过/缺失。
3. Architecture map：当前实际模块图、唯一 owner、循环依赖和建议目录树。
4. Findings：每条包含 Critical/Important/Minor、file:line、机制、用户后果、最小修复边界。
5. Test validity：哪些测试能真实抓问题，哪些只是 fixture 自测，哪些仍缺故障/对抗/真实任务证据。
6. Evidence gaps：需要补读的本地文档、代码、外部一手资料或运行证据。
7. Go/no-go：是否允许进入生产 Agent 改造；若不允许，列出阻塞项和通过条件。

不要只评论代码风格；优先判断共享边界、状态 owner、effect 安全、恢复、成本和用户任务是否真的被证明。

## 10. 当前诚实状态

- 已完成：研究、PR #223/主线对照、根因和生产架构方案、测试系统详细计划、M0 schema/charter/self-test。
- 正在进行：M1 deterministic harness、完整上下文包和测试/生产架构复审。
- 尚未完成：M2–M4 测试实现、真实创作者 Electron 旅程、外部 Agent 审查、生产 Agent 改造、真实 Provider canary、最终 PR 发布。
- 本文不允许审查人把“计划完整”写成“功能已经实现”。

## 11. 已发现的架构复审重点

第一轮架构审查已经指出：M0 的 owner 表不能把目标中的 `ProjectAgentHost` 当成当前唯一控制面；当前真实 seam 还分散在 `electron/productionRun/productionRunRuntime.ts`、`electron/harness/context/contextService.ts`、`electron/harness/runtime/pi/session.mts`、`electron/harness/runtime/pi/run.mts`、`electron/capabilityCore/rendererBridge.ts` 和 `electron/skills/skillStore.ts`。这不是要求保留分裂状态，而是要求测试和生产方案先诚实标出“current”与“target”。

审查还指出：测试目录不能变成第二套 runner；`scripts/test-system.mjs` + `tests/system/profiles.mjs` 必须是唯一 system runner，`evals/` 必须是唯一 replay/scoring runner；`tests/agent-system` 只保存纯合同、test doubles、断言和证据适配。该 finding 已暂停 M1 扩展，修正 owner/依赖契约后才继续。
