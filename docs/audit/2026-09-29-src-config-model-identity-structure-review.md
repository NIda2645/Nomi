# src/config 模型身份聚簇的结构评审

> 状态：已完成（2026-09-29）。触发：`check:symptom-cluster` 报 `src/config` 7 天内第三份根因合同（2026-09-28 渠道行并进模型身份）。
> 对应合同：`docs/fixes/2026-09-22-vendor-connection-identity.root-cause.json`、`docs/fixes/2026-09-22-vendor-landing-one-owner.root-cause.json`、`docs/fixes/2026-09-28-channel-model-identity-merge.root-cause.json`。
> 姊妹评审：`docs/audit/2026-09-29-render-layer-second-answers-structure-review.md`（同一分支在 `src/workbench` 触发的那一簇）。

## 三份合同是同一个模式在收尾，不是同一个洞在反复漏

`src/config` 这 7 天的三份合同都落在 `src/config/modelIdentity.ts`：

| 合同 | 那条规则原来住哪 | 修完住哪 |
|---|---|---|
| 2026-09-22 vendor-connection-identity | 连接身份（vendorKey 怎么来）散在 6 个调用点，渲染层也各认一份 | `electron/catalog/connectionVendorKey.ts` |
| 2026-09-22 vendor-landing-one-owner | 供应商排序：渲染层在 `modelIdentity.ts` 自己排、主进程用契约里只做一半的函数 | `electron/shared/contracts/vendorPreference.ts`（两侧 import 同一个文件，渲染层只 re-export） |
| 2026-09-28 channel-model-identity-merge | 跨渠道同一模型的身份：没声明的行靠 `deriveCanonicalModelId` 回退到带渠道名的 `labelZh` | `electron/catalog/seedModelIdentity.ts` 的 `CANONICAL_MODEL_IDS`（渠道行必须显式填） |

**观察。** `src/config/modelIdentity.ts` 是一个**消费方**模块（把目录行收成下拉里的一条），却因为「画下拉要用」顺手长出了三条本该属于目录 / 跨进程契约的规则。三次修复的方向一致：规则搬回它自己的家（`electron/catalog`、`electron/shared/contracts`），渲染层只读。这是同一个结构问题在被逐条清偿。

## 结构裁决

- 连接身份、供应商排序、模型 canonical 身份，这三条的 owner 现在都不在 `src/config`；`modelIdentity.ts` 只负责「按已声明的身份分组 + 用同一把尺排组内供应商」。
- 仍然留在这一层的判据只有一条：没有声明身份的行，`deriveCanonicalModelId` 回退到 `normalizeModelLabel(labelZh)`。这条**必须留**——用户自建渠道的行没有任何人替它声明身份，按名字归组是唯一合理的默认；对 curated 行，它已经被 `check:model-identity` 的基线棘轮管住（2026-09-28 锁定为 0 条未声明的渠道行，只减不增）。
- 因为 label 仍是身份的输入，**显示名的翻译不许进这一层**：2026-09-29 英文模型框漏翻那次，修法就放在模型框的展示层（`src/workbench/common/useDedupedModelSelect.ts::modelDisplayLabel`），这里一个字不动（见合同 `docs/fixes/2026-09-29-model-box-label-translation.root-cause.json`）。

## 是否需要先做结构改造

不需要。剩下的风险不在 `src/config` 的结构，而在「新接一个渠道时有没有人填身份表」，这一点已由基线门岗在最早一层拦住。

**一条留给以后的约束：** 默认家的比较子（`vendorTier` / `compareVendorLanding`）同时排着 Agent 读的模型清单（`electron/agentLane/laneModelRead.mts` 的 `list_models` 原样交给模型）。2026-09-29 协调会话裁决 B：不为合并 fal 的 GPT Image 2 / Kling V3 Pro 给 fal / Runway 单开第 3 档——Agent 在没人看见的情况下换家花钱，比下拉里多两行糟得多。以后谁想动这把尺，先把 Agent 那一侧的顺序变化列出来。

## 防回

`check:model-identity` 管 curated 渠道行必须显式声明身份；`src/config/modelIdentity.channelMerge.test.ts` 管合并前后默认家不变、待定名单每一行都写了理由；`check:symptom-cluster` 在同一层再聚到第三份时要求重新评审。
