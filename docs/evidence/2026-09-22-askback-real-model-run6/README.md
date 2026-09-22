# run6 · H1 之后的同一份 18 句——**这一轮不成立，别拿它下结论**（2026-09-22）

同一份 18 句、同一条跑法（`--label ask-run6 --model "DeepSeek V3.2" --rounds 18`），
测的是 **`b6b492bc1`**（run5 测的是 `50d473151`）。11:43:52Z → 12:18:52Z（35 分钟）。

## 0. 先说这一轮能不能用：**不能**

**18 轮里有 7 轮根本没跑到模型**：

```
pi.result → { status: "failed", error: { code: "assistant_error", message: "Connection error." } }
```

A5 / A6 / A7 / A8 / A10 / N1 / N2，时间上**连续**（12:09:17 → 12:12:21），每轮四次重试全部
`totalTokens: 0`，然后整个 operation 判 failed。12:12:52 起自己恢复，后面 6 轮正常跑完。
供应商侧的连接中断，不是产品行为，也**不是 H1 的效果**。

它紧接在 A4 那一轮 20.6 分钟的停顿之后（`delete_from_canvas` 的不可逆卡没人答，T-QA-29），
最可能是那段长时间空转把连接放掉了；但这一点**没有被证明**，只是时间上相邻。

> **走查没有发现这件事。** `report.json` 的 `summary.roundErrors` 是 **0**，
> 因为那 7 轮从走查的角度「跑完了」——它只看自己有没有抛异常，不看 lane 那边这次 operation
> 是 `completed` 还是 `failed`。于是一轮「模型根本没回话」和一轮「模型想了想决定不问」
> 在报告里长得一模一样。**这是仪器缺口，和 run4 发现 ⑤（轨迹归错用例）同一族**，已修（见下）。

所以下面的数字分两栏写：**走查原样落盘的那一份**（分母 11 / 7，含 7 个空轮），
和**只数真的跑到的那 11 轮**。前者不能与 run5 比，后者样本太小，也只能当线索。

## 1. 指标（run4 → run5 → run6）

| 指标 | run4 | run5 | **run6（原样）** | **run6（只数跑到的）** |
|---|---|---|---|---|
| 该问时问了（**按 `ask_user` 调用**） | 3/11 | 3/11 | **0/11** | **0/6** |
| 模型自己认为该问（调用 **或** 正文） | 7/11 ※ | 9/11 ※ | **3/11** | **3/6**（A1 A9 A12） |
| 不该问时问了（误问，调用或正文） | 2/7 ※ | 1/7 ※ | **2/7** | **2/5**（A11 调了工具、N4 正文里问） |
| 参数首试写对率 | 13/18 | 15/18 | **7/18** | **7/11** |
| 答后回合继续率 | 3/3 | 4/4 | **1/1** | 1/1 |
| 提问卡真的画出来了 | 3/18 | 4/18 | **1/18** | 1/11 |

※ run4 / run5 的「正文」两行是**事后按新判据回算**的（判据 run5 之后才加），见各自 README 文末那一节。
run6 这两行是走查**当轮量出来**的——这是 `askedInProse` 第一次真的跑在走查里。

**唯一能说的一句**：run6 的 `ask_user` **调用数是 0**（全场只有一次，落在 A11——一句「不该问」的用例上）。
但 7 个空轮正好吃掉了 5 句该问的用例（A5/A6/A7/A8/A10），其中 A5/A8/A10 在 run4/run5 里**恰恰是问过的那几句**。
分母被挖掉的正是最可能问的那部分，所以 **0/11 这个数不能读成「H1 把提问压没了」**，也不能读成别的。
**H1 的效果这一轮没有量到。**

不美化：即便只看跑到的那 6 句该问用例，`ask_user` 也是 0 次，而 run5 同样这 6 句里有 1 次（A12）。
这一格是负向的，只是样本 6 句、且模型本轮整体状态明显更差（参数首试 7/11 对 run5 的 15/18），
两者分不开。

## 2. 误问那一侧（H1 的已知代价）

run6 跑到的 5 句「不该问」里有 2 句问了：
- **A11**「用素材库那张图做参考，排两个镜头」——直接调了 `ask_user`（run5 也是这一句误问，连续两轮）；
- **N4**「在文稿最后加一句『灯灭了』」——正文里问。

run4 的误问是 2/7（N4、N5，都在正文里），run5 是 1/7（A11，调工具）。
把「正文提问」也算成问之后，误问这一格从来就不是 0——H1 之前就有。
**这一轮的 2/5 不足以说 H1 抬高了误问率**，但它是下一轮必须盯的那一格。

## 3. 工具 × 错误（`node scripts/agent-trajectory-report.mjs`）

合计 65 次调用 / 9 次参数被拒 / 11 次领域失败 / 8 次重试；
`Cases with zero tool calls: A10, A5, A6, A7, A8, N1, N2`（报告工具自己就把 7 个空轮点了出来）。

| Tool | Calls | Arg rejected | Domain failed | Retries |
|---|---:|---:|---:|---:|
| draft_shots | 26 | 9 | 10 | 8 |
| list_models | 9 | 0 | 0 | 0 |
| look_at_canvas | 8 | 0 | 0 | 0 |
| read_script | 8 | 0 | 0 | 0 |
| look_at_media | 3 | 0 | 0 | 0 |
| generate | 2 | 0 | 0 | 0 |
| make_artifact | 2 | 0 | 0 | 0 |
| read_skill | 2 | 0 | 0 | 0 |
| write_script | 2 | 0 | 0 | 0 |
| arrange_canvas | 1 | 0 | 0 | 0 |
| **ask_user** | **1** | **0** | **0** | 0 |
| delete_from_canvas | 1 | 0 | 1 | 0 |

**`ask_user` 一行仍然是 0 领域失败**——D4 改动二（答上了不再以 `isError` 回给模型）在这一轮继续成立。
这是 run6 里唯一一条可以拿去用的结论。

## 4. 发现

### ① 走查会把「模型根本没回话」记成「模型没问」（**仪器缺口，已修**）

`summary.roundErrors: 0`，而 lane 那边 7 次 operation 是 `failed`。走查只捕自己的异常，
不读 `pi.result.status`。后果不是少一行日志，是**所有比率的分母都被悄悄掺进了没跑到的轮次**，
而报告看上去完全正常。已在走查里补上：每轮读这一轮的 `pi.result`，记进
`report.json` 的 `roundFailed` / `assistantError`，并在 summary 里单列
`roundsReachedModel`；没跑到的轮次不再和「跑到了但没问」混在一个分母里。

### ② A4「把那个删了」第三次复现 20.6 分钟（T-QA-29）

与 run4 / run5 逐字同形：`look_at_canvas` → `delete_from_canvas` → 整轮停住 `1233745ms`，
调用结局 `Tool execution was cancelled before completion.`。走查的等待循环仍然只认
`question` 与 `spend` 两种卡，`approval-irreversible` 掉在所有分支之外。
**这一轮它可能还有下游代价**：紧接着的 7 轮连接中断就发生在这 20.6 分钟之后。
（时间相邻，未证明因果。）

### ③ `start_model_setup` 连着三轮没被调到，T-QA-28 仍无样本

`settingsPanelClosed` 全场 0。

## 5. 这份证据里有什么

- `report.json` —— 走查原样落盘的那一份（`sourceSha: b6b492bc1`）。**注意 `roundErrors: 0` 是假绿**，见发现 ①。
- `trajectories/<caseId>.jsonl` + `_matrix.json` —— 每一次调用的入参 / 返回 / 错误分类。
- `responses/<case>.md` —— 模型自己写的正文，逐字；7 个空轮的那几份是空的，正好是那件事的直接证据。
- 截图在 `tests/ux/shots/askback-real-model/ask-run6/`（不入 git）。

复算：

```
node scripts/agent-trajectory-report.mjs \
  docs/evidence/2026-09-22-askback-real-model-run6 \
  docs/evidence/2026-09-22-askback-real-model-run5 --label run6,run5
```

## 6. 建议

**这一轮作废，重跑一次**（仪器缺口已修，重跑会当场报出没跑到的轮次）。
重跑之前最好先补 T-QA-29 那条走查支路——A4 每轮白等 20.6 分钟，而且它可能就是连接中断的上游。
