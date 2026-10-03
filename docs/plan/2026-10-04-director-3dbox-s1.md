# 3D-BOX S1：导演计划到可播放工程

## Why

S1 把语言理解和空间求解拆开：规划器只产生导演意图（关系、动作、景别和机位运动），确定性编译器负责所有坐标、轨迹和机位。这样相同计划会得到相同工程，运镜与取景可以用第一棒测量模块复核，场景外观只保持足够的灰模相似度。

## 范围

- 新增零 three 的导演计划 v2 zod schema、纯函数布局/走位/机位求解器和闭环测量报告。
- 新增模板扩展适配（courtyard、product_stage）和 AI dressing 规整物化适配。
- 新增一次调用、一次重试的 LLM 规划器适配器，以及不改现有注册点的 S1 adapter 模块。
- 新增 schema、求解器、确定性和错误计划测试，并提供三道手写 oracle 计划。

## 不动项

不改导演台 UI、store、stage_shot 声明、离屏出图器、agent 工具面、词表、第一棒测量阈值和既有 `evals/director/adapters.ts`。切换 PR 负责把本模块注册到现有评测入口。

## 设计卡

| 格 | 结论 | 证据 |
|---|---|---|
| ★1 用户怎么用 | 评测或第三棒把自然语言交给规划器，得到计划后调用 `compileDirectorPlan`，得到可播放 `DirectorProject`、actorMap、anchors、issues。 | 新增 `plan/`、`compiler/`、`evals/director/s1Adapter.ts` |
| ★2 谁说了算 | 计划 schema 与编译器属于本棒；景别↔距离只消费第一棒 `distanceForShotSize`；动作和运镜词表继续由既有 owner 提供。 | `concept-owners-director-s1.json` |
| ★3 一致与复用 | 模板复用 `legacySceneBuilders` 的 street/room 语义，新增模板只在适配层；dressing 复用 `normalizeAiScene`；工程形状复用 `createDefaultProject`。 | 编译器导入现有模块 |
| ★4 全状态 | schema 失败、布局冲突、测量问题均结构化返回；不会返回半成品工程。LLM 调用次数、重试和解析错误由 adapter 返回。 | `compileDirectorPlan`、`planDirector` |
| ★9 验收与回滚 | 新增测试先跑，随后 typecheck；回滚只需删除本棒新增文件。现有入口不变。 | 本文验收节 |

## 先查别人

- [Holodeck](https://arxiv.org/abs/2312.09067)：借鉴 LLM 只产空间关系、约束求解器处理硬边界的分层；本棒把关系转成确定性候选点并报告冲突。
- [SceneCraft](https://arxiv.org/abs/2306.12622)：借鉴文本场景先得到可编辑结构、再做几何/视觉复核；本棒把 `dressing` 与模板分离，复核走第一棒测量。
- [ChatCam](https://arxiv.org/abs/2409.17331)：借鉴主体锚点和相机轨迹分离；本棒每个 cut 独立机位，景别距离由第一棒反解。
- [E.T.](https://arxiv.org/abs/2407.01516)：借鉴按时间采样后识别运动类型；本棒把采样作为编译后闭环而非生成依据。
- [Toric space](https://www.cs.cmu.edu/~junyanz/projects/toric/toric.pdf)：借鉴按取景约束反解机位；本棒只保留纯数学的角度、距离和高度求解。

## 验收与回滚

计划 schema 正反例、每类求解器已知答案、错误计划会红、同计划深相等和三道 oracle 计划测试通过；`pnpm run typecheck` 通过。由于本棒不改评测注册点，`pnpm run eval:director -- --scheme s1` 的入口接线留给切换 PR，不能把本棒本地 adapter 运行冒充全题库成绩。

## 执行收据（2026-10-04）

- 新增单测 10 个全部通过（schema 3、编译器 5、adapter 2）；三道 S1 oracle 计划均能产出相机与轨迹，确定性深相等通过，闭环问题数为 0。
- `pnpm run typecheck` 通过；单独 ESLint 79 warnings 与 origin/main 棘轮持平，无新增 warning；`check:concept-owners`、`check:vocabularies` 通过。
- 最终 SHA 的完整 `pnpm run gates` 跑完 96 门：94 通过，唯一阻断是 `check:design-lab` 的 32 张视觉差异；`lint:ci` 79 warnings 与基线持平，`typecheck` 通过。按任务书要求在同刻 `origin/main`（41d58b771）+ 软链 node_modules 对照，main 为 40 张差异且失败名单不同，因此不盖 `stamp-gates-ok`，不推送，不创建 PR。
- 规划器没有读取或写入 key；LLM 全题库 3×运行与 token/费用未执行，属于 `unverified`。DeepSeek 官方当前对话模型为 `deepseek-flash`（V4.1 Flash）；切换 PR 接入后再按 env 通道运行。
