# win32 走查 j5「提示词与重新生成控件同时可操作」塌陷 —— 根因与修法

日期：2026-08-26 ｜ 触发：`evals/journeys/j5-edit-export.mjs` `reopen-project` 里程碑在 Windows 上确定性失败，Linux 一直绿。

## 1. 现象与实测

Windows 实测（多次逐位相同）：

```
promptVisibleHeight: 0        primaryActionWithinCard: false
composer: {top: 636.3, right: 869.66, bottom: 662.30, left: 290.34}   -> 高 26
stage:    {top: 88,    right: 1100,   bottom: 719,    left: 60}       -> 1040 x 631
```

同一里程碑里「prompt 没丢」「有重新生成入口」「悬浮编辑器在画布内」三条**通过**——元素都在、都渲染，
只是卡片塌成一条缝。注意 Playwright 的 `isVisible()` 只看包围盒非空，被 `overflow-hidden` 裁掉的按钮
**照样报 visible**，所以那两条通过不构成「没问题」的证据。

## 2. 排除与证伪（先量，别猜）

**26px 不是巧合，是卡片的结构性下限。** 独立 Chromium 探针量卡片盒模型：`padding 12+12 + border 1+1 = 26`，
content box **0**。把 `max-height` 夹到 20 仍渲染 26。这精确解释了 `promptVisibleHeight: 0` 与底栏被裁到卡外。
**推论**：观测到的 26px **不能反推 `availableBelow`**——任何 ≤26 的 maxHeight 都渲染成 26。

**已证伪的假说：`scrollHeight` 反馈环是本次根因。** 曾怀疑 `useComposerViewportPlacement.ts:177` 用
`card.scrollHeight` 判「卡片需要多高」，而同一段代码正在夹这张卡，且提示词区是 `flex-1 min-h-0 overflow-y-auto`，
夹小后 scrollHeight 会跟着塌 → 代码误以为「装得下」。**实测部分证伪**：夹到 26 时 scrollHeight 仍为 62（不塌到 26）；
真机测到的是 118 vs 真实 191（污染 39%，**是真缺陷但不是本次根因**）——把两个值分别喂回
`resolveComposerViewportGeometry`，`aboveFits/belowFits` 都是 `false/false`，落进同一分支、选同一侧，结论不变。
（该污染在 stage 1620×635 时确实会把本该发出的 pan 请求压掉，故仍需修，见 §4.2。）

**已证伪：不是 Electron 43 回归**（单变量对照见 `docs/plan/2026-08-24-electron-31-to-43-upgrade.md` §9.8）。
**已证伪：不是断言写错**——`prompt-input` 与 `重新生成` 确实在 composer-card 子树内（`j3-first-success.mjs:65`
即以 composer 为根查 prompt-input），断言量的是真问题。

## 3. 根因：三重挤压，没有一条单独致命

mac 上复刻成功（**把 stage 做到 1040×635，与 win32 的 1040×631 同构**），17 组测量：

| stageW×H | cardH | cardScrollH | 真实 scrollH | maxHeight | flipped | promptVisH | actionInCard |
|---|---|---|---|---|---|---|---|
| 1620×785 | 193 | 191 | 191 | 259 | false | 38 | true |
| 1620×635 | 118 | 118 | 191 | 118 | false | 38 | true |
| 1340×635 | 72 | 118 | 191 | 72 | false | 11 | **false** |
| **1040×635** | **63** | 118 | 191 | **63** | false | **2** | **false** |

**只缩高度复刻不出来**（1620×635 仍 118px 全绿）。**stage 宽度才是被忽略的变量**：

1. **win32 少 32px 高**——`frame: false`（`electron/main.ts:296`）+ 自绘 windowbar（`WorkbenchShell.tsx:191`，`h-8`），
   mac/Linux 走原生 chrome 不渲染它。这一条只是把余量推到悬崖边。
2. **窄 stage 把折叠时间轴把手推进 composer 的水平区间**——把手 `absolute bottom-3 left-1/2`
   （`GenerationWorkspace.tsx:119`）。stage 宽 1040 时它落在 `left:488.2, right:671.8`，与 composer
   （`left:158.7, right:641.3`）重叠 → `getUnobstructedComposerSpaceBelow`（`nodeSizing.ts:72`）把下边界夹到把手顶边，
   `spaceBelow` **144 → 89.5**。stage 宽 1620 时把手在 `left:778.2`，不重叠、不夹。
3. **上方更窄，翻上去也救不了**——`aboveClearance` = 浮动工具条 42 + 间距 18 = 60，
   `availableAbove` 只剩 **56**，比被夹后的 `availableBelow` **65.5** 还小。所以代码
   **选下方是对的**，`data-flipped` 全 17 组都是 `false`，不是翻转逻辑坏了。

**逃生口是有阈值地死的**（这条我先记错过，实算后更正）：`resolveComposerViewportPanDelta` 把
「这一侧能装下多少 composer」（`availableAbove/Below`，已扣掉边距与 60px 工具条让位）
当成了「画布还能往那个方向平移多远」。两者不是一回事——往上推节点换下方空间时，
`aboveClearance` 那 60px 压根不该参与。实算（`availableAbove:56, availableBelow:65.5`）：

| needed | moveUp | 旧规则 canMoveUp | 旧返回 |
|---|---|---|---|
| 118（卡片被夹后的自测量） | 52.5 | ✅ 52.5≤56 | **-52.5（会推）** |
| 150（最小可用高度） | 84.5 | ❌ 84.5>56 | **0（放弃）** |
| 191（真实内容高度） | 125.5 | ❌ 125.5>56 | **0（放弃）** |

即缺口一过 ~121.5 就整个放弃，而**真实上移余量是 `spaceAbove - 12 = 128`，本来推得动**。
两个缺陷在此咬合：需求高度被夹小的自测量压到 118（§4.2），恰好落在旧规则还肯动的区间里，
于是它推了一小步、卡片停在 63px 的「不可用但代码认为已满足」状态；一旦需求按真实值算，旧规则又直接放弃。
**必须两条一起修**，只修任一条都会停在另一条的坑里。

## 4. 修法（都在根因层，不是调阈值）

### 4.1 平移余量算对（主根因）
`resolveComposerViewportPanDelta` 改吃 `headroomAbove/headroomBelow`（= `spaceAbove/Below - VIEWPORT_MARGIN`，
即节点还能移多远且不出视口），与 `availableAbove/Below`（该侧装得下多少）彻底分开。
并且**允许部分平移**：够不到完整需求时也推到极限（`min(缺口, 余量)`），而不是全有全无地放弃。
部分平移不会来回抖：推到极限后 headroom 归零 → 下轮 delta = 0，自然收敛。

### 4.2 需求高度不再取自「被自己夹过的」测量
`contentHeight` / `neededScreenHeight` 下限拉到最小可用高度。仓库里已有做对的先例——
`AutoGrowTextarea.tsx:16` 先 `height='auto'` 再读 `scrollHeight`。这里不采用「先解夹再测」是因为
recompute 挂在 ResizeObserver 上、依赖里还有 canvasZoom/canvasOffset，每次都强制重排属于重活（R17）。

### 4.3 卡片永不渲染成不可用的缝
把重复两处的魔数 150（`NodeGenerationComposer.tsx:547` 的 `min-h-[150px]` 与 `:557` 的
`Math.min(150, maxHeight)`）收敛成单一真相源 `COMPOSER_MIN_USABLE_HEIGHT`，并给 `maxHeight` 兜底。
`Math.min(150, maxHeight)` 正是「允许塌到不可用」的那道逃生口，按 P1 同 commit 删掉。

## 5. 「这类还能从别的入口出现吗」

**能，而且与平台无关**——mac 上已复刻。触发条件是「垂直空间紧 + 把手与 composer 水平重叠」，
入口至少还有：小窗口（窗口下限 1100×720）、展开侧栏挤窄 stage、节点贴近视口边缘、时间轴展开态。
win32 只是恒定少 32px，离悬崖最近。

结构保证（不靠自觉）：
- `resolveComposerViewportGeometry` / `resolveComposerViewportPanDelta` 是纯函数，直接用 win32 实测几何写单测钉死。
- 走查加一条**把窗口缩到下限**的断言（`composer-usable-at-min-window`）——**这条在 Linux CI 上就能红**，
  不再依赖有没有 Windows job。这是本轮最重要的一条：原断言 2026-08-17 就在，红了 9 天没人看见，
  根因是 CI 没有 Windows job，而**把复现条件做成平台无关**比补一个 2x 计费的 Windows job 更根治。

  钉在 `BrowserWindow` 的 `minWidth`/`minHeight`（1100×720）而非硬编码 `1040×631`：
  「我们承诺支持的最小窗口下 composer 必须可用」这个断言随 UI 演化仍然成立，
  而硬编码的 stage 尺寸一旦外壳改动就会**悄悄不再复现**（假绿），比不写还危险。

## 6. 修后实测（mac，每档独立冷启动，避免继承上一档挣来的平移）

| 窗口 | stage H×W | cardH | promptVisH | actionInCard | 平移事件 | offsetΔY | cardBottom−stageBottom |
|---|---|---|---|---|---|---|---|
| 1680×1050 | 787×1620 | 193 | 38 | true | `[]` | 0 | −80 |
| 1680×700 | 635×1620 | 191 | 38 | true | `[-82]` | −82 | −12 |
| 1340×700 | 635×1280 | 191 | 38 | true | `[-127.5]` | −127.5 | −57.5 |
| **1100×700** | **635×1040** | **191** | **38** | **true** | **`[-127.5]`** | **−127.5** | **−57.5** |
| 1100×720 | 635×1040 | 191 | 38 | true | `[-127.5]` | −127.5 | −57.5 |

塌陷几何（1040×635）修前 `cardH 63 / promptVisH 2 / actionInCard false` → 修后 `191 / 38 / true`。

**两半都吃劲，各管一段，缺一不可**（这点我先写反过，按实测更正）：

- **空间够挪时，是平移在救**：上表 1100×700 一档 `styleMaxHeight` 解析到 191、卡片取自然高度 191，
  下限 150 完全没绑定；真正让它可用的是 §4.1 修好的避让平移（画布 `matrix(...,0,0)` →
  `matrix(...,0,-127.5)`，节点从 y≈196 滑到 y≈68.5）。
- **挪到头还不够时，是下限在兜**：窗口下限 1100×720 一档实测
  `spaceAbove: 12`（**恰等于 `VIEWPORT_MARGIN`，即已经推到极限、一格不剩**）、
  `cardHeight: 150 = styleMaxHeight = styleMinHeight`，卡片正是被下限撑住的，
  而 `scrollHeight 148 < 150` → 内容一点没裁。这一档若只有平移没有下限，仍会塌。

`cardBottom − stageBottom` 每一档都是负的（最紧 −12），卡片没有越出 stage 底、
不存在「够高但被画布裁掉」的假绿。

## 7. 验收
- [x] 单测钉死 §4.1/§4.2/§4.3（14 条绿）
- [x] mac 复刻几何（1040×635）下修复生效，截图人眼确认提示词两行 + 底栏（含深色圆形 ↑ 钮）完整在卡内
- [x] 新回归里程碑 `composer-usable-at-min-window` **已验它会红**（R17 纪律：门岗不验红等于没有门岗）。
      同一走查、只 stash 掉 `src/workbench/generationCanvas/nodes/` 的修复再跑：

      | | cardHeight | promptVisH | actionInCard | flipped | 结果 |
      |---|---|---|---|---|---|
      | 有修复 | 150 | 38 | true | false | 3/3 通过 |
      | 撤掉修复 | **70** | **9** | **false** | **true** | **2 条红**，journey exit 1 |

      注：撤掉修复那次是**翻上去后再夹到 70**（`spaceAbove 162.7 / spaceBelow 40.3`），
      与 win32 的 26px 形态不同但同类——都是「卡片还在、控件被 overflow-hidden 裁到卡外」。
      同跑的 `reopen-project` / `export-mp4` 仍绿，说明红是这条里程碑挣来的，不是连带塌方。
- [x] 新里程碑插入后 j5 其余里程碑不受影响：`modify-project` 3/3、`reopen-project` 4/4、
      `export-mp4` 3/3（真导出 MP4，ffprobe 读到 h264 1920×1080 2.0s）——窗口缩放后已还原，没漏给后续里程碑
- [x] **Windows CI 实测：原 bug 已修**（run 32976642835）。`reopen-project` 4/4 通过，
      stage 与原报告逐位一致（`{top:88, right:1100, bottom:719, left:60}`）：

      | | cardHeight | promptVisH | actionInCard |
      |---|---|---|---|
      | 原报告 | 26 | 0 | false |
      | 修后 win32 | **150** | **38** | **true** |

      win32 实测 diag 同时坐实了 §3 的三条：`hasWindowbar: true`（自绘标题栏在）、
      `timelineHandle.top: 673.5`（**先按 CSS 推的是 673**，实测 673.5；水平区间 491–669
      与 composer 290–870 确实重叠）、`spaceAbove: 12`（**恰等于 VIEWPORT_MARGIN =
      已推到极限**）、`cardHeight 150 = styleMaxHeight = styleMinHeight`（下限兜住）。
      即 win32 走的正是「平移推满 + 下限兜底」这条路，与 §6 窗口下限那一档同构。

- [x] **Windows CI 整条 job 转绿**（run 32977630678：`pass@1: 2/2 · infra 错误 0`，
      j5 四条里程碑全过，含 `export-mp4` 真导出）。截图已人眼确认：composer 满高渲染，
      模式行 / 提示词区 / 底栏深色圆形 ↑ 钮都在卡内。

## 8. 首轮那条红其实是工装在骗人（已由 #182 独立进 main）

首轮 win32 run 整体红，但红的是 `export-mp4`：
`infra error: ENOENT ... nomi-export-*.partial.mp4`。这**不是导出坏了**，是走查自己的两个 bug 叠着：
① ffmpeg 在写的临时文件命名为 `<final>.partial.mp4`，同样 `endsWith(".mp4")`，必被当成品捞进来；
② `filter` 与 `sort` 各 stat 一次，ffmpeg 在这两次之间把它改名成最终名，第二次 stat 直接 ENOENT
抛穿，被 harness 记成 infra error。属于「harness 的 catch 把自己的 bug 洗成产品结论」那一族。
全平台都在，Windows 只是导出慢、正好把竞态窗口撞开。

修法（排掉 `.partial.`、stat 只做一次随条目带走、容忍竞态中消失）本轮曾从侧分支 `d33d4660` 搬过来，
但 2026-08-26 当天 **#182 已把它独立并进 main**，故本分支 rebase 后不再重复携带——
`latestExport` 与 `win-gate.yml` 两处都与 main 逐字一致，本 PR 只留 composer 修复本身。

## 9. 一条要说清的局限：新里程碑在 GH Windows runner 上是退化的

`composer-usable-at-min-window` 在这次 win32 run 里量到的几何与 `reopen-project`**逐位相同**
（composer top 均为 548.800048828125）。原因是 **GH windows-latest 上窗口本来就已经贴着下限**：
`stage.bottom 719` 反推窗口内容高 ≈720 = `BrowserWindow.minHeight`，
即 harness 的 `setBounds({1680,1050})` 早被 runner 的显示尺寸夹死，我再 setBounds(1100,720) 什么也没变。

**这同时是「为什么只有 Windows 红」的更准确答案**：不只是那 32px 自绘标题栏——
是 GH Windows runner 把窗口压到了下限，而 Linux 的 Xvfb 给足 1680×1050 从来碰不到悬崖；
32px 标题栏只是让同样的 720 内容高在 win32 只剩 631 的 stage。

所以这条里程碑**在 win32 CI 上不提供额外覆盖**（那台机器上它等价于 `reopen-project`），
它的价值在 **Linux/mac**——那里它是唯一会把窗口真正缩到下限的入口，且已验它会红（§7）。
两条合起来才覆盖住：win32 CI 天然在下限、Linux CI 由这条主动制造下限。
