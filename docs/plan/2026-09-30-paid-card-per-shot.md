# 付费卡逐镜：点了的生成，去掉的不生成

> 状态：🚧 进行中（2026-09-30：协调会话已拍板 Q1–Q9。2026-10-01：A1 已实现；A2（第 9–12 条）已实现；用户拍板加「生成剩下 N 张」，已按样张与随后的位置反馈实现；A3（第 13–14 条、删掉 Run 级预算停、合计行单位跟标题）已实现；2026-10-02：pb02 重跑抓到画布参考的三处（卡按画布规则切生成方式、卡那张框不再借占位节点的 id、卡的改稿走并入规则），已修；A1–A3 合成一个 PR #947，验收只在 A3 头上做一次）。
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
| 1 点了才生成 | 点「生成这张」= `generation.seal` 只封这一镜（`productionGenerationSeal.sealScopeOf` / `applyGenerationSeal`）→ 它自己那道门 → 批准；派发只认批这个 job 的那道门 | 批次调度器 |
| 2 去掉的不生成、3 不悄悄消失 | 出价账 `generationPlan.presentations`，只经 `productionGenerationPresentationEdits` 四个写口：`presentGenerationPlan`（开一次出价）、`removePresentedShot`（去掉这张）、`withdrawGenerationPresentation`（× / 打字 / 被停）、`settlePresentation`（都决定完了，在决定那一步里收尾） | 卡投影 `productionPendingSpend`、回执、画布小标 |
| 4 卡上所见即所发 | 卡上那一页摆着的那一份（`candidatePatchFromNode`，参考图含画布连线 `canvasReferenceInputs`）在点的那一刻经 `generation.revise` 落到这一镜，再封印 | 卡、派发 |
| 5 告诉 Agent 的就是发生的 | 宿主一个值 `generationPresentationOutcome`（在生成的 / 发出前就失败的 / 用户去掉的 / 画布接手的 / 没决定的 + 原因），`describeGenerateOutcome` 只渲染 | 内部 lane；外部 MCP 从 operation 视图拿同一个值（`presentationOutcome`） |
| 6 一个主人 | `production.dispatch-authorization-scope`：每点一次封一份只盖这一镜的授权，**信封存在它自己那道门上**；派发核「批这个 job 的那一份」 | 批次调度器、老驱动 |
| 7 不说今天不真的钱话 | 卡投影不出「仍要生成」「价格未知」「逐镜 / 全部」；上传托管那句只说事实，不说哪家免费、不替用户推荐 | 卡、Agent 确认框 |
| 8 不双扣 | 宿主确认按 operation 串行；同一镜已经批过（这一次出价里）就原样返回、不再封 | — |
| 9 种类 / 模型 / 参数一个值（A2） | 建镜头时定种类：`generationShotKind.resolveShotTaskKind`（只看点名的模型 + 明写的种类）；每条建镜头的路落盘前过 `semanticGenerationCandidate.admitShotIdentity`（和派发同一个 `registry.resolve`） | 只读 `generationShotKind`：卡投影（`PendingSpendShot.kind`）、卡标题与卡体、画布落地、派发 |
| 10 卡可改（A2） | 卡上的改动走 `generation.revise`（只动没决定的镜），不碰画布；真改不了时卡体在原处说为什么（共用 composer 的只读理由） | 卡 |
| 11 失败只给存在的出路（A2） | 宿主给没发起的那一档点名是哪一种（`productionShotActionFailureOf` 的闭集，`ProductionActionResult.failure`）；渲染层 `spendCardFailure.spendActionFailureCopy` 照它挑一句，「改一下再按」只在卡此刻真能改时出现 | 卡 |
| 12 没点不叫排队中（A2） | 画布小标读宿主的逐镜决定：等你确认 / 还没生成 / 已去掉（`productionShotPhase.deriveProductionShotState`，#940 + A1 已落地，A2 核验） | 画布 |
| 「生成剩下 N 张」（用户 2026-10-01） | 宿主 `appIntegrationSpendConfirm.confirmRemainingShots`：卡上还没决定的每一张各走一次 `confirmOneShot`（各封一份授权、各派一次，没有总价授权） | 卡（动作行最左那颗） |
| 13 时效跟着点击（A3，F1） | 判据 `productionDispatchConsent.dispatchConsentOpen`（离用户最近一次点头不超过同意窗口）；续的唯一写口 `productionDispatchConsentEdits.renewDispatchConsent`（只有带真人手势章的「继续」与放行形象调它）；点「生成这张」本身就是一次新批准。过期 → 派发抛 `DispatchConsentLapsedError` → 批次停在 `consent_expired` | 派发闸、批次调度器、画布小标 |
| 14 批准只核批过的那一份（A3，F4） | `productionRunApprovalReceipt.createGateApprovalOwner`：封了信封的付费门，收据比信封封好时的版本（`revisionRuleFor` → sealed），不读项目此刻的版本 | Run 服务的门决议 |

## A1 的结构

1. **授权按门存**：付费门（`budget_envelope`）自己带着那份冻住的信封；`plan` 上单独的那份授权（`authorizationEnvelope` / `authorizationDigest` / `authorizationGateId` / 计划级批准收据）同一次改动里删掉（P1）。派发按 job 的 `authorizationDigest` 找到批它的那道门，核门上的信封、门的批准、审批账本那一行。重做、续额度都只是「又一份」，不再要求「之前批过的都已发出」（`queued_shots_pending` 随之删掉）。老 Run 读盘时把计划级那份搬到它自己那道门上（唯一归一点在仓库读路径）。
2. **逐镜决定**：每一镜有自己的决定（生成 / 去掉，带时间）；计划有一次出价（开着 / 关了，关的原因：都决定完了 / 用户点 × / 用户打字 / 被停）。卡只投影「这次出价里还没决定的镜」，标题数它们。点「生成这张」= 封这一镜、铸收据、决它那道门、派它；点「去掉这张」= 记下来、不派；没有没决定的镜时出价自动关（都决定完了）。
3. **回执**：等待在卡关掉时才结束；宿主给一个值，回执只渲染它。「都开始了、别再调 generate」只在每一镜都在生成时才出现。
4. **失败说真话**：`generate` 失败时读账本「有没有任何一笔可能到过供应商」（`productionShotJobs.jobMayHaveReachedProvider`），没有就是「没发出去、没扣费」，面板同一句。
5. **参考图**：卡和封印都带上画布上连到这一镜占位节点的参考图；卡上拿掉不动画布连线。
6. **删掉**：卡上的「逐镜 / 全部」切换和「全部」那条路、「仍要生成」、「价格未知 · 以供应商账单为准」、宿主「取消勾选其余再封印」那一段、写死的「已开始」回执。
7. **上传托管那句**：Agent 确认框和托管同意的报错只说事实——素材会上传到公共临时托管、链接短期有效、有隐私风险、可以在设置里换上传通道；不说「免费」，不替用户推荐某一家。

## A2 的结构（第 9–12 条）

1. **种类只有一个答案**：删掉按提示词关键词判种类的 `inferGenerationTaskKind`。建镜头时种类只从「点名的模型在目录里声明的模式 + 明写的 taskKind / mode / modeId」来（`resolveShotTaskKind`）；两样都没有就请 Agent 写明，不猜。每条建镜头的路（单镜 / 多镜 create、整只给候选、改草稿）落盘前都过 `admitShotIdentity`：模型 + 模式在目录里真有这一对，参考卡只能是图片；矛盾的当场拒绝，说清这个模型能做什么。换模型（没另写种类）时这一镜还是同一种任务，模式按新模型目录里的拼法跟过去，新模型做不了就拒绝。
2. **四处读同一个函数**：宿主把 `generationShotKind` 投影成 `PendingSpendShot.kind`；卡标题（张 / 段）、主按钮措辞、卡体那张生成框都只读这一格，画布落地也调同一个函数（以前它用 `/image/` 判模式，图生视频会落成图片节点）。
3. **卡可改**：第 9 条之后卡体那张框的种类恒为图或视频，每一镜都有能改的框；真改不了时（写入面失效）共用 composer 在原处说为什么。
4. **失败只给存在的出路**：宿主对「没发起」的那一档点名是哪一种（与重做 / 续拍同一个闭集），卡照它说；认不出时才说「改一下再按」，而且只在卡此刻真能改时说，改不了就说改不了、该怎么办。「可能已提交」只看**这一镜自己的**作业——以前整个 Run 一起看，前一张发出去后，后面任何一张在发出前失败都会说成「可能已提交」。
5. **没点不叫排队中**：#940 + A1 已经让画布小标读宿主的逐镜决定；A2 在真机走查里再核一遍（卡没点时这两张写的是「等你确认」）。

## A3 的结构（第 13–14 条 + 删掉 Run 级预算停）

1. **同意跟着点击走（第 13 条）**：一份付费授权被用户点头的最近一刻 = 批准它的那一下（`gate.decidedAt`），或之后续过的那一下（`gate.consentRenewedAt`）。派发闸只问 `dispatchConsentOpen`：离这一刻不超过同意窗口（10 分钟）才派。以前的两道核对——派发时按信封封好那一刻起的 10 分钟判、出站箱又按批准记录的到期时间判一次——都删了。
2. **谁能续**：只有用户在 Nomi 窗口里的那一下：停下后点「继续」（受信 resume-batch IPC → `run.control` resume，带真人手势章）、放行形象检查点（渲染层 IPC 的 `gate.decide`，带真人手势章）。续的是批过、还没发出去的那几镜所在的门（`dispatchConsentRenewalGateIds`），只在门上记一个时间，信封、收据、批准记录一个字不动。MCP 宿主、Agent、调度器自己的「继续」不续：没人点，同意就不该被延长。点卡上「生成这张」是一次新的批准，自带新的 `decidedAt`。
3. **过期如实停下**：派发时过了窗口 → `DispatchConsentLapsedError`（不是失败、不是没发出去）→ 调度器这一趟不再碰它，歇下来时把批次停在 `consent_expired`；画布小标写「这镜还没开拍，需要你再确认一次。」并给「继续」，那一下就是确认。绝不一直挂「排队中」。
4. **删掉 Run 级预算停**：授权按镜批之后，派生里那道「按 Run 总额度逐镜累加、超了就停」只会停下用户亲手批过的镜，停下之后画布说「预算已用完 · 提额续拍」——今天根本没有价格。删掉的：派生的 `BudgetHalt` / `BudgetExhaustedError`、调度器的两处预算停、调度器与派生的单价输入、授权准备里「先批一部分」的第一波上限（Run 有硬上限时盖不住就整份拒，不批一半）、续额度那条路（`prepareProductionGenerationContinuationAuthorization` / `GenerationContinuationNotNeededError` / `deriveGenerationContinuationAuthorizationState` / reducer `generation.continue_authorization` / 「继续」里的续额度分支）、停下原因 `budget` 和它的画布文案。账本 reserve 那道硬墙还在：撞上它（只可能是账不一致）算这一镜派不出去，不再叫预算停。重做的天花板也把别的镜批过、还在排队的那份钱算进去（以前只算账本三项，「参考卡重拍一次，等着形象放行的镜」会撞墙）。
5. **旧数据**：上一版盘上记成 `budget` 的 Run，读盘时由 `normalizeLegacyStopReason` 当作没记原因——画布说中性的「已停，这镜还没开拍。」并给「继续」。已经在盘上的续额度门照旧是有效的付费门。
6. **批准绑信封（第 14 条）**：Run 服务核收据时，封了信封的付费门比信封封好时的版本（命令里说的版本也必须就是它）；`runOwnedGenerationGateAuthority` 里请求门、批门、确认前后共四处活版本核对删了，连 `projectRevisionResolver` 这个依赖都没有了。创意门、信任降档、没有信封的旧付费门照旧比项目此刻的版本。
7. **合计行单位跟标题（用户 2026-10-01 拍板）**：翻页行右端的合计写「2 张 · 合计 ¥0.60」（视频「2 段」，英文与标题同词「2 images · ¥0.60 total」），和标题、「生成剩下」读同一个 `orderWording`（有视频就说视频），不另写第二条规则。

## A3 续：画布连来的参考图（2026-10-02，pb02 重跑抓到的三处，第 7、8 行）

1. **卡按画布那条规则切生成方式**：Agent 起草的图片镜头停在「文生图」（没有参考槽），画布连来的参考图摆不进卡、发出去 0 张。卡默认那张框（`projectSpendNode` → `spendCardReferences.placeSpendReferences`）读画布自己的 `resolveModeForConnectedReferences` 对齐生成方式，再把宿主那一镜的参考 ∪ 画布连来的参考放进卡自己的参考槽。卡上的改动相对这张默认框记进账本（`candidatePatchFromNode` 的 baseline）；用户在卡上拿掉的画布参考（`keptReferenceUrls`）不算进对齐，拿掉唯一那张卡就回到文生图。
2. **卡那张框不借占位节点的 id**：借了，共用的 composer 就把画布上连到占位节点的边当成自己的边——卡上点 × 走的是画布的「断边」，还没点生成画布上的线就没了。现在卡那张框的 id 是 `spend:<shotId>`；composer 里给参数槽建边那一处只在握着画布连边权能时才建（`nodeWriteAccess` 的规矩）。
3. **卡的改稿走并入规则**：卡上切到「图生图」以前只改模式 id、种类还是文生图，派发按文生图挑供应商 mapping、带参考图那一下在出站前被拒。卡的改稿现在经 `resolvePlanPatch`（Agent 改草稿那一条；必填注入 `normalizePatch`）并入；只换生成方式时种类跟过去（`modeTransportFor`），这一对在目录里真有才收。

根因合同：`docs/fixes/2026-10-02-paid-card-canvas-reference-mode.root-cause.json`、`docs/fixes/2026-10-02-card-revise-merge-rule.root-cause.json`。新登记概念：`agent-panel.spend-card-shown-node`、`generation.candidate-patch-merge`。

## 「生成剩下 N 张」（用户 2026-10-01 拍板，样张 `docs/design/mockups/2026-10-01-paid-card-generate-remaining/`）

- **行为**：等于把卡上还没决定的每一张各点一次「生成这张」——每张各记一笔授权，没有总价授权；去掉过的不在 N 里。点完卡和画布上每个节点的状态跟逐张点完全一致（同一份逐镜结局驱动）。宿主核两件事：点名的就是此刻卡上那一叠（报价指纹 + 镜号逐个对上），每一张开拍前它在卡上的样子没被别人改过。哪一张没成就停在那一张，它和后面的照旧在卡上；中途点 × 剩下的不再生成（× 不排队）。渲染层先把每一页卡上摆着的那一份落进候选（和逐张点同一段），再递「用户点的是这几张」。
- **长相**：从第 1 页起就在、写明张数（「生成剩下 N 张 / 段」，en「Generate remaining N」）；张 / 段跟标题同一条规则（有视频就说段）；只剩 1 张时不画；报不出价时哪儿都不写数，报得出价时也不带合计。
- **位置**（样张拍板后按用户反馈调整，以实现为准）：翻页那一行只有翻页器和 `←→`，报得出价时这一叠的合计贴这一行最右端；「生成剩下 N 张」在动作行最左，右边是「去掉这张」和主按钮（一组）。英文一行放不下时左边那颗整颗换到上一行、靠左，右边两颗保持一组靠右；中文一行放下。设计系统 §1.8 记了这条例外，并注明 9-10 那版「批量是主按钮的一个状态」在付费卡上已被取代。

## 概念占用表（R33）

| 概念 | 唯一 owner | 允许谁消费 | 这次 |
|---|---|---|---|
| `production.dispatch-authorization-scope` | `electron/productionRun/productionGenerationSubmission.ts#prepareAuthorizedSubmission` | 批次调度器、老驱动 | 形状变了：核「批这个 job 的那道门」上的信封，不再核计划级那一份（不新增条目，改形状说明） |
| 付费卡这一次出价（新，`production.spend-card-presentation`） | `electron/productionRun/productionGenerationPresentationEdits.ts#presentGenerationPlan`（四个写口，都经 reducer） | reducer、仓库 | 新登记 |
| 这一次出价的逐镜结局（新，`production.spend-card-outcome`） | `electron/shared/productionGenerationPresentation.ts#generationPresentationOutcome` | 卡投影、封印范围、画布小标、operation 视图、确认路径、回执 | 新登记 |
| generate 回执（新，`agent-lane.generate-receipt`） | `electron/shared/agentLane/generateOutcomeReceipt.ts#describeGenerateOutcome` | 内部 lane 回执 | 新登记 |
| 待确认付费卡投影 | `electron/productionRun/productionPendingSpend.ts#projectPendingSpendConfirm` | 面板付费卡 | 只投影没决定的镜 |
| 付费卡上的动作 | `electron/capabilityCore/appIntegrationSpendConfirm.ts` | IPC → 面板 | 逐镜确认、去掉、×；「生成剩下 N 张」（逐张走同一个 `confirmOneShot`） |
| 一镜是图还是视频（新，`generation.shot-kind`） | `electron/shared/generationShotKind.ts#resolveShotTaskKind`（定）+ `semanticGenerationCandidate.admitShotIdentity`（核）+ `generationShotKind`（读） | 建镜头的路、卡投影、画布落地 | A2 新登记 |
| 这一镜现在派出去还算不算同意过（新，`production.dispatch-consent`） | `electron/shared/productionDispatchConsent.ts#dispatchConsentOpen`（判）+ `productionDispatchConsentEdits.renewDispatchConsent`（续） | 派发闸、`productionRunControl`（继续）、`productionRunService`（放行形象）、reducer、调度器 | A3 新登记 |
| 付费门的批准绑哪一份事实（新，`production.spend-approval-binding`） | `electron/productionRun/productionRunApprovalReceipt.ts#createGateApprovalOwner` | Run 服务、`runOwnedGenerationGateAuthority` | A3 新登记 |
| 制作为什么停下（`production.run-stop-reason`） | `productionRunLifecycle.applyRunStatus` | 同前 | A3 改形状：删 `budget`、加 `consent_expired`、旧 `budget` 读成 unknown（`normalizeLegacyStopReason`） |

不碰（别的 lane 正持有）：`electron/shared/agentLane/laneProjection.ts`、`electron/agentLane/laneModelContext.ts`、`electron/agentLane/laneContextBudget.mts`、`laneDesktopTools.ts` / `projectAgentProposalReceiptStore.ts`、`workbenchDocumentSlice` 的分镜激活。`tests/ux/full-walk/` 现在没人持有（协调会话 2026-10-01）：A1 跟着改目录里的两个 i18n 键、PB01 的步骤（点完第 1 页卡还在、只剩第 2 张，再 ×）和监视器的 `card-scope-mismatch` 判据（按钮许诺几镜就只发几镜、标题数还没决定的镜、没点的镜不许悄悄没了——按宿主的出价账查）。

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

### 产品层：别人的确认卡怎么问、失败怎么交代钱（2026-10-01 补，A2 / A3 定界面之前）

先读了仓库里的竞品资料（`docs/research/competitive/2026-09-25/report.md`、`libtv-design-notes.md`），再上网核对。能打开原文的直接引原文；打不开的写明只看到搜索摘录、算未核实。

| 产品 | 多张一起时怎么确认 | 确认时给不给看参考 / 模型 / 参数 | 失败时怎么交代钱 | 出处 |
|---|---|---|---|---|
| Runway Workflows（节点画布） | 两种都有：节点上「Run」只跑这一个节点；右上角「Run all」跑整条工作流。文档没写运行前有确认 | 参数在节点上（画布即所见） | 只有以生成错误结束的才自动退回：出错横幅出现后几分钟内积分回来，用量表里那一笔消失；生成完成但不满意不退 | https://help.runwayml.com/hc/en-us/articles/45763528999699-Introduction-to-Workflows 、https://help.runwayml.com/hc/en-us/articles/34266159290003-Can-I-have-credits-refunded |
| Higgsfield Popcorn（分镜，最多 8 帧） | 一次 Generate 出一整组（帧之间要保持同一个人、同一束光，模型层面就是一组）；按钮上先写好积分再点 | 输入是提示词 + 最多 4 张参考图，提示词里按编号点名 | 生成块上直接写「Failed, Credits refunded」；排队中取消当场退；已经在后台跑的取消不了，失败自动退；例外（某模型一开始就扣）在帮助里点名 | https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-popcorn 、https://higgsfield.ai/creator-hub/help-center/troubleshooting/generation-is-stuck-or-failed |
| LibTV（我们 2026-09-25 实测，单张图） | Agent 有手动 / 自动两档：手动 = 每次生成前问，自动 = Agent 直接花积分；确认卡写「1 个图片提示词已预备」「预计消耗 15 积分」，按钮有自动确认 / 取消 / 确认生成；全局设置里有积分预算阈值。多张一起的卡**没实测过** | 卡上能点开看提示词；模型、参数、费用在节点上 | 余额不够直接拦下、不开跑；失败 / 退还**未验证** | `docs/research/competitive/2026-09-25/libtv-design-notes.md` §状态表、§7 |
| TapNow | **未核实**：本机登录研究还没做（竞品周期里排着）；评测文章原文打不开，搜索摘录说它的 Agent 在方案确认后一次把图和视频全生成、用户抱怨积分一下子烧完 | 未核实 | 未核实 | 竞品 README 周期待办；摘录来自 view.inews.qq.com/a/20260401A06K4T00（打不开，不作证据） |
| Claude Code（Agent 审批） | 每一次调用单独问：是 / 「是，并且不再问」/ 否；「不再问」存成按仓库 + 命令（或域名）的规则，改文件的只到这次会话结束。只有在**这一问能把它会放行的东西都摆出来**时才给更宽的选项，存下的规则只盖选项点名的那些 | 问的时候摆出完整命令 / 路径 | — | https://code.claude.com/docs/en/permissions （Permission system 表、「Sometimes a permission prompt offers only a one-time approval…」一段） |
| Cursor（Agent 审批） | 三种运行档：Auto-review（白名单直接跑、能进沙箱的进沙箱、其余交分类器或问人）/ Allowlist / Run Everything（每次调用都自动跑）；白名单按命令前缀、MCP 工具写在 `permissions.json` 里，是一项设置，不是卡上的按钮。改代码是先落盘、再给 Keep All / Undo All（可撤回） | 问的时候摆出命令 | — | https://cursor.com/docs/agent/security/run-modes 、https://cursor.com/docs/reference/permissions |

**结论（不改 A1 的设计，只报给协调会话）：**

1. 「明说范围的全部」在主流里**普遍存在**：Runway 有 Run all，Higgsfield 一次生成一组且价格先写在按钮上；Agent 产品里，更宽的批准都**点名范围**（这条命令、这个域名、这次会话、某个运行档），而且只在能把会放行的东西都摆出来时才给。这和用户 2026-09-29 的「点了的生成，去掉的不生成」**有一处出入**：我们现在只有逐镜点，没有一个点名数量的「生成剩下 N 张」。
2. 但两点前提我们今天不具备或不同：① 它们按钮上的「全部」都带着**已知的价格**（积分），我们走中转、价格未知，「生成剩下 N 张」没有一个数能告诉用户这一下花多少；② 它们的钱在平台自己账上，失败就退；我们的钱花在第三方供应商、用户自己的 Key 上，Nomi 退不了，只能如实说「没发出去、没扣费」或「可能已提交，去供应商后台核对」——这一条 A1 已经照 Higgsfield 那种「失败块上直接说钱」的做法做了。
3. 失败交代钱：Runway / Higgsfield 都在**失败的那一块上**直接写钱回没回来、去哪儿核对（用量表 / Usage）。A1 的「没发出去、没扣费 / 可能已提交」同一个方向；A3 的停下与重来文案沿用这一条。
4. 确认时给看什么：Higgsfield 把参考图编号写进提示词、Runway 一切在节点上；LibTV 的卡只说提示词条数和费用，模型参数留在节点上。我们的卡逐页摆出模型、参数和参考图（含画布连线来的），比它们都全，A2 不需要再加。

建议交给用户拍的那一题（附默认）：要不要在**翻完所有没决定的镜之后**，多给一个点名数量的「生成剩下 N 张」（每张仍各封一份授权、卡上不写价格、去掉的不算在 N 里）？默认：**加**——它仍是「点了的生成」（这一下点名了 N 张），去掉的照样不生成，和 9-29 否掉的「全有或全无」不是一回事；33 张的卡逐张点要 33 下，是真实摩擦。代价：多一个控件（要过 §1.5 控件层级）、测试表多几行；价格未知时用户点之前看不到总花费。

## 自己写了什么、为什么必须自己写

用户 2026-10-01 的原则：除非这件事必须我们独自设计，否则一律接入别人做好的；自己写的每一处都要说清楚为什么非写不可。对照的对象：

- **pi**：`node_modules/@earendil-works/pi-coding-agent/docs/rpc.md`「Extension UI Protocol」（`ctx.ui.confirm` 在 RPC 下是 `extension_ui_request` / `extension_ui_response`，按 `id` 配对、阻塞到回复、可设 `timeout` 到点自动给默认值）、`docs/extensions.md` 的 `tool_call`（可阻塞、可改参数）、`ui_prompt_start` / `ui_prompt_end`（「在等人」）、`input`（用户打字可拦截）。Nomi 的 lane 用的是 `@earendil-works/pi-agent-core` 的 harness 钩子 `before_tool`，也就是同一种「拦住工具调用、等人」。
- **AI SDK**：工具审批 `needsApproval` → part 进 `approval-requested` → `addToolApprovalResponse({ id, approved })`，批了才跑 `execute`、否了是 `output-denied`；`toModelOutput` 把工具输出映射成模型看到的内容（https://ai-sdk.dev/cookbook/next/human-in-the-loop 、https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling ）。
- **成熟库 / 规范**：Stripe 授权与扣款分离、RFC 9396（见「先查别人」）。

| 机制（A1 新写或改写） | 落在哪 | 别人有没有现成的 | 用不用、为什么 | 结论 |
|---|---|---|---|---|
| 卡开着时把 `generate` 挡住 | `laneHost.mts` 的 `before_tool` → `laneExtendedDesktopPorts` | 有：pi 的 `before_tool` / `tool_call` 拦截 | **用了**：等待就发生在 pi 的钩子里，不计工具超时 | 接入 pi |
| 确认卡的请求 / 回复配对 | `spendDecisionWaiters`（按 项目 + operation 配对）、`GenerateUserDecision` | 有：pi `ctx.ui.confirm`（按 id 配对、阻塞到回复）；AI SDK `addToolApprovalResponse({ id, approved })` | confirm 本身不用：它是一次性的是 / 否，而这张卡要逐镜点好几下、能改模型 / 参数 / 参考图、能去掉某一镜；答案必须是宿主账本（重启后还在，外部 MCP 宿主和画布读同一份），不是进程里的一次对话框回复；`timeout` 到点给默认值和「花钱不许替用户默认」冲突。等待注册表只是把账本上的「卡关了」接到挡着的钩子上 | 薄胶水是我们的；**和 B 重叠，留接口**（见下） |
| 卡开着时用户打字 | `laneExtendedDesktopPorts` 的 redirected | 有：pi `input` 事件 / steer | 打字交给 Agent 走 pi（lane 已有）；我们只在出价账上记一笔「用户打了字」 | 接入 pi + 一行账 |
| 逐镜授权信封（每点一次一份，住在自己那道门上） | `productionSpendAuthority.ts`、`prepareProductionGenerationAuthorization`、`productionGenerationSeal` | 没有能直接用的：AI SDK 审批是一次调用一个是 / 否，不带内容、不能只批其中几项；pi 只能整次放行或挡下；Stripe 手动扣款「每笔各自冻结金额与有效期」只是形状参考 | 按镜头花钱、冻结合同哈希 / 报文哈希 / 幂等键 / 参考图，钱花在第三方供应商、用的是用户自己的 Key——这笔账只有我们记得了 | 我们独有（领域） |
| 派发只认「批这个 job 的那道门」 | `prepareAuthorizedSubmission` + `authorizationGateForJob` | 原则有：RFC 9396 §9（执行批准过程中批准的那份）；AI SDK 批完执行时不核「执行的是不是批的那份」 | 原则照 RFC 9396，执行只能写在我们自己的派发闸里 | 我们独有（照规范） |
| 出价账（卡摆了哪几镜、谁去掉、怎么关的） | `productionGenerationPresentationEdits`、`generationPlan.presentations` | 没有：AI SDK 的 tool part 状态机管的是一次调用的审批；一次调用里 N 镜各自决定没有对应物 | 「点了的生成，去掉的不生成」是用户拍板的语义 | 我们独有；B / C1 时它是那一个 part 下面的子状态 |
| 逐镜结局（一个值） | `generationPresentationOutcome` | 形状有：AI SDK tool part 的 `output`（任意 JSON 值） | 形状对齐 `output`，C1 原样带走；内容（在生成 / 去掉 / 没决定 + 原因）是领域的 | 内容我们独有，形状对齐 AI SDK |
| 回执（值 → 给模型的话） | `describeGenerateOutcome` | 有：AI SDK `toModelOutput`；pi `tool_result` 钩子可改结果 | lane 跑在 pi 上，不装 AI SDK 运行时（框架中立），所以先写成纯函数；C1 时它就是 `toModelOutput` 那个函数 | 暂时自己写，C1 并进 `toModelOutput` |
| 双击 / 回车去重、确认串行 | `appIntegrationSpendConfirm`（按 operation 串行，这一镜在这一次出价里批过就原样返回） | 只在界面那一层有：pi / AI SDK 的回复按 id 配对，同一个 id 第二次回复无效 | 花钱的去重必须落在宿主账本上：两个窗口、外部 MCP、重启都要挡得住；提交那一层沿用已有的幂等出站（`submitOnce`） | 我们独有（付费幂等） |
| 失败说真话（有没有可能到过供应商） | `productionShotJobs.jobMayHaveReachedProvider` | 没有：工具失败在 pi / AI SDK 里只是一个错误，不知道钱花没花 | 只有我们的出站账本知道一笔有没有写出去 | 我们独有 |
| 画布连线的参考图摆上卡 | `canvasReferenceInputs` | 有：画布自己那一份槽位解析 `resolveReferenceSlots`（React Flow 的边） | 直接读已有的主人，没有再写一份解析 | 复用 |
| 旧数据归一 | `normalizeLegacySpendAuthority`、`normalizeLegacyPresentation` | 没有 | 我们自己的旧格式 | 我们独有（必然） |

A2 与「生成剩下 N 张」新写或改写的：

| 机制 | 落在哪 | 别人有没有现成的 | 用不用、为什么 | 结论 |
|---|---|---|---|---|
| 建镜头时定种类（不按提示词猜） | `generationShotKind.resolveShotTaskKind` | 没有：AI SDK / pi 的工具调用只校验入参形状，「这个模型能出什么」是我们目录里的事实 | 判据就是我们自己的模型目录（每个模型发布了哪些模式），删掉的是我们自己的提示词启发式 | 我们独有（领域） |
| 建镜头时核「模型 + 模式」 | `semanticGenerationCandidate.admitShotIdentity` | 有：我们自己的 `moduleRegistry.resolve`（派发前编译合同用的就是它） | 直接复用这一个判据，只是提前到落盘之前；没有再写一份目录解析 | 复用 |
| 失败时说哪一句 | 宿主 `ProductionActionResult.failure` + 渲染层 `spendCardFailure.spendActionFailureCopy` | 有：重做 / 续拍那一套失败闭集与文案表（`productionShotActionFailureOf`、`SHOT_ACTION_FAILURE_COPY`） | 直接复用那个闭集和那张表；新写的只有「卡能不能改」这一个判据和三句卡上特有的话（卡刚变了 / 这张已不在卡上 / 卡改不了） | 复用 + 薄映射 |
| 「生成剩下 N 张」 | `appIntegrationSpendConfirm.confirmRemainingShots` | 产品层有：Runway Workflows「Run all」、Higgsfield 一次生成一组（见「先查别人」产品层表）；框架层没有：AI SDK 审批是一次调用一个是 / 否，pi 只能整次放行或挡下 | 照产品层的形状给一颗点名数量的按钮；执行上每张仍走逐张那一条路（各一份授权）——「每张各记一笔授权、不出总价授权」是用户拍板的花钱语义，框架里没有对应物 | 我们独有（按镜头花钱） |

A3 新写或改写的：

| 机制 | 落在哪 | 别人有没有现成的 | 用不用、为什么 | 结论 |
|---|---|---|---|---|
| 同意窗口（批了之后多久派出去还算数） | `productionDispatchConsent.dispatchConsentOpen` | 形状有：Stripe 授权各自带有效期、过期释放要重新授权；OAuth 令牌过期要用户（或刷新令牌）续。框架层没有：AI SDK 审批批完立即执行，没有「批了、过一会儿才执行」这一段；pi 的 `before_tool` 只管放不放这一次调用 | 照 Stripe / OAuth 的形状（每份授权各自的时效，过期就再确认一次）；判据落在我们自己的派发闸上——钱花在第三方供应商、用户自己的 Key 上，只有我们的账知道哪一镜批了还没发 | 我们独有（领域） |
| 续同意（点击 = 续） | `productionDispatchConsentEdits.renewDispatchConsent`，调用方 `productionRunControl`（继续）、`productionRunService`（放行形象） | 有：真人手势章（受信 IPC 边界自己盖，`RunCommand.humanGesture`，09-10 起付费门就认它当人证） | 直接复用手势章当「这一下是真人点的」的证据，没有另造一套证明；新写的只有「续哪几道门」这一个判据和一条 reducer 命令 | 复用 + 薄写口 |
| 过期如实停下 | 调度器 `settleAtRest` 加一种原因 `consent_expired` | 有：我们自己的停下原因（09-29 起停的那一刻记原因，界面只读它） | 复用同一个停下写口与画布小标，只加一个原因、一句话、一颗「继续」 | 复用 |
| 批准绑信封 | `productionRunApprovalReceipt.revisionRuleFor` | 原则有：RFC 9396 §9（执行批准过程中批准的那份授权细节） | 照规范，判据只能写在我们自己的收据核对里 | 我们独有（照规范） |
| 删掉的 | Run 级预算停、续额度那条路、四处活版本核对、出站箱的到期核对 | — | 加新必删旧（P1） | 删 |

**和 B（付费卡并进对话）重叠的部分，这次没做死：**

- 等待：`generate` 挡在 pi 的 `before_tool` 里，等的是 `spendDecisionWaiters` 递来的「卡关了」（confirmed / declined），结论再去宿主读（`readPresentationOutcome`）。B 可以把这一跳换成对话投影里那个 tool part 的审批状态，出价账和逐镜结局不用动。
- 回合拿到的东西：`GenerateUserDecision`（`card_closed` / `redirected` 都带着逐镜结局那一个值）——它就是 C1 要放进 tool part `output` 的值。
- 卡的数据：仍由宿主读口 `productionPendingSpend` 投影，渲染层照旧轮询它；B 删轮询时只换取数的方式，卡上的动作（生成这一镜 / 去掉这一镜 / ×）和宿主写口不变。

## 测试表

见任务书第 1–25 行；A1 覆盖 1–18，A2 覆盖 19–22，A3 覆盖 23–25。「生成剩下 N 张」另记几行（PR 正文测试表末尾），同在 A3 头上的验收页里。
