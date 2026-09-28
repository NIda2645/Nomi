# 结构评审 · 一个能力被重述了几遍（R21 症状聚类触发）

> 2026-09-18 · 触发方式：`check:symptom-cluster` 在 `docs/fixes/2026-09-18-verb-host-input-conformance.root-cause.json`
> 落地时同时报出五个模块成簇——`electron/agentLane`、`electron/assets`、`electron/capabilityCore`、
> `electron/shared`、`scripts`。这份合同一份就跨了五个模块，而那五个模块各自在 7 天窗口里已经攒到
> 8–14 份。规则说得对：**第三份合同是「这一层的结构不对」最便宜的证据，不是再修一次的理由。**
>
> 这份评审不提新架构方案，只回答三个问题：这些合同为什么聚在这五个模块、它们是不是同一个结构问题、
> 哪一部分已经被机器接管了、哪一部分还靠人记得。

## 0. 先看数字

| 模块 | 7 天窗口内的根因合同 |
|---|---|
| `electron/capabilityCore` | 15 |
| `scripts` | 13 |
| `electron/shared` | 12 |
| `electron/agentLane` | 9 |
| `electron/assets` | 9 |

`scripts` 的 13 份不是「脚本老出 bug」——那一列几乎全是**别的模块的合同把门岗写进了 `prevention.artifacts`**。
它是前四列的影子，不是独立的一层。真正要看的是前四个。

## 1. 这些合同讲的是不是同一件事

把 2026-09-12 之后落在这四个模块上的合同按「哪一句不变量被违反」归类，只剩下两类：

**① 同一个事实被写了好几遍，而没有东西比对它们。**
`nomi_generation_plan` 一个工具名在仓库里曾有三份互相否定的说明书（`verbDeclaration.ts` 开头记着）；
失败码表有两份内联手抄且成员已经不一样；`generationPlanInputSchema` 的 `shots[]` 与
`semanticCandidateFromParams` 实际读的字段集对不上（合成器读 `moduleId`/`providerId`，声明里没有）；
`generationTransportAdapters.parsedArgs` 里还留着一份比正本更窄的 create/patch/present 手抄 schema。

**② 一个值在链路上被逐字段重建，每一处重建都是一个静默丢弃点。**
2026-09-18 一天之内量到两条：模型拟的镜头 `title` 在五处手写重建里各死一次（已由
`electron/shared/generationShotEnvelope.ts` 收成单一真相源）；模型点名的目录身份
（`candidate.providerId`/`modelId`）、顶层缺省、`shotId`、参考素材身份在动词→宿主那一段各死一次。
headless MCP 画布路把 planned node 重建成七字段的 `NodeSpec`，手写产物的正文在那一行整只蒸发。

两类是同一个结构问题的两面：**一个能力在这条链上被重述了四遍**——
动词声明（模型看的）、翻译层（`verbToTransportCall` / `semanticInputOf`）、契约 `inputSchema`（宿主收的）、
handler 与它下游的投影（真正消费的）。四遍都是手写的，而**它们之间没有任何一条机器核对**。
每加一个字段，就要有人记得改四处；漏一处，TypeScript 不响、门岗不响、单测全绿，
只有真模型在下一次付费运行里用一次失败告诉你。

## 2. 为什么偏偏是这四个模块

因为链路正好横跨它们，而**没有任何一个模块是这条链的 owner**：

- `electron/shared`（`agentCapabilities/`）住着声明与契约 schema——链的两端；
- `electron/agentLane` 住着内部面的翻译与执行绑定——链的中段；
- `electron/capabilityCore` 住着对外 MCP 面的投影、传输适配器与 handler——链的另一条中段；
- `electron/assets` 住着模型拿不到、必须由宿主补的那些身份（内容哈希、版本）。

一个字段要从模型走到用户眼前，四个模块各改一处。合同因此**必然**同时落在四个模块上——
聚簇报的不是「这四个模块各自很脆」，而是「这条链没有 owner」。

## 3. 哪一部分已经被机器接管了

到 2026-09-18 为止，这条链上已经有三道机器核对，各管一段：

| 段 | 机器 | 管什么 |
|---|---|---|
| 声明自身 | `assembleVerbDeclarations`（`electron/shared/agentCapabilities/verbDeclaration.ts`）| 装配期四条不变量：一效果一工具、描述五槽、语言统一、不与付费边界矛盾 |
| 对外 MCP 面 | `scripts/check-mcp-operation-constructible.mjs` | 广播出去的每个 operation 都必须构造得出合法参数 |
| 内部动词面 → 宿主 | `scripts/check-verb-host-conformance.mjs`（本次新增）| 最小实例 / 两两组合 / 字段填满都要被宿主收下；模型填的值不许被翻译层静默丢掉；翻出的 lane 必须有适配器；下游不许手抄信封 |

第三道是这次补上的那一格——它存在之前，**内部动词面这一整段没有任何核对**，
这正是为什么 `title`/`durationSec`/`candidate`/`references` 这一类缺陷全都聚在内部面，
而对外 MCP 面（早就有第二道门）干净得多。同一条链上两个面的缺陷密度差，是这个判断的实测证据。

## 4. 还靠人记得的部分（按风险排序）

1. **契约 `inputSchema` 与 handler 实际读的字段集**没有机器比对。`shots[]` 少声明
   `moduleId`/`providerId` 这种「合成器早就在读、声明没写」的缺口，今天仍要靠人发现。
   可机器化的形状：从 handler 实际解构的键反推最小声明面，与 schema 对账。
2. **下游投影**只有「信封类型」这一族被钉住（`generationShotEnvelope.ts` + 新门岗的 R5）。
   `plannedNodeSchema` → `NodeSpec` → `CanvasNodeFactorySpec` 这一条还是三层手写重建，
   本次实测丢 `artifact`（已改为当场拒收）、`categoryId`、`modeId`、`variantId`、`params`、
   `metadata`、`referenceSheet`、`storyboardKeyframe`（仍在丢，见合同 `residual_risks`）。
   同一形状的修法已经有样板，缺的是有人把它套上去。
3. **同一语义的手抄副本**：`check:vocabularies` 的 owner 词表只认状态类词
   （status/state/phase/stage/step/lifecycle/health/outcome），失败码、方法名表、输入 schema
   这三族在它视野之外。`generationTransportAdapters.parsedArgs` 里那份比正本更窄的
   create/patch/present schema 今天不可达（lane 只发 `plan`/`status`），但它是下一次 drift 的现成温床。

## 5. 结论

不建议现在重构这四个模块的边界——它们的划分本身是对的（声明 / 翻译 / 契约 / 执行），
问题不在**分得对不对**，在于**每一段都用手写重述前一段，而重述没有被核对**。
所以正确的方向是继续「给每一段补上机器核对」，而不是合并模块：
合并只会把四处手写变成一处更大的手写。

下一格按第 4 节的顺序补：先是契约 schema 与 handler 字段集的对账（它管着花钱的那条路），
再是 planned node 那条三层重建（它管着用户手写内容的存亡）。这两格补上之后，
这条链上「加一个字段要记得改四处」就只剩「改两处、另两处由机器逼你改」。
