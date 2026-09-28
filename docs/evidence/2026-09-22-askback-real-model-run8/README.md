# run8 · **有效轮数 18/18 —— 三轮以来第一份能用的**（2026-09-22）

> **第一行**：18 轮**全部跑到模型**（`roundsReachedModel: "18/18"`，`roundsFailedBeforeModel: []`）。
> run6（7 轮空）、run7（8 轮空）那段供应商不可用窗口已经过去——起跑前先用三句只读用例探过
> （`ask-probe`，3/3），探到了才跑。**这一份与 run5 可比。**

同一份 18 句、同一条跑法（`--label ask-run8 --model "DeepSeek V3.2" --rounds 18`，
`NOMI_REAL_MEDIA_DIR=/Users/aoqimin/Desktop/视频/`），测的是 **`8847a35ed`**
（run5 测的是 `50d473151`）。13:03:09Z → 13:18:05Z（14 分 56 秒）。
全程**零生成额度**：两张报价卡都点了拒绝。

> **这一轮要回答的问题**：H1（`18b93c311`，`ask_user` 的 `notWhen` 末句堵掉
> 「写在正文里就算问过了」那个口子）到底有没有改变「用 `ask_user` 问 vs 在正文里问」。
> **结论先写在这里**：按调用**没有动**（3/11 → 3/11）；
> **而 H1 真正瞄准的那一格动了——「以问代做」3/11 → 1/11**。
> 但这是**单轮对单轮、分母 11**，3→1 完全落在抽样噪声里，**这不是一个已被证明的改善**。

## 1. 五个指标 + 第二档（run5 → run8）

两轮都是 18/18 有效，分母同为 11 / 7，**这是 run5 之后第一次真正可比**。

| 指标 | run5（`50d473151`） | **run8（`8847a35ed`）** | 动了吗 |
|---|---|---|---|
| 有效轮数 | 18/18 | **18/18** | —— |
| 该问时问了（按 `ask_user` 调用） | 3/11（A8 A10 A12） | **3/11**（A1 A3 A8） | 数没动，**换了一批句子** |
| 模型自己认为该问（调用或正文） | 9/11 | **8/11** | −1 |
| **以问代做（该问）** ← H1 的验收格 | 3/11（A2 A9 A6） | **1/11**（A9） | **−2** |
| 答完顺口一问（该问） | 6/11 | **5/11**（A3 A4 A5 A10 A12） | −1 |
| **真·误问（调用或以问代做）** | 1/7（A11） | **1/7**（A11） | 没动 |
| 不该问时没问 | 6/7 | **6/7** | 没动 |
| 参数首试写对率 | 15/18 | **12/18** | −3 |
| 答后回合继续率 | 4/4 | **5/5** | 全继续 |
| 提问卡真的画出来了 | 4/18 | **4/18** | 没动 |
| `ask_user` 参数被拒 | 0 | **0** | run7 那次（1）没有复发 |

> run5 的「以问代做 / 顺口一问」两行是**用同一把新尺子离线重算**的
> （判据 run7 之后才加，`judgeProseQuestion` 第二档）。喂的是 run5 证据目录里
> `responses/*.md` 的逐字正文 + `report.json` 里那一轮的 `toolCalls`，
> 与 run8 当轮量出来的是同一套口径、同一份实现。复算脚本见第 6 节。

**逐格怎么读**：

- **「该问时问了」3/11 → 3/11，数字一动没动，但换了一批句子**：run5 是 A8 / A10 / A12，
  run8 是 A1 / A3 / A8。只有 A8 两轮都问。**这个数稳在 3，但不是同一批稳**——
  单轮抽样的波动就有这么大，这一点 run5 README 已经说过一次，run8 再次印证。
- **「以问代做」3/11 → 1/11，这是 H1 唯一瞄准的那一格。** run5 里 A2（「把这个改好看点」）、
  A9（「把开头改一下」）、A6（「加个镜头」）三句都是**什么也没做、在正文里摆一组问题然后停住**；
  run8 里 A2 直接 `write_script` 改完了、A6 一路 `draft_shots` 建了草稿，只剩 A9 还在原地问。
  方向是对的，**但 11 个样本上从 3 掉到 1 说明不了显著性**——按二项分布，这种幅度单轮就能晃出来。
  要下结论得再跑两轮，或者把分母做大。
- **「真·误问」1/7 两轮一样**，都是 A11（「用素材库那张图做参考，排两个镜头」直接调了 `ask_user`）。
  这句从 run5 起连着四轮误问，是它稳定的行为，**与 H1 无关**。
  值得单独说的是：run8 的「正文误问」是 **0/7**——七句不该问的用例里，
  一次「答完顺口一问」都没有（run7 是 3/7）。旧口径与新口径这一轮**重合**，都是 1/7。
- **参数首试 15/18 → 12/18**，`draft_shots` 的参数被拒从 7 涨到 17（见第 4 节）。
  逐条读了失败正文，**没有一条与 H1 有关**——是 `omni` 模式配 `text_to_video`（×5）、
  没配默认图片模型（×5）、以及 `"shots"` 当 JSON 字符串送来但不合法。
  与「该问不该问」不是一回事，但如实记。

### 选项质量（`judgeAskOptions`，走查当轮量出，按题）

| | run5 | **run8** |
|---|---|---|
| 选项集数 | 7 | **4** |
| 2–4 个 | 7/7 | **4/4** |
| 互不重复 | 7/7 | **4/4** |
| 至多一个推荐 | 7/7 | **4/4** |
| 有假选项的集 | 0 | **0** |
| 是非嵌套 | 0 | **0** |
| 取消型选项 | 1 | **0** |
| 内部标识符 | 0 | **0** |
| 标签过长 | 0 | **0** |
| 复读题目 | 1 | **0** |

**四个集全部干净，一处没扣**（run5 被扣过两处：一个取消型选项、一句复读题目）。
样本 4，只能说「这一轮没出现那几种毛病」，**不足以说「变好了」**。

## 2. 走查答了几张卡

`cardsAnswered` 全场 **6** 条：

| 类别 | run5 | **run8** | run8 落在哪几轮 |
|---|---|---|---|
| `question:chip`（点提问卡的选项） | 7 | **4** | A1、A3、A8、A11 各 1 |
| `question:typed`（在卡里自己打字） | 1 | **0** | —— |
| `question:continue`（按「继续 / 发送」） | 0 | **0** | —— |
| `spend:declined`（介入槽里的报价卡 → 拒绝） | 7 | **2** | A5 ×1、A8 ×1 |
| `spend-dialog:declined`（全屏确认框 → 取消） | 3 | **0** | —— |
| **`approval-irreversible:declined`（新支路）** | —— | **0** | **仍无样本**，见发现 ② |
| `editor-confirm:cancelled` | 0 | **0** | —— |
| `batch-preview:cancelled` | 0 | **0** | —— |
| **关掉设置面板**（`settingsPanelClosed`） | 0 | **1** | **A1 ×1 ← T-QA-28 连着四轮之后第一份样本** |

**答过卡的 5 轮全部继续到底**（`answeredTurnContinued`：A1 / A3 / A5 / A8 / A11 全 `true`）。

## 3. T-QA-28 终于有样本了：`start_model_setup` 的面板确实挂在那儿

A1 那一轮模型调了 `start_model_setup`（全场唯一一次），设置面板弹了出来，
**走查在等待循环里把它关掉了一次**（`settingsPanelClosed: 1`），然后这一轮继续跑完、
提问卡正常画出、选项点得动、回合继续。

这正是 T-QA-28 描述的那件事：**面板是模型开的，回合照常往下走，而没有任何人负责收它**。
走查替用户按掉了那颗关闭钮（`7dba9b094` 加的补丁），所以这一轮没有卡死——
**但那是走查的补丁，不是产品的答案**。真人也会顺手关掉，所以它不是死锁；
**产品侧「谁在回合结束时收掉这个应用级模态」仍然是空的**。
连着四轮没样本之后，这是第一份真机证据。**本轮没有动产品代码。**

## 4. 工具 × 错误（`node scripts/agent-trajectory-report.mjs`，全 18 轮）

| Tool | run8 Calls | run8 Arg rej. | run8 Domain fail | run8 Retries | run5 Calls | run5 Arg rej. | run5 Domain fail | run5 Retries |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| draft_shots | 33 | **17** | 10 | 16 | 30 | 7 | 15 | 9 |
| look_at_canvas | 15 | 0 | 0 | 0 | 14 | 0 | 0 | 0 |
| list_models | 12 | 0 | 0 | 0 | 12 | 0 | 0 | 0 |
| read_script | 9 | 0 | 0 | 0 | 8 | 0 | 0 | 0 |
| **ask_user** | **4** | **0** | **0** | 0 | 7 | 0 | 0 | 0 |
| look_at_media | 4 | 0 | 1 | 0 | 6 | 0 | 2 | 1 |
| arrange_canvas | 3 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| write_script | 3 | 0 | 0 | 0 | 3 | 0 | 0 | 0 |
| generate | 2 | 0 | 0 | 0 | 10 | 0 | 3 | 2 |
| check_job | 1 | 0 | 0 | 0 | 5 | 0 | 0 | 0 |
| read_timeline | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| **start_model_setup** | **1** | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| make_artifact | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 |
| nomi_request_tools | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| delete_from_canvas | 0 | 0 | 0 | 0 | 1 | 0 | 1 | 0 |

合计：run8 **88 次调用 / 17 次参数被拒 / 11 次领域失败 / 16 次重试**，坏行 0，零空轮。

- **`ask_user` 仍然 0 领域失败**（D4 改动二连着四轮成立），**也 0 参数被拒**——
  run7 那次 `recommended` 写在题层被整次拒掉（T-QA-31）**这一轮没有复发**。
  只出现过一次，不等于问题不在；T-QA-31 照旧挂着。
- **`draft_shots` 的参数被拒 7 → 17**，是这一轮最难看的一格。失败正文 Top-5：

| 正文（截断） | 次数 |
|---|---:|
| `generation_input_invalid` · Video mode omni does not go with taskKind text_to_video on this model. | 5 |
| `generation_input_invalid` · 没有配置可用的图片模型。请在设置里选一个默认图片模型… | 5 |
| `draft_shots has failed the same way # times in a row.`（熔断） | 4 |
| `draft_shots was called with arguments its contract rejects.` | 3 |
| `generation_input_invalid` · Video mode omni is a image_to_video mode, but this shot asks for text_to_video. | 2 |

  「没配默认图片模型」那 5 次正是 A1 里 `start_model_setup` 被调起来的直接原因——
  模型撞了几次之后自己去开设置面板了。这条因果链在轨迹里看得很清楚。

## 5. 发现

### ① H1 的验收格动了，但**不足以下结论**

「以问代做」3/11 → 1/11。这是 H1 唯一瞄准的行为：
`ask_user` 的 `notWhen` 末句原本只禁止「沉默地停住」，而模型做的是
「在正文里写一段问句然后停住」，字面上不违反任何一条。

run5 的三句（A2 / A9 / A6）在 run8 里有两句改成了**先做**：
A2「把这个改好看点」直接 `read_script → write_script` 改完，
A6「加个镜头」一路 `draft_shots` 建了草稿。只剩 A9「把开头改一下」还在原地问。

**必须一起说的**：
- 分母 11、单轮对单轮，3→1 在二项噪声里；
- 同一轮「该问时问了（按调用）」**一格没动**（3/11），也就是说**少掉的那两句没有改走 `ask_user`，
  是改成「不问，直接做」了**。这对 H1 是好事还是坏事，要看那两句本来该不该问——
  A2 / A6 在用例表里 `shouldAsk=true`，**所以严格讲这两句是从「问错地方」变成了「该问没问」**；
- 「模型自己认为该问」9/11 → 8/11 与此一致。

**换句话说：H1 之后正文里的问句少了，但用户拿到卡的次数没变多。** 这一格要真的抬起来，
得回到 run7 发现 ① 那条路（T-QA-31：模型问对了地方却被 schema 拒掉），而不是继续压正文。

### ② T-QA-29 的新支路**连着两轮没样本**——A4 这一轮根本没调 `delete_from_canvas`

A4「把那个删了」这一轮只用了 11.5 秒、一次 `look_at_canvas`，然后在正文里问了一句
（判为「答完顺口一问」）。**它没有调 `delete_from_canvas`，所以不可逆审批卡没有出现。**

- run5 / run6：A4 调了 `delete_from_canvas` → 卡出现 → 没人答 → 整轮停 20.6 分钟；
- run7：A4 没跑到模型；
- run8：A4 跑到了模型，但**选择先问而不是先删**。

支路（`190c1a88b`）照旧**未经真卡验证**。它照抄的是同一套 DOM 的报价卡支路，
而报价卡支路这一轮**真的跑通了两次**（A5、A8 的 `spend:declined`），
所以那套 `slot-dismiss → confirm-reject` 的两步走法本身是活的——
但「`approval-irreversible` 这张卡是不是也长这样」仍然只有读源码的把握，没有跑通的证据。

### ③ T-QA-28 第一份真机样本（见第 3 节）

`start_model_setup` 连着四轮没被调到，这一轮终于撞上了。走查替用户关掉了面板、回合继续。
**产品侧的 owner 仍然是空的。**

### ④ `draft_shots` 参数被拒翻倍（7 → 17），与反问无关但值得单记

两族占了 10 次：`omni` 模式与 `taskKind` 对不上（5）、没配默认图片模型（5）。
后者还把模型逼去开了设置面板（第 4 节末）。
`"shots"` 当 JSON 字符串送来但不合法这一族仍在（2 次，断点是 `세` 和 `和省时间不同得`
这种**明显被截断的乱码**）——run5 / run7 各 4 次，看上去是流式输出被截断，不是模型写错结构。
**三轮都有，建议单独立一条。** 本轮没有动产品代码。

## 6. 这份证据里有什么

- `report.json` —— 走查原样落盘的那一份（`sourceSha: 8847a35ed`）。
  这一份的分母**已经全部统一到有效轮**（`f21063260`），不再有 18 / 9 两种分母并排的问题。
- `trajectories/<caseId>.jsonl` + `_matrix.json` —— 每一次调用的入参 / 返回 / 错误分类 / 第几次重试。
- `responses/<case>.md` —— 模型自己写的正文，逐字，18 份，脚本抄的
  （`tests/ux/askback-responses.mjs`）。头部印了第二档的判定与依据
  （以问代做 / 顺口一问 · 调过写类工具 · 正文即答案 · 待选摆在问句之后）。
- 截图在 `tests/ux/shots/askback-real-model/ask-run8/`（不入 git）：
  `A1/A3/A8/A11-question-card.png`、`A5/A8-spend-card.png`、
  `A1/A3/A5/A8/A11-after-answer.png`，以及 `evidence/agent-sessions/`（原始 lane transcript）。

复算命令：

```
node scripts/agent-trajectory-report.mjs \
  docs/evidence/2026-09-22-askback-real-model-run8 \
  docs/evidence/2026-09-22-askback-real-model-run5 --label run8,run5
```

把 run5 按新判据离线重算（第 1 节那两行的来源）：

```
node -e "
import('./tests/ux/askback-option-judges.mjs').then(({judgeProseQuestion})=>{
  const fs=require('fs'), base='docs/evidence/2026-09-22-askback-real-model-run5';
  const r=JSON.parse(fs.readFileSync(base+'/report.json','utf8'));
  for (const c of r.cases) {
    const segs=fs.readFileSync(base+'/responses/'+c.id+'.md','utf8')
      .split(/^## 第 \d+ 段\$/m).slice(1).map(s=>s.trim()).filter(Boolean);
    const j=judgeProseQuestion(segs,{toolCalls:c.toolCalls||[]});
    if (c.shouldAsk && j.askedInsteadOfActing) console.log('以问代做', c.id);
  }
});"
```

## 7. 建议

1. **H1 的那一格动了但没被证明**（3/11 → 1/11，单轮）。要么再跑两轮同样的 18 句看它稳不稳，
   要么先承认「正文提问变少了、但用户拿到卡的次数没变」这个组合，
   把力气挪到 **T-QA-31**（模型问对了地方却被 schema 整次拒掉）——那一条才直接决定用户看不看得见卡。
2. **A2 / A6 这两句要复核**：它们从「在正文里问」变成了「不问直接做」，
   而用例表里它们是 `shouldAsk=true`。是 H1 压过头了，还是这两句本来就该被改判成「不该问」
   （A11 在 run3 就被改判过一次）？**这是用例表的问题，不是模型的问题，需要主会话定。**
3. T-QA-29 的支路连着两轮没样本。要拿到它得让 A4 真的走到 `delete_from_canvas`——
   可以考虑在用例表里补一句更明确的删除指令，或者接受它是低频路径。
4. T-QA-28 有样本了，可以定 owner 了（第 3 节）。
5. `draft_shots` 那两族参数错（`omni`/`taskKind` 对不上、没配默认图片模型）三轮都在，建议单独立条。
