# 结构评审：分镜 → 出站这一层为什么反复出事，这次治到结构了没有（2026-09-30）

> 状态：✅ 已评审。结论：这一层的根因是「一镜发出去什么」没有唯一主人；这次收成唯一出口 `compileShotOutbound`，治到了提示词与参考图这两样，**还剩三类同类入口**（见末节）。
> 触发：`check:symptom-cluster`——`src/workbench` 7 天内已有第三份合同（本次 `2026-09-30-storyboard-outbound-owner`）。
> 在此基础上写：[`2026-09-29-hot-modules-structure-review.md`](2026-09-29-hot-modules-structure-review.md)（四个热模块的合同为什么扎堆：两台发动机、同一件事多处判断、投影层自己下结论）。本评审不另起一套，只回答其中 `src/workbench` 里**分镜 → 出站**这一段。
> 依据：[`../fixes/2026-09-30-storyboard-outbound-owner.root-cause.json`](../fixes/2026-09-30-storyboard-outbound-owner.root-cause.json)、[`../plan/2026-09-30-storyboard-outbound-owner.md`](../plan/2026-09-30-storyboard-outbound-owner.md)。

## 这一层是什么

分镜表里一行（`PlanShot`）要变成一次真实的供应商请求，要走四步：**行 → 节点（提示词 + 参考槽 meta）→ 执行合同 → 出站报文**。
前两步住在 `src/workbench/creation/storyboard` 与 `src/workbench/generationCanvas/agent`（以及 `electron/shared/storyboard` 的编译函数），后两步住在 `electron/capabilityCore`。
用户在第一步看到的是「行上写的提示词 + 参考列里摆着的图」；供应商在第四步收到的是另一个东西。中间每一步都有人「顺手」加一点。

## 为什么反复出事（不是这一处的笔误）

最近 7 天里落在 `src/workbench` 的分镜相关合同（`docs/fixes/`）：`storyboard-model-vendor`（09-21，选 A 家发去 B 家）、
`storyboard-planned-first-frame(-slot)`（09-20 / 09-26，计划首帧算没算进参考）、`storyboard-reference-model-query`（09-20）、
`storyboard-resolve-vendor-rejected`（09-26）、`storyboard-confirmation-target`（09-20）、`draft-shot-dispatch-honesty`（09-24）——再加本次。
它们各自修了一个口子，但同属一个形状：**同一件事（这一镜到底带什么、用哪家、算不算缺参考）在行组件、行状态、节点投影、落画布四处各有一份判据。**
每次修的人被任务书框在症状那一处，另几处原样留着，所以下一次从别的入口又出来。

这次的根因合同把它说得最清楚：**展示（行组件）读 `shot.prompt` / `referenceBindings`，发送（编译层）另读 `anchorIds` 展开**——两份真相靠手工对齐。
「巨龙」变人物就是它们分叉的那一刻：编译层多做了两步（追加锚的文字、按 `anchorIds` 自动连定妆卡），行上一样都看不见。

## 这次有没有治到结构

**治到了提示词与参考图这两样，而且是结构性的，不是再补一处：**

- 编译只剩一个出口 `electron/shared/storyboard/storyboardPromptCompiler.ts#compileShotOutbound`；`anchorPromptBits`、`referenceOrderForShot`、按 `anchorIds` 连边 / 写 `referenceImageUrls` 整段删除（同一提交，无开关、无兜底）。
- 所有入口（行内生成、生成剩余、Agent 确认框、放到画布、`production.materialize-storyboard`、方案投影）只从它取；
  `src/workbench/creation/storyboard/exec/shotOutbound.parity.test.ts` 把同一行从六个入口各发一遍，逐字节相同；
  往编译里追加一行字的变异让 8 条变红（已实跑）。
- 「行上显示的」与「发出去的」现在读同一份数据：行上的参考列画 `referenceBindings`，投影进节点的也是它；`anchorIds` 不再产生任何作用。
- 门表从 14 扇（按 `door-map` 数出的写 / 读入口）收到 12 扇，且写提示词 / 参考图的门都只经 `compileShotOutbound`。
- 监视器侧补了钉子：走查规则 `sent-prompt-unseen-addition`（铁律 3）在真 Electron 上对每个入口比对「用户确认那一刻看到的」与「供应商收到的」，并带真付费 1 行（龙不是人）。

## 还剩哪些同类入口（诚实交代，本次不碰）

1. **付费卡 / 制作流程的候选**：Agent `draft_shots` → 付费卡 → 制作 Run 的 provider 引擎发出去的是候选 `prompt` 原样，不读 `anchorIds`，不属于这一类；
   但它有自己的「四处各读各的」——卡标题读候选 `mode`、卡体读模型种类、画布节点读 `mode` 是否含 `image`（走查规则 `card-kind-mismatch` 已抓到，归付费卡 lane 持有）。
2. **Agent 工具说明仍把 `anchorIds` 描述成引用关系**：`electron/shared/agentCapabilities/verbs/writeVerbs.ts` 与 `src/workbench/generationCanvas/agent/storyboardLauncher.ts` 的提示词仍让 Agent 填它；字段现在无作用。
   后续可让 Agent 把要带上的角色描述直接写进这一镜的提示词（新功能，冻结期不做）。
3. **状态名沿用旧名**：`anchor-ignored`、`anchorIssues` 含义已改为「行上看得见的参考图被当前模式忽略」，名字是旧的；改名要动词表门岗与 Agent 回包字段，本次不做。

## 判断

再修一次某个入口不会让这一层安静；收成唯一出口会。这次做的是后者，并且用对等测试与走查监视器把它钉住——
`src/workbench` 在这一段上不再需要第四份「行到出站」的合同，除非有人在编译函数之外重新拼提示词或参考图（那会让对等测试当场变红）。
`src/workbench` 里**别的**热点（画布落地、素材取回、付费卡投影）不在本评审范围，仍按 2026-09-29 的收敛计划处理。
