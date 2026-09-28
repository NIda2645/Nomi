# `src/design` 这一层的结构评审：Portal 之后，「谁在上面 / 谁先听见 / 谁被框架排除」（2026-09-22）

> 状态：📎 结构评审（`check:symptom-cluster` 触发：模块 `src/design` 在 2026-09-19 → 2026-09-21 的 7 天里收到 3 份根因合同）
> 触发合同：[`2026-09-19-composer-lifecycle`](../fixes/2026-09-19-composer-lifecycle.root-cause.json)、[`2026-09-20-anchored-popover-escape`](../fixes/2026-09-20-anchored-popover-escape.root-cause.json)、[`2026-09-21-canvas-help-popover-layer`](../fixes/2026-09-21-canvas-help-popover-layer.root-cause.json)
> 同形近邻（别层，同一族形状）：[`2026-09-22-model-integration-layer-structure`](./2026-09-22-model-integration-layer-structure.md)、[`2026-09-22-quality-gate-workflow-structure`](./2026-09-22-quality-gate-workflow-structure.md)（两篇都记下了「粗模块键会把『顺带改到』记成『又坏一次』」）
> 写这篇的人：Core-A 打捞总合并（`integration/core-a-salvage-20260921`）。**本刀不改 `src/design` 的任何代码**，只出评审。

## 1. 这一层是什么

`src/design/` 是共用视觉积木的入口（34 个文件、约 3.2k 行，清单正本在 [`src/design/README.md`](../../src/design/README.md)）。
它对用户的承诺只有一句：**同一种东西，在画布、时间轴、分镜表、设置页里长得一样、按键一样、叠放次序一样。**

这一层里真正会出结构性问题的不是「按钮圆角」，而是**浮层**那一小撮文件：

| 文件 | 它回答的那句话 |
|---|---|
| `src/design/overlayLayers.ts` | 「谁在最上面」（`NOMI_OVERLAY_Z_INDEX` 六档 + CSS 变量 + Tailwind 刻度，数字只此一份） |
| `src/design/AnchoredPopover.tsx` | 「锚点浮层怎么摆、怎么逃出祖先的 `overflow`、Esc 归谁」 |
| `src/design/useOverlayEscape.ts` | 「手写 `fixed inset-0` 壳子的 Esc 怎么让位给更上面那层」 |
| `src/design/NomiSelect.tsx` | 「下拉的 portal 根算不算框架（React Flow）应当排除的输入面」 |

四个文件回答的是**同一个问题的四个面**：`createPortal` 把「React 归属」和「DOM 归属」劈成两棵树之后，凡是靠"树"作判据的规则全部失效。

## 2. 三份合同：真同层 / 顺带碰到

门岗按 `scope_paths` 的前两段算模块键，所以「顺带改到共用组件一行」和「这一层坏了」记在同一个格子里。逐份读 `class_root` 后：

| 合同 | `scope_paths` 里 `src/design` 占比 | `invariant_owner_layer` | 判定 |
|---|---|---|---|
| 09-19 composer-lifecycle | **1 / 39**（`NomiSelect.tsx`） | `src/workbench/generationCanvas/components/canvasDraggingFlag.ts` | **顺带碰到** |
| 09-20 anchored-popover-escape | **1 / 1**（`AnchoredPopover.tsx`） | `src/design/AnchoredPopover.tsx` | **真同层** |
| 09-21 canvas-help-popover-layer | **1 / 2**（`AnchoredPopover.tsx`，且是唯一的 `write` 门） | `src/design/AnchoredPopover.tsx` | **真同层** |

**结论：这一簇 3 份里真正属于本层的是 2 份，且两份是同一个文件（`AnchoredPopover.tsx`）。**
第 3 份（09-19）是一份横跨 39 条 scope、owner 在画布的大合同，它落在本层的全部改动是一行：给 `NomiSelect` 的 `Combobox.Dropdown` portal 根补上 React Flow 的 `nokey` 排除类。

—— 但**它落在本层的那一行，恰好和另外两份是同一个类根因**（见 §3）。所以这份评审不把它当噪音一笔勾销：它不足以证明「本层被修了三次」，却足以证明「本层的那条不变量有第三个入口」。

## 3. 共有的形状：Portal 之后，三棵树互不重合

把两份真同层合同的 `class_root` 和 09-19 那一行并排，共同点不是某个函数写错了，而是**同一个错误直觉的三种说法**：

| 合同 | 当时按什么作判据 | 真正的判据 | 用户看到的 |
|---|---|---|---|
| 09-21 | 局部 `z-[12]`（React 树里"我在里面所以我在上面"） | `overlayLayers.ts` 的全局层档 —— 局部 z-index 只能排同一个层叠上下文里的兄弟 | 键盘帮助面板被 Agent 收起坞和批量生成条盖掉一半 |
| 09-20 | 选一个全局事件阶段（先是 bubble，修成 capture） | `target → popover → ancestor` 的**作用域顺序**，谁的 target 谁先处理 | 先是 Esc 穿到 React Flow 把 composer 关了；改 capture 之后又把输入框自己的 Esc 吞了 |
| 09-19（落本层的那一行） | 「React 组件祖先是 composer，所以框架不会抢键盘」 | 框架排除类必须跟着**真实 DOM 交互面**走，portal 根也是一个交互面 | 下拉里敲方向键，画布跟着动 |

一句话：**`createPortal` 之后，React 父子树、DOM 层叠树、事件传播树是三棵不同的树；这一层的每条规则都必须说清自己按哪一棵作判据。**
`AnchoredPopover.tsx` 文件头那段长注释（「全仓浮层定位现有四套」）已经是这条认识的一半——它写清了"什么时候用哪一套"，但没写"用了之后谁负责回答上面那三句话"。两份合同恰好落在这个缺口上。

## 4. 已经在收敛的（照实记，不吹）

1. **「谁在最上面」已经只有一个 owner**：`overlayLayers.ts` 的六档数字是唯一真相源，CSS 变量与 Tailwind `z-dialog`/`z-popover` 刻度都从它派生（文件注释里写明了「禁止两处各写一遍」的理由：Tailwind 默认刻度只到 50，className 侧没有合法出口，画布里五处浮层才硬写 `z-[9999]`）。今天生产侧消费方 8 个文件（`ui/feedbackLayer.ts`、`theme/nomiTheme.ts`、`ui/onboarding/ModelSettingsDetailDialog.tsx`、`workbench/settings/SettingsDialog.tsx`、`workbench/generationCanvas/spend/SpendConfirmDialog.tsx`、`generationCanvas/components/CanvasControlsHelpPopover.tsx` 等），没有第二份层表。
2. **`AnchoredPopover` 在持续收编「原地 absolute」那一族**：09-12 收 `ProjectSyncBadge`、09-17 收 `ShotComposerBar`、09-21 收 `CanvasControlsHelpPopover`（即第 3 份合同本身）。今天生产侧消费者 6 个 + 设计实验室 3 处陈列。
3. **Esc 这条已经有两级契约**：`useOverlayEscape`（手写壳）走 `hasOpenDialogAbove` 让位，`AnchoredPopover` 走 target 作用域仲裁；两者都不自己数 z-index。

## 5. 没收敛的那一处（下一刀，**不在本刀做**）

`AnchoredPopover.tsx` 注释里的第 ④ 套——「手写 `getBoundingClientRect()` + `createPortal`」——自称 **8 个文件**，并且自己写了一句：「这个 8 是要被改的数，不是装饰……数对不上就是这段注释又过期了（下一步是把名单交给 `check:` 脚本数，注释只留规则）。」

今天实测那 8 条：`NodeGenerationComposer.tsx` 的 `createPortal` / `getBoundingClientRect` 都已经是 **0**（那处浮层不在这个文件里了），其余 7 个仍在。**注释里的 8 实为 7——它自己预言的那件事已经发生了。**

> **下一刀一句**：把 ④ 那份名单从注释搬进棘轮门岗（`check:` 脚本数「非 `src/design` 下同时出现 `createPortal` + `getBoundingClientRect` 的锚点浮层」，基线 7、只减不增），让"这个数"由机器维护——注释只留判据。这是 R17「能让门岗拦的别留给人」在本层的落点，也是这一簇三份合同里唯一一件"结构性"的欠账。

其余不建议动：② Radix（tooltip / menu 一族，a11y 与避让是它自带的）、③ Mantine `DesignModal`（居中模态不是锚点浮层），理由已写在文件注释里，本次复核同意。

## 6. 门岗侧的一句话（同 09-22 另两篇评审）

`src/design` 这一簇 3 份里有 1 份是模块键的粗粒度带进来的。这是 `check:symptom-cluster` 刻意选的粗判据（判"做没做"不判"做得好不好"，见 `scripts/symptom-cluster-lib.mjs` 的自述），**不建议改判据**；但连续三篇评审都花了一节去分「真同层 / 顺带碰到」，说明评审模板里应当固定有这一节——本篇 §2 就是那个模板。
