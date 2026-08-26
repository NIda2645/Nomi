# ComfyUI 工作流画布：Mac 手势与 PR 交付

> **For agentic workers:** Use `subagent-driven-development` for the bounded implementation and independent reviews; use `verification-before-completion` and `finishing-a-development-branch` for delivery.

**Goal:** 工作流设置与主生成画布共用已存在的鼠标/触控板偏好，完成验证后提交 PR，不合并。

**Architecture:** 将既有 `canvasGesturePreference` 模块及其测试移到 `src/utils/`，保持 storage key、默认值、订阅和意图判定不变。工作流画布订阅同一偏好：普通滚轮按偏好平移/缩放，Ctrl/Meta（包括 Chromium 捏合事件）始终按光标锚点缩放。菜单、侧栏、列表仍独占自己的滚动。

**Tech Stack:** 既有 React 18 / Electron 43 / Vitest / Playwright，不增依赖或 UI 控件。

## 已确认的方案与约束

用户在上一轮的手势方案说明后要求「弄完之后自己提交PR上」，视为同意该范围并解除先前暂缓提交限制。此前截图与已实现的工作流页仍为视觉基准：不改变布局、控件或默认档；不按操作系统猜设备，不凭 delta 大小猜鼠标/触控板。

| 方案 | 用户体验 | 代价 / 结论 |
| --- | --- | --- |
| 共用已有通用设置 | 两个画布手势一致，已有选择继续生效 | 采用；无第二个开关 |
| Mac 强制平移 | Mac 外接鼠标也被改成平移 | 不采用，系统不是输入设备 |
| delta 阈值自动识别 | 同一设备可能随速度切换操作 | 不采用，没有可靠设备标记 |

现状：`WorkflowGraphCanvas.tsx` 无条件把 deltaY 变成缩放，水平滑动被忽略；`useCanvasViewportGestures.ts` 已实现两档语义与 Shift 横移。

官方核对（2026-08-26）：[Apple 两指滚动/捏合说明](https://support.apple.com/en-euro/102482)、[MDN wheel 的 ctrlKey 捏合约定与取消默认行为](https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event)、[React useEffect 监听清理](https://react.dev/reference/react/useEffect)（Context7 已查）。仅使用 React 18 已有 API。

## Task 1：失败复现与接线

- [x] 在独立辅助脚本 `tests/ux/_comfyWorkflowMacGestures.mjs` 增加从设置真实入口选中 `modifier-zoom` 的旅程，不通过 store 桥直接改偏好；由既有 feedback walk 调用。
- [x] 先运行生产构建的反馈走查；工作流执行 `mouse.wheel(32, 48)`，预期 zoom=1，实际 0.917553。`/tmp/nomi-comfy-mac-red.log` exit 1，失败原因正是未消费共享偏好。
- [x] 移动 `src/workbench/generationCanvas/components/canvasGesturePreference.ts` 及测试到 `src/utils/`，更新 settings/help/main-canvas 的全部 import，删除旧模块，保持单一状态实例与存储键。
- [x] `WorkflowGraphCanvas` 调用 `useCanvasGestureScheme()`；原生 wheel effect 加入 scheme 依赖与清理，菜单排除后按既有意图分支：

```ts
if (resolveWheelIntent(gestureScheme, event) === 'pan') {
  const dx = event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX
  const dy = event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY
  if (!dx && !dy) return
  setSelectedNodeId(null)
  setViewport(current => ({ ...current, offset: { x: current.offset.x - dx, y: current.offset.y - dy } }))
  return
}
```

- [x] 原 zoom 分支继续用 `zoomGraphAtPoint` + shared factor；不替换主画布原有拖动/平移、阈值或灵敏度。
- [x] 范围单测：`pnpm exec vitest run src/utils/canvasGesturePreference.test.ts src/utils/wheelZoom.test.ts src/ui/onboarding/comfyuiGraphGeometry.test.ts src/workbench/generationCanvas/components/canvasControlsHelpModel.test.ts src/workbench/generationCanvas/components/generationCanvasGeometry.test.ts`。

## Task 2：真实用户任务回归

- [x] 鼠标用户：默认滚轮定位节点、改字段并保存，5/48/80 节点以及菜单/侧栏/列表隔离原旅程仍通过。
- [x] Mac 触控板用户：在设置选平移，回工作流两轴/单轴/细粒度滑动；Shift 纵向输入转横移；Meta+滚轮、Ctrl/捏合等价事件按光标缩放且不放大整个页面；缩放后仍能点节点改字段。
- [x] 共用偏好：实际主生成画布也使用同一设置；往返两档不需要重启，图/列表反复切换无重复监听。
- [x] 冷启动：偏好仍为平移，已保存字段仍在，浅色工作流中平移/修饰键缩放有效；再切回鼠标档验证无残留平移。
- [x] 事件后断言等待浏览器确实消费 wheel（capture + animation frames 或状态条件），避免立即读相等的假绿。
- [x] 正式执行 `node tests/ux/comfy-workflow-feedback.walk.mjs`，亲眼查看截图。自动化输入只能证明事件语义与实际 macOS Electron 链路，不能声称已经实体触控板试手感。
- [x] 既有设置提示同步说明两画布共用偏好、捏合可缩放；中英文均更新，不增控件，并保持主画布专属的框选说明不误指工作流面板。
- [x] 补原始三图反馈闭环 `tests/ux/comfy-workflow-multiref.walk.mjs`：真实导入三输入 JSON → 三个独立参考槽从画布选入 → 保存三条不同槽位连线 → 冷启动保留 → 实际 HTTP 上传三份不同图片 → `/prompt` 三节点一一对应 → 下载可解码视频。源素材仅在启动前种入隔离项目，不通过运行时 store 桥代替用户操作；服务为本地模拟，不证明 GPU 推理。

## Task 3：评审与交付

提交前独立复核发现两处既有合同边界，纳入原 ComfyUI 修复范围，按系统化调试与 TDD 先复现再修：

- [x] 媒体和普通字段共用 `request.params`，必须跨两类统一 key 去重。覆盖「先媒体后普通参数」「先普通参数后媒体」「手动改 key」「backend 规范化与实际模板/defaultParams」，不允许文本默认值覆盖图片槽。
- [x] 输出迁移必须确认实际执行目标包含新保存节点。标准旧 `[CreateVideo]` 可升级；包含 saver 的自定义列表保留；未覆盖 saver 的自定义列表或无效合同必须整体不迁移，保留模型/绑定/mapping 的原子性。配 canonical/custom/disabled/idempotence 回归。

- [x] 独立需求符合性复核，再做代码/交互质量复核；此前视频类型/枚举/迁移/多工作流矩阵变更一并核对提交边界。
- [x] `pnpm run gates` 完整通过；`git diff --check`；追踪与未追踪文件均做 secrets 检查。
- [x] 已刷新 origin/main；提交前通过 GitHub API 再核对 main SHA 为 a712da02，与本地基线一致，无需整合。
- [ ] 仅暂存这次 ComfyUI 反馈系列的明确文件。导入声明、连线身份与请求投影互相依赖，以一条原子提交交付完整合同；push `codex/` 任务分支，创建 PR，记录 URL / commit / checks；不 merge、不发版。

## 不动项与回滚

本次 Mac 补齐不改 API、模型推理、目录格式、默认手势或手势设置 UI。旧反馈系列改动全部保留；真实私有 H3 GPU 推理不在模拟服务通过的证明范围。撤回本次共享模块移动及工作流手势分支可恢复前一轮行为，不影响用户偏好存储。新一轮授权优先于旧计划中的「等待确认」。
