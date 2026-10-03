# 3D-BOX 评测底座（第一棒）

## Why

3D 导演台要从“一句话 → 场景 + 走位 + 多镜头预演”继续演进。第一棒先固定一套离线、确定性的测量和题库，让现状正则路线、后续结构化计划求解器和 agent 循环可以在同一把尺上比较。用户已明确运镜/轨迹比场景外观更重要，因此总分把运镜与取景合并为 40%，走位/动作 25%，镜头结构 15%，场景 10%，整体 10%。L5 视觉模型本棒只留接口并按缺省处理，不伪装成已运行。

## 范围

- 新增 `nodes/director/model/` 下零 three 依赖的帧采样、投影、景别、运镜、连续性测量模块。
- 新增 `evals/director/` 的 Director Card schema、28 张离线题卡、分层打分器、oracle / PR #960 raw / ideal 适配器和 CLI。
- 新增 Vitest 单测，覆盖已知正确轨迹和故意错误轨迹。
- 三道标尺题与三种方案的汇总结果在本文件“基线”节维护。

## 不动项

不修改导演台现有生产行为；不碰 agent lane、工具注册表、skill、UI；不改 PR #960 检出或主仓；不调用模型、不花额度；不新增或复制 `stagingVocab.StagingShot`、`cameraMoveVocab.CameraMove` 词表。

## 设计卡

改动名：Director 3D-BOX 离线评测底座　线/负责人：feat/director-3dbox-eval　类别：[其他]

| 格 | 结论 | 证据 |
|---|---|---|
| ★1 用户怎么用 | 当导演想比较一句话到可播放预演的方案时，我想运行同一题库和打分器，以便先看运镜/取景与走位的可复现差距；真实任务是三道标尺题、T1 词汇单测、T2/T3 多镜题；本棒不做多轮编辑和视觉模型。 | `evals/director/run.ts`；离线合成工程，不宣称真实媒体覆盖 |
| ★2 谁说了算 | 预演测量由 `nodes/director/model/directorEvalMeasurement.ts` 唯一拥有；Director Card schema 由 `evals/director/cardSchema.ts` 唯一拥有；DirectorProject 只读消费现有 `directorTypes.ts` / `directorProject.ts`。 | `docs/engineering/concept-owners.json`；新增模块无生产写入口 |
| ★3 一致与复用 | 复用 `trajectoryEval.ts`、`programCamera.ts`、`evaluatedSceneObject.ts`、`stagingVocab.ts`、`cameraMoveVocab.ts`；测量层只补识别与投影，不定义第二套运动词表。 | `git grep`；`check:vocabularies` |
| ★4 全状态 | 离线 CLI：加载中=读取卡；成功=写 `scores.json`/`report.md`；失败=逐卡记录人话原因；部分成功=报告保留卡级失败；取消/过期=不适用（无长跑或外部任务）。 | CLI 输出路径；`check:i18n` 不涉及 UI |
| ★9 验收与回滚 | A/B/C 各自提交；运行 schema/measurement/scorer tests、`pnpm run review:branch`、`pnpm run gates`；回滚按提交 revert，不触生产行为。独立验收线：待另一条线按本卡运行同样命令并复核报告。 | 命令与提交收据 |

## 概念占用表（R33）

| 概念 | 唯一 owner | 允许消费者 |
|---|---|---|
| 预演测量（机位/物体采样、投影取景、运镜识别、连续性检查） | 新建 `src/workbench/generationCanvas/nodes/director/model/directorEvalMeasurement.ts` | `evals/director`（现在）；导演台 agent 自检工具（以后） |
| 测量用景别刻度（远景…大特写） | 测量模块内常量 `EVAL_SHOT_SIZES`，与 `stagingVocab.StagingShot` 显式映射 | 同上 |
| 运镜类型 | `cameraMoveVocab.CameraMove`；测量只增识别，不新增词 | 同上 |
| 导演卡（评测标准答案） schema | `evals/director/cardSchema.ts` | 评测 runner |
| DirectorProject | 现有 `directorTypes.ts` / `directorProject.ts`，只读消费 | 评测适配器、测量模块 |

## 先查别人

- [E.T. the Exceptional Trajectories (arXiv)](https://arxiv.org/abs/2407.01516)：论文明确从相机与角色随时间的 3D 坐标构造均匀轨迹并做 motion tagging，且用 CLaTr 做文本-轨迹度量与分类 precision/recall/F1；本方案借鉴“先采样再识别”的分层指标，保留可解释的幅度、方向、速度误差而不依赖模型。
- [ChatCam (arXiv)](https://arxiv.org/abs/2409.17331)：CineGPT 生成文本条件相机轨迹，Anchor Determinator 负责精确放置；本方案借鉴“主体锚点 + 相对轨迹”的测量接口，使 orbit/push/follow 都相对主体求值。
- [Director3D (arXiv)](https://arxiv.org/abs/2406.17601)：把文本到相机轨迹与 3D 场景拆成 Cinematographer/Decorator/Detailer；本方案借鉴把镜头轨迹作为独立可测边界，并将场景分数降权。
- [Holodeck (arXiv)](https://arxiv.org/abs/2312.09067)：LLM 产出空间关系，约束求解器处理硬边界与软关系；本方案借鉴卡中 `relations` 与连续性/穿模硬失败分开，给未来 S1 求解器保留结构化输入。

## 基线

以下表格由 `pnpm run eval:director -- --scheme ...` 生成后抄录；分数来自同一题库和同一确定性打分器，L5 记为 `unverified` 并按缺省不加分。

| 方案 | 卡数 | 总分均值 | L0 通过率 | 运镜+取景 | 走位/动作 | 镜头结构 | 场景 | 整体 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| oracle | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 | unverified |
| s0-pr960-raw | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 | unverified |
| s0-pr960-ideal | 3 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 | unverified |

## 回滚

新增文件按 A/B/C 提交；若测量或评测发现回归，逐提交 `git revert <sha>` 即可。生产目录没有现有调用方，回滚不会改变导演台运行行为。

## 验收门

1. schema 能拒绝缺少 id/prompt 的卡，并接受三道标尺题。
2. 测量单测证明 360° 环绕、慢推、出画、切镜瞬移、越轴、入地/穿模均可被识别；错误夹具必须红。
3. oracle 三题分数高于 0.85；变异体对应层下降；raw/ideal 报告保留真实失败原因。
4. `pnpm run review:branch`、`pnpm run gates` 结果如实记录；`evals/runs` 产物不入 git。

## 下一棒

T4 多轮编辑题、L5 视觉模型整体分、S1 结构化计划+布局/机位求解器、S2 agent 自检循环，以及真实媒体/Windows/打包运行证据留给后续棒次。
