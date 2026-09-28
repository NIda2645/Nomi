# 所有权 / 寿命普查（R14 周期审计 · 2026-09-17）

> 只读审计，未改一行生产代码。基准 `origin/main` = **e96614e14**（#804 合入后）。
> 机器数字来自 `node scripts/audit/scan-ownership.mjs`（可重跑，`--json` 出原始数据）；两名 sonnet 扫描员只做枚举，
> 每一条 file:line 都由本文作者回读源码核过。凡「按代码推断、本轮没跑真机」的一律标 **推断**。
> 触发：09-17 一天挖出四个同病（文稿能力绑创作页组件 / MCP 身份绑最后启动副本 / lane 熔断绑整条会话 / #802 身份绑项目会话），
> 用户问「是不是底层架构问题、往下挖几层」。本文用数字回答，不凭直觉。

## 0. 一句话结论（细节在 §7）

**不是底层架构问题，是契约少一个轴。** 五维扫完，能落到 C 档（要加轴 / 加门岗 / 动共享边界）的共 **6 条**，D 档（大重构）**0 条**。
六条 C 的停止层全部在**现有 owner 模块**里（`src/workbench/project/`、`electron/shared/`、`electron/capabilityCore/mcpConfig.ts`、
`src/workbench/ai/lane/laneViewModel.ts`），没有一条需要新层或换框架。缺的那个轴是「**这份状态的寿命跟谁走**」：
能力契约 `execution` 只有 `port` + `availability`（`electron/shared/agentCapabilities/capabilityContract.ts:49-51`），
zustand store 字段没有寿命标签，所以「谁顺手创建了它谁持有」成了默认——四个同病都长在这条缝里。
仓库里**已经有三个做对了的样板**（§1.3），说明模式不缺、缺的是把它变成机器可拦的声明。

## 1. D1 状态 owner

### 1.1 渲染层 zustand store（14 个）× 项目会话释放点

释放点只有一个：`src/workbench/project/releaseWorkbenchProjectSession.ts:23` `releaseWorkbenchProjectRuntimeState()`，
引入于 `0e1be560a`（2026-06-28，`perf: reduce canvas memory usage`，无 PR、无方案）——**顺手写的**：它是「减内存」的副产品，
不是「项目会话 owner」的设计；里面的 setState 键是一份**手写清单**，测试（同目录 `.test.ts:69-86`）只断言其中 11 个键。

| store | 数据字段 | 释放点覆盖 | 未覆盖字段 | 判断 |
|---|---:|---|---|---|
| `useWorkbenchStore` `workbenchStore.ts:242` | 32 | 22/32 | `persistRevision, projectSidebarWidth, sidebarCollapsed, storyboardPlannerLauncher, canvasFitNonce, canvasFitCategoryId, timelinePanelCollapsed, timelinePanelHeight, exportResolution, exportQuality` | 10 个未覆盖里 6 个是窗口级偏好（合理不清），1 个是**视图发布的函数**（`storyboardPlannerLauncher`，同 `creationDocumentTools` 一个病：`ProjectAgentResidentShell.tsx:248` useEffect 发布），3 个瞬态。**问题不是漏了哪个，是没有一处写着「这个字段归谁」** |
| `useGenerationCanvasStore` `generationCanvasStore.ts:34` | 13 | 10/13 | `persistRevision, workflowTemplates, pendingConnectionSourceKind` | 同上 |
| `useShotVerifyStore` | 6 | whole(clear) | — | ✅ 自带 `clear()` 且释放点调用 |
| `useProductionRunStore` | 8 | none | 全部 | 字段自带 `projectId`，读侧按 id 自校（推断）；不清但不串 |
| `useGenerationQueueStore` | 2 | none | `entries, batches` | 每条 entry 在**提交那一刻**签 `projectId`（`generationQueueStore.ts:23`）✅ 身份随创建签发的正例 |
| `useSpendConfirmStore` | 2 | none | `pending, queue` | 付费待确认队列跨项目残留（推断） |
| `useBatchPlanPreviewStore` / `useAssetImportProgressStore` / `useNodeLivePreviewStore` / `useCanvasMenuPreferenceStore` / `useJourneyTourStore` / `useResidentActivityStore` / `useAgentUsageStore` / `useProductionCanvasLandingStore` | 1–5 | none | 全部 | 4 个有自带 reset 但**没人从释放点调**；`useAgentUsageStore.reset` 0 个非测试调用者——token 用量跨项目累计（推断） |

同类的渲染层模块级单例（`src/workbench` 105 个被变异的 `let`/容器，73 个无 in-file resetter）里，注释自称「切项目用」却 **0 个非测试调用者**的：
`src/workbench/adoption/adoptionProposalRegistry.ts:31` `resetAdoptionRegistry`（注释原话「测试与切项目用」）。
其余项目语义但不在释放点的：`canvasEventEmitter.ts:25-44`（`buffer/timer/lastAppliedSeq`，由 `projectIdProvider` 在 flush 时取值防错绑——半个正例）、
`agentPanelV4ScrollMemory.ts:20`、`laneTaskCandidateActions.ts:8 inFlight`、`deferredNodeMediaQueue.ts:46`。

### 1.2 主进程模块级可变单例（`electron/` 164 个；`let` 142 / 容器 127 全仓；无 in-file resetter 186/269）

| 状态 | file:line | 引入 | 寿命现状 | 该跟谁 | 判断 |
|---|---|---|---|---|---|
| `appIntegration.ts` 10 个 `let`（handle / hooks / timers / library） | `electron/capabilityCore/appIntegration.ts:71-84` | #301 | 全部由 `stopCapabilityCore` 置空 | 能力核会话 | ✅ **正例**：一个 owner 函数管全部字段 |
| `residentSurfaceLifecycle.current` | `electron/capabilityCore/residentSurfaceLifecycle.ts:37` | 09-14 结构评审 | 五相显式（disabled/starting/ready/install-failed/stopped） | 能力核会话 | ✅ **正例**：把三份 nullable 影子收成一个带相的 owner |
| `appWindowRegistry.recordsByWindowId / mainWindowId` | `electron/appWindowRegistry.ts:45-46` | 2026-09-08 素材盒根因 | 建窗登记、`closed` 自动注销 | 窗口 | ✅ **正例**：寿命随被服务对象的生命周期事件走 |
| `rendererBridge.target` | `electron/capabilityCore/rendererBridge.ts:32` | `cb97541e8` 2026-06-22（直推 main，无 PR；正文写明「main 登记窗口 webContents…窗口销毁即清除」）| `main.ts:332` 建窗设、`destroyed` 清 | 窗口 | **拍板过**，但它是 `appWindowRegistry` 的**第二份「哪个窗口是主窗」**（晚 2.5 个月出现的登记表没回头收编它）。今天靠「拒绝第二个活动窗口」（#802 方案）不出事。**A**：`target` 改从 `getMainWindow()` 派生，删这份 `let` |
| `spendGrant.GRANTS` | `electron/spendGrant.ts:28` | `5af99be46` 2026-06-21（方案 `docs/plan/2026-06-21-spend-confirmation-gate.md`，红队钉死的不变量）| TTL 30 min + 每节点次数；`purgeExpired` 只在铸新令牌时跑 | 用户这一次确认 | **拍板过**，绑 `nodeIds` 是拍板；**拍板时没想到「切项目」**——令牌无 `projectId` 轴，切到项目 B 后 A 的令牌仍活 30 min（推断；nodeId 随机，实际撞上概率低）。**B**（见 §2） |
| `dispatcher.canvasDeleteUndoJournal` | `electron/capabilityCore/dispatcher.ts:227` | #360 2026-09-02 | 只在 undo 时删；无上限无 TTL | 一次删除 → 下一次用户动作 | 撤销时校 `entry.projectId !== lease.projectId`（`:629`）✅ 身份对；寿命无界。**A**：加上限（同 `adoptionProposalRegistry` 的 200 条淘汰法） |
| `laneHost` `failures = {key,count}` | `electron/agentLane/laneHost.mts:356` | #607 2026-09-07 | 闭包 = 一条 lane 会话；「换 key 或成功一次归零」 | 用户这一轮 / 条件变化 | **拍板过**（注释把「连续」定义写死在两行里）；**拍板时没想到「墙被拆了」**（用户打开创作页）——**在途**（批次 2 J 块 D6 条件恢复） |
| `mcpConfig.repairStaleMcpConfigs` 触发的宿主配置改写 | `electron/capabilityCore/mcpConfig.ts:544` ← `appIntegration.ts:163` | #519 | 每次能力核启动 | 用户装的那份 | **拍板过**（PR 正文「防止用户拿到手不能用」）；**拍板时没想到多副本并存**——**在途**（批次 3 launch-rewrite ①） |
| `appIntegrationSpendConfirm.actions` | `electron/capabilityCore/appIntegrationSpendConfirm.ts:77` | 09-12 | `let`，无 reset | 能力核会话 | 09-14 结构评审已点名的「三份影子」之一，owner 已建但这份影子还在。**A** |
| `laneSession.openRepos` | `electron/agentLane/laneSession.mts:64` | #567 | 引用计数 `holders`，最后一个释放才关 | 项目 | ✅ 正例 |
| `main.ts` 5 个 `let` | `electron/main.ts:138-165` | — | 进程 | 进程 | 合理 |

### 1.3 发布点（脚本 12 个 exported `register*/install*/set*`；view-scoped 调用者 3 个，全在 `NomiStudioApp.tsx:216-221` 根组件 useEffect = 窗口级，非视图级）

真正的**视图级发布者**不走 `register*` 命名，走 store action：`setCreationDocumentTools`（`WorkbenchEditor.tsx:208`，`e96facce2` 2026-06-03 抽 TipTap 内核时**顺手**把工具 API 挂进 store，当时创作页是唯一消费者）与 `setStoryboardPlannerLauncher`（`ProjectAgentResidentShell.tsx:248`）。
数门：`creationDocumentTools` 读门 6、`setCreationDocumentTools` 写门 2（`node scripts/door-map.mjs`）。前者**在途**（J 块）；后者是同一类的第二例，J 块的 `check:capability-lifecycle` 棘轮应把它一并数进去（今天会红 2 行而不是 1 行）。

## 2. D2 身份：每种身份被谁绑、比对时缺哪个维度

脚本找到 61 个 `same*/matches*/equals*` 比对函数，17 个碰到已知身份维度。按身份归类：

| 身份 | owner 记录 | 维度数 | 各层各自重写的比对 | 缺的维度 / 判断 |
|---|---|---:|---|---|
| **surface port binding** | `electron/shared/surfacePortBinding.ts` `SurfacePortBinding` | 11（`canvasReadSurfaceRegistry.ts:246 sameBindingWire`：version/bindingId/projectId/immutableProjectUuid/projectGeneration/webContentsId/processId/frameRoutingId/origin/portRevision/nonce）| preload `surfacePortPreloadBridge.ts:203 sameSurfaceAuthority` **7** 维；渲染层 `projectCanvasReadSurface.ts:365 sameBinding` **6** 维 | 三层三份比对，11/7/6——每层「按自己看得见的字段」重写一次。#802 那次「少一个维度」就是这个形状的产物。今天文稿那条**根本不在身份里**：`NomiStudioApp.tsx:227` 判的是 `!tools`（内容存在性）却报 `surface_port_stale`（身份过期）。**C**（§6 C2） |
| **project binding** | `electron/shared/projectBinding.ts:1` `ProjectBinding` = projectId + immutableProjectUuid + projectGeneration；owner 导出 `sameProjectAgentBinding`（3 维） | 3（registry 里 `sameProjectSelection` 加 `canonicalRootDigest` = 4）| **只比 `projectId` 一维**的：`export/exportJobIpc.ts:25`、`export/exportJobManager.ts:126`、`export/exportJobs.ts:282`、`canvasReadPortResolver.ts:32`、`currentProjectResolver.ts:72`、`proposalUndo.ts:80`；全仓 `x.projectId === y.projectId` 形态 24 处 | owner 有 3 维比对函数，6 个调用点自己写了 1 维版。#802 方案原话「完整 ProjectBinding」是不变量，这 6 处是它的反例。**C**（同 C2） |
| **spend grant** | `electron/spendGrant.ts:19` = grantId + nodeBudgets + expiresAt | 2 | — | 无 `projectId`。**B**：加轴要拍板「令牌跨项目是不是刻意允许的」（方案没讨论过） |
| **MCP launcher** | `mcpConfig.ts:626 sameLauncher` = command + args + `NOMI_SETTINGS_DIR` | 3 | — | 缺「目标副本还活着吗」——**在途**（批次 3） |
| **窗口** | `appWindowRegistry.ts` = window.id + role + expectedOrigin | 3 | `rendererBridge.target`（0 维，直接持对象）| 见 §1.2 A |
| **lane「同一堵墙」** | `laneHost.mts:466` key = toolName + 失败正文**首行** | 文本 | — | 身份是**文案**不是码（注释说明 code 刻意不进正文）。后果：两种原因共用一句话就被合成一堵墙（今天「从未注册」与「已过期」正是同一句）；文案里带动态值则永远数不到 3。**B**：key 改用 `failure.code`（details 里已有），要拍板「同码不同文案算不算同一堵墙」 |
| **生成队列条目** | `generationQueueStore.ts:23` 提交即签 `projectId` | — | — | ✅ 正例 |

## 3. D3 写盘到项目外

脚本候选 **69 处 / 34 文件**（刻意多数：含 mkdir、日志、临时目录）；人核后**真写入 19 处 / 15 个位置**（扫描员逐条追到触发点，本文抽核 6 条）。

| 触发类 | 数 | 静默？ | 条目 |
|---|---:|---|---|
| user-action（用户点击/表单 IPC） | 11 | 否 | 设置根下各 json、钥匙串、下载偏好、移动桥证书、Codex 图片任务记录… |
| **startup** | **4** | **是** | ① `repairStaleMcpConfigs`（`appIntegration.ts:163`，改**别人的**文件 `~/.claude.json` 等）② `ensureToken`（`security.ts:123`）③ `ensureBuiltinModelSeeds` 写 `model-catalog.json`（`catalogStore.ts:255`）④ `artifact-preview.key`（`artifactProjection.ts:56`）|
| **external-request** | **1** | **是** | `recordDetectedMcpClient`（`mcpDetectedClients.ts:67-71`，外部 MCP 客户端自报名字即落盘 `~/.nomi/capability-core/mcp-client-profiles.json`；`0c822ba7c` 2026-09-03 #298-v2 引入，无隔离守卫）|
| **side-effect-of-read** | **2** | **是** | `resolveTikhubHost/failoverTikhubHost` 选路时写 `connector-prefs.json`（`tikhubRoute.ts:123,143`，`71916b3b0` 2026-09-01）；`promptLibraryStore.persistToDisk` 拉取后写缓存 |
| timer / on-exit | 0 | — | — |

隔离守卫（`assertHostConfigWritable` `mcpConfig.ts:288`）只罩 `atomicWrite` 一处 = 19 处里 2 条路；其余 17 处靠 `getSettingsRoot()` 的 `NOMI_SETTINGS_DIR` 覆盖间接隔离。
**判断**：静默 7 处里只有 ①（改宿主配置）和 external ①（外部输入触发落盘）碰到「不是 Nomi 自己的东西 / 不是用户的动作」；其余 5 处写的是 Nomi 自己的设置根，属可接受的启动初始化。
「读路径写盘」这个形状 09-14 已有教训（`docs/lessons/mcp-read-path-must-not-write-host-configs.md`），当时修在 `readMcpInfo`，但**同形状在 connector 路由里还有一份**（tikhub）——教训没变成门岗，所以又长了一个。**C**（§6 C3）。

## 4. D4 同一语义多份定义（R14.1）

| 语义 | 份数 | owner | 差异 | 引入 / 判断 |
|---|---:|---|---|---|
| **错误码表**（capability_* / surface_port_* / project_* 一族） | **15 份 / 8 文件**（脚本按字面量集合数到 31 处 / 22 文件，含 switch 与映射对象——多数是消费点不是定义，人核后 15 份是定义） | 唯一带 `as const` 值 + 类型同源的是 `electron/shared/surfacePortBinding.ts:336 SURFACE_PORT_WIRE_ERROR_CODES`（11 码）；7 个 transport adapter 各自一份 `PUBLIC_FAILURE_CODES`，只有 `canvasWriteTransportAdapters.ts:43` 用 spread 派生，其余 6 份**手抄** | 最大集 35 码（`mcpToolErrorResults.ts:98 POLICY_CODES`）；`rpcError.ts:19` 有 `capability_unsupported` 而 `POLICY_CODES` 没有；`documentWrite` 比 `documentRead` 多 `document_target_stale`；`timeline` 独有 `undo_*` 三码 | #301（`0b6441c69`「M1 round-2: transplant … (uncommitted Codex work)」）——**顺手写的**：移植时每个 adapter 各带一份白名单。今天要拆 `surface_port_stale` 为「不存在 / 过期」两码，J 块估算要动 6 份副本——就是这张表。**C**（§6 C4）|
| 状态/阶段词表 | 209 候选，**0 个在 `vocabularies-baseline.json` 之外**；27 组成员完全相同的重复（55 处）全登记为 `debt`（上限 63）| `check:vocabularies` | — | ✅ 门岗已管住增量；存量债在棘轮里。**不重复处理** |
| `.nomi` 目录名 | **22 文件**各自字面量 | `workspacePaths.ts:97 workspaceNomiDir()` 存在但没人用 | — | **A**：全部改 import；门岗一行（字面量 `'.nomi'` 只许出现在 owner） |
| `project.json` / `model-catalog.json` | 4 / 5 文件字面量 | `runtimePaths.ts:12,14` 已有常量 | — | **A** 同上 |
| MCP 客户端名单 | 1 | `electron/shared/mcpClientRegistry.ts` | — | ✅ #783 已收成单 owner（教训第 4 条落地了）|

## 5. D5 模型面 / 用户面

- 模型面产出点 5 处，全在 `electron/`：`surfacePortBinding.ts:408 surfacePortFailureAdvice`（注释「Model-facing recovery advice」）、`laneToolContract.ts:118 renderLaneToolFailure`（拼 `Next:` 行）、`laneDesktopTools.ts:42`、`canvasWriteTransportAdapters.ts:64`、`modelListProbe.ts:50`。
- **用户面只有一条缝**：`src/workbench/ai/lane/laneViewModel.ts:380` `laneToolTextForUser(part.text, part.nextAction)`——它**只**去掉成功时的 `User sees:` 尾行，失败正文（含英文 `Next: …`）**原样进面板**。这就是 `B03-small.png` 那条中英夹杂的报错。
- `laneToolNextAction.ts:1-16` 文件头**明写**「它是英文…住主进程，i18n 词表管不到它」——所以成功尾行**拍板过**要去尾；失败正文**拍板时没想到**（去尾函数只认成功信封）。
- i18n：`src/i18n/resources.ts` 里 0 个错误码键；`check:i18n` 对 `electron/` 只查**中文**可见文案棘轮（`check-i18n-visible-text.mjs:10-14`），英文模型面文案不算「可见」——门岗看不见这条缝。
- 渲染层直接渲染 `.message/.text` 的 `.tsx` 8 处：`ui/ErrorBoundary.tsx:38,63`、`ui/chunkBoundary.tsx:119`（崩溃兜底，可接受）、`CommittedProposalCard.tsx:49`、`NodeShotCutPanel.tsx:97`、`NodeVideoFrameToolbar.tsx:87`、`SkillLibraryPanel.tsx:184,216`（后 5 处**推断**含供应商/工具原文）。
- **C**（§6 C5）。

## 6. 分档与三问

A（卫生，改一处不改行为）：`rendererBridge.target` 改派生 · `canvasDeleteUndoJournal` 加上限 · `appIntegrationSpendConfirm.actions` 删影子 · `resetAdoptionRegistry` 接进释放点 · `.nomi`/`project.json`/`model-catalog.json` 字面量改 import（22+4+5 处）· `promptLibrary` 缓存写盘挪出读路径。
B（要拍板）：spend grant 加 `projectId` 轴 · lane「同一堵墙」key 改码 · 4 个自带 reset 的 store 要不要在切项目时清（`useAgentUsageStore` 的 token 累计尤其要问：跨项目累计是不是产品意图）。

| # | C 档 | 一句话不变量 | 哪层当 owner 执行 | 哪道门岗能拦（今天红几行） | 用户什么时刻撞到、看到什么 |
|---|---|---|---|---|---|
| C1 | store 字段没有寿命声明；释放点是手写清单 | **每个 store 数据字段声明 `lifetime ∈ {process, window, project, view, turn}`；`project` 级字段必须出现在 `releaseWorkbenchProjectRuntimeState` 的 setState 键集合或被它调用的 `clear()` 里** | `src/workbench/project/`（restore/release 那一对函数已是事实 owner） | 新棋 `check:store-lifetime`：`scan-ownership.mjs` D1a 改门岗，字段未声明即红。今天红 **11 个 store**（14 里只有 3 个被释放点碰到）；声明补齐后预计残留红 = 未覆盖的 project 级字段（估 8–12 个）| 切项目：上一个项目的付费待确认卡 / 分镜规划入口 / token 用量留在新项目里（推断，J 块只修文稿那一条）|
| C2 | 身份比对各层各写一份，维度 11/7/6；project 身份 6 处只比 1 维 | **一种身份只有一个比对函数，住 owner 模块（`electron/shared/`）；其它层只能 import，不许再列字段** | `electron/shared/surfacePortBinding.ts` 与 `projectBinding.ts`（owner 已有，`sameProjectAgentBinding` 已导出）| 新棋 `check:identity-compare`：`same*/matches*` 函数体引用 ≥1 个身份维度且不在 owner 模块 → 红。今天红 **8**（surface 2 + project 6）| 导出/撤销/端口解析在 `projectGeneration` 变了（同 id 重建项目）后仍认旧项目（推断）；#802 的形状再来一次 |
| C3 | 项目外写盘没有「触发类」声明；读路径写盘教训没变门岗 | **写到 `~/` / userData / 宿主配置的函数必须声明触发类；`startup`/`external` 类不许碰 Nomi 之外的文件；`read*/resolve*/list*` 函数不许可达任何写盘门** | `electron/capabilityCore/mcpConfig.ts:295 atomicWrite`（宿主配置唯一门）+ `electron/settings/settingsRoot.ts`（自家根唯一门）| `check:door-map` 扩一条：对 `atomicWrite`、`writeJsonFileAtomic` 数门，读门里出现 `read|resolve|list` 前缀的调用者即红。今天红 **3**（`repairStaleMcpConfigs`@startup 在途、`tikhubRoute` ×2 读路径写）| 起测试包 → 四个客户端静默改指向（在途）；TikHub 选路一次就改盘上偏好 |
| C4 | 错误码表 15 份 6 份手抄 | **码集合只有一个值源（`SURFACE_PORT_WIRE_ERROR_CODES` 一族）；adapter 只能 spread + 追加，不能重列** | `electron/shared/surfacePortBinding.ts` | `check:vocabularies` 扫描器加一类：snake_case 且 ≥2 个已知码的字面量集合按同名门岗登记。今天红 **14**（15 份减 canonical）| 拆 `surface_port_stale` 两码时漏改一份 → 某条通道把新码当未知码吞掉，模型又收到「读一遍再试」|
| C5 | 模型面失败正文原样进面板 | **面板只渲染由 `failure.code` 派生的 i18n 文案 + 结构化 details；`electron/shared/agentLane` 产出的英文正文永不进 `.tsx`** | `src/workbench/ai/lane/laneViewModel.ts:380`（缝已存在，只认成功信封）| `check:i18n` 加规则：`laneViewModel` 的 `output` 字段必须经 `t(codeKey)`；`.tsx` 渲染 `*.message/.text` 且来源不是 i18n 的登记棘轮。今天红 **1 缝 + 5 处**（8 处减 3 处崩溃兜底）| 中文界面下 `The current target could not accept this action (surface_port_stale). Next: …`（B03 截图）|
| C6 | 能力契约没有寿命轴 | **`execution` 加 `owner: 'process' \| 'window' \| 'project-session' \| 'view' \| 'turn'`；`view` 只许出现在声明了 owner 组件的能力上，且该能力的 `renderer_required` 执行路径不许读组件 useEffect 发布的 store 字段** | `electron/shared/agentCapabilities/capabilityContract.ts:49` | **在途**：J 块 `check:capability-lifecycle` 就是这一条；本审计只补一句——它今天该红 **2**（`document.read/write`）+ `storyboardPlannerLauncher` 若被能力读到再 +1 | 画布冷启动读文稿 → 「目标陈旧」（已复现）|

三问答不全而降级的：无。六条 C 的不变量都能一句话说清、owner 都是**现有**模块、门岗都能在今天的代码上算出红行数。

## 7. 往下挖几层——每一维的停止层

| 维 | 挖到哪一层停 | 证据（数字） | 支持「只补一个轴」还是「更深重构」 |
|---|---|---|---|
| D1 渲染层 | `src/workbench/project/`（restore/release 一对函数）——**1 层** | 14 store 只有 3 个被释放点碰；手写清单 22/32、10/13；同形状第二例 `storyboardPlannerLauncher` 已在 | **补轴**：给字段加寿命标签 + 门岗。zustand 结构、store 拆分一个都不用动 |
| D1 主进程 | `electron/capabilityCore/` 各模块 owner——**0 层**（模式已存在）| `appIntegration.ts` 10/10 `let` 由 `stopCapabilityCore` 收；`residentSurfaceLifecycle` / `appWindowRegistry` / `laneSession.openRepos` 三个正例；剩 3 个散兵（target / GRANTS projectId / undoJournal 上限）| **补轴**：3 条 A/B，无结构改动 |
| D2 身份 | `electron/shared/` 两个 owner 文件——**1 层** | 11/7/6 三份 surface 比对；project 身份 6 处 1 维 vs owner 3 维 | **补门岗**：删 8 份本地比对改 import。`ProjectBinding`/`SurfacePortBinding` 记录本身不用改 |
| D3 写盘 | `mcpConfig.ts:atomicWrite` + `settingsRoot.ts`——**0 层**（唯一门已存在）| 19 处写 2 条路有守卫；静默 7；读路径写 2 | **补声明**：触发类 + door-map 一条规则 |
| D4 定义 | `electron/shared/surfacePortBinding.ts`——**1 层** | 15 份 / 6 手抄 / 1 派生；词表门岗 0 漏 | **补门岗**：现有 `check:vocabularies` 扩一类 |
| D5 文案 | `src/workbench/ai/lane/laneViewModel.ts:380`——**0 层**（缝已存在）| 5 产出点 → 1 缝；i18n 0 码键 | **补 i18n 键 + 门岗规则** |

**回答用户的问题**：往下挖 **0–1 层**就到底了，六个维度没有一个需要挖到框架（zustand / Electron IPC / pi）或换架构。
反过来说，「更深重构」的证据本轮**一条都没扫到**：没有一份状态是「owner 不存在、要新造一层才放得下」——`appIntegration.ts`、`residentSurfaceLifecycle.ts`、
`appWindowRegistry.ts`、`generationQueueStore.ts` 四个正例证明每一类都已经有人在正确的层上做对过，四个同病是**没把做对的那次变成声明**。
所以答案是：加一个轴（寿命/owner），把它写进两份契约（能力契约 `execution.owner`、store 字段 `lifetime`），再用 5 道棋（C1–C5）把轴变成机器拦得住的东西。

## 8. 建议门岗清单（每条先说今天会红几行——加规则前先验它会红，R17）

| 门岗 | 规则 | 今天红 | 依附现有门岗 |
|---|---|---:|---|
| `check:store-lifetime`（C1） | store 数据字段无 `lifetime` 声明 → 红；`project` 级不在释放点 → 红 | 11 store | 新，脚本 = `scan-ownership.mjs` D1a |
| `check:identity-compare`（C2） | owner 模块之外的 `same*/matches*` 引用身份维度 → 红 | 8 | 新，脚本 = D2 |
| `check:door-map` 扩（C3） | `atomicWrite`/`writeJsonFileAtomic` 的读门里有 `read|resolve|list` 调用者 → 红；startup/external 触发写宿主配置 → 红 | 3 | 扩 `scripts/check-door-map.mjs` |
| `check:vocabularies` 扩（C4） | snake_case 错误码集合按词表登记 | 14 | 扩 `scripts/check-vocabularies-scan.mjs` |
| `check:i18n` 扩（C5） | `laneViewModel` output 不经 `t()` → 红；`.tsx` 渲染非 i18n 来源的 `.message/.text` 登记棘轮 | 1 + 5 | 扩 `check-i18n-visible-text.mjs` |
| `check:capability-lifecycle`（C6，**在途** J 块） | `renderer_required` 能力的执行路径读组件 useEffect 发布的字段 → 红 | 2 | 批次 2 分支 |
| 字面量 owner（A） | `'.nomi'` / `'project.json'` / `'model-catalog.json'` 只许出现在 owner | 22 + 4 + 5 | 可并进 `check:vocabularies` |

## 9. 本轮没验的（诚实标注）

- 所有「跨项目残留」（付费待确认队列、token 累计、scroll memory、adoption registry）**按代码推断**，未跑真机切项目复现；最值得先做真机的是 `useSpendConfirmStore`（涉钱）。
- spend grant 跨项目消费：nodeId 随机，实际撞上要构造；没构造。
- D3 的 19 处触发类由扫描员追调用链得出，本文抽核 6 条（mcpConfig ×2、mcpDetectedClients、security、tikhubRoute、catalogStore），其余 13 条按扫描员报告。
- `.tsx` 8 处 raw render 里后 5 处的内容来源未逐条追。
- 在途项（J 块 / launch-rewrite ①）不重复判断，只在表里标「在途」。

## 附：怎么重跑

```
node scripts/audit/scan-ownership.mjs            # 人读表
node scripts/audit/scan-ownership.mjs --json     # 原始数据
node scripts/door-map.mjs creationDocumentTools  # 任一状态的门表
```
