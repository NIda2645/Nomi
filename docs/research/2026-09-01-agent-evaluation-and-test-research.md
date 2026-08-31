# Agent 评测与测试系统最新研究补充

日期：2026-09-01  
窗口：2026-03-01 至 2026-09-01；只把带日期、可访问的一手论文、官方文档、官方仓库或官方工程文章作为外部证据。  
用途：为 PR #223 后续的测试系统设计提供证据，不把外部产品的能力误报为 Nomi 已实现能力。

## 1. 先给结论

本轮研究改变的不是“多加几条单测”，而是测试对象的定义：Nomi 要验证的是一条可恢复、可审计、可控成本的创作工作闭环，而不是某一次模型回复是否好看。

必须同时测四层：

1. **模型行为层**：模型是否理解目标、选择正确的语义能力、遵守 Skill 和系统约束。
2. **Harness/控制层**：Thread/Turn/Item、压缩、取消、审批、动态上下文和事件顺序是否稳定。
3. **副作用/信任层**：预算、reservation、幂等、provider unknown/reconcile、MCP 身份、沙箱和 receipt 是否 fail closed。
4. **创作结果层**：真实创作者能否从目标走到可编辑计划、可验证素材、预览、恢复和导出；画面连续性、身份一致性、节奏和可编辑性是否达标。

这也是为什么本轮方案采用“确定性合同测试 + 故障注入/property + 模拟部署轨迹 + 少量真实模型/Electron 旅程 + 人审”的组合。单一 pass/fail 或只测最后产物，都会漏掉长任务中的中间状态、隐藏副作用和恢复错误。

## 2. 近六个月一手证据

| 日期 | 来源 | 观察到的机制 | 对 Nomi 测试系统的直接要求 | 证据边界 |
|---|---|---|---|---|
| 2026-07-28 | [HANDBOOK.md](https://arxiv.org/abs/2607.25398) | 长上下文 Agent 评测要测试“绑定的政策文档”在长工具轨迹中是否仍约束行为；发布任务、环境和 harness | 把 System Prompt、项目规则、Skill 约束作为长轨迹 invariant；不能只做一次 prompt-response | 通用长上下文，不是视频领域；需要迁移任务 |
| 2026-05-11 | [WildClawBench](https://arxiv.org/abs/2605.10912) | 真实 CLI harness、真实工具、可复现容器；平均约 8 分钟、20+ 工具调用 | 测试环境要可重放、工具结果要有 fidelity；区分 agent 行为失败和基础设施失败 | 外部 benchmark，不证明某个模型在 Nomi 上有效 |
| 2026-04-30 | [Odysseys](https://arxiv.org/abs/2604.24964) | 长程任务不能只用二元 pass/fail；每个任务用多个 rubric 评分 | J1-J5 创作任务使用分维 rubric（目标完成、编辑性、连续性、成本纪律、恢复性）并保留轨迹 | Web agent 场景，rubric 需由创作专家校准 |
| 2026-06-16 | [OpenAI Deployment Simulation](https://openai.com/index/deployment-simulation/) | 用历史真实部署轨迹回放候选模型；Agent 场景需高 fidelity 的工具模拟，避免直接操作 live 系统 | 建立录制→脱敏→工具模拟→候选版本 replay；把线上真实失败带回离线回归；所有付费 provider 默认模拟 | OpenAI 内部研究，不能推断 Nomi 的具体效果；模拟器本身需做 fidelity 校验 |
| 2026-07-20 | [OpenAI 长时程安全研究](https://openai.com/index/safety-alignment-long-horizon-models/) | 长运行增加不想要行为机会；固定评测集不够，必须配合监控、护栏、暂停和回滚 | 测试要覆盖整条 trajectory、pause/resume/rollback、越权和异常持久化，而非只看最终答案 | 安全事件背景不同于视频创作，但生命周期结论直接相关 |
| 2026-07-22 | [OpenAI Presence](https://openai.com/index/introducing-openai-presence/) | 生产 Agent 以具体 workflow 为单位；部署前用 common/edge/high-risk 场景、simulations、graders、escalation 规则；上线后用 production session 和 escalation 反馈迭代 | Nomi 评测单元必须是“创作者任务”，有场景集、grader、升级/人工接管和线上回归闭环 | 企业 workflow 产品描述，不是 Nomi 的实现承诺 |
| 2026-05-29 | [OpenAI trustworthy third-party evaluations](https://openai.com/index/trustworthy-third-party-evaluations-foundations/) | 评测 harness 会影响结论；需要检查 eval validity、已知偏差和独立复核 | 每次报告必须记录模型、system prompt、工具仿真、审批模式、网络、数据版本和随机种子；紫队做 harness 对抗 | 方法论文章，具体指标仍需 Nomi 设计 |
| 2026-03-05 | [OpenAI CoT controllability](https://openai.com/index/reasoning-models-chain-of-thought-controllability/) | 监控和行为评测是互补信号；不能把“看起来合规”当作充分安全证明 | 不把模型 reasoning 文本当安全事实；以 tool/effect/receipt/guardrail 事件作权威证据，并加入监控盲点测试 | 研究对象为 reasoning trace，不等于 Nomi 的可解释性设计 |
| 2026-08-04 | [OpenAI third-party cyber evaluations incident](https://openai.com/index/third-party-cyber-evaluations-involving-openai-models/) | 测试环境边界错误会导致越权；网络、凭证和 out-of-scope 目标必须显式限制 | adversarial harness 必须验证网络默认拒绝、凭证不可见、scope 绑定和“模拟环境不会连到真实世界” | 网络安全场景；迁移的是测试环境纪律 |
| 2026-03-24 | [Anthropic harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps) | 长任务要维护 progress、验证、fresh context、分阶段 continuation | 为每个长创作任务记录 checkpoint、验证结果、剩余目标、上下文摘要；重启后从 checkpoint 继续而不是重放全文 | Claude Code 应用文章；需与 Nomi 的 ProductionRun 边界对齐 |
| 2026-04-08 | [Anthropic Scaling Managed Agents](https://www.anthropic.com/engineering/managed-agents) | 将“脑”（模型）和“手”（执行环境）解耦；harness/沙箱/权限是独立层 | 用 fake model、fake provider、fake MCP、真实 Host 组合测试；模型不能直接拥有 Nomi authority | Managed Agents 产品形态不同，边界思想可迁移 |
| 2026-03-25 | [Anthropic Claude Code auto mode](https://www.anthropic.com/engineering/how-we-built-claude-code-auto-mode-a-safer-way-to-skip-permissions) | 自动批准不是取消权限，而是基于 policy、sandbox 和风险边界的组合 | 评测 approval policy 矩阵：连接、计划、执行/花费分别验证；auto 模式也必须保留拒绝和审计证据 | Claude Code 的具体 policy 不等于 Nomi policy |
| 2025-11-24（仍为当前官方工具设计基线） | [Anthropic advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use) | 大工具库使用 Tool Search/defer loading；上下文从 134K 降到约 8.7K 的案例；工具定义和调用示例要动态加载 | 先测 canonical 能力是否能合并/删除，再测 deferred discovery；分别测工具选择准确率、schema 错误率、token/延迟和 fallback | 文章中的数字是 Anthropic 内部测试，不是 Nomi 预测值 |
| 2025-09-29（仍为当前 context 基线） | [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | Context 是每轮动态编译的有限资源；system、tools、MCP、history、外部数据要整体管理 | 对每个 section 记录稳定性、来源、信任、版本、预算和 hash；测试 JIT 加载、压缩、旧信息淘汰和注入隔离 | 观点文章，不给 Nomi 的具体 token budget |
| 2026-08-26 | [Anthropic usage research](https://www.anthropic.com/research/enabling-independent-research) | 真实用户轨迹可用于隐私保护的产品研究 | 建立脱敏的真实创作失败样本池，分离“模型失败/工具失败/产品摩擦”，不能只靠合成 case | 研究分享不提供公开原始数据 |
| 2026-09-01 抓取 | [Codex App Server README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md) | `thread/*`、`turn/*`、`item/*` 生命周期；approval 是 server-initiated request；中间事件可能因 backpressure 丢失但 terminal turn 必须可用；interrupt/resume/fork/ephemeral 有明确语义 | 测试必须以 terminal state + durable ledger 为准；模拟事件丢失、重复、断线、approval cleanup；区分 ephemeral 测试与 production durable 运行 | 开源仓库 main 会变化；每次评测记录 commit |
| 2026-09-01 抓取 | [Codex App Server protocol](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2/thread.rs) | permission profile、approval reviewer、thread source 等控制字段进入协议；不是 UI 临时状态 | 把 policy/profile/source 纳入 contract snapshot 与测试 fixture；拒绝 host 自报权限 | 具体协议版本需锁定快照 |

## 3. 由研究得出的测试原则

### 3.1 测“任务轨迹”，不测“漂亮回答”

一个视频 Agent case 至少要包含：目标、现有项目事实、可用 Skill、能力/工具目录、一个允许调整的计划阶段、一个审批边界、一个副作用或模拟副作用、至少一次观察/修正、最终可编辑产物和复盘证据。只有最后文本相似不算通过。

### 3.2 确定性与真实模型分层

- **L0 合同层**：不烧额度；schema、状态机、权限、预算、幂等、事件 reducer、MCP projection、Skill evidence、context hash。
- **L1 harness 层**：fake model/fake provider/fake MCP/fake Skill registry；故障注入和 property/fuzz，验证可恢复和无重复副作用。
- **L2 部署模拟层**：录制并脱敏真实轨迹，用高保真工具模拟器 replay；用于版本回归和安全评估，不接真实付费 provider。
- **L3 真实模型/真实 Electron 层**：少量 smoke、J1-J5、跨客户端 MCP 走查；只在前面三层绿后运行，并记录额度、版本和环境。

### 3.3 Harness 本身也要被评测

每份结果必须可回答：是否真的运行到了 Agent、工具是否按真实 schema 返回、是否丢了事件、是否有隐藏 approval、是否使用了错误的项目/模型/Skill 版本、是否因为网络或额度失败。`infra_error`、`behavior_failure`、`product_friction`、`safety_violation` 必须分开统计。

### 3.4 安全是轨迹性质

Prompt injection、恶意 Skill、恶意 MCP、伪造 receipt、越权路径、真实网络逃逸、审批绕过和长时间累积风险，必须放在同一条真实生命周期里测。不能只在单个工具函数上加“拒绝字符串”的单测。

## 4. 不应照搬的内容

1. Anthropic 的 Tool Search token 数字、OpenAI 的产品能力和任何模型 pass rate 都不是 Nomi 的验收目标；只能用作设计启发。
2. 公开 benchmark 的“任务完成”不等于视频质量；Nomi 仍需要创作专家 rubric 和人眼对账。
3. reasoning/CoT 文本不是真相源；Nomi 的权威证据是 Host ledger、contract、approval/receipt、provider 状态和最终持久化项目事实。
4. 真实 provider、真实 MCP 客户端和真实网络不能作为第一阶段的默认测试依赖；先用可重放的模拟边界证明无重复扣费和无越权。

## 5. 对下一份测试系统设计的硬要求

- 每个测试 case 有唯一 `caseId`、目标、初始项目快照、输入、允许的能力、预算上限、期望终态、禁止副作用、评分 rubric、证据清单和清理策略。
- 每条外部 effect 都有 `operationId`、`contractHash`、`providerIdempotencyKey`、approval/receipt 引用和 settle 状态；报告能证明 effect 次数。
- 每个长任务至少有一次断线/重启/压缩或审批中断变体；通过条件是恢复后继续，不是重新提交。
- 每个模型/工具面变更都要做基线对比：选择准确率、无效调用、工具定义 token、上下文 token、延迟、成本、任务质量和安全拒绝率。
- 失败报告要能一键下钻到 `case → attempt → event sequence → contract/context hash → provider simulator → screenshot/artifact`。
- 评审至少包括 CTO、设计、PM、前端、后端、真实创作者，并加一轮红队越权/注入和一轮紫队 harness validity 复核。

## 6. 本轮补充的论文与实现细节

以下材料是在初稿后补抓到的，进一步把“上下文/恢复/沙箱”从原则变成可测断言：

- [Agentic Context Management](https://arxiv.org/abs/2607.21503)（2026-07-23）：把 context 分为 architecting、ingesting、scoping、anticipating、compacting；指出朴素历史的 token 成本可随会话长度二次增长，粗糙摘要可能出现 accuracy cliff。Nomi 要记录每轮 context token、命中 section、压缩次数、p50/p95 延迟和任务质量，而不是只断言“摘要成功”。
- [The Compaction Cliff in Long-Running AI Agent Memory](https://arxiv.org/abs/2608.22752)（2026-08-24）：在 20 个配置上观察多轮压缩的安全规则保留率下降，提出按知识类型采取不同保真策略。Nomi 必须连续至少五轮压缩回归 safety/policy/receipt/ID/creative-decision 的保留率；这只是外部实验，不把其具体百分比当 Nomi 预期值。
- [Parallel Context Compaction](https://arxiv.org/abs/2605.23296)（2026-05-22）：顺序压缩会造成墙钟阻塞和摘要体积波动。若 Nomi 选择并行压缩，测试需覆盖摘要长度上界、p50/p95、重复运行稳定性和合并顺序；不能只看最终文本。
- [Agent Planning Benchmark](https://arxiv.org/abs/2606.04874)（2026-06-05 v2）：含无关、损坏、不可解工具，长程规划和校准拒答是弱项。Nomi case 要明确区分“计划不对”“能力不存在”“执行失败”，并加入不可解 provider/不相关 Skill 变体。
- [SANDBOXESCAPEBENCH](https://arxiv.org/abs/2603.02277)（2026-08-01 v3）：覆盖误配置、权限、kernel、runtime/orchestration 的 sandbox escape。Nomi 的 sandbox canary 要检查进程树、文件路径、网络和凭证边界；工具调用成功不能当作安全证明。

Anthropic 当前 Agent SDK 文档还把 `maxTurns`、`maxBudgetUsd`、tool hooks、`ResultMessage` 的 usage/cost/session id 作为生产可观测字段；这意味着 Nomi 的每个 case 必须保存 turn 数、token、成本估算、session/thread id、tool trace，并把预算耗尽与业务完成分开。当前文档入口：[Agent loop](https://code.claude.com/docs/en/agent-sdk/agent-loop)、[permissions](https://code.claude.com/docs/en/agent-sdk/permissions)、[hooks](https://code.claude.com/docs/en/agent-sdk/hooks)。

OpenAI Agents SDK 的当前测试文档提供 provider-neutral `ScriptedModel`/`ModelStep`、`assert_complete()`、session/retry/guardrail/sandbox 测试；tracing 则要求 trace/task/turn/agent/generation/tool/guardrail/handoff 关联，并在后台任务结束时显式 flush。Nomi 应采用同样的确定性 scripted model 与“所有预期 Item 已消费”的断言，但不把 tracing 当作会话事实源。来源：[testing](https://openai.github.io/openai-agents-python/testing/)、[tracing](https://openai.github.io/openai-agents-python/tracing/)、[guardrails](https://openai.github.io/openai-agents-python/guardrails/)。

最后，Codex 的公开 Issue [#25215](https://github.com/openai/codex/issues/25215) 暴露了长线程恢复时全量读取 JSONL 的存储瓶颈。结论是：即使模型上下文完成了压缩，Nomi 的 durable ledger 仍必须测试分页、索引、checkpoint、轮转和大日志恢复；否则“Context 已压缩”只是把问题从模型层搬到了存储层。

## 7. Harness 级一手实现观察

- [Pi agent loop](https://raw.githubusercontent.com/earendil-works/pi/main/packages/agent/src/agent-loop.ts) 当前实现把 `transformContext` 放在 LLM boundary，steering 在 compaction 后重新读取，parallel 结果按源顺序发出，AbortSignal 贯穿 provider/tool，settlement 后拒绝 late update。Nomi 应把这些变成纯函数、顺序和取消 property，而不是依赖某个 Pi 版本的内部事件名。
- [Pi changelog](https://github.com/earendil-works/pi/blob/main/packages/agent/CHANGELOG.md) 的 0.80.4–0.83.0（2026-06-30 至 2026-07-29）连续修复 context transform、split-turn compaction 串行化、截断 tool-call、late progress、compaction retry lifecycle；这说明这些是会反复回归的共享边界，不应只写一次 happy-path 单测。
- [Hermes micro-compaction](https://github.com/NousResearch/hermes-agent/blob/main/docs/micro-compaction.md) 的设计保留 user/head/tail、以 cursor 标识已归档 exchange，并要求 archive+append flush 的原子关系；摘要失败可以 best-effort，但 Nomi 的 effect receipt/settlement 绝不能 best-effort。测试要区分“上下文摘要可降级”和“付费副作用事实不可吞掉”。
- [OpenHands Event API](https://docs.openhands.dev/sdk/api-reference/openhands.sdk.event) 与 [Conversation EventLog](https://docs.openhands.dev/sdk/api-reference/openhands.sdk.conversation) 把 typed immutable event、append-only log、进程锁和 AgentError（可回给模型）与 runtime terminal error 分开；Nomi 需要同样的错误层级和 duplicate tool-call/result cardinality。
- [LangGraph interrupts/persistence](https://docs.langchain.com/oss/python/langgraph/interrupts) 明确恢复会重跑节点，因此 interrupt 前副作用必须幂等；[event streaming](https://docs.langchain.com/oss/python/langgraph/event-streaming) 的 raw `seq` 才是排序依据，timestamp 不能作为顺序真相；[testing](https://docs.langchain.com/oss/python/langgraph/test) 要每个测试新建 checkpointer/thread。Nomi 的 fault harness 必须 fresh project/thread、按 seq 排序、禁止跨 case 污染。

这些材料不是 Nomi 的现成规范：Pi harness-v2 是 working handoff，Hermes issue 是 field report，OpenHands/LangGraph 的图或事件语义也不能直接替换 ProjectAgentHost。它们共同支持的是测试纪律：共享总态、显式 checkpoint、幂等/对账、严格事件顺序和故障后可重放。

## 8. 版本化状态与轨迹安全的补充

- OpenAI Agents SDK 的 [RunState schema 维护参考](https://github.com/openai/openai-agents-python/blob/main/.agents/references/runstate-schema.md) 要求已发布 schema version 成为恢复兼容边界；影响 item、approval、output、sandbox、trace 或 agent state 的字段变化必须 bump，并覆盖旧版本读/新版本拒绝/迁移。Nomi 因此不能只改 TypeScript 类型，必须测试持久化、stream、replay、approval 和 tracing 的配套。
- OpenAI 的 [Conversation state ownership 参考](https://github.com/openai/openai-agents-python/blob/main/.agents/references/conversation-state-ownership.md) 明确要求四种状态主权选一种，禁止本地 replay 与 server continuation 混用；这直接支持 Nomi “Host ledger 唯一 owner、Pi 只是 loop” 的测试假设。
- [ATBench-CodeX](https://arxiv.org/abs/2604.14858)（2026-04-16）以“风险来源 × 失败模式 × 现实伤害”标记完整 Agent trajectory，覆盖 shell、依赖、MCP、approval、runtime policy，而不是只看 endpoint。Nomi 的安全报告也要按 trajectory 记录 failure reason，不能只报一个“被拒绝”。
- [AI Code Sandboxes comparative study](https://arxiv.org/abs/2606.08433)（2026-06-07）从 host attack surface、information leakage、defense-in-depth、CVE history、patch cadence、fuzzing 六轴比较 sandbox；这支持 Nomi 同时做配置、运行时和维护节奏的安全门，而非只检查“sandbox enabled”。

这些最新材料进一步确认：测试系统本身要有版本迁移、状态所有权、轨迹安全标签和长期回归，而不是一组跟着实现细节漂移的快照断言。
