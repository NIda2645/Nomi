# 画布「新卡落在哪」的结构评审（2026-09-21）

> 状态：📎 结构评审（`check:symptom-cluster` 触发：模块 `src/workbench` 7 天内第 21 份根因合同）
> 触发合同：[`docs/fixes/2026-09-21-canvas-drop-at-cursor.root-cause.json`](../fixes/2026-09-21-canvas-drop-at-cursor.root-cause.json)
> 同层近邻合同：`2026-09-20-canvas-image-aspect`（卡片尺寸按真实比例）、`2026-09-20-materialization-viewport`（落地后视口跳动）

## 1. 这一簇到底是不是同一个结构问题

`src/workbench` 这个键覆盖了整个渲染层，21 份合同里大多数彼此无关（项目身份、分镜账本、转写、等待动画……）。键太粗是已知欠账（09-15 数字合同评审 §3 提议改用 `invariant_owner_layer.layer` 做键），本评审不重复论证，只看和本单**真正同层**的三份：

| 合同 | 症状 | 缺的不变量 |
|---|---|---|
| 09-20 canvas-image-aspect | 图片卡比例在恢复/缩放后走样 | 卡片几何只由真实像素比例决定 |
| 09-20 materialization-viewport | 落地分镜时视口乱跳 | 「数据同步」和「新建后展示」共用一个无条件导航副作用 |
| 09-21 canvas-drop-at-cursor | 拖入/粘贴不落在松手处、跑出视线 | 落点 = 用户指定的那一点；坐标不设正下限 |

三份共享一个形状：**「新卡在画布上的几何（位置 × 尺寸 × 视口）」没有一个主人**，各入口各自回答，且答案在卡片出生之后还会被别的路径改写。

## 2. 现状：几何被几处分别决定（file 级，实扫）

- **位置**：`store/canvasNodeActions.ts` 的 `addNode`（默认走 `resolveInsertionPosition` 避让；`exactPosition` 跳过）。`exactPosition` 由 10 个文件各自决定传不传：拖入、导入、剪贴板粘贴、切图、镜头切分、图片编辑、右键菜单等。
- **「一个点指卡的哪里」**：没有统一语义。拖入（本单）= 中心/抓取点；导入布局、粘贴 = 左上角；`nodes/nodeSizing.ts:anchorNodePosition` = composer 连接边的中点。
- **尺寸**：出生后被异步改写。图片在导入适配器里读完尺寸再设；视频在 `NodeVideoPlaybackGuard` 的 `onLoadedMetadata` 回填，改尺寸时**保持左上角不动**。
- **视口**：`getInsertionPosition`（视口 38%/28% 处）、落地后展示（`capability/multiShotCanvasLanding.ts`）、新卡露出时的自动让位，各自移动视口。

**后果（这次真机走查量到的）**：拖入视频时卡先按默认 340×280 以中心对准光标，元数据回来后缩成 340×191 且左上角不动，中心上移 44px。修对了「落点」，「尺寸改写」又把「中心」语义丢掉了，这正是没有主人的表现：谁改尺寸谁就决定锚点。

## 3. 判断

- **不是这一单能一次修掉的结构问题**，但本单没有把它搞得更糟：本单删掉了三处 ≥40 钳制和一处手写坐标换算，落点换算收敛到内核 `screenToFlowPosition` 一个来源（`components/canvasStageDrop.ts` 的 `CanvasStageDropContext.toCanvasPoint`）。
- **结构性修法（提议，未实施）**：让新卡出生时带一个「放置意图」`{ point, anchor }`（anchor 为卡面比例坐标），由一个放置层（候选：`generationCanvas/model/` 下新模块）同时拥有「出生定位」和「出生后尺寸改写时的位置补偿」。之后任何尺寸回填（图片比例、视频元数据、composer 贴边）都经它按 anchor 补位，不再各自保持左上角或各自保持边中点。收益：拖入/粘贴/导入/切图的「对准」在尺寸变化后仍成立；`exactPosition` 这个布尔开关可以被「有没有放置意图」取代。
- **为什么现在不做**：它会碰 `nodeSizing.ts` 的 composer 贴边补位和 10 个 `exactPosition` 调用方，属于多文件行为改动，按 P5/R4 要先写 `docs/plan` 并过评审；本单是用户报障的最小根因修复。

## 4. 本单对这一层的交代

- 本单只在 `src/workbench/generationCanvas/` 的落点入口做减法（删钳制、删手算、收敛到内核换算），不新增放置语义之外的开关。
- 残留风险在合同 `residual_risks` 里明写：视频卡元数据回填后中心上移（松手点仍在卡内）、非系统文件来源按默认尺寸锚定。
- 后续：把第 3 节的「放置意图」提议登记进 `docs/roadmap/TODO.md` 候选，由用户排期。
