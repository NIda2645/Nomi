# 付费卡逐镜：点了的生成，去掉的不生成

> 状态：🚧 进行中（2026-09-30：协调会话已拍板 Q1–Q9；分三个叠着的 PR——A1 / A2 / A3，验收只在 A3 头上做一次）。
> 质量体系按 `docs/plan/2026-09-29-quality-system.md`：测试表、真实路径测试、中英截图、验收页。

## 用户那条路

- Agent 起草 2 张图，付费卡标题「生成这 2 张图片？」，只有一个「仍要生成」。第 1 页点下去，供应商只收到第 1 张，第 2 张被悄悄移出这一批，再没有卡问过它；Agent 却被告知「都开始了、别再调 generate」。画布上连着的参考图既不在卡上，也没发出去。
- 让 Agent「做一个封面，3:4」：画布建了一个视频节点，卡标题说「生成这 1 段视频？」，卡体却是图片模型和图片尺寸，而且改不了；点下去说「这一步没成……可以改一下再按一次」，可卡上什么都改不了；节点一直显示「排队中」。
- 付费批次的开拍确认 10 分钟后过期、派发时核它：放行形象、暂停后继续、第二天重开项目，只要晚于 10 分钟就永远派不出去（F1）。确认框开着时别的镜头落上画布，确认就被拒（F4）。

## 根因（一句话）

「批了什么」没有自己的主人：一个 Run 只有一份授权，派发时每个 job 都拿这一份来核，于是「只批这一镜」只能靠把别的镜从这一批里删掉来实现；卡、派发、回执各自猜「批了什么」。

## 规则 → 主人

| 规则 | 主人（唯一写口） | 读者 |
|---|---|---|
| 1 点了才生成、2 去掉的不生成、3 不悄悄消失 | Run 宿主：`generation.present` 开一次出价、`generation.shot.decide`（生成这张 / 去掉这张）、`generation.presentation.close`（× / 打字 / 被停） | 卡投影 `productionPendingSpend`、回执、画布小标 |
| 4 卡上所见即所发 | 封印那一刻编译这一镜的合同（参考图含画布连线） | 卡、派发 |
| 5 告诉 Agent 的就是发生的 | 宿主一个值 `GenerateOutcome`（在生成的 / 用户去掉的 / 没决定的 + 原因），`generateReceipt` 只渲染 | 内部 lane、外部 MCP（同一个函数，对等测试） |
| 6 一个主人 | `production.dispatch-authorization-scope`：每点一次封一份只盖这一镜的授权，**信封存在它自己那道门上**；派发核「批这个 job 的那一份」 | 批次调度器、老驱动 |
| 7 不说今天不真的钱话 | 卡投影不出「仍要生成」「价格未知」「逐镜 / 全部」 | 卡 |
| 8 不双扣 | `generation.shot.decide` 幂等（同一镜第二次点：已有授权即原样返回） | — |
| 9 种类 / 模型 / 参数一个值（A2） | 唯一构造器：矛盾的镜头当场拒绝 | 卡标题、卡体、画布节点、派发 |
| 10 卡可改（A2） | 卡上的改动走 `generation.revise`（只动没决定的镜），不碰画布 | 卡 |
| 11 失败只给存在的出路（A2） | 失败码 → 文案表 | 卡 |
| 12 没点不叫排队中（A2） | 画布小标读宿主的逐镜决定：等你确认 / 还没生成 / 已去掉 | 画布 |
| 13 时效跟着点击（A3，F1） | 同意窗口的唯一主人：每一次点击（生成这张、放行形象、继续剩余）续这次点到的那几镜；没人点的自动路径过期就如实停下、给按钮 | 派发、画布小标 |
| 14 批准只核批过的那一份（A3，F4） | 批准那一刻核信封自己的事实，不核活的项目文档版本 | — |

## A1 的结构

1. **授权按门存**：付费门（`budget_envelope`）自己带着那份冻住的信封；`plan` 上单独的那份授权（`authorizationEnvelope` / `authorizationDigest` / `authorizationGateId` / 计划级批准收据）同一次改动里删掉（P1）。派发按 job 的 `authorizationDigest` 找到批它的那道门，核门上的信封、门的批准、审批账本那一行。重做、续额度都只是「又一份」，不再要求「之前批过的都已发出」（`queued_shots_pending` 随之删掉）。老 Run 读盘时把计划级那份搬到它自己那道门上（唯一归一点在仓库读路径）。
2. **逐镜决定**：每一镜有自己的决定（生成 / 去掉，带时间）；计划有一次出价（开着 / 关了，关的原因：都决定完了 / 用户点 × / 用户打字 / 被停）。卡只投影「这次出价里还没决定的镜」，标题数它们。点「生成这张」= 封这一镜、铸收据、决它那道门、派它；点「去掉这张」= 记下来、不派；没有没决定的镜时出价自动关（都决定完了）。
3. **回执**：等待在卡关掉时才结束；宿主给一个值，回执只渲染它。「都开始了、别再调 generate」只在每一镜都在生成时才出现。
4. **失败说真话**：`generate` 失败时读账本「有没有任何提交意图落过盘」，没有就是「没发出去、没扣费」，面板同一句。
5. **参考图**：卡和封印都带上画布上连到这一镜占位节点的参考图；卡上拿掉不动画布连线。
6. **删掉**：卡上的「逐镜 / 全部」切换和「全部」那条路、「仍要生成」、「价格未知 · 以供应商账单为准」、宿主「取消勾选其余再封印」那一段、写死的「已开始」回执。

## 概念占用表（R33）

| 概念 | 唯一 owner | 允许谁消费 | 这次 |
|---|---|---|---|
| `production.dispatch-authorization-scope` | `electron/productionRun/productionGenerationSubmission.ts#prepareAuthorizedSubmission` | 批次调度器、老驱动 | 形状变了：核「批这个 job 的那道门」上的信封，不再核计划级那一份（不新增条目，改形状说明） |
| 逐镜决定与出价（新） | `electron/productionRun/productionGenerationPresentation.ts` | 卡投影、回执、画布小标、重启清扫 | 新登记 |
| 生成回执（新） | `electron/shared/agentLane/generateOutcome.ts` | 内部 lane 回执、外部 MCP 回执 | 新登记 |
| 待确认付费卡投影 | `electron/productionRun/productionPendingSpend.ts#projectPendingSpendConfirm` | 面板付费卡 | 只投影没决定的镜 |
| 付费卡上的动作 | `electron/capabilityCore/appIntegrationSpendConfirm.ts` | IPC → 面板 | 逐镜确认、去掉、× |

不碰（别的 lane 正持有）：`electron/shared/agentLane/laneProjection.ts`、`electron/agentLane/laneModelContext.ts`、`electron/agentLane/laneContextBudget.mts`、`laneDesktopTools.ts` / `projectAgentProposalReceiptStore.ts`、`workbenchDocumentSlice` 的分镜激活、`tests/ux/full-walk/`（另一条 lane 在改）。

## 不动项

- 全自动档：仍一次批整份草稿，但记成「这几镜都已同意」，走同一个主人（Q4）。
- 画布直接生成、外部 MCP 宿主的批准形状（整份，Q8）、未来官方渠道的价格显示。
- 卡的版式：不新增版式，「去掉这张」用现有的第二动作槽。

## 旧数据

- 旧 Run 的计划级授权在读盘时搬到它那道门上，派发照常核得上（老资料升级行覆盖）。
- 旧版本「逐镜」档留下的 `included: false`（被静默移出的那几镜）**不自动复活**成待决定；要生成得 Agent 再 generate（Q9，写进 PR「用户能力变化」）。

## 回滚

三个 PR 叠着开、按 A1 → A2 → A3 合；任何一个 revert 都只退它自己那一层。A1 改了派发核对的形状，revert A1 需要连同 A2 / A3 一起退。

## 验收门

- 每个 PR：contracts 门岗、相关 vitest、变异校验（把每条修复改回旧行为，对应测试必须红）、`pnpm build`。
- 真机验收只在 A3 头上做一次：测试表 1–25 行合成一张 `验收.html`（不通过的排最前、每行截图、中英分开、新装机与老资料分开）；第 15 行真付费只跑一次；铁律走查 pb01、pb02 重跑（第 16 行）。

## 先查别人

- 仓库里已有：Agent 消息层研究（PR #930）`docs/research/2026-09-29-agent-message-layer-conformance/report.md` §4.3–4.5：一次批准是一个信号、不是一份内容；「只批这一镜」在框架里没有对应物，批准范围必须由 Run 宿主产出，同一个值决定卡标题、主按钮、派发和回执；回执是 Run 事实的纯函数。
- 生态里已有：
  - Vercel AI SDK 的工具审批按「一次工具调用」二值批准（`needsApproval` → `approval-requested` → `addToolApprovalResponse({ id, approved })`），可带不参与判定的 `approvalDescriptor`（https://github.com/vercel/ai/blob/main/content/docs/04-ai-sdk-ui/03-chatbot-tool-usage.mdx）——所以逐镜范围必须我们自己建模，而且 B / C1 以后能把 `GenerateOutcome` 原样当工具输出。
  - Stripe 的授权与扣款分离：每一笔授权各自冻结、各自有有效期，过期即释放，要重新授权（https://docs.stripe.com/payments/place-a-hold-on-a-payment-method）——「每点一次一份授权、各自带时效」与 A3「过期如实停下、再确认」都照这个形状。
  - Google OAuth 的增量授权：每次只请求新增的那一项，之前批过的继续有效（https://developers.google.com/identity/protocols/oauth2/web-server#incrementalAuth）——第 2 镜的授权不替换第 1 镜那一份。
  - RFC 9396 §9：资源服务器执行的是「批准过程中批准的那份授权细节」（https://www.rfc-editor.org/rfc/rfc9396.html#section-9）——派发核批它的那一份，批准那一刻核信封自己的事实（规则 14）。
- 反方：一份授权盖整批（今天的形状）实现更小，但「只批这一镜」只能靠删掉别的镜，卡上还能改的镜又没法提前封；排队中的镜挡住下一次点击（乙方案，已否）。

## 测试表

见任务书第 1–25 行；A1 覆盖 1–18，A2 覆盖 19–22，A3 覆盖 23–25。
