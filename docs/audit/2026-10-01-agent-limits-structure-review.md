# Agent 上限与时限（输入预算 / 写入回执）的结构评审

> 状态：已完成（2026-10-01）。触发：`check:symptom-cluster` 报 `electron/agentLane`、`electron/capabilityCore`、`src/ui`、`src/workbench` 7 天内各已有 ≥3 份根因合同；本分支再加两份（`2026-10-01-agent-request-input-budget`、`2026-10-01-agent-write-receipt-stuck`）。
> 姊妹评审：`docs/audit/2026-09-30-agent-domain-owners-structure-review.md`（同一条 Agent 线上一轮）、`docs/audit/2026-09-29-render-layer-second-answers-structure-review.md`（`src/workbench`）。

模块粒度太粗，同簇的合同几乎都是别的 lane 的。本评审只看这两份合同各自落在的那一层，回答「这一层的结构要不要先动」。

## 一、`electron/agentLane`：预算有数字、没有每次请求的执行者

**观察。** `laneContextBudget.mts` 登记了 80K 的预算并把它翻成 pi 的压缩门槛，但 pi 的压缩只在**回合之间**量一次；一个回合里连着十几次请求，每次都把前面全部工具结果原样带上（pb04：单次最大 146K，一回合合计 751K）。预算只有「数字」的主人，没有「每次请求是否真在预算内」的主人。

**结构裁决。** 每次请求的预算执行只住 `fitContextToBudget`（`laneContextFit.ts`，登记为 `agent-lane.request-input-budget`），接在 pi 留给宿主的 `transform_context` 口上，只改这一次的视图。先收旧的大工具结果、再收旧的大写入参数，最新结果与用户的话从不收。**是否需要先做结构改造：** 不需要——口子只有一个（`laneHost` 的 `transform_context`），已由类测试和 pb04 的每请求 token 测量钉住。

## 二、`electron/capabilityCore`：回复归类与回执时限，各缺一个主人

**观察。** 渲染层对一次写入明确回了「目标已过期」（`surface_port_stale`，它在碰文稿之前验目标发现对不上），主进程却把它和「被取消 / 端口不可用」放进同一个「结果不确定」名单，抛 `capability_receipt_unresolved`，回执于是永远停在 `preparing`；而 `preparing` 本身又没有任何时限，一次死掉的写入就能挡住之后所有写入。

**结构裁决。** 两个主人：「渲染层写入回复的结局归类（明确拒绝 / 结局不明）」归 `canvasReadSurfacePort.ts`（`capability.surface-write-outcome`），明确拒绝如实上报、当场由调用方收场；「准备中的时限与终态」归回执服务自己（`agent-proposal.receipt-preparing-deadline`），任何一扇门第一次碰到过期的 `preparing` 就落到终态。时限只是兜底，不是修复。**是否需要先做结构改造：** 不需要，两处都是单一入口（回复处理函数、回执服务的 `current()`）。

## 三、`src/workbench`、`src/ui`：这次没有碰

这两个模块的簇来自别的 lane 的合同；本 PR 不改这两处的任何文件。`src/workbench` 一层的结构问题见上面两份姊妹评审，这里不重复，也不据此声称它们没问题。

## 评审中看到、但不属于这两份合同的缺口

- 回执被拒的**根因的上游**：写入的锚点在**发消息那一刻**拍下，同一回合里 Agent 自己前一次写入就会让它对不上（pb04 第 5 次写入）。这次让它如实被拒、不再卡死，但「Agent 自己的写入使自己的锚点过期」本身没改。
- 「取消 / 不可用 / 挂起」类的不确定结局仍要等约 75 秒的时限才放行后续写入；若要更快，需要主进程能向渲染层**查询**那次写入有没有落地（对账），那是一个单独的设计。

## 防回

`check:root-cause-contracts` / `check:door-map` 管合同与门表；`check:concept-owners` 管三个概念的唯一主人；`laneContextFit.test.ts` 钉每次请求的预算；`canvasReadSurfacePort.test.ts` 逐码钉归类表；`projectAgentProposalReceiptStore.test.ts` 钉时限（注入时钟）；`check:symptom-cluster` 在同一层再聚到第三份时要求重新评审。
