# Agent 的上限与时限：每次请求的输入预算 · 写入回执的准备时限与已知拒绝

> 状态：已实现（PR 见开 PR 后的正文）。来源：铁律走查 pb04（长对话）的两条规则 `input-tokens-over-budget`（10 次）、`agent-write-receipt-stuck`（1 次）；真实用户反馈两条——「Assistant request exceeded the context window」「这一步的结果没对上账，先别按已完成算」。
> 对应合同：`docs/fixes/2026-10-01-agent-request-input-budget.root-cause.json`、`docs/fixes/2026-10-01-agent-write-receipt-stuck.root-cause.json`。

## 改动说明

| | 内容 |
|---|---|
| 新增 | 每一次模型请求的输入都落在预算内：超了就收起这一次请求里**旧的**大工具结果、其次旧的大写入参数（`fitContextToBudget`，接在 pi 给宿主的 `transform_context` 口上）；写入回执的「准备中」有了由回执主人定的时限，到点落到终态；渲染层明确回的「目标已过期」按已知拒绝处理 |
| 改变 | 渲染层回 `surface_port_stale` 的写入不再被说成「结果没对上账」，而是如实说「目标已过期、什么都没执行」，回执当场收场；被阻挡的写入会被告知旧写入还要多久自动收场、先读一遍再写 |
| 去掉 | 没有去掉任何能力；不调大上下文窗口、不加重试、不吞报错 |

## 先查别人

- **上下文快满时先清旧工具结果，而不是先摘要**：Anthropic 的 context editing（`clear_tool_uses_20250919`）按时间从最老的开始清工具结果，每条换成占位文字，默认只清结果不清调用参数，`trigger` 默认 100,000 输入 token、`keep` 默认保留最近 3 组、可 `exclude_tools`、可选 `clear_tool_inputs`——https://platform.claude.com/docs/en/build-with-claude/context-editing 。Anthropic 工程博客把「清工具结果」称为最安全、最轻的一档压缩，摘要要更靠后——https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents 。结论：照做这个顺序（先结果、后参数、都留占位说明），不另造摘要；我们保留「最新一条结果」而不是「最近 3 组」，因为我们的触发是每次请求的预算，不是回合数。
- **旧观察换占位而不是删结构**：SWE-agent 的 `LastNObservations` 把旧观察换成一行「Old environment output: (n lines omitted)」，顺序与结构保留——https://swe-agent.com/latest/reference/history_processor_config/ 。JetBrains 的研究（NeurIPS DL4Code 2025）比较了「观察掩码」与「LLM 摘要」：掩码把成本降一半，解题率持平甚至略好于摘要——https://arxiv.org/abs/2508.21433 。结论：支持用掩码做第一道，摘要（pi 自带压缩）留给回合之间；占位里要写「怎么拿回来」（再调同一个工具）。
- **pi 留给宿主的口**：`transform_context` 的返回值可以带 `messages`，文档原话把它的用途写成上下文窗口管理（裁剪旧消息）——`node_modules/@earendil-works/pi-agent-core/dist/types.d.ts:150-170` 与 `node_modules/@earendil-works/pi-agent-core/dist/harness/agent-harness.d.ts:510-520`。结论：用这个口，不改 pi，不并行造一套；只改本次请求的视图，不动落盘转录。
- **OpenAI Agents SDK 的做法**：靠 `SessionSettings(limit=N)` 只取最近 N 项、`OpenAIResponsesCompactionSession` 在回合后压缩，官方文档明说它不做摘要——https://openai.github.io/openai-agents-python/sessions/ 。结论：同样是「回合间压缩 + 取用时裁剪」两层，我们的 pi 压缩对应前者，这次补的是后者（每次请求的视图）。
- **工具调用超时以后怎么跟模型和用户说**：OpenAI Agents SDK 的函数工具超时默认 `timeout_behavior="error_as_result"`，把一条模型可见的超时消息作为结果交回，让它自己恢复；也可选 `raise_exception` 直接失败——https://openai.github.io/openai-agents-python/tools/ 。MCP 规范：实现应给所有发出的请求设超时，超时后发取消通知并停止等待；即使有进度通知也要有最大超时；取消与完成可能竞态，晚到的响应发送方应忽略——https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle 、https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/cancellation 。结论：准备态要有主人定的时限、到点有终态、告诉模型发生了什么；晚到的结果不能再改写已收场的终态。我们的时限取写工具预算加收尾余量，且「明确拒绝」当场收场，时限只是兜底。

## 概念的唯一主人

| 概念 | 主人 | 登记 |
|---|---|---|
| 每一次模型请求的输入预算（超了怎么收） | `electron/agentLane/laneContextFit.ts` `fitContextToBudget` | `agent-lane.request-input-budget` |
| 写入回执「准备中」的时限与终态 | `electron/capabilityCore/projectAgentProposalReceiptStore.ts` `createProjectAgentProposalReceiptService` | `agent-proposal.receipt-preparing-deadline` |
| 渲染层写入回复的结局归类（明确拒绝 / 结局不明） | `electron/capabilityCore/canvasReadSurfacePort.ts` `createCanvasReadSurfacePortRuntime` | `capability.surface-write-outcome` |

## 测试

`electron/agentLane/laneContextFit.test.ts`、`electron/capabilityCore/projectAgentProposalReceiptStore.test.ts`、`electron/capabilityCore/canvasReadSurfacePort.test.ts`；真应用 pb04 长对话（每次请求输入 token、回执终态）；真文本模型 10 回合的前后对比（`tests/ux/agent-long-chat-real.paid.mjs`）。

## 回滚

两件互相独立：预算（`laneContextFit.ts` + `laneHost.mts` 的 transform_context 一处）、回执（`projectAgentProposalReceiptStore.ts` 的 `settleExpired` + `canvasReadSurfacePort.ts` 的一行分类）。
