# 编组的「+」拉环（展开框 + 折叠卡）

> 状态：进行中（2026-09-24）· 来源：v0.22 用户反馈 3「打组后左右两边也出现 + 号，符合直觉」
> 拍板（2026-09-24，AskUserQuestion）：选中编组才出「+」｜右出左进｜折叠编组卡也改成选中才出｜选中折叠卡按 Delete = 删编组和组内节点、可撤销

## 用户那一刻卡在哪

打完组，用户想把「这一组」交给下一步（比如三张参考图一起喂给视频节点）。卡片有「+」，编组框没有，只能一张张连。
折叠的编组卡其实有「+」，但 v0.22 迁到 React Flow 之后，那两颗是旧的按钮：按下去会亮，拖出去**不画线、不建边**（2026-09-24 真机探针：edges 仍为空）——和「视频拖不出线」同一类：入口画出来了，手势没人接。

## 做法

- **手势只有一套：React Flow 的连线手势。** 每个编组在画布内核里有一个「端口节点」：折叠编组复用已有的 proxy 节点（本来就用来承接聚合边），展开编组只在被选中时临时投影一个覆盖框体的端口节点。端口节点不可选、不可拖、自身不吃指针，只渲染左右两个源把手。
- **把手长相归原 owner：** `resolveGenerationFlowConnectionAffordance` 读端口的 `selected`——选中 = 与卡片同款磁吸「+」圈，未选中 = 不渲染。
- **连线语义复用现成 store 路径：** 起线时发现源是编组 → `startGroupConnection(groupId, side)`；落到卡上 → `completeNodeConnection` → `connectToNode` 已会把编组源转成 `connectToGroup`（右 = 组内每个成员连到目标，左 = 目标连到每个成员）。落到空白 → 右侧出新建菜单（可选种类 = 成员 `connectionCreateKindsForSource` 的并集），左侧取消。
- **「选中的编组」唯一 owner：** `model/selectedGroup.ts`——空框 / 折叠卡看 `selectedFrameId`，有成员的展开框看「选区恰好是它的全部成员」。
- **折叠卡能被选中：** 点折叠卡走现有的框选中态（`selectFrame`），清空节点选区；Delete 走现有 `deleteSelectedFrame`（删组带节点、一次撤销）。选中时卡边亮 accent，与选中空框同款。
- **删旧：** `CollapsedGroupCard` 里的两颗 `MagneticConnectionHandle` 删掉；`NodeConnectionHandles.tsx` 若再无引用一并删除。`meta.collapsedGroupProxy` 收成 `meta.groupPort`（折叠 / 展开同一个概念）。

## 不动项

- 编组的聚合边投影、`connectToGroup` 的物化规则、框的拖动与入组退组。
- 卡片自己的「+」规则（唯一主选中才出磁吸圈）。

## 验收

- 真机：选中展开框 → 左右出「+」且在最上层；从右「+」拖到视频卡 → 每个成员各一条边；从左「+」拖到一张图 → 图连到每个成员；拖到空白出菜单、建出的节点连上全部成员；未选中时不出圈；多选两张成员卡不出框的圈。
- 真机：折叠卡未选中无圈；点一下选中出圈、边框亮；从右「+」拖到卡上建边；Delete 删组与成员，⌘Z 一次恢复。
- 单测：`selectedGroup` 判据、端口把手档位、起线时编组源的分流。
- 回滚：单个 revert 这批提交即可，无数据迁移。

## 先查别人（R5）

- React Flow 官方：把手必须挂在节点里、连线手势只从 `Handle` 起（@xyflow/react v12 `Handle` / `onConnectStart` / `onConnectEnd` 文档）。编组不是节点，所以用「端口节点」承载把手，而不是另写一套指针拖拽——另写就是第二个连线手势引擎（R1）。
- 仓内先例：折叠编组的 proxy 节点（`GenerationCanvasReactFlow.tsx` flowProjectionNodes）已经是「非真实节点、只为画布内核存在」的投影节点，本次沿用而不是新造。
