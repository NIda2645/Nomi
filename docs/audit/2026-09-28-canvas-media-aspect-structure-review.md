# 画布媒体尺寸落地结构评审

> 状态：已完成（2026-09-28）。触发：`check:symptom-cluster` 在 `electron/productionRun` 与 `src/workbench` 的媒体落地合同达到第三份后要求结构复核。
> 对应合同：`docs/fixes/2026-09-27-canvas-media-aspect-from-landing.root-cause.json`。

## 观察

`electron/productionRun` 负责制作结果投影，`src/workbench/generationCanvas` 负责节点结果落地，项目 hydration 负责存量迁移。它们处理的是同一个事实（原始媒体宽高）的不同生命周期；此前各入口传 URL，却没有共享的尺寸 side-channel，因此缩略图显示时自动比例缺少 canonical meta。

## 结构裁决

- 原始宽高的 canonical 写入 owner 是 `src/workbench/generationCanvas/nodes/nodeSizing.ts::computeMediaMetaPatch`。
- 实时结果落地统一经 `src/workbench/generationCanvas/store/nodeRunOutcome.ts::nodeRunOutcomePatch`。
- 存量项目只在 `src/workbench/project/projectPersistenceService.ts::backfillCanvasMediaDimensions` 触发迁移，读取 sidecar 后仍调用同一 canonical owner。
- `electron/productionRun` 与恢复、历史、导入等入口只负责传递已探测的尺寸，不各自推导比例；缩略图测量继续拒绝写 canonical 尺寸。

## 是否需要先做结构改造

不需要。三个生命周期边界已经明确且互相不替代；本次修复把判据和写入收回共享 owner，并用聚焦测试覆盖普通结果、制作落地、历史/存量路径。后续若新增媒体入口，应先接入 `computeMediaMetaPatch`，不得在入口自行写 `imageWidth`/`videoWidth`。

## 防回

根因合同的门表记录了本次变更涉及的生产文件；`check:root-cause-contracts`、`check:door-map` 和 `check:symptom-cluster` 负责阻止新增入口绕过共享边界。


electron/capabilityCore 只负责把制作产物的宽高从物化结果投影到画布落地报文，不拥有节点比例判据；它与 electron/productionRun 的投影配对，统一把尺寸交给渲染层共享 owner。

