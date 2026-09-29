# 模型身份与退役卡两处聚簇的结构评审

> 状态：已完成（2026-09-29）。触发：`check:symptom-cluster` 报两处聚簇——`src/config` 7 天内第三份合同（2026-09-28 渠道行并进模型身份），`src/workbench` 7 天内第 38 份（2026-09-29 退役卡够不着）。
> 对应合同：`docs/fixes/2026-09-28-channel-model-identity-merge.root-cause.json`、`docs/fixes/2026-09-29-retired-model-card-reachable.root-cause.json`。

## 一、src/config：三份合同是同一个模式在收尾，不是同一个洞在反复漏

`src/config` 这 7 天的三份合同都落在 `src/config/modelIdentity.ts`：

| 合同 | 那条规则原来住哪 | 修完住哪 |
|---|---|---|
| 2026-09-22 vendor-connection-identity | 连接身份（vendorKey 怎么来）散在 6 个调用点，渲染层也各认一份 | `electron/catalog/connectionVendorKey.ts` |
| 2026-09-22 vendor-landing-one-owner | 供应商排序：渲染层在 `modelIdentity.ts` 自己排、主进程用契约里只做一半的函数 | `electron/shared/contracts/vendorPreference.ts`（两侧 import 同一个文件，渲染层只 re-export） |
| 2026-09-28 channel-model-identity-merge | 跨渠道同一模型的身份：没声明的行靠 `deriveCanonicalModelId` 回退到带渠道名的 `labelZh` | `electron/catalog/seedModelIdentity.ts` 的 `CANONICAL_MODEL_IDS`（渠道行必须显式填） |

**观察。** `src/config/modelIdentity.ts` 是一个**消费方**模块（把目录行收成下拉里的一条），却因为「画下拉要用」顺手长出了三条本该属于目录 / 跨进程契约的规则。三次修复的方向一致：规则搬回它自己的家（`electron/catalog`、`electron/shared/contracts`），渲染层只读。这是同一个结构问题在被逐条清偿，不是同一个缺口反复复发。

**结构裁决。**

- 连接身份、供应商排序、模型 canonical 身份，这三条的 owner 现在都不在 `src/config`；`modelIdentity.ts` 只负责「按已声明的身份分组 + 用同一把尺排组内供应商」。
- 仍然留在渲染层的判据只有一条：没有声明身份的行，`deriveCanonicalModelId` 回退到 `normalizeModelLabel(labelZh)`。这条**必须留**——用户自建渠道的行没有任何人替它声明身份，按名字归组是唯一合理的默认；但对 curated 行，它已经被 `check:model-identity` 的基线棘轮管住（2026-09-28 锁定为 0 条未声明的渠道行，只减不增）。

**是否需要先做结构改造。** 不需要。剩下的风险不在 `src/config` 的结构，而在「新接一个渠道时有没有人填身份表」，这一点已由基线门岗在最早一层拦住。后续若再有规则想住进 `modelIdentity.ts`，先问它的读者跨不跨进程——跨就住 `electron/shared`。

## 二、src/workbench：渲染层替执行侧先回答了一个不归它管的问题

`src/workbench` 7 天 38 份合同，模块粒度太粗，数字本身说明不了哪一层有问题。本次只评审与这份合同相关的那一层：`src/workbench/generationCanvas/runner` 在请求出门前的把关。

**观察。** 「节点钉的那一行现在怎么了」是一个事实，执行侧 `electron/catalog/executableModel.ts::findExecutableModel` 早就三分（整条不在 = 已退役 / 在但停用 = 未配置 / 在但类型不符），并各配了动作。2026-09-09 为了「供应商断开时不许静默换家」，渲染层 `catalogTaskResolve.ts` 在请求出门前加了一句一律抛出的「供应商断开」——它本意只回答自己的问题（这家断了、给恢复路），却顺带把执行侧的三分截成了一种。于是 Imagen 4、Sora 2 两次退役的旧节点都够不着设计好的退役卡。紧接着，分类器 `src/workbench/observability/classifyError.ts` 又把我们自己的退役签名当「服务商原话」印了出来。

这两处是同一个结构模式：**渲染层在执行侧已经有答案的问题上，另写了一个答案**（一个在请求前抢答，一个在展示时误标来源）。

**结构裁决。**

- 请求前的把关只回答渲染层自己的问题：钉死的那家断了 / 行还在但用不了 → 明确的恢复路；行整条不在 → 不抢答，交执行侧唯一判定。
- 两层对「行不在」的判据逐条同序，由 `electron/catalog/retiredRowParity.test.ts` 在同一份落盘目录上对等核对（五种单边漂移的变异全部抓红）。
- 分类器对所有**我们自己**的签名（退役、类型不符、缺文本大脑、NOMI_ERR 码）一律不进「服务商原话」框。

**是否需要先做结构改造。** 这一层不需要：出口只有一个（`resolveExecutableNodeFromCatalog` 只被 `runCatalogGenerationTaskWithFeedback` 调用），收窄后已由对等棘轮钉住。

**评审中看到、但不属于这份合同的结构缺口（已报协调会话）。** 节点的失败状态（`status: 'error'` + `error`）不记录它是哪个模型 / 哪家跑出来的；换了模型以后旧失败仍挂在节点上，`src/workbench/generationCanvas/nodes/useNodeModelAutoSelect.ts` 的换家 toast 会拿旧失败的原因去说新选的那一家（真机走查实拍：Sora 节点换成 Seedance 2.5 · fal 后弹「[fal]：这个模型已经下线了…切到 Kie.ai」）。这是「失败归属于产生它的身份」这条不变量没有 owner，任何失败都会这样，建议作为单独一条排期。

## 防回

`check:root-cause-contracts` / `check:door-map` 管合同与门表；`check:model-identity` 管 curated 渠道行必须显式声明身份；`retiredRowParity` 管渲染层与执行侧的退役判据同序；`check:symptom-cluster` 在同一层再聚到第三份时要求重新评审。
