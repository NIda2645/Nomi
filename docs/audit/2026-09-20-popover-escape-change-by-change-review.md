# AnchoredPopover 内部 Escape 全量审计修复

工作树：`/Users/aoqimin/Desktop/Nomi-image-aspect-20260920`。只修改该共享组件、既有 Escape 根因合同/方案、`tests/ux/_feel.browser.mjs`。没有修改媒体 measurement 文件、没有提交或推送。

## 发现与原审计纠正

前一轮预设报告说“未发现当前新增阻断缺陷”，只重跑了既有 Escape 九子例。其中“prevented”在派发前调用 preventDefault，不能证明真实 input 的 onKeyDown 收到按键后仍能声明所有权。全量对抗复核发现先前修正 `8b6806df8` 的 document capture 把内部输入控件的 Escape 提前吞掉。此项是确认回归，本次补红测并修正，不能继续引用旧报告当作完整无缺陷证明。

旧流程分两代：

1. document bubble 关闭太晚：React Portal 冒泡先让 React Flow NodeWrapper Escape 取消节点选中，composer 卸载。
2. 无条件 document capture 关闭太早：真实内部 input 的取消编辑/清空搜索处理器根本收不到 Escape。

正确事件顺序必须是“内部控件 → 当前浮层 → 外层节点”；触发器等外部焦点没有 portal 冒泡路径，所以仍需在 document capture 拦住 React Flow。

## 每段生产修改的旧/新与理由

| 位置 | 旧实现 | 新实现 | 依据 |
|---|---|---|---|
| `src/design/AnchoredPopover.tsx:121` | 关闭判据嵌在无条件 document capture 回调 | 提取一个 `dismissOnEscape(KeyboardEvent)`，返回该事件是否属于本层；更上 popup/dialog 返回 false，IME/已prevent返回 true但不关闭，其余 consume+close | 两种事件路径共用唯一所有权政策，不写两套例外。返回值让下层保持对上层的让位。 |
| 同文件 `:139` | 所有 focus 的 Escape 都在 capture 执行 | event.target 位于自身 portal DOM 内则暂不处理，让 target handler先跑；外部仍在 capture 调同一判据 | 保留 natural/trigger 焦点下 RF 不 deselect，同时修复 input无法先清空的回归。 |
| 同文件 `:171` | 没有 portal React keydown 边界 | 自身 DOM 子控件事件冒泡到 portal时，先调用同一判据；属于本层才停止 React 冒泡 | 子控件 preventDefault 不关闭且不能继续影响节点；stopPropagation则自然不会到这里。其他 portal 的事件不是自身DOM，不截获。上层拥有事件时继续交上层。 |
| 监听 effect依赖 | anchorRef/onClose | 加 shared callback依赖 | 注册与清理的 native capture监听仍成对，避免闭包陈旧。mousedown外点/定位/尺寸/样式均不变。 |

## 先红后绿证据

第一轮新增三条实际事件测试，在旧无条件 capture 上全部失败（浮层提前消失）：

- React input 只 preventDefault，自行清空 draft。
- React input 只 stopPropagation，自行清空 draft。
- native input target listener preventDefault，并写入“handled”。

红日志：`/tmp/nomi-popover-input-escape-red.log`。并非预先标 prevented 的合成事件冒充真实控件事件。

第一版补丁在 portal bubble 无条件 stopPropagation，还被新对偶测试抓出两条失败：上层 listbox/dialog 打开，但焦点仍在下层 input 时，上层 document bubble listener 收不到 Escape。红日志：`/tmp/nomi-popover-layer-focus-red.log`。最终改成共享判据返回本层 ownership，属于上层就不拦 React 冒泡。

最终同一真实 AnchoredPopover + React Flow + Chromium 矩阵 **14 子例全部通过**（node:test含父项统计15）：

- 原 natural/trigger/menu-button/input 四焦点关闭本层而保持节点选择。
- 内部 preventDefault / stopPropagation / native prevent 三条。
- 嵌套 listbox/dialog 两条。
- 上层存在但焦点保留下层 input 两条。
- IME、派发前已prevent、外点三条。

绿日志：`/tmp/nomi-popover-input-escape-green.log`。完整 `_feel.browser.mjs` **27测试通过**，日志 `/tmp/nomi-popover-feel-full.log`。

## 合同与同类入口

重新跑 `node scripts/door-map.mjs src/design/AnchoredPopover.tsx`，仍为七门（props、designlab、assets、storyboard、node presets、project sync、timeline），原合同门表不造假缩减。更新原合同 symptom/direct_cause/class_root/invariant/shared boundary/prevention/legacy，明确替换无条件 capture，子控件优先。

方案同步写明第一次修复漏掉了“事件到达 target 后才prevent”的测试，记录两轮反例和最终修正。无新数据迁移或依赖升级。

## 验证

- 真实浏览器 Escape矩阵14子例通过，feel整文件27测试通过。
- `pnpm exec eslint src/design/AnchoredPopover.tsx` 通过。
- App TypeScript noEmit检查通过（在第一版内部路由补丁上跑，最终更改为boolean ownership返回；最终构建与父任务gates复查）。
- `pnpm run check:root-cause-contracts` 通过：48 checker自测和所有合同形状检查；最后changed-path检查当前未提交diff报“无高风险生产路径变化”，所以不把它冒充父任务staged/committed全diff合同覆盖证明。
- 一次构建因构建期间补写plan导致 sourceIdentity变化被正确拒绝；已冻结工作树后重跑，不绕开构建戳保护。最终构建/smoke结果后附。

## 剩余边界

真实Chromium与macOS Electron不能替代Linux CI原失败环境；父任务应保留Linux smoke为合并条件。本次没有布局或视觉设计变化，没有把焦点重新选回节点作为补丁，也没有放宽任何既有测试断言。

## 最终实际结果

- 冻结源码后 `pnpm run build` 退出0。日志 `/tmp/nomi-popover-input-escape-build.log`。
- 当前构建真实 `node tests/ux/smoke.e2e.mjs` **SMOKE PASS: 17 assertions**，退出0。日志 `/tmp/nomi-popover-input-escape-smoke.log`。
- smoke含短/长/拥挤/窄节点 × light/dark 预设开关、Escape后保留 composer和节点选择；证据 `outputs/canvas-smoke/fixed-footer/` 与 `artifacts/feel/smoke-ae8377ca-52fc-4562-a3ac-51e6590df827/`。feel ratchet有既有finding记录，不能说全应用零视觉债；测试没有忽略异常退出。
- 已通知父任务放行media工作树，父任务统一交付到PR825，未另开gates。
- 最终稳定源码再次 `pnpm exec tsc -p tsconfig.app.json --noEmit` 退出0，覆盖ownership boolean返回后的最终实现。

最终桌面复核：冻结源文件后构建成功，真实 macOS Electron smoke 17 assertions 全部通过，日志 `/tmp/nomi-popover-input-escape-smoke.log`。Linux 原失败环境仍由 PR CI 核验。
