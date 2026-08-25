# Video Agent 通用架构调研与 Nomi 方案建议

> 归档说明：本文为用户 2026-08-24 提供的调研成果（会话中粘贴），当日归档进仓库作为 Video Agent 路线的参考基线。与 P4 计划的关系见 `docs/superpowers/plans/2026-08-24-p4-multishot-continuity.md` §10。外部产品/框架能力以文中官方链接为据，未在 Nomi 侧逐项复核。

- 日期：2026-08-24
- 状态：研究结论，尚未进入实现计划
- 研究问题：
  1. "小说导入 → 逐步生产 → 最终成片"的产品是否适合用通用 Video Agent 架构承载？
  2. Nomi 现有的创作区、生成画布、时间轴/预览能否成为通用交互层？
  3. 应该先做一个垂直工作流，还是先做一个完全通用的 Agent/Workflow 平台？
- 研究边界：只读调研；没有调用真实 provider，没有消耗生成额度，没有修改飞书文档。

## 1. 结论先说

思路在底层逻辑上是对的，但"通用"不能理解成"先做一个什么任务都能自动完成的万能 Agent"。

推荐方案：**通用执行底座 + 通用交互原语 + 垂直 Workflow Pack。**

- 通用底座负责项目上下文、实体记忆、能力目录、工具调用、权限/确认、可恢复 Run、幂等、资产和 Artifact。
- 通用交互原语负责对话、节点、候选、比较、预览、确认、写回、撤销、时间线和任务状态。
- 垂直 Workflow Pack 负责"小说到成片""广告到成片""口播到成片"等任务的步骤、默认顺序、检查点和用户语言。
- 第一条真正落地的 Workflow Pack 应该先做"小说/剧本 → 单集/镜头 → 成片"的窄闭环，用它证明底座和交互是否真的可复用。
- 不应该先做一个开放式 workflow builder，让用户自己搭任意 Agent 图。

| 方案 | 判断 |
|---|---|
| 只做一个专用小说产品 | 用户路径清楚，但底层容易再造一套状态和工具，未来扩展成本高 |
| 先做完全通用 Agent 平台 | 底层很漂亮，但用户不知道从哪里开始，且很难证明真实价值 |
| **通用底座 + 小说到成片 Workflow Pack** | **推荐**：用真实任务验证通用性，保留未来组合其它工作流的能力 |

关键取舍：**通用的是"怎么安全地组织、执行、检查和回滚创作"，不是把所有创作任务强行变成同一种流程。**

## 2. DramaClaw 的真实证据

来源：[DramaClaw 产品使用手册（飞书文档）](https://neo-flying.feishu.cn/docx/JGNTdsjJuo748TxJkxecoYs2nth)，读取版本 revision 88，2026-08-24。

### 2.1 并非单一"小说一键成片"

1. **主线流水线**：虾料（导入小说/剧本）→ 虾塘（角色/场景/道具/声线等可复用资产）→ 虾镜（剧集、脚本、Beat、镜头、音视频与合成）→ 合成（交付成片）。
2. **无限画布精修**（虾画）：自由组合文本/图片/视频/音频/360 全景/导演世界/技能节点；候选结果先留画布，不自动覆盖主线；用户明确"写回"并选择目标后才进入正式位置。
3. **AI 导演助理**（虾导）：查进度、查缺失资产、建议下一步、结合当前上下文工作。
4. **任务中心**（虾条）：排队/运行/成功/失败/取消/日志。

对应关系：

~~~text
DramaClaw 虾料/虾塘     ≈ Nomi 创作区 + 项目记忆/资产上下文
DramaClaw 虾镜           ≈ Nomi 生成计划 + 镜头/节点生产
DramaClaw 虾画           ≈ Nomi 生成画布
DramaClaw 虾导/虾条      ≈ Nomi Agent 助手 + ProductionRun 状态/恢复
DramaClaw 合成           ≈ Nomi 时间轴预览/导出
~~~

### 2.2 最重要的设计是"主线与自由创作的边界"

- 普通镜头走主线，复杂镜头进画布精修。
- 候选结果默认不覆盖正式项目。
- 写回前要明确目标槽位和影响范围。

用户价值不是"Agent 替我操作越多越好"，而是：不用自己管几十个工具和上下文；复杂工作仍可自由探索；探索不静默污染正式项目；始终知道什么是草稿、候选、正式资产和成片。

## 3. 商业产品调研

### 3.1 LTX Studio（[AI Movie Maker](https://ltx.io/studio/platform/ai-movie-maker)）

脚本→storyboard→场景/相机/角色→Elements 管理角色外观/风格/声音→shot 级编辑与 Retake→timeline。启示：需要**场景/镜头级可编辑中间结果**；角色/场景/风格是项目级上下文；Agent 提 storyboard、用户改单镜局部重做；时间轴是最后一层，Agent 不偷偷写入。

### 3.2 InVideo（[Script to Video](https://help.invideo.io/en/articles/9382180-how-can-i-create-a-video-using-my-script)、[Closed-Loop Pipeline](https://invideo.io/faq/what-is-a-closed-loop-ai-filmmaking-pipeline-and-how/)）

对话式 Agent 与 Autopilot/single-shot 并存；持久 Agent context 贯穿 script breakdown/asset locking/storyboard/shot/voice/music/edit review；先锁角色表/地点参考/风格帧再渲染镜头。启示：探索与一次执行是两种节奏；P1–P3 single-shot 正是"确定后执行"层；关键是**持久项目上下文 + 明确资产锁定 + 可回到同一 Run 修改**。

### 3.3 Runway Workflows（[官方文档](https://help.runwayml.com/hc/en-us/articles/45763528999699-Introduction-to-Workflows)）

节点+连线；Text/Image/Audio/Video 类型兼容约束；模板/分支/替换模型/批量编辑/锁定节点输出。启示：画布做"可视化执行面"合理；节点必须带输入输出类型、能力声明与副作用等级；"锁定"很重要——已认可结果不因重跑静默变化。

## 4. 开源框架调研

### 4.1 LangGraph（[Overview](https://docs.langchain.com/oss/python/langgraph/overview)、[Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)、[HITL](https://docs.langchain.com/oss/python/langchain/human-in-the-loop)）

graph execution/checkpoints/interrupt/time-travel/fault-tolerant resume/approve-edit-reject。结论：与 ProductionRun/receipt/outbox/reconcile 方向一致；**不建议把 ProductionRun 换成 LangGraph state**；未来只作"Agent graph → PlanCandidate/EditProposal"适配层。

### 4.2 AutoGen（[AgentChat](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/index.html)、[HITL](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/human-in-the-loop.html)、[State](https://microsoft.github.io/autogen/dev/user-guide/agentchat-user-guide/tutorial/state.html)）

借鉴 planner/reviewer/specialist 职责划分；不把多 Agent 对话记录当业务状态；第一版用可恢复 orchestrator + 明确角色，不默认 swarm。

### 4.3 OpenAI Agents SDK（[Agents](https://openai.github.io/openai-agents-python/agents/)）

借鉴 tool allowlist/handoff/guardrail；不把外部 SDK session/tool call 当 Nomi lease/receipt。

### 4.4 ComfyUI / React Flow / Remotion / OpenTimelineIO

[ComfyUI](https://docs.comfy.org/)（低层生成工作台）、[React Flow](https://reactflow.dev/)（UI 组件层非状态 owner）、[Remotion](https://remotion-dev.github.io/remotion/)（确定性合成，不当任意代码执行口）、[OpenTimelineIO](https://opentimelineio.readthedocs.io/en/latest/)（P5+ 时间线互操作）。

## 5. 研究论文的架构警告

### 5.1 不能把多镜头当 N 个独立单镜头

[EntityBench](https://arxiv.org/abs/2605.15199)（长距离跨镜实体一致性显著下降，显式 entity memory 有帮助）、[VideoMemory](https://arxiv.org/abs/2601.03655)（生成前检索实体、生成后更新记忆）、[InfinityStory](https://arxiv.org/abs/2603.03646)（背景一致性、多主体出入场、镜间转场是独立难题）。每个 shot 前后须维护：角色/道具/场景引用版本、使用的视觉锚点、状态变化、下一镜继承/拒绝什么、结果是否更新全局实体记忆。

### 5.2 Planner 和 Executor 必须分开

[TempAct](https://arxiv.org/abs/2606.28016)（planner/executor 反馈目标不同，混用致错误传播）、[TOC-Bench](https://arxiv.org/abs/2605.09904)（对象状态/遮挡再现/事件顺序）、[TC-Bench](https://arxiv.org/abs/2406.08656)（首末态组合变化评测）。支持既有冻结合同原则：

~~~text
Planner：理解意图、读取上下文、提出候选计划、指出风险
Reviewer：检查参考素材、脚本/镜头/结果、提出修正建议
Executor：只执行已冻结的 ExecutionContract
Human gate：花费、写回全局资产、写时间轴、导出前做最少但关键的确认
~~~

## 6. Nomi 应采用的 Video Agent 架构

### 6.1 不新增"万能 Agent 页面"

Agent 是跨三个现有界面的连续控制面：创作区（制片人/编剧助手，输出可编辑 Project/Story/Shot Plan）、生成画布（镜头导演/生成执行助手，输出 PlanCandidate/候选 Asset/EditProposal）、时间轴（审片/剪辑助手，输出 Apply/Undo/Artifact/Export）。不是三个 Agent、三份记忆——共享同一 ProjectMemory、Operation/Run 和 context snapshot，按界面投影不同下一步。

### 6.2 统一三种对象

1. **PlanCandidate**：未花费、可编辑（换模型/供应商/模式/参数/参考）。
2. **ExecutionContract**：确认后冻结（provider/model/variant/mode/parameters/references、contractHash、request fingerprint）。
3. **EditProposal**：结果如何进入 Canvas/Timeline/Asset 的建议；批准后 Apply、支持 Undo；Agent 不能直接写全局资产或时间轴。

### 6.3 Workflow/Skill 是受约束的声明，不是代码脚本

Workflow Pack 声明：目标与输入、可用工具与 module IDs、允许的步骤/分支/并行、所需 capability、每步输入输出类型、哪些步骤 propose/paid/project_write、何时人审、失败/重启/取消/unknown 的下一步、结果投影位置、版本与迁移。Skill 只描述方法与提示词，不拥有权限；Workflow 描述组合；Runtime/Run 负责真实执行。

## 7. 第一条垂直 Workflow Pack：小说/剧本到成片

~~~text
导入小说/剧本 → 识别章节/集/场景/角色/道具 → 用户确认/修正结构
  → 建立角色/场景/道具/风格实体记忆 → 生成一集 shot plan
  → 用户在列表/画布中编辑镜头 → 逐镜推荐真实可用 mode/model/variant/parameters
  → 生成草图/首帧候选 → 用户选择/锁定首帧 → 生成视频/音频候选
  → 质量检查（剧情/角色/场景/动作/音画/时长）→ 坏镜头局部重做
  → EditProposal → 用户批准写入时间轴 → 预览、导出 MP4
~~~

映射到 Nomi 通用对象：文本→Project/Story context；角色/场景/道具→Entity/Asset memory；镜头→Shot/PlanCandidate；生成→ExecutionContract+ProductionRun；质量→Check module+reviewer proposal；时间线→EditProposal+Apply/Undo；成片→Artifact/Export。

## 8. 为什么现在不能直接做"完全通用 Workflow Builder"

**用户侧**：不知道"我现在该做什么"；不同品类成功标准不同，通用图无法替用户定检查点；让用户学我们内部工程模型。
**工程侧**：任意 Agent 图易绕过 capability/预算/lease/receipt/Run owner；任意远程代码回到 P0 问题；多处存状态再造第二真相；"通用相机控制"类抽象易错误推广模型能力。
**产品侧**：没有第一条真实流程就无法判断哪些节点需要用户看见；先做平台推迟"更快得到可编辑初稿"；过早抽象导致 schema/UI/prompt/adapter 同时漂移。

## 9. 用户交互建议

### 9.1 用户只需要看到四类决定

目标（做哪一集/哪种成片）、计划（拆成哪些镜头、用哪些实体和模式）、关键差异（模型/variant/参考/成本/不支持项）、结果动作（预览/重做此镜/采纳到时间轴/撤销/导出）。内部思考、工具链、WAL、fencing、raw response 进"详情/日志"。

### 9.2 关键操作用"候选 + 一键确认"

先给 2–4 个候选说明差异；"生成"只发生在确认后；"重做此镜"只重跑该 Shot 新合同；"采纳到时间轴"显示目标轨道/覆盖范围/可撤销性；换模型直接更新同一 PlanCandidate 不重填表单；换参考图保留其它字段并重做能力/预算预检。

### 9.3 三个界面怎么连

| 位置 | Agent 表现 | 用户动作 | 不能做的事 |
|---|---|---|---|
| 创作区 | "把小说变成一集可编辑镜头计划" | 确认结构、改角色/场景/风格、进入镜头 | 直接花费、直接写时间轴 |
| 生成画布 | "这个镜头为什么不稳，给 3 个可执行方案" | 换参考、换模式/模型、锁定候选、重做单镜 | 绕过 Contract/Run 直接 provider |
| 时间轴/预览 | "哪些镜头未就绪，成片节奏哪里有问题" | 预览、采纳、撤销、导出 | Agent 静默改用户时间轴 |

## 10. 验证 Video Agent 是否真的通用（J1–J6）

- **J1 小说到一集可编辑初稿**：输入短小说；Agent 生成章节/镜头计划；用户改角色/场景/一个镜头描述；结果进画布；provider call 只在确认后。
- **J2 自由换模型/variant/mode/参考**：同镜切换两个真实 catalog model；换 variant；文生改图生/首尾帧（仅当声明支持）；替换/删除/重排参考图；context/参数约束/contract hash/runtime request 一致。
- **J3 失败或不满意**：只重做一个镜头；已锁定角色和首帧不重跑；给失败原因和唯一下一步。
- **J4 跨镜一致性**：角色在 1/4/8 镜再现；实体版本/参考素材/状态变化可追踪；评测一致性/事件顺序/镜间转场。
- **J5 写回和撤销**：画布候选写回角色/场景/Beat/时间轴；确认影响范围；Apply 后预览变化，Undo 恢复。
- **J6 断线/重启/未知结果**：provider 接受后崩溃；Run 恢复并 query；不出现第二次 submit；无 query 能力进 reconcile-only。

核心指标：目标到可编辑初稿的时间；点击/确认次数；换模型/参考后是否重填其它内容；preview provider calls=0；一个 Run submit=1；失败后唯一下一步；用户能否解释当前候选/锁定/写回影响；截图无重复卡片/隐藏状态/术语/无动作错误。

## 11. 最终建议

1. 保留 ProductionRun/ExecutionContract/Asset/Artifact 安全底座。
2. 加 Video Agent orchestrator，但 Agent 只能提出 PlanCandidate、CheckResult、EditProposal。
3. 第一条 Workflow Pack 选"小说/剧本 → 一集 → 可编辑镜头 → 时间轴成片"。
4. 创作区/生成画布/时间轴是同一个 Agent 的三个投影，不新增第四页。
5. 先验证 J1–J6，再决定是否开放自定义 Workflow/Skill。
6. 第二条不同类型 workflow 能复用同一底座/Run/Proposal/交互原语时，才宣布"通用架构已被证明"。

## 12. 决策点

1. 第一条 Workflow Pack 是否选"小说/剧本到一集成片"——推荐：选。
2. Agent 面板是否作为三界面上下文面板而非第四页——推荐：不新增第四页。
3. 是否开放自定义 Workflow Builder——推荐：暂缓。
4. 是否引入 LangGraph/AutoGen/OpenAI Agents SDK 等 orchestration runtime——推荐：暂不替换 Nomi Runtime，只借鉴 checkpoint/HITL/guardrail；如接入仅作 Agent graph adapter。

---

# 第二轮扩大调研：同类产品不止 DramaClaw

补充三类产品：端到端叙事生产平台、通用创意画布/工作流、Agent/工作流/渲染开源基础设施。以下"支持什么"以官方产品页/文档为依据；宣传页的质量/速度/商业效果属厂商自述。

## 13. 端到端叙事生产平台对比

| 产品 | 官方定位/入口 | 真实主线 | 用户能编辑什么 | 对 Nomi 的启示 |
|---|---|---|---|---|
| DramaClaw | [产品手册](https://neo-flying.feishu.cn/docx/JGNTdsjJuo748TxJkxecoYs2nth) | 文本→资产→脚本/Beat→镜头→合成 | 角色/场景/道具/声线/画布候选/写回目标 | 主线+自由画布+AI 助理是可复用结构 |
| LTX Studio | [AI Movie Maker](https://ltx.io/studio/platform/ai-movie-maker) | Script→Storyboard→Shot→Retake→Timeline | 场景/shot type/角色元素/prompt/声音/单镜重做 | 计划和实体记忆必须在视频生成前出现 |
| InVideo AI | [Script to Video](https://help.invideo.io/en/articles/9382180-how-can-i-create-a-video-using-my-script) | Script→对话式 Agent 或 Autopilot→视频 | 脚本/媒体/音乐/字幕/语言/后续修改 | 探索模式和一次执行模式都要有 |
| PopShort.AI | [官方页](https://popshort.ai/zh) | Idea/小说/剧本→AI Director→Story Bible/分集/资产/分镜→视频 | 生产资产/分集/模型/视频/Editing Agent | "故事资产先于视频生成"已是市场共识 |
| 文镜画师 | [官方页](https://wenjing.art/) | 剧本→角色/场景/分镜→图片/视频/配音/成片 | 影视画布/角色参考/多镜一致性/模型/项目资产 | 入口从内容任务开始，不是模型列表 |
| OranTV | [官方页](https://www.orantv.com/) | 项目→剧本→资产→分镜→成片 | 项目资产/分镜/整集创作/用量 | 国内普遍项目/资产/分镜/成片主线 |
| SmartFrame | [官方页](https://www.smartframe.com.cn/) | 剧本→智能分镜→多角色配音→一键成片→分发 | 剧本/分镜/角色声音/成片/海报 | 垂直流程快，但可能把步骤固化成黑盒 |
| Zeshot | [官方页](https://www.zeshot.com/) | 系列短剧→多集成片→多语言/分发 | 作品/集数/模型组合/克隆剧/分发 | 系列化是单镜走向多镜的真实方向 |
| Katalist | [官方页](https://www.katalist.ai/) | Script/Idea→自动场景/镜头→Story Canvas→Video | 脚本/场景/shot/角色 cast/故事画布 | 角色身份应是显式实体，不藏在 prompt 里 |

### 13.1 共同结构

~~~text
内容输入 → 结构化故事/脚本 → 角色/场景/道具/风格资产 → 镜头或 storyboard
  → 图片/视频/音频生成 → 局部修改 → 合成/时间线/导出
~~~

没有故事结构就不知道生成哪些镜头；没有资产跨镜一致性不稳；没有 storyboard 用户无法判断是否值得花钱；没有候选和局部重做只能整集返工；没有时间线交付层素材变不成成片。

### 13.2 三种产品取向

**工厂型**（PopShort/SmartFrame/OranTV/Zeshot）：入口直接，批量产出，风险是中间步骤黑盒化。**导演型**（LTX/DramaClaw/Katalist/文镜画师）：storyboard/cast/画布/镜头级修改，可中途审片。**模型工作流型**（Runway/Higgsfield/ComfyUI）：多模型组合实验，不替用户决定故事结构和交付。Nomi 应在工厂型和导演型之间：从内容目标开始，中间过程可编辑、可比较、可写回。

## 14. 通用创意画布和工作流产品

**Runway Workflows**（[文档](https://help.runwayml.com/hc/en-us/articles/45763528999699-Introduction-to-Workflows)）：可迁移——ModuleManifest 类型化输入输出、节点 locked/proposed/ready/failed 状态、Agent 生成受约束 graph proposal、批量编辑只暴露共同字段；不可照搬——credit/执行系统不是 ProductionRun。
**Higgsfield Canvas**（[AI Canvas](https://higgsfield.ai/canvas-intro)）：可迁移——画布展示"结果如何产生"、换模型/参考保留上游上下文并开新候选分支、组合由真实 catalog 驱动；不可照搬——"任何模型都能连"不是安全抽象。
**Google Flow**（[介绍](https://blog.google/innovation-and-ai/products/google-flow-veo-ai-filmmaking-tool/)、[帮助](https://support.google.com/flow/answer/16353334?hl=en)、[更新](https://blog.google/innovation-and-ai/models-and-research/google-labs/flow-updates-february-2026/)）：场景是比 prompt 更稳定的上下文容器；改一个主体不重生成无关内容；camera intent/subject motion/scene continuity 语义分开；不可照搬——围绕 Google 自有模型栈，camera controls 不是通用字段。
**Adobe Firefly Boards / Boords**（[教程](https://www.adobe.com/learn/firefly/web/create-commercial-storyboard-firefly-boards?src=helpx)、[Workspace](https://helpx.adobe.com/firefly/web/get-started/access-the-app/firefly-workspace-overview.html)、[Boords](https://boords.com/docs/creating-storyboards)）：storyboard 是创作讨论空间不是最终时间轴；视频生成可后置，先交付可讨论的 storyboard 或 editable first cut。

## 15. 中国市场产品的共同信号

（[OranTV](https://www.orantv.com/)、[SmartFrame](https://www.smartframe.com.cn/)、[PopShort.AI](https://popshort.ai/zh)、[文镜画师](https://wenjing.art/)、[Zeshot](https://www.zeshot.com/)、[知漫剧](https://www.zmj.net/)、[漫映 AI](https://www.m-ying.com/)）

公开页面反复出现：小说/剧本到成片、角色/场景/道具资产、自动拆分镜、多角色配音、一站式工作空间、系列化/批量化/多模型。市场需求不是"再做一个文生视频按钮"，而是：**用户希望把内容交给一个项目空间持续推进，过程中不丢角色/场景/镜头/成片上下文。** 公开资料很少说明：合同冻结、provider 接受后的未知处理、重启恢复与重复提交防护、写回影响范围、时间轴撤销语义——这正是 Nomi 的差异所在：可编辑、可解释、可恢复的生产控制面。

## 16. Agent 和工作流开源基础设施

| 项目 | 解决的问题 | 可借鉴机制 | 不应成为 Nomi 的 owner |
|---|---|---|---|
| LangGraph | 长流程/checkpoint/HITL/恢复 | pause-resume/time travel/checkpoint | Project/Run/Asset/Timeline 事实 |
| AutoGen | 多 Agent team/反馈/状态保存 | agent role/team feedback/save-load | provider budget/receipt/项目写回 |
| CrewAI | Flows/state/router/持久化/HITL | 事件驱动 workflow/条件分支 | 生产合同和资产 identity |
| OpenAI Agents SDK | tools/handoff/guardrails/sessions | allowlist/handoff/tool guardrail | provider-neutral 安全边界 |
| Temporal | crash-proof durable execution | 长时运行/自动恢复/人工等待 | 项目语义和用户可见对象 |
| n8n | 工具编排/工具级人工审批 | 工具调用前暂停 | 视频实体记忆/镜头语义/质量模型 |
| ComfyUI | 生成节点和推理工作流 | 可组合模型/可保存 graph | 叙事规划和生产交付 |
| React Flow | 节点编辑器 UI | 节点/边/选择/工具栏 | 业务状态 |
| Remotion | 参数化确定性渲染 | React preview/server render/MP4 | Agent 任意代码执行 |
| OpenTimelineIO | 时间线交换和编辑数据 | EDL/Timeline interchange | 当前 Timeline owner |

官方参考：[LangGraph Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)、[AutoGen HITL](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/human-in-the-loop.html)、[CrewAI Flows](https://docs.crewai.com/index)、[OpenAI Agents SDK](https://openai.github.io/openai-agents-python/agents/)、[Temporal](https://docs.temporal.io/)、[n8n HITL](https://github.com/n8n-io/n8n-docs/blob/main/docs/build/integrate-ai/ai-examples/human-in-the-loop-for-tools.md)、[ComfyUI](https://docs.comfy.org/)、[React Flow](https://reactflow.dev/)、[Remotion](https://remotion-dev.github.io/remotion/)、[OpenTimelineIO](https://opentimelineio.readthedocs.io/en/latest/)。

### 16.1 不要因为看到 Agent 框架就替换 Nomi Runtime

正确关系：

~~~text
外部 Agent/Graph → 读取 Nomi context → 产生 PlanCandidate / CheckResult / EditProposal
  → Nomi 主进程编译和校验 → ProductionRun 执行
~~~

错误关系：外部 Agent 直接调 provider / 直接写 Canvas / 直接写 Timeline / 自存第二份任务状态。

## 17. Nomi 的真正定位

不拼：接入模型数量、生成按钮数量、一键生成宣传语、单镜画质排名、暴露更多底层参数。应拼：

1. **Connected context**：故事/角色/场景/道具/镜头/素材/时间轴不丢上下文。
2. **Editable plan**：自由换模型/variant/mode/参数/参考素材。
3. **Capability-honest**：真实支持什么就显示什么。
4. **Recoverable production**：失败/断线/重启/unknown 都有可解释路径。
5. **Safe writeback**：候选不静默污染正式资产或时间轴，影响范围可知且可撤销。
6. **MCP + GUI 一个控制面**：从 MCP 开始也可在 Nomi 内确认修改，不重复确认不丢上下文。

## 18. 一个真实用户例子

用户在创作区输入："把这本悬疑小说先做成第一集 60 秒竖屏短剧，主角是林晚，保留雨夜车站和红色雨伞，先不要生成视频，给我看制作方案。"

Nomi 展示可编辑计划（目标/预估镜头 8 个/主要角色 林晚/核心场景 雨夜车站/关键道具 红色雨伞/建议风格/需要确认项/当前 provider calls：0）。用户可直接：换参考图、8 镜改 6 镜、文生改图生、换 variant、换道具素材、改镜头时长、只生成首帧。每次修改重算：模式支持性、variant 参数、参考约束、预算与请求数、全局资产影响。确认后才编译 ExecutionContract 进 ProductionRun。用户感受是"我在导演一个项目"，不是"我在填供应商 API 表单"。

## 19. 真实 UI 自由度才是通用性的验收

不能用固定 fixture 证明通用。至少覆盖 J1–J6（小说到一集/模型模式参数替换/参考素材替换/只重做坏镜头/写回和撤销/异常和恢复——详见 §10）。

## 20. 修订后的路线

应该：保留 P1–P3 底座；加只许提案的 Video Agent orchestrator；先做"小说/剧本→一集→可编辑镜头→时间轴"Pack；Agent 作三界面上下文面板；用真实 UI 变更矩阵验证；第二条 workflow 复用验证后再考虑开放自定义 Builder。
不应该：先做任意图形 Workflow Builder；先引入多 Agent swarm；把 LangGraph/AutoGen/CrewAI 当业务事实源；把 Seedance 模式参数抽成共有字段；让 Agent 直接调 provider 或写 Timeline；因宣传"一键成片"跳过中间计划和可撤销边界。

## 21. 后续决策点

1. 第一条 Workflow Pack 是否正式选"小说/剧本到一集成片"——推荐：选。
2. Agent 是否作为创作区/生成画布/时间轴三界面的上下文面板——推荐：不新增第四页。
3. 是否现在开放用户自定义 Workflow Builder——推荐：暂缓。
4. 是否引入外部 orchestration runtime——推荐：暂不替换；只借鉴机制，未来仅接 Agent graph adapter。

核心验收：**用户可以带着真实变化，把故事从文本推进到可编辑初稿，再推进到可撤销的时间轴成片；过程中不丢上下文、不重复扣费、不被模型参数差异欺骗。**
