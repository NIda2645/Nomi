# Agent 领域三件事（附件 / 默认模型 / 分镜表自己打开）的结构评审

> 状态：已完成（2026-09-30）。触发：`check:symptom-cluster` 报 `src/workbench` 7 天内已有几十份根因合同，本分支再加三份（`2026-09-30-agent-user-message-attachment-shape`、`2026-09-30-agent-declared-default-model`、`2026-09-30-storyboard-open-is-a-user-action`）。
> 姊妹评审：`docs/audit/2026-09-29-render-layer-second-answers-structure-review.md`（同一层「渲染层另给一个答案」那一族）。
> 来源：走查报告里的三条规则 `attachment-gone-after-send`、`agent-ignores-declared-default`、`surface-creationSelection`；Agent 消息层对照报告（`docs/research/2026-09-29-agent-message-layer-conformance/report.md` §5）判定这三条都是领域逻辑，换框架消不掉。

`src/workbench`、`electron/capabilityCore`、`electron/agentLane`、`electron/shared/agentLane` 这几个粒度都说明不了哪一层有问题（同簇的合同几乎都是别的 lane 的）。本评审只看这三件事各自落在的那一层，回答「这一层的结构要不要先动」。

## 一、用户消息在对话记录里的形状：投影漏了一个字段

**观察。** 转录里 `nomi.input` 消息自己带着附件 claim（`context.attachments`），但 `projectLaneSnapshot` 生成 user 段时只搬了文字、技能、分镜目标。字段是一个个手工搬的，所以每多一个字段就多一次「忘了搬」的机会（技能、分镜目标各被补过一次，这次轮到附件）。渲染层没有别的地方能补：它只读 part。

**结构裁决。** 「一条用户消息在对话记录里长什么样」的唯一主人是 `electron/shared/agentLane/laneProjection.ts::projectLaneSnapshot`（登记为 `agent-lane.user-message-shape`）。附件只从这条消息自己的 claim 读，文件名由主进程现查（与发给模型用同一个解析函数），解不出来画「附件不可用」而不是让签消失。渲染层（`src/workbench/ai/lane/laneViewModel.ts`）只把 part 画成 chip，不存名字、不推算。

**是否需要先做结构改造。** 不需要：调用点都收敛在这一个纯函数上（数门：5 个调用点共用它），补进去就是全部。「一次工具调用 = 一个 part」的消息模型改造是对照报告里的后续步骤，不在这里做。

## 二、用户声明的默认模型：一个解释者，两个消费者，只告诉了一个

**观察。** 设置里的「图片默认 / 视频默认」只存 (vendorKey, modelKey)；「此刻真能用的默认是谁」由主进程 `createGenerationDefaultModelResolver` 回答，宿主在 Agent **没点名**时按它补。但 Agent 自己挑模型时看的是模型索引，索引里从来没有这个默认，于是它总是「点名」，宿主的补默认永远轮不到。渲染层还有两处自己按同一份设置匹配（`defaultNodeModelSelection.resolveDefaultModelOption`、`availableModels.pickSavedDefaultModel`）。

**结构裁决。** 把 resolver 的答案原样交给 Agent 的索引（`laneDesktopModelDefaults`），并在草稿落地处把「实际用的模型 ≠ 用户默认」作为事实递还给 Agent（`declaredDefaultDeviations`），让它改回或向用户说清。这样 Agent 被告知的默认、宿主补的默认、偏离报告是同一个函数的答案。渲染层两处匹配登记为 `generation.declared-default-model` 的 pending 迁移（收口判据写在登记里），这次不动——它们属于画布新节点那一条线，且 `useNodeModelAutoSelect.ts` 正被别的 lane 持有。

**是否需要先做结构改造。** 需要，但可以后做：渲染层两处匹配收口成读主进程结果（IPC）。已登记，不阻塞。

## 三、方案新建后的「打开」：发起人不是输入

**观察。** `addStoryboardDesign` 与 `setStoryboardPlan` 的新建分支一律把新方案设成用户正在看的那份，`propose_storyboard_plan` 之后还把工作区拉回创作页。三个门都不知道「是谁在创建」，只有人类调用方碰巧也想要这个行为。

**结构裁决。** 「新建之后用户正在看的那份变不变」只由 `src/workbench/workbenchDocumentSlice.ts::activationAfterCreate` 按显式的 `StoryboardInitiator` 决定（登记为 `workbench.storyboard-activation`）：`'user'` 才打开，`'agent'` 只入列表；发起人是创建调用的必填输入，没有默认值，忘了写编译不过。给 Agent 的草稿回执带上「已存、没打开、在创作页左栏哪里点开」（`storyboardSaved`），回话里的那句话读的是这条事实。

**是否需要先做结构改造。** 不需要：创建的门只有两个函数，已经由类型收住。其余「程序替用户切界面」的面（任务中心、面板展开）不在这三件事里，走查的 `surface-*` 规则继续盯。

## 评审中看到、但不属于这三份合同的缺口

- 渲染层与主进程各自按 (vendorKey, modelKey) 匹配默认设置（见二）：登记为 pending，等画布新节点那条线收口。
- 引导游览 `journeyTourStore` 直接调用 `setStoryboardPlan` 且依赖「新建即打开」；它是用户点了「开始游览」的动作，沿用打开语义，但它没有显式声明发起人（`createNew` 缺省 = 编辑语义）。若以后游览也要由程序触发，需要补声明。

## 防回

`check:root-cause-contracts` / `check:door-map` 管合同与门表；`check:concept-owners` 管三个概念的唯一主人；`agentStoryboardDesign.test.ts` 钉「Agent 新建不打开、用户新建打开、两扇门同一条规则」；`laneProjection.test.ts` / `laneViewModel.test.ts` 钉附件随消息走且不消失；`laneModelContext.test.ts` / `laneDesktopModelDefaults.test.ts` / `mcpGenerationTools.test.ts` 钉默认与偏离事实；`check:symptom-cluster` 在同一层再聚到第三份时要求重新评审。
