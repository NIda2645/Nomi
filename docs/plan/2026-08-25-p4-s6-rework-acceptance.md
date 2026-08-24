# P4 S6 — 返工/插镜/版本切换 UI 接线 + halt 续拍 + APIMart 真付费验收

> 切片 S6（P4 最后一个实施切片），纪律同 S5。前置：S1 #132 / S2 #138 / S3a #143 / S4 #148 / S5 #151 全链在 origin/main。
> 计划真相源：`docs/superpowers/plans/2026-08-24-p4-multishot-continuity.md` §3.5 / §4 / §5 / §6；
> `docs/superpowers/plans/2026-08-24-unified-agent-master-plan.md` §4.3 词汇表（多候选=折叠组并排挑可指定生效版本；写入回执）。
> 开关：`NOMI_MCP_GENERATION_MULTISHOT_V1`（在 `SINGLE_SHOT_V1`+`E1_V1` 之上），默认关。

## 0. 一句话

把 S5 留位的三个「S6 接线」点接活：① 占位/失败镜的重试钮 → 返工链（同 Run 新 Job + parentJobId 谱系 + 镜级 gate 单镜价 + 继承锚 character_ref/DNA 提示词）；② 已停面板的按钮 → 调度器 resume（预算触顶走「提额」，急停走「继续」）；③ 重生成后节点保留旧 result → 接现成数据层做极简版本条（切回旧版/切新版）。配 J2 零额度 E2E + APIMart 真付费验收一次 + 体验摩擦观察。

## 1. 家底核实（file:line，已实读）

- **返工机制底座**：`productionGenerationSubmission.ts:565-612` `createNewAttempt`——同 Run 新 Job、`attempt++`、`requiresFreshReceipt:true`、`nextAction:"request_gate"`；但 **gate 在 `reason ∈ {submission_unknown, needs_attention}`**（571/578 行），只认失败/失证态，**不认已完成镜**。
- **reducer 新 Job 谱系**：`productionRunReducer.ts:468-522` `generation.new_attempt`——只要 plan `sealed`/`submitted` + attempt 在**同镜谱系**内单调即可（476-489），**不要求上一 job 失败**；多镜只清该镜 approval、不连坐（497-511）。**`parentJobId` 字段存在但 createNewAttempt/reducer 均未设**（`productionRunTypes.ts:163` 注「重试是新 Job、原结果可查」）→ S6 补设。
- **镜子合同带锚**：`productionGenerationSubmission.ts:179-191` `requiredContract(run, shotId)` 返回 `shot.contract`（含 `references` = 锚 character_ref，247 行入 envelope）→ 返工复用同子合同 = **锚/DNA 提示词自动继承**（零额外接线）。
- **确认漏斗单镜路径**：`capabilityApplyHandler.ts:226-243` `info.shots` 为空 → 走扁平单镜卡（model + shotSummary + 单价）。**返工确认 = 复用它，标注单镜价**（P1 不造并行卡）。
- **调度器 resume**：`multiShotBatchScheduler.ts:24-40` `options.raisePlanAuthorizationTo`（提额续拍）+ `runToQuiescence()` 重跑；**停态 run 不自动重启**（174-175 注）→ resume 须先把 run 转回 `running` 再重跑。
- **调度器 kick 入口**：`appIntegration.ts:343-366` `kickSchedulerForRun`——但 `['completed','cancelled','paused','pausing'].includes(status)` 跳过（352）；**halt 的 run 是 `needs_attention`**（`multiShotBatchScheduler.ts:159-163` haltRun），不在跳过列 → 直接重跑会立即再 halt（预算仍触顶）。
- **版本数据层**：`canvasRunActions.ts:175-184` `rollbackHistory(nodeId, resultId)`——从 `history[]` 找 resultId 设为 `node.result`，**不重排 history**（`graphOps.ts:133-140`）→ 切回/切新稳定（版本列表顺序不跳）。**全仓零 UI 调用者**（S6 接第一个）。`history` 由 `mergeResultHistory`（canvasRunActions.ts:9-27）**新在前**累积。
- **多候选折叠 UI 现成参照**：`ImageResultStack.tsx`——但只对 `type==='image'`（16-18 `isImageStackEntry`）。多镜返工是 **video** 版本 → 版本条须支持 video（用 `node.history` + rollbackHistory，不复用 ImageResultStack 的图专属实现）。
- **占位留位锚点**：`ProductionShotPlaceholder.tsx:86-94`（`data-production-shot-action="resume-pending-s6"` disabled）、`:124-133`（`retry-pending-s6` disabled）——S6 接活。
- **NodeErrorReport onRetry**：`BaseGenerationNode.tsx:487-497`——单镜走 `confirmAndRunNode(node.id)`；多镜物化节点须路由到返工链（一功能一个家）。判据 = `node.meta.productionRunId` 存在。
- **渲染层 run 命令通道**：`productionRunIpc.ts:8` `RENDERER_COMMAND_TYPES` 白名单含 `run.control`（pause/resume/cancel，99-103）。但 **semantic 多镜 scheduler 不由 service 的 run.control resume 驱动**（`productionRunService.ts:425` 只重踢 legacy `driveGeneration`）→ S6 resume/rework 走**新 IPC → appIntegration 层**（scheduler 家在那）。
- **J2 E2E harness**：`multiShotBatchScheduler.e2e.test.ts`——真 loopback HTTP vendor + 真 submission + 真 scheduler + 真 durable Run（零额度）。J2 加在此。
- **APIMart 凭证真实落点**：本机真实 Nomi settings 目录（catalog vendor keys）→ seed 进隔离 profile。key 绝不进日志/报告（`check:no-secrets` 会扫）。

## 2. 岔路裁定（无第二真相 / 与计划一致）

- **返工不新增 rework 命令，复用 `generation.new_attempt`**：reducer 已通用（同镜谱系 attempt 单调 + 只清该镜 approval）；facade 层 `createNewAttempt` 的 `reason` 门是「恢复」语义，**返工是新语义**——加一个 `reworkShot` facade 方法（不 gate reason、设 parentJobId），**不改 createNewAttempt**（恢复路径字节不动，其测试是回归门）。理由：reducer 是根因层（P2），命令通用；facade 两个方法是两个语义入口，非并行版。
- **版本条用 rollbackHistory 不用 promoteNodeResult**：promoteNodeResult 会**重排 history**（promoted 移到首位）→ 版本条顺序每切一次就跳，「切回旧版→再切新版」会错乱。rollbackHistory 只改 `node.result` 指向、**history 顺序不动** = 稳定版本列表。计划原文「接现成 rollbackHistory」正确。
- **halt resume 走 appIntegration 新 IPC 不走 service run.control**：semantic scheduler 的家在 appIntegration（`kickSchedulerForRun`），service 的 run.control resume 只驱动 legacy driver。硬把两者缝在一起 = 跨层耦合。新 IPC `nomi:production-runs:rework` / `:resume-batch` 直达 appIntegration 注册的 handler（scheduler 在闭包里）。

## 3. 实现分解

### A. 后端：返工 facade + parentJobId 谱系（`productionGenerationSubmission.ts`）
1. 新 `reworkShot(input: { projectId, operationId, shotId })`：
   - `requiredContract(run, shotId)` 取该镜子合同（锚/DNA 自动继承）。
   - `latestGenerationAttempt` → previousJob（**任意终态都可返工**：ready/adopted/needs_attention/detached）；无 previousJob → throw（没有可返工的镜）。
   - Run 锁内：`ensureBinding` 新 attempt binding；构造新 `ProductionJob`（status `authorized`、`attempt=prev+1`、**`parentJobId=previousJob.jobId`**、`retryReason:'rework'`、metadata.shotId）。
   - `command "generation.new_attempt" { job, shotId }` → 新 Job 落 Run（reducer 已只清该镜 approval）。
   - 返回 `{ jobId, attempt, contractHash, requiresFreshReceipt:true, nextAction:'request_gate', parentJobId }`。
2. `createNewAttempt` 也补 `parentJobId=lockedPreviousJob.jobId`（谱系一致，恢复路径也留痕；不改其 reason 门与返回形状的其余字段）。
3. facade 导出加 `reworkShot`。

### B. 后端：镜级返工 gate + 单镜价 + 派发（`appIntegration.ts`）
1. 新函数 `reworkShotInRun(projectId, runId, shotId)`（best-effort 编排，返回结构化结果给 IPC）：
   - `submission.reworkShot({...})` → 新 Job（authorized，待 gate）。
   - 起**单镜 gate**：复用 `confirmGenerationInNomi` 的挑战/收据机制，但用**该镜子合同的单价**（`resolveShotPrice(shot.contract)`）作 receipt ceiling；`display` 用单镜形态（model + shotSummary + 单价，**不带 shots** → 渲染层走扁平单镜卡）。
   - 用户确认 → 铸 receipt → `generation.approve`（**带 attempt** = 新 attempt，只批该镜）→ kick scheduler（`kickSchedulerForRun` 重跑，派发这个 authorized 新 Job；已完成兄弟镜不重扣）。
   - 用户取消/超时 → 新 Job 留 `authorized` 不派发（下次可再确认）；不扣费。
2. **单镜 gate 复用现有确认漏斗**：`requestRenderer('generation.gate.confirm', { challengeId, projectName, shotSummary, model, maximumCost, currency, expiresAt })`（无 `shots` 键）→ 渲染层 `capabilityApplyHandler.ts:226` 单镜路径。
3. resume 编排 `resumeBatchInRun(projectId, runId, reason: 'budget'|'manual')`：
   - `manual`（急停）：run.control resume → run 转 `running` → `kickSchedulerForRun`。
   - `budget`（提额）：读剩余勾选镜预估上界 → 用它作 `raisePlanAuthorizationTo` → run 转 `running` → scheduler 重跑（带提额 option）。**注**：kickSchedulerForRun 现不传 raise option → 加一个 `resumeSchedulerForRun(projectId, runId, { raisePlanAuthorizationTo })` 变体（或 kickScheduler 加可选参）。

### C. 主进程 IPC（`main.ts` + appIntegration 导出 + productionRunIpc 或新注册）
- appIntegration 导出 `reworkProductionShot` / `resumeProductionBatch`（模块级，闭包持有 scheduler builder）。
- main.ts 注册 `nomi:production-runs:rework`（{projectId, runId, shotId}）与 `nomi:production-runs:resume-batch`（{projectId, runId, reason}）→ 转调 appIntegration 导出。守卫：projectId 须 = openProjectId（返工/续拍是「用户在本机对本项目操作」）。

### D. 渲染层：占位/失败重试接线（`ProductionShotPlaceholder.tsx` + preload + api）
- preload 加 `productionRuns.rework(projectId, runId, shotId)` / `.resumeBatch(projectId, runId, reason)`。
- productionRunApi 加对应包装。
- 占位 **stopped** 态：`resume-pending-s6` disabled → 接活钮，点击调 `resumeBatch`（budget/manual 按 `state.stoppedReason`）；文案人话 + i18n。
- 占位 **failed** 态：`retry-pending-s6` disabled → 接活钮，点击调 `rework`（该 node 的 shotId 从 run.jobs 反查或 node.meta）。
- 需要拿到 shotId：占位节点 `meta.materializationShotId`（S5 落节点时写）或 `meta.productionShotId`。核实字段名。

### E. 渲染层：NodeErrorReport onRetry 路由（`BaseGenerationNode.tsx`）
- 判 `node.meta.productionRunId` 存在（多镜物化节点）→ onRetry 走返工链（调 rework），**不走** `confirmAndRunNode`。
- 单镜/普通节点 onRetry 不变（回归门）。

### F. 渲染层：极简版本条（新组件 `ShotVersionStrip.tsx`）
- 门：节点 `meta.productionRunId` 存在 + `node.history.length >= 2`（有可切版本）+ selected（L2 情境控件，不常驻；§1.5）。
- 形态（§4.3「折叠组并排挑、可指定生效版本」+ 既有节点 UI 语言）：节点内小版本徽标「V{n}/{total}」，展开列 history 缩略（video 用 thumbnailUrl/首帧），点某版 → `rollbackHistory(nodeId, resultId)` 设为当前。当前版打勾。走查断言「切回旧版→再切新版」。
- 复用 ImageResultStack 的视觉骨架**但不复用其 image-only 实现**（video 支持）；token-only，过 check:tokens。
- 挂载点：`BaseGenerationNode.tsx` 近 ProductionShotPlaceholder（同为多镜节点情境控件）。「重新生成此版」入口也放这（= 触发返工，一功能一个家）。
- **写入回执**（§4.3）：返工成功落新版 → 任务中心/通知「已生成新版本 · 可切回」（复用既有稳定 id 通知，不堆 toast）。

### G. 插镜（J2 变体，最小）
- 插镜 = 组内插入新镜 + 继承锚 + 组结构正确。§3.5「插镜同机制（新镜上下文继承锚）」。
- **v1 裁剪确认**：计划 §6「插镜进 S6」。最小实现 = E2E 层验证「同 Run 新增一个 shot（继承锚 references）→ 新 Job → 落组」。UI 入口（画布上「+插一镜」按钮）**若超出情境控件预算则本切片只做数据层 + E2E**，UI 入口留 S7 或按需。**先确认最小闭环，UI 不加新常驻控件（禁做约束）**。

### H. i18n（zh-CN + en）+ data-* 锚点
- 返工确认文案、版本条、resume/提额文案、写入回执全走 i18n。
- data-*：`data-shot-version-strip`、`data-shot-version-item`、`data-shot-version-current`、返工/续拍钮的 `data-production-shot-action` 改为 active 值（`rework` / `resume-budget` / `resume-manual`）。

## 4. J2 E2E（零额度 loopback，加在 `multiShotBatchScheduler.e2e.test.ts`）
1. 批次完成（2 镜，无锚或 1 锚）→ 记录初始 submits 数与 job 数。
2. 对第 2 镜 `reworkShot` → 新 Job（authorized、parentJobId=旧 job、attempt=2）。
3. approve 新 attempt（该镜单价 receipt）→ scheduler 重跑 → 新 Job 派发 → 新 artifact。
4. 断言：
   - 新 result 落**同一 shotId**（新 job metadata.shotId 相同）。
   - 旧版仍在（旧 job/artifact 未删，history 数据层可切回——数据层单测另证 rollbackHistory 稳定）。
   - **其余镜 job 数不变**（无重复扣费）：shot-1 仍 1 个 job；submits 只 +1（返工那一镜）。
   - 锚引用在新请求中保持（新 job 的 contract.references == 旧 = 锚 character_ref）。
5. 插镜变体：同 Run 新增 shot（继承锚 references）→ 新 Job → 组结构正确（若走数据层则断言 Run/shots；若走落地则断言组）。
6. parentJobId 谱系断言：新 job.parentJobId == 旧 job.jobId。

## 5. 回归五套全保持
- 单镜 E2E 14/14、S3a 34/34、elicitation 5/5、S4 批次 3/3、S5 走查（`p4-s5-canvas-landing.e2e.mjs` / `p4-s5-canvas-reconcile.e2e.mjs`）。
- `createNewAttempt` reason 门不动（恢复路径回归）；单镜确认卡字节不动。

## 6. APIMart 真付费验收（计划 §5.3，额度已授权）
- 从本机真实 Nomi settings 读 APIMart 凭证 → seed 隔离 profile（不污染真实库；key 不进日志/报告/仓库）。
- 隔离临时项目、2 镜、最低规格（最短时长/最低分辨率/n=1）、锚 1 个（或复用图省锚费）。
- 走完整真实链：多镜卡（真实价格）→确认→锚→检查点→2 镜生成→产物落画布→ffprobe 验媒体（时长/编码）+ 截图亲检。
- 记录：每步真实请求数（断言=锚数+镜数）、总花费、状态迁移。失败分类处理（401 停、参数不支持→回官方文档对账、超时→reconcile），禁 blanket retry。
- **体验观察**：逐步记情绪摩擦点（等待无反馈/文案看不懂/节奏突兀/吓一跳），报告单列一节。

## 7. 门禁
`check:filesize` → `check:tokens` → `check:i18n` → `check:heavy-path` → `lint:ci` → `typecheck` → `test` → `build` 全过才 push。

## 8. 禁做
S7 legacy 收敛、S3b 浮窗、配音、B 轨、MCP 新工具。版本条之外不加新常驻控件。

## 9. 回滚
开关默认关；单 PR 可回滚；关 `MULTISHOT_V1` 即回 S1-S5 现状（返工/版本条全在多镜节点情境 + 新 IPC + 新 facade 方法，单镜/legacy 零触及）。

## 10. 岔路与遗留（交付时更新）
- 插镜 UI 入口（画布「+插一镜」）是否本切片做 = 看情境控件预算（禁做：不加新常驻控件）。
- S2 遗留 `shotPricing.ts:65` lint warning：核实已在 S3a-S5 合并中清掉（当前 lint 98 基线绿，该行现为 `isFiniteNonNegative` 无未用变量）→ 若确无则报告说明，无需动。
