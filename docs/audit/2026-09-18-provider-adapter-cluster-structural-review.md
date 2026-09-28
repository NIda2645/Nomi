# 结构评审：electron/providerAdapter 七天内第七份根因合同，是不是这一层的结构不对（2026-09-18）

> 📎 结构评审 · 2026-09-18 · 状态：**已交付**（供 `electron/providerAdapter` owner 复核）
>
> 触发：批次 3 集成分支上 `check:symptom-cluster` 报 `electron/providerAdapter` 在
> 2026-09-11 → 2026-09-17 的七天窗口里已有 **7 份**根因合同。R21 说同一层第三份合同就该出结构评审，
> 不该再修第七次。本文是那份评审。
>
> **谁写的、限度在哪**：由批次 3 集成 lane（Opus）在合并时写——第七份合同（Higgsfield 的
> `presigned-put-drops-signed-headers`）是集成时才落进这个窗口的，而那条 lane 没有出评审。
> 本文的证据是**七份合同的正文与 scope_paths**（可复核），不是对运行时行为的重新测量；
> 没有跑过接入验证的真实闭环，也没有读完 `electron/providerAdapter/` 全部 66 个文件。
> 有实质分歧请以该层 owner 的判断为准。

## 0. 结论

**七份不是七个毛病，是三个形状；三个形状都落在 2026-09-18 那份
[所有权轴评审](2026-09-18-ownership-axis-structural-review.md) 已经裁决过的同一条轴上
（契约写了「这是什么」，没写「这归谁」）。所以对这一层的裁决与那份一致：
不是「结构不对」，是「契约缺一个轴」，继续修但每条都要补轴。**

**但有一条例外要盯**：形状 S3 里「不许停在中间态」这条不变量，09-12 修在 run 层、
09-15 又修在 session 层，第二份合同的作者自己写着「这跟 09-12 那一版是同一条不变量的**另一层**」。
同一条不变量在两层各实现了一次，今天**没有任何机器判据**说这两处必须同源。
这是本簇唯一一条真正的结构风险，见 §3。

## 1. 七份合同其实是三个形状

| # | 合同 | 形状 |
|---|---|---|
| 1 | `2026-09-11-media-delivery-shape-is-a-contract` | **S1** 上游自述的事实被写成了我们的常量 |
| 7 | `2026-09-17-presigned-put-drops-signed-headers` | **S1**（同一形状，隔六天，换个字段：这次是预签名 PUT 的协议头） |
| 4 | `2026-09-12-model-availability-single-owner` | **S2** 一条不变量没有归属层，每个读者各自回答 |
| 2 | `2026-09-11-self-check-must-never-demote` | **S3** 一个动作的生命周期没绑在它守的东西上（诊断反而能减能力） |
| 5 | `2026-09-12-spend-gate-outlived-the-spend` | **S3**（闸活过了它守的那次花费） |
| 3 | `2026-09-12-integration-run-failure-path` | **S3**（失败路径不是一等路径：run 层的中间态没人兜底） |
| 6 | `2026-09-15-integration-session-terminal-guarantee` | **S3**（同一条不变量的 session 层） |

三个形状与那份所有权轴评审的对应关系：

- **S2** 就是它 §1 表里 `electron/catalog` 那一行的同一句话（「一个事实有 owner，但消费者各留了一份副本」），
  且已经有了 owner（`electron/shared/modelAvailability.ts`）与门岗（`check:model-availability`）。**这一格已解决。**
- **S1** 是同一条轴**往仓库外延伸一格**：这次的「谁说了算」不在我们的代码里，而在供应商的响应/文档里。
  常量化一个别人拥有的事实，和复制一份自己拥有的事实，失败机制一样——只是前者的复发由对方触发，我们这边毫无征兆。
- **S3** 是同一条轴加上**时间**：不只是「这份状态归谁」，还有「它什么时候必须离开当前值」。
  那份评审给出的答案正是「寿命轴」，六条 C 里的 C1（store lifetime）是它在渲染层的落点；
  `electron/providerAdapter` 是它在**状态机**上的落点，而这一格还没有门岗。

## 2. 簇有多少是统计假象——先把它量掉

`check:symptom-cluster` 按 `scope_paths` 的模块键成簇。七份里有几份的重心其实不在这一层：

| 合同 | scope_paths 总数 | 其中 providerAdapter | 占比 |
|---|---:|---:|---:|
| self-check-must-never-demote | 10 | 7 | 70% |
| integration-run-failure-path | 9 | 6 | 67% |
| media-delivery-shape-is-a-contract | 8 | 3 | 38% |
| integration-session-terminal-guarantee | 11 | 3 | 27% |
| spend-gate-outlived-the-spend | 10 | 2 | 20% |
| presigned-put-drops-signed-headers | 15 | 1 | 7% |
| model-availability-single-owner | 22 | 1 | 5% |

**七份里只有两份的重心真在这一层**（≥ 2/3）。最后两份各只碰一个文件：
`model-availability` 碰 `serviceLanguageModels.ts`（它的重心是 `electron/shared`），
`presigned-put` 碰 `selfCheck.ts` 一行（重心是 `electron/catalog`）。

这印证了 2026-09-15 就记下的那条欠账——**symptom-cluster 的模块键太粗**：
一份合同只要在 `scope_paths` 里写了这一层的任意一个文件，就给这一层记一笔。
建议（不在本轮做）：成簇按「该模块在 scope_paths 里的占比」加权，或按 `doors` 里真正改动的门所在模块计，
而不是按 scope 命中与否。否则每一次跨层修复都会给被顺带碰到的层记账，评审就变成了交税。

## 3. 唯一要盯的结构风险：同一条不变量在两层各实现了一次

合同 3（09-12，run 层 `terminalGuarantee.ts`）与合同 6（09-15，session 层 `serviceLifecycle.ts`）
修的是同一条不变量——**任何非终态在有限时间内必须落到终态**。合同 6 的 `class_root` 原话：
「这跟 09-12 那一版是同一条不变量的**另一层**」。

09-15 那次的根因是「会话层把自己状态的终态保证外包给了子 run，外包只覆盖子 run 存在的情形」。
修法是让会话层自己兜。**但两层现在各有一份实现，而没有任何东西保证它们同源**：
两处的退避预算、看门狗周期、逃生口（cancel 可达性）各写各的，其中任何一处被改动，
另一处不会红。下一次这条不变量再漏，最可能的形态就是「第三层」——
比如外部宿主经 MCP 驱动接入时的那一层。

**建议的停止层**（一条，不是清单）：给「状态机的非终态」建一条机器判据——
凡是声明了非终态集合的模块，必须在同一处声明它的 ① 终态化保证 ② 看门狗 ③ 逃生口，
三者缺一即红；两层若各自声明，判据必须能看出它们指向同一份定义。
这与六条 C 的 `check:capability-lifecycle` / `check:store-lifetime` 是同一把尺子，
只是量的是状态机而不是 store 字段。**加规则前先验它会红**（R17）：今天至少这两处会红。

## 4. 裁决

| 形状 | 裁决 | 依据 |
|---|---|---|
| S1（上游事实被常量化） | **继续修，但每条都要落成声明位**——像 `uploadHeadersPath` 那样把「这件事供应商说了算」写进档案/契约，而不是写进代码分支。今天没有门岗会在常量化时红，这是真缺口，但它属于 `electron/catalog` 的档案体系，不属于本层 | 合同 1 与 7 的 `invariants` 已经是这么写的，只是没有机器判据 |
| S2（多处重算） | **已解决**，无需再动 | `modelAvailability.ts` owner + `check:model-availability` |
| S3（生命周期没绑住） | **继续修 + 加一条状态机寿命门岗**（§3） | 四份合同，其中两份是同一条不变量的两层 |
| 整层结构 | **不重构**。七份里只有两份重心在本层；`electron/providerAdapter` 66 个文件里最大的生产文件 722 行，未撞 R9 上限；没有一条合同的停止层落在「要新造一层」上 | §2 的占比表 + 各合同的 `shared_boundaries` |

## 5. 本轮没做的（诚实标注）

- 没有重新测量任何运行时行为；结论全部来自七份合同的正文与 `scope_paths`。
- §3 建议的那条门岗**没有实现**，也没有按 R17 先验它会红——只给了判据形状。
- 没有复核 `electron/providerAdapter/` 全部 66 个文件的职责划分；§4「不重构」那一格是基于
  合同证据与文件规模，不是基于一次完整的模块走读。
- §2 建议的 symptom-cluster 加权成簇没有实现，仍是 2026-09-15 记下的那条欠账。
