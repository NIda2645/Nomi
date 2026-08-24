# P4 多镜头连续性（Semantic Multi-Shot）实施计划 · Rev.2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 状态：**已过 6 角色评审（2026-08-24，CTO/设计/PM/前端/后端/真实用户各 8 条，全部带 file:line 核实），Rev.2 整合全部有效意见；§6 三个取舍已于 2026-08-24 由用户拍板（T1/T2/T3 均选推荐档，样张三态演示已获批），可开工。**

**Goal:** 把 P1–P3 语义单镜链升级为「一段脚本/分镜 → 可编辑多镜计划（N 镜 + 身份锚）→ 一次确认 → 锚定妆照检查点 → 同一 ProductionRun 下 N 个 Job 耐久生成 → 跨镜身份一致 → 逐镜落画布、连片可播」的自动挡闭环；急停/试拍/单镜返工/崩溃恢复/花费上限全程有界。

**Architecture:** StoryboardPlan（锚+镜头）当骨架、模型能力档案当边界；`Run.generationPlan` 扩为多镜形态（同容器加 `shots[]`，不建第二容器）；一次 receipt 批整个 operation（operationId=runId，per-operation 即 per-run）；执行是主进程**无自有状态**的派生调度循环；产物落画布是 best-effort + 打开项目时幂等补齐。**v1 明确裁剪**：整计划单 provider（镜级仍可换该 provider 下的模型/模式）；**砍掉镜间首尾帧续接**（与封存模型硬冲突且抽帧管线未建，代码注释两处实证：`storyboardPlan.ts:100-108` 及尾部 B-clean 注）；一致性由「锚参考 + DNA 提示词」承担。

---

## 0. 用户任务（验收之尺）

雨夜便利店样例：200 字故事、两角色、7 镜、约 40 秒。

| 任务 | 走通标准 |
|---|---|
| **J1 一稿到片** | 脚本→多镜计划→自由编辑→预览零花费（逐镜单价+总价+预计耗时）→确认一次→**锚定妆照停一拍、点头才开拍**→7 镜生成（急停可用）→逐镜落画布编组→连片可播（完成态明示「无配音，可在时间轴加配音」） |
| **J2 单镜返工** | 只对第 5 镜重生成→同 Run 新 Job（parentJobId 谱系）→新镜仍同脸→其余不动、只花一镜的钱→新旧版本可切 |
| **J3 事故恢复** | 生成到第 4 镜崩溃/断网/关 MCP 客户端→重启后同 Run 恢复：每 Job ≤1 次 submit；已完成不重提、进行中核账、未开始继续 |
| **J1b 变体** | 用项目已有锚开新计划（跨集同脸）；锚不满意→只重锚不动镜头；超预算批次→停在正确的第 K 镜并可提额续拍 |

## 1. 不动项（碰了就是回归）

- ProductionRun 单一事实源；**调度器无自有持久状态**：主进程循环，每拍在 Run 锁内从 `jobs[]+ledger` 纯派生「下一批可派发集合」，崩溃恢复=同一派生函数重算；receipt 消费后批次推进**不依赖 MCP 客户端存活**。
- **Job 从封存合同派生，绝不依赖画布 bindings**（legacy plan.attach 的画布耦合不进语义链；画布落节点失败不影响生成）。
- P1–P3 单镜链不回退，其 E2E（14 断言）是**每个 slice 的回归门**；seal 前自由编辑、seal 后改=新草稿、receipt 一次性、preview provider call=0、提交未知 reconcile-only。
- 能力/价格从档案与 catalog derive；确认 UI 复用唯一 `useSpendConfirmStore` 漏斗；确认卡是**只读决策面**（编辑的家只有计划编辑，卡上只给「返回修改」）。
- legacy 旧链不复活；渲染层画布 store 不做任何提交状态的真相源（锚检查点事实写进 Run 的 gate/事件）。

## 2. 家底核实（Rev.2 按评审校正：「真复用」与「记在复用名下的新机器」分开）

**真·现成可复用**（file:line 已核）：
- 分镜 IR 含逐镜 `modelKey/modeId/params`（`storyboardPlan.ts:20-131`）；character_ref 有序边（`generationCanvasTypes.ts:203-222`）。
- Run 1:N Job + `parentJobId` 重试谱系（`productionRunTypes.ts:162-165`，注释原文「重试是新 Job、原结果可查」）→ **返工=同 Run 新 Job 的直接依据**。
- Run 层 pause/cancel 已有（`productionRunTypes.ts:60-96`，`nomi_control_run`）→ 急停的机制底座。
- 预算账本结构（`budgetLedger.ts:23-85`：authorized=上限、reserve 超额即抛）；事件=全量 Run 快照（`productionRunRepository.ts:446`）→ 扩 shots[] 无需逐事件迁移。
- 幂等建节点通道（materializationOperationId 防崩溃重复落，`capabilityApplyHandler.ts:396-422`）；整批事务样板 `proposalTxn.ts:63-77`；建组 API `canvasGraphActions.ts:378/400`；result+history 数据层（`canvasRunActions.ts:140-184`，含 rollbackHistory）。
- 确认队列 FIFO 与 contract 可选槽（`spendConfirm.ts:55-61`）；`ProductionContractView.specs.shotCount` 已有。
- receipt 覆盖整 operation：operationId=runId（`productionRunRepository.ts:303`），gate_decide 升级 lease + 一次性 consumeReceipt（`generationDispatcher.ts:447-475`）。

**新机器（评审确认今天不存在，按新做排量）**：
1. **多镜 schema+寻址**：`ProductionGenerationPlan` 单 candidate/contract（`productionRunTypes.ts:175-185`）→ 加 `shots[]`；reducer patch/seal/approve 的 shot 寻址变体；submission 门面五入口（start/poll/materialize/resume/newAttempt）从单 hash 寻址参数化为按 shot 取子合同（`productionGenerationSubmission.ts:157-167,328,403,439,493,539`）。
2. **真实定价接入**：语义链现全程 ¥0 占位（`mcpGenerationTools.ts:593`、`productionGenerationSubmission.ts:293,302-307,389`）；authorize 不读账本累计（`approvalPolicy.ts:95-101`）。
3. **耐久调度器**：P1–P3 是客户端逐步驱动（无后台执行器）；批次编排是新组件（约束见 §1）。
4. **画布落地四件套**：物化通道今天只会幂等建节点——无 txn（今天=18 个撤销步）、无编组、无逐镜 result 回填 op（今天唯二写 result 的入口在将收敛的 legacy 路径）、rollbackHistory 无 UI 调用者。
5. **确认卡三层扩展**：语义链确认走扁平 `generation.gate.confirm` payload（`capabilityApplyHandler.ts:182-205`），不带 contract；逐镜清单需 `mcpProtocol.ts:41-45` → appIntegration → spendConfirm 三层扩 payload（contract 卡今天只属 legacy driver 门，`useProductionStatus.ts:216-241`）。

## 3. 设计（Rev.2）

### 3.1 计划形态
- create 双入口：`scriptText`（现成 storyboard planner 拟稿）或 client 给 `plan`；**项目已有同名角色锚默认复用素材**（跨集同脸），编辑器有「从项目素材选锚」显式入口。
- patch 可改：镜级 model/mode/params/prompt/时长/参考、锚描述与素材、镜增删排序、**镜级 included 勾选**（试拍/分批的原语：合同只覆盖勾选镜；同一 plan 二批复用锚与 Run，已完成镜不重算不重扣）。
- **shotId 进入子合同并参与哈希**；jobId/幂等键派生显式含 shotId（防两镜同参数撞键，后端 #5/#3：commandId 照 outbox 样式编入 jobId）。
- preview：逐镜有效参数+单价+预计耗时（估不出=诚实「未知」）、锚开销单列、总价合计、能力降级以**结构化 code+参数**下发（渲染层 `t()` 翻译，防拼串穿透 i18n 门）。
- seal：冻结计划级合同（锚合同+勾选镜子合同+计划 hash）；**seal 时前置校验硬上限 ≥ 预估上界**，不足当场明示「最多只能完成前 N 镜」或拒封。

### 3.2 一致性与锚检查点
- 两层一致性：锚资产先行（每镜 references 自动带锚，role=character_ref 保序）+ staticFeatures 进提示词；无参考图通道的模型对含角色镜**默认降权排序**，选它需显式确认，文案人话（「该模型认不了脸，换脸风险高」）+ 一键换模型。
- **锚亮相检查点**：锚 Job 完成→批次停一拍→用户过目**全部锚**（新生成的定妆照 + 从项目素材复用的形象/场景，复用的也要亮出来——2026-08-24 用户拍板原话「要先出这些被复用的资产，停一下确认之后往下走」）→「开拍 N 镜 / 重新生成形象」。免费、不需要新 receipt（receipt 管钱、这一拍管质量）；检查点事实写 Run gate/事件（不依赖渲染层 store）；锚不满意只重锚。
- 镜间首尾帧续接：**v1 不做**（见 Architecture；未来做时需「派生参考槽」显式建模——指纹盖规则不盖字节——单独成片）。

### 3.3 执行、预算与急停
- 调度：锚 Job → 检查点 → 勾选镜 Jobs。「并发 2」=并发等 provider，**写 Run 单写者串行**（Run 锁 acquire 失败即抛无排队、poll 无锁 CAS 会撞——后端 #4；不得一把锁横跨 N 镜不续租，租约 30s）。
- 预算：receipt 消费时记计划级 authorize=硬上限；逐镜 reserve=单镜上限，**halt 判定在 Run 锁内 reserve 时校验累计**（防并发双 reserve 超支）；触顶→typed `BudgetExhaustedError`→halt 状态+「已完成 N/剩余 M」明示+一键提额续拍剩余。
- **急停**：批次进度卡/画布组头「停止剩余镜头」→ 未提交=不提交不扣费、进行中=按 provider cancel 能力诚实处理、已完成保留。复用 Run pause/cancel。
- 批准/attempt 记账降到 shot 粒度：一镜 new_attempt 不得清计划级 receipt 批准、不得连坐其他在飞镜头；attempt 单调性限定同镜谱系（后端 #6）。
- 失败镜费用诚实标注：供应商不收失败费=标「未扣费」，不明=标「以供应商账单为准」，不承诺退款。
- 两计划并行 v1 语义：同项目同时一个批次，第二个排队并明示。
- 锚（图像）+镜（视频）混 Run：门面收 provider 注册表按 job.provider 解析；operation create 时 policy 写入锚+镜的 provider/model 并集；补图像候选来源；每 Job 单产出（锚多变体=多 Job）。

### 3.4 画布落地（best-effort + 补齐）
- 确认后**尽力**落占位节点+组（项目正打开时）；不可达不失败——**打开项目时按 materializationOperationId 幂等补落**（节点与组都打章，防恢复重复建组）。
- 新 capability op `production.attach-shot-result`（nodeId+result → addNodeResult）+ 项目打开时按 `run.jobs[].nodeId × artifacts` reconcile 补漏；**运行时断言 result.url 必须 nomi-local://**（providerUrl 另存；R17：grep 棘轮抓不住这类，走运行时断言臂）。
- 物化通道加 txn 包裹（含恢复那一臂）+ 建组 → 整批一个撤销步（样板 proposalTxn）。
- 占位节点三态可区分：排队中(n/7)→生成中→**已停(预算/急停,warning 非 danger)**，不许「永远等待生成」假进度；进度通知用稳定 id 原位更新「已完成 3/7」，不堆 toast。
- 整批撤销 × 在飞 Job：撤销≠急停（急停是显式按钮）；撤销后产物仍进素材库+Run，回填静默跳过并在任务中心明示「画布节点已移除」；恢复补落不复活用户刚撤掉的节点（以撤销事实为准）。
- 失败镜复用 NodeErrorReport 视觉语言；**其重试钮一律路由到 §3.5 返工链**（带锚参考与单镜确认，一功能一个家）。

### 3.5 返工/插镜/版本
- 返工=**同 Run 新 Job**（parentJobId 谱系）+ 该镜子合同修订 + 镜级 gate/receipt（单镜价）；插镜同机制（新镜上下文继承锚）。
- result/history 数据层现成；J2 配最小切版本 UI（节点历史条接现成 rollbackHistory）。

### 3.6 开关与 legacy
- `NOMI_MCP_GENERATION_MULTISHOT_V1=1`，仅在 `SINGLE_SHOT_V1=1`+`E1_V1=1` 之上生效，默认关。
- legacy 批量路径收敛**独立成片 S7**（自带回归证据与回滚，不与返工/付费验收捆绑）。

### 3.7 卡片与文案原则
- 术语人话表（验收项）：锚→「主角形象/场景参考」、采纳→「放进画布」；「封存/物化/合同」不上卡。
- 卡上必有：逐镜明细（内部有界滚动 ~40vh）、费用合计+硬上限+确认钮**固定 footer 不滚出**（NodeErrorReport 2026-07-31 同款教训）、预计耗时、承诺句「个别镜头不满意，单镜重拍只花该镜费用」、倒计时**交互即暂停**且时长随镜数伸缩。
- 状态色用根层 token（`--nomi-danger/-warning` + 补根层成功色）；**存量 bug**：`--workbench-success` 只在 `.workbench-shell` 作用域，卡从库页弹出勾勾失色（已另立修复任务，不塞本计划）。

### 3.8 确认发生在哪（2026-08-24 用户追加拍板：任何客户端都不许要求用户「回到 Nomi」）

- **elicitation 优先**（继承 P1–P3 双通道）：客户端声明 elicitation → 批次确认/试拍/返工/锚检查点点头全部弹在客户端内；锚定妆照与复用素材以 MCP 工具结果图片回传进对话（客户端渲染图），随后 elicitation 表单收「开拍 / 重出形象」。
- **现状矩阵**（2026-08-24 查证）：Claude Code CLI ≥2.1.76（2026-03-14）支持；Claude 桌面 App 不支持（claude-code#41110）；Codex 在途且有自动拒的已知 bug（codex#11816）；国产桌面客户端普遍不支持。**桌面端主流现实=无 elicitation，所以兜底卡是主线体验，必须做好。**
- **兜底卡升级为系统级置顶小浮窗**：独立 alwaysOnTop 小窗承载**同一张**确认卡（复用 SpendConfirmDialog 组件与唯一 spendConfirm 漏斗，P1 不造并行卡），浮在用户当前软件上层，点一下即走；Nomi 主窗口无需在前台/无需打开对应项目页；App 在后台或最小化时配系统通知唤起。定妆照检查点同走浮窗（可看图）。
- 授权面不变：只认客户端原生 elicitation 或 Nomi 自有表面；模型转述「用户已确认」永远不算（防 prompt injection，交接报告 §5 铁律）。

## 4. 失败 / 撤销 / 重启语义

| 时刻 | 行为 |
|---|---|
| seal 前编辑 | 自由，零花费 |
| seal 时上限 < 预估 | 当场明示「最多完成前 N 镜」/拒封，不留中途惊吓 |
| 确认卡忽略/超时 | 不提交不扣费草稿保留（倒计时交互即暂停） |
| 锚定妆照不满意 | 只重锚不动镜头（免费拍板，重锚花锚的钱） |
| **用户急停** | 未提交=不扣费；进行中=诚实 cancel/收尾；已完成保留 |
| 某镜 provider 拒绝 | 该 Job failed+人话原因；费用按供应商实情标注；不自动重试 |
| 某镜提交后失证 | 该 Job reconcile-only；second submit=0 |
| 触顶 | typed halt+已完成 N/剩余 M+一键提额续拍 |
| 整批撤销（画布） | ≠急停；产物保留于素材库+Run；回填跳过并明示 |
| 崩溃/断网/关客户端 | 同 Run 恢复；每 Job ≤1 次 submit |

## 5. 验收门

1. E2E（loopback 零额度）：J1（含锚检查点+急停路径）/J2（返工+版本切换）/J3 + 变体：**构造超顶批次停在正确第 K 镜**、**两镜同参数不撞键**、**锚不满意只重锚**、**用已有锚开新计划**、断开 MCP 客户端后批次继续。不变量：**每 Job ≤1 次 submit；总请求数=封存计划枚举（锚数+镜数）**（不是「≤镜数」——锚也是请求）。
2. 每 slice 以 P1–P3 单镜 E2E 为回归门。
3. R13 走查截图亲读：多镜卡（含固定 footer 可见性）/锚检查点/三态占位/编组一步撤销/halt 卡片/时间轴连片。
4. APIMart 低规格真付费验收一次（2-3 镜，报花销）。
5. `pnpm run gates` 全绿；样张逐项对账；术语人话验收（卡上无内部词）；降级/halt 文案为结构化 code 经 `t()`。

## 6. 拍板记录（2026-08-24 用户确认，样张三态演示已获批）

**T1 确认与检查点节奏 → A**：一张卡确认全批 + 锚亮相停一拍。用户原话「要先出这些被复用的资产，停一下确认之后往下走」——检查点展示全部锚（新生成+复用），点头才开拍；可配超时自动放行。
**T2 画布落地 → A**：确认即 best-effort 落占位 + 打开项目时幂等补齐，整批一步可撤；确认卡写明「生成并放入画布分镜组」。
**T3 试拍入口 → A**：确认卡 footer「先试拍第 1 镜（¥x）」快捷（内部=勾选集缩到 1 镜重封存，非卡内编辑）。
**v1 裁剪（随拍板生效）**：整计划单 provider（付费通路现实=APIMart）；无镜间续接；插镜进 S6；并行批次同项目排队。

## 7. 实施切片

- S1 多镜 schema+寻址：generationPlan.shots[]、reducer shot 寻址、submission 门面参数化、commandId/jobId/幂等键含 shotId、shot 粒度批准与 attempt、老 Run 快照可读；回归门=单镜 E2E。
- S2 定价+preview/seal：逐镜真实单价从 catalog derive→approval/reserve、seal 前置校验、耗时估计、降级 code 化、镜级 included。
- S3 确认链路：gate payload 三层扩展（contract 化）+ 卡逐镜清单/固定 footer/倒计时伸缩暂停/人话文案；**样张先行已拍板后实现**。
- S4 调度器+预算+急停：派生循环（无自有状态）、单写者、锁内累计校验、typed halt+续拍、锚检查点 gate、Run pause/cancel 接 UX。
- S5 画布落地：txn+编组+组幂等章、attach-shot-result op+运行时断言+打开时 reconcile、三态占位、稳定 id 进度；J1/J3 E2E。
- S6 返工/插镜/版本 UI + J2 E2E + APIMart 真付费验收。
- S7 legacy 批量路径收敛（独立回归+独立回滚）。

## 8. 回滚

开关默认关；每 slice 独立 PR 可回滚；S7 前 legacy 未动，关 `MULTISHOT_V1` 即回 P1–P3 现状。

## 9. 诚实边界

- 一致性「大幅提升非绝对保证」的**产品落点**：卡上承诺句（单镜返工只花该镜）、降权+显式确认（认不了脸的模型）、J2 一键返工。
- 无配音/口型/音乐；完成态明示下一步。
- 预计耗时与价格：估不出的诚实标「未知」；区间过宽等于没预告，单 provider v1 下逐镜单价应为确定值。
- APIMart 之外供应商的真付费覆盖不由本计划背书。

## 10. 与 Video Agent 路线的关系（2026-08-24 定位）

用户提供的调研（`docs/research/2026-08-24-video-agent-architecture-survey.md`）推荐「通用底座 + 交互原语 + 垂直 Workflow Pack」，与本仓路线逐项对应：底座=P0–P3（已交付）；可编辑计划=P2；**P4=第一条 Workflow Pack「小说/剧本→一集成片」的生产段**（多镜+锚+一次确认+落画布+返工）；EditProposal 写回/撤销=P5；Agent 交互模式（Nomi 自己的创作助手升级为贯穿创作区/画布/时间轴的同一 agent，只许提案、走与外部 MCP 客户端**同一批语义工具与确认面**——elicitation 优先/置顶浮窗兜底照 §3.8）=P4/P5 之后的编排层，对应调研 §6。采纳调研 §21 全部推荐：不新增第四页、不开放自定义 Workflow Builder、不引外部 orchestration runtime（LangGraph/AutoGen/CrewAI 只借鉴机制）。调研 J1–J6 验证矩阵与本计划验收的对应：J1≈本 J1、J2/J3≈P2 已验编辑旅程+本 J2、J4≈锚机制+§5 一致性走查、J5=P5 范围、J6≈本 J3。**待拍板**：配音/TTS 是否进第一条 Pack（本计划 v1 明确无音频；但对短剧用户「无配音≠成片」，对照产品全部含配音）。
