# 节点生成浮框不压画布 chrome + 提示词编辑器快速输入不丢字（2026-09-21）

> 状态：✅ 已实施（分支 `fix/composer-overlap-and-dropped-keys-20260921`，PR #834）
> 根因合同：[`composer-bottom-dock-overlap`](../fixes/2026-09-21-composer-bottom-dock-overlap.root-cause.json) · [`composer-footer-chip-clipping`](../fixes/2026-09-21-composer-footer-chip-clipping.root-cause.json) · [`controlled-editor-stale-echo`](../fixes/2026-09-21-controlled-editor-stale-echo.root-cause.json)
> 结构评审：[`2026-09-21-canvas-overlay-chrome-and-editor-echo-structure.md`](../audit/2026-09-21-canvas-overlay-chrome-and-editor-echo-structure.md)

## 范围

1. 浮框底栏被左下缩放条 / 底部时间轴胶囊压住 → 浮框的可用区扣掉底部停靠区（与多选浮条共用一份判据）。
2. 翻到节点上方的浮框压住节点浮条 → 让出的高度按节点上沿之外 chrome 的实测矩形算。
3. 卡片压到最小高度时「生成方式」tab 与第一行参考格被裁 → 两者是卡片的固定内容，进最小高度。
4. 1100×720 英文「Variant 5.0」被裁成「Variant E」→ 变体短枚举不缩，只有模型芯片省略。
5. 0ms 连打丢字 → 受控编辑器用一本「已发出 / 已确认」账裁决外部值，两个 Tiptap 内核共用。

不动项：控件样式与层级设计、z-index、画布 chrome 本身的位置；并行工人在改的 `generationCanvasReactFlowVisualContract.ts`、连线把手 CSS、`useCanvasShortcuts.ts`、`NodeResultStack.tsx`。

## 先查别人

- 依赖里已有？React Flow 的受控 `nodes` 在 `StoreUpdater` 的 effect 里才同步进它自己的 store（`node_modules/@xyflow/react/dist/esm/index.mjs:281`，`setNodes(fieldValue)` 在 :303）——节点组件的 `node` prop 天生比应用 store 晚一拍，编辑器必须容忍任意滞后，而不是只和上一次发出的值比。源码：https://github.com/xyflow/xyflow/blob/main/packages/react/src/components/StoreUpdater/index.tsx
- 依赖里已有？ProseMirror 撤回会把事务前的选区还回来（`node_modules/.pnpm/prosemirror-history@1.5.0/node_modules/prosemirror-history/dist/index.js:333` `setSelection(selection)`）——所以撤回翻译后选中的是被还原那一段，这是原生语义，不能再被外部同步的 `setContent` 冲掉。文档：https://prosemirror.net/docs/ref/#history
- 生态里怎么做浮层避让？Floating UI 的 `flip` / `shift` / `size` 都以「裁剪边界 + padding」为可用区，固定 chrome 属于边界而不是邻居：https://floating-ui.com/docs/flip 、https://floating-ui.com/docs/detectOverflow 。React Flow 官方节点浮层 `NodeToolbar` 不做邻居避让：https://reactflow.dev/api-reference/components/node-toolbar
- 仓库里已有？底部停靠区名单与让位判据已有单一 owner，多选浮条在用（`src/workbench/generation/workspaceBottomDocks.ts:103` `resolveUsableBottomAboveDocks`）；分镜底栏「短枚举不缩、模型芯片有下限」的先例在 `src/workbench/creation/storyboard/shotRow/composerBarGeometry.ts:189`；另一个受控 Tiptap 内核在 `src/workbench/common/useNomiRichTextEditor.ts:67`，同样用「只比上一次」的弱判据，一并收进同一本账。

## 回滚

逐 commit 可回退；无持久化数据迁移。

## 验收门

- 单测：每条都有修前红 / 修后绿（阳性对照）+ 类级测试。
- 真机走查：`tests/ux/composer-overlap-and-fast-typing.walk.mjs`、`tests/ux/prompt-translate.walk.mjs`（zh/en，真 DeepSeek，真素材）。
- `pnpm run gates` 全档、`pnpm run review:branch`。
