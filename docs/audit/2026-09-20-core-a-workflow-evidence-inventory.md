# 简化 A + 完整 T7：真实工作流证据清单

## 主代理最新实测：不是全量通过

以下追加覆盖后文 14:55 UTC 只读快照中的“空白/Agent待复验”状态；后文历史记录保留原证据边界。修复已实现未推送，用户当前真实数据窗口未更新，PR #828 未合并。

| 从用户任务出发的流程 | 应有结果 | 当前实测对比 |
| --- | --- | --- |
| 在文稿 A 点新建方案，编辑；再在 A/B 分别新建，关闭重开 | 原编辑器直接出现空白方案；四份独立保存；不调用模型 | **本轮通过此子流程**：原按钮创建四份，标题/prompt落盘和新进程恢复，0 text/0 image/0 unexpected。初始文稿是预置，完整 W01 的原文稿新建及同名组合仍未验 |
| 在原聊天明确要求为当前文稿创建方案，选择、改 prompt、放置/查看、单镜及批量、重开 | 原 Agent 正常工作，原编辑器/runner复用，结果和节点身份保留 | **本轮通过已列步骤**：两文稿四 Run、原 prompt 编辑、单镜与一镜批量各一次 loopback提交、取消零提交、三进程重开。不证明所有参考/模型控件已编辑 |
| 在画布选择数量3、批准，第一请求等待时切到 B，再回 A | 三个批准结果仍归 A，B不变，不重复请求 | **本轮通过**：3 wire calls、3 A结果、B完整图hash及媒体不变。不是原分镜行×3入口 |
| 分镜删除一镜，切画布移动节点后 Undo/Redo；回表编辑后撤销删除，再重开 | 不串工作区，不误把Redo当Undo，不覆盖后来编辑 | **本轮通过**：legacy/Run均经原菜单与键盘；后续标题/prompt、画布结果、冷恢复和批准账本检查通过 |
| 四方案各改参考槽、模型/供应商、批量与行参数、首帧，再重开 | 每个原控件写对原方案，完整字段不丢 | **未完整验证** W02；不能用预设字段保留或prompt单项通过替代 |
| Agent等待时切项目/文稿/方案，人工改删原目标；重复/乱序回执 | 回原目标或明确拒绝，不串写、不抢焦点、不复活删除对象 | **缺完整真实旅程** W03–W05；已有受控保护测试，未证完整 UI/IPC/持久化组合 |
| 33项只选3项，卡中编辑，批准，仅执行3项；再申请剩余 | 卡、价、授权、实际请求对应同集合 | **缺完整真实旅程** C02/C11；历史卡范围和零提交测试不证明批准后执行集合 |
| 关闭付款卡再重开；确认/关闭竞争；回包丢失后恢复 | 草稿与节点保留；裁决一致；不盲目重复付费 | **历史部分通过，完整异常组合未验** C07–C09；本轮原分镜取消通过不等于Agent付款卡全部通过 |
| 节点单多选/历史/拖动与原生中断后继续输入 | 唯一参数条可交互，内容保留，写对宿主 | **历史分项通过，完整最终组合未验** C24–C27/P01–P08 |
| 参数条实际资源失败，解除故障后点重试 | 恢复编辑且草稿保留 | **明确未修好**：画布与付款卡各有真实失败收据；不能称完整T7通过 |
| 技能附件重发、队列取消/Stop、压缩/重连历史、任务查取消、诊断 | 原输入和任务归属正确，错误安全 | **历史/受控分项证据，当前完整组合未验** C12–C15/C20–C23/C28，逐项见下表 |
| 最后候选包打开旧项目副本，编辑保存、重开及导出；最终分支评审 | 同一最终树的包/证据/评审一致 | **当前未完成** C01/C18/C29/C30；旧付费/旧包收据不冒充此次构建 |

本轮四条 Electron 旅程使用相同隔离构建：HEAD `9cb822c7ad0e952e8df748d3cbb075f12e026da3`，构建树 `1a40e09c22497204acb3a565efd02a445b7152ab`，dirty。为不覆盖用户正在运行的 dist，在 `/private/tmp/nomi-blank-plan-build-20260920` 独立工作树构建。所改两份生产文件与集成工作树逐字节 SHA-256 相同：sidebar `1f865b6e240b14cbbda8f9b455f65db6c3a41524eb443b4f6b62c21abb454272`；document slice `5800d3482c72aad80d430fbbeaace17103ccbccb386ebe0586ff2b6479ffa725`。测试/本文后续修改不被冒称已经编入该构建。

实际证据：`/private/tmp/nomi-blank-plan-electron-green-v2/report.json`；`/private/tmp/nomi-workflow-agent-current.log`（进程exit 0）；`/private/tmp/nomi-workflow-variants-current/report.json`；`/private/tmp/nomi-workflow-undo-current/report.json`。均为 macOS 构建版 Electron、原 UI/IPC/磁盘；供应商为 loopback，本轮新增真实供应商费用为零，不替代最终付费和安装包验收。Windows未验。

### 本次错误与测试裁决

旧 `core-a-creation-runs` 把“点新建”后发出 Agent 请求写成预期，导致错误的产品语义得到了绿色结果。原任务要求本地空白创建；责任在验收未对照批准语义。本轮将手动新建与原聊天明确委托分为独立入口，保留原下游生成/持久化断言；同类 `shot-table-storyboard-projection.walk.mjs` 的旧入口也改为原聊天发送，但未运行该付费脚本，不能记通过。

原按钮红测 tree `7eed1f2b` 实际0方案/1文本请求；修后第一次完整运行在冷恢复整节点比较处失败，唯一差异为原 `projectV51ToV60Migration.ts:114` 补 `renderKind`。保留该失败日志 `/private/tmp/nomi-blank-plan-electron-green/report.json`；断言改为显式期望原迁移值并继续比较所有字段，新进程复跑通过，不通过丢弃节点字段或放宽数量掩盖差异。新建瞬间零节点；作者编辑/显式复制保留主线 `dc113e712` 的原引用表视图，禁止新媒体节点或生成提交。

截图均由主代理亲看：修复前点新建进入聊天（证据见 PR #828 分支）、修复后原空白编辑器（证据见 PR #828 分支）、英文冷重开（证据见 PR #828 分支）、明确Agent创建后的原编辑器结果（证据见 PR #828 分支）、切项目后A保留3个版本（证据见 PR #828 分支）。展开左栏时英文原分镜控件仍有已延期的窄屏碰撞，未以收起截图宣称展开布局通过。

### 后续验收执行规则

每条先写批准依据、原操作入口、预期可见结果与允许/禁止副作用，再看测试代码；不从当前实现反推正确行为。运行前核对测试是否绕过本次修复入口、是否预置了原本待验证的成功对象。预置只支持其后测试的边界，不能向前证明创建/编辑。每条结果必须区分本轮实测、历史证据、受控替身、失败和未验；结论绑定实际构建，不能拼多个旧构建推断完整新版本通过。该规则是本清单逐条复核的方法，未新建测试平台。

## 独立只读核查快照

核查快照：2026-09-20 14:55 UTC。只读核查源码、既有报告和日志；本清单作者没有启动应用、运行供应商、修改生产代码或重新执行测试。唯一写入是本文件。主代理正在构建和复验空白创建及 Agent 创建，结果未收入本快照。

完整读取的批准源：`/Users/aoqimin/Downloads/Nomi_simplified_A_plus_T7_original_storyboard_plan_2026-09-20.md`，共 405 行；C01-C30、P01-P08、W00-W10 均按该文件编号，不按旧测试标题中的 C 编号猜归属。另读 [现行验收](2026-09-20-core-a-current-acceptance.md)、[复修计划](../plan/2026-09-20-pr828-review-remediation.md)、[Ponytail 逐条处置](2026-09-20-pr828-ponytail-disposition.md)、remaining-acceptance 与 T7 历史表。后两表只用于定位证据，不直接继承结论。

状态含义：`historical` 是所列当次报告确有通过记录，不能推出当前修复树通过；`failed` 是已读实际失败报告且没有同边界后续通过证据；`unverified` 是本次没有找到足以覆盖完整条目的实际结果。源码存在、测试标题或 blob 不变均不等于最终运行证据。下表中的“受控”测试可以证明其直接边界，但不能替代真实页面入口。所有 Windows 项均未验证。

## 已核证据索引

时间均为报告或日志文件 mtime 的 UTC 日期时间，表示证据年龄，不冒称测试启动时间。路径为本机实际证据；`/private/tmp` 不是远程 PR 附件。缩写路径的前缀在本表明确给出。

| 证据 | 实际入口与源码位置 | 已直接读取的结果、时间、身份与限制 |
| --- | --- | --- |
| E01 空白创建 | `tests/ux/core-a-blank-storyboard.e2e.mjs:73` 原侧栏按钮，原 editor 输入，磁盘保存，新进程重开。启动前预置两文稿，没有预置方案 | `/private/tmp/nomi-blank-plan-electron-red/report.json`，`status=failed`，09-20 14:45；tree `7eed1f2b`，0 方案、1 text request。新修复和单测已存在，实际 green 在本快照未取得。它仍未证明“通过原新建文稿按钮建立两文稿” |
| E02 Agent 创建与原编辑器 | `tests/ux/core-a-creation-runs.e2e.mjs`：文稿预置；原聊天/工具写 Run，原列表选择、A1 prompt 编辑、显式放置/查看、单镜/一镜批量、付款取消、冷重开 | `/private/tmp/nomi-core-a-electron-creation-v5.log:23`，09-19 23:32，13 checks 历史通过。原 `:61` 点击 New Storyboard 并期待 Agent，是错误产品语义；主代理本轮改为原 `sendCreation` 明确创建指令，尚待新运行。历史日志没有最终 tree 收据，不能套用新脚本 |
| E03 付款卡与 33 选 3 | `tests/ux/agent-spend-card.walk.mjs:34` 原输入触发 `draft_shots -> generate`，真实卡编辑/关闭/冷重开；`_agentSpendScopeJourney.mjs` 的 33 项精确子集、分页/全部、两个 pending | `.tmp/pi-spend-card-development-1789864256177/report.json`，`result=passed`，09-20 00:31。`spendScopeJourney` 明记 33 项、3 requested IDs、零媒体，并明确“不证明 confirmation execution / next-execution-batch / generated-history”。没有当前 tree 绑定 |
| E04 原画布 ×3 后切项目 | `tests/ux/project-switch-background-run.walk.mjs:226` 原添加图片、prompt、参数条数量 3、原确认，第一请求挂起时建 B/切 B，再放行 | `/private/tmp/nomi-pr828-background-variants-final-v3/report.json`，`result=passed`，09-20 11:40，tree `2bc878b2`。实读 3 wire calls，A 结果落盘、B 完整图 hash 不变。入口是画布，不是分镜行 ×3；loopback、非付费 |
| E05 原分镜首帧/批量后切项目 | 同脚本 `:195` 经项目 IPC **预写方案**，重新打开后从原方案/原生成按钮开始；first-frame 旧版为单镜，新版 `:221` 原批量按钮 | `/private/tmp/nomi-pr828-storyboard-slot-green/report.json`，09-20 12:17、tree `8fbc5891`、单镜图/视频各 1；`/private/tmp/nomi-pr828-planned-first-frame-green/report.json`，09-20 12:26、tree `57000efd`、原批量图/视频各 1；均 `result=passed`、视频收到同批 JPEG hash。`/private/tmp/nomi-pr828-background-batch-final-v1/report.json`，09-20 11:58、tree `e03e0c79`、7 calls。都从已有方案开始，不证明创建/参考/模型控件写入 |
| E06 首帧历史失败 | 同 E05 | `/private/tmp/nomi-pr828-background-first-frame-final-v1/report.json`：零请求，模型 archetype 夹具错误；`/private/tmp/nomi-pr828-planned-first-frame-red/report.json`：原批量按钮 disabled，09-20 12:21、tree `8fbc5891`。保留两种不同失败，后者由 E05 对应 green 覆盖，不能抹除 |
| E07 分镜删除/Undo | `tests/ux/core-a-storyboard-undo.e2e.mjs:38` 预置 legacy/Run/结果，`:85` 原侧栏选方案后原删除/键盘 Undo，隐藏 editor 后原画布键盘移动/Undo/Redo，冷重开 | `/private/tmp/nomi-ir02-electron-final-v3/report.json`，`status=passed`，09-20 11:29、tree `7bfc558b`。8 checks，legacy/Run 分开，保留后续标题/prompt、节点结果、批准账本。它证明删除/撤销边界，不证明预置对象能由实际创建流程生成 |
| E08 画布整组删除/输入隔离 | `tests/ux/canvas-shortcuts.walk.mjs` 原 Delete/Undo，文稿/prompt 焦点隔离，完整图与磁盘、零供应商请求 | `/private/tmp/nomi-core-a-shortcuts-final-v20.log:24`、`:34`，09-20 06:43，17 项历史通过；日志没有当前修复树收据，不替代 E07 原分镜撤销 |
| E09 画布参数条/历史 | `tests/ux/core-a-composer.e2e.mjs:163` 原添加节点、`:117` 实际参数键盘、`:147` prompt、单多单/锁定/冷重开 | `/private/tmp/nomi-core-a-composer-final-v14.log:25`，`status=passed` 且显式 `partial CJ4`，09-20 07:21。`:250` 向 store 注入 bundled JPG history，`:273` 直接清 result，`:286/:311` 合成 blur。能证明这些状态下宿主恢复，不能冒充真实生成历史/OS cancel。v13 键盘移动节点红证据仍保留 |
| E10 T7 真实资源失败 | `tests/ux/core-a-t7-recovery.e2e.mjs` 在 Electron 请求边界拦截实际 chunk，原节点/付款卡打开、原局部重试 | `/private/tmp/nomi-t7-canvas-zh-final-v1/report.json`，`status=failed`，09-20 11:12、tree `c458c7b7`；`/private/tmp/nomi-t7-panel-en-final-v2/report.json`，`status=failed`，09-20 13:09、tree `e1d021bb`。两者局部隔离通过，但 retry 后 editor 未出现；后者覆盖付款宿主。受控 factory retry 绿不能覆盖这两条 |
| E11 T7 原生中断 | 同脚本原鼠标拖动、原生 BrowserWindow focus/minimize、原键盘切工作区/删除、组拖动、真实落盘/冷重开 | `/private/tmp/nomi-t7-native-final-v5/report.json`：`passed`、09-20 12:18、zh/tree `8fbc5891`；`/private/tmp/nomi-t7-native-en-final-v1/report.json`：`passed`、09-20 12:33、en/tree `57000efd`。各 7 场景。报告明确未覆盖真实设备 pointercancel/lostcapture；app 没有 readOnly 动态入口，不能以 locked 替代 |
| E12 技能/附件/队列/Stop | `tests/ux/agent-lane-stop-resume.walk.mjs` 原输入与 Stop/Continue；实际技能 chip、本地文件导入、队列取消、旧消息重发/保留新草稿 | `.tmp/pi-lane-stop-resume-development-1789864027903/report.json`，`result=passed`，09-20 00:27，5 text/0 image/unexpected=[]。原 input/replay IDs 与 assetId 实际存在；报告明确未单独观察慢上传反馈。没有当前 tree 绑定 |
| E13 实际 pi SDK / 历史时序 | `tests/agent-runtime/lane-history-compaction.test.mts:58/:121` 两次压缩；`lane-compaction-input-context.test.mts:9` 原意图；原 stop/replay/workspace/trace 组 | `/private/tmp/nomi-a-lane-sdk-approved.log`，09-19 18:41，68 tests / fail 0；`/private/tmp/nomi-c23-sdk.log`，09-19 18:51，7 / fail 0；`/private/tmp/nomi-c23-client.log`，09-19 18:47，25 passed。实际 SDK+loopback，不是原 UI 自动制造压缩。新增/修改后的最终 SDK 运行未由旧日志证明 |
| E14 真实历史 UI/轨迹 | `tests/ux/agent-ui-d-lossless-history.walk.mjs:45` 原 read_script/多轮/冷恢复；`agent-trace-log.walk.mjs:21` 三轮真实工具、会话和项目查看轨迹/Finder 路径 | `.tmp/pi-agent-ui-d-development-1789860756827/report.json` 与 `.tmp/pi-trace-log-development-1789860756802/report.json` 均 `result=passed`，09-19 23:32。前者 5 text，后者 6 text，均零媒体/unexpected=[]。历史 UI 脚本不制造 SDK compaction，第二轮 fixture 文字回复不是实际删除动作 |
| E15 K3/K5/K7 受控真实 owner | `productionTaskAbsence.test.ts:12` 真实损坏文件；`agentPanelSpendConfirm.e2e.test.ts:528` nodeId/draft task；`laneExtendedDesktopPorts.test.ts:43` 两 domain；原 transport/trace/diagnostics | `/private/tmp/nomi-a-k3-k5-k7-final.log`，09-19 18:39，12 files/194 passed。是较早 owner/client 边界，不是完整真实工具/UI任务查询取消旅程；测试名中的旧 C17/C18 不能误映射批准 C17/C18 |
| E16 历史候选包 | `tests/ux/core-a-old-project.packaged.mjs:320` 启动指定 release 可执行文件、复制旧项目，原编辑保存/冷启动/实际 JPG/原 MP4 导出；`:246` 原打开入口拒绝格式，文件选择器受控 | `docs/audit/evidence/core-a-20260920/candidate-v17-receipt.json`，`result=passed`，09-20 07:41，执行文件 SHA `9946a684...`、asar SHA `9fe6e867...`。源码验收表绑定旧 build tree `e96a8390`；收据检查 originalEditor/完整字段/graph/cold/export 均 true。旧 v2 受控项目、3 合成旧分镜字段、5 拒绝格式；非用户生产项目，不是最终新包，不是 Windows/公证发布 |
| E17 既有付费产物 | `tests/ux/core-a-storyboard.paid.mjs:370` 原文稿/聊天建 Run；`:405` prompt 编辑、`:410` 原单镜、`:436` 剩余批量；`:198/:239/:243` 新首帧方案/首帧 prompt/原行生成 | `docs/audit/evidence/core-a-20260920/paid-v14-receipt.json`，`status=passed`，09-20 07:27，verify-only，既有两图+首帧图+视频，不重付。媒体 1.8936 credits、Agent unknown。收据自称当时 final production build，不能转称本次修复树；visualVerdict 明记 EN 底栏碰撞，不是视觉全过 |
| E18 当前差异审计 | `scripts/audit-core-a-changes.mjs` + 逐 hash/hunk 账本，Ponytail 26 项逐条复核 | `/private/tmp/nomi-pr828-audit-v6/report.json` tree `bb2fa74c`；`/private/tmp/nomi-pr828-review-coverage-v6.json` 实读 474 files：424 reuse candidates、14 stale、34 uncovered、2 open/revoked。不是完整语义通过；之后生产/测试/文档仍变。Ponytail 16 已改/10 保留是落实核对，不是新最终分支收据 |
| E19 新受控修复 | `src/workbench/capability/storyboardPresent.test.ts`/原首帧批准链；原 text runner append/replace retry | `/private/tmp/nomi-pr828-agent-model-query-green.log`，09-20 13:02，3 files/24 passed；`/private/tmp/nomi-pr828-stream-retry-green.log`，09-20 12:56，3 files/52 passed。均晚于 E05/E11 部分构建；不由旧 Electron 证明新修改通过 |

## A：逐项映射

同一组的共享证据只读一次，条目仍分别裁决；同组通过一项不自动覆盖另一个异常分支。

| ID | 真实用户工作流 | 已有测试入口/证据 | 当前状态与完整闭环缺口 |
| --- | --- | --- | --- |
| C01 | 在原工作树保护施工，核 tracked/untracked 来源，再确认同版本号候选包来自哪份树 | E18；`docs/plan/2026-09-20-core-a-restart.md:25`；E16 | `unverified` 最终交付身份。历史清单存在，之后 dirty 增量及最终新包须重新绑定；同版本号不能当相同包 |
| C02 | 33 项只选 3 角色，查看卡/价，批准后仅这 3 项真正请求媒体，33 项仍保留 | E03；`electron/capabilityCore/agentPanelSpendConfirm.e2e.test.ts:421` | `historical` 卡显示/编辑子集；`unverified` 同一 33→3 页面链的确认、授权及实际 3 次 wire 提交。E04 的画布 ×3 是另一语义 |
| C03 | 对省略/空/重复/未知/跨项目或方案的选择请求得到准确拒绝，无媒体 | `agentPanelSpendConfirm.e2e.test.ts:435`、`generationTransportAdapters.test.ts:273/:283`、`generationBatches.test.ts:164`；E15 邻接 | `unverified` 本次最终分类完整运行收据及真实工具入口负向矩阵；源码负控不是每种输入已执行证明 |
| C04 | 在选定批次卡里翻页、逐镜和“全部”修改，再切另一批次 | E03；`tests/ux/spend-panel-write-ownership.test.mjs:177/:198` | `historical` 真实卡两 pending 顺序与草稿隔离；当前树复验未取证。任意 pending 导航和确认后另一批次仍不能推出 |
| C05 | 卡展示后改 prompt/模型/范围/版本或超预算，再点旧批准；已提交任务继续使用封存输入 | `agentPanelSpendConfirm.e2e.test.ts:483`、`productionGenerationAuthorizationFlow.test.ts:187/:505`、`storyboardSaveAcceptance.test.ts:33`、`storyboardConfirmationGuard.test.ts`；E19 | `unverified` 最终真实原卡等待期正反场景；已有原 runner/owner 受控保护，后台切项目不能替代内容已变拒绝 |
| C06 | 双击确认/重放同授权，再查真实请求次数及原结果 | `agentPanelSpendConfirm.e2e.test.ts:109`、`productionGenerationSubmission.test.ts:100` | `unverified` 当前实际 UI 双击闭环；owner 幂等已有测试，单次正常确认的 E04/E05 不能证明重复确认 |
| C07 | 请求被接受但回包丢失，重启后查看/恢复；unknown 费用不当零或重新付款 | `productionGenerationSubmission.test.ts:153/:446`；E17 仅正常既有产物恢复 | `unverified` 实际 app 的 accepted/lost-response/restart 受控供应商旅程。不能用正常付费产物冷恢复或旧余额推断 |
| C08 | 关闭卡、继续编辑、关项目再开；内容/图/结果都在且卡不复活 | E03；E02 原分镜 cancel；E17 历史取消 | `historical` 卡关闭/冷重开与原动作取消部分证明；`unverified` 当前树完整非空历史+原分镜关闭后冷重开组合 |
| C09 | 卡刷新时快速确认或关闭，同一请求只得到一种裁决 | `agentPanelSpendConfirm.e2e.test.ts:376/:388`；E03 只正常关闭 | `unverified` 当前原宿主竞争轨迹；受控延迟 close/变更 quote 测试不能称真人并发完整通过 |
| C10 | 选定镜头缺参考或首帧，报价明确新增依赖；未批准不得偷偷多执行 | E05 首帧确认 2 / wire 2；`storyboardFirstFrameApproval.test.ts`；`storyboardBatchLanding.test.ts:190` | `historical` 首帧图→视频；`unverified` 角色/场景锚等未生成依赖的真实参考生成和扩大范围重新确认，不以首帧一种依赖替代全部 |
| C11 | 第一批成功、失败或关闭后请求剩余，身份和已有结果不变 | E17 原两图单镜成功后生成剩余；E03 关闭后同 operation 重新展示；`generationBatches.test.ts:123/:189` | `historical` 成功/关闭的不同局部证据；`unverified` 同一当前真实项目失败→剩余批次，不克隆方案、不重付 |
| C12 | 让 Agent 用 nodeId 查任务被拒，再用正确 taskRef 查到同项目任务 | `agentPanelSpendConfirm.e2e.test.ts:528`；E15 | `historical` 实际 repository/service/operation 受控链；`unverified` 当前真实 Agent/UI 错误→正确任务的连续体验 |
| C13 | generation/export 恰有相同 raw ID，分别查/取消，不带 domain 拒绝 | `laneExtendedDesktopPorts.test.ts:43/:65`；E15 | `historical` 两 owner 计数边界；`unverified` 当前真实两域任务闭环，不能以 mock owner 的返回值冒充真实执行取消 |
| C14 | 查/取消中发生伪造 code、合成 secret、权限、超时或损坏；显示安全且不误取消别域 | `productionTaskAbsence.test.ts:12`、`generationTransportAdapters.test.ts:66`、`laneExtendedDesktopPorts.test.ts:56`；E15 | `historical` 损坏真实文件和 transport 负控；`unverified` 当前工具到 UI 安全错误投影及各故障组合 |
| C15 | 对尚未执行的 Run/节点查任务，显示尚未执行而非不存在/失败 | `agentPanelSpendConfirm.e2e.test.ts:528`；E15 | `historical` owner typed not_started/零 jobs；`unverified` 当前原 UI/Agent 可读反馈 |
| C16 | 新旧项目分别改 prompt、参数、引用和结果，保存关闭再开 | E01/E02、E07、E16/E17；`storyboardSaveAcceptance.test.ts:91` | `historical` 多种局部保存；`unverified` 当前四方案真实控件全字段编辑冷恢复。预置字段往返不等于控件写入正确，见 W02 |
| C17 | 等 Agent/保存回调时切文稿、方案、项目，再放行；不串写/抢焦点 | E04/E05 只证明已批准执行后台归属；`storyboardWriteOwnership.test.ts:27/:35/:42`、`storyboardRunDraftSession.test.ts:5`、`storyboardPresent.test.ts:48` | `historical` 后台执行子场景；`unverified` W03 的真实 Agent 写入和保存 ACK 切目标，不能混为一条通过 |
| C18 | 候选包打开旧字段、半迁移/不支持格式，准确拒绝且源文件不改 | E16；`tests/ux/core-a-old-storyboard-formats.mjs` | `historical` 旧包实际打开/拒绝/源 hash；`unverified` 当前最终候选包。历史 root/project.json migration 及 Windows 明确未验 |
| C19 | 画布整组 Delete→一次 Undo；焦点在文稿/prompt 时只编辑文本 | E08；E07 邻接原分镜 Undo | `historical` 真键盘/磁盘通过；当前最终树尚未复验。预置组可用于删除边界，不等于原创建/分组入口全过 |
| C20 | 带技能与真实附件的旧消息重发，同时保留当前新输入/技能 | E12 原 UI；实际 SDK `lane-original-input.test.mts`；E13 | `historical` 原文件/chip/输入身份/新草稿均有直接证据；当前树仍须关联复验 |
| C21 | 队列取消恢复输入；准备期 Stop、晚 ACK 后发新输入，旧请求不后来排队/误停新请求 | E12 覆盖队列取消与流式 Stop/Continue；E13 `lane-input-stop*.test.mts`/`lane-abort-input.test.mts` | `historical` 真实正常路径+SDK时序；`unverified` 真实 UI 准备期/late ACK 各负向分支的组合，不能把流式 Stop 代替准备期 |
| C22 | 实际 SDK 压缩两次并移除原输入尾部，界面历史/标签和后续模型任务均保留 | E13；E14 冷历史是独立旁证 | `historical` SDK+loopback 压缩/模型上下文；`unverified` 同一实际 Electron 会话制造两次压缩后显示/操作。E14 没制造压缩，真实供应商能力未验 |
| C23 | 空闲/重连/切分支时历史分页或流式回包晚到，不串页/重消息/借旧权限 | E13 `lane-history-compaction.test.mts:13`、`laneClient.test.ts`；E14 多轮/冷重开 | `historical` owner/client 延迟页组合；`unverified` 当前 UI 网络重连/分支切换完整轨迹，静态历史重开不是重连竞争 |
| C24 | 单→多→单，A历史→B→A，再移除 A 结果，参数条仍可编辑 | E09；`composerLifecycle.test.mjs:36/:224/:311` | `historical` 真宿主交互但 history 注入/result 清除为受控；当前真实生成历史完整流程及类型变化另验 |
| C25 | 拖动/缩放中失焦、cancel、卸载、readOnly，释放原手势后继续编辑 | E11；`composerLifecycle.test.mjs:165/:203/:216`、`selection-drag-lifecycle.test.mjs:40` | `historical` macOS原生 focus/minimize/切面/删除/组落盘；`unverified` 真实 pointercancel/lostcapture 与其他 OS；readOnly仅原组件边界 |
| C26 | 首次加载/资源失败重试、舞台零尺寸恢复、边缘缩放后实际输入 | E10；`composerLifecycle.test.mjs:52/:189/:235`；E09 点击命中 | `failed` canvas zh 和 panel en 的真实 chunk retry；零尺寸/四边/缩放只有受控几何证据，不能用其绿覆盖失败 |
| C27 | 画布和付款卡同控件各自编辑，未批准卡只改草稿、不提前生成 | E03/E09；`spend-panel-write-ownership.test.mjs:136` | `historical` 双宿主真实控件+负向写入断言；E10 付款资源失败仍阻塞完整宿主可用性；当前树待复验 |
| C28 | 查看当前会话/项目轨迹；缺文件准确提示；合成 secret/越界路径不泄露或改变原 session | E14；E15 `agentTraceIpc.test.ts:95/:121`；E13 `lane-trace-redaction.test.mts:23` | `historical` Finder/真实工具与SDK冷重建脱敏分开证明；当前实际 UI 故障反馈/最终树未复验 |
| C29 | 安装/启动最终候选包，打开旧项目副本、编辑保存重开、原导出 | E16 | `historical` 旧 macOS release app 可执行文件直接启动，不等于最新安装流程、公证发行或 Windows；当前最终包 `unverified` |
| C30 | 把最后 dirty 改动纳入提交、secret扫描/评审/包/manifest都绑定同一树 | E18、[Ponytail处置](2026-09-20-pr828-ponytail-disposition.md) | `unverified`。424 精确匹配只允许复用候选，14 stale/34 uncovered/2 revoked不能关闭；最新 blank/Agent入口修正晚于清单 |

## T7：逐项映射

| ID | 真实用户工作流 | 已有测试入口/证据 | 当前状态与完整闭环缺口 |
| --- | --- | --- | --- |
| P01 | 选一个节点发现参数条异常，记录挂载/visibility、选中/primary/multi/readOnly/kind/history/drag owner/lazy/rect | E09 `checkEditor` 记录真实 rect/hit/selection；E10 记录 failure boundaries | `historical` 部分定位字段；`unverified` 完整失败状态矩阵，不能先假定 z-index。旧 node.removed 未归因 |
| P02 | 单选唯一参数条、多选原批量入口；素材/锁定/缺模型/缺引用/生成中可用或有原因 | E09 单多单、锁定 prompt 禁编辑但参数允许、缺首帧；`spend-panel-write-ownership.test.mjs:150` readOnly | `historical` 已测子集；`unverified` 实际 Base 节点素材/缺模型/生成中完整矩阵与每项输入。不能只查 DOM 存在 |
| P03 | A历史→B→A，结果消失、kind变化、卸载后回来，未发送 prompt保留 | E09 原历史按钮及受控结果；`composerLifecycle.test.mjs:36/:224` | `historical` 切换与草稿；kind变化/身份重置主要受控。完整当前原生成历史→结果删除→恢复 `unverified` |
| P04 | pan/拖节点/Alt复制/组拖/滚轮在各种中断后继续工作，提交已应用位移且不串 stage | E11 七场景；`selection-drag-lifecycle.test.mjs:40/:79`；`composerLifecycle.test.mjs:165/:180/:203/:216` | `historical` zh/en原生窗口中断；真实设备 cancel/lostcapture、真实滚轮接管组合 `unverified`。readOnly app无入口，明确组件级 |
| P05 | lazy占位→资源失败→原位retry保草稿；零尺寸再显示、四边与缩放恢复 | E10 两宿主真实失败；E09/E11 原恢复旁证；受控 geometry/retry | `failed`。原位retry不能恢复，不接受重启/随机key/入口 URL 实验当交付；依赖失败同样须覆盖 |
| P06 | 保留原定位控件，只有框架对照证明兼容才替换 | `composerLifecycle.test.mjs:189/:235/:245`；历史 T7 表记 NodeToolbar缺clamp/flip，原owner保留 | `historical` 原几何边界受控依据；没有换框架，不要求虚构新 UI 旅程。实际宿主边缘/零尺寸完整组合仍挂 P05/P08 |
| P07 | 画布参数条与付款卡分别输入，卡未批准时画布/方案/媒体不变 | E03/E09；`spend-panel-write-ownership.test.mjs:52/:70/:79/:136` | `historical` 正常双宿主编辑/上传晚回负控；E10 付款retry `failed`。双宿主不能只测共享组件一次 |
| P08 | zh/en实际点击命中/键盘/文字与参数编辑，磁盘保存、重开后内容一致 | E03/E07/E09/E11/E16/E17 | `historical` 各构建局部真输入/磁盘/双语；`unverified` 最终相同构建组合、Windows。EN分镜底条碰撞为明确延期 T-DS-01/A-2，不得当整页视觉通过 |

## 分镜：逐项映射

| ID | 真实用户工作流 | 已有测试入口/证据 | 当前状态与完整闭环缺口 |
| --- | --- | --- | --- |
| W00 | 对完整差异追踪新增适配/metadata/compiler调用者，逐增量保留/调整/撤除 | E18；复修计划与26项处置 | `unverified` 当前完整树。这里是审计工作流，不用GUI测试替代；不用历史静态通过冒充现在行为 |
| W01 | 原页面建D1/D2，各建两方案，四者来回切；同名仍按ID对应 | E01空白新路径；E02 Agent四Run路径 | `failed` 已读空白red，新实现待green；Agent旧入口已修未复验。两脚本都预置文稿，且标题不同；“原新建文稿按钮”和“同名方案”尚未覆盖 |
| W02 | 四方案分别编辑标题/prompt/批量及单镜参数/模型供应商/参考槽/首帧，真实保存再冷重开；目录暂失不清模型 | E01 UI改 title/prompt；E02仅A1 prompt；E17首帧prompt；`storyboardSaveAcceptance.test.ts:91`字段往返 | `unverified` 完整矩阵。预设的模型/参数/keyframe被deepEqual保留只证明不丢，未证明各原控件写对目标。混合图/视频+锚+已有结果、目录失败后保留同一项目尚缺真实闭环 |
| W03 | D1-P1 Agent修改/新建挂起，切D1-P2再D2-P1，放行后原目标可见且不抢焦点 | `storyboardWriteOwnership.test.ts:27`、`storyboardPresent.test.ts:48`；E02正常创建、E04/E05生成后台为旁证 | `unverified` 实际 Agent发送/队列/工具写口完整等待切目标，不得用预seed或付款后后台执行代替 |
| W04 | Agent等待时人工改/删原方案或目标镜头，放行后冲突保人工草稿/缺失不复活 | `storyboardWriteOwnership.test.ts:35`、`storyboardRunDraftSession.test.ts:21`；`original-storyboard-run.test.mjs:84`原editor但command替身强制conflict | `unverified` 实际repository冲突/删除与真实Agent晚回包的组合。harness直接设置conflict布尔值不等于真实写入处冲突 |
| W05 | 同一创建/保存回执重复；新保存先回、旧ACK晚回；切换/冷重开保持新内容与唯一身份 | `storyboardRunDraftSession.test.ts:5/:32`、`productionGenerationOperationStore.test.ts:128` | `unverified` 实际页面到磁盘重复回执与乱序ACK；连续正常输入/四个不同创建不等于重复同请求 |
| W06 | 同方案原动作按需落节点，再查看/重复/并发；只缺首帧或锚时只补缺项 | E02先place再view复用一主体节点；`storyboardBatchLanding.test.ts:82/:120/:142`、`storyboardOverrides.integration.test.ts:110` | `historical` 一主体节点UI与受控补缺；`unverified` 当前真实并发、只缺首帧/锚、查看零写的完整磁盘/图证据 |
| W07 | 画布改prompt/模型/参数/参考/布局，保留结果历史，回表查看/重落/冷重开不覆盖 | `storyboardOverrides.integration.test.ts:38/:63/:99`、`storyboardPresent.test.ts:72`；E09/E17只部分邻接 | `unverified` 同一完整项目原控件覆写→回原表→重复动作→重开的全字段/历史闭环。store注入结果只能用于受控projection负控 |
| W08 | 原分镜行单镜/×3/参考生成/首帧→视频/批量，再由原位置看结果历史 | E02单镜/一镜批量；E05首帧/七镜批量；E17真实历史产物；`storyboardBatchLanding.test.ts:173/:190`动作层×3/anchor | `historical` 已列单镜/首帧/批量；`unverified` **原分镜行×3**与原参考生成UI。E04画布数量3并非分镜行，直接调用原action并mock runner也不是页面接线 |
| W09 | 33只选3进卡查看后关闭，再从原分镜生成关闭卡，保存冷重开 | E03精确子集关闭/重开；E02原分镜取消；E17历史取消 | `historical` 两个分开的局部旅程；`unverified` 当前同项目完整组合/非空历史/unknown费用显示。不要把零媒体当全部费用为零 |
| W10 | 分镜/文字prompt/画布分别Delete与Undo，切另方案、冷重开，不串身份或复活批准 | E07两host真实键盘/冷重开，E08整组/文稿prompt隔离 | `historical` 最接近完整的两条真实入口证据，仍是不同旧构建；当前最终树复验和引用较丰富方案另验 |

## 优先补齐的入口断点

1. **手动新建与Agent创建拆开验。** 旧 `core-a-creation-runs` 真实点了错误语义的 New Storyboard，测试反而把错误当合同。本轮 `sendCreation` 修正应保存新日志；新 blank 旅程需要实际green。再补同名方案与原新建文稿按钮，不能只用预置两文稿作 W01 全通过。
2. **W02直接编辑所有字段。** E02 的 `originalFields`/`deepEqual`是“prompt不破坏预设其他字段”，不是“所有控件都能保存”。从原控件选模型/供应商、改批量和单镜值、添加参考、改首帧，逐方案比UI和磁盘，再新进程读取；目录失败场景不能给fixture补不存在的发布模式造绿。
3. **W03-W05起点必须是实际发送/保存。** 现有受控 tests适合维护CAS/目标保护，但不能补足真实Agent挂起→切目标/人工改删→放行的UI闭环。E04/E05是批准后生成接续，所保护的对象和时间边界不同。
4. **W08按原入口各给证据。** 画布数量3、原action直接调用、原分镜行×3分别记录。首帧/七镜旅程的预写方案可验证执行修复，但还须从真正创建/编辑好的方案走到这些动作。现行验收表已记原×3页面基线缺口，不能自行增加替代页面也不能宣布已过。
5. **付款33→3确认后的链仍缺真实闭环。** E03有明确零提交限制；受控owner、正常单镜和画布×3不能合并推导同一scope贯穿quote/grant/wire。相同当前项目还须覆盖失败/关闭后剩余批次、旧quote失效、lost-response冷恢复。
6. **T7真实资源retry仍有两个失败。** 付款en失败证据比现行表只写canvas失败更新，已直接核报告。正常窗口中断7场景和受控factory不能替代entry及dependency fetch失败后的原位恢复。无新模型/费用/布局授权由此产生。
7. **最终构建与候选包重绑定。** E19、blank修复和Agent入口测试修改晚于多数Electron/包证据。重新执行应按实际风险组合，留原红/绿身份，不批量把旧报告改成新tree，不把一次运行说成多轮稳定。

本清单共逐项列出30个C、8个P、11个W，没有全通过结论。它是安排真实验收和防止证据越界的清单，不是发布收据、实现方案或新功能授权。
