# 结构评审：`electron/shared` 与 `src/workbench` 的「数值领域约束该由谁持有」

> 状态：📎 交接/日志 · 2026-09-15 · 触发者：`check:symptom-cluster`（R21.2）
> 为什么有这份文件：[`../fixes/2026-09-15-shot-seconds-precision.root-cause.json`](../fixes/2026-09-15-shot-seconds-precision.root-cause.json) 把 `electron/shared` 与 `src/workbench` 两个模块的 7 天窗口各推到第 25 / 71 份合同，门岗要求先出这一层的结构评审再继续修。

## 这份评审的范围（先说清它不是什么）

**它是什么**：对两层里**一个可测量的结构面**的评审——「一个数值走到用户或模型眼前时，谁有权决定它的精度与单位」。这正是触发它的那份合同的类根因，也是唯一能在这一轮里用脚本量出结论、并把结论变成可拦人的规则的面。

**它不是什么**：不是对 71 份 `src/workbench` 合同的重新审计。那 71 份横跨 Agent 面板、画布、分镜、时间轴、付费闸——它们共同说明的是「`src/workbench` 这个键太粗」（门岗按路径前两段取模块，而 `src/workbench` 下住着五六个独立子系统），不是「这一层有一个共同的结构病」。**这条本身是本次最重要的结构发现，见 §3。**

## §1 量出来的事实（2026-09-15 实测）

| 扫描 | 命令 | 结果 |
|---|---|---|
| 未设约束的数值契约字段 | `git grep -n "z\.number()" -- electron/shared \| grep -vE "\.int\(\|\.min\(\|\.max\(\|transform"`（去测试） | **34 处** |
| 显示层自己 round | `git grep -n "toFixed(" -- src/workbench`（去测试） | **83 处，横跨 53 个文件** |

单看这两个数字像是「到处都在自己 round」。逐处读完之后，结论正好相反：

**83 处里的绝大多数是合法的**，因为它们格式化的是一个**派生量**，而派生的源头本身在格子上：
- `src/workbench/preview/inspector/PreviewInspector.tsx:100/:103`、`src/workbench/preview/TimelinePreview.tsx:126-127`、`src/workbench/generationCanvas/nodes/ClipNodeTimeline.tsx:372`：秒数 = `整数帧 / fps`。真相是整数帧（`src/workbench/timeline/timelineMath.ts:17`），秒只是给人看的投影，`toFixed(1)` 是排版不是精度决定。
- `src/workbench/generationCanvas/nodes/director/panels/inspector/*.tsx`：同上，且同一行并列显示帧号，读者能看见真相是帧。
- `src/workbench/generationCanvas/nodes/director/model/cameraLens.ts:26/33`、`.../timeGrid.ts:76`、`.../agent/cameraMoveFovMath.ts:15`：在 owner 处 `Number(x.toFixed(n))` 收口后返回，显示层不再 round。

**真正的结构缺陷长成另一个样子：持久化/契约里的那份数值本身不在任何格子上。** 这时显示层无论写不写 `toFixed` 都是错的——写了是症状修复（下一个显示点还会漏），不写就是用户看到的那串小数。本次修的分镜表秒数就是这一相：切点与片长是 ffmpeg/ffprobe 的原始双精度值，落库契约 `shotTableFactRowSchema` 只校验 `finite/nonnegative`，而唯一的显示点（`src/i18n/locales/shotTable.ts:5` 的 `'{{start}}–{{end}}s'`）连格式化都没有。

## §2 同一相的其余实例（逐个查过，不是推测）

| 位置 | 相 | 处置 |
|---|---|---|
| `electron/shared/canvas/shotTable.ts` 行的 `startSeconds`/`endSeconds`/`durationSeconds` 与 `source.durationSeconds` | 原始测量浮点落库，显示点零格式化 | ✅ 本次修：owner `electron/shared/canvas/shotTime.ts`，产出边界 + 落库读入口两道边界 |
| `src/workbench/timeline/agent/mediaToolCall.ts:290-294` | **同一个对象字面量里，四个字段两套规矩**：`peak`/`rms` 在产出处 `Number(x.toFixed(4))` 收了口，紧挨着的 `startSeconds: bucketStart / decoded.sampleRate` 与 `endSeconds` 原样是 `0.023219954648526078` 这种值，且它们经 `readWaveform` 直接进模型上下文 | 🔎 已确认存在，未修：读者是模型不是用户（代价是 context 噪音而非界面丑），且真相源是整数采样点 + sampleRate，正解是把桶边界按采样点表达而不是给它一个秒的精度常量。**另开** |
| `electron/shared/agentCapabilities/canvasModelShapes.ts:65` `durationSec: z.number()` vs `electron/shared/agentCapabilities/canvasWrite.ts:233` `durationSec: z.number().int().min(1).max(60)` | 同一份状态两扇写门两套规则；模型走前者可以塞进 `3.5000000001`，它会经 `shotTable.duration: '{{duration}}s'` 原样显示 | 🔎 已确认存在，未修：这是模型可见的工具契约（碰 R31，改它会改 Agent 行为，须先对齐两扇门的规则再动）。**另开** |
| `electron/shared/agentCapabilities/exportCapabilities.ts:38/:74` `durationMs` | 毫秒整数量级，但契约没写 `.int()` | ⚪ 不属此相：单位本身已是「人不感知的最小刻度」，且无显示点直接插值 |
| `electron/shared/agentCapabilities/canvasRead.ts:13-14` / `canvasWrite.ts:40` 的 `x`/`y` | 画布坐标，浮点是对的（连续空间） | ⚪ 不属此相：从不以文本显示给人 |
| `electron/shared/canvas/videoDepth*.ts` 的 `outWidth`/`outHeight`/`*Bytes`/`totalFrames*`/`etaSeconds` | 整数、字节数，或已在 owner 处 `Math.round`（`videoDepthRun.ts:158`） | ⚪ 不属此相 |

## §3 结构结论

**结论一（这一层真正的规则，此前没写下来过）**：
> 一个数值只有两种合法形态：① 它的真相是一个**格子上的整数**（帧、采样点、字节、像素），显示层把它投影成人话——此时显示层写 `toFixed` 是排版，合法；② 它的真相是一个**连续测量值**，那么必须在**产出边界 + 持久化契约**上被量化到一个有领域理由的精度常量，显示层一个 `round` 都不写。
>
> 违规的形状不是「显示层写了 toFixed」，而是「落库里那份数既不在整数格子上、也没有精度 owner」。查这一族要查契约层的 `z.number()`，不要查显示层的 `toFixed`——83 处 `toFixed` 里大多数是无辜的，34 处无约束契约字段里才藏着真的。

这条规则本次已在分镜表秒数上落地成结构（`shotTime.ts` + schema `.transform()` + 显示层源码断言），§2 的两条另开项各自需要自己的 owner，不能靠一条通用门岗代办——它们的「格子」分别是采样点和模型契约，不是同一个常量。

**结论二（对门岗自身的发现，比结论一更重要）**：
`check:symptom-cluster` 按路径前两段取模块，于是 `src/workbench`（71 份）与 `electron/shared`（25 份）成了两个几乎恒成簇的超级键。这不是「这一层结构不对」，是**键的粒度不对**：`src/workbench` 下住着 Agent 面板、生成画布、分镜、时间轴、预览、项目库六个彼此独立的子系统，把它们的合同数加在一起没有诊断意义，而且会让每一份新合同都被迫产出一份「对 71 份合同的评审」——那份评审注定是橡皮章，门岗于是从信号退化成仪式。

建议（未实施，需用户裁决，属门岗改动不在本单范围）：把模块键改为**三段**（`src/workbench/ai`、`src/workbench/generationCanvas`、`electron/shared/agentCapabilities`、`electron/shared/canvas`…），并把「同一层第三份」的判据从路径前缀改为 `invariant_owner_layer.layer` —— 合同里已经有一个由作者声明的「这条不变量归哪层管」字段（v3 必填），它比路径前缀准得多，而且正是这个门岗想问的那件事。按现有 425 份合同的 `invariant_owner_layer` 重跑一次即可评估误报率。

## 未覆盖（诚实标出）

- 没有重新审计 `src/workbench` 那 71 份 / `electron/shared` 那 25 份合同的其余面（Agent 面板状态机、付费闸、画布交互、分镜投影）。按结论二，那应当在键粒度改细之后按子系统分别做，而不是在一份文件里囫囵做完。
- §2 的两条另开项没有写成合同，也没有写门岗；它们各自需要先定「格子是什么」，而那是两个独立的领域判断。
