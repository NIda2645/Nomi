# 画布剪辑节点 Implementation Plan

> **For agentic workers:** 使用 executing-plans 在当前隔离工作树逐任务执行。每个任务先写失败测试，再实现最小改动并验证。

**Goal:** 把画布里的剪辑节点升级为可直接处理画布素材的单轨剪辑工作区，复用现有时间轴的片段数学和编辑语义，减少用户在画布与时间轴之间来回切换。

**Architecture:** 剪辑节点继续把剪辑序列持久化在节点 `meta.clip` 中，但把顺序片段从“素材列表 + 入出点”升级为带 `startFrame/endFrame/offset` 的混合媒体序列。新建一个节点专用序列适配层，调用现有 `timelineEdit` 的移动、分割、裁切、删除和复制纯函数，不把全局三轨 `TimelinePanel` 整体塞进节点。节点默认显示紧凑轴；点片段后在节点内展开预览和编辑工具，导出仍走现有 MP4 导出 API。

**Tech Stack:** React 18, Zustand/Immer, TypeScript, Tailwind design tokens, Vitest, existing timeline edit/export APIs.

---

### Task 1: 建立混合素材序列模型和编辑适配层

**Files:**
- Modify: `src/workbench/generationCanvas/nodes/clipNodeModel.ts`
- Create: `src/workbench/generationCanvas/nodes/clipNodeSequence.ts`
- Test: `src/workbench/generationCanvas/nodes/clipNodeSequence.test.ts`

- [x] **Step 1: Write the failing tests**

  覆盖四个不变量：图片和视频可以在同一条轴上按顺序排列；拖动不会与邻片重叠；刀片分割会保留视频源 offset；删除后后续片段会自动紧接前片；入出点更新会改变对应片段可见帧而不是把片段重置。

- [x] **Step 2: Run the focused test and verify RED**

  Run: `pnpm exec vitest run src/workbench/generationCanvas/nodes/clipNodeSequence.test.ts`
  Expected: FAIL because the node sequence editing adapter and persisted edit fields do not exist.

- [x] **Step 3: Implement the minimal sequence adapter**

  扩展 `ClipNodeSource` 的可选 `startFrame`、`endFrame`、`offsetStartFrame`、`offsetEndFrame`，保留旧数据由 `clipNodeTimeline` 顺序归一化；新增 `clipNodeSequence.ts`，以单轨 `TimelineState` 包装片段并调用 `moveClipToLegalFrame`、`splitClipAtFrame`、`resizeClipEdge`、`removeClipById`、`duplicateClipById`。适配层只负责把时间轴结果写回 `ClipNodeMeta`，不复制这些纯函数的碰撞和 offset 逻辑。

- [x] **Step 4: Run focused tests and existing model tests**

  Run: `pnpm exec vitest run src/workbench/generationCanvas/nodes/clipNodeSequence.test.ts src/workbench/generationCanvas/nodes/clipNodeModel.test.ts`
  Expected: PASS.

### Task 2: 给剪辑节点接入真实片段编辑操作

**Files:**
- Modify: `src/workbench/generationCanvas/nodes/ClipNode.tsx`
- Modify: `src/workbench/generationCanvas/nodes/clipNodeModel.ts`
- Test: `src/workbench/generationCanvas/nodes/clipNodeModel.test.ts`

- [x] **Step 1: Add failing behavior tests**

  测试从节点 meta 读取旧素材仍得到稳定轴；编辑结果能写回 selected clip；剪辑节点输出时间线包含图片和视频，并且导出传入的是当前分割/裁切后的片段序列。

- [x] **Step 2: Verify RED**

  Run: `pnpm exec vitest run src/workbench/generationCanvas/nodes/clipNodeModel.test.ts`
  Expected: FAIL on persisted edit fields and edited export sequence.

- [x] **Step 3: Implement node interaction**

  将节点 UI 改为：顶部为节点标题和片段数量；中部为可点击片段轴（片段可拖动改变顺序位置，选中后显示边缘把手）；工具栏提供“选择/刀片/删除/复制”；右侧/下方保留 `+` 添加素材；预览使用当前选中片段 URL 和 playhead；所有编辑通过 sequence adapter 统一写回 `meta.clip`。保留现有素材库 picker、画布视频连接自动导入和导出 API，不引入第二个素材来源系统。

- [x] **Step 4: Run focused model tests and typecheck**

  Run: `pnpm exec vitest run src/workbench/generationCanvas/nodes/clipNodeModel.test.ts src/workbench/generationCanvas/nodes/clipNodeSequence.test.ts` and `pnpm run typecheck`.
  Expected: PASS with no TypeScript errors.

### Task 3: 复用时间轴片段渲染语义并补设计系统样式

**Files:**
- Create: `src/workbench/generationCanvas/nodes/ClipNodeTimeline.tsx`
- Create: `src/workbench/generationCanvas/nodes/ClipNodePreview.tsx`
- Modify: `src/workbench/generationCanvas/nodes/ClipNode.tsx`
- Test: `src/workbench/generationCanvas/nodes/ClipNodeTimeline.test.ts`

- [x] **Step 1: Write failing component tests**

  测试空状态显示“添加素材”；混合图片/视频按时间顺序呈现；刀片模式点击片段会触发分割回调；删除按钮只对选中片段可用；在节点内部滚动不会冒泡为画布滚动。

- [x] **Step 2: Verify RED**

  Run: `pnpm exec vitest run src/workbench/generationCanvas/nodes/ClipNodeTimeline.test.tsx`
  Expected: FAIL because the extracted node timeline and preview components do not exist.

- [x] **Step 3: Implement token-only UI**

  使用 `border-nomi-line`、`bg-nomi-paper`、`text-nomi-ink-*`、`rounded-nomi*` 和现有 `WorkbenchButton`，不新增 hex 色、任意字号或全局 CSS。节点高度根据展开状态使用现有 `size` 机制；时间轴横向溢出容器使用 `overscroll-contain`，在提示词/画布滚轮修复的同一原则下阻断 wheel 冒泡。

- [x] **Step 4: Run component tests and inspect the real app**

  Run: `pnpm exec vitest run src/workbench/generationCanvas/nodes/ClipNodeTimeline.test.tsx`.
  Then run `pnpm dev`, open a project, add a clip node, add an image and a video, perform split/trim/delete/drag, and take a screenshot for human comparison with the approved A “轴为本体” sample.

### Task 4: 连接画布素材与生成回画布

**Files:**
- Modify: `src/workbench/generationCanvas/nodes/ClipNode.tsx`
- Modify: `src/workbench/generationCanvas/store/canvasNodeActions.ts`
- Test: `src/workbench/generationCanvas/nodes/clipNodeOutput.test.ts`

- [x] **Step 1: Write failing output tests**

  测试剪辑节点可从已连接图片/视频节点导入且不重复；“生成视频节点”输出新 video 节点，节点 meta 中记录 `sourceClipNodeId` 和导出产物 URL；删除剪辑节点不会留下悬空全局时间轴引用。

- [x] **Step 2: Verify RED**

  Run: `pnpm exec vitest run src/workbench/generationCanvas/nodes/clipNodeOutput.test.ts`
  Expected: FAIL because output action and provenance fields are missing.

- [x] **Step 3: Implement output action**

  在节点内提供“生成视频节点”动作：用当前 node-scoped timeline 调用现有导出 API，成功后通过 canvas store `addNode({ kind: 'video', ... })` 创建结果节点，位置放在剪辑节点右侧并自动连边；失败只 toast，不写半成品结果。节点内的“导出片段/下载成片”仍分别使用当前选中片段和全序列。

- [x] **Step 4: Verify output and integration tests**

  Run: `pnpm exec vitest run src/workbench/generationCanvas/nodes/clipNodeOutput.test.ts src/workbench/generationCanvas/nodes/clipNodeSequence.test.ts`.

### Task 5: 全量门禁与交付

**Files:**
- Modify only scoped files above plus `tests/ux/clip-node-editing.walk.mjs`; include `public/tailwind.generated.css` only when the renderer build regenerates it for these scoped classes; do not include unrelated working-tree changes.

- [x] **Step 1: Run required project gates**

  Run in order: `pnpm run check:filesize`, `pnpm run check:tokens`, `pnpm run check:i18n`, `pnpm run lint:ci`, `pnpm run typecheck`, `pnpm run test`, `pnpm run build`.

- [x] **Step 2: Run real user task walkthrough**

  任务闭环：隔离 Electron 加载画布图片/视频 → 自动进入剪辑轴 → 选中片段出现编辑控件 → 刀片分割 → 删除一段 → 确认上游同步不会把显式删除的片段重新灌回 → 确认导出/生成回画布入口可见；浏览器样张另行确认暗色主题按钮可读、空状态入口可发现。由于走查 fixture 不是用户素材，不在本门里实际下载导出文件。

- [x] **Step 3: Commit and push the isolated branch**

  `git add` 仅加入本计划涉及文件，提交 `feat: make canvas clip node a reusable editor`，推送 `codex/clip-node-editing`，再报告 commit、分支和验证结果。按项目规则不直接合并默认分支。

---

## Scope review

- 已覆盖：画布内素材处理、复用现有时间轴编辑数学、图片/视频混排、分割/裁切/删除/拖动、预览、导出、生成回画布。
- 明确不做：重构全局三轨时间轴、把整个 `TimelinePanel` 嵌入节点、增加新的模型/供应商、在节点里实现独立的 ffmpeg 管线。
- 核心取舍：节点默认保持紧凑易发现；复杂编辑在节点内展开，而不是让节点永久变成一张大面板遮住画布。
