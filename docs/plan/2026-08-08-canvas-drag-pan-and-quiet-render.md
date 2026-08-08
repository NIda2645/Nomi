# 画布：拖动即平移 · 平移不重绘 · 边标签按选中显示 · 拖动收起浮层

> 2026-08-08 用户四条真机反馈。**本文推翻 [2026-08-07 selection-first 手势方案](2026-08-07-generation-canvas-gesture-semantics.md) 的第一条结论**
> （「空白左键拖=框选」），其余结论（显式平移和弦保连线、上下文帮助面板、纯模型仲裁）全部保留。
> 推翻理由：用户真机用下来，画布的**主导作用是看图**（一屏放不下的镜头墙），框选是低频批量动作。
> 把高频动作藏在修饰键后、低频动作占默认手势，每次浏览都要按空格 = 每天别扭一百次（D1 用户摩擦优先）。
> ComfyUI / Figma / Miro 在「主体是画布内容」的场景下都走「拖即平移」，这是肌肉记忆的最大公约数。

## 四条需求（原话 → 落到什么）

| # | 用户原话 | 落成什么 |
|---|---|---|
| 1 | 鼠标拖动即可移动画布，shift 进入多选/拖多选框，滚轮以光标为锚缩放 | 手势仲裁表反转：空白左键拖=平移，Shift+左键拖=框选（追加）。滚轮锚光标缩放已是默认档，不动 |
| 2 | 拖动画布时「突出显示绘制区域」全亮，所有节点都在渲染 | ① 变换层升合成层（`will-change: transform`）→ 平移只搬像素、零重绘；② 平移期间不再每帧写 store 变换 → 节点选择器/composer 停止每帧重算与强制回流 |
| 3 | 连线标签只在选中节点时显示，默认不显示 | 边标签的显示门从「有类型就显示 + 密度折叠 + hover 揭示」改成「关联到选中节点 / 该边被激活」才渲染；密度与 hover 两套补丁一并删除（P1） |
| 4 | 节点拖动时不显示 Toolbar / Prompt Input 弹窗 | 节点外壳发布 `data-dragging`，浮条外壳与 composer 各自声明「拖动中隐身」；用 visibility 不卸载（composer 里是 TipTap 实例，卸载=丢未提交输入 + 每次拖动重建编辑器） |

## 新的手势契约（单一真相：`canvasPointerGestureModel.ts`）

| 手势 | 行为 |
|---|---|
| 左键拖空白 | 平移画布 |
| 左键点空白（位移 < 4px） | 清空选中 |
| Shift + 左键拖空白 | 框选，**追加**到当前选区 |
| Shift + 点节点 | 加选 / 减选 |
| 空格+左键 / 中键 / 右键拖 | 平移（压在节点上也生效，保留不动） |
| 滚轮 | 缩放，锚在光标（默认档；设置里可切「滚轮平移」给触控板党，保留不动） |
| ⌘/Ctrl + 滚轮、双指捏合 | 恒缩放（保留不动） |

**为什么框选恒追加**：Shift 在本产品里已经是「多选修饰键」（Shift+点节点=加选）。既然框选只能由 Shift 进入，
它就该和 Shift+点击同义 = 追加。要「只框这一批」先点空白清空（一次点击，且这个动作本来就顺手）。
不为它再发明第二个修饰键（KISS / 别逼用户学）。

## 范围

**改**
- `components/canvasPointerGestureModel.ts`（+ 测试）：仲裁表加 `shiftKey`；空白左键→pan；Shift+左键→marquee；空白目标判定选择器上收到此处（原住 useMarqueeSelection）
- `components/useCanvasViewportGestures.ts`：新增空白左键平移入口（bubble 阶段，让节点/控件的 stopPropagation 先赢）；平移记录区分「空格发起」；pointerup 回报「这是一次空白点击」
- `components/useMarqueeSelection.ts`：只由 Shift 进入、恒追加；空白目标守卫上收
- `components/useCanvasPointerInteractions.ts`：bubble 阶段一处仲裁 pan/marquee；空白点击清空选中
- `components/useCanvasTransformStoreSync.ts`（新）：store 变换同步——zoom 变化立即提交，纯平移节流 ~100ms + 收尾提交
- `components/GenerationCanvas.tsx`（799/800，只减不增）：接变换层 ref + `will-change-transform`；边层改传选中集；变换同步抽走
- `components/useCanvasViewport.ts`：导出 `canvasLayerRef`
- `components/CanvasEdgeLayer.tsx`：标签门改选中；删密度阈值 + hover 揭示两套补丁
- `components/canvasControlsHelpModel.ts`（+ 测试）/ `canvasControlsStructure.test.ts`：帮助面板与文案随语义走
- `components/canvasGesturePreference.ts`：头注释里的手势描述随语义走
- `styles/generationCanvas.css`：stage 默认 `cursor: grab`（拖即平移的可见承诺）+ 注释更新（只改不增行）
- `nodes/useNodeDragResize.ts`：过阈值 → 发布 `dragging`
- `nodes/BaseGenerationNode.tsx`（735/735 基线，**不许涨**）：删死属性 `data-expanded` 换上 `data-dragging`；浮条条件加「非拖动」
- `nodes/NodeFloatingToolbar.tsx` / `nodes/NodeGenerationComposer.tsx`：各自声明拖动中隐身
- `i18n/locales/generationCommon.ts` / `settings.ts`：帮助面板与设置页文案（中英）

**不动**
- 滚轮语义二选一设置（#832）：默认档已经是「滚轮缩放锚光标」，触控板党那档是正交的退路，不删
- 空格/中键/右键平移、右键菜单延迟判定、拖拽连线、节点内拖拽与八向缩放
- 边的点亮/淡化视觉（`data-incident` 那套 CSS）、连线几何、任何数据结构与存盘格式

## 回滚

单 commit。回滚 = `git revert`。手势/渲染/显示三块互不依赖，也可按文件单独回。

## 落地记录（2026-08-08）

四条全部落地并真机验过。新增 R16 真实任务端到端走查
[`tests/ux/canvas-drag-pan-gestures.walk.mjs`](../../tests/ux/canvas-drag-pan-gestures.walk.mjs)
（真 Electron + 真构建产物，零额度，28 项断言 + 5 张截图人眼对账）：

- 平移 Δ 与鼠标位移一致、拖动中 `data-panning`、无框选矩形、缩放不变
- 平移前后节点是同一批 DOM 实例；变换层 `will-change: transform`；连续拖一秒布局重算 **0 次**
- 点空白清空选中；Shift+拖出框并追加选中；滚轮放大后光标下的画布坐标 Δ=(0.00, 0.00)
- 未选中时全画布 0 个连线标签；选中「镜头 2」后其入边点亮并浮出「首帧」标签
- 拖动节点时 composer `visibility: hidden`、浮条不显示，松手恢复 `visible`；拖**另一个**节点时画布上挂着的浮层同样一个都不显示；**平移期间**浮层同样收起
- 空格+左键压在节点上仍平移画布（旧入口未被改坏）
- **按住左键平移中途滚轮缩放不抖**：缩放仍锚光标（Δ=0.00），缩放后再走 10px 位移就是 10.00px

### 补丁三：拖动期间**所有**浮层都该收起，平移也算（2026-08-09 用户追加，两轮）

原实现的作用域是「被拖的那张卡」（节点上 `data-dragging` + 按节点作用域的 group 变体）。真实场景漏了：
选中 A 展开了提示词面板，再去拖 B —— A 那块大面板还杵在画布上。「我正在摆位置」是一个**画布态**，
不是某张卡的私事。

用户随后又补了一刀：**拖画布（平移）时浮层同样要收**。合并成一条契约——「画布上正在拖动 ⇒ 浮层隐身」。

改法：新增 [`canvasDraggingFlag.ts`](../../src/workbench/generationCanvas/components/canvasDraggingFlag.ts) ——
拖动态升到 stage 上的 `data-dragging`（imperative DOM 写，不进 React），**四条**拖动路径统一置位：
拖单个节点（`useNodeDragResize`）、拖选区框 / 拖组框（`useCanvasSelectionDrag`）、拖画布平移
（`useCanvasViewportGestures`）。浮层（浮动工具条外壳 / 提示词面板 / 图片版本控件条）各自声明
`group-data-[dragging=true]/canvas:invisible`，天然覆盖全部节点。
按节点的旧作用域连同 `data-dragging` 节点属性与 `dragging` state 一并删除（P1），BaseGenerationNode 基线 735 → 734。

**时机纪律**：平移那条**跨过 4px 阈值才升**——按下就升的话，「点一下空白」又会白写两次属性，
正好踩回补丁二治的那个坑。结构测试用正则钉死了这个顺序。

滚轮平移（modifier-zoom 档）不置位：它没有明确的「结束」事件，要 debounce 才能清标志，
复杂度换来的收益极低，且有「标志卡住」的风险（KISS）。

### 补丁二：点一下空白也在刷新（同日用户追加反馈）

现象：点击画布空白处，连线层「按下刷一次、松开又刷一次」。先量后修——探针（MutationObserver + CDP
Performance）给出的事实是：连线 SVG 与标签层**根本没被动**，在动的是 stage 上的 `data-panning`
属性（按下写、松开删，各触发一次整棵 stage 子树的样式重算），而它只干一件事：把光标从 grab 换成 grabbing。

根因：**光标反馈是纯 CSS 能力，却被做成了 React state**（`setIsPanning` 还顺带让整个画布组件重渲两次）。修法：

- 左键（最高频）→ 交给 CSS `:active`（stage 上的 `active:cursor-grabbing`），零 JS、零属性写入、零渲染
- 空格 / 中键 / 右键（CSS 认不出的入口）→ 仍写 `data-panning`/`data-space-pan`，但改成 **imperative DOM 写**，不进 React
- `clearSelection` 加幂等守卫：选区已空且无待连时直接返回，不再造新数组把「选区变了」广播给每个订阅者

实测对比（同一探针，A=有选中点空白 / B=空选区再点一次）：stage 属性变更 **2 次 → 0 次**（A、B 皆是），
连线层 B 场景恒为 0；A 场景那 1 次 `data-incident` + 1 次标签移除是**设计内的真实视觉变化**（取消选中就该
熄灭点亮、收起标签），不动它。残留的「样式重算 +1/次」来自 `:active` 伪类本身——光标真的变了，这是下限。

回归判据进走查：`空选区下点空白：连线层 / 标签层 / 画布外壳零 DOM 变更`。

### 补丁：平移中缩放抖动（同日用户追加反馈）

现象：长按左键拖着画布时滚轮缩放 → 画面高频抖。根因是**平移用了「按下时的 offset + 指针总位移」这种绝对式基准**：
缩放锚光标时 `zoomAtStagePoint` 会修正 offset，而下一个 `pointermove` 又按老基准把修正算回去，一滚一抹。
改成**增量式**（`offsetRef.current + 这一步位移`）后，平移天然继承任何外部对 offset 的改写（缩放、最小地图跳转、
快捷键缩放都属同类），一处根治。回归判据已锁进走查：把代码改回绝对式，走查立刻报
「位移 309.09px（应 ≈10）」——测试确实能红。

顺带（跑门岗才发现，与本次改动无关）：`scripts/check-control-contract.mjs` 在 Windows 上用
`new URL().pathname` 拼出 `E:\E:\…` 直接崩溃 → 改用 `fileURLToPath`；门岗随即抓出
`TextClipStyleControls.tsx` 一处死守卫（组件早已 `return null` 保证目标存在），一并删掉。

## 验收门

- `pnpm run gates` 全绿（filesize 门会盯死 BaseGenerationNode ≤735、GenerationCanvas ≤800）
- 真机走查（R13）：① 空白拖=画布跟手移动，DevTools 开「突出显示绘制区域」时画布区不闪 ② Shift+拖出框，松手加选 ③ 点空白清空 ④ 中键/右键/空格拖仍平移 ⑤ 滚轮以光标为锚缩放 ⑥ 未选中时看不到任何边标签，选中节点后其关联边标签出现 ⑦ 拖动节点时浮条与提示词面板消失、松手回来
