# 3D-BOX S1 第三轮：规划器质量（诚实尺子）

改动名：director-3dbox-s1r3 规划器与警匪追车编译边界  线/负责人：实现线 S1R3  级别：[花钱][长跑]

| 格 | 结论 | 证据 |
|---|---|---|
| ★1 用户怎么用 | 当创作者给出一段自然语言拍摄意图时，我想得到能对应原话实体、场景件、镜头主体、景别和运镜的可播放计划，以便继续编译为 3D-BOX 工程；只改规划器提示词和共享编译边界，不改导演台 UI、尺子或题卡；已知坑是模型可能用 generic subject、漏 shot subject 或把自然语言运镜误写成非法枚举；真实任务为庭院对峙、产品展示、城市追车三类自然语言 brief。 | `evals/director/run.ts`、本轮流水记录 |
| ★2 谁说了算 | 规划计划 → `src/workbench/generationCanvas/nodes/director/model/plan/directorPlanner.ts`；计划 schema → `directorPlanSchema.ts`；坐标、轨迹、相机 → `directorPlanCompiler.ts`；测量/评分/题卡继续由尺子专班 owner 持有，本轮只读消费。 | `node scripts/door-map.mjs src/workbench/generationCanvas/nodes/director/model/plan/directorPlanner.ts`；`git grep` |
| ★3 一致与复用 | 继续复用 v2 schema、`CAMERA_MOVES`、`buildS1TemplateObjects`、`distanceForShotSize` 和既有 retry；只增加跨场景的文字契约与车辆跟拍的共享求解，不新增题卡分支。 | `check:self-written`；现有模块导入 |
| ★4 全状态 | 规划成功：返回 schema 合格 plan 与 usage；首次 schema 失败：带具体 issue 重试；重试仍失败：返回 adapter_error，不编译半成品；编译成功但动作缺资产：保留 `missing_asset` issue；取消/断网：调用失败，不写收据。 | `planDirector`、`compileDirectorPlan`；人工 |
| 5 中途表 | 评测状态 × 停止/关窗/断网/重启/连点均只影响当前进程请求；已完成卡的 run 目录保留，未完成卡不计为成功；不触发用户付费动作。 | 评测 runner 与 `/tmp/nomi-3dbox-s1r3-*.exit` 哨兵；人工 |
| 6 外部数据与失败 | 外部输入是用户 brief 与 DeepSeek JSON response；模型文档按现有 `deepseek-flash` 配置，网络/服务错误原样进入 planner errors；schema 错误回传具体路径，禁止静默改写用户实体。 | `directorPlanner.ts`；进程环境 `NOMI_LOOP_LLM_KEY` |
| 7 性能预算 | 规划器每卡最多两次请求；开发集 26 卡、终跑 28 卡，单卡预算 10 分钟，汇总只读 scores；编译器为同步纯函数。 | `evals/director/run.ts`；哨兵文件 |
| 8 真实条件 | 自然语言 brief 与真实模型请求：已运行；Windows、打包 Electron、L5 视觉模型、付费真实资源：`unverified`，本轮不声称覆盖。 | `evals/runs/director-*`；人工 |
| ★9 验收与回滚 | 验收：先去泄题开发集基线，再按归因类别提交并复跑开发集，最后一次性跑 T3 全部 + 留出 T2 `t2-gallery`、`t2-rooftop` 与 `s1-oracle-plan`；门岗 `pnpm run gates`；回滚按类 revert 对应 commit，不改尺子文件。 | 本文后续执行收据；`pnpm run gates` |

## 留出集

- T3 全部：`t3-storm`、`t3-cafe`、`t3-space`、`t3-market`。
- T2 留出：`t2-gallery`、`t2-rooftop`。选择理由：两张分别覆盖小物体/机位碰撞和环境/垂直运镜，能检验泛化；调参期间只读取卡的 tier/id 元数据，不读取其分数、reasons 或 rawPlan。
- 开发集：其余卡（含 benchmark、T1、T2 的 `t2-courtyard`、`t2-kitchen`、`t2-train`）。

## 根因记录

症状：S1 对应率约 0.60、L2/L3 低，police-chase 常出现缺演员/缺主体。直接原因：规划器示例泄露标尺且提示词未把用户名词绑定到 actor/scene/shot 字段；编译器车辆跟拍的运动链对共享边界没有明确约束。类根因：自然语言实体、kind、模板、shot subject 与运动语义之间缺少跨场景的结构化不变量。
