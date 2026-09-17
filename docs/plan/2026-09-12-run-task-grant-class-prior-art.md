# 付费出口一律带 grantId —— 先查别人（PR #782）

> 状态：✅ 已交付

本份是 PR #782（`fix/deconstruct-spend-grant-class-20260912`）的 R27「先查别人」报告：
在把「弹卡问人 → 铸令牌 → 扣费」抽成 `electron/spendConfirmGrant.ts` 之前，
先把仓库 / 依赖 / 生态里已有的做法查了一遍。结论是**复用仓内已经被四份合同反复确认过的那条路，
不新造机制**：把横切关切（谁授权花钱）从「长编排函数体内自取」改成「调用方在参数里给 + 编译器必填 + 门岗硬零」。

## 先查别人

- 仓库里已有（同一族这是第五份合同，前四份各修一端）：`docs/fixes/2026-09-09-quote-bound-spend.root-cause.json:1`（报价与扣费绑定）、`docs/fixes/2026-09-11-legacy-spend-door.root-cause.json:1`（删掉「客户端自报即发放」的偷跑通道）、`docs/fixes/2026-09-12-spend-gate-outlived-the-spend.root-cause.json:1`、`docs/fixes/2026-09-12-spend-card-model-swap-blocked.root-cause.json:1`。**这四份是本次方案的直接依据**：它们已经把「付费放行必须有一张主进程铸的令牌」立成不变量，本 PR 不再发明判据，只把最后三个没带令牌的出口接上同一条链。
- 仓库里已有（可直接照抄的形状）：`electron/video/deconstructVideo.ts:115` 的 `authorizeSpend` 与 `ShotVerifyDepsContext.confirmJudgeSpend` 都做成**必填字段**——这正是仓内既有的「横切关切当参数给、让编译器拦」写法（R28）；`electron/spendConfirmGrant.ts:50` 的 `confirmSpendAndMintGrant` 是把 `gateway.ts` 里那份内联副本抽出来，不是第二份实现（同 commit 删旧，P1）。
- 依赖里有没有现成的？没有，判定为**领域约束**：`extras` 是 `Record<string, unknown>`，漏带 `grantId` 编译期看不见——这是我们自己传输层的形状，任何第三方库都不认识 Nomi 的「令牌」概念，也无法替我们判断「这一批调用该不该一次报价」。所以只能自己写，但只许一份，并且用必填字段 + `check:run-task-grant` 硬零门岗把「下一个新出口」提前拦住。
- 生态里怎么做：支付/授权类 SDK 的通行做法就是**不可省的授权句柄**（idempotency key / authorization token 作为必填入参，而不是可选上下文），例如 Stripe 的 PaymentIntent 必须先 confirm 再 capture（https://docs.stripe.com/payments/paymentintents/lifecycle ）。结论一致：授权是入参，不是环境。
- TikHub 自媒体来源：本次没用 TikHub —— 这是仓内主进程付费出口的不变量归属问题，用户侧看到的只有「分镜表每格都是没读出」这个症状，自媒体里不会有这条线索的一手信息（症状与根因的对应关系是靠真机 bridge-only 复现坐实的，见下）。

结论：**用已有的路、把缺的三个出口接上去**。不新增框架、不新增第二份确认链（`gateway.ts` 的内联副本同 commit 删掉）、不改供应商与 MCP 外部契约。

## 范围与不动项

- 动：`electron/spendConfirmGrant.ts`（唯一那条链，支持批量 `lines`）、`capabilityCore/gateway.ts`（删内联副本改调它）、`video/deconstructVideo.ts`（一次报价覆盖整批）、`shotVerifyDeps`（铸自己的令牌）、转写路（带 `grantId`/`nodeId` + `findExecutableModel` 解出真实模型）。
- 不动：供应商适配器与 MCP 对外契约；画布渲染路径。
- 顺带堵掉诊断途中暴露的静默失败（`streamTextTask` 两个未处理 rejection、`executeTextTask` 丢掉的 `finishReason`、拆解里不带原因的 `catch`、`buildShotBoundaries` 写死的 `s > 0.01`）——这些都是同一次真机复现照出来的，不是顺手扩范围。

## 验收门

见 PR #782 正文「防线」与「验证」两节：编译器必填 + `check:run-task-grant` 硬零（自带红绿对照 `scripts/check-run-task-grant.node-test.mjs`，阳性对照就是事故当时那段漏带 `grantId` 的原样写法）；根因合同 `docs/fixes/2026-09-12-run-task-grant-class.root-cause.json`（schema-v3，`recurring`，20 扇门逐扇判定）；结构评审 `docs/audit/2026-09-12-electron-video-structural-review.md`；逐跳根因链与被证伪的候选见 `docs/research/2026-09-12-deconstruct-all-fail/README.md`。
