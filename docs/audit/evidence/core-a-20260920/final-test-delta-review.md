# Core A 最终测试差异只读审查

审查范围：上述任务指定 7 文件，`git diff HEAD`（并阅读相关生产 owner、React Flow 投影与原编辑器）。初审为只读；随后主代理明确授权仅补齐发现1的测试断言。已编辑该测试并通过 node --check；未启动 GUI、测试服务器或实际测试（性能独占期间），新增断言尚未执行。下面是静态语义裁决，不能当新一次测试执行收据。

## 发现与证据边界

1. **已补齐测试承诺，新增断言未运行**：初审时`composerLifecycle.test.mjs` 的 `keeps original node keyboard movement from disabling subsequent projection updates` 只断言节点移动和 `ownsNodes === true`，没有在移动后实际触发并检查后续投影。它确实防止 helper 偷改 ownership，但标题比实际覆盖更强。最小补齐是同一测试在节点 ArrowRight 后对 named Slider 再 ArrowRight，断言 duration output 和 aria-valuenow 都为 6；不需要改生产行为或复制投影算法。现已按主代理授权加入此后续真实键盘动作和两项轮询断言，未修改 fixture 或生产代码；node --check 通过。实际测试留待主代理性能测试结束后运行。
2. **fixture 与真实宿主必须分层报告**：ProjectionKeyboardHarness 直接挂 Slider、自己提供 `.nokey`，onNodesChange 直接调用原 applyCanvasDragKernelPositionChanges。它不经过生产 GenerationCanvasReactFlow 的 eventPhase/readOnly/dragging 分流与 business writeback，也不经过 NodeGenerationComposer 的真实 `.nokey`。所以该 fixture 不能单独证明生产键盘权限、取消晚事件、持久化。完整 Electron 脚本才覆盖后面这些。
3. **有意控制的证据不得升级**：真实 JPG 历史是 setup 注入；最后一版清空走 updateNode；window blur 是 dispatchEvent。脚本已明确标注，不是供应商生成、最后版本 UI 删除或原生 OS 失焦证据。本轮扩展未掩盖此界限。
4. **平台边界**：Composer 脚本继续使用 Meta+A/Meta+Z，本次是 macOS 路径；没有新增 Windows 通过证据。不能因 process.platform 字段打印了平台就说跨平台验收完成。

没有发现这 7 文件通过吞异常、跳过失败场景、扩大 timeout、修改截图基线来取绿；下面列明每块保留理由及局限。

## 逐文件逐 hunk

### tests/ux/core-a-composer.e2e.mjs（9 hunks）

| 新侧 hunk | 事实判断 |
|---|---|
| +1 | 引入既有 waitForVisualQuiescence；只支持随后实际命中点采样，无新增等待常量。 |
| +79 | Shift 先按下，等既有视觉稳定后重新找真实 node hit point，再点一次，finally 抬 Shift。防 fit/自动让位中的陈旧坐标，不是重试点击掩盖产品失败。仍强制有真实命中点。 |
| +114 | 参数编辑不再调用要求 contenteditable=true 的通用 checkEditor，因为合法锁定 prompt 本来只读；改为真实 composer/panel visible。增加 named Slider ArrowRight 和 radio checked 验证，保留 meta 改变、磁盘等于实际 meta。注意这里只断言 meta 整体改变，并未独立计算每个模型字段的预期值；Slider UI 与共享组件 fixture 对明确数值另有断言。 |
| +157 | 新建前 IDs 改读 canonical store，避免 React Flow 虚拟化导致 DOM 数量不能代表全部节点。仅只读观察。 |
| +165 | 要求 UI 动作恰好新增一个 canonical ID，再要求该精确 ID DOM 可见。保留“实际新建并可见”的目的，覆盖更准确；并未用 store 命令绕过 UI 新建。 |
| +192 | 原 WorkbenchShell:108 用 hidden={!active} 保持工作区挂载，因此 toBeHidden 替代 expectAbsent 是纠正错误生命周期预期。此前先 visible 保证探针不空，另验磁盘 prompt，再返回画布可输入；不是削弱真正的卸载契约。不能把此旅程写成卸载/重挂载。 |
| +221 | 原 NodeGenerationComposer editable={!node.locked && !readOnly}，参数控件仍可操作。新增 locked 后 contenteditable=false、文本保留，与原边界一致。原模型单首帧模式实际标签“图生视频”，改点 i2v，保留缺参考时生成 disabled/title 与编辑后仍 disabled；不伪造模型/参考元数据。 |
| +281 | 普通拖动在 controlled blur 后继续真实 mousemove/up，断言位置和 persistRevision 与开始前完全相同。Alt 拖动以已创建副本后的 positions/revision 为取消基准，保证不将晚坐标写给原节点或副本；随后真实一次 Undo 去副本。多选键盘用真实 node focus/ArrowRight，要求双方同 delta、单次 Undo 共同复原，再移动并逐节点验磁盘。保留原取消后 prompt 可写检查。Alt cancellation 不要求自动删除副本，这是与原“复制是已提交动作”一致的范围；未伪称取消复制。 |
| +381 | 新进程检查 persisted 和 hydrated positions，保留原 meta/prompt 恢复。最终日志修正 unmount/lock 旧措辞并继续标 partial CJ4。失败时 React fiber 私有字段仅只读诊断，不参与 pass oracle/生产行为，可能随 React 改版失效但不会制造通过。 |

补充：全量 Electron 的 Slider 编辑并未在该步骤直接比较节点位置前后；“Slider 自身不移动节点”的直接断言目前在有 `.nokey` 的有界 fixture。生产位置不误移应结合该步骤真实输入日志与源码，而不能把后面 keyboard originalPositions 样本当成前后对照，因为它取样更晚。

### tests/ux/composerLifecycle.test.mjs（4 hunks）

| 新侧 hunk | 事实判断 |
|---|---|
| +13 | 用 #unpublished-draft 精确定位，新增 Slider 会增加 input，原泛 input 不再唯一；保留焦点移转/blur断言。 |
| +47 | fill/read 改同一精确 ID，保留原失败 import 重试次数、reload=0、原 DOM identity 和草稿值判据。savedInput 仍用首个 input，但 harness 确认该草稿 input 始终最先挂载；现在正确，后续插入前置 input 会让它脆弱，可同步改精确 ID但非当前缺陷。 |
| +219 | A→B→A 草稿使用精确 input，原历史关闭和草稿内容都保留。 |
| +277 | 第一个新增测试：真实 Mantine 键盘把 React state 与 RF投影 Slider 都从5变6，并验证位置仍40,40及ownership=true。第二个新增测试初审只验移动与ownership；经授权现增加Slider实际ArrowRight后output/ARIA均6，补齐后续投影动作（新增部分未运行），见发现1。第三个用真实 RF延迟选区投影、原 useNodeResultHistory，验未选中开A、切B关A、A回开/关、不可用不能开、重新可用不会复活；未增加假计时延迟或手动 flush。 |

### tests/ux/fixtures/composer-lifecycle-harness.tsx（5 hunks）

| 新侧 hunk | 事实判断 |
|---|---|
| +1 | 引入真实 Mantine Slider、ReactFlowProvider/useReactFlow/useStoreApi，没有 mock替身。 |
| +14 | 复用原 syncCanvasNodeProjection / applyCanvasDragKernelPositionChanges，只新增测试类型导入。 |
| +128 | Projection harness 以真实 RF uncontrolled defaultNodes+原effect投影 owner表达 duration update，但 positions 在 fixture business投影固定40,40，故不可拿它证明键盘位置持久化。History harness 以真实RF selected props晚于 choose React state的路径重现 bug，原hook处理可用性/identity；trigger事件顺序与 NodeResultStack 先选中再 open 一致。不会另造计时模型。两个nodeTypes只用于测试。 |
| +195 | 草稿input增加ID，行为不变。 |
| +205 | 两个新 fixture 各自RFProvider隔离kernel，MantineProvider只包Slider；旧 Gesture/Placement/Escape harness 原顺序保留。 |

### tests/ux/fixtures/param-panel-numeric/main.tsx（2 hunks）

| 新侧 hunk | 事实判断 |
|---|---|
| +80 | ?single 只裁剪 renderedControls 到已有 duration declaration；默认三参数路径原样保留，未修改原元数据/解析回调。真实 InlineParameterBar/Mantine组件。 |
| +91 | duration output只读观测真实 onParameterControlChange 产物，不能主动制造写入。 |

### tests/ux/param-panel-numeric.e2e.mjs（1 hunk：+98）

增加通过实际 role=slider accessible name 选中thumb，focus/ArrowRight使meta与ARIA5→6，Home→1，End→10；新导航重置fixture再次验单参数模式。原小数中间态严格commit序列、0–1退化输入判断和pageErrors全保留。是真组件测试，不能代替桌面容器/付款卡写入隔离或真实供应商参数验收。Home只验业务output，End同时验ARIA，范围行为已有实际键盘执行。

### src/workbench/generationCanvas/components/canvasControlsStructure.test.ts（1 hunk：+58）

原整个 handleNodesChange 禁 moveNode 范围缩到 active drag分支，并额外要求 applyCanvasDragKernelPositionChanges 和禁止 commitPersistedChange。该测试名原本就是防高频拖动走business/store；现在键盘单次提交属于不同owner，不应拿热路径禁令封死所有分支。实际生产键盘写入委托既有writeback helper，drag仍不持久化。这是边界纠正而非删除性能不变量。字符串结构测试只防明显源码回归，不能证明helper深层永不持久化；真实手势/性能测试另证。

### src/workbench/generationCanvas/reactFlow/canvasDragDraft.test.ts（3 hunks：+71/+86/+101）

单case扩为ownership true/false双case；state按参数初始化；从强制写false改为ownership保持且任何setState都不得携带该字段。依据生产 ownership生命周期：GenerationCanvasReactFlow dragStart明确设false，stop/cancel恢复；geometry helper没有资格在普通position change夺走owner。原business nodes同引用、kernel位置和其他节点保留断言均未删。这不是为新实现镜像断言，锁定的是先前“键盘一次后后续投影静默失效”的共享权限不变量。模拟store不能代替真实RF故另配有界RF与Electron。

## 结论

生产行为契约纠正有源码依据；未见需要回滚的测试更改。发现1的后续投影动作已补齐，但新增断言未跑；提交前须由主代理定点运行。最终验收报告保持 fixture / controlled blur /真实Electron /真实付费 /Windows未验证的边界。此结论只针对7个文件的当前 HEAD差异，不替代整任务审计或其他生产diff裁决。

## 审查快照

- HEAD: 15195e2f9e516adfca52f9021f2b170a716d9e3c
- `tests/ux/core-a-composer.e2e.mjs` current SHA256 `4b93509280874f6a7c9dc291033e2015c02d62f44eeebc75a0139854a956d3da`; patch SHA256 `7de0c9097fc2487648709b8db059bc1d6f98696c0d514c7aec13428616b5f137`
- `tests/ux/composerLifecycle.test.mjs` current SHA256 `190637dd1875a56c3272d8a133975c30aef0450840a42255d263dddbc3c2a961`; patch SHA256 `296648846416df27007a0c784ae4de4dc1b872565ad25325e3dba08cc4defffe`
- `tests/ux/fixtures/composer-lifecycle-harness.tsx` current SHA256 `052111c7a1a9ec5778c79daad4fb811e0338918554427e922439b78c02f37beb`; patch SHA256 `a6353200d1e29ca74f2e522c10d2cba968bb3e7ddbe7f7eb6490fa845373db3d`
- `tests/ux/fixtures/param-panel-numeric/main.tsx` current SHA256 `bdd9e04c01b2aa4efdd4ba1d007690cca8c4d9e5cf03fb786563416fd9f3f749`; patch SHA256 `ef202fd5af370a50581d9d15b7de04a82f379a6de7e76f0cf929d51fb650de46`
- `tests/ux/param-panel-numeric.e2e.mjs` current SHA256 `eb028827311a52d7e08992a5537b5af597696da62807ed7de9a68a2e4dda6b59`; patch SHA256 `0c9b7ff6c25bd41eaf3412f37fef76a488a64a6a4264468da8254fb0ac4bc528`
- `src/workbench/generationCanvas/components/canvasControlsStructure.test.ts` current SHA256 `6b6691476f84d6a7b26a542975755226461503c545c14e3a2751889d0e6c49fe`; patch SHA256 `27be1ed1b3be3abbd1b489d61e53f22dd32703db99e806f5671d05f6dc22055c`
- `src/workbench/generationCanvas/reactFlow/canvasDragDraft.test.ts` current SHA256 `ffedc1a78a2d77c934d31fc7293ac8907aeb9010db36c9f94f482e7711eedc02`; patch SHA256 `10cc5270af375b25de400c54ca92201d848451642698663bc55ea9f0f524e0c3`

主代理收货后另补一个真实宿主断言：core-a-composer 的 duration ArrowRight 前后比较完整节点 id/position 列表，证明参数输入不会移动画布；仅只读采样，无生产变化。待 v13 实际复验，不能套用以上旧 hash 作为新增断言已测的证明。
