# 「接模型」这一层的结构评审：连接 → 凭据 → 自检 → 认证账本（2026-09-22）

> 状态：📎 结构评审（`check:symptom-cluster` 触发：`electron/integrationCertification` 与 `electron/providerAdapter` 两个模块 7 天内各有 3 份根因合同）
> 触发合同：[`2026-09-22-vendor-connection-identity`](../fixes/2026-09-22-vendor-connection-identity.root-cause.json)、[`2026-09-22-self-check-timeout-uncertain-remnant`](../fixes/2026-09-22-self-check-timeout-uncertain-remnant.root-cause.json)
> 同层近邻：[`2026-09-21-integration-session-cap`](../fixes/2026-09-21-integration-session-cap.root-cause.json)、[`2026-09-18-credential-destination-is-user-confirmed`](../fixes/2026-09-18-credential-destination-is-user-confirmed.root-cause.json)、[`2026-09-17-presigned-put-drops-signed-headers`](../fixes/2026-09-17-presigned-put-drops-signed-headers.root-cause.json)
> 方案正本：[`docs/plan/2026-09-22-vendor-connection-identity.md`](../plan/2026-09-22-vendor-connection-identity.md)

## 1. 这一层是什么

用户要用一个模型，中间隔着五步：**填地址和 Key（连接）→ 存下来并证明它能用（凭据）→ 真发一次请求看通不通（自检）→ 把「这条连接的这个模型验过了」记成账（认证账本）→ 发布进目录**。
`electron/integrationCertification` 管后三步（会话、账本、发布），`electron/providerAdapter` 管「说明卡 → 一次真实自检 → 终态」那一段，两者共用 `electron/catalog`（目录与凭据落盘）。对用户来说这是**一件事**：「我买的这把 Key 能不能用」。对代码来说它横跨三个目录——这正是五份合同的来处。

| 日期 | 合同 | 用户看到的症状 | 类根因 | 修在哪层 |
|---|---|---|---|---|
| 09-17 | presigned-put-drops-signed-headers | 传参考图 403 SignatureDoesNotMatch，像网络抖动 | 供应商自述的协议被写成我们代码里的常量 | `electron/catalog/assetLocalization.ts`（+ `ai/requestPipeline.ts:164` authHeaders） |
| 09-18 | credential-destination-is-user-confirmed | 一段对话文本就能把已存的 Key 改发到别的 host | 同源判据只在「收到说明卡」那一刻查过一次，看不见旧数据和后加的写入口 | `electron/vendor/vendorOutboundGuard.ts`（发送时）+ `catalog/catalogStore.ts:331` applyApiKeyUpsert（绑定时） |
| 09-21 | integration-session-cap | 双击 Nomi 没反应，1-2 秒后进程自己退出 | 「这份盘上状态能长到多大」没有 owner：读侧断言、写侧断言，增长侧不受任何约束 | `electron/integrationCertification/integrationSessionRecord.ts:115` |
| 09-22 | self-check-timeout-uncertain-remnant | 自检超时后停在 `reconciling`，不落 `timed_out` | 删旧删掉了行为（自动修复），没去翻它喂的那条判据（`isUncertainError`） | `electron/providerAdapter/service.ts` |
| 09-22 | vendor-connection-identity | 同域名加第二条连接，第一条的名字和 Key 被当场顶掉（issue #831） | 连接身份 = 域名；而域名派生的 key 同时又是全系统主键，于是「这是不是 apimart」被抄了十几份 | `electron/catalog/connectionVendorKey.ts` |

## 2. 结构诊断

### 2.1 先说一件不舒服的事：`electron/providerAdapter` 这一簇有一半是模块键的错

门岗按「scope_paths 的前两段」算模块。09-17 那份合同 15 条 scope 里只有 1 条是 `electron/providerAdapter/selfCheck.ts`，其余 14 条都在 `electron/catalog`；09-18 那份 14 条里 4 条落在 providerAdapter，owner 声明的却是 `electron/vendor/vendorOutboundGuard.ts`。
**所以 providerAdapter 这一簇里，真正属于本层的只有 09-22 那一份。**这和 `.github/workflows` 那次评审的结论同形（[2026-09-22-quality-gate-workflow-structure.md](./2026-09-22-quality-gate-workflow-structure.md)）：粗模块键会把「顺带改到」记成「又坏一次」。
`electron/integrationCertification` 那一簇不是误报——三份都真的动了这一层的状态、会话与身份。

### 2.2 真正共有的形状：同一句话在几个地方各说一遍

每份合同单独看都诚实。但把五份并排，共同点不是「哪个函数写错了」，而是**一句用户能听懂的话，代码里没有唯一的人负责回答**。

| 这句话 | 现在谁回答 | 门数（`door-map --roots=electron`） | 该由谁 owner |
|---|---|---|---|
| 「这次保存落在哪条连接上」 | `catalog/connectionVendorKey.ts:86` `resolveConnectionVendorKey`；host 步 `:58` 独占调 `deriveVendorKeyFromBaseUrl` | 派生 **1 扇写门**；识别 **4 扇读门**（connectionVendorKey:113 / httpModelDiscovery:24 / sessionVendorKey:14 / serviceCatalog:113） | `connectionVendorKey.ts`（本次立起来的） |
| 「这条 vendor 是不是某个内置家」 | `shared/builtinVendorIdentity.ts:104-135` | origin/main 上 **19 处裸字面量等值比较**（对 15 个内置 key 做 `===`/`!==`，剔除测试；其中 apimart 占 11 处，分布在 capabilityCore、onboarding、devlab 三处不同的判断里），今天由门岗锁到新增 0 | `builtinVendorIdentity.ts` + `check:builtin-vendor-literals` |
| 「自检超时算什么终态」 | `providerAdapter/service.ts` `finishTerminal`；`serviceRunLifecycle.ts:38` `planAdapterPromotionFinal` 算 `timed_out/failed/partial/completed` | `finishTerminal` **1 扇门、8 处调用**（service.ts:171/259/278/324/331/444/449/450）；`planAdapterPromotionFinal` 只被 service.ts:605 调 | `service.ts`（合同已声明，且今天确实只有它） |
| 「这份盘上状态能长到多大」 | `integrationSessionRecord.ts:115` `INTEGRATION_SESSION_BYTE_BUDGET` + `MAX_INTEGRATION_SESSIONS` | 修前：读侧一处断言、写侧一处断言、增长侧 0 —— **限制没人执行就不是限制** | `integrationSessionRecord.ts` |
| 「这把 Key 该发到哪个 host」 | `vendor/vendorOutboundGuard.ts:113` `authorizeSubmitDestination`（发送时）+ `catalogStore.ts:331`（绑定时，4 处调用） | 两半，两层各持一半，写在合同 `shared_boundaries` 里 | 发送时层 + 绑定时层，刻意不归 `validator.ts` |
| 「这次请求带哪些头、方案词写什么」 | `catalog/assetLocalization.ts:448` 读响应里的 `uploadHeadersPath`；`ai/requestPipeline.ts:164` 透传 `authScheme` | 各 1 处 | 供应商的响应/种子声明，**不是我们的常量** |

### 2.3 三条要纠正的直觉

- **「自检结果分类散在三处」——今天不成立。**`providerAdapterCoordinator.ts` 的 uncertain 分支已在本分支 `1d8182c17` 删掉（现存的只是 :487 那行说明注释），`serviceRunLifecycle` 是纯计划函数、唯一调用者是 `service.ts:605`。这条语义现在**已经只有一个 owner**。剩下的风险不是「几份定义」，而是那一个 owner 内部有 8 个写终态的点、没有任何门岗盯着它们保持一致。
- **「凭据探测有四份各自的策略」——也不成立。**「这把 Key 怎么验」早有 owner：`builtinVendorSeeds.ts:164` 的 `credentialValidationStrategy`，被 `validateCandidateCredential.ts:37` 与 `rendererCatalogMutation.ts:149` 共用；HTTP 探测本体只有一份 `ai/onboarding/modelListProbe.ts:147` `fetchModelList`，`vendorHealth.ts:27` 与 `validateCandidateCredential.ts:6` 都 import 它。`directKeyCredential.ts` 不共用是**刻意的**，理由写在文件头：apimart 对 `/v1/models` 回 401，拿可达性当有效性会造假阴性。
  真正没主人的是**另一句话**——「验这一下花不花钱」。这才是并行 lane `fix/credential-probe-free-20260922` 正在立的东西（新增 `catalog/credentialProbePolicy.ts` 78 行 + `credentialProbeConfirm.ts` 51 行）。
- **09-17 那份不完全是「多份定义」。**它的形状是「真相源在供应商那边，我们在自己代码里存了一份副本」。同属一个家族（副本会漂），但失败模式不同：它不会分叉，它会在**下一家**身上整个失效。合同自己判的 `one_off` 是对的，实扫了 8 条吞入通道、8 个 authHeaders 调用点、18 个种子。

## 3. 已经在收敛的

1. **连接身份立层**（本 PR）：`catalog/connectionVendorKey.ts` 成为「这次保存落在哪条连接上」的唯一 owner；origin/main 上 `deriveVendorKeyFromBaseUrl` 散在 6 个生产文件里被调（httpModelDiscovery / integrationSession ×3 / integrationCertification/service / providerAdapter/registration / providerAdapter/service / runtime 再导出），现在**收成 1 扇写门**，门岗禁止第二处 import。
2. **内置家识别立层**（本 PR）：`shared/builtinVendorIdentity.ts` + `check:builtin-vendor-literals`。实跑：扫 3911 个文件，新增违规 0，豁免 1 条（devlab 展示目录，已断言仍存在），债 2 条（`capabilityCore/generationProviderBootstrap.ts`、`src/ui/onboarding/ModelSettingsHome.tsx`，到期 2026-10-06，由 Core-A 打捞总合并统一收）。
3. **自检终态去死分支**（本 PR，`1d8182c17`）：删掉 coordinator 的 uncertain/reconciling 分支，超时回到干净的 `timed_out`。
4. **「验一下花不花钱」立层**（并行 lane `fix/credential-probe-free-20260922`，3 个提交、19 个文件）：免费优先 → 无免费则先问，接入页如实说费用，付费走全仓唯一那张确认卡。
   —— 第 4 条是本次评审最有说服力的旁证：**第三份合同出现之后，确实有人在做结构收敛，而不是再修一次。**同时它也是 [`parallel-lanes-split-concepts-before-merge`](../lessons/parallel-lanes-split-concepts-before-merge.md) 的活靶子：两条 lane 同时在 `electron/catalog` 立新 owner，合并那一刻才看得见有没有长出第二份。

## 4. 下一刀建议（按用户摩擦排序，D1）

**① 把兄弟连接的两条债清掉（最迟 2026-10-06，到期即红）。**
为什么这刀：#831 的用户今天装上修复版，加了第二条连接，**执行器仍然认不出它是 apimart**（`generationProviderBootstrap.ts:101/121` 还在比裸字面量），内置卡片也会把它显示成自定义。只影响新建连接，但那恰好就是报告人要做的事——摩擦没清干净。
动哪些文件：`electron/capabilityCore/generationProviderBootstrap.ts`、`src/ui/onboarding/ModelSettingsHome.tsx`，都改用 `builtinVendorIdentity`。
验收门：`check:builtin-vendor-literals` 的 `DEBT` 数组降到 0。

**② 合并 `fix/credential-probe-free-20260922` 时，把 `directKeyCredential` 的独立探测路径也指向新 owner。**
为什么这刀：那条路径今天会真发一次 `POST /chat/completions`（`directKeyCredential.ts:48-70`）。它是不是免费、要不要先问，在新的 `credentialProbePolicy` 里有答案，但 lane 的 diff 里 `directKeyCredential.ts` 只改了 57 行——合并前必须逐行确认它问的是新 owner，而不是自己又判一次。**「两边都绿」不是放行理由**（R14.1 同理：第二份实现天生自洽）。
验收门：`check:spend-receipt` + lane 自带的 `credentialProbeFree.test.ts`；再加一条断言「除 `credentialProbePolicy.ts` 外没有第二处决定花不花钱」。

**③ 给 `finishTerminal` 的 8 个写点加一条词表断言。**
为什么这刀：这是本簇唯一还没被机器盯住的语义。今天它只有一个 owner，但那是人维持的——09-22 那份合同的教训正是「删了行为没删判据」，同样的手滑在 8 个写点之间一样会发生，而且照例不报错。
动哪些文件：`scripts/check-vocabularies.mjs` 的登记表（`ProviderAdapterRun["stage"]` 的终态成员）；生产码不动。
验收门：`check:vocabularies`（加规则前先验它会红——去掉一个终态成员应立刻红）。

## 5. 不做什么，为什么

- **不把 `integrationCertification` 和 `providerAdapter` 合并成一个目录。**看着像一层，但边界是真的：providerAdapter 管「一次说明卡的一次自检」，integrationCertification 管「跨会话、要落盘、要能重启后接上」。合并会让 §2.2 里两条不同生命周期的状态挤进同一个 owner，那是新的分叉来源，不是收敛。
- **不去「统一」凭据探测的四个文件。**§2.3 已经核过：探测本体一份、策略一份，`directKeyCredential` 的分叉是有据的刻意选择。为了让文件数变少去合并它，会把 apimart 的 401 假阴性重新引回来。
- **不给模块键做更聪明的归类来消掉 §2.1 的误报。**`symptom-cluster` 的注释写得很清楚：门岗只判「做没做」，一道试图判质量的门岗会开始误判然后被绕过（R17）。多读一份本文档，比让门岗学会分辨「顺带改到」便宜得多。

## 6. 六角色各看一眼

- **CTO**：五份里四份是「一句话没有主人」，一份是「真相源在外面我们存了副本」。收敛方向对（两个新 owner + 一个门岗），但债务全押在 2026-10-06 的一次总合并上——那是单点。建议②的合并核对不要等到那天。
- **设计**：用户心里只有「我的三个分组」。今天修好了保存不互相覆盖，但**列表上这三条长得一样**（同域名、同图标），用户凭什么认出哪条是 mini 组？下一轮 UI 走查要专门看这个，不在本 PR 范围但别忘了。
- **PM**：#831 这类用户（买中转站分组）是我们最贵的那批——他们已经在花钱了。建议①直接决定他们装上修复版之后第二条连接能不能跑，优先级应当高于任何新供应商接入。
- **前端**：`ModelSettingsHome.tsx:315/432` 的两处字面量是渲染层在替账本做判断（徽章、提示语）。改用 `builtinVendorIdentity` 的同时应顺手确认：渲染层只读结论，不第二次判身份。
- **后端**：`finishTerminal` 8 个写点集中在一个文件里是好事，但没有任何测试钉住「这 8 处的终态集合是同一张表」。建议③成本最低（不动生产码），拦的是已经发生过一次的那类手滑。
- **真实用户（dreamcolor123 的视角）**：「我买了三个分组，加第二个的时候第一个没了。」他不关心 vendorKey 是怎么派生的。他会怎么验收？——加三条连接、三条都在、三条各自的模型都能跑、账单没算错。本 PR 让前两件成立，第三件要等建议①。
