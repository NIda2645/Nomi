# 投影铺开：从一个动词到二十个（2026-09-18）

> 状态：✅ 已交付 · 2026-09-18 · 分支 `feat/tool-projection-rollout-20260918`
> 上游：`docs/plan/2026-09-18-tool-projection-cancel-job-prototype.md`（原型，一个动词）与
> `docs/plan/2026-09-18-tool-layer-prior-art-verdict.md` §4（裁决：一份 schema + `hide`/`fill`）。
> 原型回答的是「能不能」，这一刀回答的是「铺开之后**还剩什么**」。

## 先查别人

**这一刀的检索**大头在上游那两份里，它们是同一天真做过的报告，不在这里重抄：
`docs/plan/2026-09-18-tool-layer-prior-art-verdict.md` §2（六个面逐个对照，原文与出处都在它里面）与
`docs/plan/2026-09-18-tool-projection-cancel-job-prototype.md` 的「先查别人」（原型那一刀的五条）。
铺开这一刀**自己新查的**是「我们仓库里已经有几处是这个形状」，因为铺开的正确姿势是去接已有的那几处，
不是在旁边再造一套：

- **依赖里已有？** pi 的 `AgentTool<TParameters>` 一份 TypeBox 两用、`execute` 的参数类型从同一份 schema 推导——`node_modules/@earendil-works/pi-agent-core/dist/types.d.ts:340-361`（裁决 §2.5 本人读过）。本刀用到的两个 TypeScript 手法都不是自研：`Omit<Host, keyof Model>` 做集合差、解构剩余项落进 `Record<string, never>` 做穷尽性，都是手册里的常规用法。
- **仓库里已有？（其一）** 对外 MCP 生成面早就是投影形状：`electron/capabilityCore/mcpGenerationToolCatalog.ts:22` 的 `.omit().extend()`。本刀把同一手法搬到内部动词面，不是新发明。
- **仓库里已有？（其二）** `canvas.delete` 早就是「一份 schema 两个用途」，只是方向反过来写的——宿主面定义成 `canvasDeletePiInputSchema.extend({ operation })`（`electron/shared/agentCapabilities/canvasDelete.ts:16`）。所以 `delete_from_canvas` 这一条**不需要新建任何东西**，只补一句显式 fill。
- **仓库里已有？（其三）** 「补完重过同一份宿主 schema」每个域都已经有了：`electron/shared/agentCapabilities/exportCapabilities.ts:157` 的 `exportWriteInputForAlias`，以及 `skillWriteInputForAlias` / `timelineWriteInputForAlias` / `canvasDeleteInputForAlias`，全是 `semanticSchema.parse({ operation: alias, ...})`。本刀**接**它们，不在传输层再拼一遍（原型那一刀在这里犯过，Ponytail 点出来后删掉了）。
- **生态里已有？** Claude Agent SDK：一份 zod 派生模型面 + 宿主改写参数后**重新过准入**（https://code.claude.com/docs/en/hooks ）；MCP TS SDK 用同一个对象派生 `tools/list` 与校验调用，注释原话 *"the listing and the call cannot diverge."*（https://modelcontextprotocol.io/specification/2026-07-28/server/tools ）。
- **反方证据？** 唯一「模型面与执行两处手写」的先例是 Codex，而它已被量到漂移（`timeout_ms` 宿主收、模型不知道；出处与行号在 `docs/plan/2026-09-18-tool-layer-prior-art-verdict.md` §2.4）。**但反方里有一条是对的**：同一份裁决 §3 说投影之后 `check:verb-host-conformance` 的 R1–R3 就不需要了——本刀实测那句话只对能投影的 11 个成立，剩下 9 个缝还在，所以那三条留着（下面「三条本来该删、最后没删」）。
- **TikHub 自媒体里怎么说？** 没用。这是一次纯内部的类型/schema 结构改动，没有任何用户可见面，自媒体上不会有人讨论「某个 Electron 应用的动词 schema 该不该从宿主契约派生」；可复核的对照面全在上面几条的源码与官方文档里（同 `docs/plan/2026-09-18-tool-projection-cancel-job-prototype.md` 那一刀的判断）。
- **结论** 全部用已有：手法抄 Claude Agent SDK 与 MCP TS SDK，落点接我们自己四个域里已有的 `*InputForAlias`（`electron/shared/agentCapabilities/exportCapabilities.ts:157` 那一族）。这一刀**没有新增任何机制**——新增的三个模块都是把原来住在 353 行 DSL 里的东西搬出来各自站好（投影 / 有损变换 / 来源轴），DSL 本身删掉。

## 一句大白话

一个工具过去在我们这里被写两遍：模型看的那份 schema 一遍、宿主收的那份一遍，中间再手写一张对照表说清
「模型的 A 对应宿主的 B」。三份东西描述同一件事，所以任何一份改了而另外两份没跟上，值就在中间无声地丢掉。
现在**宿主那一份是唯一真相**，模型看的那一面是它的投影（藏掉宿主自己会补的字段、覆写描述），
宿主补的值写成一个类型是「宿主面减模型面」的显式常量——补错了、少补了，都是编译错误。

**这一刀要权衡的那个东西**：投影会把宿主的每一个字段**默认变成模型该填的**。这既是它的好处
（两份 schema 不可能再漂开），也是它唯一的新风险（上游给契约加一个必填字段，模型脸上就多一个它可能
根本拿不到的值）。所以铺开的同时必须给模型面加一道「改了就得有人说一声」的门——`check:model-face-frozen`。

## 做到哪一步（数字，不是形容词）

| | 之前 | 之后 |
|---|---|---|
| 模型面**从宿主 schema 派生**的动词 | 1（原型） | **11**（+ `draft_shots` 一份有损投影 = 12） |
| 字段对应关系 DSL | `verbFieldMap.ts` 316 行（7 种 `kind` × 4 档来源 + 5 条装配期不变量） | **删光** |
| 对应关系表 | `verbTransportRoutes.ts` 280 行（`SIMPLE_VERB_ROUTES` 9 条 + `EXPORT_JOB_ROUTES` + 两张 draft_shots 表） | **删光** |
| 整条链上剩下的 rename | 9 条（上一刀减到 4 条） | **1 条**（双域动词的生成域那一半） |
| 外部 MCP 面的逐字段手抄 | `buildOperationCreateParams` 22 行 | **删光**，字段名单从宿主 schema 取 |
| 模型看到的工具面 | — | **逐字节不变**（sha256 两端相同，见 `tool-projection-rollout-evidence/README.md`） |

## 投影**覆盖不到**什么（明说，不静默降级）

20 个动词里 11 个能投影、1 个能有损投影，**另外 8 个不能**。三类，各有各的理由：

| 类 | 动词 | 为什么投不了 | 现在归谁管 |
|---|---|---|---|
| 宿主没有形状 | `look_at_canvas`、`list_models` | 契约的 `inputSchema` 是 `z.unknown()`，没有可投影的东西 | 手写声明；下一刀先把那两个契约的输入形状收出来 |
| 模型面是**构造**出来的 | `write_script`（`where`→`operation` 是值重映射）、`read_timeline` / `look_at_media`（按给了哪些参数派生走哪一支）、`arrange_canvas` / `make_artifact` / `stage_shot`（拼出整只节点结构） | 投影只会藏字段和覆写描述，它没有「改值」「选分支」「拼结构」这些动作 | `verbs/verbSemanticInput.ts`，仍由 `check:verb-host-conformance` R1/R2/R2b/R3 看着 |
| 结构**有损** | `draft_shots` | 三处形状真的变了：嵌套层级（`durationSec`→`parameters.duration`）、拍平（`candidate.*`）、参考素材身份由宿主补 | `verbs/draftShotsProjection.ts`：每个模型字段全部解构、剩下的落进 `Record<string, never>`，目标类型取自宿主 schema |
| **双域** | `check_job` / `cancel_job` 的生成域那一半 | 同一个模型面字段要落到**另一份** schema 的另一个名字上（两个域各有一份持久化，各用各的目录名） | `verbs/verbDualDomain.ts`：不是表，是两个返回类型取自宿主 schema 的函数 |

## 三条「本来该删、最后没删」的判断（每条都写清为什么）

1. **`check:verb-host-conformance` 的 R1–R3 留着。** 交接文档 §7.1 与裁决 §3 都说「投影之后这三条退化成
   一句子集断言」——那句话**只对纯投影的那 11 个成立**。剩下 9 个里那层翻译仍然是手写的，而 2026-09-18
   挖到的 A/B/C/D 四类缺陷全都出在它们身上。删掉它们等于让那 9 个重新变成盲区；恒真地跑那 11 个的成本
   是几毫秒。（门岗文件头已按今天的现实重写，不再自称在核「两份独立 schema 的复合」。）
2. **`from:` 四档来源留着**（搬进 `verbs/verbFieldProvenance.ts`，装配期跑）。它不是对应关系，投影也接不住：
   R1 只保证「宿主要的，动词告诉过模型」，保证不了「模型拿得到那个值」。当年正是硬要 `contentHash`，
   才让带参考图的分镜 100% 失败。**投影把这条缝放大了一点点**——`.omit()` 之外的宿主字段会自动流进模型面。
3. **`references: string[]` → `{assetId}[]` 那一处没按裁决 §4.5 改成宿主收 union。** 那会把这次归一从
   **一处声明**推进到每一个下游消费点——正是 R5 那条规则在治的形状（`title` 当年就是这么死了五次的）。

## 编译器真的抓得到漂移（A/B 实测，验完已还原）

| 变异 | 结果 |
|---|---|
| 宿主自补字段的取值变了（`z.literal("author_skill")` → `"author_skill_v2"`） | `verbProjections.ts(165,3): TS2322 Type '"author_skill"' is not assignable to type '"author_skill_v2"'` |
| 宿主字段改名（`dirName` → `dirNameRenamed`） | `verbProjections.ts(160,48): TS2339 Property 'dirName' does not exist on type …` —— **模型面自己红了**，这正是原型那次 A/B 证明的事 |
| 生成 lane 的载荷拼出一个宿主 union 里没有的字段（`cardHidden` → `cardHiddenTypo`） | `laneVerbTransport.ts: TS2561 … Did you mean to write 'cardHidden'?` |

## 三道门，每一道都先验过它会红

| 门 | 它拦什么 | 阳性对照 |
|---|---|---|
| `check:model-face-frozen`（**新**） | 模型看到的工具面变了没有（含「只换目录顺序」——KV-cache 前缀也是模型看得到的东西） | 3 条常驻变异；其中第一条就是原型那次**全绿**的变异 |
| `check:mcp-operation-constructible`（升级） | 从「可构造」到「**可填**」：每个必填字段都要答得出外部调用方从哪拿到它 | 4 条常驻变异，含「传输 schema 新长出必填字段而没人登记」 |
| `check:verb-host-conformance`（留、改文件头、变异重定向） | 那 9 个还有真翻译的动词 | 12 条常驻变异，逐条验红后回绿 |

## 不动项

- 宿主自己的准入校验一行没动（跨进程 + 花钱闸，必须继续独立跑）。
- 对外 MCP 已发布的字段名一个没改（`operationId` / `undoToken` / `vendor` / `modelKey`）。
- 磁盘格式、审批策略、报价卡没动。
- 模型看到的工具面**逐字节没动**——这是本刀的验收尺，不是副作用。

## 回滚

`git revert` 整条分支。没有持久化改动、没有对外契约改动、没有模型可见字段变化；唯一一处宿主行为收紧是
`operationId` 的 `max(160)`（它是 `.nomi/runs/<id>/` 的目录名，上限本该在宿主这一层）。

## 验收门

1. `pnpm run typecheck` 绿；`pnpm run gates` 全链绿。
2. 三道门的阳性对照逐条验红、撤掉回绿。
3. 模型面快照与 `origin/main` **逐字节相同**（sha256 对账，证据目录里有重算方法）。
4. 真模型整机走查（见下节）：四个数字与 `origin/main` 各跑一轮对比。

## 真模型走查（R13 第二/三档）

`tests/ux/agent-storyboard-real-model.walk.mjs`（+ `.cases.json` 23 句）。它补的是交接文档里
「调工具 18/23、落画布 14/23」那张表**没进仓库**的剧本——那一列在此之前每次改完都得靠人重跑手工操作。
四件真实：真 Electron / 文稿敲进编辑器、指令打进 composer、模型从下拉里选、素材从素材库的文件选择器导入 /
工具轨迹从磁盘 transcript 读 / 参考图是登记素材抽的 4K 帧。

数字与花费见 PR 正文。
