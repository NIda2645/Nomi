# 结构评审：四个模块反复收到根因合同，是不是这一层的结构不对（2026-09-18）

> 触发：`check:symptom-cluster` 在 `electron/catalog`（6 份 / 7 天）、`electron/shared`（12 份）、
> `scripts`、`src/workbench` 四个模块上同时报红——同一层 7 天里第三份合同，规则说这时候该出结构评审，
> 不该再修第四次。本文就是那份评审。
> 数据源：`docs/audit/2026-09-17-ownership-lifetime-census.md`（五维普查，可重跑
> `node scripts/audit/scan-ownership.mjs`）+ 本批次五道新门岗各自的「加规则前红几行」。

## 0. 结论

**四个模块的簇是同一件事，而且它不是「这一层的结构不对」，是「这一层的契约少一个字段」。**

普查扫完 2311 个文件、五个维度，能落到 C 档（要动共享边界）的共 6 条，D 档（大重构）**0 条**。
六条的停止层全部在**现有 owner 模块**里，往下挖 0–1 层就到底，没有一条需要新层或换框架。
反过来的证据本轮一条都没扫到：没有一份状态是「owner 不存在、要新造一层才放得下」。

所以裁决是：**继续修，但每一条都必须同时补上缺的那个轴，并把轴变成机器判据**。
这一批六条 C 全部按此做完，五道门岗全部先在未修的树上验过红。

## 1. 为什么四个模块一起红——它们是同一个簇

| 模块 | 这 7 天的合同在修什么 | 共同形状 |
|---|---|---|
| `electron/catalog` | 模型可用性单一 owner · 媒体类型单一判据 · 凭据失败文案 · 转写腿供应商独立 | 一个事实有 owner，但**消费者各留了一份副本** |
| `electron/shared` | 端口身份 · 错误码表 · MCP 连接词表 · 媒体导入 owner · 镜头秒数精度 | 同上，只是副本住在跨进程契约层 |
| `src/workbench` | 画布事务 · 导入进度相位 · store 释放 | 同上，副本住在渲染层 |
| `scripts` | 门岗自身的判据（词表 / 门表 / 合同） | 同上：**门岗也在抄码表** |

把四个簇并排放，它们不是四个模块各有各的毛病，是同一句话的四个投影：
**契约写了「这是什么」，没写「这归谁」**。没有 owner 轴，谁需要这个事实谁就复制一份，
而每一份副本在写下的那天都是对的、在 owner 变的那天开始错。

最能说明问题的是 `scripts` 那一簇：连**门岗自己**都在手抄错误码表。
一条规则如果要靠作者记得同步 15 处，它迟早会变成 15 个不同的数——本批次量到的正是
15 份 / 8 文件 / 只有 1 份是派生的。

## 2. 「是不是结构问题」——四条闸逐条答

| 闸 | 答案 | 证据 |
|---|---|---|
| owner 存在吗？ | **存在**，六条 C 的 owner 全是现有模块 | `electron/shared/surfacePortBinding.ts`、`projectBinding.ts`、`src/workbench/project/`、`electron/capabilityCore/mcpConfig.ts`、`laneViewModel.ts` |
| 要新造一层吗？ | **不要** | 普查 §7：每一维挖到 0–1 层就停；`appIntegration.ts`、`residentSurfaceLifecycle.ts`、`appWindowRegistry.ts`、`generationQueueStore.ts` 四个正例证明每一类都已经有人在正确的层上做对过 |
| 缺的是能力还是声明？ | **声明** | 四个正例做对过，只是**没把做对的那次变成契约里的一个字段**——能力契约 `execution` 只有 port + availability，store 字段没有寿命标签 |
| 修完能不能拦住下一次？ | **能，且已验** | 五道门岗各自在未修的树上先验红：词表 20 · store 14+3 · 身份 15 · 读路径写盘 5 · 凭据 2 |

四条闸没有一条指向「重构」，所以不停工、不冻结，按「补轴 + 门岗」继续。

## 3. 这一批补了哪两个轴

1. **寿命轴**（`src/workbench/project/storeLifetime.ts`）：每个 store 数据字段声明
   `lifetime ∈ {process, window, project, view, turn}`，项目释放点从声明派生，删掉两份手写清单。
2. **单一值源轴**：错误码 / 身份比对 / 失败文案各收敛到一个 owner，消费者只许 import 或 spread。

两个轴都做成了**「派生即隐身、手抄才现形」**：从 owner spread 的集合带 `SpreadElement`，
词表扫描器的 `stringLiteralMembers` 直接返回 null；从 owner import 的比对函数体里没有维度字面量，
身份扫描器看不到它。规则的出口就是正确写法，不需要谁记得住。

## 4. 留下的账（诚实标注，不算在本批次里）

- `check:read-path-writes` 只覆盖 `read/resolve/list/get` 前缀那一半。普查 §3 的
  **startup / external 触发类**（`repairStaleMcpConfigs` 每次能力核启动就改写别人的宿主配置）
  不在它的判据里，按指令留给 launch-rewrite lane。
- `useAgentUsageStore` 跨项目累计 token 是 B 档产品问题。声明写成 `process`（按它自己的
  docstring 归位）只是把这个选择**变得看得见**，没有替用户拍板。
- 真机证据是 `project-switch-background-run` 走查 + 两条付费卡释放单测；**没有**人手动在
  开着付费确认卡的情况下切一次项目。

## 5. 下一次再红怎么办

同一模块第七份、第十三份合同本身不是信号——**副本数才是**。重跑
`node scripts/audit/scan-ownership.mjs`，如果某一维的副本数在补轴之后还在涨，那才是
「这一层的结构不对」的证据，那时候再谈重构。今天没有这个证据。
