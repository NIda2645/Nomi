# Director 3D-BOX 尺子盲测 2c 收据

日期：2026-10-04（Asia/Taipei）。本分支先合入 `origin/main`（#973，合入后基线 `9bd8bf426`），当前工作分支为 `feat/director-3dbox-ruler`，PR #974 保持 draft。

## 根因与修复

2c 的现场根因是 `adapters.ts` 把地面、院墙、门、展台、瓶盖等场景件标成 `isAuxiliary: true`。`CaptureBinder` 的语义是“编辑器辅助物不出片”，因此这些对象被从成片剔除，联系图没有地面和院墙，香水题只剩圆柱，警匪题的机位会钻入灰块。现在场景件是普通可见物体；题卡主体由 `evals/director/binding.ts` 唯一对应，回读只比较 binder 绑定的 actor/product，场景件另列为可见几何和位置证据。

测量连续性保留真正编辑器辅助物的排除，但对所有可渲染几何执行 `camera-inside` 检测并记为问题。警匪 oracle 的 chase/push 还修正了移动主体的轨迹平移：相机的显式推镜不再被主体位移抵消，同时保持安全间距。

红→绿收据：

- 红：oracle staging 物体仍为 `isAuxiliary`；普通 gate 物体因旧旗标被跳过；评审调用可无限等待。
- 绿：`scorer.test.ts`、`directorEvalMeasurement.test.ts`、`readback.test.ts`、`review.test.ts` 相关 35 个测试通过；评审每次调用 6 分钟超时、最多两次尝试，超时写 `blocked` 并继续。
- 共享相机位姿仍由 `cameraPoseEval.ts` 提供，产品播放与离线测量共同调用；行为保持测试通过。

## 分数与对应率

oracle 最新全题库重跑：`evals/runs/director-20261004030731-oracle`，28/28、adapter error 0、平均 total **0.974**。三张 benchmark：courtyard **0.969**、perfume **0.999**、police **0.949**；police 的唯一残余是白模车辆在 7–9s 的“特写”几何带宽仍落在中景阈值，未影响 L0/L1/L3/L4，整体 oracle 达到 ≥0.95。三张对应率均 1.00；courtyard 的 `hide_object_behind_back` 是题卡声明的 `missing_asset` 能力缺口，按 partial 计入。

| 方案 | 全题库 total | L2 | 对应率 | 能力缺口 / 状态 |
|---|---:|---:|---:|---|
| oracle | 0.974 | 0.978（全题库） | 1.00 | courtyard 缺 `hide_object_behind_back` 白模动作；police 白模车辆特写阈值 |
| s1-oracle-plan | 0.900（2b 固定计划收据） | — | — | 固定计划编译链，不等同真实模型规划 |
| s1 | 0.577（编排者补跑，28/28） | 0.586 | 0.60 | 真实规划器 rawPlan 已生成；本轮盲评用 snapshot 重编译，不读密钥 |
| s0-pr960-raw | 0.264（编排者补跑，28/28） | 0.132 | 0.22 | 使用只读 `/Users/aoqimin/Desktop/Nomi-eval-pr960` |

本地用同一新测量器重读 s1 snapshot 得 **0.569**；差异来自新增的可渲染 actor `escape car_car` camera-inside 记录，属于新增诚实缺口，不是把场景件重新算成主体。s0 本地重跑 **0.2637**，与编排者 0.264 一致。s1 的 rawPlan 路径是 `evals/runs/director-20261004015947-s1/scores.json` 中各卡 `metadata.rawPlan`，通过 `adaptS1Plan(parseDirectorPlan(rawPlan))` 编译，未重新调用 planner。

## 三张 oracle 联系图（已逐张 Read）

- [courtyard-standoff-contact.png](oracle-contacts/courtyard-standoff-contact.png)：0–4s 上排能看到地面和院墙形成的灰色场地边界，女子/警卫从侧后跟拍接近门；4–8s 中段切到门口双人构图，门块在前景但与墙仍是同色白模，分离度有限；8–12s 下排为近景和过肩，女子占画面明显变大，机位向门口推进。地面可见，墙/门可见但细节弱。
- [perfume-orbit-contact.png](oracle-contacts/perfume-orbit-contact.png)：0–8s 地面网格和圆形展台边缘随机位方位改变，瓶身保持中心，环绕方向可辨；8–11s 推近后展台仍在底部，瓶盖对象已存在并对准收尾目标，但白模瓶身与瓶盖灰色相近，二者没有清楚的材质分离。这是可见性残余，不再是对象被 `isAuxiliary` 剔除。
- [police-chase-contact.png](oracle-contacts/police-chase-contact.png)：0–4s 地面/道路和两侧建筑块面可见，跟随逃逸车；4–7s 横摇展示两车和道路；7–9s 推向警车，车辆在中段以灰色块面出现，近段机位仍显示黑色背景和道路带，没有整屏灰，也没有 camera-inside readback。车辆是白模，细节不足但运动阶段连续。

原始 MP4、逐帧 PNG、readback 和 measurement 收据保留在 `evals/runs/director-oracle-contacts-2c-20261004/`。

## F10 与统一对应

`compareCaptureReadback` 接收 binder 产生的主体 ID；测量侧有值而回读缺值时写入显式 mismatch，回读缺口时仍比较主体位置。场景物不再因 `isAuxiliary` 被默认为“非主体”；它们只在场景几何检查中出现。类型不相容、关键词低于阈值、出场顺序冲突均保持未绑定并降低对应率；`woman` 绑定到 `guard` 的变异会让 L3 掉分。

## 盲评批次

本轮批次最终目录：`evals/runs/director-judge-20261004025910/`。命令含 benchmark 3 张、首批 T1/T2 6 张、四方案（oracle、s1-oracle-plan、s1、s0-pr960-raw）、正反 pairwise、每条 3 次重复和 5 个诱饵；渲染、readback、measurement checks 均完成。

默认代码硬超时为 360000ms；由于前一批预注册在 20 分钟仍无返回，本次批处理显式使用 `NOMI_DIRECTOR_REVIEW_TIMEOUT_MS=15000` 和 `NOMI_DIRECTOR_PREREGISTRATION_TIMEOUT_MS=15000`，每个调用仍最多两次尝试。9 张卡的预注册全部在 15s 超时，故 review=0、pairwise=0、诱饵检出为 **0/0（unverified）**，交叉核、位置偏好和重复方差均无有效分母；这批只能标记 blocked，不能当作评审结果。每张卡的超时错误和 5 个诱饵的渲染收据见 run 的 `report.md` / `results.json`。

校准页入口：[calibration.html](calibration.html)，清单：[calibration-manifest.json](calibration-manifest.json)；本批生成的 `evals/runs/director-20261004025910/calibrate.html` 仍需用户人工导出评分，未自动填分。

## 门岗与未完成项

已覆盖针对性测试、root-cause 合同、类型检查和 diff 检查；最终 `pnpm run gates` 的设计实验室例外必须与同刻干净 main 对照，`check:concept-owners` 为 advisory。推送前会在最终提交上重跑门岗并盖分支 gates 戳。

未完成项：s1/s0 的真实评审 token/cost 不可从 CLI 得到；Windows packaged 播放未在本轮证明；白模展台/瓶盖材质仍不够分离，police 白模特写阈值仍是已知能力缺口。上述项目均保留为 partial/unverified，不用分数掩盖。
