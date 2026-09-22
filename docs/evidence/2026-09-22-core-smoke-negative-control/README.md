# 核心流程冒烟：阳性对照与稳定性实测（2026-09-22）

方案：[`docs/plan/2026-09-22-core-flow-smoke-three-defenses.md`](../../plan/2026-09-22-core-flow-smoke-three-defenses.md) 验收门 1 与 3。

结论先写：**阳性对照通过**（回退 #836 的生产修复后，两种夹具都红，且红在用户报的那三件事上）。
**但验收门 3 不成立**：修复在位时 `used` 夹具**不稳定**，同一份代码同一条命令连跑 5 次只有 1 次全绿。
两件事分开记，后一件不因为前一件好看就略过。

## 被测与环境

- 分支 `test/core-smoke-defense-20260922`，阳性对照在 `54381cbcd`，稳定性实测在合入 `origin/main`（#840）之后的 `9e3d1e498`。
- 两次之间**生产代码逐字未变**：`git diff e34a59df2..9e3d1e498 -- src/ electron/` 为空。期间的改动只有一份 docs JSON（#840 的到期日）、`canvas-drag-pan-gestures.walk.mjs` 的语言参数化、以及 `fixture.mjs` 里一行语义等价的收缩。
- 真 Electron + 真构建产物，macOS arm64，零额度，未注入 store。`empty` 夹具窗口 1440×831，`used` 夹具 1280×800、时间轴展开、Agent 面板打开。
- 每轮都先 `pnpm run build`，否则跑的是上一轮的产物。

## 一、阳性对照：回退 #836 的生产修复

只按文件回退 `data-dragging` 标记的三个 owner，回到修复前的 main `195bf3a2cb3e087b709ac2fa942f1983e1989bd9`：

```
src/workbench/generationCanvas/components/canvasDraggingFlag.ts
src/workbench/generationCanvas/components/useCanvasSelectionDrag.ts
src/workbench/generationCanvas/reactFlow/GenerationCanvasReactFlowViewport.tsx
```

共 −59/+6 行。**没有用 `git revert` 整条回退**，因为 #836 的生产文件里有两个（`useCanvasShortcuts.ts`、`GenerationCanvasReactFlow.tsx`）也被本分支的 ⌘Z 归属修复改过，整条 revert 会把本分支的改动一起掀掉，测到的就不再是「#836 的修复没了」。全程未提交，跑完 `git checkout -- .` 恢复，树回到 `7ce05a500`。

**结果：两种夹具都红，0/2。** 原始 summary 见 `negative-control-empty.json`、`negative-control-used.json`。

| 夹具 | 通过 | 时长 | node-params 失败条数 |
|---|---|---|---|
| empty | 0/2 | 122.2s | 13 |
| used | 0/2 | 131.5s | 14 |

红的条目**逐条对上用户 09-22 报的三件事**，不是泛红：

- 根因本身：`G2 平移后 150ms 内点卡：画布卡在拖动态 — {"dragging":"true"}`、`G3 …点空白`，`used` 另有 `G6 …接滚轮`。
- 报障①「composer 不出现」：`P1 空图片卡选中后生成浮框看得见`、`P1 参数条（浮框底栏）看得见`、`P1 参数条按钮点得到`、`P2 生成过的卡选中后生成浮框看得见`、`P2 卡上浮条看得见`。
- 报障②「「2 版」托盘打不开」：`P3 点「2 版」弹出结果托盘（看得见）`、`P4 在托盘里切到第 1 版`、`P5 下载这一版写出非空文件`。
- 报障③「编组框删不掉」：`F2 点空框：框本身被选中`、`F2 选中空框按 Backspace 删掉`。
- 两种夹具的 `canvas-drag-pan-gestures` 都在同一句上中断：`平移档：平移松手后 150ms 内点卡，画布不卡在拖动态 — data-dragging=true`。

**`used` 比 `empty` 多抓到一条**（`G6 平移后 150ms 内接滚轮`）。这是「用过的项目」这一遍自己挣来的那一条，不是复制品。

轴③（编组框删除入口那五个文件）未执行——轴①②已经把三件报障全部复现，轴③的增量只在「框菜单删除入口」，留待需要时再做。

## 二、修复在位时的稳定性：`used` 夹具不稳定

同一份代码（`9e3d1e498`）、同一条命令，逐次记录，不挑好看的：

| 夹具 / 语言 | 跑了几次 | 结果 | 说明 |
|---|---|---|---|
| empty / zh-CN | 1 | **2/2**（49.0s） | `fix-in-place-empty-zh-CN.json` |
| empty / en | 1 | **2/2**（48.9s） | `fix-in-place-empty-en.json` |
| used / zh-CN | 5 | 1/2、1/2、**2/2**、0/2、1/2 | 5 次里 1 次全绿 |
| used / en | 2 | 1/2、1/2 | 0 次全绿 |

`empty` 两种语言都稳。**不稳的是 `used`**，而且三种失败各有出处，都是方案「实测发现」里已经记下、但**本 PR 没有修**的那几条小窗布局问题：

1. **T-CV-19（批量生成栏压住缩放条）** — `canvas-drag-pan-gestures` 点左下角「适应视图」时超时，Playwright 报的拦截者逐字是
   `<div role="toolbar" data-batch-dock="true" aria-label="Canvas batch generation" …> subtree intercepts pointer events`。
   **英文界面更容易撞上**：芯片文案 `Images ×9` 比 `图片 ×9` 宽，居中的栏铺得更开，于是 en 两次都撞、zh 间歇撞。
2. **T-CV-20（浮层贴边被 clamp）** — `node-params` 的 `P4 在托盘里切到第 1 版` 点不到：
   `它的中心点 {"x":85,"y":179,"width":11,"height":11} 上画的是 button.grid.size-8.min-h-8，不是它自己`。
   截图（`tests/ux/shots/node-params-and-version-pill/run-used-zh-CN/02-version-tray.png`）里看得很清楚：两版卡被「适应视图」挤到画布左缘，结果托盘被 clamp 回视口，和卡**自己的浮动工具条**叠在一起。
3. **T-QA-21（警告 toast 盖住弹窗控件）** — `canvas-drag-pan-gestures` 关设置弹窗时超时，等的是
   `getByRole('dialog', { name: '设置' }).locator('[data-settings-close]')`。走查里有 `clickPastToasts` 兜底，但它本身是时序相关的，不保证每次都躲开。

三条走查侧的绕法（先收起批量栏、先点掉 toast、先收起小窗与地图）都已经写在走查里，但都是**时序相关**的绕法：控件什么时候出现、栏铺多宽、toast 什么时候挂上来，每一轮都不完全一样，所以绕法本身会间歇失手。

### 试过但回退了的补救

本轮试过两处走查侧加固，跑完发现把事情弄得更糟，已全部回退、未进提交：

- 把批量栏的收起抽成 helper，在三处缩放条点击前都先调一次 → en 变成在**关设置弹窗**那一步超时（把拦截点往后推了一站，没解决）。
- 给 `node-params` 加 `centerNode('stack')`，开托盘前先把卡拖到画布中段 → zh-CN 变成 `两版卡没选中`（多一次平移之后，紧接着那一下点击被吞）。

记在这里是为了让下一个人不必再试一遍同样的两条路。

## 数字的边界

- 「5 次里 1 次全绿」是 `used` / zh-CN 的观察，不是失败率估计——样本只有 5。`used` / en 只跑了 2 次，两次都不全绿，同样不足以给出比率。
- 阳性对照的 `0/2` 是确定的：两种夹具各跑一次，都在同一族断言上红；没有跑第二次，因为回退掉的是根因本身，不存在「这次恰好不红」的余地。
- 上面所有「T-CV-19 / T-CV-20 / T-QA-21」的归因，依据是 Playwright 报出的**拦截者 DOM 原文**与截图，不是从现象推测的。
- `empty` 的 2/2 各只跑了一次。它没表现出不稳，但一次不足以称之为稳定。

## 这对方案意味着什么

验收门 1 成立：这套冒烟**确实拦得住** 09-22 那次回归，而且 `used` 夹具比 `empty` 多守住一条。

验收门 3 不成立，并且它挡住的不只是一份报告：按本 PR 的设计，`Core Flow Smoke (used)` 是**每个非文档 PR 的必过门**，`delivery:verify-merged` 还要求它在 merge SHA 上**恰好是 success**（skipped/neutral 都拒绝）。把一条 5 次只绿 1 次的检查装到这两个位置上，等于让后续每个 PR 和每张合入收据都押在掷骰子上——这正是本 PR 想根除的「假绿 / 假红」。

所以 `used` 这一遍要么先把上面三条小窗布局问题修掉（产品侧，超出本 PR 的「不动生产代码」范围），要么改成不把它当阻断门，由用户拍板。**在拍板之前不推这条分支。**
