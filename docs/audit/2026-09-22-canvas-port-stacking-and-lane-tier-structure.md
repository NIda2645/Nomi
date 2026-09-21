# 画布卡面/把手层级 + 验证分档单调性的结构评审（2026-09-22）

> 状态：📎 结构评审（`check:symptom-cluster` 触发：模块 `src/workbench` 与 `scripts` 7 天内各已 ≥3 份根因合同）
> 触发合同：[`docs/fixes/2026-09-22-card-face-over-own-ports.root-cause.json`](../fixes/2026-09-22-card-face-over-own-ports.root-cause.json)（`src/workbench`）、[`docs/fixes/2026-09-22-validation-lane-level-downgrade.root-cause.json`](../fixes/2026-09-22-validation-lane-level-downgrade.root-cause.json)（`scripts`）
> 同层近邻：`2026-09-21-connection-handle-visibility`（把手档位 owner）、`2026-09-21-timeline-handle-vertical-band`、`2026-09-12-gates-risk-tier`

## 1. 这两份是不是同一个结构问题

不是同一个模块，但是**同一个形状**：一个事实已经有唯一 owner，另一处却用**另一套词**重新回答了它，两套词在某些状态下分叉，分叉处不报错。

| 合同 | 已有的 owner | 另一套词 | 分叉的状态 |
|---|---|---|---|
| card-face-over-own-ports（`src/workbench`） | `resolveGenerationFlowConnectionAffordance` 决定一张卡的把手是磁吸带还是小圆点 | CSS 用 `data-selected` 决定卡面压不压把手 | 多选、起线进行中的起点：选中 = 真，但把手是小圆点 → 卡面把圆点正中和内半边吞掉 |
| validation-lane-level-downgrade（`scripts`） | 「整个 diff 里风险最高的文件」决定 canvas 档 | 逐文件直接赋值（最后一个文件说了算） | reactFlow 文件后面跟着普通画布文件 → full 被写回 critical，PR #833 跳过 Canvas Acceptance |

## 2. 现状（file 级，实扫）

- **卡面 vs 把手层级**：`src/workbench/generationCanvas/reactFlow/generationCanvasReactFlow.css` 里唯一一条「卡面抬到带子之上」的规则；`nodes/BaseGenerationNode.tsx` 的 `data-[selected=true]:z-[5]`（低于把手 z 8，不参与分叉）；卡面 `isolate`，所以版本胶囊/托盘逃不出卡面的层叠上下文，只能整张卡面和把手比高低。
- **走查按哪里起线**：4 份走查（group-reference-direction / canvas-batch-production / group-ports / video-depth-real-task）按 React Flow 把手元素的盒子中心按下——那是压在卡边上的 1px 测量锚点，谁拥有这条缝取决于亚像素布局，左侧确定性归卡面、右侧在 Linux 字体度量下偶尔归卡面。
- **分档**：`scripts/validation-policy.mjs` 里 canvas 是唯一多档 lane（none < critical < full），其余 lane 只会被置 `true` / `'full'`，天然单调。

## 3. 判断

- **`src/workbench`**：把「卡面压不压把手」改成读档位 owner 发布在节点壳上的 `data-connection-affordance`，选中态不再参与层级判断。结构上的教训：凡是「某个视觉/几何事实已有 owner」，样式层只许读 owner 发布的属性，不许拿更宽泛的状态（选中、hover）去近似。本单之后画布里仍按 `data-selected` 决定层级的只有 `BaseGenerationNode` 的 z 5（卡与卡之间），它不跨过把手层，不在分叉类里。
- **走查**：新增 `tests/ux/_canvasHit.mjs` 的 `findConnectionStartPoint`——人按的是看得见的「+」圈/圆点，且那一点的最顶层元素必须归这个把手，否则 fail-closed。4 份走查改用它；这是「命中几何单一 owner」文件的第四个判据，同一文件已有空白/连线/卡片/框体四个。
- **`scripts`**：canvas 档所有写入收敛到一个只升不降的 `raiseCanvas`。若将来再加多档 lane（例如 journeys 分档），应沿用同一个单调写入口，节点测试已用「两种文件顺序结果相同」锁住这一类。

## 4. 本单对这两层的交代

- 本单只做减法与收敛：删掉按 `data-selected` 抬卡面的规则、删掉三处直接赋值，不新增开关。
- 类级测试：`tests/ux/canvas-magnetic-handle.walk.mjs` 任务 05（真 `elementFromPoint`，阳性对照 main 红/修复绿）；`scripts/validation-policy.node-test.mjs`「lane levels only rise」（阳性对照旧分类器红）。
- 残留：`video-depth-real-task.walk.mjs` 需真实额度，本单未重跑；`canvas-three-gestures.walk.mjs` 在高负载下 shift 多选偶发没生效（与本改动无关：多选成立前两版层叠完全相同），另行处理。
