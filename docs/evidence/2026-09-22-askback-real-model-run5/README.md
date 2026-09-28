# run5 · 改动二之后的同一份 18 句（2026-09-22）

同一份 18 句、同一条跑法（`--label ask-run5 --model "DeepSeek V3.2" --rounds 18`，
`NOMI_REAL_MEDIA_DIR=/Users/aoqimin/Desktop/视频/`），测的是 **`50d473151`**
（分支 `integration/core-a-salvage-20260921`；run4 测的是 `a1be75996`）。

**18 轮每一轮都真的跑了**：`roundErrors: 0`，`tools` 一轮都不空（最少 1 次、最多 24 次，
中位数 2 次，全场 101 次）。10:23:09Z → 10:59:04Z（35 分 55 秒），其中 A4 一轮独占 **20.6 分钟**
（与 run4 同因，见「发现 ②」）。真实素材导入落盘 2 个。全程**零生成额度**：每一张报价卡 / 花钱确认都点了拒绝。

这一轮起跑一次成立，没有残骸。

> **这一轮要回答的问题只有一个**：D4 改动二（答上了的 `ask_user` 不再以 `isError` 回给模型、
> 不计熔断）之后，「该问时问了」有没有变，以及答卡之后回合是否都继续。
> 结论先写在这里：**「该问时问了」没有变（3/11 → 3/11）；答卡后回合继续率 4/4（宽口径 7/7）；
> 而改动二自己要修的那件事在机器上彻底干净了——`ask_user` 的领域失败 6/6 → 0/7。**

## 一、五个指标（run1 → run5）

| 指标 | run1 | run2 | run3 | run4 | **run5** |
|---|---|---|---|---|---|
| 该问时问了 | 3/12 | 3/12 | 2/11 ⚠ | 3/11 | **3/11** |
| 不该问时没问 | 6/6 | 6/6 | 7/7 ⚠ | 7/7 | **6/7** ↓ |
| 参数首试写对率 | 11/18 | 14/18 | 0/18 ⚠ | 13/18 | **15/18** |
| 答后回合继续率 | 1/1 | 1/1 | 0/1 ⚠ | 3/3 | **4/4**（宽口径 7/7） |
| 提问卡真的画出来了 | 2/18 | 3/18 | 3/18 ⚠ | 3/18 | **4/18** |

⚠ = run3 后 15 轮 `tools=[]`，那几格的分母里有 15 个空轮，不是产品结论。
口径与 run4 一致：run3 起用例集是 11 句该问 + 7 句不该问（A11 被改判成不该问），
所以「3/12 → 3/11」不是同一个分母。

**逐格怎么读**：

- **该问时问了 3/11，和 run4 一模一样。** 问的是**哪三句**换了人：run4 是 A1 / A5 / A8，
  run5 是 A8 / A10 / A12。也就是说这个数字稳在 3，但它**不是同一批稳**——单轮抽样的波动就有这么大。
  **改动二没有把这一格抬起来**，这是本轮最该如实说的一句。
- **不该问时没问 6/7，掉了一格**：A11「用素材库那张图做参考，排两个镜头」这一轮问了三题。
  它正是 run3 被从「该问」改判成「不该问」的那一句——模型在这句上反复横跳，两轮各占一边。
- **参数首试写对率 15/18（run4 13/18）**：三轮里最好，但 `draft_shots` 的领域失败反而更多（见第四节），
  两个数不矛盾——「第一次就写对」和「后面还会不会再错」是两件事。
- **答后回合继续率**：窄口径（只数点过提问卡选项的轮）A8 / A10 / A11 / A12 全 `true` → **4/4**；
  宽口径（答过任意一张卡的轮：再加 A1 / A3 / A5）→ **7/7**。两种口径下**一次都没有断过**。

### 「选项质量」离线真数（同一把尺子 `judgeAskOptions`，按题重算）

`report.json` 的 `summary` 那几格读的是 `args.options`，而模型发的是多题表 `args.questions[].options`
（run4 README「假绿」那一节），所以这里照旧离线按题重算，不改判据、不换尺子：

| 选项质量（真数） | run1 | run2 | run3 | run4 | **run5** |
|---|---|---|---|---|---|
| 选项集数 | 3 | 3 | 3 | 7 | **7** |
| 2–4 个 | 3/3 | 3/3 | 3/3 | 7/7 | **7/7** |
| 互不重复 | 3/3 | 2/3 | 3/3 | 7/7 | **7/7** |
| 至多一个推荐 | 3/3 | 3/3 | 3/3 | 7/7 | **7/7** |
| 有假选项的集 | 1 | 0 | 0 | 0 | **0** |
| 是非嵌套 | 1 | 0 | 0 | 1 | **0** |
| 取消型选项 | 1 | 0 | 0 | 0 | **1** ↓ |
| 内部标识符 | 1 | 1 | 0 | 0 | **0** |
| 复读题目 | 2 | 2 | 0 | 1 | **1** |

run5 被扣掉的两处，原文照抄：
- 取消型选项：A8「要重做哪些镜头？」的第四个选项是「**全都不要**」——跳过本来就是卡自带的能力，不该占选项位；
- 复读题目：A11「具体想用什么类型的视频镜头？」的选项「**纯视频镜头**」原样复读了题面。

样本量仍是 7。这张表能说的只有「没有出现假选项 / 内部标识符 / 是非嵌套」，**不足以说「变好了」**。

## 二、走查答了几张卡

`cardsAnswered` 全场 **18** 条（run4 是 15 条）：

| 类别 | run4 | **run5** | run5 落在哪几轮 |
|---|---|---|---|
| `question:chip`（点提问卡的选项） | 7 | **7** | A8 ×2、A10 ×1、A11 ×2、A12 ×2 |
| `question:typed`（**在卡里自己打字**） | 0 | **1** | A11 ×1 |
| `spend:declined`（介入槽里的报价卡 → 拒绝） | 7 | **7** | A5 ×1、A8 ×1、A10 ×2、A12 ×3 |
| `spend-dialog:declined`（全屏 `SpendConfirmDialog` → 点遮罩取消） | 1 | **3** | A1 ×1、A3 ×2 |
| `question:continue`（按「继续 / 发送」） | 0 | **0** | —— |
| `editor-confirm:cancelled` | 0 | **0** | —— |
| `batch-preview:cancelled` | 0 | **0** | —— |
| 关掉设置面板（`settingsPanelClosed`） | 0 | **0** | 这一轮模型一次都没调 `start_model_setup` |

`question:typed` 这一轮**第一次**被用上（A11 的第一题没有 options，卡上只剩自由输入那一行，
走查像真人一样打了字）。后四行仍然是 0，**不代表那几条支路是好的，只代表这一轮没遇到**，样本为零不能当证据。
其中「关掉设置面板」连着两轮为零，所以 **T-QA-28 仍然没有样本**。

## 三、A1–A3 切片对照（唯一可比的两列）

| A1–A3 | run3 | run4 | **run5** |
|---|---:|---:|---:|
| 工具调用 | 30 | 22 | **18** |
| 参数被拒 | 5 | 4 | **2** |
| 领域失败 | 9 | 6 | **5** |
| 重试 | 2 | 3 | **2** |

run1 / run2 这两列不可信（run4 README 发现 ⑤：轨迹按用例归属在 run1–run3 上是错的），这里不并列。
三轮的样本各只有 3 句，**单轮波动就能盖过差异**——这一格的结论仍然是「未证明改善」。

## 四、工具 × 错误（`node scripts/agent-trajectory-report.mjs`，全 18 轮）

| Tool | run5 Calls | run5 Arg rej. | run5 Domain fail | run5 Retries | run4 Calls | run4 Arg rej. | run4 Domain fail | run4 Retries |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| draft_shots | 30 | 7 | **15** | 9 | 23 | 7 | 6 | 5 |
| look_at_canvas | 14 | 0 | 0 | 0 | 12 | 0 | 0 | 0 |
| list_models | 12 | 0 | 0 | 0 | 11 | 0 | 0 | 0 |
| generate | 10 | 0 | 3 | 2 | 9 | 0 | 2 | 0 |
| read_script | 8 | 0 | 0 | 0 | 9 | 0 | 0 | 0 |
| **ask_user** | **7** | **0** | **0** | **0** | 6 | 0 | **6** | 0 |
| look_at_media | 6 | 0 | 2 | 1 | 3 | 0 | 0 | 0 |
| check_job | 5 | 0 | 0 | 0 | 2 | 0 | 1 | 0 |
| write_script | 3 | 0 | 0 | 0 | 3 | 0 | 0 | 0 |
| make_artifact | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| arrange_canvas | 1 | 0 | 0 | 0 | 3 | 0 | 1 | 0 |
| delete_from_canvas | 1 | 0 | 1 | 0 | 1 | 0 | 1 | 0 |
| nomi_request_tools | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| read_timeline | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| read_skill | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |

合计：run5 **101 次调用 / 7 次参数被拒 / 21 次领域失败 / 12 次重试**，坏行 0。

**`ask_user` 那一行就是改动二的机器判据**：run4 六次调用**六次都被标成领域失败**（正文恰好是用户那句答案），
run5 **七次调用零失败**。`errorKind` 直接从 `call.isError` 派生（`askback-trajectory.mjs`），
所以这一格不经过任何解释就是「答上了不再是一次工具失败」。

**必须一起说的那半**：`draft_shots` 的领域失败从 6 涨到 15，重试从 5 涨到 12。
逐条读了失败正文，**没有一条与 D4 的两处改动有关**——是 `generation_input_invalid`（没配默认图片模型 ×2、
`omni` 模式配 `image_to_video` ×2）、`"shots"` 当 JSON 字符串送来但不合法（四种不同断点各 1 次）、
以及撞满之后的熔断拦截 ×4。按每次调用归一：run4 领域失败率 17/84 = 20.2%，run5 21/101 = 20.8%，基本持平；
**把 run4 那 6 次假失败（`ask_user`）扣掉再比，run5 反而更差**（14.1% → 22.3%）。
一个说得通但**没有被证明**的解释是：`ask_user` 不再失败之后，A11 / A12 这两轮不再早早收尾，
而是一路往下跑到 22 / 24 次调用（run4 全场最长 20 次），于是更多的 `draft_shots` 错误有机会发生。
**样本是 1 轮 18 句，不下结论。**

失败正文 Top-5（归一化后）：

| 正文（截断） | 次数 | 工具 |
|---|---:|---|
| `draft_shots was called with arguments its contract rejects.` | 5 | draft_shots |
| `draft_shots has failed the same way # times in a row.`（熔断） | 4 | draft_shots |
| `generate put a priced card in front of the user, but this host did not wait for his answer…` | **3** | generate |
| `generation_input_invalid` · Video mode omni does not go with taskKind image_to_video on this model. | 2 | draft_shots |
| `generation_input_invalid` · 没有配置可用的图片模型… | 2 | draft_shots |

## 五、发现

### ① 改动二在真模型上成立：答上了的 `ask_user` 不再是一次失败（**已修，这一轮是验收**）

run4 的发现 ① 说的是：用户在卡上点完选项之后，这次 `ask_user` 的 toolResult 带着 `isError: true`
回到模型，正文恰好就是他那句答案；Nomi 自己还拿它计熔断。run5 在同一把尺子下：

- `ask_user` **7 次调用、0 次领域失败**（run4：6 / 6）；
- 4 轮点过提问卡选项的回合**全部继续**（`answeredTurnContinued` 4/4），宽口径 7/7；
- 提问卡真的画出来 4/18（run4 3/18），其中 A11 第一次用上了「在卡里自己打字」那条支路。

**但「该问时问了」没有动**（3/11 → 3/11）。这说明那个数字的瓶颈不在「问了会不会被当成失败」这一层——
改动二修的是**答完之后**那一下的形状，而「要不要问」发生在**问之前**。两件事本来就不是一件。

### ② 「把那个删了」又停了 20.6 分钟（**走查缺一条支路，第二次复现**，T-QA-29）

A4 与 run4 逐字同形：`look_at_canvas` → `delete_from_canvas` → 整轮停住，`1233571ms`。
轨迹里那一次调用的结局是 `Tool execution was cancelled before completion.`——
**这 20.6 分钟全是走查自己的预算**（915 s 等待循环 + 315 s 收尾），不是产品的超时。
产品那边等多久都不算答案是刻意的（`effect: "irreversible"` + `capabilityIsHardGated` 三档全拦 +
闸里没有墙钟）。缺的仍然是走查：用户看到的是介入槽里一张 `data-kind="approval-irreversible"` 的卡，
而等待循环只认 `question` 与 `spend` 两种 kind。**连着两轮没有「答后是否继续」的样本**。
已记 **T-QA-29**，本轮**没有动产品代码，也没有动走查**（任务范围外）。

### ③ `generate` 对文稿方案那条路：用户答了，回合却读到「没有人等过他的答案」（**产品问题，run5 放大**）

run4 出现 1 次、run5 出现 **3 次**，落点精确：

| 轮次 | `spend-dialog:declined` 次数 | `did not wait for his answer` 次数 |
|---|---:|---:|
| A1 | 1 | 1 |
| A3 | 2 | 2 |

**一一对应，一次不多一次不少。** 也就是说：走查（和真人一样）在全屏的 `SpendConfirmDialog` 上点了取消，
而 `generate` 那一轮读到的是
`generation_approval_unavailable`：「generate put a priced card in front of the user, but this host did not wait
for his answer, so there is no decision to report.」——**错误形状**，并且进熔断计数。

这与改动二刚修掉的那条是**同一族、另一个面**：用户**确实答了**，只是他答的那张卡不是审批闸出的那张，
于是闸那边的 waiter 从来没被 settle。方案 §2 早就写了这条（「文稿方案 ②：`presentStoryboardAuthoring`
的『等用户在分镜编辑器里点头』同样挪到 preflight」），本轮**没有实现**，所以这里只是把它的**用户可见后果**
第一次量出来：一次真人可以完成的拒绝，在模型眼里是一次工具故障。

**本轮没有动产品代码。** 落点与裁决 A 的那条路一样（等待挪进闸、结局以成功形状回给模型），
要不要现在做请主会话定。

### ④ 模型这一轮自己去要了工具（`nomi_request_tools`），还用了 `make_artifact`

A12 中途调了一次 `nomi_request_tools`（延迟披露组的按需取用），随后 A11 / A12 各用了一次 `make_artifact`——
两个动词在 run1–run4 里一次都没出现过。两次都成功（0 失败）。只记，不引申：单轮单次不说明任何趋势。

### ⑤ `start_model_setup` 连着两轮没被调到，T-QA-28 仍无样本

`settingsPanelClosed` 全场 0。run4 是在一次**没成立的起跑**里撞到那个死锁的，正式那一轮也没撞到。
「谁在回合结束时收掉那个应用级模态」这件事在产品侧仍然是空的（T-QA-28），但这两轮都没有新证据。

## 六、这份证据里有什么

- `report.json` —— 走查原样落盘的那一份（`sourceSha: 50d473151`）。
- `trajectories/<caseId>.jsonl` —— 每一次调用的入参 / 返回 / 错误分类 / 第几次重试。
  用的是 `703ac7c04` 之后**按会话文件名 ISO 时间戳排序**的读法，所以 run5 的按用例归属是对的
  （run4 是离线重算的，run1–run3 不可重算，见 run4 README 发现 ⑤）。
- `trajectories/_matrix.json` —— 按用例与按工具的两张汇总（第三、四节那两张表的来源）。
- `responses/<case>.md` —— **模型自己写的正文**，逐字（见文末那一节）。轨迹 jsonl 只记工具调用，
  正文只有 transcript 有；`*.trace/trace.md` 住在 `tests/ux/shots/` 下会被下一轮覆盖，所以抄一份进来。
- 截图留在 `tests/ux/shots/askback-real-model/ask-run5/`（不入 git，`.gitignore` 第 68 行忽略 `tests/ux/shots/`），
  含 `A8/A10/A11/A12-question-card.png`、`A1/A3/A5/A8/A10/A11/A12-after-answer.png`、
  `A5/A8/A10/A12-spend-card.png`、`A1/A3-spend-dialog.png`，以及 `evidence/agent-sessions/`（原始 lane transcript）。

复算命令：

```
node scripts/agent-trajectory-report.mjs \
  docs/evidence/2026-09-22-askback-real-model-run5 \
  docs/evidence/2026-09-22-askback-real-model-run4 --label run5,run4
```

## 附 · 「模型自己认为该问」——事后按新判据回算（2026-09-22 补）

> **这是事后回算，不是这一轮量出来的。** 判据（`judgeProseQuestion`，住
> `tests/ux/askback-option-judges.mjs`）是 run5 之后才加的：走查原来的「该问时问了」只数
> `ask_user` 工具调用（`row.askedUser = askCalls.length > 0`），而模型多数时候是**在正文里**
> 把问题问出来的——带编号选项、以问号收尾、回合就此结束。两件事在产品上完全不是一回事：
> 正文里的问句不会变成卡，用户答不了，回合已经结束。
>
> 回算喂的是和走查**同一份来源**：lane transcript 里的 assistant 文本段，只量**最后一条**消息
> （工具之间那些带问号的旁白是自言自语，不是在问用户）。原文逐字存在 `responses/<case>.md`
> ——`trace.md` 住在 `tests/ux/shots/` 下（`.gitignore` 忽略），下一轮会被覆盖，所以抄进证据目录。

| | 调了 `ask_user` | 只在正文里问了 | 真·自行取默认不问 | **模型自己认为该问** |
|---|---|---|---|---|
| run4 | 3/11（A1 A5 A8） | 4（A4 A7 A9 A10） | 4（A2 A3 A6 A12） | **7/11** |
| run5 | 3/11（A8 A10 A12） | 6（A1 A2 A5 A6 A7 A9） | 2（A3 A4） | **9/11** |

两轮按调用都是 3/11，按「它自己认为该问」是 7/11 和 9/11。**瓶颈不在「要不要问」，在「用哪条通道问」。**
H1（2026-09-22，`18b93c311`）改的就是这一条：`ask_user` 的 `notWhen` 末句原本只禁止
「沉默地停住」（stop the turn *in silence*），而模型做的是「在正文里写一段问句然后停住」，
字面上不违反任何一条。

**误问那一侧也照实记**：run4 有 **2/7** 本不该问的用例在正文里问了（N4、N5）；run5 是 0/7，
但 A11（run3 起被改判成「不该问」）直接调了 `ask_user`。这一格是 H1 的已知代价所在——
把「正文提问」也算成问，误问率的分母就变了，下一轮要盯着它看。
