# 方案 A：本分支根因聚类结构复核

> 历史审查快照，保留当时发现及判断，不是当前施工依据。已撤回新增 CreationAgentTarget；当前复用原编辑器，持久作者正文为完整 editorial，已批准执行快照不随编辑改写。正式参考 resolver 已接入，真实供应商证据另验。现行范围与修复状态见 [重启执行方案](../plan/2026-09-20-core-a-restart.md)；本文件后文的旧候选保存、显式服务落画布、目标标签和未装配说明均按历史读取。

日期：2026-09-19。范围：`codex/core-a-integration-20260919` 的方案 A 核心修复及创作区闭环。本文是集成收口时对已实施边界的源码复核，不补写“实施前已经完成”的历史，也不是完整方案 B、全模块审计或发布批准。

## 恢复会话后的独立验收与根因纠正

**当前结论：不具备完整交付条件。** 用户指出另造分镜页后，协调者与三个只读审查代理对照 merge-base `dfca9990b89c9c401b8ac81ea9ce30ab032e1be4` 审查本轮提交、工作树及新增文件。以下纠正优先于后文早期结构判断；静态审查不等于真实旅程通过。

### 三层根因

1. **要求来源失真。** 原任务已规定不重做表格/画布、保留原控件，并指定完整版的 `Run.authoring.plan`/执行快照分离。恢复时先用执行摘要代替原件，误把当前 `generationPlan` 可编辑实现当成架构目标。原件现已定位，A/B/M/V 的文件名和 SHA-256 记录在执行任务书的 Verified source authority；M/V 哈希与 A 的引用一致。未实施的“把全部作者字段补进候选”建议已撤回。
2. **复用停在表面，宿主契约不完整。** 旧分镜编辑器需要完整的创作字段及动作，当前 Run 接口只接标题/prompt；实施绕建简化表单，使原功能消失。付款卡虽然复用 composer，仍把 canvas node 当编辑前提，且候选映射缺引用，异步 writer 又读取当前焦点。共享组件不自动保证共享身份、权限、持久化和执行语义。
3. **验收没有覆盖真实使用边界。** creation-columns 测的是外壳；引用隔离探针注入自写 writer，跳过真实付款宿主；新 Electron 旅程按新 textarea 写断言，反而接受了错误替代页；文件头还误标 CJ1/CJ3。测试通过只说明其断言成立，不能提升为未覆盖能力完成。协调者收货未逐项对原功能与原 C/CJ 编号，承担遗漏责任。

### 确认的缺口与原验收对应

| 编号 | 问题与证据入口 | 原件映射 | 状态 |
| --- | --- | --- | --- |
| A01 | `StoryboardWorkspace` 选择新增 `CreationRunPlanEditor`，原模型/参考/增删排序/执行/Undo 不再提供 | A K4/C16；B 全局约束/T3 | 阻塞；必须复用原编辑器，不能修成另一套同样外观的复制页 |
| A02 | 新页本地草稿随 Run key 卸载，CAS 失败后的 reload 直接覆盖输入 | C16/C17；B S13/Q05 | 静态确认；原编辑器恢复必须覆盖草稿生命周期 |
| A03 | `DocumentListSidebar` 删除存量方案删除菜单；原编辑器删除按钮后未接放画布替代动作 | A K2/K4；后续用户明确交互 | 删除菜单已恢复并通过真实组件点击红绿；存量放画布仍待接线 |
| A04 | 付款 writer 忽略上传时 node/shot 身份，await 后使用当前编辑目标 | C04/C17/C27；S39 | 已在真实 hook 受控测试复现并修 scope 生命周期；未冒充 Electron/供应商验收 |
| A05 | `spendCardDraft` 只抽既有参数键，引用不进入持久候选；正式 reference URL resolver 仅 fixture 装配 | C05/C16/C27；S14/S39 | 既有缺口仍阻塞；来源树有可复用但未完整接线的 delta |
| A06 | 付款卡要求 canvas storeNode，未显式落画布的文稿 Run 没有编辑主体 | C16/C27；S34/S39 | 静态确认，需从候选投影原 composer，不能新建 UI |
| A07 | `target.shots.length > 1` 决定是否带 shotId，多镜 Run 的单镜报价误写顶层候选 | C04/C05；S04/S05 | 静态确认，需持久候选地址，不从展示数量猜身份 |
| A08 | 关闭付款卡直接清本地 draft，未确认 prompt/参数修改未持久化 | C08/CJ1；S02/S08 | 旧缺口未闭环，不能以“未删除节点”代替内容保留 |

### 已做的系统改进及证据限度

- 派工必须包含原始条款/后续用户变更、实际 AGENTS.md 适用原则回报、现成组件与 owner、写入边界和行为验收；不接受仅一句“已读”。已写进同一执行任务书并传给当前代理，未另造规则系统或手改生成的 AGENTS.md。
- 原 `core-a-creation-runs.e2e.mjs` 增加原分镜编辑器/批量栏/行三块的断言，并按既有展开按钮处理侧栏。实际在当前 Electron 构建验红于缺失原编辑器，证明替代页不再被该旅程接受。尚未完成纠偏，因此该验收仍红，不能更新截图基线掩盖。
- 付款异步写入改在已有 NodeWriteAccess 的宿主边界：项目/操作/报价/候选版本/镜头/范围组成每次编辑访问身份，切换或卸载使旧 writer 永久失效；上传 await 后检查原权限。新增测试运行真实 `useAgentPanelSpendConfirm`、上传 hook、草稿映射，只替换环境端口。修前 1 正控通过、7 缺陷断言失败；修后 8/8，通过邻接 23/23、应用类型和根因合同 48/48。测试有意沿用已有 parameter 槽隔离身份问题，不证明 A05 引用契约已完整。
- 初始 Electron 的 a2 行超时已排除为产品回归：原有 storyboard 模式默认收起侧栏，脚本没有展开。实际截图和 DOM 观察支持此判断；保留原交互，不改产品迁就脚本。
- 测试归属已纠正：该创建/编辑旅程仅是 **CJ2 的部分证据**，不覆盖 CJ1 付款、CJ3 消息或 CJ4 参数条全链。安装包、真实供应商、Windows 仍未验证。
- 侧栏删除恢复复用原确认框与 `deleteStoryboardDesign`；新增真实组件浏览器回归先在菜单缺失处验红，再验证取消保留、确认删除方案、删除文稿及最后文稿保护。唯一挂载测试同步通过；根因合同 48 项通过。该证据不覆盖 Run 删除、整组一次 Undo 或安装包重开。

后续恢复原界面必须先核对必要 T3 依赖与源施工的完整性，沿原架构补共享契约，不能把这份审查建议当成新产品授权。其余已确认缺陷不能在启用状态下作为普通小问题放行。

## 触发与证据范围

本次实际运行 `node scripts/check-symptom-cluster.mjs`，门岗按两级目录汇总最近七天合同，要求以下模块补结构复核。这个粗粒度聚类说明边界需要共同检查，不证明每份历史合同是同一个根因。

| 模块 | 门岗窗口内合同数 | 本次实际复核对象 |
| --- | ---: | --- |
| electron/productionRun | 12 | Run CAS、方案保存、付款作用域、显式 placement |
| src/desktop | 5 | ProductionRun bridge 的报价版本、scope 和写入通路 |
| src/i18n | 7 | Agent 目标身份标签的中英词条及消费者 |
| src/ui | 7 | composer 使用的局部加载重试边界 |
| src/workbench | 30 | Run 投影、Agent 目标、手势/history 生命周期、两宿主写权限 |

证据来自实际读取的源码、现存根因合同及以下已有调查：[单一账本 prior art](../research/2026-09-18-storyboard-single-ledger/prior-art.md)、[参数条定位 prior art](../research/2026-09-10-node-composer-placement/prior-art.md)。未新增网络研究；未重新审查聚类中所有导入、凭证、转写、MCP 和供应商历史修复。PR #806/#807 不因本报告而视作已合入或已交付。

## 结构判断

### electron/productionRun：一个持久化 owner，分离写方案、放画布与付费执行

- [productionRunRepository.ts](../../electron/productionRun/productionRunRepository.ts) 的命令执行检查 `expectedRevision`；Run 和事件继续由原 repository 管理。来源文稿与 Run revision 是不同不变量，不能以当前选中文稿或自动抬高 revision 代替它们。
- [productionStoryboardAuthoring.ts](../../electron/productionRun/productionStoryboardAuthoring.ts) 的保存校验供 IPC/reducer 共享，核对 sourceDocumentId/revision、精确 shot 集合及 draft 状态。标题存 `authoring.title`，提示词仍在原 generationPlan candidate，不另存第二份可编辑镜头集合。
- [productionRunReducer.ts](../../electron/productionRun/productionRunReducer.ts) 的 `generation.place_canvas` 校验来源并保存 explicit intent；[productionRunService.ts](../../electron/productionRun/productionRunService.ts) 在重放同 commandId 时仍尝试完成 renderer 副作用；[canvasLandingHost.ts](../../electron/productionRun/canvasLandingHost.ts) 复用已有节点绑定。intent 是放置意图，不应被 UI 当作节点已创建的证据。
- [付款合同](../fixes/2026-09-19-generation-scope-and-dismissal.root-cause.json) 将作用域、报价确认、关闭和执行生命周期归入原 reducer/authorization owner；关闭付款卡不等于删除方案。

判断：多个入口可以共存，但必须收敛到相同身份与持久化边界。禁止为创作区、Agent 或画布各设方案写库，也不能让 placement 引入模型调用或付款授权。对应回归位置为 `productionStoryboardAuthoring.test.ts`、`explicitCanvasPlacement.test.ts`、`productionRunIpc.test.ts` 和付款合同所列套件；本文不重复执行或增加它们的通过声明。

### src/desktop：桥接传契约，不接管领域状态

实际读取 [productionRunBridgeTypes.ts](../../src/desktop/productionRunBridgeTypes.ts)：`pendingSpend` 返回只读价格投影，`confirmSpend`/`discardSpend` 携带 `quoteId`，确认可传 `shotIds`。再核对 [productionRunApi.ts](../../src/workbench/production/productionRunApi.ts) 与 [productionActionIpc.ts](../../electron/productionRun/productionActionIpc.ts)，这些字段沿原调用链送往能力 owner。

判断：桥接层的职责是保存跨进程契约；不在 renderer 另算权威价格、删除草稿或推断当前报价版本。新创作区类型从现有 desktop bridge 派生即可，不把 production service 的运行时代码引入 workbench。聚类中的媒体导入与 MCP 历史修复未在本次重审。

### src/i18n：标签是身份投影，不能成为身份 owner

实际读取 [agentResident.ts](../../src/i18n/locales/agentResident.ts) 的 `targetDocumentName`、`targetPlan`、`targetRevision` 中英词条，并核对 [CreationAgentTarget.tsx](../../src/workbench/ai/resident/CreationAgentTarget.tsx)：执行中标签取 transcript 的 captured target，并检查 project/workspace；标签不决定写回目标。

判断：先绑定身份，再翻译其展示值。任何只改标签而仍用 active document 写入的修复均不成立。来源 revision 文案、方案名与未创建 Run 的显示需要 CJ2 最终界面验收；本文不以词条存在替代用户可见证据。

### src/ui：局部重试必须保持其他未保存输入

实际读取 [chunkBoundary.tsx](../../src/ui/chunkBoundary.tsx)：`lazyWithChunkBoundary` 的 local recovery 使用显式 retry 创建新资源，并在局部 Suspense 内呈现 pending/error；普通调用者继续保留既有路由 reload 行为。

判断：错误恢复和业务写权限是两条边界。局部 composer 加载失败不应重载整窗或丢失旁边草稿；也不能为了恢复参数条而改变所有懒加载宿主的生命周期。验证位置是 composer lifecycle 合同所列测试；本轮未重审 src/ui 下与凭证、MCP 有关的历史合同。

### src/workbench：读投影与临时 UI 状态不能夺取写入目标

- [useCreationRunPlans.ts](../../src/workbench/creation/storyboard/useCreationRunPlans.ts) 以 projectId/sourceDocumentId 过滤 Run summary，再用 runId 选中；无 sourceDocument 的旧 Run 不会被归到当前文稿。缓存只服务读取，保存通过原 Run command。
- [请求目标合同](../fixes/2026-09-19-storyboard-send-target.root-cause.json) 把目标捕获放在发送前，并把来源、目标 Run 和 revision 传给同一 generation operation owner；界面切换不应改变请求。
- [canvasDraggingFlag.ts](../../src/workbench/generationCanvas/components/canvasDraggingFlag.ts) 用 stage 和唯一 token 表示一次手势，释放只清理该 token，且覆盖 blur、pointercancel、lostpointercapture 与隐藏；[useNodeResultHistory.ts](../../src/workbench/generationCanvas/nodes/useNodeResultHistory.ts) 将 history intent 绑定节点身份、选择和结果可用性。
- [NodeGenerationComposer.tsx](../../src/workbench/generationCanvas/nodes/NodeGenerationComposer.tsx) 现在把含 readOnly 的 NodeWriteAccess 显式传给 drop、@ 和提示词库参考入口；panel 仅写卡内草稿，不调用 canvas 连边。浏览器根因回归已观察修复前 canvas writes/connections/card writes = 2/1/0，修复后 = 0/0/3，并验证连续引用编号和只读零写入。付款宿主同步 latestNode，避免一次手势多次写入覆盖。
- 另一个尚待范围决定的缺口：spendCardDraft 只保存已有 parameters，新增 reference 槽会丢失；正式 generation provider 的 reference URL resolver 未完整装配。权限隔离通过不等于参考素材可正式提交；扩大生产执行链路还是明确拦截不支持修改，已提请用户决定。

判断：画布和付款卡可以共用组件，不能共用错误的写入目标。参数输入恢复、引用写隔离和完整 CJ4 旅程必须分别验收；手势测试通过不证明付款卡所有媒体引用路径隔离。权限根因已完成红绿验证，参考素材草稿及正式提交缺口仍阻塞完整付款参考闭环，不得因本结构文档使门岗转绿而忽略。

## 收口边界与验收

本次只补审查与已有来源索引，不改生产代码、测试、门岗阈值或基线。保留旧手工方案的现有 owner，不迁移无来源历史 Run，不实现方案 B 全部 authoring/诊断系统。

集成仍需以最终树的 typecheck、build、K1/K2/K3/K5/K6 focused results 及隔离 Electron 旅程判断完成。本文不声称真实供应商、安装包或全平台验证通过。Windows release-ready：未验证。

本报告所支持的结论仅是上述结构边界已被共同检查、重复 owner 的禁止边界已明确；现存风险与未执行旅程仍保留在最终验收清单。
