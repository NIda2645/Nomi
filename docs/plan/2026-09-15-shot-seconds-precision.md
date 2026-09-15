# 拆解出来的秒数只有一个精度 owner（T-RL-08）

> 状态：✅ 已交付（纯数据层，无用户可见 UI 改动）· 2026-09-15
> 根因合同：[`../fixes/2026-09-15-shot-seconds-precision.root-cause.json`](../fixes/2026-09-15-shot-seconds-precision.root-cause.json)
> 结构评审（R21.2 症状聚类触发）：[`../audit/2026-09-15-numeric-contract-structure.md`](../audit/2026-09-15-numeric-contract-structure.md)

## 用户看到的摩擦

2026-09-12 00:45 用户：「视频加载进来点击拆解，结果全部失败，**秒数也离谱，为什么那么多小数字**」。
「全部失败」那半已由 #782（grantId 穿透）修掉；本单只管秒数。

分镜表的时间列长这样：

```
1  0–1.4681260000000001s
2  1.4681260000000001–3.9033329999999998s
```

## 为什么会这样（底层逻辑）

切点来自 ffmpeg `showinfo`、片长来自 ffprobe，两者都是 IEEE-754 双精度的**原始测量值**。
这条链上谁都没有「镜头时间该精确到几位」的话语权，于是：

| 位置 | 它自己决定的精度 | 结果 |
|---|---|---|
| `electron/video/shotTimeline.ts:47`（修前） | 手写魔法数 `0.01`，只用来丢贴边切点 | 区间端点仍是原始浮点 |
| `electron/video/deconstructVideo.ts:283`（修前） | `.toFixed(2)`，只作用于 `durationSeconds` | 时长两位、起止十七位，同一行自相矛盾 |
| `electron/video/deconstructVideo.ts:100` | `.toFixed(1)`，只给 VLM 的提示词 | 模型看到的是 1.5，用户看到的是 1.4681260000000001 |
| `src/i18n/locales/shotTable.ts:5` `timeRange: '{{start}}–{{end}}s'` | **一套都没有** | 起止原样插值进 UI |

三处各发明一套、真正显示给用户的那处一套都没有——这不是「那一行忘了 `toFixed`」，是**这份状态的精度没有 owner**。

## 做法（一个 owner，两道边界）

1. 新增精度真相源 `electron/shared/canvas/shotTime.ts`：`SHOT_TIME_PRECISION_SECONDS = 0.1` + `quantizeShotSeconds()`。
2. **产出边界** `buildShotBoundaries`：区间端点在这里就落到格子上；「贴边切点」的阈值由精度派生（吸到 0 或片尾那一格 = 贴边），删掉手写的 `0.01`。
3. **落库/读入口边界** `shotTableFactRowSchema.transform()`：每一次读（`readShotTable`，10 扇门）和每一次写（`deconstructionResultToShotTable`，3 扇门）都经过它，所以**已存在项目里的长小数在读取时自动归一**，写回时被治好；`durationSeconds` 改为从量化后的两端派生，不再是第二份真相。
4. 显示层一个 `round` 都不写；`selectShotTableRows.test.ts` 加一条响的检测器，任何人再往 `ShotTableGrid.tsx` / `selectShotTableRows.ts` 写 `toFixed`/`Math.round` 当场红。

### 为什么是 0.1 秒

- **人的感知**：24/25/30fps 下一帧 33–42ms，0.1s ≈ 2.5–3 帧，已经是「看得出差别」的最小单位；再细的位数对「这一镜多长」没有任何行动价值（D1）。
- **与时间轴不打架**（任务书要求先核实）：时间轴内部单位是**帧**（`src/workbench/timeline/timelineMath.ts:17` 默认 30fps ≈ 0.033s），刻度标签最密一档是 `fps` 帧 = **1 秒**（`src/workbench/timeline/TimelinePanel.tsx:43` `resolveTimelineRulerStep`）。0.1s 比一帧粗、比一个刻度细，夹在两者中间，谁都不冲突。
- 顺带把「贴边」的魔法数变成派生量。

## 先查别人

### 框架原生（zod 3.25.76）
- `.transform()` 就是框架给的「解析时归一」钩子，不需要我们再写一层 normalizer 挂在每个读点上；链式顺序被文档明确保证（`.refine()` 返回 `ZodEffects`，其上再 `.transform()`，按注册顺序执行）：<https://github.com/colinhacks/zod/blob/main/packages/zod/src/v3/types.ts>（`_refinement` → `ZodEffects`）、`packages/zod/src/v4/core/schemas.ts` 的 `runChecks` 按注册顺序跑。Context7 查于 2026-09-15。
- 因此**不新增**「读的时候记得调一下 normalize」这种约定——约定靠记性，schema 靠编译与解析。

### 生态 npm
- `round-to` / `lodash.round` / `decimal.js`：解决的是**十进制运算精度**（金额、累加误差）。我们的问题不是算不准，是没人决定精度。0.1 的格子上 `Math.round(v*10)/10` 的结果其最短字符串表示恒为 `d+(\.d)?`（`electron/shared/canvas/shotTime.test.ts` 用 0→12 秒步长 0.013 的扫描钉死），再引一个依赖是纯负收益（R20：不在护城河上、不碰钱不碰信任，但这里连标准实现都不需要）。

### 我们自己（仓内既有形状，照抄不新造）
- schema 边界归一的先例：`src/workbench/project/projectRecordSchema.ts:24`（`.transform(() => 1 as const)` 在持久化读入口把值归一）、`electron/shared/agentCapabilities/jsonArgTolerance.ts:70`（`.transform` 做入参容忍）。本次用的是同一形状。
- 「精度在 owner 处量化，显示层不再 round」的先例：`electron/shared/canvas/videoDepthRun.ts:158` `estimateVideoDepthEtaSeconds` 直接 `Math.round` 后返回；`src/workbench/generationCanvas/nodes/director/model/cameraLens.ts:26/33`、`.../director/agent/cameraMoveFovMath.ts:15`、`.../director/model/timeGrid.ts:76` 都是 `Number(x.toFixed(n))` 在 owner 处收口。
- 所以本单**没有**引入新机制，只是把这一族的既有做法补到漏掉的那份状态上。

## 不动项

- 不改 `sampleSecondsForShot` 的 `.toFixed(3)`：那是喂给 ffmpeg 的 seek 时间戳（越准越好），从不显示给用户，和「显示精度」不是同一件事。
- 不改 `buildShotAnalysisPrompt` 的 `.toFixed(1)`：量化之后它已经是纯格式化（保证写出 `1.5s` 而不是 `1.5`），不是第二份精度决定。
- 不改模型侧的 `propose_storyboard_plan.durationSec`（见下）。

## 发现但没动（同类，另开）

`electron/shared/agentCapabilities/canvasModelShapes.ts:65` 的 `durationSec: z.number()` 对模型**不设整数约束**，而同一个字段的另一扇写门 `electron/shared/agentCapabilities/canvasWrite.ts:233` 写的是 `z.number().int().min(1).max(60)`——同一份状态两扇门两套精度规则，模型回一个 `3.5000000001` 就会经 `shotTable.duration: '{{duration}}s'` 原样显示。这是**模型侧**秒数的同一族问题，但它是模型可见的工具契约（碰 R31），改它会改 Agent 行为，不在本单范围。

`electron/shared/canvas/` 里其余数值字段已逐个看过：`revision`/`order`/`failedShotIndexes` 是整数；`videoDepth*.ts` 的 `outWidth`/`outHeight`/`*Bytes`/`totalFrames` 是整数或字节数，`etaSeconds` 已在 owner 处 `Math.round`。本次这一族在 `electron/shared/canvas` 内只剩分镜表秒数一处，已修。
