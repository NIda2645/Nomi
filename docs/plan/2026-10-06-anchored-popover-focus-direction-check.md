# 方向检查：AnchoredPopover 的焦点管理缺口（RW）

> 触发：`src/design/AnchoredPopover.tsx` 14 天内已有 2 个 fix（bc45ad4b3 react19 类型、879aa9156 表结构），本次是第 3 个（V-1039 评审的键盘回归）。按 `docs/engineering/direction-check-template.md` 写。
> 来源是逃逸账本的修复：结账挂的类级检查 = 铁律 ⑫（`tests/ux/full-walk/catalog.mjs`），键盘合同由 `tests/ux/storyboard-popover-keyboard.test.mjs` 遍历四个 Portal 弹层。

### 0. 一句话根因

`AnchoredPopover` 把浮层 Portal 到 body 末尾，却只负责「放哪、怎么关」，不负责**焦点**——浮层不在触发器后面的 DOM 顺序里，Tab 进不去，关闭后焦点也不回触发器；每个把弹层挪进 Portal 的人都会丢一次键盘可达性。

### 1. 归类表：bug → 直接原因 → 类

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| bc45ad4b3 react19 JSX 类型 | 升级后类型收窄 | 依赖升级（无关） |
| 879aa9156 表结构：弹层原地 absolute 被表格裁掉 | 弹层没走 Portal | 浮层定位（已修，是这次迁移的起因） |
| V-1039：「用作…」菜单、片段菜单 Tab 进不去 | 迁进 Portal 后浮层脱离 Tab 顺序，AnchoredPopover 没有焦点进入 / 回还 | **共享浮层缺焦点管理**（行 ⋯ 菜单原本就有同一缺口） |

### 2. 为什么这一类会一直出现

定位（Portal）和焦点是同一件事的两半，共享层只做了前一半。于是「逃出裁切」的每一次迁移都会把键盘用户留在原地，而各菜单又倾向于自己补一段（底栏 ⋯ 早就在自己的 `closeOverflow` 里补了「焦点还给 ⋯」），补法各不相同。

铁律：⑫ 点了=以为的——键盘用户按 Enter 以为打开了菜单、Tab 以为走进菜单。

### 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 下一个迁进 Portal 的弹层（如参考槽、画布节点浮层）同样 Tab 进不去 | `pnpm exec vitest run tests/ux/storyboard-popover-keyboard.test.mjs` 往清单里加一行 |
| 各菜单继续各自补焦点回还，行为不一致 | `git grep "\.focus()" src | grep -i menu` |

### 4. 靶子独立性检查

靶子是评审线（V-1039，与实现线不同）按真实键盘复现出来的，不是实现线自己写的；本线新加的键盘合同测试对「关掉 `managesFocus`」变异必红（4/4 红）。既有 `storyboard-delete-undo` 10 条（#1029 的编辑器表面归属判据 `root.contains(el) || el === lastEditorFocusRef.current`）是独立靶子，本次改动后仍全绿。

### 5. P0：这些是我们独有的吗？现成方案有哪些

不是领域能力。仓库里没有直接依赖的焦点库：`@floating-ui/react`（`FloatingFocusManager`）未安装；Radix 的 `react-focus-scope` 只是 `@radix-ui/react-dropdown-menu` 的传递依赖，不是直接依赖。`AnchoredPopover` 本身（定位、翻边、点外面关）也是自写的通用能力，未登记在 `self-written.json`。

### 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 把 `AnchoredPopover` 整个换成 `@floating-ui/react`（定位 + `FloatingFocusManager`） | 新增直接依赖（供应链 pin、包体）、12 个消费者逐个回归 | 面大，不是这个 PR 的范围 | 后续单独做（和定位一起换才划算） |
| 补 | 在 `AnchoredPopover` 一处加 ~25 行非模态焦点管理：打开聚焦、浮层内 Tab 循环、关闭还给打开前的元素；悬停预览（`passThrough`）和自己管开合的浮层不碰 | 小 | 对其他有 `onClose` 的消费者行为有变（焦点进浮层）；已跑设计层单测与分镜键盘清单，未逐面走查 | **本次采用**：一次修好四处，不让各菜单各补 |
| 重写（限一个模块） | 同接入 | | | 否 |
| 删 | 去掉 Portal 退回原地 absolute | 又被表格裁掉 | 回到 879aa9156 之前的 bug | 否 |

### 7. 用户要权衡的核心

共享浮层要不要对**所有**可关闭的浮层默认接管焦点（本次是），还是做成按消费者开关；默认接管换来一致，代价是其他面（素材选择器、转场选择器、同步徽标、画布浮层）的键盘行为也变了。

## 特征测试清单

- `tests/ux/storyboard-popover-keyboard.test.mjs`：四个 Portal 弹层（行 ⋯、用作…、片段菜单、底栏 ⋯）遍历：打开 → 焦点进浮层 → Tab / Shift+Tab 循环 → Esc 关 → 焦点回打开前的元素。
- `tests/ux/storyboard-delete-undo.test.mjs`（10 条）：#1029 的编辑器表面归属不被破坏。
- `tests/ux/storyboard-table-structure.walk.mjs`：真窗口里 Esc 关闭「用作…」与片段菜单。
