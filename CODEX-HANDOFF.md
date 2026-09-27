# CODEX-HANDOFF：画布媒体自动比例留白

## 结论

问题根因是生成资产落地时只传了 `url/thumbnailUrl`，没有把资产探测到的原始宽高传过共享结果落地边界；节点随后显示缩略图，而 `useNodeMediaMeasurement` 有意拒绝把缩略图的自然尺寸当作原图尺寸，导致 `meta.imageWidth/imageHeight` 缺失，自动比例只能使用占位尺寸并出现边框留白。

修复把宽高作为瞬时 `mediaDimensions` side-channel 传到 `nodeRunOutcomePatch`，唯一通过 `computeMediaMetaPatch` 写 canonical media meta。普通任务解析、本地化、恢复任务、制作流程、历史版本切换和存量 hydration 都接入同一边界；存量 hydration 按 `assetId` 或 URL 从资产 sidecar 读取尺寸，命中后才写入项目。

## 已改动范围

- 结果解析/本地化/运行交付：`catalogTaskResultParse`、`resultAssetLocalization`、`generationRunController`、`recoverTaskActions`、`runProjectDelivery`。
- 共享落地与比例元数据：`nodeSizing`、`nodeRunOutcome`、`canvasRunActions`/store 类型。
- 制作流程与历史/存量：`multiShotCanvasLanding`、`NodeResultStack`、`projectMediaMigration`、`projectPersistenceService`。
- 其他已知尺寸入口统一走 `computeMediaMetaPatch`（素材导入、截图/白板、全景、切图/变换、联系表、视频深度等）。
- 回归测试：`catalogTaskResultParse.test.ts`、`nodeRunOutcome.test.ts`、`projectMediaMigration.test.ts` 及既有制作流程测试。

## 验证

- `pnpm exec vitest run src/workbench/generationCanvas/runner/catalogTaskResultParse.test.ts src/workbench/generationCanvas/store/nodeRunOutcome.test.ts src/workbench/project/projectMediaMigration.test.ts src/workbench/project/projectPersistenceService.agentTurn.test.ts electron/productionRun/multiShotCanvasLanding.test.ts src/workbench/capability/multiShotCanvasLanding.test.ts`
  - 6 files, 54 tests passed。
- `pnpm run typecheck` 通过。仅有 Node 22.15.0 < package 要求 Node >=22.19.0 的 engine warning。
- `pnpm run check:boundary-owners` 与 `pnpm run check:symptom-cluster` 通过。

## 剩余风险与交接

没有产品取舍需要拍板。没有 sidecar 宽高的旧资产仍依赖原图 decode；过期或无法列出资产的项目不会猜比例。当前分支未推送、未开 PR；合入最新 `origin/main` 后请重跑聚焦测试、完整 contracts/build 门岗及真实画布验收。
