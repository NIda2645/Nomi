# electron/vendor 与 src/ui 的结构评审：第三份根因合同该不该再修一次

> 状态：已完成（2026-09-30）。触发：`check:symptom-cluster`——`electron/vendor` 与 `src/ui` 各在 7 天窗口里收到第三份根因合同（本分支「生成失败要说真话」的四份合同带出来的）。
> 对应合同：`docs/fixes/2026-09-29-failure-reason-from-upstream-evidence.root-cause.json`（`electron/vendor`）、`docs/fixes/2026-09-29-toast-identity-withdrawal-and-window-fit.root-cause.json`（`src/ui`）。
> 姊妹评审：`docs/audit/2026-09-29-render-layer-second-answers-structure-review.md`（同一类「渲染层另给一个答案」，其中点名的「失败不记身份」缺口由本分支的 `2026-09-29-failure-belongs-to-the-dispatched-attempt` 关闭）。

## 结论

两处的结论不同：

- `electron/vendor`：三份合同**不是同一个缺陷**，但数门时发现了一个真结构问题（同一份失败载荷有三个产出通道、各自手写字段），本 PR 用对等测试把它钉住；收成一个构造函数留作单独的小任务。
- `src/ui`：三份合同落在三个互不相干的子系统，聚簇是模块键粒度太粗的产物；但提示所有者这一层本身有结构问题（身份、撤回、位置分在三处），本 PR 已收进所有者。

## 一、electron/vendor

窗口内的三份合同：

1. `2026-09-28-apimart-production-boundaries`——`electron/vendor/vendorBaseFallback.ts`，备选线路的连接失败分类。
2. `2026-09-28-production-shot-claim`——制作与画布对「镜头归谁」的分歧；触到 `vendorHttp.ts` 的只有 `encodeStructuredErrorMessage`（认领被拒的 `{code, reason}` 要走同一个 IPC 标记回到渲染层）。
3. `2026-09-29-failure-reason-from-upstream-evidence`（本分支）——失败载荷里加上上游自己给的错误码。

三件事各有各的病：备选线路、镜头认领、失败原因。它们共同的只有一点：`electron/vendor/vendorHttp.ts` 是「供应商那一侧发生了什么」变成失败载荷（`VendorErrorStructured`，经 `NOMI_VENDOR_ERR_B64::` 标记过 IPC）的地方，渲染层每要多知道一样东西，就得动它。另外 `electron/vendor/` 在高风险前缀名单里，碰它一律要合同——这次改动只是往载荷里加一个可选字段，合同数在这里**高估**了缺陷数。

**数门时发现的结构问题。** 把上游失败带过 IPC 的载荷，全仓有三个产出通道，各自手写字段：

- `vendorHttp.requestVendor`（图 / 视频 / JSON 请求）；
- `aiSdkVendorError.vendorErrorFromAiSdkError`（AI SDK 文本请求）；
- `runtimeVendorError.describeRuntimeError`（Agent 的 pi 运行时）。

这次要多带一条证据（上游错误码），得改三处。前两处任务书里点了名；第三处是把 `upstreamMsg` 的所有产出点数一遍才发现的——它原来除状态码之外什么都不带，模型下线的 400 在 Agent 车道横幅上同样会被说成「参数不被接受」。「新增一条证据、漏掉一条通道」就是这一层反复出合同的形状：每条通道单看都有单测，可漏掉的那条通道根本没有那条用例。

**处置。**

- 本 PR 已做：三条通道都带上游码；`electron/vendor/upstreamEvidenceParity.test.ts` 把三条通道放在同一张表上——同一份上游响应体必须带出同一份证据（码、分类、状态码逐项相同）。变异校验：三条通道各漏带一次，全部抓红。今后新增证据字段而漏掉哪条通道，这条测试红。
- 本 PR 不做（建议另开小任务，机械、低风险）：把三处「响应体 → 证据（话 + 码 + 分类）」收成一个构造函数，三条通道只传 `{status, body}`。理由：对等测试已经堵住「漏」，收成一个函数是把「改三处」变成「改一处」，要动传输核的调用面，与这次「失败说对」不是同一件事，也不该混在同一个 PR 里评审。
- 不需要结构改造：传输逻辑本身（备选线路、凭据绑定、出站策略）这三份合同都没有暴露出缺陷。

## 二、src/ui

窗口内的三份合同：

1. `2026-09-24-comfyui-combo-wire-type`——`src/ui/onboarding/*`，ComfyUI 工作流导入面板。
2. `2026-09-24-renderer-failure-evidence`——`src/ui/ErrorBoundary.tsx`、`src/ui/chunkBoundary.tsx`，渲染层崩溃留证。
3. `2026-09-29-toast-identity-withdrawal-and-window-fit`（本分支）——`src/ui/toast.tsx`，提示的身份、撤回与位置。

三件落在三个互不相干的子系统：上手向导、错误边界、提示所有者。模块键按两级目录取，`src/ui` 是个杂物筐——聚簇是键的粒度造出来的，不是 UI 原语层的结构信号（与 `src/workbench` 那份评审的判断一致）。

**提示所有者这一层本身的结构问题（本 PR 已处置）。** 「一条提示是什么事、什么时候不再成立、放在哪」原来分在三处：

- 调用方拼身份（`providerSwitchToastId`）——换一次家 id 就变，旧提示成了没人撤的孤儿；
- 调用方私有监视前提（`showUndoToast` 自己一份监视加退订，切家提示什么都没有）——成功之后还挂着一句「失败」；
- 容器与内容各管一半的尺寸（隐式网格列撑到内容的 min-content，Mantine 又写死每条 160 的最大高度）——整条伸出窗口、被削。

本 PR 把三件收进所有者：`occurrence` 区分「重新宣布」与「又发生一次」，`validWhile` 是前提监视的唯一接口（`showUndoToast` 私有那份并入并删掉），`TOAST_MAX_HEIGHT` 与容器列宽各只有一个出处。旧实现（拼身份、私有监视）已删，没有并行版。真实 Chromium 的 e2e 钉位置（main 上红），vitest 钉身份与撤回。

**不需要另起结构改造。** 剩下的是设计决定，不是结构问题：动作按钮标签在窄容器里被截断、提示里要不要带建议。已记在合同的 residual_risks，交协调会话。

## 给门岗的一句观察（不在本 PR）

`check:symptom-cluster` 的模块键取两级目录，`src/ui`、`src/workbench`、`electron` 这类目录把互不相干的子系统聚成一簇，「7 天 N 份」说明不了哪一层有问题，逼出来的评审只能先花半篇去解释「这些其实不是一类」。建议对这几个杂物目录改按三级键计数，或者让评审点名的是合同而不是模块。
