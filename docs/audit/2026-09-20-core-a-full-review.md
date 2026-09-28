# 简化 A＋完整 T7：方案复核与当前分支审查

日期：2026-09-20。以下初审状态对应 §2 的历史 SHA：**当时只读审查完成、实现不可验收、尚未恢复实施**。之后已按用户授权恢复施工，现行进度见 [统一验收表](2026-09-20-core-a-current-acceptance.md)；实施范围见 [重启执行方案](../plan/2026-09-20-core-a-restart.md)；历史发现和失败不被后续通过覆盖。

## 1. 结论

用户提供的 `Nomi_simplified_A_plus_T7_original_storyboard_plan_2026-09-20.md` 方向正确，可作为纠偏依据。保留原分镜编辑器、原动作和 canvas runner，只接目标、完整数据、保存恢复及稳定节点绑定，符合 P1 单一实现、P2 根因边界、P3 真实验收、P4 通用及 P5 先看原实现。完整 T7 属于本次；完整 T3 不因历史文档或实现方便自动获得授权。

但“方案原则正确”和“当前代码已经符合方案”是两件事。当前不仅存在分镜问题，付款编辑、任务错误分类也有确定缺口。不能只恢复页面外观，不能整树回滚，也不能沿当前不完整的新执行接线继续补成第二套框架。

新方案诚实说明没有当前 diff；本报告补充本地证据。它应与本报告的处置边界、六项澄清一起交给后续实施者，无需重新让用户设计产品使用方式。

## 2. 审查身份、方法和边界

- 工作树：`/Users/aoqimin/Desktop/Nomi-core-a-0919`。
- 分支：`codex/core-a-integration-20260919`。
- HEAD：`a44c0f5899effa7f94e4b124a5143d68e8b2a47e`。
- 本地 `origin/main` 与 merge-base：`dfca9990b89c9c401b8ac81ea9ce30ab032e1be4`，本地比较 0 behind / 16 ahead。本次未刷新远端，不将其称为远端实时状态。
- 纳入完整分支增量、未提交及未跟踪文件：239 个 tracked changed + 48 个 untracked，共 287 个文件。不是只审最后一次 dirty diff。
- 已读指定 A、B 的 T7、新方案、`AGENTS.md`、根因技能、架构现状和两份 core-a 执行／审查记录。
- 三名审查者交叉审查此前不同负责领域；主审复核关键调用链并运行实际投影探针。未取得跨模型池独立评审，不冒充已经完成该交付要求。
- 287 个文件完成差异清点；按 K0–K7/T7 追踪关键入口和共享边界，并检查相关测试。**不声称逐行证明了全部文件正确，也不把未发现问题当成功能已通过。**
- 开始文件哈希记录：`/private/tmp/nomi-full-audit-start.json`。报告写入前复核，287 个既有文件哈希均未变化，HEAD 未变化。本轮只新增本报告，未改生产、测试或原方案，未提交、推送或恢复实施。

来源指纹：

| 文件 | SHA-256 | 本轮角色 |
| --- | --- | --- |
| `Nomi_plan_A_core_fixes_2026-09-19.md` | `ada6d3fca6b0f7d7005348f6a5ddb13f1a1b4a21a5ad30042075403da425a690` | K0–K7 / C01–C30 / CJ1–CJ4 |
| `Nomi_Plan_B_Full_Reviewed_Taskbook_2026-09-19.md` | `a016edb9ddbc2659c9a862ef47a2d6ed1244acfe26f05bd0891e6db4c143e98e` | 仅追加完整 T7，不自动展开其他部分 |

## 3. 给新方案补充的六项明确约束

### 3.1 复用执行链与保存归属分别裁决

建议补到 §2.3 / §7.1：

> 原执行链复用，不等于把 Run 复制回旧的可写方案 store。先以当前源码确定唯一获准保存对象，再将完整 `StoryboardPlan`、捕获目标及稳定绑定交给原动作层。原 runner 的输入、结果和任务身份适配也必须实测；不得另造编译、付款或执行系统来绕开接线缺口。

当前已有 `generationPlan` 候选加 editorial 的适配。该职责不因文件名而必然错误，但已证实往返丢字段、模型身份残留、Agent 来源不能打开，不能先验判为可直接保留。反过来，也不能因这些缺陷就自行启动 `Run.authoring.plan` 的完整 T3 迁移。

### 3.2 显式“放到画布／查看”与生成时按需建节点并存

建议补到 §3.2 / W06：

> 新建、打开、重开和保存本身不自动创建缺失节点。“放到画布”只放置；“查看”只定位。原单镜／批量生成可在动作内部按需创建缺失节点，不要求用户先点一次放置。已有节点的合法内容投影继续遵循原覆写规则。

这样既不删除已明确要求的 Place/View，也不重新引入强制确认落画布门槛。应分别验证四类入口的副作用，不能仅凭生成路径通过推断其余通过。

### 3.3 方案内容版本不能直接等同于整个 Run 版本

建议补到 §3.1 / W02 / W05：

> 内容冲突比较应排除 job 进度、节点绑定等不改变作者内容的更新，同时在实际提交边界阻止真正的并发作者覆盖。禁止通过盲取最新 revision 重试掩盖冲突；优先修现有保存边界，不新建版本数据库。

新方案已排除全局 `persistRevision`，还应明确 Run revision。同一问题目前存在于 `useStoryboardRunHost.ts:29` 的 `expectedRevision: run.revision`，而 Run 的 job／binding 命令也会推进 revision。此为源码可证的耦合风险，尚未通过定点并发故障注入复现。

### 3.4 关闭付款卡保留输入，但不得把未批准编辑提升成方案或画布修改

建议补到 §3.2 / P07 / C08 / C27：

> 卡片待确认草稿、正式方案、画布和已批准执行记录职责分开。关闭只结束该请求，不提交媒体、不丢用户输入，也不将卡片覆写提前写入正式方案或画布。复用既有待确认草稿归属；明确关闭后与重开后的保留范围，不另造通用保存服务。

当前关闭链是 `discard → persistEdits → generation.revise → notifyPlanChanged → landDraftOnCanvas`。具体为 `useAgentPanelSpendConfirm.ts:338`、`productionGenerationOperationStore.ts:230`、`appIntegration.ts:168/223`。它与新方案 P07 的禁止提前写入要求相冲突；不能把“保留内容”解释成默默修改作者方案和画布。

### 3.5 原首帧／×3 流程也须核对实际收费集合

建议补到 W08 / W09 / C10：

> 验证原首帧依赖波次展开后的实际提交节点及成本，验证 ×3 的实际次数。批准前展示的集合必须与批准后提交的集合一致；缺首帧、锚点或重试不得在批准后暗中扩大收费范围。

保留原执行方式不豁免已有安全要求。这应在原确认和 runner 边界补证据，不作为重建付款系统的理由。

### 3.6 把仓库规则落到派工和收货证据

建议在 §8 开工指令前增加：

> 每名执行者先读 `AGENTS.md` 及适用原文，回报实际复用入口、唯一写入边界和不改项；纠正性生产改动前按根因技能生成 door-map。协调者核对实际 diff 和原功能对照，不接受仅“已读”、仅截图或仅测试数字。旧执行记录中的扩范围指令失效，用户当前 A＋完整 T7 约束优先。

另外将 C14 明确扩到“真实持久化损坏而非不存在”，C12–C13 检查工具 schema 与 runtime 一致；验收记录分列受控测试、实际 SDK＋模拟服务、真实 Electron、真实供应商、候选安装包和 Windows。无需再新建一套规则体系。

## 4. 当前代码发现

严重度：P1 表示本轮相关功能／数据／付费边界的验收阻塞；P2 表示明确契约缺口或需进一步复现的风险。下列均注明证据强度和历史归属，未将代码风险冒充真实扣费事故。

### F01 · P1：原页面已复用，原生成动作却接到不完整的新路径

- `src/workbench/creation/storyboard/useStoryboardRunHost.ts:70` 对 variants 直接抛错；`StoryboardPlanEditor.tsx:371` 的 ×3 按钮调用它。
- 同组件 `:315/321/379/383` 将逐镜、重生成、参考卡及批次动作改接 `present`。
- `electron/capabilityCore/storyboardOperationCandidate.ts:24` 调新 compiler 不传参考解析和阶段；`electron/shared/storyboard/storyboardExecutionCandidate.ts:41/53/67` 对需要这些依赖的输入拒绝执行。
- **后果：**原按钮还在，×3 必失败，含引用／首帧等方案走不通原动作。是分支引入的功能缩水，不是缺一块新页面。
- **处置：**接回原 `storyboardRowActions`、依赖波次和 runner，再撤重复执行接线；保留原本必要的转换器和安全检查。不能只隐藏按钮或放宽新 compiler 校验。

### F02 · P1：合法 Agent anchor 方案不能打开

- `electron/shared/storyboard/generationPlanEditorial.ts:65` 要求 anchor editorial；现有 Agent 输出 anchor/shot 不保证提供它，`useStoryboardRunHost.ts:25` 直接使用该投影。
- 真实投影函数的隔离探针返回 `storyboard_anchor_editorial_unavailable`。
- **归属／处置：**新适配缺口。在现有获准创建／修改路径保留完整作者事实，并明确旧数据能力边界；不能用空 anchor 夹具声称 Agent→编辑器接通。

### F03 · P1：单候选方案只改标题，也会丢原参考素材

- `generationPlanEditorial.ts:101` 的 prior 仅从 `existing.shots` 建表；单 candidate 转入编辑器后没有匹配 old，`:118` 将原 references 变成空数组。
- 真实转换函数探针：`referencesBefore=[{assetId:"image-a",contentHash:"h",version:1,kind:"image"}]`，仅改标题后 `referencesAfter=[]`。
- **归属／处置：**新增逆向适配导致数据丢失。稳定身份下完整往返应覆盖单候选和多镜来源；同处 node binding 等元数据也须核查，不能只验证 prompt。

### F04 · P1：换视频模型后仍保留图片任务身份

- `generationPlanEditorial.ts:112/116` 无条件保留旧 moduleId/mode；`storyboardOperationCandidate.ts` 对已有二者提前返回。
- 探针：编辑器 `editorKind="video"`、模型 `video-model`，保存候选仍 `taskKind="text-to-image"`。
- **后果：**显示模型与执行语义不一致，可能被后续拒绝或进入错误任务类型；未声称已观察到错误供应商扣费。
- **处置：**在原模型／模式解析边界重建一致身份，避免继续叠加新转换逻辑。

### F05 · P1：提交后继续编辑没有完整保存路径

- `electron/productionRun/productionStoryboardAuthoring.ts:25` 仅允许 draft，其他状态返回 `new_draft_required`；当前原编辑器接线没有完成相应后续编辑路径。
- **后果：**运行／提交后的方案仍可见编辑界面，但保存被拒绝。保护已批准执行记录是必要的，缺的是作者编辑路径，不应简单放开 sealed 合同写入。
- **处置：**核定原作者内容与已批准执行记录的边界，补现有可编辑入口；不能以此自动扩为完整 T3。

### F06 · P1：新落地路径没有原关键帧／参考依赖图

- `StoryboardPlanEditor.tsx:305` 的 Run 分支跳过原 placement runner；`src/workbench/capability/multiShotCanvasLanding.ts:243` 创建参数为 `edges: []`，输入不携带原 keyframe/referenceBindings 结构。
- `useStoryboardRunHost.ts:65` 又需要 first_frame edge 才能识别关键帧节点。
- **后果：**普通主体节点落地不代表原分镜图完整；首帧和参考关联不能据此验收。
- **归属／处置：**新增入口复用了不具备完整分镜语义的底层路径。将稳定 Run 绑定接入原 placement/projection，勿增加平行关键帧构建器。

### F07 · P1：出现两份带私有状态的落地主人

- `electron/productionRun/productionRunService.ts:98` 新建 landing host，`isProjectOpen` 恒 true；`electron/capabilityCore/appIntegration.ts:214` 原实例仍存在。
- `canvasLandingHost.ts:48` 的在途集合是实例私有；付款准备 `appIntegration.ts:343` 只等待其中一个。
- **后果：**service 发起的落地不在付款等待集合，晚落盘可能使自己的授权过期。两实例及等待遗漏由源码确认，竞争结果尚未做确定性故障注入。
- **处置：**共享现役唯一实例／边界，保留正确项目归属和并发控制；不是再加第三份协调状态。

### F08 · P1：同一个 Run 的新批次被上一张卡的旧编辑覆盖

- `src/workbench/ai/v4/useAgentPanelSpendConfirm.ts:113` 仅按 operationId 重置编辑；`:287` revise 不携带用户看到的 quote/version；host `appIntegrationSpendConfirm.ts:232` 读取最新报价。
- 使用实际 React hook 和既有浏览器 harness 复现：旧输入 `edited`；host 新批次 prompt 为 `NEW BATCH AUTHOR TEXT`、quote 为 `quote-next`；卡片仍显示旧输入，confirm 发出 `patch.prompt="edited"`。
- **归属：**旧 reset 逻辑已存在，本分支同 Run 多批次提高可达性。本轮编辑／隔离要求尚未满足。
- **处置：**草稿绑定显示时的完整请求身份，并在实际 revise 边界比较。自己的成功保存可明确重基，不能无条件沿用新报价。

### F09 · P1：参考素材 resolver 有实现，真实执行组装未接入

- `electron/capabilityCore/productionReferenceUrls.ts:24` 的 resolver 仅定义及测试引用；`appIntegration.ts:182–194` 只在 E2E fixture 分支注入参考 URL。
- provider projection 对缺 URL 的 pinned refs 拒绝执行。helper 单测通过不足以证明正式链路可用。
- **归属／处置：**既存缺口，被本轮参考编辑暴露；接现有正式资产解析／传输边界，补生产装配测试。不能新增第二套资产执行服务，也不能标成已通过真实参考生成。

### F10 · P1：付款卡新增参数值不一定被保存

- `src/workbench/ai/v4/spendCardDraft.ts:146` 仅遍历 `Object.keys(shot.parameters)` 逆投影。
- **触发：**原参数为空，或换模型出现新参数，控件改了值但旧候选没有该 key，提交／关闭时遗漏。
- **归属／处置：**既存未修，属于完整 T7 双宿主要求。以所选真实模型 schema/控件声明决定参数，不以旧参数出现过为准。现有预置 size/quality 测试不足。

### F11 · P1：不确定失败被提示成“没有花钱”

- `useAgentPanelSpendConfirm.ts:270–273` 通用失败走 `agentPanelV4.spendActionFailed`；`src/i18n/locales/agentPanelV4.ts:403/806` 声称没有开始生成／花钱。
- **触发：**批准或提交后的回包失败、关闭与提交竞争等。catch 不能证明零提交。
- **归属／处置：**既存安全语义缺口，处于本轮 K1/K2 路径。按可信结果区分拒绝、已接受与未知；未知时引导核查任务，不承诺未扣费。本审计未发生真实扣费。

### F12 · P1：真实存储损坏仍被铸成可信“任务不存在”

- `electron/productionRun/productionRunRepository.ts:142/220` 在 snapshot 损坏且 events 不可恢复时返回 null。
- 新 `productionRunService.ts:151` 将 null 转成 `ProductionRunNotFoundError`，`productionGenerationOperationStore.ts:73` 再映射可信 generation not-found。
- 隔离临时目录中仅写 `{broken` 到真实 repository 的 run.json，read 实际返回 null。没有改用户项目。
- **归属：**repository 的 null 旧行为与新 typed absence 边界组合形成误分类。现有 mock owner 的 not-found 测试漏掉了最初分类处。
- **处置：**保留显式 domain／类型化错误；在持久化读取边界区分不存在与存在但损坏／不可读。补 repository→service→transport 测试，不改为错误字符串猜测。

### F13 · P2：工具 schema 与 runtime 的 domain 要求不一致

- `electron/shared/agentCapabilities/verbs/verbProjections.ts:141/270` 将查询／取消的 domain 设为 optional；`electron/agentLane/laneExtendedDesktopPorts.ts:99` 运行时强制要求。
- **后果：**模型发出 schema 合法请求仍必然失败；这是契约不一致，不是授权绕过。
- **归属／处置：**本分支新增路径；统一现有 schema 和 runtime，不新增任务猜测路由。

### F14 · P2：参考槽角色可能被静默改变

- 新 `src/workbench/ai/v4/spendCardReferences.ts:31–36/49–62` 找不到精确 role 时落到同种媒体的通用槽。
- **后果：**模式不支持的 first_frame 可能显示成普通参考，后续编辑逆投影改写角色或丢不可见绑定。
- **证据／处置：**源码路径，未做浏览器复现。保留不可用槽的原绑定，明确处理不支持角色，不为显示缩略图静默改语义。

### F15 · P2：异步落地的项目身份复验不覆盖全部写入

- `src/workbench/capability/capabilityApplyHandler.ts:375` 校验入口项目；`multiShotCanvasLanding.ts:131/250` await 后继续当前 store 操作。
- 内部 `applyCanvasToolCall` 的 guard 不覆盖返回后的附加写入。
- **归属：**既存缺口被新 save/place 入口扩大。源码风险，未复现跨项目误写。
- **处置：**原共享落地边界捕获租约并在 await 后／写前复验，以定点挂起测试验证；不新建全局状态管理器。

## 5. 现有改动处置建议

下表给出已查职责的处置依据，不是可以立即执行的整文件删除命令。共享文件只处理相关 delta；原主线能力及其他独立成果保留。未列文件没有自动获得批准或撤除结论。

| 实际文件／职责 | 裁决 | 原因和后续证据 |
| --- | --- | --- |
| `StoryboardPlanEditor.tsx` / `StoryboardWorkspace.tsx` 挂回原编辑器 | 保留原组件复用，调整 host 分支 | 页面恢复合理；必须恢复原动作完整性，不能只复用壳 |
| `useStoryboardRunHost.ts` / `storyboardEditorHost.ts` | 调整目标与保存适配；撤换重复执行接线 | 保留捕获身份，原动作应获得真实目标和稳定绑定；参见 F01/F06 |
| `storyboardRunDraftSession.ts` | 有条件保留输入缓冲职责 | 临时 Map 不是当然的第二份持久正本；须验证生命周期、回收、冲突与重开保留，不能靠它替代持久化 |
| `generationPlanEditorial.ts` / `productionStoryboardAuthoring.ts` | 调整 | 完整形状适配有必要，但 F02–F05 阻塞；不因名字直接删除，也不强行维持已证不完整设计 |
| `storyboardOperationCandidate.ts` / 新 `storyboardExecutionCandidate.ts` 执行替代增量 | 接回原动作后撤除重复职责 | 原提示词转换、共享 schema、原参数投影不在盲删范围；如有必要纯适配应沿原边界收敛 |
| `productionRunService.ts` 第二份 landing host | 撤除重复实例所有权 | 共享现役入口，不撤稳定绑定和原落地能力，参见 F07 |
| `multiShotCanvasLanding.ts` / 原 rowActions、projection、nodeBinding | 调整复用 | 不把普通候选节点投影当完整分镜图；保留已有结果和覆写，参见 F06/F15 |
| 稳定 shot/anchor/keyframe/node 元数据、来源身份 | 保留必要字段并补完整往返 | 重排、重开、结果回填、重复落地都依赖；不能为了少字段删掉 |
| `useAgentPanelSpendConfirm.ts` / `spendCardDraft.ts` / `spendCardReferences.ts` | 调整 | 卡片隔离方向合理；F08–F11/F14 及关闭副作用尚未满足要求 |
| `generationShotScope`、quote 内容／范围指纹、精确批准集合 | 保留 | 解决明确付费范围，不能因分镜执行纠偏误撤 |
| `taskReference`、显式 generation/export 路由、安全错误封装 | 保留并修 F12/F13 | 不恢复跨 domain 猜测或原始错误泄漏 |
| 原输入 ancestry/retry 引用、技能附件重验、pi 历史投影、admission Stop | 保留 | 本审查未发现另造 session engine 的证据；其读模型／输入草稿并非持久运行时第二正本 |
| `useNodeResultHistory`、drag lease、lazy 局部恢复、geometry observer | 保留并完成完整 T7 验收 | 是原组件生命周期修复；42 项相关测试通过不代表全 T7 实测完成 |
| `agentTraceIpc.ts` 主进程固定派生文件路径 | 保留并补系统／候选包验证 | 收窄任意路径输入合理，OS 实际打开与最终包尚无本轮证据 |
| `core-a-execution` / Sep19 structure review | 调整现行指令效力，保留历史证据 | 顶部纠偏与下文 B T3 指令仍有冲突／过时描述，应明确被取代，不覆盖历史失败记录 |
| 原编辑器测试、Electron 旅程、截图基线 | 扩展行为证据、保留有效测试 | 原行为通过后才可声称等价；不能把当前实现写出的缩减断言当规格 |

## 6. 全范围覆盖与验证结果

| 范围 | 本次结论 | 限制 |
| --- | --- | --- |
| K0 范围／分支／完整 diff | 已清点完整增量和身份 | 不等于最新远端同步或交付批准 |
| K1/K2 付款／关闭／精确范围 | 保留精确 scope 修复，发现 F08–F11 及关闭副作用 | 付款定点套件已出现 6 项超时失败，整组未完成；未付费 |
| K3 身份／安全错误 | 路由方向合理，F12/F13 未解决 | 真实损坏 probe 不能被 mock owner 测试替代 |
| K4 分镜／持久化／节点绑定 | F01–F07 阻塞 | 原完整编辑／生成／重开旅程未通过 |
| K5 输入／技能附件／重发／压缩／Stop | 已查原框架复用与身份防线，100 单测 + 15 SDK 受控测试通过 | 不代表真实 Electron CJ3 或真实模型成功率 |
| K6＋完整 T7 | 现有生命周期修复值得保留，双宿主仍有 F08/F10/F14 | 尚无全套点击命中、异常手势、边缘／零尺寸真机证据 |
| K7 诊断／候选包 | 固定安全派生路径方向合理，相关测试在 42 项中 | OS 打开、候选安装包、Windows 未验证 |

### 实际命令与结果

- `pnpm run typecheck`：退出 2。`electron/shared/capabilityModeManifest.ts:33` 的 `replaceAll` 不符合当前目标 lib。
- `pnpm run gates:contracts`：退出 1。99 门，**86 通过、10 阻断失败、3 advisory 失败**，用时 228 秒。
- 阻断门：root-cause-contracts、design-lab、i18n、asset-evidence、symptom-cluster、controls、walkthroughs、typecheck、check:test-types、boundary-owners。
- design-lab 本轮因类型检查失败而被阻断，**不是新视觉差异已被证实**；与独立 typecheck 是同源失败，不算两个产品 bug。
- i18n 有侧栏仍引用的三个已删 key；asset-evidence 指向 `pendingSpendReferences.ts:16` 缺 sourceEvidence；两份测试有类型错误；合同仍引用已删除 `CreationRunPlanEditor` 或已移动符号。
- walkthroughs 报未证明探针有效的零值断言基线 63→65。日志列出的前八项是现存样本，不能据此把它们说成本轮新增两处。
- symptom-cluster 检查要求 Sep20 起的结构审查；本报告包含 `src/workbench` 共享职责分析。但报告写入后**未重跑门禁**，以上结果仍准确标记为报告写入前的冻结树。
- K3/K5 定点 6 文件 100 项通过；实际已安装 SDK＋本地模拟 provider 的 4 文件 15 项通过。与真模型验收分开。
- 分镜／T7／诊断定点 5 文件 42 项通过，覆盖 draftSession、creationRunProjection、anchoredPlacement、canvasDraggingFlag、agentTraceIpc。
- 付款 6 文件定点套件已停止，未产生完整汇总。最终核查日志时，`agentPanelSpendBatches.e2e.test.ts` 已记录 6 项超时失败（各 30／60 秒），含同 Run 的 3＋30 批次及 discard/revise 与批准竞争。超时根因未定位，不能断言全部是产品 bug，也不能忽略为通过。实际 React hook 的陈旧报价覆盖探针成功复现 F08。
- 三个真实投影函数探针分别复现 F02/F03/F04。所有探针使用临时数据，没有修改用户项目。

本次没有真实 Electron、候选安装包、供应商、Windows 或完整视觉走查的通过结论。旧 build／截图／门禁结果只属于当时树，不可以给当前 dirty tree 背书。没有运行最终交付 Ponytail 或创建 PR，因为当前仍是只读审查，且功能／门禁未收敛。

## 7. 为什么现有验收没有挡住，以及如何系统纠偏

### 根因 A：把历史架构目标升级成当次授权

旧执行记录同时保留 A＋T7 纠偏和 B T3 架构导向，例如 `docs/plan/2026-09-19-core-a-execution.md:19/38` 的矛盾指引。实施者可能把中间设计当作既定约束，继续为新结构补 compiler、owner 和执行入口。

**优化：**维护一份现行范围与“已被取代指令”表；新派工只引用它和原始来源。发现缺口先给现有入口与最小缺失契约，不用新模块清单代替判断。

### 根因 B：以组件复用代替完整用户行为复用

`src/workbench` 已重新挂回原 editor，但 host 换走原动作，形成“原按钮＋另一条未完成执行链”。视觉壳复用不能证明功能等价。

**优化：**原功能对照表必须包含入口、输入形状、真实 mutator、落盘和 runner；每项以现有能力为验收基准。×3、参考、关键帧、批量、Undo/重开不能因新路径不支持而从表中消失。

### 根因 C：共享代码不等于共享状态主人

两处调用同一个 `createCanvasLandingHost`，仍得到两份在途状态。卡片与编辑器共用控件，也未自动共享正确的写入权限。

**优化：**door-map 要数实例／写入口及真实持久化副作用，不只数同名函数。付款草稿、作者内容、画布、已批准合同分别明确谁能写；用同一请求换报价和跨项目 await 的反例验证。

### 根因 D：测试跟随当前实现缩小了目标

`tests/ux/original-storyboard-run.test.mjs` 检查 title／加镜／冲突，最终所有调用仍是 `save_storyboard`，未触发原生成动作。`core-a-creation-runs.e2e.mjs` 使用预置 Run 与 prompt/placement 断言，尚不能证明真实页面新建和完整 W08。creation-columns 基线主要证明外壳布局。

**优化：**先写旧能力保全的失败场景，再接线；至少包括两文稿四方案、完整字段往返、Agent 等待切目标、已提交继续编辑、原四类生成动作及关闭零媒体提交。预置仓库／注入收据只能作为夹具，不能叫真实用户入口通过。

### 根因 E：用历史绿灯叠加成当前完成结论

工作树持续变化，合同路径和类型已经失效，但旧记录仍写通过。审查者只看最后 dirty diff 也会漏掉 16 个已提交增量。

**优化：**验证记录绑定 base/head/dirty manifest 和平台；功能依赖变化后使相关结论失效。收货检查完整分支＋未跟踪文件、实际失败输出和原任务映射，不以累计测试数字代替最终树证据。

没有发现普遍抬高 gate 预算的证据；部分门禁调整是来源迁移或合法 schema 更新。问题主要是检查覆盖窄于实际行为及未按当前树重新收口，不能无依据指控所有门禁被刻意放宽。

## 8. 后续实施的最小顺序（本报告不执行）

1. 固定新方案及上述六项澄清，令旧扩范围指令失效，补逐 delta 的最后处置；不整树回滚。
2. 证明唯一方案对象、完整字段往返和内容冲突边界；同时保留正确任务身份与付款安全修复。
3. 给原动作层接入真实目标与绑定，证明单镜／×3／首帧／批量仍走原链；随后撤重复执行增量和重复 landing 实例，不保留并行 fallback。
4. 修付款草稿、正式参考接线、损坏存储分类等共享边界缺口，完成完整 T7 两个宿主的实际操作验证。
5. 当前交付树通过相关门禁、真实任务、独立评审和候选包要求后，再按既有分支／PR 纪律交付。Windows 和任何缺证据的平台继续标未验证。

这次需要的是按真实入口收敛实现与验收，不是再出一份更大的架构任务书。

## 重新执行后的结构复核：门禁与真实 owner（2026-09-20）

本节记录重新实施时的源码结构复核，前文发现和失败仍保留。其后部分真实 Electron 已通过，当前运行及交付状态见文末；候选包仍未验收。

- **electron/shared、electron/productionRun、src/workbench**：作者正文统一在 generationPlan.editorial；原保存 repository 在同步提交段验证内容 CAS；candidate/contracts/jobs 保留既有执行事实。原 editor/rowActions/runner 继续执行单镜、变体、首帧和批量。共享 storyboard 纯函数只是从 renderer 路径搬到 electron/shared，旧路径仅 re-export。新的异步 assertCurrent 贯通原动作→确认→grant→提交，阻止审批等待时换目标或改内容。
- **src/desktop、src/i18n、src/ui**：bridge 只传 exact target/content token；界面身份来源仍是已捕获请求。未添加第二页面、保存服务或付款框架。参数条保留原组件和局部加载恢复；两个宿主通过 NodeWriteAccess 隔离写入。关闭卡不删除节点也不提前写正式方案；现有草稿存储在报价变更后仅恢复同内容与同范围的未批准输入。
- **scripts**：本轮相关聚类暴露的是“声明、投影、测试 mutation、机器门表随 owner 变化漂移”的共同风险。已核 check-model-face-frozen 的 mutation 必须实际命中现有 schema；check-verb-host-conformance 只登记实际由 transport 消费的 domain 字段，不扩充任意豁免；模型面需要完整原作者字段时，必须检验 payload/schema/provenance，不能靠基线加预算放行。root-cause door-map 重新机器生成，历史共享纯函数移动记入 boundary-owners-ledger 的真实新锚，未退役仍需成立的不变量。
- **结构选择**：继续利用原 verbs/schema registry、原持久化 owner 和现有静态检查，不新增一套 schema 校验器或自动写绿的脚本。prior-art 文档补充实际源码依据，不虚称外部检索已发生；walkthrough 的“不存在”必须先证明探针可见或真实请求记录器可测。

验收裁决：静态门绿只证明这些结构约束可检查；不得代替四份方案保存、原生成动作、关闭卡重开、SDK 压缩/Stop、旧项目和实际 Electron 证据。任何新失败按最早共享 owner 修复，不能提高预算、跳过真实路径或用替身结果代替供应商/安装包结果。

### electron/assets：引用身份继续由项目素材索引负责

当前实际核对 projectAssetStore.ts 的差异：assetIdentityOf 从原 owner 提取到 assetReferenceIdentity.ts，仍对真实落盘文件计算 SHA-256、版本 1；resolveProjectAssetReferenceIdentity 原先只查 500 条，现在调用同一分页遍历，循环 cursor 显式报错。没有第二资产库、持久化 URL 映射或另起上传服务。pendingSpendReferences.ts 的卡片编辑引用仍通过原 importRemoteAsset 捕获 ProjectBinding，导入后再次 assertCurrent；已有 identity 引用不接受任意 hash/version 替换。正式执行和编辑器读取复用索引，read-only preview 不写 Run。结构风险在于读取投影误当权威身份，因此执行 snapshot 必须重新校验 pinned identity；对应 assetReferenceIdentity / pendingSpendReferences / productionReferenceUrls 回归覆盖分页、版本变化、错项目与异步切项目。所有这些受控证据仍不能代替真实供应商上传验收。


## 最新复核状态（2026-09-20，尚未交付）

本节更新当前状态，不重写初审发现。完整逐项清单及边界见 [最新验收状态](2026-09-20-core-a-remaining-acceptance.md#最新验收状态2026-09-20交付前中间快照) 与 [T7 最新证据](2026-09-20-core-a-t7-acceptance.md#latest-evidence-reconciliation-2026-09-20-intermediate)。

- **已通过的新增真实应用证据**：Stop＋完整技能/实际文件排队取消恢复、重发保新草稿（`.tmp/pi-lane-stop-resume-development-1789864027903/report.json`）；付款精确 3/33、两层草稿、两笔 pending 顺序及关闭恢复（`.tmp/pi-spend-card-development-1789864256177/report.json`）；原 smoke 17 assertions（`/private/tmp/nomi-core-a-smoke-visible-editor.log`）。这些是开发构建＋loopback，不能替代付费、包或全部 T7。
- **全量仍阻断**：`/private/tmp/nomi-core-a-unit-v5.log` 的 S06 超时未关闭；CPU profile `/private/tmp/nomi-s06-cpu-profile.log`、`nomi-s06-timed-{952,960,968}.cpuprofile` 确认旧 Run 全日志反复解析热点，共享 repository 修复进行中。旧 socket 诊断/修复及定点通过继续保留，不能代替本次性能修复后的全量结果，不提高超时掩盖。
- **T7 与付费进行中**：原 composer 旅程扩展场景尚待 root 实跑；真实付费 v7 当前两张图和首帧图成功、video running（`/private/tmp/nomi-core-a-paid-resumed-v7.log` 与同隔离项目磁盘事实）。v5 已有两图实付收据，v7 尚无最终 report，不能声明完整首帧视频、重开或付费全程通过。
- **最终收货尚未完成**：`/private/tmp/nomi-core-a-final-delta-review.md` 按 hash 复核 v5 差异；后续修补仍须冻结复审。中等模型／跨模型尝试 unsupported/404，实际未运行，不冒称跨池独立审查。当前分支 17 behind / 18 ahead，上游重叠在 `/private/tmp/nomi-upstream-overlap.json`，集成及相关复验待主代理处理。候选包旧项目/导出、Windows 未验证；最终交付走任务分支 PR，并交用户指定的独立 AI 审查，不自动合并。

原未归因删除、历史失败与 feel findings 均保留；没有新复现与完整调用链证据，不因验收脚本误判去修改正确产品逻辑。


## 历史记录与现行状态

以上为各次审查和验收的历史快照，保留当时的源码身份、失败、判断及未验证项，不作为当前进度。唯一现行结果见[统一验收表](2026-09-20-core-a-current-acceptance.md)；后续修复、最终构建、真实测试与仍未验证范围均以该表及其证据为准。
