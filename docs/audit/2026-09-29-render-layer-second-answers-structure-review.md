# src/workbench 渲染层「另给一个答案」的结构评审

> 状态：已完成（2026-09-29）。触发：`check:symptom-cluster` 报 `src/workbench` 7 天内第 38 份以上根因合同（本分支加了 2026-09-29 退役卡够不着、模型框漏翻两份）。
> 对应合同：`docs/fixes/2026-09-29-retired-model-card-reachable.root-cause.json`、`docs/fixes/2026-09-29-model-box-label-translation.root-cause.json`。
> 姊妹评审：`docs/audit/2026-09-29-src-config-model-identity-structure-review.md`（同一分支在 `src/config` 触发的那一簇）。

`src/workbench` 模块粒度太粗，7 天几十份合同这个数字本身说明不了哪一层有问题。本评审只看与这两份合同相关的两层。

## 一、请求出门前的把关：替执行侧先回答了一个不归它管的问题

**观察。** 「节点钉的那一行现在怎么了」是一个事实，执行侧 `electron/catalog/executableModel.ts::findExecutableModel` 早就三分（整条不在 = 已退役 / 在但停用 = 未配置 / 在但类型不符），并各配了动作。2026-09-09 为了「供应商断开时不许静默换家」，渲染层 `src/workbench/generationCanvas/runner/catalogTaskResolve.ts` 在请求出门前加了一句一律抛出的「供应商断开」——它本意只回答自己的问题（这家断了、给恢复路），却顺带把执行侧的三分截成了一种。于是 Imagen 4、Sora 2 两次退役的旧节点都够不着设计好的退役卡。紧接着，分类器 `src/workbench/observability/classifyError.ts` 又把我们自己的退役签名当「服务商原话」印了出来。

这两处是同一个结构模式：**渲染层在执行侧已经有答案的问题上，另写了一个答案**（一个在请求前抢答，一个在展示时误标来源）。

**结构裁决。**

- 请求前的把关只回答渲染层自己的问题：钉死的那家断了 / 行还在但用不了 → 明确的恢复路；行整条不在 → 不抢答，交执行侧唯一判定。
- 两层对「行不在」的判据逐条同序，由 `electron/catalog/retiredRowParity.test.ts` 在同一份落盘目录上对等核对（五种单边漂移的变异全部抓红）。
- 分类器对所有**我们自己**的签名（退役、类型不符、缺文本大脑、NOMI_ERR 码）一律不进「服务商原话」框。
- 错误卡的主 / 次动作都写在 `src/workbench/observability/narrate.ts::ACTION_BY_KIND` 这一张穷举表里（2026-09-29 起次动作不再在函数里按规则现算）；已下线这一类不摆「仍要重试」，正文不替下线编原因。

**是否需要先做结构改造。** 这一层不需要：出口只有一个（`resolveExecutableNodeFromCatalog` 只被 `runCatalogGenerationTaskWithFeedback` 调用），收窄后已由对等棘轮钉住。

## 二、模型框的展示层：显示名漏翻

**观察。** 模型框的行数据由 `src/workbench/common/useDedupedModelSelect.ts` 拼出来，供应商名在这里走了 `translateModelDisplayText`，模型名却直接用目录的中文原名，英文界面就出现「Gemini 3 Pro 图像」「可灵 3.0」。更早的 `src/config` 那一层不能翻——那里的 label 是身份的输入。

**结构裁决。** 显示名的出处收成一个（`modelDisplayLabel`），与供应商名同一个文件、同一张翻译表；设置区（`src/workbench/settings/modelBoxOrder.ts`）把行名函数当必填参数注入。身份不随语言变，由测试钉住。

**是否需要先做结构改造。** 不需要：所有模型框宿主本来就从这一层拿行数据。

## 评审中看到、但不属于这两份合同的结构缺口（已报协调会话，记待办）

节点的失败状态（`status: 'error'` + `error`）不记录它是哪个模型 / 哪家跑出来的；换了模型以后旧失败仍挂在节点上，`src/workbench/generationCanvas/nodes/useNodeModelAutoSelect.ts` 的换家 toast 会拿旧失败的原因去说新选的那一家（真机走查实拍：Sora 节点换成 Seedance 2.5 · fal 后弹「[fal]：这个模型已经下线了…切到 Kie.ai」）。这是「失败归属于产生它的身份」这条不变量没有 owner，任何失败都会这样。

## 防回

`check:root-cause-contracts` / `check:door-map` 管合同与门表；`retiredRowParity` 管渲染层与执行侧的退役判据同序；`classifyGenerationError.test` 逐类钉住主 / 次动作；`useDedupedModelSelect.test` / `modelBoxOrder.test` 管显示名跟着语言走、身份不动；`check:symptom-cluster` 在同一层再聚到第三份时要求重新评审。
