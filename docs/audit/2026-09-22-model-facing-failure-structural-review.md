# 结构评审 · 「一次失败对模型说什么」这一层（`electron/capabilityCore` / `electron/shared`）

- 触发：`check:symptom-cluster` —— `electron/capabilityCore` 在 2026-09-17 到 2026-09-22 的 7 天里收到 34 份根因合同，`electron/shared` 33 份。第三份合同是「这一层结构不对」最便宜的证据，不是再修一次的理由。
- 范围：本文只评审**「一个抛出来的异常，怎么变成模型看得见的那句话」**这一条链，以及它的挑选规则。两个簇里其余合同（分镜账本、画布落地、目录与接入、MCP 投影…）不在本文证据范围内。
- 证据来自 2026-09-21 真实模型 18 句实测（`docs/evidence/2026-09-21-askback-real-model/`，121 次调用全量 JSONL）与 2026-09-22 的复现（`electron/capabilityCore/generationDomainRefusalReachesModel.test.ts`，入参逐字取自 A3.jsonl seq=25），不是读码推断。

## 一、这一层今天真正的形状

一次失败要走三段路才到模型眼前：

```
域里 throw ──①──> adapter 的 safeFailure ──②──> laneFailureFromDecision ──③──> 模型读到的那段英文
   （谁写的这句话？）      （码 + 正文怎么取）        （措辞按什么选）
```

三段各有一个 owner 的问题，而它们**各自都不报错**：

| # | 语义 | 主人（今天） | 第二个答案 | 后果（实测） |
|---|---|---|---|---|
| 1 | 「异常 → 模型看得见的失败」 | 本该只有一处 | **8 份手写副本**（canvasRead / canvasWrite / documentRead / documentWrite / generation / phase4Surface / productionRun / timeline），四种写法、三种 message 处置 | 每一份都把 `error.message` 丢掉。2026-09-18 那次只修了 generation 一份（让 schema 字段级理由活下来），另外 7 份至今照旧。 |
| 2 | 「这句话是谁写的」 | 没有主人 | 靠**看起来像不像内部信息**来猜，于是只能一刀切全丢 | `参考素材 gen-v2-asset-… 不在这个项目的素材库里，请先用 look_at_media 找到它的 assetId` —— 一句模型改一次就能对的话，和供应商的原始报错一起被扔掉。 |
| 3 | 「一条参考素材的身份怎么补齐」 | `mcpGenerationTools.pinReference` | `semanticGenerationCandidate.references`（create 走它，patch 走前者） | 逐字相同的两段，连那句中文提示都抄了一遍。我改了其中一份，回归测试当场报出另一份还在——**测试是唯一发现它的东西**。 |
| 4 | 「这次调用有没有可能已经提交过」 | 动词声明的 `effect × nextAction` | 失败措辞表按 **code** 挑了一句话 | `generation_execution_failed` 对 `generate` 成立（全自动档会当场开跑），对 `draft_shots` 是**假话**。实测 23 次把「结果可能未知、先去核对别再提交」发给了一个一分钱都花不出去的起草工具，模型照做，A3 那一轮 27 次调用 / 696 秒。 |

## 二、判断：是不是结构问题

**是，而且是同一句话的四个长相**：*一个语义没有主人，于是每个需要它的地方各自重新回答一遍，而重新回答不会报错*（与 `memory` 里 09-18「958 个声明过的 owner 没人核」、与 09-21 付费确认那份评审的结论同形）。

这一次多出来一个值得单独记的变体：**#4 不是重复实现，是判据挂错了轴**。措辞按「码」挑，而措辞的真假取决于「哪个工具」。两个轴在大多数格子里恰好一致，于是它能安静地活很久；只有真实模型在那唯一不一致的格子里反复撞上去，才把它撞出来。**句法级的门岗看不见这种错**——两边都是合法代码，没有重复的字符串，没有漂移的基线。

## 三、本轮做掉的（`docs/fixes/2026-09-22-domain-refusal-becomes-unknown-outcome.root-cause.json`）

1. #1 收成一份：`electron/capabilityCore/transportFailure.ts` 的 `safeTransportFailure`，8 条传输路全部委派给它（door-map：9 扇门，同一个函数）。
2. #2 换成显式的类型区分：`ModelFacingRefusal` —— 判据从「像不像内部信息」换成「**谁写的这句话**」，后者有单一答案。同时把「`error.code` 可能来自上游」与「`classify` 是我们自己认的」分开，`generation_operation_not_found` 这类码不再能被异常自称（C18 在本次实测里真的红过一次）。
3. #3 收成一份：`pinAssetReference`。
4. #4 判据挪到 owner：`verbMaySubmitGeneration(effect, nextAction)`，措辞按动词声明派生；认不出的工具名 fail-closed 到「可能提交过」。

## 四、没做掉的 / 下一刀（不在本轮）

1. **phase4 的域侧还没有一处用 `refuseToModel`**：`look_at_media` 那 3 次 `capability_execution_failed` 仍然只有码没有正文。管道已通，内容是下一刀。
2. **`LANE_TOOL_OWN_FAILURE_CODE_LIST` 里没有 `generation_input_invalid`**：面板对这个码落到 `unknown` 那一条（本语言的一句人话 + 码本身，不是英文散文），可接受但不理想。补一条词条即可，属渲染层 lane。
3. **「第三段路的措辞」今天没有任何机器核它说的是不是真话**。#4 那一类（判据挂错轴）能不能做成门岗，值得单独想一轮：句法级门岗对它天然是瞎的，可行的方向是「每条措辞声明它依赖哪个事实，事实由 owner 派生」——本次 `verbMaySubmitGeneration` 就是这个形状的第一例。
4. 两个簇（`electron/capabilityCore` 34 份 / `electron/shared` 33 份）里其余合同没有在本文里被评审。**7 天 34 份本身就是一个该被单独看的数字**，但它需要的是一次横扫，不是一条链的评审。
