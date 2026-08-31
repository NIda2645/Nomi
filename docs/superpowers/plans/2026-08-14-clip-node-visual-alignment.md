# 剪辑节点视觉对齐实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将画布剪辑节点从常驻大卡片收敛为样章 A「轴为本体」：常态只显示紧凑剪辑轴，选中片段后才在轴附近浮出预览、片段工具和分组导出操作。

**Architecture:** 保留现有 `clipNodeModel`、序列编辑、素材选择和 MP4 导出逻辑，只重组展示层。`ClipNodeTimeline` 负责可拖动/可裁剪的紧凑轴，`ClipNode` 负责画布定位、选中态和浮层开关；新增纯函数只计算轴刻度与展示状态，避免把视觉判断散落在 JSX 中。

**Tech Stack:** React 18、TypeScript、Tailwind token classes、Vitest、现有 WorkbenchButton/WorkbenchIconButton。

---

## 样张到代码的逐项对照

| 样张约定 | 代码落点 | 验收方式 |
| --- | --- | --- |
| A「轴为本体」：常态只有一条紧凑轴 | `registry.ts` 默认 `640×132`；`nodeSizing.ts` 对 clip 固定 132px 高；`ClipNode.tsx` 的 `data-clip-mode="compact"` | 真实画布节点外壳高度 ≤180px，常态不存在预览浮层 |
| 轴头显示名称、片段数、总时长 | `ClipNode.tsx` header + `clipNodeVisual.ts` 的 `formatClipNodeDuration` | DOM 同时出现「剪辑轴」「共 N 个片段」「总长 mm:ss` |
| 轴内有时间刻度、片段条和末尾加号 | `ClipNodeTimeline.tsx` + `resolveClipNodeAxisTicks` | 轴最多 5 个刻度；片段可拖动/裁切；加号打开 `AssetPickerPopover` |
| 点片段才出现预览和就近工具 | `ClipNode.tsx` 的 `editingOpen` + `ClipNodePreview` 浮层 | 点击片段后 `data-clip-mode="editing"`，出现「这一段」「分割/复制/删除」 |
| 导出按作用域分组，不把三个动作铺满节点 | `ClipNode.tsx` `exportMenuOpen` 浮层：当前片段 / 整条剪辑 / 生成新视频节点 | 点击「导出」展开三组动作，空白处收回 |
| 画布可见、轴不挡底部时间轴 | 节点本体只占紧凑高度，编辑内容使用 `overflow-visible` 的局部浮层 | 真实截图检查画布底部时间轴仍可见 |

这张表是实现前的硬对账单；后续若样张变更，先同步更新表和组件状态图，再改代码。

### Task 1: 固化「紧凑轴 + 选中展开」展示契约

**Files:**
- Create: `src/workbench/generationCanvas/nodes/clipNodeVisual.ts`
- Create: `src/workbench/generationCanvas/nodes/clipNodeVisual.test.ts`

- [ ] **Step 1: Write the failing test**

  覆盖空轴、常态和选中态的纯函数结果，以及时间轴应显示的 5 个以内刻度。

- [ ] **Step 2: Run test to verify it fails**

  Run `pnpm exec vitest run src/workbench/generationCanvas/nodes/clipNodeVisual.test.ts`，预期因模块和函数不存在而失败。

- [ ] **Step 3: Write minimal implementation**

  实现 `resolveClipNodeVisualMode` 和 `resolveClipNodeAxisTicks`，只返回展示所需的稳定数据，不引入 React。

- [ ] **Step 4: Run test to verify it passes**

  重新运行同一命令，预期全部通过。

### Task 2: 把时间轴改为样章 A 的紧凑本体

**Files:**
- Modify: `src/workbench/generationCanvas/nodes/ClipNodeTimeline.tsx`
- Modify: `src/workbench/generationCanvas/nodes/ClipNodePreview.tsx`

- [ ] **Step 1: Write the failing test**

  为新增轴刻度 helper 增加边界测试：空轴仍有 `00:00`，长轴最多 5 个均匀刻度，最后一个刻度等于总时长。

- [ ] **Step 2: Run test to verify it fails**

  Run `pnpm exec vitest run src/workbench/generationCanvas/nodes/clipNodeVisual.test.ts`，先确认刻度契约未实现。

- [ ] **Step 3: Write minimal implementation**

  移除时间轴内部的大块滚动容器和常驻全宽操作区；保留片段拖动、入出点拖拽、分割模式和选择回调。轴内增加多刻度尺、紧凑片段条，以及末尾的 `+ 添加素材` 卡片。预览改为可由外层控制尺寸的浮动预览，不再渲染空白大面板。

- [ ] **Step 4: Run focused tests**

  Run `pnpm exec vitest run src/workbench/generationCanvas/nodes/ClipNodeTimeline.test.ts src/workbench/generationCanvas/nodes/clipNodeVisual.test.ts`，预期全部通过。

### Task 3: 重组剪辑节点外壳和上下文浮层

**Files:**
- Modify: `src/workbench/generationCanvas/nodes/ClipNode.tsx`
- Modify: `src/workbench/generationCanvas/nodes/registry.ts`
- Modify: `src/i18n/locales/generationCommon.ts`

- [ ] **Step 1: Write the failing test**

  在现有节点行为测试/走查契约中固定三个用户可见不变量：常态没有预览区，点击片段才出现预览和「这一段」工具，导出动作按「当前片段 / 整条剪辑 / 生成新视频节点」分组。

- [ ] **Step 2: Run test to verify it fails**

  用当前实现运行对应测试/DOM 走查，预期常态仍能找到 `clip-node-preview` 且导出按钮直接铺在卡片里。

- [ ] **Step 3: Write minimal implementation**

  将节点默认尺寸改为紧凑轴比例；节点本体使用半透明深色轴面板和选中描边。增加 `editingOpen`、`exportMenuOpen` 状态：点击片段打开上方预览和就近工具，点击空白轴收回；加号直接打开素材选择器。导出改为一个带明确范围标签的浮动菜单，继续复用已有导出和生成视频节点回画布能力。所有文案走现有 i18n。

- [ ] **Step 4: Run focused tests and typecheck**

  Run `pnpm exec vitest run src/workbench/generationCanvas/nodes/clipNodeVisual.test.ts src/workbench/generationCanvas/nodes/clipNodeSequence.test.ts` and `pnpm run typecheck`。

### Task 4: 真实页面对账

**Files:**
- Test/inspect: local Electron renderer at a fresh port

- [ ] **Step 1:** Build and launch the isolated worktree.
- [ ] **Step 2:** 在空轴、添加素材、点击片段、裁切、导出菜单、点击空白收回六个状态截图走查；确认轴不遮挡画布底部时间轴。
- [ ] **Step 3:** 运行 `pnpm run check:filesize && pnpm run check:tokens && pnpm run check:i18n && pnpm run lint:ci && pnpm run typecheck && pnpm run test && pnpm run build`。
- [ ] **Step 4:** 提交并推送隔离分支，给出 PR 和新版本测试入口。

### Task 5: 修复轴首入口、拖拽与本地视频导入

**Files:**
- Modify: `src/workbench/generationCanvas/nodes/ClipNodeTimeline.tsx`
- Modify: `src/workbench/generationCanvas/nodes/ClipNode.tsx`
- Create: `src/workbench/generationCanvas/nodes/clipNodeUpload.ts`
- Modify: `electron/preload.ts`, `electron/assets/assetsIpc.ts`, `electron/assets/localFileImport.ts`
- Test: `tests/ux/clip-node-editing.walk.mjs` and focused unit tests

- [x] **Step 1:** 用真实指针拖动断言固定“片段可以在轴上拖动”，并确认失败/成功来自构建产物而非源码热更新。
- [x] **Step 2:** 将 `+` 放到轴首，片段布局从加号右侧开始，保持同一几何宽度来源。
- [x] **Step 3:** 本地视频优先通过 Electron `webUtils.getPathForFile` 进入主进程，避免整份大文件穿过 renderer IPC；JS 构造的 File 才回退字节通道。
- [x] **Step 4:** 剪辑节点素材选择器显示上传中状态；失败保留原始 File，并在原地提供“重试导入”。
- [x] **Step 5:** 重建 Electron 后跑真实任务：轴首加号 → 原生视频上传 → 片段拖动 → 分割/删除/导出入口。
