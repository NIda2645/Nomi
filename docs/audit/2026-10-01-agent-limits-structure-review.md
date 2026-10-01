# Agent 上限与时限（输入预算 / 写入回执）的结构评审

> 状态：已完成（2026-10-01）。触发：`check:symptom-cluster` 报 `electron/agentLane`、`electron/capabilityCore`、`src/ui`、`src/workbench` 7 天内各已有 ≥3 份根因合同；本分支再加两份（`2026-10-01-agent-request-input-budget`、`2026-10-01-agent-write-receipt-stuck`）。
> 姊妹评审：`docs/audit/2026-09-30-agent-domain-owners-structure-review.md`（同一条 Agent 线上一轮）、`docs/audit/2026-09-29-render-layer-second-answers-structure-review.md`（`src/workbench`）。

模块粒度太粗，同簇的合同几乎都是别的 lane 的。本评审只看这两份合同各自落在的那一层，回答「这一层的结构要不要先动」。

## 一、`electron/agentLane`：预算翻译成 pi 设置时少了两个事实

**观察。** `laneContextBudget.mts` 登记了 80K 的预算并把它翻成 pi 的压缩门槛，压缩确实开着、也确实触发了；但 pb04 与真模型 10 轮显示单次请求仍到 94K-146K。原因在翻译：① pi 只在回合之间量，跨线那次请求按「线 + 一个回合的工具结果」发出；② pi 切点按 chars/4 估保留的尾巴，中文低估 3-4 倍，默认 20,000 实际留下约 8 万 token，压缩几乎没缩小东西。

**结构裁决。** 预算的唯一主人仍是 `laneCompactionSettings`（`agent-lane.request-input-budget`），它补上这两个事实：触发线取预算的 3/4，`keepRecentTokens` 按 pi 的估算单位给 5,000。压缩本身全是 pi 的，不再有第二个执行者（`laneContextFit` 写了又删）。**是否需要先做结构改造：** 不需要。

## 二、`electron/capabilityCore`：回复归类与回执时限，各缺一个主人

**观察。** 渲染层对一次写入明确回了「目标已过期」（`surface_port_stale`，它在碰文稿之前验目标发现对不上），主进程却把它和「被取消 / 端口不可用」放进同一个「结果不确定」名单，抛 `capability_receipt_unresolved`，回执于是永远停在 `preparing`；而 `preparing` 本身又没有任何时限，一次死掉的写入就能挡住之后所有写入。

**结构裁决。** 两个主人：「渲染层写入回复的结局归类（明确拒绝 / 结局不明）」归 `canvasReadSurfacePort.ts`（`capability.surface-write-outcome`），明确拒绝如实上报、当场由调用方收场；「准备中的时限与终态」归回执服务自己（`agent-proposal.receipt-preparing-deadline`），任何一扇门第一次碰到过期的 `preparing` 就落到终态。时限只是兜底，不是修复。**是否需要先做结构改造：** 不需要，两处都是单一入口（回复处理函数、回执服务的 `current()`）。

## 三、`src/workbench`、`src/ui`：这次没有碰

这两个模块的簇来自别的 lane 的合同；本 PR 不改这两处的任何文件。`src/workbench` 一层的结构问题见上面两份姊妹评审，这里不重复，也不据此声称它们没问题。

## 评审中看到、但不属于这两份合同的缺口

- 回执被拒的**根因的上游**：写入的锚点在**发消息那一刻**拍下，同一回合里 Agent 自己前一次写入就会让它对不上（pb04 第 5 次写入）。这次让它如实被拒、不再卡死，但「Agent 自己的写入使自己的锚点过期」本身没改。
- 「取消 / 不可用 / 挂起」类的不确定结局仍要等约 75 秒的时限才放行后续写入；若要更快，需要主进程能向渲染层**查询**那次写入有没有落地（对账），那是一个单独的设计。

## 防回

`check:root-cause-contracts` / `check:door-map` 管合同与门表；`check:concept-owners` 管三个概念的唯一主人；`lane-context-budget.test.mts` 钉触发线与保留尾巴；`canvasReadSurfacePort.test.ts` 逐码钉归类表；`projectAgentProposalReceiptStore.test.ts` 钉时限（注入时钟）；`check:symptom-cluster` 在同一层再聚到第三份时要求重新评审。
