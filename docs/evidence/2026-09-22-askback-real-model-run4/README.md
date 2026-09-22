# run4 · 18 轮全部跑到（2026-09-22）

同一份 18 句、同一条跑法（`--label ask-run4 --model "DeepSeek V3.2" --rounds 18`），测的是
`a1be75996`（分支 `integration/core-a-salvage-20260921`）。**18 轮每一轮都真的跑了**：
`roundErrors: 0`，`tools` 一轮都不空（最少 1 次、最多 20 次，中位数 2 次，全场 84 次）。
这是 run1 之后第一份可以整轮对照的结果——run3 的后 15 轮是空的，不能当结论。

跑完用时 08:19:04Z → 08:53:16Z（34 分钟），其中 A4 一轮独占 20.6 分钟（见「发现 ②」）。
真实素材导入落盘 2 个（`importedAssets: 2`）。全程**零生成额度**：每一张报价卡/花钱确认都点了拒绝。

> 这一轮之前还有三次起跑没成立，残骸留在 `tests/ux/shots/askback-real-model/` 下没有删：
> `ask-run4-aborted-0804/`（会话断线，Electron 被带走）、
> `ask-run4-blocked-by-settings-0746/`（A1 里模型调了 `start_model_setup`，设置面板挂住整台应用，后 17 轮 `tools=[]`）、
> `ask-run4-blocked-by-spend-dialog-0821/`（`generate` 停在 `SpendConfirmDialog` 前，同样锁死后 17 轮）。
> 那三份 `report.json` 里的数字**一个都不能用**，它们只用来说明修的是什么。

## 一、五个指标（run1 → run4）

| 指标 | run1 | run2 | run3 | **run4** |
|---|---|---|---|---|
| 该问时问了 | 3/12 | 3/12 | 2/11 ⚠ | **3/11** |
| 不该问时没问 | 6/6 | 6/6 | 7/7 ⚠ | **7/7** |
| 参数首试写对率 | 11/18 | 14/18 | 0/18 ⚠ | **13/18** |
| 答后回合继续率 | 1/1 | 1/1 | 0/1 ⚠ | **3/3**（按「答过任何一张卡」的宽口径是 5/5） |
| 提问卡真的画出来了 | 2/18 | 3/18 | 3/18 ⚠ | **3/18** |

⚠ = run3 后 15 轮 `tools=[]`，那几格的分母里有 15 个空轮，不是产品结论（run3 README 自己也这么写）。

两条必须先说的口径差异，否则这张表会被读错：

1. **用例集在 run3 改过**：run1/run2 是 12 句该问 + 6 句不该问，run3/run4 是 11 + 7（A11「用素材库那张图做参考」
   被改判成不该问）。所以「3/12 → 3/11」不是同一个分母。
2. **「选项质量」这一格 run2–run4 一直是假绿，这次才算出真数**——见下一节。

### 「选项质量」：报告里的 6/6 是假绿

`report.json` 的 `summary` 写着 `optionSets: 6, optionsInRange: 6/6, optionsDistinct: 6/6,
atMostOneRecommended: 6/6, fakeOptionSets: 0`。**这六个集合里一个选项都没有。**

`judgeAskOptions`（`tests/ux/askback-option-judges.mjs:50`）只读 `args.options`：

```js
const options = Array.isArray(args?.options) ? args.options : []
…
inRange: labels.length === 0 || (labels.length >= 2 && labels.length <= 4),
```

而从 run2 起模型发的是**多题表** `args.questions[].options`，`args.options` 恒为 undefined
→ `labels = []` → `count: 0`，`inRange` 那条 `length === 0 ||` 又把空集判成通过。
run1 的模型面还是扁平的 `{question, options}`，那时这把尺子是真在量东西（count 分布 2/3/3）。

**离线用同一把尺子按题重算**（`judgeAskOptions(q)` 逐题跑，不改判据、不换尺子）：

| 选项质量（真数） | run1 | run2 | run3 | **run4** |
|---|---|---|---|---|
| 选项集数 | 3 | 3 | 3 | **7** |
| 2–4 个 | 3/3 | 3/3 | 3/3 | **7/7** |
| 互不重复 | 3/3 | **2/3** | 3/3 | **7/7** |
| 至多一个推荐 | 3/3 | 3/3 | 3/3 | **7/7** |
| 有假选项的集 | 1 | 0 | 0 | **0** |
| 是非嵌套 | 1 | 0 | 0 | **1** |
| 取消型选项 | 1 | 0 | 0 | **0** |
| 内部标识符 | 1 | 1 | 0 | **0** |
| 复读题目 | 2 | 2 | 0 | **1** |

run4 被扣掉的两处，原文照抄：
- 是非嵌套：A5 第 4 次问，选项是「确认生成 / **不需要了**」；
- 复读题目：A5 第 1 次问，题目里有「是要生成镜头 1，还是其他什么？」，选项「**生成镜头 1**」原样复读。

样本量 3 → 7，仍然小；这张表能说的是「run4 没有出现 run1 那几类硬伤（假选项 / 取消型选项 /
内部标识符）」，**不足以说「变好了」**。

## 二、走查答了几张卡

`cardsAnswered` 全场 15 条：

| 类别 | 次数 | 落在哪几轮 |
|---|---|---|
| `question:chip`（点提问卡的选项） | 7 | A1 ×2、A5 ×4、A8 ×1 |
| `spend:declined`（介入槽里的报价卡 → 拒绝） | 7 | A5 ×5、A8 ×1、A12 ×1 |
| `spend-dialog:declined`（全屏 `SpendConfirmDialog` → 点遮罩取消） | 1 | A3 |
| `question:continue`（按「继续 / 发送」） | **0** | —— |
| `editor-confirm:cancelled`（`[data-confirm-dialog-cancel]`） | **0** | —— |
| `batch-preview:cancelled`（`[data-batch-plan-overlay]`） | **0** | —— |
| 关掉设置面板（`settingsPanelClosed`，不计入 `cardsAnswered`） | **0** | —— |

后四行是 0，**不代表那四条支路是好的，只代表这一轮没遇到**：`question:continue` 要多选题或自己打字才用得上，
这 7 张卡全是单选（点一下自己往下走）；设置面板这一轮模型没调 `start_model_setup`；
另外两条是上一次起跑时按旧猜想加的，这一轮一次都没命中——真正拦住 `generate` 的是第三张面（见发现 ③）。
这四格**样本为零，不能当证据**。

「答后回合继续率」的两种口径都记在这里：
- 窄口径（`answeredTurnContinued`，只数点过提问卡选项的轮）：A1 / A5 / A8 全部 `true` → 3/3；
- 宽口径（答过任意一张卡的轮）：再加 A3 / A12，也都 `true` → 5/5。

## 三、A1–A3 切片对照

| A1–A3 | run1 | run2 | run3 | **run4** |
|---|---:|---:|---:|---:|
| 工具调用 | 41 ⚠ | 28 ⚠ | 30 | **22** |
| 参数被拒 | 3 ⚠ | 4 ⚠ | 5 | **4** |
| 领域失败 | 11 ⚠ | 3 ⚠ | 9 | **6** |
| 重试 | 10 ⚠ | 1 ⚠ | 2 | **3** |

⚠ **run1 / run2 这两列不可信，不要用它们下结论。** 原因见发现 ⑤：`trajectories/<caseId>.jsonl`
的用例归属一直是错的（切片长度对、内容来自别的轮次）。run1（121 次调用）、run2（103 次）都跑满了 18 轮，
「前 22 条」取到的是错的那 22 条。run3 是个例外：它总共只有 30 次调用、全在 A1 与 A3 里，
「前 30 条」= 全部，所以 run3 那一列在**合计**意义上成立。run4 这一列是用修好的读法重算的，逐轮比对过。

**run4 相对 run3（唯一可比的一列）：22 次调用里 4 次参数被拒、6 次领域失败、3 次重试**，
对 run3 的 30 / 5 / 9 / 2。样本 3 轮，单轮波动就能盖过差异——**这一格的结论仍然是「未证明改善」**。

## 四、工具 × 错误（`node scripts/agent-trajectory-report.mjs`，全 18 轮）

| Tool | Calls | Arg rejected | Domain failed | Retries |
|---|---:|---:|---:|---:|
| draft_shots | 23 | 7 | 6 | 5 |
| look_at_canvas | 12 | 0 | 0 | 0 |
| list_models | 11 | 0 | 0 | 0 |
| generate | 9 | 0 | 2 | 0 |
| read_script | 9 | 0 | 0 | 0 |
| ask_user | 6 | 0 | **6** | 0 |
| arrange_canvas | 3 | 0 | 1 | 0 |
| look_at_media | 3 | 0 | 0 | 0 |
| write_script | 3 | 0 | 0 | 0 |
| check_job | 2 | 0 | 1 | 0 |
| delete_from_canvas | 1 | 0 | 1 | 0 |
| read_skill | 1 | 0 | 0 | 0 |
| read_timeline | 1 | 0 | 0 | 0 |

合计 84 次调用 / 7 次参数被拒 / 17 次领域失败 / 5 次重试，坏行 0。

失败正文 Top-6（归一化后）：

| 正文（截断） | 次数 | 工具 |
|---|---:|---|
| `generation_input_invalid` · 没有配置可用的图片模型。请在设置里选一个默认图片模型… | 4 | draft_shots |
| `generation_input_invalid` · Video mode omni does not go with taskKind text_to_video on this model. | 2 | draft_shots |
| draft_shots has failed the same way # times in a row.（熔断） | 2 | draft_shots |
| `"shots"` 作为 JSON 字符串送来但不是合法 JSON（三种不同的断点） | 各 1 | draft_shots |

`ask_user` 那 6 次「domain_failed」不是失败——见发现 ①。

## 五、发现

### ① 答上了的 `ask_user`，回给模型时被标成错误（**产品问题**，四轮都在）

用户在卡上点完选项之后，这次 `ask_user` 的 toolResult 带着 `isError: true` 回到模型，
**正文恰好就是用户那句答案**。run4 的 6 次 `ask_user` 全部如此（所以上表里它是 6/6 domain_failed）。

链条（都在本仓）：

- `electron/agentLane/laneApprovalGate.ts:308-318` 把「答上了」编码成 `allow: false`，
  注释自陈「与 deny 走同一条既有通路」；
- `electron/agentLane/laneHost.mts:466-477` 把 `!allow` 一律翻成 pi 的 `block`；
- `node_modules/@earendil-works/pi-agent-core/dist/harness/execution/tools.js:9-17,37-40`
  对 `block` 是**硬编码**的 `immediateError(... isError: true)`，没有「这是正常结果」的出口。

它是真的发出去的，不只是落盘字段：`pi-ai/dist/api/anthropic-messages.js:919` 直接映射成
Anthropic `tool_result` 的 `is_error: true`；Nomi 自己也把它当失败在用——
`laneHost.mts:506-518` 拿 `event.isError` 计「连续撞墙」次数（也就是说，用户每答一次卡，
都在给这一轮的熔断计数器加一格）。

对照组要小心：轨迹里另一档「`isError: false`、正文为空」**不是**「没答=正常」，
那是记录器的缺省值（`tests/ux/askback-trajectory.mjs:70-78`，那次调用压根没有 toolResult 落盘）。
× 掉卡走的是 `DEFAULT_DENY_REASON`，同样 `isError: true`。所以真实缺陷只有一句：**答上了被标成错误**。

**本轮没有动产品代码。** 可能的落点有两处（`laneHost.mts:476` 对 `decision === 'answered'` 放行，
或在 `after_tool` 把 `isError` 改回 `false`），选哪条要主会话定。

### ② 「把那个删了」停了 20.6 分钟（**走查缺一条支路**，等待本身是设计）

A4 调了 `delete_from_canvas` 之后整轮停住，`1234106ms` 才结束——这 20.6 分钟**全是走查自己的预算**
（915 s 等待循环 + 315 s 收尾，`stationTimeout`），不是产品的超时。

产品这边是刻意的：`delete_from_canvas` 的 `effect: "irreversible"`（`verbs/writeVerbs.ts:406`），
`capabilityIsHardGated`（`capabilityApprovalPolicy.ts:154-160`）在三档策略下都拦，
闸在 `laneApprovalGate.ts:263-292` 挂起，`Promise.race` 的另一臂只有 abort 信号——
**没有墙钟，等多久都不算答案**，与 2026-09-22 方案 §1.2 一致。

缺的是走查：用户看到的是介入槽里一张 `data-kind="approval-irreversible"` 的卡
（`agentPanelV4Intervention.ts:123-135` 裁的 kind），而等待循环只认 `question` 与 `spend` 两种 kind，
这张卡掉在所有分支之外。它有稳定钩子、拒绝是两下（`[data-v4-control="slot-dismiss"]` →
`[data-v4-control="confirm-reject"]`，与报价卡同形），**下一轮走查应当补上这条支路**；本轮没补，
所以 A4 这一轮「答后是否继续」没有样本。

### ③ `generate` 对「文稿方案」停的是第三张面：`SpendConfirmDialog`

run3 README 的「发现 1」说 `generate` 对文稿方案会 `presentStoryboardAuthoring` → 等用户在分镜编辑器里确认。
run4 抓到的是更具体的一张：**`src/workbench/generationCanvas/spend/SpendConfirmDialog.tsx:102`**，
一个盖满整窗的花钱确认（`fixed inset-0` + `pointer-events-auto`）。它既不是介入槽里 `kind="spend"` 的卡，
也不是 `src/design/confirmDialog.tsx` 那个居中框——走查此前按后两者去找，所以一次都没认出来。

现在走查会点它的遮罩取消（`onPointerDown` 里 `target === currentTarget` → `resolvePending(false)`，
三种形态通吃，且不必去碰 `data-production-action="confirm"` 那颗真花钱的钮）。A3 因此 56 秒就走完了，
而上一次起跑同一件事等了 20.6 分钟、并把后 17 轮全锁死。

### ④ `start_model_setup` 开的设置面板，回合里没有任何人负责收

模型可以在回合中途调 `start_model_setup`（设计如此：`nextAction: "user_sees_panel"`，
把「设置 · 模型」打开让用户去填 key）。它是**应用级模态**（`aria-modal` + 整屏黑底 +
`applicationModal` 档 z-index）。面板一挂上，切页钮、composer、介入槽里的卡全都点不动，
而回合照常往下走、结束，面板还在那儿——`ask-run4-blocked-by-settings-0746/` 那一份里，
它让之后 **17 轮**每一轮的第一下都超时。真人当然会顺手关掉它，所以这不是用户会遇到的死锁；
但「谁负责在回合结束时收掉它」在产品侧是空的，记在这里备查。走查现在会点它自己的关闭钮。

### ⑤ 轨迹按用例归属一直是错的（**仪器故障**，run1–run4 都受影响）

`readLaneTranscripts` 用 `fs.readdirSync` 的顺序读会话目录。每一轮都是新对话，目录名是
「新对话 2」…「新对话 19」，readdir 给的是 10、11…19、2、3…9；而 `askback-trajectory.mjs`
是**按条数顺序切**这串扁平调用来还原轮次的。顺序一错，每一轮都从别人的调用里切——
长度对、内容全不对。run4 起初 18 个用例**没有一个**归对。

已修（`tests/ux/agent-lane-observer.mjs`，按会话文件名的 ISO 时间戳排序），
run4 的 `trajectories/` 是用修好的读法从留存的 `evidence/agent-sessions` **离线重算**的，
重算后 18 个用例的工具名序列与 `report.json` 的 `toolCalls` 逐字相符（18/18）。

run1–run3 的原始会话没留存，**无法重算**：它们 `trajectories/<caseId>.jsonl` 的按用例那一列不可信
（run3 因为总共只有 30 次调用、全在 A1/A3 里，合计意义上仍成立）。
整轮合计（`_matrix.json` 的 `byTool`、总调用/总失败）不受影响——那是对全部调用求和，与切分无关。

### ⑥ A5：模型连问四次同一件事

A5「帮我把这些都生成了」一轮里，模型出了 5 张报价卡、走查按真人的做法每张都拒绝，
模型于是连着问了四次，一次比一次直白：

1. 「你要生成哪些草稿？…是要生成镜头 1，还是其他什么？」
2. 「你两次关闭了价格确认卡。是价格不合适，还是有其他考虑？」
3. 「你三次关闭了价格确认卡。具体是什么原因？」
4. 「你连续四次关闭了价格确认卡。图像生成在 Nomi 中通常都有成本。」→ 选项「确认生成 / 不需要了」

这不是 bug，是这条走查的规则（零额度、每张卡都拒）撞出来的形态；记下来是因为它同时说明
**「答完之后回合真的继续了」**（A5 的 20 次调用一路走到底、`turnContinuedAfterAnswer: true`），
也说明模型在被连续拒绝时会退化成「要不要花钱」的是非题——第 4 问的选项正是上面扣掉的那处是非嵌套。

## 六、这份证据里有什么

- `report.json` —— 走查原样落盘的那一份（`sourceSha: a1be75996`）。
- `trajectories/<caseId>.jsonl` —— 每一次调用的入参/返回/错误分类/第几次重试，**已用修好的读法重算并逐轮核对**。
- `trajectories/_matrix.json` —— 按用例与按工具的两张汇总（第四节那张表的来源）。
- 截图留在 `tests/ux/shots/askback-real-model/ask-run4/`（不入 git，`.gitignore` 第 68 行忽略 `tests/ux/shots/`）：
  `A1/A5/A8-question-card.png`、`A1/A3/A5/A8/A12-after-answer.png`、`A5/A8/A12-spend-card.png`、
  `A3-spend-dialog.png`，以及 `evidence/agent-sessions/`（原始 lane transcript，重算轨迹用的就是它）。
