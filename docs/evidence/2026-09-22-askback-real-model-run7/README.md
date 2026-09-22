# run7 · **有效轮数 9/18，与 run5 不可比**（2026-09-22）

> **第一行就是结论**：18 轮里只有 **9 轮跑到了模型**，而 11 句「该问」的用例里只剩 **2 句**有效
> （A10、A12）。供应商连接再次中断，**H1 的效果这一轮仍然没有量到**。
> 下面所有与 run5 的并列都标着「不可比」，不是谦辞——**该问那一格的分母从 11 掉到 2**，
> 任何方向的差都在单轮抽样噪声里。run6 已作废，不参与比较。

同一份 18 句、同一条跑法（`--label ask-run7 --model "DeepSeek V3.2" --rounds 18`，
`NOMI_REAL_MEDIA_DIR=/Users/aoqimin/Desktop/视频/`），测的是 **`190c1a88b`**
（run5 测的是 `50d473151`）。12:27:01Z → 12:44:02Z（17 分 01 秒——比 run5 的 35 分短一半，
正是因为 9 轮在 30 秒内就失败退出了）。

## 0. 这一轮为什么不成立

新仪器（`d1b45b909`）当场把它报了出来，不必事后翻轨迹：

```
roundsReachedModel: "9/18"
roundsFailedBeforeModel: [
  "A1:summarization_failed",
  "A2:assistant_error", "A3:assistant_error", "A9:assistant_error",
  "A4:assistant_error", "A5:assistant_error", "A6:assistant_error",
  "A7:assistant_error", "A8:assistant_error" ]
```

**8 轮 `assistant_error` 在时间上连续**（A2 → A8，每轮 29.5–30.6 秒就退出，
是一个很整齐的超时带），与 run6 那 7 轮同形。这是供应商侧的连接中断，
不是产品行为，也不是 H1 的效果。

**A1 那一轮要单独说**：它的结局是 `summarization_failed`，不是 `assistant_error`——
而且它**确实跑到了模型**，发了 9 次工具调用，最后一次就是 `ask_user`（见发现 ①）。
新仪器把「跑到模型」实现成「这一轮没有 failed 结局」，于是 A1 被一并踢出分母。
**这一格偏保守**：真实的「跑到模型」是 10/18，真实的「该问且跑到」是 3/11。
本份 README 的所有比率仍按仪器的 9/18 口径算（不手工改判），但这一条必须写明，
否则下一轮读到「9/18」会以为 A1 连模型都没碰到。

与 run6 那一轮的差别也照实记：run6 的中断**紧跟在 A4 停摆 20.6 分钟之后**，
当时怀疑是长时间空转把连接放掉了。**这一轮 A4 只用了 30 秒就失败**（它自己就在中断带里），
中断照样发生。所以「A4 的长停顿是连接中断的上游」这个猜测，**这一轮是反证**——
两件事没有因果，run6 README 发现 ② 的那半句推测可以划掉了。

## 1. 五个指标（run5 → run7）

只数**跑到模型**的轮次。run5 那一列是 18/18 全有效，run7 是 9/18——**两列的分母不是一回事**。

| 指标 | run5（18/18 有效） | **run7（9/18 有效）** | 可比？ |
|---|---|---|---|
| 有效轮数 | 18/18 | **9/18** | —— |
| 该问时问了（**按 `ask_user` 调用**） | 3/11 | **0/2** | ❌ 分母 11→2 |
| 模型自己认为该问（调用 **或** 正文） | 9/11 ※ | **2/2**（A10、A12） | ❌ 同上 |
| 误问（不该问却问了，调用或正文） | 1/7 ※ | **4/7**（N3 N4 N5 A11） | ⚠ 分母同为 7，但见第 3 节 |
| 参数首试写对率 | 15/18 | **7/9** | ❌ |
| 答后回合继续率 | 4/4 | **1/1**（A11） | ❌ 样本 1 |
| 提问卡真的画出来了 | 4/18 | **1/9**（A11） | ❌ |

※ run5 的「正文」两行是**事后按新判据回算**的（判据 run5 之后才加），见 run5 README 文末。

**逐格怎么读**：

- **该问时问了 0/2。** 跑到的两句该问用例是 A10（「帮我导出」）和 A12（港片暖胶片那句），
  两句都**没有**调 `ask_user`，但**两句都在正文里问了**。样本 2 句，说明不了任何事。
  唯一一次真的调了 `ask_user` 的「该问」用例是 **A1**——而那次调用**被 schema 拒了**（发现 ①），
  并且那一轮被判成没跑到模型。
- **模型自己认为该问 2/2**：A10 在正文里列了带短横线的两个选项并问「你希望先做什么？」；
  A12 以问号收尾且带编号选项。两句都想问，都没走 `ask_user`。
  **这正是 H1 要堵的那个口子，而它在这两句上没有堵住**——但 2 句不是证据。
- **参数首试 7/9**（`report.json` 里那一格写的是 `7/18`，见发现 ③：这个分母还没跟着修）。
- **提问卡 1/9**：只有 A11，而 A11 是一句「不该问」的用例。

### 选项质量（`judgeAskOptions`，走查当轮量出，按题）

| | run5 | **run7** |
|---|---|---|
| 选项集数 | 7 | **3** |
| 2–4 个 | 7/7 | **3/3** |
| 互不重复 | 7/7 | **3/3** |
| 至多一个推荐 | 7/7 | **3/3** |
| 有假选项的集 | 0 | **0** |
| 是非嵌套 | 0 | **0** |
| 取消型选项 | 1 | **0** |
| 内部标识符 | 0 | **0** |
| 标签过长 | 0 | **0** |
| 复读题目 | 1 | **0** |

**三个集全部干净，一处都没扣。** 但三个集**全部来自 A11 那一轮**（它调了两次 `ask_user`：
第一次两题、第二次一题），也就是**一轮一个模型状态下的三题**。样本 3，不足以说「变好了」。

## 2. 走查答了几张卡

`cardsAnswered` 全场 **4** 条，**全部落在 A11 一轮**：

| 类别 | run5 | **run7** | run7 落在哪几轮 |
|---|---|---|---|
| `question:chip`（点提问卡的选项） | 7 | **2** | A11 ×2 |
| `question:typed`（在卡里自己打字） | 1 | **1** | A11 ×1 |
| `question:continue`（按「继续 / 发送」） | 0 | **1** | A11 ×1 ← **这条支路第一次被用上** |
| `spend:declined` | 7 | **0** | 这一轮一张报价卡都没出 |
| `spend-dialog:declined` | 3 | **0** | —— |
| **`approval-irreversible:declined`（本轮新增支路）** | —— | **0** | **无样本**，见发现 ② |
| `editor-confirm:cancelled` | 0 | **0** | —— |
| `batch-preview:cancelled` | 0 | **0** | —— |
| 关掉设置面板（`settingsPanelClosed`） | 0 | **0** | 连着三轮为零，T-QA-24 仍无样本 |

A11 一轮四次作答的顺序是 `typed → chip → continue → chip`，回合**继续到底**
（`turnContinuedAfterAnswer: true`，19 次工具调用跑完）。`question:continue` 是这条支路
**第一次**拿到样本。后面几行是 0 **只代表这一轮没遇到**，不代表那几条支路是好的。

## 3. 误问 4/7——**其中 3 例是判据的假阳性**

这一格分母没缩（7 句「不该问」全部跑到了模型），但**不能照字面读**：

| 用例 | 怎么判成「问了」 | 逐字看到底是什么 |
|---|---|---|
| **A11**「用素材库那张图做参考，排两个镜头」 | **调了 `ask_user`** | **真误问**。连着三轮了（run5 / run6 / run7），是这一句稳定的行为 |
| N3「画布上现在有几个节点？」 | 正文（仅问号收尾） | **假阳性**：已答「画布上目前有 **1 个节点**」，末尾加了一句「你需要对这个参考图做什么处理吗？」 |
| N4「镜头 2 是什么内容？」 | 正文（问号收尾 + 编号选项） | **假阳性**：已逐条列出四个镜头并点名镜头 2 的内容，末尾问「你需要我为这个镜头 2 创建生成草稿吗？」 |
| N5「列一下现在能用的视频模型」 | 正文（仅问号收尾） | **假阳性**：已列出 27 款模型并分类，末尾是一句收尾追问 |

判据是 `judgeProseQuestion`（`tests/ux/askback-option-judges.mjs:138`）：

```js
askedInProse: endsWithQuestion || (numberedOptions && hasQuestionMark)
```

它量的是「最后一条消息以问号收尾」，**分不开两件完全不同的事**：
「我答不了，先问你」（真的停住等人）与「答完了，顺口问下一步要不要做」（**已经交付**）。
N3 / N4 / N5 三句全是后者——用户要的答案**已经拿到**，末尾那句是礼貌的下一步提议。

**所以「误问 4/7」这个数字在产品意义上是 1/7（只有 A11）。**
这不是这一轮才有的偏差，run4 / run5 / run6 的「正文误问」都用的同一把尺子
（run6 记的 N4 误问，很可能就是同一类假阳性）。**已记为下一条仪器缺口**（发现 ④）。
本 README 不改判据、不改判——数字照实写 4/7，把它是什么一并写清楚。

## 4. 工具 × 错误（`node scripts/agent-trajectory-report.mjs`，全 18 轮）

| Tool | run7 Calls | run7 Arg rej. | run7 Domain fail | run7 Retries | run5 Calls | run5 Arg rej. | run5 Domain fail | run5 Retries |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| draft_shots | 17 | 7 | 9 | 5 | 30 | 7 | 15 | 9 |
| list_models | 8 | 0 | 0 | 0 | 12 | 0 | 0 | 0 |
| look_at_canvas | 5 | 0 | 0 | 0 | 14 | 0 | 0 | 0 |
| read_script | 5 | 0 | 0 | 0 | 8 | 0 | 0 | 0 |
| **ask_user** | **3** | **1** ← 新 | **0** | 0 | 7 | 0 | 0 | 0 |
| look_at_media | 3 | 0 | 1 | 0 | 6 | 0 | 2 | 1 |
| write_script | 2 | 0 | 0 | 0 | 3 | 0 | 0 | 0 |
| nomi_request_tools | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| read_timeline | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| generate | 0 | 0 | 0 | 0 | 10 | 0 | 3 | 2 |
| check_job | 0 | 0 | 0 | 0 | 5 | 0 | 0 | 0 |
| make_artifact | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 |
| arrange_canvas | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| delete_from_canvas | 0 | 0 | 0 | 0 | 1 | 0 | 1 | 0 |

合计：run7 **45 次调用 / 8 次参数被拒 / 10 次领域失败 / 5 次重试**，坏行 0。
调用总数不到 run5 的一半（45 对 101），因为 8 轮一次调用都没发出；
`Cases with zero tool calls: A2, A3, A4, A5, A6, A7, A8, A9`（A1 不在其中——它发了 9 次）。

**`ask_user` 仍然是 0 领域失败**（D4 改动二连着三轮成立），但**第一次出现 1 次参数被拒**，
落在 A1，见下。`generate` 这一轮一次都没被调到，所以 run5 发现 ③ 那条
（`did not wait for his answer`，已由 `7973d9a3a` 修）**这一轮没有样本，没能验收**。

失败正文 Top-5（归一化后）：

| 正文（截断） | 次数 | 工具 |
|---|---:|---|
| `draft_shots has failed the same way # times in a row.`（熔断） | 5 | draft_shots |
| `generation_input_invalid` · This model cannot do text_to_image. It supports t#v, i#v… | 2 | draft_shots |
| `"shots" arrived as a JSON string, and that string is not valid JSON`（四种不同断点各 1 次） | 4 | draft_shots |
| `generation_input_invalid` · Unknown video mode: first. | 1 | draft_shots |
| `generation_input_invalid` · 参考素材 asset://… 不在这个项目的素材库里 | 2 | draft_shots |

`draft_shots` 把 `"shots"` 当 JSON 字符串送、而那个字符串不合法，run5 里是四次、run7 里还是四次，
断点各不相同（`"ationSec":: #`、`telemetry{#`、`EOS`、`from #`）——看上去是**流式输出被截断**，
不是模型写错了结构。只记，不引申。

## 5. 发现

### ① `ask_user` 第一次被自己的 schema 拒掉——模型问对了地方，卡没画出来（**新，产品问题**）

A1「帮我做个视频」这一轮，模型走完 `read_script → list_models → draft_shots ×5` 之后
**调了 `ask_user`**，两题、每题三个选项，题面和选项都是干净的：

```
questions[0] 这个视频想要什么比例？   16:9 / 9:16 / 1:1
questions[1] 希望总时长多长？         约15秒 / 约20秒 / 其他时长
```

这次调用**被拒了**：

```
Validation failed for tool "ask_user":
  - questions.0: must not have additional properties
  - questions.1: must not have additional properties
```

多出来的那个属性是 **`recommended: true`**——模型把它写在了**题**上。
而 `recommended` 在契约里是**选项**的属性，不是题的（`src/workbench/ai/v4/agentPanelV4Question.ts:130`
从 option 记录里读它；`askUserContract.test.ts:93` 也是按 option 测的），
题这一层是 `additionalProperties: false`，于是整次调用作废、**卡一张都没画出来**。

这件事的形状值得说清楚：**模型做对了所有该做的**——该问的时候问了、用了 `ask_user`、
分了两题、每题三个真选项、没有假选项也没有内部标识符（这正是 H1 想要的行为），
**结果用户什么也没看见**。这一格在 run5 / run6 是 0，run7 第一次出现（`askToolArgsRejected: 1`）。

> 一个说得通但**没有被证明**的解释：`recommended` 在同一份 schema 里既是选项属性、
> 又在「至多一个推荐」这条规则里被反复提及，模型把它误提了一层。
> 是否要在题这一层**容忍并下沉**这个字段（而不是整次拒绝），请主会话定。
> **本轮没有动产品代码。**

### ② T-QA-25 的走查支路已补上，但**这一轮拿不到样本**（`190c1a88b`）

等待循环现在认 `data-kind="approval-irreversible"` 的卡：出现即截图，然后像真人一样**拒绝**
（右上 × 摊开填原因那一档、再按 `confirm-reject`），记 `approval-irreversible:declined`。
`node --check` 与 `check:walkthrough-tool-args` / `check:test-waits` / `check:walkthroughs` 三门岗都过。

**但 A4「把那个删了」这一轮在 30 秒内就 `assistant_error` 了，根本没跑到模型**，
自然也没出那张卡。所以：

- **那 20.6 分钟的空等这一轮没有复现**——但**不是因为修好了，是因为那一轮压根没跑起来**；
- **新支路 0 样本，未经真卡验证**。它照抄的是同一套 DOM 的报价卡支路（`slot-dismiss` → `confirm-reject`），
  DOM 钩子是读源码核对过的（`AgentPanelV4SlotShell.tsx:92` 的 `slot-dismiss`、
  `AgentPanelV4Cards.tsx:354` 的 `confirm-reject`），但**读对了不等于跑通了**。
  下一轮 A4 只要跑到模型，这条支路就有第一份证据。

### ③ 仪器：`d1b45b909` 只修了一半的分母（**新，仪器缺口 —— 已修，见文末补记**）

新口径「没跑到模型的轮次不进分母」只落在了**反问那几格**（`askedWhenShould` /
`askedInProseWhenShould` / `wantedToAskWhenShould` / `askedInProseWhenShouldNot` /
`didNotAskWhenShouldNot`）。另外两格还在拿 `report.cases.length` 当分母：

```js
questionCardRendered: `${count((c) => c.questionCardVisible === true)}/${report.cases.length}`,
argsOkFirstTry:       `${count((c) => c.argsOkFirstTry)}/${report.cases.length}`,
```

后果就是这一份 `report.json` 里 `argsOkFirstTry: "7/18"` ——**看起来像模型退步了一半**，
按有效轮算其实是 **7/9**。同一份报告里两种分母并排，读的人无从分辨哪一格缩了。
本 README 第 1 节已按有效轮重算这两格并标注。**本轮没有动走查代码**（任务范围外）。

### ④ 仪器：「正文里问了」分不开「问住了」和「答完了顺口问一句」（**新，仪器缺口 —— 已修，见文末补记**）

见第 3 节。`judgeProseQuestion` 只看最后一条消息是否以问号收尾，于是
**「已经把用户要的答案给了、末尾提议下一步」也算一次提问**。这一轮 4 次「误问」里有 3 次是它。

这一格直接影响 H1 的验收口径：H1 想证明的是「模型不再**在正文里把问题问出来然后停住**」，
而现在这把尺子把「答完了还热心地问一句」也算进去了——**H1 要压的那个行为和这个数字不是一回事**。
建议下一轮之前给判据加一条：**这一轮有没有实际交付**（有没有成功的工具结果 / 正文里有没有给出答案），
交付了的不算「问住了」。**本轮没有改判据**，请主会话定。

### ⑤ 供应商连接中断连着两轮（run6 7 轮、run7 8 轮），且与 A4 的长停顿无关

见第 0 节。两轮合计 15 轮白跑。run6 当时把中断归因于 A4 那 20.6 分钟的空转，
**run7 反证了这一点**（A4 本轮 30 秒就失败，中断照样发生）。
这两轮都发生在同一个下午、同一个供应商、同一个模型（DeepSeek V3.2），
中断带都落在**连续的一段时间**里而不是散布在各轮——像是供应商侧的一段不可用窗口。
只记现象，不下结论。

## 6. 这份证据里有什么

- `report.json` —— 走查原样落盘的那一份（`sourceSha: 190c1a88b`）。
  **注意 `argsOkFirstTry` / `questionCardRendered` 两格的分母是 18 而不是 9**，见发现 ③。
- `trajectories/<caseId>.jsonl` —— 每一次调用的入参 / 返回 / 错误分类 / 第几次重试。
  8 个空轮的那几份是空的，正好是连接中断的直接证据。
- `trajectories/_matrix.json` —— 按用例与按工具的两张汇总（第四节那张表的来源）。
- `responses/<case>.md` —— **模型自己写的正文**，逐字，18 份。
  这一轮起是脚本抄的（`tests/ux/askback-responses.mjs`，run5 / run6 是手抄）；
  每份头部标了 `跑到模型=` 与结局，没跑到的那几份正文是空的。
- 截图留在 `tests/ux/shots/askback-real-model/ask-run7/`（不入 git，`.gitignore` 第 68 行忽略
  `tests/ux/shots/`），这一轮只有两张：`A11-question-card.png`、`A11-after-answer.png`
  ——全场只画出过一张提问卡。另有 `evidence/agent-sessions/`（原始 lane transcript）。

复算命令：

```
node scripts/agent-trajectory-report.mjs \
  docs/evidence/2026-09-22-askback-real-model-run7 \
  docs/evidence/2026-09-22-askback-real-model-run5 --label run7,run5
```

正文重抄（需要 `tests/ux/shots/askback-real-model/ask-run7/evidence/` 还在）：

```
node tests/ux/askback-responses.mjs \
  tests/ux/shots/askback-real-model/ask-run7 \
  docs/evidence/2026-09-22-askback-real-model-run7 --label run7
```

## 7. 建议

1. **H1 连着两轮没量到**（run6 7 轮空、run7 8 轮空 + A1 被判出局）。重跑之前先确认供应商侧
   那段不可用窗口过去了——**否则第三次还是白跑 35 分钟**。可以先用 2–3 句用例探一次连通性。
2. 发现 ① 的 `ask_user` schema 拒绝值得先定：它把一次**完全正确的提问行为**变成了用户眼里的沉默，
   而这正是 H1 想拿到的那种行为。
3. 发现 ③ / ④ 两条仪器缺口最好在下一轮之前补——尤其 ④，它直接决定 H1 的验收口径算不算数。
4. T-QA-25 的支路已就位，等 A4 跑到模型那一轮验收（发现 ②）。
5. T-QA-24 连着三轮无样本（`settingsPanelClosed` 全场 0）。

---

## 补记（同日，仪器补全之后）

发现 ③ 与 ④ 两条仪器缺口**已修**。改的只有走查与判据，**产品代码一行没动**，
所以下面这组数**是同一份 run7 原始数据按新口径重算的**，不是重跑出来的。

### 改了什么

1. **「跑到模型」放宽成两条并列**：lane 结局不是 `assistant_error`，**或**这一轮至少有一次工具调用
   （调用只可能由模型发出）。原来那条「没有 failed 结局」把 A1 误伤了——它结局是
   `summarization_failed`（回合跑完之后压缩上下文那一步挂的），但模型发了 9 次调用、
   最后一次正是 `ask_user`。**有效轮数因此从 9/18 变成 10/18，该问的分母从 2 变成 3。**
2. **所有还拿 18 当分母的格改用有效轮**（`questionCardRendered` / `argsOkFirstTry` /
   `askedForReversibleConfirmation`），一份报告里不再两种分母并排。
3. **`judgeProseQuestion` 加了第二档**，把「正文里问了」拆成两种：
   - **以问代做**（`askedInsteadOfActing`）：该做的没做，回合停在问题上等人。**H1 的验收只看这一格。**
   - **答完顺口一问**（`askedAfterDelivering`）：用户要的东西已经给了，末尾提议下一步。

   「交付了」= 这一轮调过**写类动词**（镜 `verbDeclarations.ts` 里 `effect: 'read'` 之外的那些），
   **或**收尾正文本身就是答案。后者的判据是**待选项的位置**：摆在问句**之后**就是在让人挑
   （A10「你希望先做什么？」下面跟着两条短横线待选），摆在问句**之前**的编号是答案内容
   （N4 先逐条列出四个镜头回答「镜头 2 是什么」，末尾才问一句要不要建草稿）。
   夹具单测补了 5 例（N3、A10 两条是任务点名的），judges 套件 17 项全绿。

### 按新口径重算的 run7

| 指标 | 旧口径（9/18） | **新口径（10/18）** | 差在哪 |
|---|---|---|---|
| 有效轮数 | 9/18 | **10/18** | A1 回到分母 |
| 该问时问了（按调用） | 0/2 | **1/3** | A1 那次 `ask_user` 回到分子——**虽然它被 schema 拒了** |
| 模型自己认为该问 | 2/2 | **3/3** | A1、A10、A12 |
| **以问代做（该问）** | —— | **1/3**（A10） | 新增，**H1 的验收格** |
| 答完顺口一问（该问） | —— | **1/3**（A12：四次 `draft_shots` 之后问「需要生成吗？」） | 新增 |
| 误问（旧：调用或正文） | 4/7 | —— | 旧口径把三次顺口一问算成了误问 |
| **真·误问（调用或以问代做）** | —— | **1/7**（只有 A11） | 新增，**这才是误问该用的数** |
| 其中「以问代做」 | —— | **0/7** | 三句 N 用例一次都没有 |
| 参数首试写对率 | 7/9 | **7/10** | 分母加了 A1（它被拒过，不计分子） |
| 提问卡画出来了 | 1/9 | **1/10** | 同上 |

**第 1 节与第 3 节那两张表是旧口径，保留原样不改**——它们是当时那一版仪器量出来的，
改掉就等于抹掉「仪器曾经这样错过」这件事。两套数放在一起看才知道缺口有多大：
**误问从 4/7 变成 1/7，是同一批正文、同一轮数据，只换了一把尺子。**

### 这组数仍然不能拿去比

该问那一格的分母是 **3**（run5 是 11）。**H1 依旧没有量到**，第 7 节的建议原样有效：
重跑之前先探一次供应商连通性。新增的「以问代做」那一格要等 run8 才有第一份可比的样本。
