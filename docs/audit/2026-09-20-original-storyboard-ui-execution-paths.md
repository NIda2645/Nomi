# 原分镜真实执行路径复用核对

只读建议；未修改生产、未启动 Electron、未改 root 正在运行的 creation 脚本。完整读取原 `storyboard-table-exec.walk.mjs` 与当前 `core-a-creation-runs.e2e.mjs` 后核对实际入口。

## 可直接复用的入口与证据

所有 locator 限定在 `[data-creation-run-editor="RUN_ID"] [data-storyboard-editor="true"]` 下，避免侧栏同名 data-storyboard-row；原动作照常由 `StoryboardPlanEditor` 捕获 Run/flush，再到既有 rowActions 和 runner。

| 目标 | 原入口 | 执行与证据 |
| --- | --- | --- |
| 单镜 | `[data-storyboard-row="1"]` 内 `getByRole('button',{name:'生成镜 1',exact:true})` | 原 walk:229–238 已真跑 image；批准前 fixture.images 不增；原 `[data-spend-confirm-dialog]` 可见后点“生成”；images 增 1；同 nodeId 的 result/history 与 frame `done`；结果应真实 decode，落盘及冷启动再核 |
| 锚参考卡 | 全部展开，再 `[data-anchor-card="ID"]` 内 `/^生成参考卡/` | 原 walk:240–248 真跑；这是 anchor 图生成，不等于视频首帧依赖波次 |
| 重生成 | 行内 `[data-storyboard-actbar]` 下 `getByRole('button',{name:'重生成',exact:true})` | 原 `regenerateShotRow` :194 接原地 runner；比较同 nodeId、结果变更与历史保留，不只看 done |
| ×3 | 行内 `[data-storyboard-variants]` 打开 `[data-storyboard-variants-drawer="1"]`，内点“再出 3 版” | 原 runner:606–649 一次 quote/grant、串行三个 run；images 增 3、同 nodeId、三个新增结果身份、旧历史仍在。当前此 UI 接线有下述阻塞 |
| 批量 | `[data-storyboard-batch="true"]`（原 walk:261；editor:663） | `batch.runnable`→原 runStoryboardBatch；确认卡显示实际集合，先取消验零请求，再批准验准确目标/请求数，锁定/等待参考不隐式扩大 |
| 首帧＋视频 | keyframe.enabled 的 video 行仍点“生成镜 N” | rowActions:178–184 materialize 原 keyframe+shot；buildDependencyWaves 首帧在先，一次确认；storyboardPlan:377 产 first_frame 边。需 supplier 记录视频请求实际携前序生成图，而非仅两节点 done |

`data-storyboard-play-all` 是 editor:544 的 `onStartPlayback(rows)`，是结果顺播，不是批量付费入口。root 已据此纠正 creation 取消探针。付款卡应优先现有 `[data-spend-confirm-dialog]`（SpendConfirmDialog:113）作用域，避免原 walk 用 `div.fixed.inset-0`＋文字匹配的宽泛选择器。

## ×3 当前源码可证的 UI 接线缺口

范围裁决：shotVariants.ts 明确这是实验室形状、后续才接持久化。以下接线方向仅为技术调查，不是本轮获准施工；用户要求不自动展开 T3，因此本轮不新增变体交互或结果采用语义，也不得宣称真实页面 ×3 通过。

归属已用 merge-base 核实：`git merge-base HEAD origin/main` 为 `dfca9990b89c9c401b8ac81ea9ce30ab032e1be4`；该原版 editor 同样仅传 onVariantsRow、未传 variantsByShotId，原版 ShotTable:348 同样缺省空数组。这是旧缺口在本轮完整复用验收时暴露，不能归为本轮引入。全生产未找到已有 history→ShotVariant 投影；现有 owner 是 canvas result/history 和绑定后的 row.exec.node，`orderedVariants` 只有排序，不可称已有完整 derive。

`StoryboardPlanEditor.tsx:570–605` 仅传 `onVariantsRow`，没有 `variantsByShotId`；`StoryboardShotTable.tsx:350` 缺省为 `[]`。`StoryboardFrameActions.tsx:227–234` 只有 variants.length>0 才显示打开抽屉按钮；`StoryboardShotRow.tsx:463` 也仅有 variantsOpen 且非空才挂抽屉。唯一“再出3版”是 `StoryboardVariantsDrawer.tsx:57–63`。全生产调用中未找到 variantsByShotId 的实际供给；devlab 有 LAB_VARIANTS，但不能拿它证明正式入口可用。

因此 runner 的 ×3 单测已绿，也仍不能声称真实页面 ×3 可用。最小方向是将既有绑定节点 result/history 投影给现有抽屉，保持 node store 为唯一结果 owner，接原 `onVariantsRow`。先验证已有首个结果能打开原抽屉，再测试三次请求和历史；不新建页面/按钮框架/变体数据库。历史注释声称“重生成不换主图”，但原 runner 当前 addNodeResult 会换 result，不能照旧注释写错误断言，需 root 对当前正式设计裁决。

## fixture 实际支持范围

`agent-runtime-fixture.mjs:153–189` 读取真实 `resources/onboarding-demo/shot-4.jpg`，支持同步 `/v1/images/generations`、记录 `images`，文本走 expectation；不支持视频、polling 或首帧视频请求。可直接验证 Run 单镜、×3、image 批量，保持当前 Agent 创建四 Run 的能力。

`process-feedback-real-fixture.mjs:7–44` 可复用异步媒体供应商：真实 JPG＋`electron/providerAdapter/__fixtures__/certification-media/valid.mp4`，POST /jobs、GET /jobs/id，`jobs[i].done=true` 控制结算。现有 `process-feedback-electron.e2e.mjs:169–234` 已在 canvas video 用此路径。它会关闭原 seed server、删除 text 模型、替换 mappings，因此**不能直接取代当前 creation fixture**，否则 UI Agent 创建 Run 会失去文本服务。

该 process fixture 当前 pf-video 只有 text_to_video，body 仅 model/prompt；不能证明 first_frame 被带到视频。最小测试侧扩展应在既有 fixture 内追加选项/现有 route，保持文本端口和图片默认行为；为视频模型的实际 archetype mode 加 image_to_video mapping，body 精确映射该 mode 的 first-frame inputKey，并在记录中断言是已结算首帧的实际素材。不可仅加 video result 返回就说首帧链通过。若采用 process fixture 双端口供给，应合并其媒体 vendor/model 到同一已有 catalog 且保留文本 vendor baseURL；不能让通用 POST /jobs 错吃聊天请求。

首帧 plan 显式钉 image 模型及 vendor/mode，见 storyboardPlan:307–318，防默认回落会员/真实供应商；视频 plan 同样显式钉 loopback vendor/model 和实际 i2v mode。Run 创建仍通过原 draft_shots UI 工具路径，完整字段保存由当前 editor 承接，不能为测试手改 Run/node 绕开执行。波次证据用受控 job 完成：首帧未 done 前视频 POST 必为 0；done 后 video POST=1 且含首帧；视频 done 后原行显示 done，真实 `<video>` loadedmetadata/尺寸>0，Run稳定绑定、node结果、磁盘完整且冷启动保留。

旧 `storyboard-reference-slots.walk.mjs` 的 clip.mp4 仅合法头（:46–50），测试本身明确不解码且零生成；不得复用它作真实视频生成/播放素材。

## 现成脚本能否独立盖绿

`storyboard-table-exec.walk.mjs` 可核旧完整 editor 的 image单镜、锚生成、参考更新重跑、批量取消、锁定/预览/多选与样张。它种的是 `storyboardDesignsByDocumentId` 旧方案，非 Run；没有 ×3 实际点击、没有视频首帧执行、没有批准批量完成。因此单独跑绿不能替代 Run 对应四入口。其 SVG预置画面是合成展示素材，真正生成结果才是 loopback 提供的真实 JPG；两类证据应分开标。

建议 root 在现 creation walk 的已验证 Run 上增单镜和批量批准验证，并在原 variants 接线核实后接 ×3；首帧仅在现 fixture 真正支持 i2v request+真实 mp4 后执行。全程复用原 editor、原确认卡、原 runner、原 launch/fixture；不新增平行测试框架。报告明确“真实 Electron＋loopback供应商”，不宣称实际供应商扣费验收。

## 原三栏宽度与裁切核对

`StoryboardRowShell.tsx:38–39` 原网格为 `14px 136px REFERENCE_COLUMN_WIDTH minmax(0,1fr)`；该文件相对上述 merge-base 无 diff。`StoryboardShotTable.tsx:263` 为 overflow-hidden，`StoryboardWorkspace.tsx:50` 外壳同样 overflow-hidden，editor 的 `[data-storyboard-scroll]` 只有 overflow-y-auto。浏览器可能给外层计算出 overflow-x:auto，但表内内容已裁切时外层横滚不能保证触达；没有显式保证所有提示词/参数可达的横向滚动面。需实际 scrollWidth/clientWidth、命中和可操作性检验，不靠源码推断“已有滚动所以没问题”。

`creationResourceTreeCollapse.ts:25–34` 原设计为未设偏好时 storyboard 自动默认收树；用户手动展开后全局偏好优先，跨切换/重启仍展开。现 creation 脚本为切 Run 主动展开树，之后不会自动恢复收起，这是现有明确语义。已有 `[data-creation-resource-tree-toggle="collapse"]` 可供用户收起，不需新入口；但只拍收起状态不能替代展开状态裁切验收。原 editor 源注释保留 W-03 1280＋Agent 展开横向不足的历史；当前 row grid/overflow/偏好机制相对基线均非新造。2026-09-20 用户已明确将左右栏同时展开时的空间问题延后到整体设计：当前沿用 PR #808 的收起让位及手动偏好语义，记录展开时裁切限制，不在本轮重画或追加横滚。后续统一验收见唯一 TODO 的 T-DS-01／A-2。
