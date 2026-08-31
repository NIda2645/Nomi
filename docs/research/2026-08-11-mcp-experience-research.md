# MCP 体验研究：用户在 Claude Code / Codex 里怎样才算「舒服地用 Nomi」

> 2026-08-11 · 三路调研汇总（仓库实查 + Higgsfield 深挖 + MCP 协议/客户端实测矩阵）。
> 结论先行：**对话式客户端里，UX 不是「画卡片」，是「设计对话本身」。** 现有 blueprint（2026-08-10）把重心押在聊天端富卡片 + 双面板拆分上，而我们的主力客户端（Claude Code / Codex）**根本不渲染图片、不渲染 MCP Apps**——中心押错了。底座（事件流/预算门/elicitation）大部分已建成，缺的是把它们接到「用户眼睛真正看得到」的四条通道上。

---

## 1. 硬事实：客户端到底给用户看什么（2026-08-11 实查，全部有源）

| 能力 | Claude Code (CLI) | Codex CLI | Claude Desktop / claude.ai | Cursor |
|---|---|---|---|---|
| 工具调用显示 | **折叠成一行**（"Called nomi 3 times"），Ctrl+O 才展开 | 未文档化 | 折叠块，点开才见 | 可展开参数/结果 |
| 工具结果里的图片，用户看得见吗 | **看不见**（终端不渲染，只有模型看得见；开放 feature request #54546 等） | 未文档化 | 点开折叠块后可见 | **可见**（附到聊天） |
| MCP Apps（我们已实现的 widget） | **不渲染**（官方 host 矩阵无 Claude Code） | 不渲染 | **渲染** ✓（2026-01-26 起） | **渲染** ✓ |
| elicitation（服务端发起的表单确认） | **支持 ✓**（v2.1.76+，form + url 两模式，弹真对话框） | **支持**（TUI 呈现，受 `mcp_elicitations` 配置门控；CI 下自动拒绝） | **不支持**（开放 issue） | 支持 ✓ |
| progress notifications | **渲染 ✓**（工具行内状态文字；且重置 idle 超时） | 未文档化 | 未文档化 | 未文档化 |
| 长阻塞调用 | >2min 自动转后台任务（elicitation 弹窗期间**不**转）；stdio 无进度 30min idle 杀 | `tool_timeout_sec` 默认 **60s**（我们写配置时已调高 ✓） | 未文档化 | 未文档化 |
| annotations 影响审批 | 无文档化效果 | **`writes` 模式只对非只读工具提示** ✓ | 无 | 无 |

来源：code.claude.com/docs (mcp / permissions / interactive-mode)、Claude Code CHANGELOG v2.1.226、developers.openai.com/codex (mcp / config-reference / config-advanced)、modelcontextprotocol.io/extensions/client-matrix、各开放 issue（详见调研 agent 报告，编号已存）。

**协议版本现状**：最新 spec 为 **2026-07-28**（破坏性：MRTR、sampling/logging 弃用、`subscriptions/listen` 取代 resources/subscribe）；但 Claude Code / Codex 部署基线仍是 2025-11-25 时代机制（Codex 0.147.0 于 2026-08-07 加了 opt-in 支持）。**按 2025-11-25 机制设计，盯着 MRTR/Tasks 扩展演进。** 另：MCP 至今**没有 video content block**——视频只能走 resource_link / 深链。长任务的 Tasks 扩展（`io.modelcontextprotocol/tasks`，input_required 状态就是为「人工审批数分钟+」设计的）已是官方扩展，但**尚无主流客户端宣布支持**——观察项，不是依赖项。

### 推论：在 Claude Code 里，真正到达用户眼睛的只有六条通道

1. **模型的转述**（模型读工具结果→用自然语言讲给用户）——**第一大通道**，工具结果要为「被转述」而设计
2. **progress notifications**（调用行内实时状态 + 保活）
3. **elicitation 表单**（我们在对话里唯一能拿到的「真 UI」）
4. **resource_link / nomi:// 深链**（可点击跳 Nomi）
5. **系统通知**（Nomi 自己发的桌面通知，绕开 MCP）
6. **Nomi 窗口本身**（用户切过去看）

蓝图里画的「聊天端媒体卡 + run-card」不在这六条里——那是 Claude Desktop / Cursor 才有的增强层。

---

## 2. Higgsfield 深挖：同赛道的答案（全部有源，要点）

架构是**三轨**而非单一 MCP：远程 MCP（`mcp.higgsfield.ai/mcp`，OAuth+PKCE，零安装，无 API key）给聊天端；CLI + **Agent Skills**（686★，9 个 skill 包 `.claude-plugin`/`.codex-plugin`）给编程 agent——官方明说 skills 轨道是为了「minimal token overhead + structured output」。

值得抄的六条：
1. **接入 = 一条命令 + 浏览器登录**；验证方式是自然语言冒烟测试（"What is my credit balance?"）而非查配置
2. **少量动词工具，模型/预设当参数**（5 个工具扛 30+ 模型），选型指引写在 tool description 里让 agent 自己选
3. **submit → poll → URL，任务在服务端持久化**——agent 死了任务不丢，新会话 list jobs 找回
4. **balance + 价格预检作为工具**让 agent 在花钱前主动警告；**失败自动退款**兜底信任；但**没有确认闸**（预算约束推给用户的 harness 配）——这点 Nomi 的预算门反而是差异化优势
5. **聊天是控制面，workspace 是归档处**——所有产物落到 web Assets 并带 MCP 来源标签 + 回链；聊天从不当档案库
6. 他们的两大翻车点（引以为戒）：**OAuth 脆弱**（issue 第一大主题）、**能力目录滞后**（web 有的模型 MCP 没有，用户催更）

同行简况：fal.ai 的工具分类学最干净（discovery：`search_models`/`get_model_schema`/`get_pricing`/`recommend_model`；执行：sync `run_model` + async `submit_job`/`check_job`）；ElevenLabs 支持产物写本地文件；Replicate/Runway 的 MCP UX 层最薄。

---

## 3. 仓库现状：底座八成在，眼睛和手没接上

已建成（超预期）：13 个工具 + HMAC 客户端签名；持久 run 仓库（events.ndjson 事件流、CAS、预算台账）；`nomi_subscribe_run` 长轮询（25s）；spend 双路确认（GUI 开→SpendConfirmDialog 65s；GUI 关→elicitation 300s）；MCP Apps widget（`ui://nomi/live-draft.html`）；mcpVerify 真握手验证 + ConnectAssistantCard 徽章；readOnlyHint 已声明（mcpProtocol.ts:438）；Codex 超时已写入配置（mcpConfig.ts:158）；诚实进度原则（不造假百分比）。

关键缺口（本次研究确认）：
- **零 progress notifications**——最长最贵的调用（生成）全程静默，Claude Code 明明会渲染它
- **暂停/取消：状态机有、无任何 UI / 无 MCP 工具**（productionRunState.ts 定义了 pausing/paused/cancel_requested，没有入口）
- **工具结果文本硬编码中文**（违 R15；且是「模型转述」的原材料，质量=转述质量）
- runId 等关键 ID 只在文本里，结构化字段不全
- 任务事件只有长轮询拉取，**Nomi 在后台时无系统通知**（等审批/失败/完成全部无感）
- job 的 errorCode/errorMessage、submission outbox、lastPollAt 等后端有、UI 永远不显示
- 审批并发：bridge 层 pending 是 Map（rendererBridge.ts:33，无覆盖问题），**renderer 弹窗层是否单例覆盖待证**（blueprint 断言会覆盖）
- driver/编排仍是 stub；elicitation 只当 GUI 关闭时的备胎在用

---

## 4. 对 2026-08-10 blueprint 的判定

**对的（保留）**：Run Event Hub 单一真相源（其实已基本建成=run 仓库+事件流）；连接医生（「已配置≠已验证」、stale 检测修复）；诚实进度三原则；P0 先于富交互的次序感；验收清单大体成立。

**错的（重画）**：§03 体验主视图把「聊天端内嵌图片/视频首帧 + 富 run-card」当设计中心——**在 Claude Code/Codex 里这些全部不可见**（见 §1 硬事实）。「降级为文字」被当作 fallback 脚注，但对主力客户端而言**文字+对话就是本体**。双面板对拆（聊天卡片 ↔ Nomi 抽屉镜像同一状态）= 把一份状态手绘成两个界面，这就是「强行拆开」的根源——应当是**一份事件流，各端按真实能力原生渲染**。

---

## 5. 修正后的体验模型：「对话原生」

一句话：**把对话本身当界面设计。剧本 = 接住→汇报→请示→交付，每一幕落在真实可达的通道上。**

以「帮我生成一条 60 秒品牌宣传片」为例的完整旅程：

1. **接住**（信任建立）：工具结果结构化返回「接住了什么、将花什么、下一步是什么」→ 模型转述：「Nomi 已建草稿 run_7f32：16 镜头、预算上限 ¥99.74，尚未花钱。要我提交预算审批吗？」
2. **请示**（确认点）：**elicitation 表单为第一路径**（不再是备胎）——枚举字段「批准并开始 ¥99.74 / 先看分镜 / 取消」，在对话里原地完成；Nomi 窗口若在前台则弹 SpendConfirmDialog（两路互斥同源，决议写回同一事件流）。**确认只设在花钱和不可逆动作**；skills 是只读指导，加载**不确认、但在事件流留痕**（skill.loaded 可被转述、可在 Nomi 详情查证）。
3. **汇报**（过程可见）：生成期间发 **notifications/progress**（真实阶段文字：「镜头 3/16 · 供应商已受理 · 已用 01:42」）——Claude Code 行内实时显示且保活；同时事件流照旧供 `nomi_subscribe_run` 拉取。
4. **交付**（媒体回执）：结果 = 一句可转述的完成语 + **resource_link**（预览 URL）+ **nomi:// 深链**；用户点开 Nomi 看真像素。不在 CLI 里假装能显示图。
5. **可控**（暂停/调整/救火）：新增 **run 控制工具**（cancel/pause/resume/adjust，天然被对话驱动：「先停一下」→ agent 调用）；Nomi 状态面板补齐同款按钮；失败时结果带 errorCode + 恢复动作 + 诊断号，agent 能直接转述「怎么办」。
6. **兜底**（注意力）：Nomi 在后台时，等审批/失败/完成发**系统通知**，点击深链拉起对应 run。
7. **增强层**（不改变底座）：MCP Apps widget 只服务 Claude Desktop / Cursor 用户；未来客户端支持 Tasks 扩展后，长任务语义免费升级。

Nomi 窗口的定位从「镜像仪表盘」改为**媒体与控制室**：看像素、批预算、翻台账、救故障——不再复刻聊天里已有的信息层。

---

## 6. 三方案对比

| | A · 聊天=仪表盘（blueprint 现状） | **B · 对话原生（推荐）** | C · 一切赶去 Nomi |
|---|---|---|---|
| 用户看到 | 富卡片/内嵌媒体——**仅 Desktop/Cursor 可见**；主力 CLI 用户看到的仍是黑盒 | 模型转述 + 行内进度 + 原地表单确认 + 可点深链——**所有客户端都成立** | 每步被赶去切窗口，对话只剩「去 Nomi 看」 |
| 工程代价 | 高（双面板两套渲染 + widget 维护） | 中（结果文本工程 + progress 桥 + elicitation 提级 + 控制工具） | 低 |
| 风险 | 中心错位：主力场景无改善 | 转述质量依赖结果设计（可用 R16 真任务测试锁住） | 违背「在编程工具里舒服用」的初衷 |

---

## 7. 能力清单（修正 P0/P1/P2）

**P0 · 让对话活起来（全部有真实渲染通道背书）**
1. progress notifications 桥：事件流 → `notifications/progress`（真实阶段文字，兼保活）
2. elicitation 提级为确认第一路径（预算/不可逆），修审批并发疑点，写回同一事件流
3. 工具结果重写：结构化字段齐全（runId/projectId/costs/nextActions）+ 为转述而写的文案 + i18n（R15）
4. run 控制工具（cancel/pause/resume）+ Nomi 面板同款按钮（状态机已在，只缺入口）
5. 系统通知（后台时的等审批/失败/完成）+ 深链
6. 连接医生补全（stale 修复一键化——mcpVerify 已能检出 stale）

**P1 · 可靠与恢复**：submission_unknown 对账 UI 化；errorCode→恢复动作全链路；providerTaskId/幂等已建成的对外暴露；skills 证据规范化（单一真相字段）

**P2 · 增强**：MCP Apps 状态卡持续维护（Desktop/Cursor）；Tasks 扩展跟进；跨客户端任务历史；诊断包

---

## 7.5 确认点模型：五道门 + 信任档位（2026-08-11 用户提出「要给用户方案」后补）

**判断公式**：错向代价（这步定错，下游要重做多少钱/时间）× 确认成本（用户看懂并表态要几秒）。比值高才设门；其余自主跑，参数回显留痕、随时可纠。**门是给方案选（复数候选 + 兜底「我来描述」），不是让用户填空。**

| 门 | 状态 | 形式 | 载体 | 经济账 |
|---|---|---|---|---|
| 1 创意方向 | 新增 | 3 个一句话候选 + 兜底 | 文本 → elicitation 全客户端对话内 | 全片 ¥86 vs 读 3 行 |
| 2 剧本与分镜 | 新增 | 结构要点（开场/中段/收尾+关键口播），16 镜可展开 | 同上 | 16 镜全废 vs 读 5 行 |
| 3 预算合同 | **已建成** | 模型/供应商/上限/信任档位 | SpendConfirmDialog + elicitation 双路（现状机制） | 真金白银 vs 一张合同 |
| 4 样片 | 新增 | 先花小钱出定妆+首镜，看过再批量（effect-first） | 视觉 → 桌面端卡内看图；终端深链去 Nomi + 系统通知 | 15 镜风格全错 vs 看 1 图 1 段 |
| 5 粗剪 | 状态机已有 | awaiting_rough_cut_review 补呈现 | 视觉门同上 | 成片返工 vs 看一遍 |

**模型不单独设门**：对多数用户模型是手段不是目标（P4 通用第一），单独问=概念过载；它是预算合同里**可见可改**的一行（选项含「换个模型/供应商」），在乎的用户当场改。

**信任档位**（run 级，写进合同可查证）：关键确认（默认，五门全开）/ 只管钱（跳过创意与样片门，留预算+不可逆）/ 全程确认（每镜提交前都停）。对话说「别问了直接出」= 降到只管钱。

**范围豁免**：单张图/单段视频的 nomi_generate（非 playbook run）只走预算确认，不套五门——门的数量随任务范围 derive。

**机制统一（P1）**：五门全走同一套 gate 机制（状态机已有 gate.waiting/gate.decided 事件）+ 同一套双路呈现（elicitation ↔ Nomi 面板/弹窗），只是 gate kind 与载荷不同（文本方案/图样/合同）。不为创意门另造第二套确认系统。桌面富渲染（MCP Apps widget，已有基建）把同一 gate 数据渲染成真卡片：方向门=选项卡、样片门=卡内图+按钮——Higgsfield 演示的那层，我们对应物在此。

## 8. 附：本次未证实/待办

- Higgsfield 确切工具名单（OAuth 墙内，两家独立教程一致：`generate_image`/`generate_video`/`create_character`/`get_generation_status`/`list_characters`——报告值，非实测）
- claude.ai 内嵌媒体的具体机制（image block vs URL 预览）无文档
- 我方 renderer 弹窗层审批并发是否真覆盖——实现前先写并发测试证伪/证实
- Codex 对 progress notifications 的渲染行为未文档化——实现后真机验证（R13）
