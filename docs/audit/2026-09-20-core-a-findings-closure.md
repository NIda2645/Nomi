# F01–F16 源码闭环与最终验收补记

初次静态核对日期：2026-09-20；仓库 `/Users/aoqimin/Desktop/Nomi-core-a-0919`。首表为逐项读取当时源码与测试后的历史静态核对，除后来发现未关闭的 F15 并获授权修复后运行其定点测试外，**本轮没有重跑其他条目的测试或 GUI**。当时主代理报告的集成全量结果为 1516 文件 / 13954 测试及 SDK 482；后续最终 v10 为 13964 通过（见下文），不反写历史数字。现行状态统一见 [验收表](2026-09-20-core-a-current-acceptance.md)。旧初审红灯保留为历史证据。Windows、候选包与真实供应商边界由主代理分别记录。

| 发现 | 当前原 owner 修法及源码 | 回归证据（已读测试，不表示本轮执行） | 关闭状态及未验证边界 |
| --- | --- | --- | --- |
| F01 原按钮接不完整新执行链 | `src/workbench/creation/storyboard/StoryboardPlanEditor.tsx` 的 `onGenerateRow/onVariantsRow/onRunBatch/onGenerateAnchor` 调回原 `generateShotRow/generateShotRowVariants/runStoryboardBatch/generateAnchorCard`；`useStoryboardRunHost.ts` 只负责保存、bindings、assertCurrent，无 present/variants 替代执行。 | `storyboardBatchLanding.test.ts`：Run-bound original row actions keep single-shot, three variants and regeneration on the original runner；`original-storyboard-run.test.mjs` 保留原完整 editor/control 命中。 | 代码闭环；逐按钮真实付费和 GUI 证据仍由主代理验收。 |
| F02 Agent anchor 不能打开 | `generationPlanEditorial.ts:storyboardSubjectFromCandidate` 与原 `editorialFromDraftSubjects` 保存完整原 anchor 作者形状；admission 对缺 kind/carrier 明确拒绝，不产生不可编辑合法草稿。 | `storyboardSaveAcceptance.test.ts` 的 F02 admitted Agent anchor、producer conflicting author facts、compact original author fields。 | 代码闭环；不声称所有旧缺失作者事实数据可无损补造，旧不完整 envelope 会显式失败。 |
| F03 标题编辑丢单候选引用 | `generationDraftFromStoryboard` 只更新 `editorial`，完整保留原 candidate/references/nodeId。 | `storyboardSaveAcceptance.test.ts` F03 title-only editing preserves single candidate reference identity and binding；legacy indexed preview URLs。 | 代码闭环；真实参考素材供应商执行需独立证据。 |
| F04 视频模型沿用图片执行身份 | 原作者事实保存在 editorial，原 rowActions/runner 从当前原 plan 解析媒体模型；旧 candidate 作为既有执行事实保留，不再把旧 module/mode 强塞新编辑内容。 | `storyboardSaveAcceptance.test.ts` F04 明确验证新 video/model 在 reopened editor，旧 candidate 保持历史身份；原 rowActions runner 测试与 F01 共用。 | 代码闭环；F04 测试自身不证明所有供应商模型组合执行成功。 |
| F05 submitted 后无法保存 | `productionStoryboardAuthoring.ts:saveStoryboardAuthoring` 允许作者编辑；仅撤销 changed+sealed+waiting 的旧授权，submitted 的合同/jobs/gates 保留。repository 同步提交比较 `expectedContentToken`。 | `storyboardSaveAcceptance.test.ts` F05 editing submitted author content preserves frozen execution and active jobs；content token excludes execution revision/node binding/selection。 | 代码闭环；真实重开/进度并发 GUI 由主代理验收。 |
| F06 原首帧/引用依赖图丢失 | 原 editor Place 调 `runStoryboardBatch(...placementOnly:true)`；生成也回原 rowActions，host 提供 `storyboardRunBindings`；不再用普通 candidate landing 代替完整分镜图。 | `storyboardExec.test.ts` 图片+视频镜按需建首帧/first_frame edge；`storyboardBatchLanding.test.ts` missing keyframe、captured/durable Run bindings、重复原动作。 | 代码闭环；原通用 candidate landing 的 edges=[] 并未被冒充完整作者图，真实首帧视频证据另列。 |
| F07 两份 landing 状态 owner | 当前 `productionRunService.ts` 不再创建 landing host；`appIntegration.ts` 保留唯一 `createCanvasLandingHost`，付款准备仍等该实例 `settleCanvasLanding`。 | 现行 service 源码零重复工厂；`electron/productionRun/explicitCanvasPlacement.test.ts` 与原 canvas landing 测试为相关证据（本轮未重跑）。 | 静态所有权闭环；不虚称已做每种并发竞争真实注入。 |
| F08 同 Run 新报价继承旧卡编辑 | `useAgentPanelSpendConfirm.ts` 用完整 `spendDraftKey` 切换/恢复草稿；`persistEdits` 携原 quoteId并串接明确 successor quote；`appIntegrationSpendConfirm.ts:revisePendingSpend` 在读取和异步后校验报价。关闭仅 discard，未批准草稿留在既有 draft store。 | `spendCardDraft.test.ts` dismissed input only identical content/scope、partial consumption、both layers cancel；`spend-panel-write-ownership.test.mjs` 为实际 hook harness。 | 代码闭环；真实3/33和关闭恢复采用主代理独立证据，不以此表替代。 |
| F09 正式参考 resolver 未装配 | `appIntegration.ts` 正式 prepare 调 `prepareProductionGenerationAuthorizationWithReferences`，其默认调用 `resolveProductionReferenceUrls`，按实际 scope 固定 reference URL snapshot；fixture override 仅显式 E2E。 | `generationProviderBootstrap.test.ts` 正式 reference snapshot/approved URL 装配；`productionReferenceUrls.test.ts` 版本变化/错项目/异步切项目；provider resolver 测试。 | 正式装配代码闭环；所有真实供应商上传/消费不可仅由 helper 测试宣称通过。 |
| F10 新参数不保存 | `spendCardDraft.ts:candidatePatchFromNode` 以原 `resolveRenderedControls` 声明与旧 key 并集合取值，不只遍历旧参数。 | `spendCardDraft.test.ts` saves declared model controls absent from original candidate；双层覆盖测试。 | 代码闭环；实际模型全部动态控件的 GUI 验收另列。 |
| F11 未知失败说没花钱 | hook 失败统一使用 `agentPanelV4.spendActionFailed`；zh/en 当前文字均为结果尚未确认并建议查看任务，不承诺零扣费。 | 已核 hook catch/ok:false 路径与 `src/i18n/locales/agentPanelV4.ts` 双语值；本表未找到/执行独立文案故障注入测试。 | 代码/文案闭环，实际网络中断时提示体感未在本轮验证。 |
| F12 损坏存储变 not-found | `productionRunRepository.ts:read` 仅双文件缺失返回 null；存在但不可恢复抛 `ProductionRunParseError`，读权限错误经 `readOptionalRecord` 抛出；保留原 typed absence。 | `productionRunRepository.test.ts` corrupt snapshot + missing/empty/wrong-shape history、K3 permission；新 `productionRunJournalAcceptance.test.ts` 旧行损坏/截断/替换/权限和恢复。 | 代码闭环；测试是实际临时磁盘，不是 only mock owner。跨 service/transport 当前套件由主代理全量记录。 |
| F13 schema/runtime domain 不一致 | `verbProjections.ts` query/cancel 的 `domain:taskDomainSchema` 已不 optional；原 lane runtime 仍要求 domain，不加猜测路由。 | declarations/model-face 原合同；`tests/agent-runtime/laneL1Scenarios.mts` check_job/cancel_job 场景携 domain。 | 代码契约闭环；真实模型工具写对率仍单列。 |
| F14 first-frame 被降为普通引用 | `spendCardReferences.ts:applySpendReferences` 仅 character/reference 允许相互普通槽映射，first/last frame 精确匹配；`referenceInputsFromNode` 保留不支持槽与不可预览的原绑定。 | `spendCardReferences.test.ts` unsupported first-frame inactive、canonical first/last identity、image/video/audio original order。 | 代码闭环；不支持槽保持原角色，不宣称该模式能够执行不支持引用。 |
| F15 await 后跨项目写画布 | 在原 `materializeShots` 捕获既有 `withProjectAction` lifetime，核对显式 projectId；原 `applyCanvasToolCall` 的 canWrite/assertTargetCurrent 接收该 guard；`inLandingTxn` 每写前复验，两个 await 后、fit、持久化前后和返回 bindings 前复验。主进程付款/后台生成不变。 | 首轮真实 store+项目协调器故障注入 3 红（model A→B、A→B→A、create后切项目误加table）；修后连同同项目阳性、持久化后stale bindings、入口错项目/无项目及邻接测试 **4文件32/32绿**；根因合同48/48、app tsc、eslint、diff检查通过。日志 `/private/tmp/nomi-f15-red.log` / `nomi-f15-final-green.log`。 | **现已代码修复并定点验证，root 已逐处复审原 lease 捕获、await 后及每次 store 写入的 guard；待最终集成验收。** 未运行 GUI，不冒称真实跨项目页面已验收。 |

结论：F15 在本次逐项核对中确实尚未关闭，随后按授权在原 owner 修复且红绿验证；其余项为当前源码机制闭环，不等价于整体验收/全部平台/全部供应商通过；未观察到新增替代分镜页面、runner 或重复持久化 owner。


## 收尾只读复审与门表澄清

- F15 合同 170→171 是补录已存在的 `rebindLandedShots` 门，不是新增生产入口；已在 `door_reduction.why_not` 明示。该函数及其调用在修前源码已经存在。
- 已追实际调用一跳：生产唯一普通入口为 `handleCapabilityApply` → `handleMultiShotCanvasLandingOp` → `materializeShots`；主进程 `buildMaterializeShotsPayload` 始终携 `run.projectId`。renderer 严格捕获原项目 lifetime，无会话时拒绝投影。`landCanvasForRun` 已有 best-effort catch，返回 false 而非取消批准的后台任务，所以不存在必须在无 renderer 会话下写当前 store 的合法后台入口。
- 直接调用 `materializeShots` 的测试仅 `multiShotCanvasLanding.test.ts` 与 `agentDraftSingleLedger.test.ts`，现均安装原 `createProjectSessionTestHarness`。`storyboardPresent.test.ts` 通过 handle 函数走 authorContentToken 分支，已有自己的项目 guard mock；没有发现第三个遗漏的直接 fixture 或合法无会话写入调用。
- 已读当前 Slider 单行差异及安装的 Mantine 源码：`ParameterControlBody.tsx` 使用 `@mantine/core`，`Slider` 的 `thumbLabel` 被透传给 `Thumb` 的 `aria-label`（`node_modules/@mantine/core/esm/components/Slider/Thumb/Thumb.mjs:45`），原 `aria-label` 在 wrapper 不能为真正 role=slider 命名。改为 thumbLabel 不改数值、步长、min/max 或 onChange。本次只读核对未发现该修法的新增风险，没有运行 GUI。
- `.nokey` 与后续 React Flow position 修复也出现在当前 dirty production，不能在最终账本中只列 F15/Slider 而漏掉。已静态确认 installed XYFlow 键盘处理使用 target.closest('.nokey')。非拖动 position 写原 store、发 gesture、commitPersistedChange，以及 `canvasDragDraft` 的 hasDefaultNodes 变化需要主代理按其新增回归/真实键盘旅程归因，不能冒称本项有限复审已替它们完成验收。

## 最终审计账本更新方法（未运行昂贵阶段）

已读 `scripts/audit-core-a-changes.mjs`：

1. 冻结最终工作树后，使用全新且为空、位于仓库外的目录：
   `node scripts/audit-core-a-changes.mjs --base origin/main --out /private/tmp/nomi-core-a-final-frozen-inventory`
   不传 `--run`：仅生成完整分支相对真实 merge-base 的清单/patches/report.json，不启动 tests/build/GUI。脚本的 sourceIdentity 同时绑定 HEAD 和包含 dirty/untracked 的 tree。
2. 对照此前 `/private/tmp/nomi-core-a-integrated-drift-audit/report.json` 与 `semantic-reviews.json`。只有 `path + baseBlob + currentBlob + patchSha256` 均一致的文件可继承既有逐 hunk 判断；当前 hunk 数字 ID 会因文件排序变动，必须重映射到新 report，不能照抄旧 ID。任何新增/删除/改名/内容或 base 变化的文件重新读实际 patch，尤其本轮 F15、Slider、nokey、RF position、测试/合同/文档变化。
3. reviews JSON 每个文件需 `path`, `patchSha256`, `hunks`；每个 hunk 必须有新清单中的 `id`, `verdict`（correct/incorrect/uncertain）, `attribution`（existing/introduced/not-a-defect/unknown），以及非空 `priorBehavior/newBehavior/rationale/evidence`。所有 hunk 都需裁决；禁止因定点测试绿批量填 correct。当前 tree 继续变动则旧 hash 判断失效。
4. 在另一个全新空目录应用 reviews：
   `node scripts/audit-core-a-changes.mjs --base origin/main --out /private/tmp/nomi-core-a-final-frozen-reviewed --reviews /private/tmp/nomi-core-a-final-semantic-reviews.json`
   可重复 `--reviews` 传互不重叠的文件集；脚本拒绝重复文件、过时 patch hash 与不完整 hunk。输入树必须与步骤1相同。只有所有文件每个 hunk correct，semanticStatus 才为 reviewed-no-open-findings。
5. 不把 inventory 模式报告的 validationStatus=not-run 改成通过；在现行 acceptance 文档单列已实际执行的 unit/contracts/build/GUI/paid/package 平台、日志、时间与对应 source identity，并标记后续代码变化触发的必要重验。`--run` 会串行启动 matrix/contracts/unit/build/E2E/canvas/performance/真实旅程，不适合当前仅更新账本任务。


## 最终系统验收追加：C19 的测试判据纠正

- `/private/tmp/nomi-core-a-shortcuts-final-v20.log`：macOS 真实 Electron 17 项通过。整组删除一次 Undo，完整节点/结果/历史/内外边/组在 live 与磁盘一致；真正 dismissed 的 Run/批准账本不变；提示词和文稿 Delete/Undo 不串域、零供应商请求。
- v14–v19 红灯全部保留。Home 在 macOS 不代表移到行首，改用 Meta+ArrowLeft，并验证确实选中首字 C。原 canvasNodeActions 手工编辑分镜节点会设置 overriddenFields=['prompt']，这是保护手工覆写的既有行为，期望显式包含它，不改生产。
- 最后红灯的关键证据：DOM selection 为 C，但 Tiptap state 仍 from=18/to=18，Delete 被编辑器处理而未修改。原 ProseMirror DOMObserver 通过 selectionchange 同步选区；测试现等待该真实编辑器 state 到 from=1/to=2 且 view.hasFocus()，而非固定 sleep。v20 通过。WorkbenchEditor/useNomiRichTextEditor/persistentSelection 相对当前基线均无差异，未为过测试修改产品。
- 更早 C19 fixture 已按原契约声明 renderKind/shotIndex、真实 JPEG 解码尺寸；hydrate 的 frameBounds 单独验证，删除/Undo 仍比较完整结构，不删字段断言。

## 最终全量基础验证

- `/private/tmp/nomi-core-a-unit-final-v10.log`：1,516 文件通过，13,964 测试通过、3 跳过；SDK 482、janitor 13、stats 8 全通过。退出码 0。
- `/private/tmp/nomi-core-a-contracts-final-v10.log`：全部阻断性门岗通过；文档类 advisory 仍如实保留。随后仅测试/合同说明更新应在交付前补相应检查，不把 v10 身份冒称最终提交身份。
- `/private/tmp/nomi-core-a-composer-final-v12.log`：partial CJ4 真 Electron 通过，含实际 Slider5→6、取消拖动晚事件拒绝、多选键盘移动/一次Undo/落盘/冷重启。全应用 lazy 故障及所有平台仍不能由这条推出。


## 原测试增量人工复核

- `productionRunJournalAcceptance.test.ts`：历史parse计数由输入文本子串改为原JSON.parse返回对象的eventId字段，避免将含嵌套eventId的缓存clone计入历史重解析；新增冷owner至少13次的阳性对照，热读取/append/replay原上限1/1/2不变。隔离对象破坏改为对unknown payload整体赋值，仍验证破坏调用者对象不污染owner缓存。不是提高性能预算。
- `multiShotCanvasLanding.test.ts`：真实project session harness签发/撤销原lifetime，等待点设在原model IO、实际create之后、persist之内；A→B→A不复活、同项目阳性仍写、无项目/错project零写均保留。模型查表与persist为受控替身，因此它不证明GUI项目切换或真实磁盘持久化速度。相邻agentDraftSingleLedger只补原project前提，原候选身份与幂等断言未删。
- `core-a-storyboard.paid.mjs`：verify-only在approve和新首帧旅程入口都断言禁止，恢复缺图也不得补付费；新增两端build stamp一致、固定期望keyframe prompt、candidate/editorial/result provenance四项参数对应。480p精确短边480没有供应商契约支持，改为记录请求preset和真实尺寸不匹配，同时继续严格核已授权duration/audio/model/resolution、视频可解码及既有身份/attempt；不改生产产物、不resize图。
- `canvas-magnetic-handle.walk.mjs`：原CSS高度min(168,nodeHeight+28)，上游真实比例节点高度135时应为163，旧固定168预期不成立；现在测实际card高度并验证原表达式，宽112和真实拖接等断言保留。
- `canvas-card-stack.walk.mjs`：原测试同文件首次点击聚合边已用findEdgeHitPoint，重开后第二次仍点击SVG外框中心，v11被节点子树遮挡而失败。新调用复用同一helper重新取实际线段命中点，明确非空后真实mouse.click，不force/dispatch、不改生产；v12完整走查退出0。原history视频打开与重开也在该实际旅程通过。
- R14.3追加了错误oracle纠正原则，未改任何门禁基线、timeout或截图基准。


## F16：最终真实宿主断言发现参数 portal 键盘串域

- `/private/tmp/nomi-core-a-final-composer-paid-v13.log`：在实际参数面板修改 duration，时长5→6同时 video.x925→930。前轮只验meta/ARIA而未直接比较全部节点位置，组件fixture又自行带nokey，导致验收漏门；撤回任何基于v12推断“参数不移动节点”的结论。
- 根因是React portal保留组件事件冒泡，而原RF isInputDOMNode按真实DOM closest('.nokey')判断。body portal不在composer DOM后代。不是React Flow位移算法错误，不禁用原节点键盘移动。
- 同类扫描：原InlineParameterBar的单/多参数、inline/portal与原NomiSelect可聚焦供应商按钮。后者也是body portal，搜索INPUT本身已有保护但chip BUTTON没有。原AnchoredPopover已有框架nokey，不重复修改。
- `/private/tmp/nomi-portal-keyboard-red.log`：真实RF＋原组件五路均复现x80→85，参数及换供应商动作仍发生。fixture未自行添加nokey或复制按键算法。最小修复只在原两种参数表面根和NomiSelect.Dropdown加框架原生nokey，共3处class变动，不改布局/数值/写入owner。
- 复验：`nomi-portal-keyboard-green.log` 15项通过、0 pageErrors，含五路原组件及节点自身Arrow阳性；原InlineParameterBar单测17/17。真实Electron `composer-final-v14`完整通过，明确参数不移动任何节点。build/package-final-v14已含三处class修复，生产tree `e96a8390eb94bcfb0cc239a180ba587f1face187`；包内MCP 23工具/165资源。真实付费verify-only v14新进程恢复通过、未增加attempt。前面的完整性能/7旅程属于修补前构建，不冒称相同source tree。


## C18：候选包测试必须保护原有行为

- v14 红测将“显式编辑后所有画布字段不变”当作原契约，错误拒绝了原 `projectStoryboardDesign` 对准确绑定、未覆写节点的 prompt 投影，以及原隐藏 keep-alive footer 的高度测量。现以独立原转换器和原 DOM 测量计算精确预期，不修改生产。
- v15 实际完成保存、冷重开、JPG 时间轴和 MP4 导出；随后失败因三个原 SVG 结果被既有媒体 owner 补齐解码尺寸。改用原 `nomi-local` 结果独立 Image.decode；仅原尺寸三字段全部缺失时允许精确三元组，原 result/history 和其他字段继续完整深比较。
- v16 导出实际成功，但测试先捕获 `.partial.mp4`，原 exporter 完成后原子重命名，测试持续 probe 不存在的临时路径而超时。仅筛除临时文件，保持真实最终 MP4 解码/时长断言、原等待上限及生产逻辑。
- 独立审查另补最终 stopApp 后的零文本/图片请求断言；保留源码全文件 hash、Run 文件 hash、五种拒绝格式字节不变、原图完整核对。旧格式夹具明确为历史副本上的合成 retired 字段，不冒称真实历史 v1 或 T3 迁移验收。
- 全部旧红日志保留；最终旅程结果见现行验收表及候选包收据。
