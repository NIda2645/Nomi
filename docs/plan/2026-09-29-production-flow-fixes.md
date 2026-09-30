# 制作流程修复：停下原因是事实、生命周期一个主人、派发只核批过的那一份

> 状态：已实施（分支 `claude/production-flow-fixes`）。根因合同 `docs/fixes/2026-09-29-production-flow-stop-reason-and-lifecycle.root-cause.json`。
> 质量体系按 `docs/plan/2026-09-29-quality-system.md`：测试表、真实路径测试、中英截图、验收页。

## 用户那条路

Agent 付费卡点确认 → 参考卡（定妆照）出图 → 形象检查点放行 → 两镜视频派不出去 → Run 进 needs_attention → 没开拍的镜头显示「预算已用完 · 提额续拍」，点进去额度全是 0（今天根本没有价格）。
同一批里还有：急停后永远「暂停中」、「继续剩余」弹「操作没成功，请稍后再试 · run status pausing is not resumable」、参考卡失败后 Run 一直 running、重做失败的镜确认后永远不开拍、认领闸拒绝被记成 batch-dispatch-failed。

## 根因（一句话）

Run 的生命周期事实没有主人：为什么停从来没被记下（读的人只好猜），pausing → paused 是每个驱动自己记得调的一行，派发核的是一个不在批准范围里的活值（项目文档版本），失败原因在源头没分类。

## 范围（逐条）

| # | 改什么 | 主人（唯一） |
|---|---|---|
| 1 | 停下原因落成 `run.stop { reason, at }`；新停下不说原因即拒绝；读的人只读 `runStopReason`（画布、续拍、Agent 读 Run、Agent 任务列表）；删掉 needs_attention → 预算的反推 | `productionRunLifecycle.applyRunStatus` / `productionRunStop.runStopReason` |
| 2 | pausing → paused 挂在仓库唯一写入口上，谁写下最后一笔都一样；删掉三个驱动里的收尾调用；重开项目补老数据；pausing 可以直接继续；继续后叫醒对的驱动 | `productionRunLifecycle.settleRunLifecycle` / `productionRunService.wakeRunDriver` |
| 3 | 派发只核封进信封的那一份（项目身份、Run、计划版本、门、每个 job 的合同 / 报文哈希 / 幂等键 / 单价上限 / 到期），不再读活的项目文档版本 | `productionGenerationSubmission.prepareAuthorizedSubmission` |
| 4 | 返工 / 续拍：每种失败一个码（按错误类型与 errno 分类），一张穷尽的文案表，删掉「稍后再试」兜底；IPC 不往渲染层抛 | `appIntegrationProductionActions.productionShotActionFailureOf` / `productionShotActions.SHOT_ACTION_FAILURE_COPY` |
| 5 | 认领闸拒绝记成 `batch-dispatch-skipped`（info） | `multiShotBatchScheduler` |
| + | 批次歇下来时「停不停、为什么停」只判一次（参考卡失败也停）；只数当前尝试；重做解除「因失败停下」 | `multiShotBatchScheduler.settleAtRest` / `productionRunLifecycle.retryLiftsStop` |

## 不动项

- 付费卡（`src/workbench/ai/v4/*Spend*`）、confirmSpend / reviseSpend / discardSpend、`laneExtendedTools.ts` 的生成收据：下一张卡（①）。
- 批准那一刻的版本绑定（`productionRunApprovalReceipt.assertCurrentProjectRevision`）：与第 3 条同一族，归 ①。
- 第 6 条（排队中的参考卡被删后批次卡在形象检查点）：只写选项，见文末。
- 价格 / 预算：今天不算价格；预算那条路的代码保留，界面上任何路径都不会再说预算，除非 Run 真记下了 budget。

## 概念占用表（R33）

| 概念 | 唯一 owner | 允许消费 |
|---|---|---|
| 制作 Run 为什么停下 `production.run-stop-reason` | `electron/productionRun/productionRunLifecycle.ts#applyRunStatus` | productionShotPhase、decideShotClaim、batchScheduleDerivation、productionRunProjections、appIntegrationProductionActions、laneDesktopTasks |
| 生命周期收尾与解除 `production.run-lifecycle-settle` | `productionRunLifecycle.ts#settleRunLifecycle` | productionRunRepository、productionRunReducer、productionRunService、mcpToolResults |
| 继续后叫醒谁 `production.run-driver-wake` | `productionRunService.ts#wakeRunDriver` | — |
| 派发时核的授权范围 `production.dispatch-authorization-scope` | `productionGenerationSubmission.ts#prepareAuthorizedSubmission` | multiShotBatchScheduler、appIntegration、mcpStdioServer |
| 返工 / 续拍失败怎么说 `production.shot-action-failure` | `appIntegrationProductionActions.ts#productionShotActionFailureOf` | productionActionIpc、appIntegration、productionRunApi、productionRunBridgeTypes |

都已登记进 `docs/engineering/concept-owners.json`（`check:concept-owners` 通过）。

## 回滚

一个提交整体回退即可：`run.stop` 是新增可选字段，老代码读到会忽略；新写的 `run.lifecycle.settle` 事件老代码的 reducer 不认，但它只在重开项目补老数据时写，回退后那条 Run 停在 paused（老代码认得）。

## 验收门

- 单测 / 真路径 e2e：`productionRunStopReason.e2e.test.ts`（真仓库 + 真调度器 + 真提交门面）、`appIntegrationProductionActions.test.ts`（真服务 + 真收据机构）、`productionShotActions.test.ts`（中英每个码各一句、没有兜底句）。
- 变异：把每条修复改回旧行为，对应测试必红。
- 真 App 走查：`tests/ux/production-flow-fixes.walk.mjs`（新装机四个场景 + 老资料升级两个场景，中英截图）；全功能走查 pb05（暂停 / 继续）、pb01（付费卡两页）。
- 付费复验：`production-shot-claim.paid.mjs` 的 S3（急停 → 画布接手 → 继续剩余）。

## 先查别人

- 依赖里已有？Node 的系统错误带结构化 `code`（ENOSPC / EACCES / EPERM / EROFS…），不用读英文原话：https://nodejs.org/api/errors.html#common-system-errors —— 失败分类只认错误类型与 errno。
- 仓库里已有？
  - 仓库写入口是全部持久化事件的唯一必经点：electron/productionRun/productionRunEventTap.ts:2 —— 生命周期收尾就挂在这里（electron/productionRun/productionRunRepository.ts:579），不挂在驱动里。
  - 「一趟驱动还在跑时来的唤醒记一笔、收尾时补」老驱动早就这么做：electron/productionRun/productionRunDriverOps.ts:421 —— 批次调度器的踢照搬同一个做法。
  - 失败码 → 整键文案、`satisfies Record` 穷尽：src/workbench/ai/lane/laneCommandFailure.ts:26 —— 返工 / 续拍的文案表照这个形状，但不留 `agent_lane_execute_failed` 那种兜底档。
  - 批准那一刻核项目版本的地方：electron/productionRun/productionRunApprovalReceipt.ts:18 —— 派发这一侧因此不必、也不该再核一次活值。
- 生态里已有？
  - Kubernetes API 约定：状态条件的 `reason` 是「当前状态成因的类别」，与 `lastTransitionTime` 一起在转移那一刻写下（https://github.com/kubernetes/community/blob/master/contributors/devel/sig-architecture/api-conventions.md#typical-status-properties）—— `run.stop { reason, at }` 就是这个形状：由造成转移的一方写，读的人不去推。
  - GitHub Checks：`conclusion` 与 `status` 分开，完成那一刻写下（https://docs.github.com/en/rest/checks/runs）—— 「停着」与「为什么停」是两格。
  - Airflow 同类缺陷：暂停期间 DagRun 状态不更新、任务都完了还一直 Running（https://github.com/apache/airflow/issues/15439）；一个暂停闸同时管「别起新的」和「别收尾在飞的」（https://github.com/apache/airflow/issues/71381）—— 我们的「暂停」只挡新派发，在飞的照常轮询，收尾落在写入口。
  - RFC 9396 §9：资源服务器执行的是「批准过程中批准的那份授权细节」（https://www.rfc-editor.org/rfc/rfc9396.html#section-9）—— 派发只核信封里批过的那一份。
  - NN/g 错误信息准则：「An error occurred」这类通用句缺上下文，要给出补救办法（https://www.nngroup.com/articles/error-message-guidelines/）—— 每个码一句：怎么了、钱怎么样了、能做什么。
- 反方：「把失败码做全」在生态里通常还会留一个 unknown 档（例如 lane 的 `agent_lane_execute_failed`）。这里保留的 `internal_error` 只接 Nomi 自己的不变量断言，文案明说是 Nomi 的问题、没扣费、可反馈，不装成「稍后再试」；每种可预期的失败都在源头有码，有测试逐类钉住。

## 第 6 条：排队中的参考卡被删后，批次卡在形象检查点（只写选项，不实施）

现状：参考卡按「勾进了就算」的规则守着检查点（`batchScheduleDerivation.anchorsOf`），被删（detached）的参考卡永远到不了「已出图」，检查点一直 `pending_anchors`；它不是失败，批次歇下来时不会停——Run 一直 running，视频镜一直「排队中」。
同一个结构上还有一条我这次撞见的：参考卡失败后在它上面点「重做」，会因为「还有镜头在排队（视频镜已授权、没派）」被拒；而画布上唯一的出路「单独生成」会让参考卡被画布接手（detached），正好掉进上面这条。

| 选项 | 用户看到 | 代价 |
|---|---|---|
| A 如实停下 + 让人选（推荐） | 参考卡被删 / 被画布接手时，批次停下，没开拍的镜说「参考卡不在了，这一批停下了」，给「重新出一张参考卡」「不要形象确认，直接拍」「取消」 | 新增一个停下原因与两句文案；「直接拍」要样张拍板（它绕过形象确认，属花钱边界）；参考卡失败后的重做放宽「排队中」判据（被检查点挡着的镜不会和重做抢派发） |
| B 删掉的参考卡不再算这一批 | 剩下的参考卡齐了就开检查点；一张不剩就直接拍视频 | 视频可能在没人看过形象的情况下花钱；视频的封存合同如果引用了那张参考图，发不出去，要重新封——违背「检查点是花钱前让人看一眼」的设计 |
| C 删参考卡时先问 | 删排队中的参考卡弹确认「删了这一批会停下」，确认后停下（或取消这一批） | 改画布删除流程（要样张），碰画布节点删除的 owner；画布接手（单独生成）那条路仍要另外处理 |

推荐 A：它守住「花钱前让人看一眼」，停下是真话，第一步可以只做「停下 + 说清」，「直接拍」等样张拍板再加。
