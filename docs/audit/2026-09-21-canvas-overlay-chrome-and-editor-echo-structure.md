# 画布浮层「可用视口」与受控编辑器「文本归谁」的结构评审（2026-09-21）

> 状态：📎 结构评审（`check:symptom-cluster` 触发：模块 `src/workbench` 7 天内又两份根因合同）
> 触发合同：[`2026-09-21-composer-bottom-dock-overlap`](../fixes/2026-09-21-composer-bottom-dock-overlap.root-cause.json)、[`2026-09-21-controlled-editor-stale-echo`](../fixes/2026-09-21-controlled-editor-stale-echo.root-cause.json)
> 同层近邻：`2026-09-09-process-feedback-composer-obstacles`、`2026-09-10-node-composer-placement`（浮框避让与漂移）；`2026-09-21-canvas-node-placement-structure.md`（新卡几何无主人，另一份评审）

## 1. 这一簇是不是同一个结构问题

`src/workbench` 这个键覆盖整个渲染层，簇里大多数合同彼此无关（键太粗是已知欠账，见 09-21 新卡几何评审 §1）。本评审只看和这两单**真正同层**的合同：

| 合同 | 症状 | 缺的不变量 |
|---|---|---|
| 09-09 composer-obstacles | 浮框挡住邻居节点的点击 | 浮框留在舞台内、不压其它东西 |
| 09-10 node-composer-placement | 浮框随无关元素漂移 | 位置只由「视口 + 锚点」决定 |
| 09-21 composer-bottom-dock-overlap | 浮框底栏被缩放条/时间轴胶囊压住 | 「视口」= **可用**视口，固定 chrome 要扣掉 |
| 09-21 controlled-editor-stale-echo | 0ms 连打丢字 | 编辑器是自己文本的唯一 owner，回流的旧值不算外部变更 |

前三份是同一件事来回摆：09-09 加了「全场障碍」、09-10 为了不漂移把障碍**整类删掉**（连固定 chrome 一起），之后左缘工具条被单独补回，底部这一排漏了。摆动的原因是「可用视口」这个语义没有主人：障碍名单（`workspaceBottomDocks.ts`）有主人，但「一条横向跨度往下能用到哪儿」这条判据有两份（多选浮条私有一份，浮框一份都没有）。

第四份看起来无关，形状却一样：「编辑器里的字归谁」没有主人。两个编辑器内核（`PromptEditor`、`useNomiRichTextEditor`）各自写了一份「和上一次发出去的比一下」，而 React Flow 的节点投影在 effect 里才追上 store——任何滞后都会把编辑器自己发出过的旧值当成外部改写。

共同形状：**一个派生值（可用视口 / 编辑器文档）被两个来源共同决定，其中一个来源是固定的或滞后的；每个消费者各自回答「以谁为准」，于是答案随调用方漂移。** 这与 09-18「一个语义没有主人就会被重新发明」是同一族。

## 2. 本单做了什么（file 级）

- 可用下沿：`generation/workspaceBottomDocks.ts` 新增 `resolveUsableBottomAboveDocks`，与停靠区名单同住；`reactFlow/selectionToolbarPlacement.ts` 的私有副本删除；`nodes/anchoredPlacement.ts` 在定宽定横向之后用它算下沿；`nodes/useComposerViewportPlacement.ts` 从名单收集停靠区并把它们的矩形并入每帧签名。孤儿 `nodeSizing.ts:getUnobstructedComposerSpaceBelow`（旧障碍系统遗留、只剩测试在用）删除。
- 文本归属：`common/controlledEditorSync.ts` 一本「已发出 / 已确认」账，两个内核都只经它裁决；删除 `shouldApplyExternalPromptSync`、`shouldEmitPromptUpdate`、渲染期 `latestValueRef` 赋值与 `lastEditorJsonRef`。

## 3. 判断与后续

- **本单把两处都收成了单一 owner，没有让这一层更糟**：门表见两份合同，判据各只剩一份实现。
- **仍未收口的结构问题（提议，未实施）**：
  1. 「可用视口」目前是**底部**一份判据加**左缘**一段就地测量（`useComposerViewportPlacement` 里量 `data-canvas-left-dock`）。应把左缘也登记进同一个 chrome 名单（四边声明 + 一个 `resolveUsableStage`），让任何锚定浮层（结果堆叠、节点菜单、未来的浮条）都只读一份可用区。碰 `NodeResultStack.tsx` 等并行在改的文件，需另排。
  2. React Flow 投影滞后是**所有**读 `node` prop 又写 store 的节点内控件的共性风险。受控 Tiptap 已由账本兜住；纯受控 `<input>/<textarea>` 若直接绑 `node.*` 也会中招（本次实扫：标题编辑走本地 draft，未中招）。建议把「节点内受控输入必须经本地草稿或 `controlledEditorSync`」写成门岗规则（AST 扫 `value={node.`）。
- 两条提议登记进 `docs/roadmap/TODO.md` 候选，由用户排期。
