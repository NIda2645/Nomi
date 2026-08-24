# Nomi 统一 Agent 总体方案（Master Plan · 2026-08-24）

> 状态：**方案定稿待用户终审**。三个前置拍板已于 2026-08-24 收到：**大脑=用户自接模型+能力分级**；**接管范围=创作主链优先**；**节奏=P4 照跑、agent 设计并行**。P4 拍板（T1/T2/T3）另见 p4 计划 §6。
> 输入：四份同日调研——`docs/audit/2026-08-24-internal-agent-architecture-audit.md`（内部体检）、`docs/audit/2026-08-24-strategy-docs-reconciliation.md`（文档对账：已决 15/未决 14/冲突 10）、`docs/research/2026-08-24-agent-harness-survey.md`（harness 情报）、`docs/research/2026-08-24-agent-product-interaction-survey.md`（产品对标）、`docs/research/2026-08-24-video-agent-architecture-survey.md`（Video Agent 架构调研）。

## 0. 北极星（一句话）

**内外一个控制面**：外部 agent（Claude Code/Codex…经 MCP）和 Nomi 内嵌统一 agent，驱动**同一批语义工具、同一个确认面、同一套技能库、同一组 Workflow Pack**；用户在哪个入口都能「把故事从文本推进到可编辑初稿、再到可撤销的成片，不丢上下文、不重复扣费、不被模型差异欺骗」。

## 1. 分层总图（谁已有、谁在建、谁待建）

```
L6 Workflow Packs        「小说→一集」第一条（配音进否待拍板）      [待建=Pack 声明格式+模式选择器]
L5 交互层                对话+画布双面 · 参数确认卡 · 级联重跑 · 双视图  [部分已有，随 P4 S3-S5 与 B5 落]
L4 统一 Harness          同步单循环 · 事件溯源日志 · Thread/Turn/Item · 策略引擎  [待建=Track B 核心]
L3 确认面                elicitation 优先 + 置顶浮窗兜底 + 一次确认 receipt      [P1-P3 已有,P4 §3.8 升级中]
L2 语义工具面            12 语义工具 · 可编辑计划 · 封存 · 耐久 Run              [✅ P1-P3 已交付]
L1 生产段                多镜+锚+一次确认+落画布+返工                            [🚧 P4 S1-S7 实施中]
L0 底座                  ProductionRun/合同/预算/outbox/reconcile/资产           [✅ 已交付并 14/14 验证]
```

两个入口都骑在 L2-L4 上：**外部** = MCP transport（工具+elicitation/浮窗）；**内部** = 进程内直连（同一工具实现，P1 不造第二套）。

## 2. 统一 Harness 设计（Track B 的核心件）

采纳依据全部来自 harness 调研（该抄 10 条/该避 8 条/已有等价物 4 条），落成：

1. **同步单循环**（OpenHands v0 异步总线是反面教材）：Electron 主进程/utility process；Vercel AI SDK 做多供应商抽象（BYO key 天然支持，栈内已有）。
2. **事件溯源会话日志=唯一真相源**（dsh「model-visible means logged」）：追加式 JSONL；派生模型上下文重建、UI 回放、断点续跑、fork；与耐久 Run 是同物种，**统一而非并存**。
3. **Thread→Turn→Item 事件流**（Codex App Server 形状，语义对齐 ACP）经 IPC 投影渲染层：每 Item 一张卡，`started→delta*→completed`——与「批量产出逐个冒」既有体感一致；留「将来外接 Claude Code/Gemini CLI 进 Nomi 面板」的门。
4. **单一审批信道**：花钱/写回确认=事件流上的反向请求，turn 暂停等回答；复用唯一 SpendConfirm 漏斗与 P4 §3.8 确认面。**「agent 只许提案不许花钱」是策略引擎里的 deny 规则，不是 prompt 一句话**（规则由 harness 强制，非模型）。
5. **策略引擎单点化**：deny→ask→allow 固定顺序 + 三档闸门（Block/Notify/Auto）+ 会话级信任推广（治「反复确认」，对账文档已决未落项）。
6. **模型能力分级**（用户拍板 BYO+分级）：模型档案声明档位——弱档收窄工具面、多走 playbook 轨道、诚实提示「此模型带不动全自动」；强档放开自由 loop；失败/限流自动 fallback（Gemini model routing 模式）。系统 prompt 走 pi 式小内核（弱模型友好、跨模型行为稳定）。
7. **上下文自动压缩** + compact_boundary 事件 + 可配保留指令（保留分镜决策/角色身份/已拍板项）。
8. **maxTurns + 预算硬顶**在 harness 层。
9. **SKILL.md 渐进披露**：导演/编剧技能库从 MCP resources/prompts 迁 SKILL.md（agentskills.io 开放标准，CC/Codex 已收敛）——内外 agent 共用一份技能库。
10. **v1 明确不做**：subagents（日后作事件层扩展）、独立 plan 子系统（计划=只读权限档）、per-tool 权限弹窗、外部 orchestration runtime（LangGraph/AutoGen/dsh 只抄思想不引依赖）。

## 3. 内部各自为战的收敛（Track B 前置清理）

体检结论：后端 loop 已统一（agentLoop.ts/agentChatV2/身份提示/会话存储可直接当地基），病灶在配置层。修复件按险排序：

| 件 | 内容 | 风险 |
|---|---|---|
| B1a 会话键工厂 | 统一 `sessionKeyFor({area,feature,projectId})`，替换 4 种硬编码约定 | 低 |
| B1b 清会话一致化 | 时机与错误处理统一（现状 UI/业务层各清、有吞有漏） | 低 |
| B1c systemPrompt 合成器 | 身份+skill+专长三层单一合成（注意前缀缓存 byte 稳定） | 中 |
| B1d 单次 vs 多轮显式声明 | 每 skill/面板声明循环模式，框架管清会话时机 | 中 |
| B2 工具动态注册表 | 后端 schema 单一来源 → 渲染层 codegen/导入；skill 声明可用工具 | 高 |
| B3 确认规范化 | 三档闸门全工具统一（创作区补上生成区已有的对账语义） | 高 |

统一 agent 的形态=在 agentLoop 外套「**面板注册表**」：面板只声明 `{sessionKeyContext, skillKey, tools, systemPromptLayer}`，其余框架托管——三界面（创作区/画布/时间轴）是**同一个 agent 的三个投影**，共享 ProjectMemory 与 Run 状态，不新增第四页（Video Agent 调研 §6.1，已采纳）。

## 4. 交互层设计原则（产品对标收敛，L5）

1. **对话是方向盘，画布是路面**：agent 产物一律落画布/结构化视图，聊天只留过程（6 家有 5 家收敛于此；LibTV CLI 的承诺句式照抄——「交付的是一张可继续编辑的画布，不是聊天记录」）。
2. **便宜步骤自动跑、贵步骤一张可编辑参数卡**（TapNow 双模式）：自动/手动确认可切换；卡=模型/时长/数量/**预估总价**可改可算（补上全行业缺的「总账」，直击积分黑箱骂点）——正是 P4 多镜确认卡，复用。
3. **级联重跑**（LibTV）：改上游锚/镜 → 列出受影响下游 → 用户勾选重跑范围；用 IR 字段守恒保证可对账。
4. **双视图**：进度视图（Run/任务）与细节视图（画布/故事板）是同一状态的两个镜头——Nomi 已有画布+任务中心底子。
5. **点选/标注即上下文**（Lovart ChatCanvas）：选中节点/框选区域直接进 agent 上下文（画布已有选中语义，扩展）。
6. **缺信息合并提问 ≤3**（对账已决未落项，借 TapNow ≤4 实证）。
7. **prompt 三层可观测**（用户写的/Agent 改写的/实发的）与**失败归因+是否计费明示**——本地优先的信任差异化。

## 5. Workflow Pack（L6）

- Pack=受约束声明（Video Agent 调研 §6.3 清单）：目标输入/可用工具/步骤分支/capability/每步 propose|paid|project_write/人审点/失败下一步/投影位置/版本迁移。**Skill 只描述方法不拥有权限；Pack 描述组合；Run 负责执行。**
- **「模式」做成流程合同**（对标差异化第 1 条）：选「短剧模式」=锁定步骤序列+产物类型+确认节奏+预算档——比 LibTV Skill Hub（提示词包）深一层。
- 第一条 Pack=「小说/剧本→一集」：编剧段（现有创作区+拆镜）→ 生产段（**=P4**）→ 采纳段（=P5）→ 成片段（时间轴/导出，配音待拍板）。第二条 Pack（广告/口播）复用同一底座后，才宣布「通用被证明」。

## 6. 排序与里程碑（为什么这么排）

**三轨并行，互不等待：**

- **Track A（价值主线，进行中）**：P4 S1→S7 多镜生产段 → P5 写回/撤销。理由：agent 没有生产段就是空壳；P4 的确认卡/浮窗/落画布正是 harness 审批信道与交互层的实体，先建先用。
- **Track B（harness 与统一化，现在启动设计）**：B0 本方案拍板 → B1a-d 低风险清理（可立即做，独立 PR）→ B2/B3 高风险件（设计评审后做，B3 与 P4 S3 确认面合流）→ B4 harness 核心（事件溯源日志+Thread/Turn/Item+策略引擎；在 P4 主体完成后接入，替换 agentChatV2 的散装配置层，**加新删旧**）→ B5 三界面统一面板+模式选择器（样张+拍板后实现）。
- **Track C（外部体验）**：MCP Skill/Workflow 包装（让 Claude Code/Codex 用户「一句话出片」有引导），随 P4 交付节奏走；真实新版 CC elicitation 探针（S3 验收项）。

**最核心（决定以后不用重写）**：P4 生产段闭环；事件溯源日志；单一审批信道；策略引擎。
**能等**：subagents、自定义 Workflow Builder、ACP 直接实现、全功能接管、第二条 Pack。
**不做**：多 agent swarm、外部 runtime 当事实源、per-tool 弹窗、为不同模型做两套 UI。

## 7. 验收（怎么算「通用被证明」）

- Video Agent 调研 J1-J6 矩阵为准（对账映射：J1≈P4-J1、J2/J3≈P2 已验+P4-J2、J4≈锚+一致性走查、J5=P5、J6≈P4-J3）。
- Agent 专属新增：目标→可编辑初稿的时间；确认次数 ≤（1 次批量卡+1 次锚检查点）；换模型/参考后其它字段守恒；弱模型档降级路径真实可用（真机走查）；内外入口（Claude Code vs 内嵌面板）跑同一任务产生**同一个 Run**、行为一致。
- 每步照旧过三闸：样张拍板（B5/模式选择器/agent 面板都是用户可见 UI）、五门、真机走查。

## 8. 待拍板（唯一遗留）

**配音/TTS 是否进第一条 Pack**——建议：进 Pack（成片段），不进 P4；接入方式与供应商在 Pack 立项时给对比表。（对照产品全含配音；短剧用户「无配音≠成片」。）
