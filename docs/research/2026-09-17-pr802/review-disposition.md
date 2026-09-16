# PR 802 独立审查处置

状态：收敛中。两份跨池只读审查已完成；本表区分实证缺陷与未证实推测，不把读码意见直接算成复现。

## 资产、错误协议与投影

| 发现 | 核实与处置 | 验证 |
|---|---|---|
| 身份断言抢 manifest 排他锁可能 Busy | 已修。最初“两个普通导入必失败”不成立，但真实 manifest lease 占用可复现；发布断言使用只读身份快照 | `projectArtifactImport.test.ts` 持锁红→绿；原并发上传继续通过 |
| 手动拖入/粘贴/重试没有项目交互上下文 | 画布及素材库入口已修。capacity/dimensions/upload 等待后校验最初捕获的项目交互上下文，换项目永久撤销 | `assetImportAdapter.test.ts`、`clipboardImagePaste.test.ts`、`projectCanvasReadSurface.test.ts` 等 73 项通过；节点引用槽同类入口另列下方 |
| 远程下载未固定发布身份，返回 DTO 消费者遗漏 | 已修。下载前捕获原项目身份，发布前复验；IPC 返回统一结果信封，renderer、历史数据迁移和诊断脚本均解包 | `remoteAssetContext.test.ts` 三条真实磁盘红→绿；IPC/API/结果本地化覆盖；未运行付费诊断脚本 |
| 节点拖入与引用槽上传未接项目生命周期 | 已修，并在 09-17 收口为单一签发点（见下节）。节点拖入、三类参数槽、分镜参考、Composer、导演台、音频/图片卡、剪辑节点全部在动作起点签发原项目 | `manualUploadProjectContext.test.ts`、`slotFileUploads.test.ts`、`clipNodeUpload.test.ts` 真 coordinator A→B→A；`/tmp/nomi-pr802-p1-related-green.log` 38 文件 267 项 |
| 可选 hash 缓存写失败阻断整个导入 | 已修。仅可选缓存 IO 可失败，身份及取消断言留在 catch 外，不吞权限拒绝 | 真实 sidecar rename EACCES 红→绿 |
| generated 分桶重新解析路径 | 当前同步路径未复现错项目；已让有 context 的分桶路径与 DTO 使用固定 root，去除隐含依赖 | 资产存储全套 |
| DTO 在发布后再校验可能谎报失败 | 已修。校验置于发布/复用前，DTO 构造不再授权 | bytes/native 发布广播内撤销红→绿 |
| 缺 clientId 的两件产物共用 URL | renderer 公共 apply 边界可复现，已修。产物以批内输入位置关联，不用可选 clientId 作文件身份 | `applyCanvasToolCall.artifact.test.ts` 两个不同文件红→绿 |
| assertCurrent 名称未表明它检查 turn | 不另改名。它是统一回调接口；调用方传 turn guard，主进程另持 session 和磁盘 guard，职责见总方案 | artifact apply 取消后不创建节点、IPC revoked publication |
| apply 层与 IPC 拒绝映射缺覆盖 | 已补实际 apply→deliver→import 与真实 MediaImportRejectedError 构造，覆盖错误码/原因及整批零节点 | 相关 3 套件 47 项通过 |
| native 查找期间取消未覆盖 | 已补与 bytes 参数化覆盖 | 25 个资产套件 225 项通过 |
| 存储合同只登记一个回归文件 | 已补登记既有改动的 dedup/store 两套回归文件 | root-cause/door-map 通过 |

## 项目会话

| 发现 | 核实与处置 | 验证 |
|---|---|---|
| 写已执行但撤销/回包复核后报 cancelled/stale | 已修。已派发写的结果无法确认时返回 `capability_receipt_unresolved`，保留待核实回执，不声称已撤销 | surface/executor/文档回执 5 套件 97 项；含写后取消、输出不合法与未分类异常 |
| 主进程撤销不发送 lane 关闭终态 | 已修。关闭投影清除 running/pending/retry，释放 IPC workspace。临时读盘失败只撤销旧 session，保留可信 frame；用户再次主动发送时完整复验身份并新建 session | 真实 manifest 与 backup 移走→IO 失败→workspace 自动关闭→恢复文件→新 session 恢复历史并接新 prompt；8 套件 130 项 + workspace 13 项 |
| 同项目切页与 transport 更新测试混淆 | 真切页由 Electron 同文档导航及真实 resident 旅程覆盖；suspend/commit 单测只证明同项目通道替换。真实重新 hydrate 会主动终止旧 lane，不等同切页 | `canvasReadSurfaceIpc.test.ts`；真实文稿→生成→创作及 reload 旅程 |
| 自动关闭测试又手动 close，断言不够强 | 已补强，测试只 revoke 而不主动 close | 真实 lane 自动关闭与 listener 清理回归 |
| Desktop runtime 装配及 receipt workspace 对齐缺覆盖 | IPC receipt 在验证 sender 和 workspaceId 后同步传当前 workspace，未复现可达串用；不额外增加平行身份判断。已补真实 registry→workspace 装配及迟到关闭投影隔离 | `laneProjectSession.test.ts`、`laneIpc.test.ts`、`laneClient.test.ts` |
| 已提交后台生成会被关闭 lane 取消 | 未复现。补测真实 session-close 分别落在 Run 提交后回包前、回包后；持久 Run 和 scheduler 均继续属于原项目 | `residentProductionJourney.contract.test.ts` 3 项通过；未调用付费供应商 |
| 付费确认等待在 requestGate 中卡死 | 对当前 resident lane 不可达。`appIntegration.ts` 不注入 confirmGenerationInNomi，付费卡由 Run-owned pending spend owner 投影；不能把外部 MCP gate 分支当成 lane 路径 | 审查生产装配与 `laneExtendedDesktopPorts.ts`；不改外部 MCP 产品行为 |
| 授权期间关闭会丢 onTaskCreated | 指定路径不成立：onTaskCreated 仅在新 draft_shots 成功时记任务，授权/start 发生在后续阶段。已提交 Run 的真实持久化另有时序测试 | `laneExtendedDesktopPorts.ts`、后台提交前回包测试 |
| 共用 session 关闭后已发布资产可能被误报失败 | 已修。存储发布后的断言已删除；renderer 对已派发但无法确认的写返回未决回执 | 存储提交广播撤销测试及 surface/executor 回归 |
| AbortSignal.any 可能泄漏 | 审查者未查版本或复现；本轮没有证据支持替换平台原生 API。session owner 监听器已显式移除 | listener 清理回归；Electron 43.4.1 实机 |

## 交互动作的项目签发（2026-09-17 代码收口，未推送）

| 发现 | 核实与处置 | 验证 |
|---|---|---|
| 全局截图热键晚绑定：`desktopCapturer.getSources` 之后才读 renderer 上报的项目 id；captured 事件无身份、接收端不校验 | 已修。主进程在任何 await 前固定已提交项目面（registry epoch，`captureCommittedCanvasReadPort`）与 `captureAssetWriteContext`，落盘前和通知前复验；事件带精确 binding，renderer 经 `withMainProjectAction` 仅在该 binding 仍是当前 epoch 时弹面板，换项目即关闭面板。删除 `nomi:screenshot:set-project`、`setScreenshotProjectId`、preload/bridge `setProjectId`。同项目切页不触发 hydration，行为不变 | 红：`/tmp/nomi-pr802-p1-screenshot-red.keep.log`（旧代码截图落进 B、A→B→A 复活）、`/tmp/nomi-pr802-p1-screenshot-hook-red.keep.log`；绿：`electron/screenshot/screenshotHotkeyProjectContext.test.ts`、`useCanvasScreenshotCaptureProjectContext.test.ts`（`/tmp/nomi-pr802-p1-frame-screenshot-green.log`） |
| 抽帧主进程文件发布是否需固定 IO context | 需要，已修。交互抽帧 IPC 在 await 前用 `createProjectInteractionCapture`（与素材导入共用，删 assetsIpc 内联副本）加入可信 session；`extractVideoFrameToAsset` / 首尾拼图在 ffmpeg 前固定磁盘身份并以该 context 发布。区分：带 binding 的交互抽帧换项目即不发布；审片环/拆解等明确原项目的后台抽帧不带交互断言，仍发布回原项目，但项目身份被替换时拒绝 | 红：`/tmp/nomi-pr802-p1-frame-red.log`（旧代码撤销/身份替换后仍发布）；绿：`extractVideoFrameProjectContext.test.ts`（真 ffmpeg 校验、暂停 spawn）、`videoIpcSession.test.ts` |
| 切镜落画布（`extractShotCutsToNodes`）漏门：无 context，逐帧 await 后落节点、编组 | 已修。按钮处签发，整批换项目即取消，不在新项目落节点/编组/报错 | 组合回归日志同上；类测试覆盖签发时机 |
| 导演台 AI 搭场景：模型流结束后经 upload API 的「当前项目」兜底把场景 JSON 写进切换后的项目素材库（原合同误判 not-affected） | 已修。`run` 起点签发，导入带完整 binding，取消不退回 data URL | 红：`/tmp/nomi-pr802-p1-aiscene-red.log`；绿：`/tmp/nomi-pr802-p1-aiscene-green.log` |
| 结构：renderer 33 处手写捕获、`persistNodeImageFile/Blob` 默认参数、clip/ClipNode/useNodeImageUpload/导入适配器/剪贴板 5 处 `??`/`??=` 晚取回退 | 已收敛。捕获函数与 coordinator 捕获方法模块私有；`withProjectAction` / `withMainProjectAction` 是唯一签发点；默认值与晚取回退共删 8 处；共享 helper context 必填，typecheck 逼出 AssetLibraryPanel、canvasStageDrop（拖入/导入钮/菜单共用）、useCanvasShortcuts 粘贴、ArtifactNodeToolbar、NodeShotCutPanel 等调用点，全部改为入口签发。door-map：提交树自取 20 扇（含在途 31）→ 业务代码 0；签发调用 31 处（签发模块内另 2 处），均为不同的用户动作入口 | AST+类型类回归 `projectActionIssuance.contract.test.ts`：植入 await 后签发红 `/tmp/nomi-pr802-p1-issuance-red.log`，HEAD 源码 64 条违规红 `/tmp/nomi-pr802-p1-issuance-head-red.log`，恢复默认参数 check:test-types 红 `/tmp/nomi-pr802-p1-test-types-red.log` |
| `laneIpc.test.ts:21` TS2352、`assetsIpcSession.test.ts:30` TS2353、PanoramaViewer 测试 mock 类型 | 已修：补全 LaneWorkspaceProjection 夹具（去掉双重断言）、拒绝原因夹具去掉非类型字段、回调 mock 显式类型 | `check:test-types` src 0 错、存量 68 未增 |
| `persistNodeImage.test.ts` blob 分支偶发红 | 断言把 helper 新建 File（新 lastModified）与测试 File 按身份比较，毫秒边界翻红；改为 blob 分支只断言 File 类型 | 组合回归通过 |

### 1b：当前项目读取器整类删除（2026-09-17，未推送）

| 发现 | 核实与处置 | 验证 |
|---|---|---|
| 后台生成在轮询/找回结束后重读当前项目做本地化、`taskApi` 用当前项目覆盖显式 projectId、主进程以已提交项目兜底任务身份（与 §2「已提交后台生成属于原项目」冲突） | 已修。Run 身份（完整 binding）提交时固定并写进运行记录；`runProjectDelivery` 决定落点：原项目在前台写 store，不在前台经 `localProjectStore` 写原项目盘上副本；`taskApi` 身份显式传入、不填不改、夹带不同项目即拒；主进程删 `activeTaskProjectFallback` / 二次认领，轮询带来不同项目 `TASK_PROJECT_MISMATCH` | 红 `/tmp/nomi-pr802-p1-1b-red.log`（`runProjectDelivery.background.test.ts` 轮询中切项目、`textActions.test.ts` 流式中切项目、`taskApi.projectIdentity.test.ts`、`electron/tasks/taskProjectIdentity.test.ts`）→ 绿 `/tmp/nomi-pr802-p1-1b-related-green.log` |
| 旧运行记录没有项目身份 | 由记录所在项目派生（点击找回时就在签发项目的画布上）；记录指向别的项目即标失败并说明（新 i18n `otherProjectTask`），不轮询、不猜当前项目 | `recoverTaskActions.projectIdentity.test.ts` 三例（派生、拒绝、找回轮询中切项目落盘）红→绿 |
| 交互动作 await 后晚读/无校验回写（导演台出片、拆图层、ClipNode 导出、时间轴拖入、确认后删结果、工作流复制、花钱卡轮询、审片修复、提示词改写、新手导览、记忆编辑、框/组菜单反馈、拖放归属） | 已修。全部入口 `withProjectAction` 签发，await 后以 `isProjectExecutionContextCurrent` 复验，换项目即取消不回写；显示用途改走 `useOpenProjectId` | 各自单测（factBridge A→B→A、shotVerifyStore、batchPlanPreview、canonicalCanvasPlanPatch 等）与读取器棘轮 |
| 浏览器浮层/弹窗（其它窗口）自报 projectId、读 localStorage「上次项目」 | 已修，未新建 owner。`windowProjectCapture` 与截图热键共用主进程签发：导入、提示词截图、模板设置、素材导入与删文件均按父窗口已提交项目派生、随之撤销、无父会话即拒；浮层显示项目由主进程随 config 推送 | 红→绿：`windowProjectCapture.test.ts`（真实 registry，A→B→A）、`assetsIpcSession.test.ts` 子窗口两例、`browserPromptExtractionSettings.test.ts` |
| `assetUploadApi.resolveProjectId` 兜底 | 已删；`UploadWorkbenchAssetMeta` 绑定与断言必填，typecheck 逼出全部调用点 | 编译半边 `@ts-expect-error`（红 `/tmp/nomi-pr802-p1-1b-test-types-red.log`） |
| 结构：读取器仍可被重新引用 | `src/desktop/activeProject.ts`、`getActiveWorkbenchProjectId`、`getCanvasEventsProjectId`、`activeTaskProjectFallback` 删除。door-map `ccbc0e45d` 106 处（renderer 99）→ 0；剩 14 处显示/传输读逐条写理由入棘轮 | `projectActionIssuance.contract.test.ts` 读取器棘轮（在 HEAD 源码上红，见 1b 红日志） |
| `check:controls`「点了失败但用户看不到」：画布导入钮/抽首尾帧钮调用的命令在 1a 改成 `withProjectAction(async …)` 后被静态判定为会 reject（本分支 `105693815` 引入，`50223265c` 通过） | 已修。两个命令先同步签发、无项目即反馈，异步部分保持原有 catch，命令本身不再把拒绝丢给控件 | `scripts/check-control-contract.test.mjs` 在 `ccbc0e45d` 红（`/tmp/nomi-pr802-p1-1b-controls-base.log`）→ 绿（`/tmp/nomi-pr802-p1-1b-runner-green.log`） |
| `check:vocabularies`：新增 `'store' \| 'disk' \| 'missing'` 投递结果词表 | 不新增词表：`deliverRunOutcome` 改为返回「是否落进正打开的原项目画布」布尔值，调用方只需要这一点 | `check:vocabularies` 通过 |
| 门岗缺口：删掉的高风险文件无法被合同覆盖 | `root-cause-contracts.mjs` 允许在 `legacy_paths.removed_paths` 声明删除；未声明照旧红 | `check-root-cause-contracts.node-test.mjs` 新例先红 `/tmp/nomi-pr802-p1-1b-rcc-checker-red.log` 后绿 |

### 仍未解决（需拍板或第二段）

- 子窗口的只读素材列表（`nomi:assets:list`）与主窗口显式项目 IO 通道仍接受 projectId（读与后台 IO 不是授权）；只有子窗口写入绑定父会话。
- `check:asset-evidence` 报 `electron/assets/assetsIpc.ts` 远程导入缺 `sourceEvidence`：在 `50223265c`（本分支 1a 提交前）已红，非本轮引入，未处理（需要确认远程导入的来源取证归属）。
- `electron/capabilityCore/timelineTransportAdapters.test.ts`「fails closed on injected, nested, or operation-mismatched renderer results」在本分支提交前（`50223265c`）已红，非本轮引入，未处理。
- 真实 Electron 走查（拖入/粘贴/截图热键/浮层导入/后台生成轮询中切项目、resident 旅程）属第二段，本段未跑。

所有未完成项收敛后更新此表，再运行最终分支评审与交付门禁。该文档不是合入或已解决收据。
