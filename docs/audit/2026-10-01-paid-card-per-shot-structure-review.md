# 结构评审：付费卡逐镜这一刀碰到的六个热模块（2026-10-01）

> 状态：✅ 已评审。结论：这一刀就是底层设计问题 A「批准与派发没有唯一主人」的结构修复（阶段零结构簇 P0-1 / P1-6），不是这几层又被补了一次；不再为这件事另开修复。
> 触发：付费卡逐镜（合同 [`../fixes/2026-10-01-paid-card-per-shot.root-cause.json`](../fixes/2026-10-01-paid-card-per-shot.root-cause.json)）的 `check:symptom-cluster`：`electron/agentLane`、`electron/capabilityCore`、`electron/catalog`、`electron/productionRun`、`electron/shared`、`src/workbench` 在 7 天窗口里都到了第 3 份以上。
> 在此基础上写：[`2026-09-29-hot-modules-structure-review.md`](2026-09-29-hot-modules-structure-review.md)（热模块为什么扎堆）、[`2026-09-30-shot-phase-marker-structure-review.md`](2026-09-30-shot-phase-marker-structure-review.md)（同一个镜头阶段 owner）。方案：[`../plan/2026-09-30-paid-card-per-shot.md`](../plan/2026-09-30-paid-card-per-shot.md)。

## 这一刀改的是哪一层的结构

以前一个 Run 只有**一份**授权，挂在计划上（`generationPlan.authorizationEnvelope`）。由此长出三件用户看得见的事：

1. 「只批这一镜」只能靠把别的镜移出这一批来实现：卡上第 2 张悄悄没了，再没有卡问过它；
2. 第 1 镜批了还在排队时再批第 2 镜，新的一份替掉旧的，排在前面的镜失去授权（所以重做以前必须等「之前批过的都已发出」）；
3. Run 里没有任何记录说「卡问过哪几镜、哪几镜是用户去掉的、卡是怎么关的」，于是卡、确认路径、Agent 回执各自重新拼一遍「别的镜怎么了」，回执就写死了一句「都开始了」。

这一刀把结构换掉，而不是在三个症状上各补一处：

- **授权住在门上**（`electron/shared/productionSpendAuthority.ts`）：每点一次封一份只盖那一次点到的镜，派发按 job 记的摘要找到「批它的那道门」核信封。计划级那一份删了，旧 Run 读盘时归一一次。
- **出价记录进 Run**（`generationPlan.presentations`，只经 `electron/productionRun/productionGenerationPresentationEdits.ts` 的四个写口、全部走 reducer 命令）。
- **逐镜结局一个值**（`electron/shared/productionGenerationPresentation.ts` 的 `generationPresentationOutcome` / `undecidedShotIds`）：卡上摆哪几镜和标题、封印范围、画布小标、Agent 回执都读它。
- 同一次删掉：价格闸着的「逐镜 / 全部」切换和它的「全部」那一层、「先收窄这一批再封印」的确认路径、写死的回执、「价格未知」那一行与「仍要生成」。

三个概念在 `docs/engineering/concept-owners.json` 登记：`production.spend-card-presentation`、`production.spend-card-outcome`、`agent-lane.generate-receipt`；`production.dispatch-authorization-scope` 只改了形状说明（主人不变）。

## 逐个模块：为什么不是又一次补丁

| 模块 | 窗口里的合同 | 这一刀在这一层做了什么 | 判断 |
|---|---|---|---|
| `electron/productionRun` | 9 份（节点状态、任务中心、变体、续拍显示、落地比例、MCP 冷启动、镜头认领、停下原因，加本次） | 授权从计划挪到门、出价账进 Run、封印只盖点到的镜、去掉 / 关掉只撤盖着那一镜的那道等待中的门 | 前几份是各自子系统的 owner 收口；本次收的是「批准 → 派发」这一条链本身。窗口里 09-28 镜头认领、09-29 停下原因两份与本次同属 A，它们收的是「谁在生成这一镜」「为什么停」，本次补上「谁批了这一镜」，三份合起来 A 的三个面都有了唯一主人。 |
| `electron/shared` | 13 份 | 新增三个纯函数 owner（门上的授权、逐镜结局、回执），主进程和渲染层共用 | 这是 09-29 评审「投影层自己下结论」的收敛方向：判据进 shared，投影只读。 |
| `electron/capabilityCore` | 13 份 | 面板卡的确认只封这一镜（同一个 operation 串行、同一镜重复点幂等）；外部 MCP 申请门走同一个封印范围（`resolveGateScope`） | 没有第二份实现：面板、MCP、全自动档批的是同一种门，走同一条封印函数。 |
| `electron/agentLane` | 4 份（停下原因、默认模型、附件形状，加本次） | 回执只渲染宿主给的逐镜结局；等卡的回合在卡关掉时读宿主的结局 | 另一条 lane 持有的 `laneProjection.ts`、`laneModelContext.ts`、`laneContextBudget.mts` 一处没碰。这里的结构问题（工具调用的输出不是一个值）由 Agent 消息层那条线的 C1 收口，本次把回执做成一个值，正是为了 C1 能原样带走。 |
| `electron/catalog` | 10 份（模型目录、供应商身份、退役模型等） | 只改了上传托管确认的那一句报错文案（不说哪家免费、不替用户推荐） | 与这一簇无关：簇里九份都是模型目录与供应商身份那条线的合同。本次在这一层没有逻辑改动。 |
| `src/workbench` | 36 份 | 卡上删掉范围状态和「全部」层；每一页只转达这一镜的动作；画布连到占位上的参考图用画布自己那一份槽位解析（和节点生成同一个函数）摆上卡、照发 | 渲染层少了一份状态，没有多一份。09-29 评审点名的「渲染层另给一个答案」，在付费卡上这一次关掉了。 |

## 还剩的同类入口（不在这一刀里）

- **全自动档**：批的是同一种门，回执说「都开始了」在全自动档下为真（每一镜都由策略批了）；它本身的体验不在本次范围。
- **画布直接生成**：另一台发动机（`spendQuote` / `spendGrant`），按 `spend.pending-identity` 的迁移计划随画布付费迁进 ProductionRun。
- **卡搬进对话投影、一次调用一个 part**：Agent 消息层那条线的 B / C1。本次的逐镜结局就是 C1 要带走的那个输出值。
- **停下的镜还在说「预算 / 提额」**：在本系列后面的改动里处理（问题已报协调会话）。

## 处置

不另开结构性修复。这一刀本身就是结构修复：一个概念一个写口（出价账）、一个派生值（逐镜结局）、派发只认「批这个 job 的那道门」。门表 44 扇，全部是这两个 owner 的写口或读者，没有一扇自己下结论。
