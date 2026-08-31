# 交接报告：P4 收官与统一 Agent 路线推进（2026-08-25）

- 交接对象：下一位接管 Nomi 推进的 AI
- 交接时刻状态：**P4 主线 S1-S5 已合入 main；S6（终章实施切片）agent 在飞；板面 PR 已清零**
- 用户已下达的总指令：按总方案自主推进到底；实施用 Opus 子 agent；每事三件套（外部顶尖对标 + 内部代码实查 + 设计系统）；**功能落地后必须做体验走查（情绪摩擦日志、全修才算完成）**；方案讨论期不动 git、实施期自动 commit/push/merge。

## 0. 先读什么（顺序）

1. 本文件。
2. `CLAUDE.md`（工程纪律，注意 R17 已加宽 + R18 新增）+ 记忆库 `MEMORY.md`（尤其：体验测试情绪日志、付费只用 APIMart、管道吞退出码、阳性对照、走查坑）。
3. `docs/superpowers/plans/2026-08-24-p4-multishot-continuity.md` —— P4 计划（6 角色评审版，含全部拍板记录）。
4. `docs/superpowers/plans/2026-08-24-unified-agent-master-plan.md` —— 统一 Agent 总方案 Rev.2（北极星/分层/harness/交互层/Pack/三轨排序）。
5. `docs/handoff/2026-08-24-semantic-single-shot-p1-p3-handoff.md` —— 底座语义与不回归清单（仍然有效）。

## 1. P4 已落地的五个切片（全部经过「代码审 + E2E 亲跑 + 截图亲读」三关后合入）

| 切片 | PR | 交付 | 回归基线 |
|---|---|---|---|
| S1 schema | #132 | generationPlan.shots[]（included 勾选/per-shot receipt/attempt 谱系）、submission 五入口按镜寻址、commandId/jobId/幂等键含 shotId | 单镜 E2E 14/14 |
| S2 定价 | #138 | `shotPricing.ts`（specKey 加算 join 开山定义、诚实未知不冒充 ¥0）、seal 前置校验、¥0 占位全清 | 同上 |
| S3a 确认卡 | #143 | 多镜卡（逐镜清单/明标价格/冻结项/交互暂停倒计时/试拍链）、gate payload 三层 contract 化、elicitation 优先断言 | +34/34、5/5 |
| S4 调度 | #148 | `batchScheduleDerivation.ts` 纯派生（无第二真相）、锁内预算 halt（typed BudgetExhausted）、急停、锚亮相检查点 gate、display.shots 装配、trial_narrow | +批次 3/3 |
| S5 画布落地 | #151 | 确认即落+打开幂等补齐、整批一个 Cmd+Z（组带幂等章）、attach-shot-result（运行时断言 nomi-local://）、三态占位（排队/生成中/已停 warning）、canvasDetached 单一真相、resumeUnfinishedRuns 启动接线 | +S5 走查 |

**审查协议**（对 S6 及以后照做）：读关键 hunks（安全语义优先）→ 在实施 agent 遗留的 worktree 里**亲跑**回归 E2E（禁 `| tail` 吞退出码，先 `> log; echo exit=$?`）→ 截图逐张 Read **并加体验镜头**（「舒服吗」不只「在不在」）→ CI 绿后 merge（分支保护要求 up-to-date：update-branch→等 QG→merge，冲突在 sibling worktree 手解——生成物冲突用重新生成、规则文档冲突用并集、代码搬家冲突要把 main 侧新增字段一并搬进新家，先例见 #140/#144/#147/#145 的处理）。

## 2. 在飞：S6（agent id 已不可续，若其 PR 未出现按 §3 重派）

S6 = P4 最后实施切片，分支 `claude/p4-s6-rework-acceptance`，交付物：
1. 返工接线：占位/失败镜重试钮 → 同 Run 新 Job（parentJobId 谱系）+ 镜级单镜价确认，继承锚；NodeErrorReport 在多镜节点的 onRetry 同路（一功能一个家）。
2. halt 续拍/急停继续入口接线（S5 已留位 + data-production-shot-action 锚点）。
3. 版本切换最小 UI（接现成 rollbackHistory，全仓第一个 UI 调用者；≤L2 控件）。
4. J2 E2E（返工同脸/只花一镜钱/版本可切回/插镜变体）+ 五套回归。
5. **APIMart 真付费验收**：真实凭证从本机真实 settings seed 进隔离 profile（key 绝不落纸）、2 镜最低规格、断言总请求=锚数+镜数、ffprobe 验媒体、报花费。失败按分类处理禁 blanket retry。
6. 体验摩擦记录（供 Task #10）。
7. 顺手清 `shotPricing.ts:65` 的 lint warning。

**S6 回来的审查要点**：付费验收数据核账（请求数、花费合理性、媒体真实）；J2 亲跑；版本条截图体验镜头；key 无泄漏（安全门岗会扫，但报告里也不能有）。

## 3. 若 S6 agent 丢失（会话压缩常吞后台 agent，先查 `gh pr list` 有没有它的 PR / `git branch -r | grep s6`）

重派 Opus + worktree 隔离，brief 要点即 §2 清单 + 惯例纪律（TDD 先红后绿、gates 全绿、PR 不合并、commit 尾 Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>、岔路停下上报、改现有 UI 先完整读外壳组件）。S1-S5 的 brief 范式可参考 git log 里各切片 PR 描述。

## 4. P4 收官剩余三步（顺序执行）

1. **S6 审查合入**（§2）。
2. **体验走查专项**（用户强要求，Task 系统里是 #10）：以「预算焦虑短剧创作者」人物设定，在**真实 App + 真实 APIMart 额度**走 J1/J2 全程（写脚本→多镜卡→定妆照点头→批量生成→连片→返工一镜），**逐秒记情绪摩擦日志**（四类：等得心慌/看不懂/吓一跳/想骂人），**摩擦全修**（不是记 backlog）后复走确认。对照产品同环节（小云雀/TapNow，调研在 docs/research/2026-08-24-*）。
3. **S7 legacy 收敛**：P4 计划 §3.6/§7——legacy production driver 的「逐节点 mintSpendGrant+spend.confirm」批量路径收敛为 deprecated 边界（GUI 手动单节点生成不受影响），独立 PR、自带回归证据与回滚。完成后按 P4 计划 §5 验收门逐项打钩，才能宣告 P4 完成。

## 5. P4 之后的路线（总方案 §6 三轨，均已拍板）

- **Track A**：P5 采纳/剪辑段（master-plan §5.1：E1 采纳桥=08-22 统一创作运行时的 P5 → E2 结构化粗剪：对白→字幕轨/音乐/混剪，结构派生不烧钱）→ 与 08-22 方案 P7 衔接。
- **Track B**：B2 工具动态注册表 / B3 确认三档（与既有确认漏斗合流）→ B4 harness 核心（事件溯源日志/Thread-Turn-Item/策略引擎——设计全文在 master-plan §2，复用边界=Vercel AI SDK 已复用、pi 只许源码级搬运）→ B5 Agent 主栏 + 对话词汇表组件（AI Elements 拷入重皮）+ 三姿态 + 库入口 + 模式选择器——**全部样张先行拍板后实现**（词汇表 v2 与三宿主定稿在 master-plan §4.3/§4.4）。
- **Track C**：Claude Code/Codex「一句话出片」Skill 包装；**真机新版 CC elicitation 探针**（CC CLI ≥2.1.76 已支持，记忆里有探针法，验完回写记忆）。
- **待用户拍板**：配音/TTS 进否 Pack v1（建议进 Pack 剪辑段）。

## 6. 环境与惯例事实（省你踩坑）

- 付费验收**只用 APIMart**（用户无即梦账号，记忆有卡）。评测/测试额度默认授权：直接花、事后报数、别问。
- 分支保护：需 up-to-date + QG 绿才能合；无 auto-merge；不许 `--admin`。合并列车模式：Monitor 脚本按序 update→等 QG→merge（先例脚本在本会话 git 历史/任务输出里）。
- 其他会话（用户点的 chip）会持续产 PR：按根因质量审（本轮 16+ 个全部过审合入，两次抓出真问题——#140 的类型洞、#141 的超时）。
- gates 新门岗：check:test-types（测试类型棘轮）、check:test-waits（R18 硬零）、fsync 屏障棘轮、凭证全文件扫描。docs-only 改动也要全跑 gates 才能 commit（R11）。
- 单文件 ≤800 行硬门；mcpProtocol 刚瘦身过（#145），别再喂肥。
- 走查纪律：_assert.mjs + 阳性对照 + 别 win.reload + 断色等 transition + 截图自己 Read。
- worktree 无 node_modules，先 `pnpm install --prefer-offline`。
- Electron 已是 43.4.1；Linux 测试进程需 `--enable-unsafe-swiftshader`（已在启动器，别删）。

## 7. 一句话交接

**P4 差三步收官（S6 审查、体验专项全修、S7 删旧）；之后 P5 与 harness 双线并进；所有拍板都已落文档，照总方案走，别重开讨论。**
