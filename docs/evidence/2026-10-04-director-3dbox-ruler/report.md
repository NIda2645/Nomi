# Director 3D-BOX 尺子盲测 2b 报告（工作树收据）

生成时间：2026-10-04（Asia/Taipei）；基线：`94a914b09`。

## 改动后分数

`evals/runs/director-20261003230845-oracle/scores.json` 是全题库 oracle 重跑（28 张，adapter error 0）。平均 L0-L4：0.976；benchmark 三张：

| Card | Total | L0 | L1 | L2 | L3 | L4 | 对应率 | 能力缺口 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| courtyard-standoff | 0.969 | 1.00 | 0.99 | 1.00 | 0.90 | 1.00 | 100% | `hide_object_behind_back` 为题卡声明的 `missing_asset`，按 0.6 partial 计入并单列 |
| perfume-orbit | 0.999 | 1.00 | 1.00 | 1.00 | — | 1.00 | 100% | 无 |
| police-chase | 0.996 | 1.00 | 0.99 | 0.99 | 1.00 | 1.00 | 100% | 无 |

`correspondenceRate` 由 `evals/director/binding.ts` 统一计算；类型不相容或关键字不命中保持未绑定，不按类别硬猜。

## 方案重跑状态

- `oracle`：已跑全题库，28/28，0 adapter error；benchmark 均 ≥0.95。
- `s1-oracle-plan`：已跑全题库，28/28，平均 total 0.900；这是固定计划编译链证据，不等同真实模型规划。
- `s1`：已调用全题库；28/28 adapter error，原因是本机未设置 `NOMI_LOOP_LLM_KEY`，token / cost `unverified`。
- `s0-pr960-raw`：已调用全题库；28/28 adapter error，原因是本 clone 没有 PR #960 checkout，`NOMI_EVAL_PR960_ROOT` 未设置；不是把失败伪装成分数。

## 三张 oracle 联系图（已 Read）

- [courtyard-standoff-contact.png](oracle-contacts/courtyard-standoff-contact.png)：上排先是两人侧后跟拍，随后女子向院门方向接近；下排切到人物局部和过肩角度，主体放大。渲染联系图中场景辅助件没有明显呈现，因此“地面/院墙/院门”的画面可见性仍是残余风险，评分只依据场景实体与几何测量收据。
- [perfume-orbit-contact.png](oracle-contacts/perfume-orbit-contact.png)：上排四格是同一圆柱从不同方位的环绕；下排进入近距离产品画面。圆形展台和瓶盖没有从当前白模联系图中清楚分离出来，故产品件的锚点可见性仍记为限制。
- [police-chase-contact.png](oracle-contacts/police-chase-contact.png)：上排为街道块面与车辆主体的连续视角，下排出现更近的车体/车头画面，机位从跟拍转横摇再推进。建筑两侧在白模渲染中只表现为大块面，细节不足但运动阶段可辨。

渲染输出原始目录（含 MP4、逐帧 PNG 和 readback 检查）仍保留在 `evals/runs/director-oracle-contacts-20261004/`；三张联系图已复制到本报告目录以便审阅。

## F10 回读

`compareCaptureReadback` 现在对主体位置继续比对；测量侧使用共享 `evaluateCameraPose` 后，三张 oracle 联系图的 `measurementSideGaps` 为 0。若回读缺主体会写入 `subject.position: expected -> missing`，不再被旧 gap 分支吞掉。review 重试会把具体 Zod schema 错误带入第二次 prompt，已有测试收据。
回读只对非 `isAuxiliary` 的可渲染主体做位置比对；地面、墙、门等 staging 几何不再制造假缺口，回归测试覆盖这一边界。

## 盲评与校准

盲评保留了两次批次证据：

- `evals/runs/director-judge-20261003231308` 是修复前批次（9 张卡、2 方案、3 重复、23 条记录）。当时回读把 `ground`、`wall_enclosure`、`gate` 当主体，诱饵为 0/5；这批视觉结论作废，但作为 F10 根因证据保留。
- `evals/runs/director-judge-20261003232732` 是排除辅助件后的重跑。三张 benchmark 的渲染媒体已生成；首次 `codex exec` 评审调用无输出挂起超过 10 分钟，按哨兵规则终止，故模型评审、交叉核、位置偏好和重复方差均为 `blocked/unverified`，没有把渲染成功当成评审成功。

因此本轮诱饵检出率不能声称达到 90%，交叉核一致率和位置偏好率也没有有效分母。评审 CLI 未返回 token/cost，记为 `unverified`。12 段人工校准页已生成：[calibration.html](calibration.html)，对应清单为 [calibration-manifest.json](calibration-manifest.json)；媒体引用保留在上述 judge run 目录，打开页面后按 1–5 分逐段打分并导出 JSON。

## 红→绿与门岗

- 红：纯 zoom 先返回 `static`；机位求值模块不存在；同类实体错绑不会掉 L3。
- 绿：`cameraPoseEval` 共享纯函数、屏幕 heightRatio 运镜识别、dolly/反向 zoom 互相抵消、统一 binder、F10 缺失主体回读、oracle 摆位和真实动作片段。
- 根因合同：`docs/fixes/2026-10-04-director-3dbox-ruler.root-cause.json`；合同检查已通过。
- `pnpm run typecheck` 修正后全绿：app / electron / electron-pi / test-types 均通过。
- 最终 HEAD 上的 `pnpm run gates` 已完整跑完 96 项：94 通过，`check:concept-owners` 为 advisory 失败，唯一阻断项是设计实验室。设计实验室 32 张失败 / 156 张通过在干净 `origin/main=94a914b09` 上逐项复现，属于任务书允许的同刻 main 例外，未更新基线；类型检查已全绿。
- 该例外不改变功能门岗证据；随后在最终 HEAD 盖任务分支 gates 戳，push 任务分支并开 draft PR，不能直接推 main。
