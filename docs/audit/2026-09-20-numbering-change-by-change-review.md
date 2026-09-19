# Nomi 编号写入 / 恢复 / headless 独立审计

审计基线：`23348b6e10dc12c237855eae911d84cbaa5fa614`，被审 HEAD：`86d1ea2e3ba62e2d0a77dd2801b2abcfbb96192c`。已核对 merge-base 等于基线。工作区：`/Users/aoqimin/Desktop/Nomi-shot-numbering-20260920`。按 code-review 与 root-cause-remediation 技能执行。最初只读审查，随后 parent 明确授权修复确认的 replay 兼容回归。本报告不审本人实施的 Escape 改动，也不覆盖其他 agent 的 UI/Agent compact 展示审计。

## 结论及可复现问题

### P1：旧事件批次恢复被中间态修复改号——已修复，未提交

被审 HEAD 的 `canvasEventReducer.applyCanvasEvent` 在 node.added、node.updated、snapshot.restored 每条事件之后立即 backfill。旧版 updateNodes 会把一次原子变更记录成多条 updated；初始 `[a:1,b:2]`，批次 `[b→1,a→2]` 的最终合法结果是 `[2,1]`。新 reducer 先把临时 `[1,1]` 修回 `[1,2]`，再把 `[2,2]` 修成 `[2,3]`。这会改变历史项目镜头身份，并影响上一镜选择。不是测试形状问题：真实 store.applyEventTail 与真实 undo journal redo 均复现。

另一个同类入口：旧日志先 added 缺编号 A，再 added 已存编号 1 的 B；逐条修复抢先让 A 占 1，迫使 B 改成 2，违背保留已有有效号的迁移约定。

红测：新增 `events/shotNumberingLegacyReplay.test.ts`，5 条中 4 条失败。证据 `/tmp/nomi-numbering-legacy-red.log`。

修复：`replayCanvasEvents(events, initial)` 统一拥有整段重放后的 backfill。单事件 reducer 只应用原事件；store.applyEventTail 与 undoJournal.replayTo 都改用这个统一边界，删除原有分散循环。新旧事件使用同一路径，无 legacy 分支或备用算法。当前新写入继续发原子 snapshot 后态。原子更新不会依赖事件重放来修正 live 状态。

验证覆盖当前 live 更新与新事件、旧事件、真实恢复尾巴、同一尾巴重复应用、undo/redo barrier、缺编号 added 与最终非法状态修复。5 条现均绿；加上现有相关测试共 12 文件 / 141 条全绿，日志 `/tmp/nomi-numbering-targeted-green.log`。

### P2：重复节点 ID 输入会令本次新增去重修复每次改号——已修复，未提交

`electron/shared/canvas/shotNumbering.ts:42` 的 assigned Map 以 node.id 为键。输入两个不同数组项 `{id:'same',kind:'video',shotIndex:1}`，第一项被认定保留 1，第二项分配 2；映射阶段同 id 却全部取 2。再次恢复全部变成 3，永不幂等。renderer/headless normalizer 未拒绝重复 node id；restoreGraph 只排除与既有状态重复的 id，不排除 incoming 内互相重复。

必须区分责任：不去重节点 ID、旧 backfill 的 Map id 都是旧代码，不能把整个重复 ID 问题归给本次。本次新增「重复号必须修复」使原本稳定但损坏的 `[1,1]` 变成每次恢复都漂移，这是新回归。最小修法是按数组项索引分配编号；不在本轮擅自决定图节点去重/边归属规则。编号幂等不代表重复 ID 图语义就合法。

探针 `shotNumberingAuditProbe.test.ts` 第一条已红，输出 `/tmp/nomi-numbering-probes-red.log`。随后 parent 授权最小修复：assigned 改为按数组索引分配，保留所有 id 和节点项，不做图身份去重。探针已绿，正式回归迁入 model/shotNumbering.test.ts，覆盖同一个对象重复入数组、不同对象同 id、首个有效号保留及重复修复不漂移。临时探针文件已删除。

### P3：达到最大安全镜号会连纯文本复制也阻断——已修复，未提交

`assignClonedShotIndexes:66` 在检查 incoming 是否有 owner 前立即调用 nextShotIndex。现有 owner 使用 MAX_SAFE_INTEGER 时，复制 text 或 referenceSheet 也抛 RangeError，虽然无需任何新镜号。旧 paste 也提前算 next，但旧 next 不抛，所以这是新增安全校验引出的边界回归。现实触发概率极低，但可由导入数据直接到达，无需实际创建数万亿节点。

探针第二条已红，同上日志。建议仅遇到第一个 eligible incoming owner 才求 next；真正号空间用尽仍拒绝新增 owner，不能产生不安全整数。已按该建议修复：只在首个 owner 处惰性求 next。正式回归已迁入 model/shotNumbering.test.ts，并增加 MAX-1 时单个分配成功、两个 owner 的 clone/backfill 整批失败且输入不变。

## 每个 production diff hunk 的旧行为、意图与结论

| 文件 / hunk | 旧行为与为什么改 | 新行为是否正确 / 误改检查 |
|---|---|---|
| shared/canvas/shotNumbering.ts 类型和 owner predicate | renderer 与 headless 各维护 kind/category/meta 规则 | 搬到共享纯域，kind 集合、默认 shots、排除 referenceSheet/storyboardKeyframe 保持，避免两份分叉；是合并 owner，不是第二套算法。 |
| isValidShotIndex / nextShotIndex | 任意正 number 可参与 max，Infinity/分数可继续扩散 | 正安全整数是存储编号合理约束；保持 max+1 与删最大号后可复用，不按位置重排。穷尽显式拒绝合理，纯非 owner 复制误伤见 P3。 |
| backfillShotIndexes | 只补 typeof 非 number 的缺号；重复、0、Infinity 原样保留；非 owner 上陈旧号保留 | 新契约保留数组中第一个合法唯一 owner，其他按 y/x/id 从 owner 最大号续编，删除非 owner raw 号。唯一 id 下幂等且不改有效身份；重复 id 漂移已按 P2 修复。旧帧 raw 号删除由 first_frame 关系读取替代，是批准语义，不是丢掉用户镜头。 |
| assignClonedShotIndexes | paste 自己续号，template 原号直拷，非 owner 可携带旧号 | clipboard/template 共用新 owner 分配，剥离每个 clone 的旧号。template 再插两次得不同号；帧从新边关系读新视频号。P3 边界遗漏已修复并验证。 |
| resolveShotIdentities | 读取端直接拿各节点 raw shotIndex，无法知道同镜角色 | eligible owner 合法号 + first_frame 指向 video 才派生；仅显式 storyboardKeyframe 被视作帧，普通 image 引用视频仍独立。0/多目标不猜，返回 owner ids。仅派生不写入。重复 id 本来就是图歧义，未在此扩大修复。 |
| changesShotIdentity | mutation 无区分镜头身份与普通运行时更新 | shotIndex/kind/category/两个 meta 身份标记变化触发整批归一；prompt/title/runtime 不触发，减少无关 snapshot；显式 undefined key 也触发。 |
| renderer/model/shotNumbering.ts 全文件替换 | renderer 本地定义三个编号算法 | 薄 reexport，已有 import 继续有效；旧算法删除，无并行实现。原 max+1/稳定编号设计保持，冲突修复为明确扩展。 |
| capabilityCore/nodeKindDomain.ts 删除 kind 集合、两函数改 reexport | headless 镜像 renderer owner/next | 保持既有资格规则，统一数值合法性和安全边界；默认尺寸/位置/分类不改。 |
| capabilityCore/canvasGraph.ts import + shotIndex 类型 + normalizeSnapshot 返回 nodes | readDoc 只做形状检查，不修复头less读取到的冲突号 | 规范化入口修复后再 add factory，自增不会从冲突状态续写。增添类型没有运行时效果；raw node spread 保留未知嵌套字段。直接调用 addNodes 的 snapshot 仍受上游有效快照前置条件约束；cloneSnapshot 不是归一器，此点是旧设计。 |
| capabilityCore/shotOrder.ts 旧实现改 reexport | headless 独有 previousShotPromptFor | 旧模块路径不变，接统一实现；没有变更生成 API。 |
| shared/canvas/shotOrder.ts | 直接从 raw index 筛同 category 最大前驱，可能把参考卡/帧当独立上一镜 | 通过统一身份选择 owner 的前驱，帧以所属 video 镜号选前驱。仍允许中间号洞、跳过空 prompt、缺当前号返回 undefined。kind 成为必要类型输入，对真实节点合理。 |
| capabilityCore/core.ts 唯一参数增加 | previousShotPromptFor 无 edges，帧无法识别其镜号 | 传同 snapshot.edges，没有新增生成请求、费用或供应商分支；只补齐关系解释所需数据。 |
| canvasNodeActions.updateNode | 直接 Object.assign 后发 compact updated | 身份变更后 backfill 所有节点并记录完整后态，避免 undefined 被 JSON 丢掉与中间冲突。普通更新继续 compact。已有 history barrier 仍只由内容编辑等触发，纯 runtime shotIndex patch 无单独 barrier 是旧行为，不能误说本次删了撤销。 |
| canvasNodeActions.updateNodes | patches Map 后一次性应用，但逐条记录事件 | 先全部应用再 backfill 一次，身份变更发一份 snapshot；真实 exchange [2,1] 与 replay/undo/redo 等价。重复 updates 同 id 的最后一份覆盖 live patch 是旧行为，本次 snapshot 避免编号类记录不一致，但本轮不擅自扩成所有 patch 合并设计。 |
| reassignNodeCategory predicate | 只传 kind/category，丢失 reference/frame 标记 | 传 existing + 新 category，保留元数据资格，排除项进入 shots 不领号；旧操作顺序/位置不改。 |
| copyNodeToCategory predicate | 同样丢失 meta，参考卡跨分类副本误占号 | 传 source + 新 category，仍是副本新 id；普通 owner 按 max+1，标记节点无 raw index。 |
| instantiateWorkflowTemplateSnapshot | 按模板原 shotIndex 拷贝插入 | 插入前对副本集中分配；旧模板定义不变，同模板可重复插入不重号；返回/事件仍用实例化后的节点。 |
| canvasGraphActions.restoreGraph | 仅排除既有 id，直接恢复 old shotIndex | 把现存节点放前，修复 arriving 冲突，slice 只追加入站项，存量有效 owner 优先。existing 已合法是 store 不变量，若绕过 store 造坏状态可能丢弃既有部分的修复，这并非正常入口；重复 incoming id 见 P2。 |
| canvasSnapshotNormalizer | renderer 形状规范化后返回 nodes | 在同一恢复边界补编号，保留 position/meta/runs 等已规范化数据；不改旧 scene3d 迁移和 edge endpoint 检查。会清除帧/参考 raw 号是新关系设计的必要迁移。 |
| generationCanvasStore.paste | 内联 max+1，仅 owner 重编号，帧残留号保留 | 复用 assignCloned，配对结构仍由 clipboard clone 拷边；ordinary image 引用关系不自动改成 frame；P3 已修复，见上。 |
| generationCanvasStore.applyEventTail | 被审 HEAD 新增 tail 最后 backfill，但单条 reducer 已提前修复 | 最后修复自身不足以纠正已发生漂移。审计修复改用统一 replayCanvasEvents(events, initial)，不再另有循环/另有 backfill。 |
| canvasEventReducer import/added/updated/snapshot | 基线是忠实应用事件；被审 HEAD 为每条事件加 backfill | 被审 HEAD 意图防止恢复非法号，但破坏旧批次原子含义。现修复恢复基线单事件行为，整段完成再统一 repair；不更改 null 删除键、parameter-edge 归一及 graphOps 行为。 |
| canvasUndoJournal.replayTo（审计新增） | 每条 applyCanvasEvent 循环 | 复用 replayCanvasEvents(journal.slice(0,position),base)，保证所有 barrier 和 journal compaction 都使用同一末态归一。barrier 位置、history limit、seed/reset、undo/redo 栈逻辑未改。 |

## 测试是不是在掩盖兼容问题

- 原 `gatewayCanvasReadDoc.test.ts` 从 RAW_DOCUMENT 改为加 shotIndex:1，并继续验证 private-rmw-data，是准确反映编号迁移，不是把 raw 端口换成公共脱敏端口。但之前没有旧 batch 日志用例，不能以这个绿灯证明恢复完全兼容。
- `shotOrder.test.ts` fixture 增 kind:'video' 是为了满足真实节点类型；真实 CanvasNode 本来要求 kind，旧 cross-category/missing/empty cases 保留，新增配对帧+号洞正确。不是为了绕过 runtime kind 错误而删断言。
- `model/shotNumbering.test.ts` 保留原稳定号、无关节点加入不改号、y/x/id 补号和幂等测试，新增冲突/复制/恢复测试有效。但最初的幂等测试使用唯一 id，遗漏 P2；没有 MAX 边界。
- 新 `store/shotNumberingReplay.test.ts` 验证的是新 writer 发 snapshot，能证明新写入正确；不能证明旧日志正确。P1 正是这种覆盖盲点，不是原算法设计正确。
- 审计修复将 `model/shotNumbering.test.ts` 最后一个「event recovery」用例从单事件 applyCanvasEvent 改成真实公共恢复边界 replayCanvasEvents，预期仍 [1,2]、移动仍不改号。不是改预期迁就结果；旧日志的独立红测要求新增边界才可通过。

## RMW、旧 schema 与保留字段

- gateway.readDoc 两条实际路径都调用 normalizeSnapshot，因此 cold/warm headless 编号域一致；renderer 原始私有读取没有被 canvas.read 公共投影替代。
- backfill 仅 shallow spread node 改 shotIndex/删 shotIndex，result.raw、meta、runs、references 等所有其他 node 字段原样保留。gateway 测试实际保留 result.raw.taskId，readDoc 返回全节点。
- disk apply 重新 readProject，spread record 与 payload，仅替换 generationCanvas；本轮没有更改该代码。
- normalizeSnapshot 本来就只返回 nodes/edges/groups/selectedNodeIds，未知顶层 canvas 字段（例如 workflowTemplates）会丢失是基线既有行为。不要把这个旧限制报告成本次 backfill 回归。
- normalizeStoreSnapshot 原有 scene3d 旧 schema 转換、position修正、edge验证保留；相关旧 schema tests 本轮实际通过。

## 额外判断与未验证范围

Ponytail 建议删除 shared shotOrder 的 current 查找、category filter 与重复 finite 检查：对**唯一有效节点 ID**输入，resolveShotIdentities 已限制 shots 且正安全整数，删除这些确实不影响结果。属于可做清理，不是必须修复的逻辑缺陷。重复 ID 可能令 Map 身份与遍历 node 不一致，因此不能声称这种简化顺便解决坏图；也不应为保留这种偶然行为添加兼容分支。

删除最大镜头后允许复用 max 是获批规则，没有持久 sequence counter。有效号空洞不压缩，move/tidy 不会重新排列号码。首帧与 video 同号但不同 role 是设计目标，不应当作重复 owner bug。

未执行本 agent 范围的完整 build/Electron真机或全部仓库门岗，parent 负责最终统一验证。`check:root-cause-contracts` 首次运行因统一 replay 后门表符号变化而红（reducer changesShotIdentity 已删除、store backfill 已删除、undoJournal 新入口缺门），已反馈 parent 重算合同，不能误报门岗已绿。没有进行 commit/push。门表已按原全部符号 + replayCanvasEvents 重新机器扫描为 68 扇，原始扫描证据 /tmp/nomi-numbering-doors.json 与 .log；合同补齐了两处历史恢复入口和三个审计不变量。


最终补充：合同重算后 `pnpm run check:root-cause-contracts` 已通过（48 条 gate 自测通过；工作区检查打印本次无高风险生产路径变化，因此最终提交差分仍需 parent 正式 gates）。最终针对套件 12 文件 / 141 条全部通过，`git diff --check` 通过。三个确认问题均已有本地修复，未 commit/push。
