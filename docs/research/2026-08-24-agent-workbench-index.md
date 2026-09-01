# 2026-08-24 Agent 视频工作台竞品研究 — 索引 + 结论 + 现状对账

日期：2026-08-24（研究）／2026-09-01（本索引 + 策展）
用途：这份研究原本是一个 525 文件、约 21MB 的证据倾倒（PR #268）。按裁决**不整包进仓库**：留下不可再生的一手文本，删掉可再抓/可重解包的媒体副产物，用本索引把「讲了什么 · 核心结论 · 今天还有效吗 · 原件在哪」讲清楚。

## 证据溯源（回捞用）

- **删除前的完整研究包**（含全部截图、DOCX 内嵌媒体、页面渲染图、机器可读 JSON）：目录 `outputs/research-20260824-agent-workbench/`，位于提交 **`ba838b77da07ce7d6a59534efb296cea0344a2c3`**（内容首次落盘于 `e6f18ca8`，即 PR #268 的原始单提交）。
- 回捞任意原始文件：`git show ba838b77:outputs/research-20260824-agent-workbench/<原路径> > /tmp/x`。
- **留存的一手文本**：`docs/research/2026-08-24-agent-workbench/`（4 份竞品手册全文提取 + 14 份竞品页面 DOM 文本）。目录内 `README.md` 有页面↔原始截图路径映射。
- **主报告（综述 + 对账矩阵 + 落地任务）**：[2026-08-24-agent-workbench-comparison.md](./2026-08-24-agent-workbench-comparison.md)。

## 研究对象

用户提供的 4 份竞品手册 DOCX + 11 个竞品网页/飞书链接，覆盖四家「为 Agent 设计的 AI 视频工作台」：**LibTV**（LiblibAI，含画布 / Skill / CLI 三条线）、**MiniMax Design**（Agent + 商用 + 本地部署）、**小云雀 / XYQ**（剪映系，短剧 Agent + 自由画布 + 运镜库）、**TapNow**（Brainstorm 先立剧本/角色/世界观再交生成）。方法：只记「页面上实际看见的事实」，不把营销页当已验证运行能力，不绕权限/不登录绕过。

## 逐组：讲了什么 · 核心结论 · 今天还有效吗

| 组 | 讲了什么 | 核心结论（1–2 句） | 今天还有效吗（2026-09-01 现状核对） | 留存路径 |
|---|---|---|---|---|
| **主报告：综述 + 逐功能对账矩阵**（§2–§4） | 把四家竞品的 19 项能力（统一入口、对话+主工作面、计划先行/确认门、画布节点、引用、脚本→资产→分镜、批量/局部重跑、播放、深编、导演运镜、音频、任务中断、失败恢复、资产中心、免费商用素材、Skill/插件、CLI/MCP、可观察性）逐条对到 Nomi 当时代码事实上 | **别把 Nomi 三页揉成一个大杂烩页**；保留一个项目壳，把「想法与脚本 / 编排与生成 / 成片与深编」做成同一项目事实源的三个可切焦点，切焦点不丢项目/资产/引用/运行状态/对话；Agent 不直接写时间轴，而是出可审阅的 `EditProposal`（改哪段、成本、影响、可撤销） | **✅ 仍有效、仍是开放方向。** `src/workbench/WorkbenchShell.tsx` 至今仍按 creation/generation/preview 三个独立 workspace 挂载；`docs/ARCHITECTURE-NOW.md`（预览区 Agent 一行，`WorkbenchShell.tsx:292`）明确「预览区没有 Agent，要接**共同宿主**不是移 JSX」——正是本报告 P0 差距，尚未实现 | 主报告 §3 对账矩阵、§4 信息架构 |
| **§5 免费商用素材接入策略** | Pexels/Pixabay/Unsplash/Coverr/Mixkit/Videvo/Kaboompics/iconfont/Bensound/FreePD 逐站授权判定（green/amber/red）+ 每条素材需留存的证据字段 | 不做「免费=无条件商用」；做 source adapter + license snapshot，导出时生成 `asset-license-report.json` | **✅ 仍有效、仍未落地。** Nomi 至今无素材搜索/授权快照/商用风险标签（P1 缺口）。注意：站点条款会变，真接入前需**重抓当次许可页**，本表是 2026-08-24 快照，别当长期 SLA | 主报告 §5 |
| **§6 第一批真实用户任务** | 5 条端到端任务（15s 产品广告 / 已有素材重剪 / 失败恢复 / 中断恢复 / 商用素材交付），既是路线也是验收 | 每项都要用真实页面截图 + 用户所见证据验收，尤其查：播放器是否真有源、取消后是否留半截假完成、时间轴与画布是否同版本、Agent 是否指明修改范围 | **✅ 仍有效，与 R16「真实任务测试系统」同构。** 可直接作为 Agent 工作台的验收任务底稿 | 主报告 §6 |
| **LibTV 手册全文**（画布 / Skill / CLI） | 五大基础节点、脚本→风格/角色/场景/道具提取、批量组/片段重拍/智能续写、Director Stage（3D 场景+摄像机路径+Blender 插件）、音频截取/人声背景分离/音色克隆、CLI「把项目状态当事实源、浏览器登录不要 Access Key、返回可继续编辑的画布而非孤立视频链接」 | LibTV 是「同时给人和 Agent 两个入口」最完整的近邻；其 CLI 把「项目/画布/节点/素材/模型/状态查询」暴露成 Agent 工具的做法，是 Nomi MCP/外部 Agent 方向最直接的对标 | **✅ 一手参考仍有效**（不可再生：原始 DOCX 来自本地 `~/Downloads`/微信临时目录，已不存在）。但**运镜/3D 导演台**另有更新研究（见下「已被取代」栏） | `2026-08-24-agent-workbench/docx/LibTV*.md` |
| **MiniMax Design 手册全文** | Agent + Canvas Flow + Skill 广场 + Local Index + Output Sync 连续链路；资产中心存角色/场景/风格/道具/过程；剪辑 Agent 改片段/字幕/转场/画面效果并导出继续编辑 | 「连续链路 + 资产中心本地化 + 剪辑 Agent 出提案」印证主报告的统一壳方向 | **✅ 一手参考仍有效**（不可再生，同上） | `2026-08-24-agent-workbench/docx/MiniMax_Design_-.md` |
| **竞品页面 DOM 文本快照**（14 份，LibTV/MiniMax/小云雀/TapNow 首页·画布·手册） | 抓取当时各产品页面的可见 DOM 文本 | 定点快照，用于核对报告论断的原始出处 | **⚠️ 作为「2026-08-24 定点快照」有效；不代表页面现状**——这些产品持续改版，引用时标注日期，需现状时重抓 | `2026-08-24-agent-workbench/web/*` |

## 已被后续演化取代 / 需改读新文档的部分

本报告 §3 里凡涉及 **Agent 运行时 / harness / 会话取消 / 任务编排** 的「Nomi 当前事实」列（如引用 `workbenchAgentRunner` 的 session cancel），**已过时**：Nomi 的 Agent 架构自 PR #223 起改为 Host/Thread/Turn/Item + Pi runtime + 12 语义工具 + 单确认信道。运行时/harness 现状与计划以这三份为准，别再用本报告的运行时描述：

- `docs/research/2026-09-01-agent-architecture-solution-and-execution-plan.md`（根因→谁负责→在哪修→旧路径怎么删；本报告的产品对象定义在此收敛）
- `docs/research/2026-09-01-agent-architecture-root-cause-synthesis.md`
- `docs/research/2026-08-24-agent-harness-survey.md`（Thread→Turn→Item、事件溯源、单审批、压缩、Skill 渐进披露）

本报告 §3「导演/运镜」行的 LibTV Director Stage / 小云雀运镜库对标，另有更深的一手研究，做 3D 导演台时改读：

- `docs/research/2026-08-02-3d-director-stage-full-journey-research-and-redesign.md`
- `docs/research/2026-07-26-3d-director-stage-research-and-design.md`

**未被取代**：本报告的产品级 IA 结论（三焦点统一壳）、EditProposal 交互合同、免费素材授权策略、5 条真实任务——这些是产品/交互层，09-01 的架构计划并未重derive，仍以本报告为准。

## 同批姊妹研究（2026-08-24，同一轮 Agent 调研的其它切面）

- `docs/research/2026-08-24-agent-product-interaction-survey.md` — Agent 产品交互面
- `docs/research/2026-08-24-agent-conversation-vocabulary-survey.md` — 对话词表
- `docs/research/2026-08-24-video-agent-architecture-survey.md` — 视频 Agent 架构
- `docs/research/2026-08-24-agent-harness-survey.md` — harness（见上，运行时权威源之一）
