# Nomi App 内对话/助手面全景体检（2026-08-24）

> 归档说明：统一 Agent 规划前的只读代码体检，验证用户判断「右侧 agent 各自为战」。结论：**后端 loop 已统一，配置层（会话键/提示词/工具/确认）各自为战**。总体方案见 `docs/superpowers/plans/2026-08-24-unified-agent-master-plan.md`。

## ① 入口清单表

| 面板 | 组件文件 | 会话键 | skillKey | 工具集 | 模型来源 | 循环位置 |
|---------|--------|--------|---------|--------|---------|---------|
| 创作区助手 | src/workbench/creation/CreationAiPanel.tsx | `nomi:workbench:<projectId>:creation` | `workbench.creation.<mode>` | documentTools | getAssistantModelPref() + 后端 chooseTextModel | electron/ai/agentChatV2.ts → agentLoop.ts（流式） |
| 生成画布助手 | src/workbench/generationCanvas/components/CanvasAssistantPanel.tsx | `nomi:workbench:<projectId>:generation` | `workbench.generation.canvas-planner` | canvasTools + generationCanvasTools.ts | 同上 | 同上 |
| 方向规划（单次） | src/workbench/generationCanvas/agent/runDirectionPlanner.ts | `nomi:production-directions:<projectId>` | `workbench.production.direction-planner` | 无（mode:'chat'） | 同上 | 同上 |
| 脚本规划（单次） | src/workbench/capability/capabilityApplyHandler.ts | `nomi:production-script:<projectId>` | `workbench.production.script-planner` | 无 | 同上 | 同上 |
| 镜级画面验证 | src/workbench/generationCanvas/agent/shotVerifyJudge.ts | `nomi:shot-verify:<projectId>` | `workbench.shot-verify` | 无（多模态判断） | 同上 | 同上 |
| 分镜规划（单次） | src/workbench/generationCanvas/agent/runStoryboardPlanner.ts | `nomi:production-storyboard:…` | `workbench.storyboard.planner` | 无（JSON 拆分） | 同上 | 同上 |

关键发现：所有入口最终都汇入 `sendWorkbenchAiMessage()` → `workbenchAgentsChatStream()` → **electron/ai/agentChatV2 同一后端**；创作/生成面板会话隔离是有意设计；单次任务用独立会话键并每次清会话。

## ② 各自为战的具体病灶（file:line）

1. **会话键硬编码分散**：workbenchAgentRunner.ts:26-29 / runDirectionPlanner.ts:38-40 / capabilityApplyHandler.ts:95——4 种命名约定无统一工厂。
2. **清会话逻辑各自为政**：CreationAiPanel.tsx ~L330（UI handler）vs CanvasAssistantPanel.tsx ~L250 vs shotVerifyJudge.ts:34 vs runDirectionPlanner.ts:148（业务函数）——时机不一致。
3. **模型选择分散且无降级**：agentChatV2.ts:136-157（后端 selectTextModelCandidates）vs assistantModelPref.ts（localStorage 偏好）——偏好失效静默降级无通知，无能力分级 fallback。
4. **系统提示三层分散**：agentChatV2.ts:60-76（NOMI_AGENT_IDENTITY）+ :78-98（skill prompt）+ generationCanvasAgentClient.ts:57-96（画布专长）——改一处漏他处。
5. **工具集定义重复**：electron/ai/canvasTools.ts + documentTools.ts（后端 schema）vs src 渲染层 generationCanvasTools.ts——同一工具两份定义。
6. **确认/花费处理不一致**：CanvasAssistantPanel ~L400（提议事务+对账）vs CreationAiPanel ~L250（简单确认）——两面板确认交互不同。
7. **clearWorkbenchAgentSession 错误处理不一**：有的 catch 吞掉、有的 void 忽略。
8. **多轮工具循环 vs 一次性文本链路两套并存**：runWorkbenchAgent（多轮）vs mode:'chat' 单次——业务逻辑分裂。

## ③ 相关文档关键结论

**2026-08-19 对话式创作 UX**：业界收敛「开场收敛 ≤3 问 → 中间产物落文本过目 → 长任务后台跑+状态帧」；治「反复确认惹烦」靠三档闸门+批量呈现+会话级信任（Nomi 已有会话级信任 commit efa7a99a，只用在付费确认，应推广）；现役内容创作 MCP 全部零确认 fire-and-forget——Nomi 做确认收敛就是护城河。

**2026-08-22 agent runtime source review**（research-only）：解析 Pi loop / Codex turn 结构；agent loop 的 before/after hook + steering + error settlement 三层机制 Nomi 的 agentLoop.ts 尚未用满。

## ④ 统一 agent 的地基与重写清单

**可直接复用**：agentLoop.ts（Vercel AI SDK 统一循环，retry/maxSteps/tool repair）；agentSessionStore.ts（多 sessionKey 隔离持久化）；NOMI_AGENT_IDENTITY（单一身份真相源）；selectTextModelCandidates（偏好+排序）；多模态附件（agentUserContent.ts）；tool-call 事件流与 confirmTool 反馈通道（agentChatV2Ipc.ts / agentStreamConsumer.ts）。

**必须重写/新建**：① 会话键工厂（低风险）；② systemPrompt 合成器（中风险，注意前缀缓存 byte 稳定）；③ 工具动态注册表（高风险，核心路径）；④ 确认规范化三档闸门（高风险，需 UX 评审）；⑤ 单次 vs 多轮显式声明（中风险）；⑥ 前后端工具 schema 单一来源（中风险）。

**统一 agent 的切实形态**：不推翻重来——在 agentLoop.ts 外套一层「面板注册表」：每个面板声明 `{ sessionKeyContext, skillKey, tools, systemPromptLayer }`，其余由统一框架托管。
