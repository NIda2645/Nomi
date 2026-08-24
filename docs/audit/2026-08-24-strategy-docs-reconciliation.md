# 近期战略文档对账 Digest：已决 / 未决 / 冲突（2026-08-24）

> 归档说明：对 2026-08-19 至 2026-08-24 的 9 份调研/计划/审计文档做的考古对账（读物清单见文末）。合计：**已决 15 · 未决 14 · 冲突/滞后 10**。总体方案见 `docs/superpowers/plans/2026-08-24-unified-agent-master-plan.md`。

## 1. 已决事项（摘要）

**架构底座**：ProductionRun 唯一真相源 + ExecutionContract 冻结（✅ 落码）；MCP 第一切片 12 个语义工具冻结（✅）；P1-P3 单镜链 P4 前冻结、P4 不回退（✅ 14 断言 E2E）。

**创作 UX**：开场收敛 ≤3 问一轮问全（❌ 未落码，规划师仍逐个问）；编号镜头列表为分镜默认展示（✅）；分镜两步粗→细含首尾帧+运动（✅ storyboardPlan 已建模）；跨镜一致性抓手=参考图注入+VLM 审片重试闭环（⚠️ shotVerify 只挂手动画布路径，production run 路径未触发）；业界共性流程「圣经→锁参考→分镜→I2V→拼接→配音」（⚠️ I2V 未作默认路径）。

**对话与生成边界**：不自动化无确认闸、方向收敛+Block 档确认是护城河（✅ 会话级信任已落，❌ 未推广到 Notify 档）；客户端优先/Nomi 兜底/一次组合确认（✅ 双通道已建，置顶浮窗待实现）；preview 零 provider call（✅）。

**统一 agent / workflow pack**：通用底座+交互原语+垂直 Pack、不先做 Builder（❌ Agent 交互层未评审）；Agent 只许提案（✅ MCP 侧隔离，❌ GUI 内 agent 待设计）；Planner/Executor 分开、不引外部 runtime 当事实源（✅ 已声明）。

## 2. 未决事项（全列）

1. 首帧生成 prompt 防魔改角色；VLM 审图五维 vs 九维权重。
2. 镜间首尾帧续接最终机制（v1 已砍）；参考图库版本控制与状态跨镜传播 schema。
3. **配音/TTS 是否进第一条 Workflow Pack**（对照产品全含配音；Nomi 当前无音频生成能力）。
4. shotVerify rubric 与 evals judge 四维如何分层统一。
5. shotVerify 为何不在 production run 路径触发（P4 S5 需确认 materialize 时是否补审片）。
6. 模型降权（认不了脸）如何 code 化声明（S2 落）。
7. 主流客户端无 elicitation 下「不回 Nomi」承诺的实现细节（置顶浮窗可行性 spike）。
8. bootstrap 活动项目握手安全性（多项目并开时）。
9. 真实定价何时接入（全链 ¥0 占位）；provider 成本模型共通格式。
10. 耗时/价格「诚实标未知」的 UI 落地。
11. 统一 Agent 三界面上下文面板的实现形态；GUI 提案-确认链与 MCP elicitation 的序列关系。
12. 试拍入口实现细节（S3/S4 细化）。
13. 小说结构化拆解（scene/beat/character table）数据模型何时补。
14. 两计划并行语义（P4 已定 v1 排队，跨项目全局并发待定）。

## 3. 冲突/滞后对照（要点）

1. 「开场 ≤3 问」vs 规划师逐题追问（storyboardLauncher.ts:28-48）——设计有效、实现滞后。
2. 「定点改不弹确认」vs NodePromptOptimizer 改后需确认——权限档位设定问题，非工具过时。
3. ViMax ReferenceImageSelector（VLM 自动选参考图 ≤8 张）vs Nomi 无「镜级参考图选择」字段与 UI。
4. 业界 I2V 默认路径 vs Nomi 文本+参考图当参数喂；业界首尾帧续接 vs Nomi v1 刻意砍（工程权衡，需对用户诚实标注）。
5. ViMax best-of-k(k=2)+FilmWorld K≤3 轮闭环 vs Nomi 无采样策略、审片无定向重试注入。
6. 「Run 唯一 owner」vs legacy driver 与语义链共存期摩擦（S7 收敛前 dispatcher 隔离不够干净）。
7. 「客户端一次确认」审计决定 vs 现实 8/10 客户端无 elicitation → 浮窗是主线体验（分阶段交付，需对用户透明）。
8. 「不先做 Builder」vs Nomi 画布本身是节点画布——编排方向需澄清（受约束 graph vs 任意拖拽）。
9. P4 自称「成片」vs 实际无配音/无剪辑/无导出——命名歧义，建议表述为「多镜连续性+可编辑生产画布」。
10. 2026-08-22 统一运行时的工具曝光策略 vs 当前 tools/list 新旧同时广告。

## 读物清单

conversational-creation-ux（08-19）、script-to-video-frameworks（08-19）、short-drama-pipelines（08-19）、nomi-draft-capability-inventory（08-19）、nomi-unified-editor-runtime（08-22）、mcp-client-authorization-friction-audit（08-23）、video-agent-architecture-survey（08-24）、p4-multishot-continuity（08-24）、semantic-single-shot-p1-p3-handoff §10-11（08-24）。
