# 结构评审：制作镜头小标这一刀碰到的两个热模块（2026-09-30）

> 状态：✅ 已评审，结论：不是这两层又坏了一次，这一刀是把一个 owner 的回答补全；不再为这件事另开修复。
> 触发：S5 画布落地回归修复（合同 `docs/fixes/2026-09-30-shot-phase-every-state-has-a-marker.root-cause.json`）的 `check:symptom-cluster`：`src/workbench` 与 `tests/ux` 在 7 天窗口里都到了第 3 份以上。
> 上一份同类评审：[`2026-09-29-hot-modules-structure-review.md`](2026-09-29-hot-modules-structure-review.md)（`src/workbench` 38 份，归到 #897 的七个结构簇）。

## 这一刀改了什么层

规则只改在 `electron/shared`：`deriveProductionShotState`（这一镜在画布上处在哪一段）和 `shotCountsTowardBatch`（这一镜算不算这一批的活）。另外两处只是跟着 owner 走：

- `src/workbench/generationCanvas/nodes/ProductionShotPlaceholder.tsx`：把 owner 新给出的两段（等你确认 / 还没生成）画出来。它没有自己的判据，读的就是上面那个函数。
- `tests/ux` 里的两份测试：
  - `p4-s5-canvas-landing.e2e.mjs`：夹具里的「已停」还是 #934 删掉的那种猜法（Run 在跑、某个任务带 `budget_exhausted` 错因码），现在改成按生命周期 owner 的写法，由 Run 记下 `stop`。
  - `agent-draft-not-queued.walk.mjs`：它钉的是「草稿什么都不挂」，现在改成「草稿只挂还没生成」。

## `src/workbench`：为什么不是又一次投影层自己下结论

09-29 那份评审里，这一层合同多的第一组原因是「生成 / 制作投影：渲染层替主进程重新判断」。这一刀的方向正相反：

- 以前 owner 在三种真实状态下回 `null`，渲染层只好什么都不画；
- 另一种状态（没有任务）owner 回的是「排队中」，是一句不会兑现的话。

现在每一种状态都由 owner 给出一段，渲染层只按段画，不再判断。这个方向就是 P0-2「投影层自己下结论」的收敛方向，不是在它上面再打一个补丁。

## `tests/ux`：三份合同不是同一个缺陷

窗口里的三份：

| 合同 | 起因 |
|---|---|
| 09-24 连线环死路 | 画布手势 |
| 09-24 Windows 主守卫静默变绿 | 测试工具在 Windows 上的判定 |
| 本次 | 测试夹具编码了产品已删掉的猜法 |

三件没有共同的结构原因。本次在 `tests/ux` 里只动了夹具和断言，按产品现在真实会出现的两个画面取证：在跑的批次、停下的批次。夹具里「同一批上既排队又已停」那种 Run，在产品里造不出来。

这一类问题「测试把某个 owner 的旧答案写死在夹具里」的防线，是让 owner 的回答成为封闭词表（`ProductionShotPhase` 由 `check:vocabularies` 管成员），每一段各有一个 DOM 标记。这样测试断言的是 owner 的段，不是某一种画法恰好画出了东西。

## 处置

- 不另开结构性修复：规则已经收在 owner 里。付费卡①（逐镜决定）在同一个 owner 上补「已去掉，不生成」，并把「卡正摆着」改成读这一次出价，不读 `cardHidden`。
- #934 的 Canvas Acceptance 被验证范围分类器判成跳过。这个漏洞归协调会话的待办，不在本次处理。
