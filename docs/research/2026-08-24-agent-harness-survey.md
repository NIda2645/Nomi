# Agent Harness 架构情报：为 Nomi 内嵌统一 Agent（2026-08-24）

> 归档说明：全部结论来自 2026-08-24 当天抓取的官方文档/真实仓库（来源随文标注），为统一 Agent harness 设计收集。采纳决定见 `docs/superpowers/plans/2026-08-24-unified-agent-master-plan.md`。

## 存在性验证

| 对象 | 现状 |
|---|---|
| Claude Code | 现役；另有 **Agent SDK**（TS/Python，专为嵌入应用） |
| Codex CLI | 现役开源（Rust）；**App Server JSON-RPC** 是官方嵌入方案 |
| Gemini CLI | 现役开源（Apache 2.0）；新增 hooks/subagents/policy engine |
| pi | 现役；已从 badlogic/pi-mono 迁到 **earendil-works/pi**（pi.dev）；「piagent」即它 |
| DeepSeek Harness (dsh) | 真实存在（deepseek-ai/deepseek-harness，MIT，2026-08 开源即爆）；**developer preview，官方明示破坏性变更** |
| Cline / OpenHands | 现役；各一条独特机制 |

## 各家要点

**Claude Code**：单一 agentic loop；上下文自动压缩 + `compact_boundary` 事件 + CLAUDE.md 可写「压缩保留什么」；skills 与 slash 合并为 SKILL.md（渐进披露，agentskills.io 开放标准）；权限六档含 auto（分类器代审批）、规则 deny→ask→allow、「**权限由 harness 强制而非模型**」；Agent SDK：`query()` 异步消息流（System/Assistant/User/StreamEvent/Result）+ **`canUseTool` 审批回调** + maxTurns/maxBudgetUsd 硬顶；仅 Anthropic 系模型；subagents 独立上下文并发 20/深 3。（code.claude.com/docs：agent-sdk/agent-loop、skills、permissions、hooks、memory、sub-agents）

**Codex CLI**：Rust 100+ crate；**双轴权限**：沙箱 read-only/workspace-write/danger × 审批 untrusted/on-request/never + granular 类别 + `auto_review` 自动评审 agent；默认断网+域名白名单；**App Server：Thread→Turn→Item 三级 + `item/started → delta* → item/completed` 生命周期 + 审批=server 反向 JSON-RPC、turn 暂停等回答**；skills 已跟随 SKILL.md（旧 prompts deprecated）；`[model_providers]` BYO 模型；MCP client/server 双角色。（github.com/openai/codex、developers.openai.com/codex/app-server、learn.chatgpt.com/docs/agent-approvals-security、openai.com/index/unlocking-the-codex-harness）

**Gemini CLI**：cli(UI)/core(后端)硬分层，core 天然可嵌；自动 chat compression + checkpointing + rewind；extensions=MCP+上下文+命令的打包单位；**Policy Engine**：TOML 规则（toolName/commandRegex→allow/deny/ask_user）+ 分层 tier 数学保证高层压低层、deny 可把工具藏出模型视野；**model routing 自动降级**（pro 限流→flash fallback，六家唯一把降级做成一等公民）；subagents 禁递归；ACP 首个实现方。（github.com/google-gemini/gemini-cli docs：policy-engine、subagents、model-routing）

**pi**：最小 harness——系统 prompt+工具 <~1000 token、默认四件套工具；MCP/subagents/plan/权限弹窗全是扩展不进核心；`pi.on()` 全谱事件（session/turn/tool/before_provider_request/model_select…）+ 热重载；树状会话可分支；四种嵌入形态（TUI/JSON/RPC JSONL/SDK）；15+ provider 中途换模型；**无内建权限系统**（靠容器或扩展）。（pi.dev、github.com/earendil-works/pi）

**dsh**：三条核心思想——① Everything is a plugin（连 loop 都是插件，无特权核心）；② **会话日志=唯一真相源**（「model-visible means logged」，replay/fork/持久化天然一致）；③ 事件三域（session 耐久事实 / agent 实时观测 / capability）+ 分发四模式（emit/waterfall/serial/parallel）。bundles：base/web-app/headless，无 TUI。**判断：抄思想，别当依赖**（preview 高频破坏）。（github.com/deepseek-ai/deepseek-harness docs/architecture.md、event-producer-consumer.md）

**Cline**：Plan/Act 双模式（Plan 只读可用贵模型、Act 执行可换便宜模型）+ Trusted Commands 预批准清单。**OpenHands**：v1 推倒 v0 异步 EventStream（亲口承认线程/乱序噩梦），改**同步循环+事件溯源**、对话状态单一真相源。（cline.bot 博客、arXiv:2511.03690、openhands.dev/blog/the-path-to-openhands-v1）

**ACP（Agent Client Protocol）**：Zed 发起的 agent↔UI 标准，JSON-RPC over stdio，复用 MCP JSON 类型 + agentic UX 专用类型（diff/权限请求/会话更新流）；v1 stable、Linux 基金会、25+ agent（Gemini 原生、Claude Code 官方适配器、Codex 社区适配）。（agentclientprotocol.com）

## 为 Nomi 的采纳建议

### ① 该抄（10 条）
1. **Thread→Turn→Item + started→delta*→completed 生命周期**（Codex App Server）——agent 过程投影进 React 的最佳骨架，每 Item 一张卡、与「批量产出逐个冒」体感一致。
2. **审批=同一信道上的反向请求、turn 暂停等回答**（Codex/ACP/Claude canUseTool 同构）——「一次确认才花钱」映射为一种消息类型，不另造弹窗系统。
3. **会话日志=唯一真相源（事件溯源）**（dsh + OpenHands v1 同结论）——追加式 JSONL 派生模型上下文/UI 回放/断点续跑/fork；与耐久 Run 同物种，统一掉。
4. **自动压缩 + compact_boundary + 可配「压缩保留什么」**（保留分镜决策/角色身份/已拍板项）。
5. **SKILL.md 渐进披露开放标准**（CC 定义、Codex 跟随）——导演/编剧技能库迁 SKILL.md，上下文成本≈0 且全行业互通。
6. **策略引擎单点化**（Gemini 分层 tier + CC deny→ask→allow +「规则由 harness 强制非模型」）——「agent 只许提案」是策略引擎里一条 deny 规则，不是 prompt 一句话。
7. **maxTurns + maxBudget 硬顶**（子任务计入总额）——用户自己的 key 在烧，闸必须在 harness 层。
8. **弱模型降级双打法**：Gemini 自动 fallback + pi 小 prompt——模型档案声明档位：弱档收窄工具面+playbook 轨道，强档放开自由 loop。
9. **扩展点=事件订阅而非改核心**（pi/dsh）——权限闸/checkpoint/todos 都能长在事件层。
10. **Plan 不是独立系统，是只读权限档**（CC/Gemini plan mode、Cline Plan/Act）——计划阶段=只读+提案档，封存后切执行档。

### ② 该避（8 条）
异步 pub/sub 当核心状态总线（OpenHands v0 教训）；确认散落各工具（六家全收敛单一审批信道）；拿 prompt 当安全层；为不同模型做两套 harness/UI；现在把 dsh 当依赖；大而绑定单一模型的系统 prompt；无上限循环；闭门自造 UI 协议语义（对齐 ACP/App Server 形状，留外接之门）。

### ③ 已有等价物不重造
工具层=nomi MCP 语义链（带副作用声明，比裸工具先进；内嵌 agent 进程内直连同一实现）；审批模型=封存+一次确认闸；耐久 Run+subscribe_run=事件溯源雏形；工作流层=playbooks+导演技能库（换 SKILL.md 外衣）。

### ④ 最小 harness 形态（一段话）
Electron 主进程（或 utility process）跑**同步单循环**：Vercel AI SDK 做多供应商抽象（BYO key 天然支持）；工具面=现有语义链进程内直连；每步先写**追加式 JSONL 会话日志**（模型可见即已记录），由日志派生 Thread/Turn/Item 事件流经 IPC 投影渲染层（语义对齐 ACP/App Server）；**花钱审批=同信道反向请求**（复用一次确认闸）；技能走 SKILL.md 渐进披露；自动压缩+compact_boundary+保留指令；**模型档案声明能力档位**（弱档窄工具+playbook 轨道）；maxTurns+预算硬顶。**v1 不做**：subagents、独立 plan 子系统、per-tool 权限弹窗。

可信度备注：Codex 枚举以 learn.chatgpt.com 官方文档为准；dsh star 数为抓取时页面值；pi 的 Databricks 基准为二手转述。
