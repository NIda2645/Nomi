状态：✅ 已交付

# 画布媒体落地保留原始比例

## 问题与根因

用户反馈「选自动之后出来的框有边框，不是完整的图片显示」。画布节点显示 `thumbnailUrl || url`，而落盘预览会把原图缩放成缩略图；节点尺寸由 `nodeSizing.ts` 的 `resolveNodeVisualSize` 读取 `meta.imageWidth/imageHeight` 或 `meta.videoWidth/videoHeight`。生成结果落地时，`useNodeMediaMeasurement.ts` 明确拒绝缩略图的尺寸，只有 `src === result.url` 才能写入元数据。

落盘边界 `electron/assets/assetPreview.ts` / `electron/assets/localizeTaskAsset.ts` 已经探测并返回原始宽高，但 `catalogTaskResultParse.ts` 当前只保留 URL、缩略图和时长，随后结果通过 `addNodeResult` 落到节点时没有把宽高交给 `computeMediaMetaPatch`。制作流程 `multiShotCanvasLanding.ts` 也有独立的结果回填入口。这个缺口会在自动比例生成、缩略图存在、任务结果落地或历史版本切换时复现，因此按 recurring 处理。

## 改法

1. 在 `nodeRunOutcomePatch` / `addNodeResult` 这一条共享结果落地边界传递可用的原始宽高，并唯一调用 `computeMediaMetaPatch` 写入 canonical `meta.image*` / `meta.video*`。宽高不放入 `GenerationNodeResult`，也不增加第二个比例字段。
2. 普通任务解析和主进程本地化把资产探测到的宽高作为结果落地的瞬时 side-channel 传到共享边界；制作流程 wire 使用同样的瞬时 dimensions 字段。
3. 打开存量项目时读取项目资产记录的 `data.width/height`，按 `assetId`、URL 匹配当前结果；命中且 meta 缺失时调用同一个 `computeMediaMetaPatch`，保存一次。没有资产记录的旧结果仍保留原有 fallback，并允许原图加载测量补齐。
4. 历史版本切换时从同一份资产记录按版本结果匹配尺寸，再用 `computeMediaMetaPatch` 更新 canonical meta；查询失败不写入猜测值，也不使用缩略图尺寸。

## 落地入口清单

- 普通生成：`catalogTaskResultParse` → `resultAssetLocalization` → `generationRunController` → `nodeRunOutcomePatch`；正常结果与恢复结果共用这条边界。
- 制作流程：`electron/productionRun/generationOutputMaterializer.ts` 保留落盘探测的宽高，`multiShotCanvasLanding.ts` 通过 `mediaDimensions` 传入 `attachShotResult`。
- 历史版本：`NodeResultStack.switchTo` 按选中结果的 `assetId`/URL 查 sidecar，再持久化该版本的 canonical meta。
- 存量项目：`projectPersistenceService` 调用 `backfillCanvasMediaDimensions`，只在发现当前媒体节点缺尺寸时列资产并修复一次。
- 已知尺寸的其他画布产物（素材导入、素材库拖拽、截图/白板/全景/导演截图、切图/变换、联系表、视频深度）也改走 `computeMediaMetaPatch`；没有可靠原始尺寸的浏览器拖入、工作区引用、Agent 面板和演示夹具不猜尺寸。

## 先查别人

- 仓库的落盘尺寸探测：`electron/assets/assetPreview.ts:88-106` 通过 `probeMediaMetadata` 得到源文件 `width/height`，预览缩放只影响 preview 文件；`electron/assets/assetPreview.test.ts:63-72` 锁定 1600×900 原图不会被 1024 边长预览取代。
- 现有画布拖拽入口：`src/workbench/generationCanvas/components/canvasResultDrag.ts:70-108` 已经用 `computeMediaMetaPatch` 把拖入结果的原始尺寸写入节点 meta，证明共享 owner 可以覆盖不同入口。
- 开源画布 prior art：仓库的性能审计 `docs/audit/2026-09-02-canvas-performance-ceiling-audit.md:60-66` 对照 tldraw 的 image shape，采用图片 intrinsic size / aspect ratio 驱动卡片几何；本改动沿用同一原则，只把原始比例补齐到 Nomi 的 canonical meta。

## 不动项

- 不改 `useNodeMediaMeasurement` 对缩略图的拒绝规则；缩略图仍不能冒充原图。
- 不修改 Agent 面板 `src/workbench/ai/v4`，不在 `GenerationNodeResult` 再存一份宽高，不改变节点位置和用户手动尺寸语义。

## 存量与历史方案

尺寸补齐发生在项目 hydration 的共享 migration 边界，读取已落盘的 asset sidecar/asset record，命中后写入 `meta.*` 并随项目保存一次；以后打开项目不会重复写。历史版本切换走同一个 asset record lookup，按该版本自己的 `assetId` 或 URL 重新写 meta，因此每版可有自己的比例。旧资产没有 sidecar 尺寸时不解码原图、不猜测比例，继续由原图 onLoad/onLoadedMetadata 的既有路径补齐。

## 回滚

回滚共享落地的 dimensions side-channel、hydration migration 和历史切换补齐；旧项目仍可读取新增的 canonical meta 字段，删除补丁不会损坏结果 URL 或历史列表。

## 验收门

- 图片结果有 `thumbnailUrl !== url`、原始尺寸 1600×900 时，落地后 `readNodeMediaAspectRatio` 为 16/9，`resolveNodeVisualSize` 的高度为宽度 ÷ 16/9。
- 普通生成、制作流程、恢复任务、历史切换和存量 hydration 各有带原始宽高的回归测试；缩略图测量拒绝测试保持通过。
- 类型检查、相关 Vitest、contracts/build 由主管在可运行的环境执行。本 worktree 的 node 子进程检查若继续报 `spawn EPERM`，交付说明如实标记未能运行。

## 收尾验证（2026-09-28）

实现已在分支 `claude/canvas-media-aspect-from-landing` 收口。聚焦 Vitest 覆盖：普通任务资产把原始宽高作为瞬时 side-channel 传到结果落地、缩略图不参与测量、结果落地写入 canonical `imageWidth/imageHeight/imageAspectRatio`，以及存量项目按资产 id 从 sidecar 回填。`pnpm run typecheck` 通过；当前环境 Node 22.15.0 低于仓库声明的 22.19.0，仅产生 engine warning。待主分支合并后由维护者重跑完整门岗与真实画布验收。

