# 渠道行并进模型身份 + Sora 2 退役（方案与验收记录）

状态：**✅ 已实施，待合入**（分支 `claude/model-identity-merge`；本文件按 R4 / R5② 补齐方案侧记录，实施前的取舍均已由协调会话逐条拍板）

---

## 1. 背后逻辑与摩擦（D6）

**用户卡在哪。** 同一个模型经不同渠道接进来，模型框里列好几次：Seedance 2.5、「Seedance 2.5 · fal」、「Runway Seedance 2.5」……用户分不清这是三个模型还是一个模型的三家，也不知道该点哪一条。另一头，OpenAI 于 2026-09-24 关停了 Sora 2，但 APIMart / RunningHub 的 Sora 2 还在模型框里，选了每次都失败；而旧项目里存着 Sora 2 的节点，点生成只拿到一句「模型未配置」，看不出该换模型。

**这次做了什么。**
- 渠道行（fal / Runway 转售的别家模型）在身份表里写上模型本身的身份，同一个模型只列一次，渠道变成那一行尾巴上的 chip。
- **默认走哪家一律不变**：合并后没排过供应商顺序的用户，默认家与合并前逐一相同；会让部分用户默认家换人的两条（fal 的 GPT Image 2、Kling V3 Pro）不并（2026-09-29 协调会话裁决 B）。
- Sora 2 退役：目录里摘掉，旧节点点生成落「这个模型已经下线了」+「换个模型」。
- 顺手：退役卡够不着（2026-09-09 起的回归）、退役卡正文 / 次按钮、英文模型框模型名漏翻、nano-banana-pro 档案归属、Muse Image 出品方。

**用户要权衡的核心点：** 「下拉里少几行」和「默认花钱的那家会不会悄悄换人」之间，永远选后者不变——所以宁可留两行不并。

---

## 先查别人

检索方式：依赖与仓库本次实查（file:line）；生态条目引用仓内已有的实查记录（记录里写明了当时的检索日期与方式），本次按任务书不上网、未重新复核。

- **依赖里已有？（跨供应商同一模型的身份）没有。** Vercel AI SDK 4.3.19 只按 `providerId:modelId` 寻址：`createProviderRegistry`（node_modules/ai/dist/index.d.ts:4253）、`customProvider`（node_modules/ai/dist/index.d.ts:4210），没有「同一个模型挂在多家」的概念 → 身份只能在我们自己的目录里声明。
- **依赖里已有？（数据标签的翻译）没有现成的。** i18next 的 `t()` 翻的是 key，目录 `labelZh` 是数据；仓里现成的做法是 `translateModelDisplayText`（src/i18n/modelDisplayText.ts:4，表在 src/i18n/locales/modelDisplayText.ts:381），Agent 面板（src/workbench/ai/assistantModelIdentity.ts:87）和接入页（src/ui/onboarding/ModelChipGroups.tsx:89）早就在显示时调它 → 模型框复用，不另建。
- **仓库里已有？（身份）** `CANONICAL_MODEL_IDS`（electron/catalog/seedModelIdentity.ts:36）已是跨供应商同一模型的唯一声明处；本次只往表里补渠道行，不新建机制。
- **仓库里已有？（默认家）** `vendorTier` / `compareVendorLanding`（electron/shared/contracts/vendorPreference.ts:43）是渲染层与执行侧共用的唯一比较子；Agent 的 `list_models` 原样按它排（electron/agentLane/laneModelRead.mts:74）——这就是裁决 B 不动这把尺的依据。
- **仓库里已有？（退役）** Imagen 4 退役先例：退役清单 electron/catalog/seedBuiltins.ts:374、prune electron/catalog/seedBuiltins.ts:569（commit 6938c408d）；执行侧「记录整条不在 = 已退役」的判据 electron/catalog/executableModel.ts:31。Sora 2 照抄这套，不新造。
- **生态里已有？（一个模型多家供应商、默认顺序）** OpenRouter：一个模型名下多家 provider，`provider.order` 显式排序，用户显式顺序永远赢（https://openrouter.ai/docs/guides/routing/provider-selection ，仓内实查记录 docs/plan/2026-09-06-vendor-preference-auto-fallback.md:33）；sticky routing 记住上次那家但不压过显式顺序（https://openrouter.ai/blog/tutorials/prompt-caching-sticky-routing/ ，docs/plan/2026-09-11-model-box-tidy.md:27）→ 与本方案「用户排序 > 分级表 > 目录原序」同构，合并只动显示、不动这条顺序。
- **生态里已有？（隐藏 vs 停用）** Open WebUI 把 Hide（个人不想看见）和 Enabled（对所有人停用）分成两层（https://docs.openwebui.com/features/workspace/models/ ，docs/plan/2026-09-11-model-box-tidy.md:26）→ 退役走「目录摘行」而不是「替用户隐藏」：退役是所有人都用不了的事实，不是个人偏好。
- **生态里已有？（出品方事实）** Muse Image 是 Meta 的模型（https://ai.meta.com/blog/introducing-muse-image-muse-video-msl/ ，记在 electron/shared/modelArchetypes/runwayNativeImage.ts:182）；nano-banana-pro 是 Gemini 3 Pro Image 的别名（https://docs.apimart.ai/en/api-reference/images/gemini-3-pro/generation.md ，记在 electron/shared/modelArchetypes/runwayNativeImage.ts:260）。
- **TikHub 自媒体里怎么说？** 本题未查（按任务书不上网）。Sora 2 关停的事实来自用户拍板时给的 OpenAI 官方文档原文，本机未联网复核。
- **结论：全部用已有。** 身份表、比较子、退役清单、翻译表都是现成的；自研只有两个薄层——渲染层「行不在就不抢答」（配一份两层对等棘轮 electron/catalog/retiredRowParity.test.ts）和模型框显示名函数 `modelDisplayLabel`。

---

## 2. 概念占用表（R33）

| 碰到的概念 | 唯一 owner | 允许谁消费 |
|---|---|---|
| 跨供应商同一模型的身份 | `electron/catalog/seedModelIdentity.ts::CANONICAL_MODEL_IDS` | 目录对账写进 `meta.canonicalModelId`；`src/config/modelIdentity.ts` 只读 |
| 同一模型先走哪家 | `electron/shared/contracts/vendorPreference.ts::compareVendorLanding`（本次不改） | 模型框排序、执行侧回落、Agent 模型清单 |
| 目录里有哪些 curated 行（含退役） | `electron/catalog/seedBuiltins.ts::applyBuiltinSeeds` | 所有读目录的地方 |
| 「这一行退役了没有」 | `electron/catalog/executableModel.ts::findExecutableModel` | 渲染层只做「行不在就不抢答」，由对等棘轮钉住同序 |
| 错误卡的主 / 次动作 | `src/workbench/observability/narrate.ts::ACTION_BY_KIND` | `NodeErrorReport` 按它摆按钮 |
| 模型框里模型的显示名 | `src/workbench/common/useDedupedModelSelect.ts::modelDisplayLabel` | 所有模型框宿主、设置区行名 |

没有让任何概念多出第二个 owner：渲染层原来那句「一律供应商断开」是第二个答案，本次收窄成「不抢答」。

---

## 3. 范围与不动项

- **做：** 渠道行身份（fal / Runway）、分档跟着模型走、Muse Image 归 Meta、nano-banana-pro 归 Gemini 3 Pro Image、Sora 2 两家退役（含档案删除、生成表重生成）、退役卡可达 + 文案 + 次按钮、英文模型框显示名。
- **不动：** `vendorTier` 分级（裁决 B）；fal 的 GPT Image 2 / Kling V3 Pro、Runway 的 Seedance 2 / Veo 3.1 变体行、Runway Seed Audio 都不并（理由写在 `src/config/modelIdentity.channelMerge.test.ts` 的待定名单）；模型框偏好不迁移；提示词库里的 Sora 合集与自建模型的类型关键词保留。
- **记待办、这次不做：** 节点换了模型后旧失败仍挂着、换家 toast 把旧失败安到新选的那家头上。

---

## 4. 验收门（实际结果）

- 默认家不变：`src/config/modelIdentity.channelMerge.test.ts` 对每个合并组、每种「接了哪几家」的组合逐一比对合并前后默认家（全部相同）。
- 退役：`electron/catalog/seedBuiltins.test.ts`（新装机不种、老装机摘掉、幂等、用户同名自建不受影响）；`electron/catalog/retiredRowParity.test.ts`（渲染层不抢答 ⇔ 执行侧 Model is retired）。
- 变异校验：每条新判据都做过「改回旧行为必红」，见各根因合同的 generality_proof。
- 真机走查：`node scripts/model-identity-walkthrough.mjs`（临时 user-data、占位钥匙、主进程网络闸只放行本机，零供应商调用），中英两种界面，截图在 `.model-identity-walk/`。

## 5. 回滚

按提交逐个 revert 即可；身份表与退役清单都是纯声明，revert 后下次启动对账回到原样（被摘掉的 Sora 2 行会由 curated 源重新种回）。不涉及数据迁移，用户的项目与偏好一个字不改。
