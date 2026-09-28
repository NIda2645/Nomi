# src/workbench 结构评审（2026-09-23）

> 状态：📎 交接/日志
> 触发：`check:symptom-cluster` 在 2026-09-17 至 2026-09-23 发现 `src/workbench` 7 天内多份根因合同。
> 范围：本次 PR #848 收尾涉及的画布几何与画布手势宿主边界。

## 触发证据

近期合同集中在 `src/workbench` 的生成画布层：锚定浮层高度、拖拽租约生命周期、画布节点与底部 dock 的空间关系。它们共享同一个用户可见结果：节点或编辑浮层必须在真实 viewport 内可测量、可命中、可继续操作。重复出现说明该层的宿主边界需要统一约束，而不是继续在各调用点追加补偿。

本轮新增合同：

- `docs/fixes/2026-09-23-anchored-placement-zero-height.root-cause.json`
- `docs/fixes/2026-09-23-canvas-dragging-raf-fallback.root-cause.json`

## 结构判断

### 1. 几何 owner 已集中，但其输入契约仍需保持纯函数

`src/workbench/generationCanvas/nodes/anchoredPlacement.ts::resolveAnchoredPlacement` 是 Agent 面板和节点 composer 的共同几何 owner。两个宿主不能各自推导「上方/下方还能放多少」，否则同一锚点会在不同入口得到不同高度。本轮修复保留这一单一 owner，只补齐 anchor 填满 stage 时的自然高度 fallback；没有把 dock 或窗口判断复制回宿主。

约束：后续布局修复先更新 resolver 的输入/输出不变量与类级测试，再检查两个宿主；宿主不得自行对 `height` 做第二次裁决。

### 2. 手势 owner 已集中，但调度能力必须在共享租约边界适配

`src/workbench/generationCanvas/components/canvasDraggingFlag.ts::CanvasDragLease` 是选择拖拽、节点缩放和 React Flow 手势的共同租约 owner。之前结束保护直接假设 `window.requestAnimationFrame` 存在，导致 reduced/headless host 在共享路径上抛错。本轮新增 `scheduleAfterFrame` 只在 owner 内做能力分流，浏览器仍用 RAF，非浏览器 host 用异步 timer，租约释放顺序不改变。

约束：调用方只申请/释放租约，不得各自探测 RAF 或实现第二套延迟收尾；新增 host 能力差异必须进入该模块的 focused regression test。

### 3. 复发防线

- 几何：`anchoredPlacement.test.ts` 覆盖 full-stage anchor 的正高度与 stage containment；`coreCanvasLifecycle.test.ts` 继续覆盖宿主消费。
- 手势：`canvasDraggingFlag.test.ts` 覆盖匹配 lease 释放、epoch guard 与无 RAF host 的异步顺序。
- 真实路径：`tests/ux/golden-path.e2e.mjs` 通过真实 Electron 走查验证原稿镜头可命中、Agent 只改第二镜且 viewport 保持稳定。
- 门表：两份合同各自保留 `door-map` 生成的读写入口；新增调用方不能绕过共享 owner。

## 结论与后续

本次合同没有暴露第二个几何或手势 owner；问题属于同一层共享边界缺少完整输入能力契约，已在最早共享边界修复。后续若同一模块再次出现第三类合同，应先更新本结构评审并把新增不变量落到 owner 层测试，禁止在宿主组件继续堆局部 fallback。
