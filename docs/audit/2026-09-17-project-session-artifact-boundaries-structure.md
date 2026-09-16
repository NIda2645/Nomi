# PR 802 结构评审：项目会话、产物发布与页面投影

状态：✅ 结构评审已交付；实现的跨平台与最终合入验收由主任务继续执行。

日期：2026-09-17。本文为一个评审者基于代码、反例测试与主任务实机记录的结构复核，不冒充多位独立审批。
触发：本轮 `gates:contracts` 的 `check:symptom-cluster` 报出 8 个高频模块；原始日志为主任务的
`/tmp/nomi-pr802-contracts.log`，其中的全部模块和计数已转录在下表，结论不依赖该临时文件长期存在。
审查对象是 PR 802 集成的 A（存储、错误协议、框架投影）与 B（窗口及项目会话），不是整仓健康证明。

## 1. 原始故障的因果链与被推翻的解释

真实 Electron 43.4.1 中，创作文稿写入成功，切到生成页创建文本产物失败。名称为
`surface_port_unavailable` 的错误最初让人怀疑页面切换后端口陈旧。但主进程接收回包前的 binding 校验已通过；
受控实验发现第一处失败是媒体库准入拒绝文本。该业务异常随后被转成回执不确定错误，跨 contextBridge 又丢失自定义字段，
preload 的 `instanceof` 判断失败，最后才变成“端口不可用”。因此不能用最终错误名称证明页面生命周期是该次失败的起因。

只在隔离实验中放行文本后，文件和节点写入成功，节点仍不可见：DOM 有 360×260 尺寸，框架 `measured` 为空；
调用框架重测立即恢复。对安装版本的 `adoptUserNodes` 做独立对照，确认受控节点重投影会丢掉测量状态。
应用只传 CSS 尺寸，没有向框架提供领域尺寸。这是第二个独立缺口，不是存储失败的后续假象。

同时，B 的反例证明长期工厂持有动作端口、重新捕获全局当前项目会混淆“会话身份”和“传输版本”。
这支持“一窗口一项目会话、每动作一份通道”的结构调整，但不把它倒写成已经被实验推翻的原始失败解释。
存储去重等待期间替换 manifest/root 的反例还证明：最终节点提交守卫不能保护更早发生的文件发布。

证据入口：[总方案](../plan/2026-09-17-pr802-root-causes.md)、
[会话方案](../plan/2026-09-17-project-surface-session.md)、
[存储发布方案](../plan/2026-09-17-asset-publication-identity.md)。

## 2. 全部聚簇的判断：共同不变量与目录共处必须分开

日志窗口为 2026-09-11～09-17，assets 从 09-13 起；计数是合同数，不是同一缺陷复发次数。

| 模块 | 合同数 | 结构结论与本轮处理 |
|---|---:|---|
| `electron` | 14 | main/preload 是多条能力的装配与桥接交点。审批、目录重播、认证、定价不是一个根因；本轮有关部分是可信 session 注入 assets IPC、桥前编码错误。装配不另造项目身份或错误分类。 |
| `electron/agentLane` | 9 | live skills、旧迁移与工具装配各有 owner；与本轮直接同族的是 09-15 live-port 和 09-17 session/error 合同。长期 lane 保存短期 capture 是寿命错配；改为 session 并集中绑定 close/abort，删除 lastEvent/currentEvent 与 liveShared/withLive。 |
| `electron/assets` | 5 | 预览释放、媒体 kind 判定不能由本轮概括；导入单一 owner、项目产物准入与 publication identity 共享“落盘归谁”的主干。本轮继续复用现有存储，在所有异步 byte/native 存储入口固定身份，并在发布及元数据更新前复核。 |
| `electron/capabilityCore` | 17 | 审批、花钱、可用模型、装配相位并非同一问题；会话/端口/审批证据确有共同 authority 边界。registry 持有 session，invocation 持有该 session 的证据，executor 才抓动作通道。不能用放松 sameEvidence 来补生命周期。 |
| `electron/shared` | 16 | 音频槽、定价、配对等仅是目录共处。本轮相关的契约有三条：完整 ProjectBinding、存储与展示准入、普通数据错误协议。共享层定义可验证事实，不读取“当前页面”替调用方作决定。 |
| `src/desktop` | 4 | ComfyUI/配对与此故障不共因；媒体导入和产物导入共享桥接返回契约。bridge 保留结构化结果和发起项目，不靠 Error 原型或 message 猜类型。 |
| `src/ui` | 6 | 引用槽、认证、模型可用性并非本轮根因。浏览器导入是同一资产结果协议的另一个消费者，需接统一 unwrap；不借产物存储修复扩大素材库展示规则。 |
| `src/workbench` | 24 | 宽目录同时容纳滚动、布局、秒数、审批与技能，不能声称一把 session 钥匙消除全部合同。直接同族有异步产物交付、capability handler、受控画布投影：分别归发起 binding、错误 DTO、领域尺寸适配；三个 owner 不相互代替。 |

派工范围另提到 `electron/services`，但当前仓库没有这个目录，日志也没有该模块聚簇。
“项目身份服务”实际位于 `electron/workspace/workspaceProjectIdentity.ts`、`electron/shared/projectBinding.ts` 和
`electron/assets/assetWriteContext.ts`；下文按这些真实位置审查，不新增不存在的服务层或虚构门岗覆盖。

## 3. owner 与寿命的最终分工

| 状态/不变量 | 唯一 owner 与消费者边界 | 明确终点 |
|---|---|---|
| 磁盘项目身份 | workspace identity 的 immutableProjectUuid/projectGeneration 与完整 ProjectBinding；session 和存储复用，不复制身份格式 | manifest generation、根目录/实际 inode 被替换后旧动作失效 |
| 交互会话权限 | `canvasReadSurfaceRegistry.ts` 的私有 WeakMap；可信 IPC 根据 WebContents/frame 签发 opaque ProjectSurfaceSession | close、换项目、reload、crash、destroy 永久撤销；A→B→A 不复活 |
| 单次 renderer 通道 | `captureProjectSessionPort` 在原 session 内解析当前 transport；surface port 检查 epoch、binding、回包和取消 | 请求完成/取消；同项目 transport 更新不改变 session |
| lane 生命周期 | `laneProjectSession.ts` 将 workspace close 与 session abort 幂等绑定；先同步 revoke 再 await close | 待审批/进行中交互随会话终止 |
| 异步文件发布 | `assetWriteContext.ts` 在 await 前固定 root/identity；`projectAssetStore.ts` 在发布、复用结果和元数据更新前同步 assert | 原身份或交互 session 不再有效即拒绝；不重读 activeProjectId 重定向 |
| 后台生成 | 已提交 ProductionRun 的项目、持久化状态和 scheduler | 按 Run 自身状态完成或失败，不继承交互 lane 的取消信号 |
| renderer 错误语义 | `electron/shared/surfacePortBinding.ts` 的白名单普通 DTO，在跨桥前编码 | 业务拒绝、目标陈旧、取消、回执不确定与真正失联保持可区分 |
| 框架节点尺寸 | `resolveNodeVisualSize` 为尺寸真源；`toGenerationFlowNode` 同时派生框架 width/height 和 CSS | 普通与复制拖拽投影、选中/高亮重投影均遵循同一契约 |

“一把钥匙”的准确边界是可信窗口内当前项目的交互 session，而非永不过期的 projectId 字符串。
页面切换不换钥匙；真实 reload 即使 URL 相同也撤销，恢复历史后重新签发；换项目同时撤销旧审批和已派发请求。
显式 snapshot 保持一次性固定快照语义，MCP 的 live-or-disk 读取保留独立 authority；二者不改成 renderer 全局当前会话。
产品仍只有一个活动窗口 owner，跨窗口同项目替换也不得复用旧 session。

## 4. A 与 B 的交接处有没有第二扇门

最关键的交接是 `assetsIpc.ts`：带完整 binding 的 Agent 产物先从可信 event 取得 session，
并在任何动态 import/异步字节准备之前捕获校验闭包。闭包传入既有 importer/storage，复用 session 而不拥有它的释放权。
asset import 完成不能 revoke 共享 session，否则一次存储会意外关闭 lane。

`AssetWriteContext` 的磁盘身份校验对每个异步存储入口都是必需的；可选的 main-only `assertInteraction`
是交互撤销的额外约束，不是存储身份检查的可选开关。直接/background 项目 IO 可以没有 UI session，但仍必须绑定实际磁盘身份。
去重只复用文件结果，不复用发起者权限；两个相同字节调用必须各自检查上下文，取消其中一个不替另一个授权。
最终同步 assert 与同步发布/元数据 rename 之间没有应用事件循环 await，不能把异步检查搬到更早调用者后就认为安全。

B 删除了旧全局 recapture 和 renderer evidence 放宽特例，十个 invocation factory 的长期输入只接受 session。
派发 capture 带 sessionSignal，与请求自己的信号合并；撤销会立即发送既有 cancellation IPC，而非等超时/回包才拒绝。
可信导航判断采用 Electron `isSameDocument`，删除“相同 pathname 就当切页”的例外。
生命周期监听器移除使用与注册相同的函数，避免已撤销 owner 的监听器残留。

这些是结构变化而非重试补丁：业务错误不再伪装成通道故障；存储不再受媒体库 UI 的类型集合支配；
长期权威不再由临时端口身份代表；框架投影不靠轮询重测补齐尺寸。审批 actionHash、revision 与 owner 校验没有降级。

## 5. 实证强度与仍须完成的验收

- session API 最小四例、派发后 revoke 取消、reload/crash/destroy 监听器清理均有先红后绿记录。21 个相关套件 189 通过，1 项既有 C9 跳过；后续定向 52 项通过。
- `projectSurfaceSession.test.ts` 覆盖十个 factory 的 prepare 后同项目 transport 替换、换项目再回来、跨窗与审批 hash；生产 executor 到 surface IPC 请求/回包运行，仅替换 Electron 总线。它不替代真实 Electron contextBridge。
- 真实 lane 待审批终止后没有写入；真实 ProductionRun repository 与 multi-shot submit/scheduler 交接证明已提交任务留原项目运行。该证据只到提交与调度，不谎称供应商已生成最终媒体。
- A 的真实 IO 反例在去重/原生复制等待时替换 root、generation 或取消，验证 byte/native/direct/复用结果的发布边界；五种产物格式与未知格式/磁盘拒绝另有测试。见 `projectArtifactImport.test.ts`、`projectAssetStore.test.ts` 与 `assetsIpcSession.test.ts`。
- 主任务报告 A+B 的 macOS 实际 resident-composer 旅程已通过：文稿、文本产物、拒绝删除、MCP、冷启动，以及 pending approval A→B→A 的 B 项目零副作用、同 URL reload 恢复历史并重新写入。可复跑入口为 `tests/ux/resident-composer-receipt-fix.e2e.mjs`。
- 本审计落盘时，Linux 原始 CI 边界、风险选择的完整门禁与真实 merge SHA 收据仍由主任务验收；不以本地 mock 通过或这篇审计替代。跨池 B 只读报告已输出，但尚未实跑：它指出“写入后撤销被报成取消”和“主进程主动撤销后面板关闭通知”的候选缺口，并要求加强真实路径、lane 自动关闭、运行时装配与后台提交中途撤销覆盖。主任务必须逐条证实或反驳，不能写“独立评审无发现”。

## 6. 剩余风险、下次复发的定位判据

1. 文件系统防线保证 Electron 事件循环内的发布一致性，不声称持有跨进程 OS 全局锁。外部进程在同步检查后替换目录的攻击面不是本次测试已经关闭的范围。
2. session 错误中的 stale/cancel 是合法拒绝状态。若 UI 又显示笼统 unavailable，应先检查错误 DTO 的编码/解析端，不能先增加重试或重新授权。
3. 若同项目切页再次失败，先区分 session 是否仍有效、动作 binding 是否更新、业务执行是否拒绝三条证据；不要从页签或最终文案推断因果。若 A→B→A 旧动作成功，则是 authority owner 回归，必须修 registry，不能在单个按钮拦截。
4. 若发现文件落错项目，先查存储入口是否创建 AssetWriteContext、是否在发布前 assert；最终节点提交测试通过不构成豁免。新的异步写入入口也必须进入相同边界。
5. Electron/React Flow 保留当前版本；升级须重跑跨桥错误、同 URL reload 与受控尺寸/handle 几何测试。应用契约已修正，不用“升级可能改善”替代验证。
6. 目录聚簇不代表整层缺陷已清零。与本轮无共同不变量的审批、定价、供应商认证、滚动和布局合同仍由其原 owner 负责；本轮没有以一篇概括审计把它们宣布解决。

结论：本轮可以继续完善和集成，因为修复已落在独立且可验证的共享 owner 上，并删除了对应旧路径；
跨池发现尚需逐条核实，本文不构成直接合入许可。最终“已解决”仍须以发现闭环、原平台旅程和合入验证为准。下一份同族合同应先定位上表哪条不变量失守，再决定修 owner 实现还是补新增边界，不能重新发明页面级钥匙。

## 复核材料

- [原常驻面结构评审](2026-09-14-resident-surface-lifecycle-structure.md)：解释装配相位与错误表象，不能替代本次磁盘/session/transport 寿命审计。
- [原媒体落盘结构评审](2026-09-15-media-landing-boundary-structure-review.md)：继续采用既有共享入口，本次将存储准入与页面展示职责分开。
- [session 根因合同](../fixes/2026-09-17-project-surface-session.root-cause.json)、[错误协议合同](../fixes/2026-09-17-surface-handler-error-protocol.root-cause.json)。
- [产物与投影合同](../fixes/2026-09-17-project-artifact-storage-and-projection.root-cause.json)、[资产发布身份合同](../fixes/2026-09-17-asset-publication-identity.root-cause.json)。
