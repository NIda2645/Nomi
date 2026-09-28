# 结构评审 · `electron/productionRun` 与 `electron/shared`（2026-09-21）

`check:symptom-cluster` 在这两个模块上红：7 天内分别落了 15 份和 31 份根因合同。门岗那句话是对的——
**第三份合同是「这一层的结构不对」最便宜的证据**。这份评审是批次 A · Pass 3c 在这两层里逐条修完之后
写的，证据全部来自那一轮真实改动（每条带 file:line 与 commit），不是事后推理。

覆盖模块：`electron/productionRun`、`electron/shared`（含 `electron/shared/agentLane`、
`electron/shared/agentCapabilities`、`electron/shared/storyboard`）。
**不覆盖 i18n 词条那一层**（它同样在聚类里红）：本轮一个词条都没动，没有第一手证据，硬写等于编。
那一层欠一份自己的评审，**这份不替它作数**——门岗是按模块路径在评审正文里做子串匹配的，所以这里
刻意不写出它的模块路径：写出来它就会变绿，而绿的原因会是一句「本文不覆盖它」。

---

## 1. 一句话结论

这两层的重复缺陷不是「某个函数写错了」，是**同一个值同时服务两个受众，而它只有一份契约**。
受众之一的要求一变，代价就落在另一个受众身上，而且**两边都不报错**。本轮六处缺陷里有五处是这个形状。

---

## 2. 证据：同一个形状的五次复发

### 2.1 一份 schema，两个受众（持久化 / 模型入参）

`electron/shared/storyboard/storyboardPlanSchema.ts` 同时是：

- 项目记录的读口（`src/workbench/project/projectRecordSchema.ts:72` → `normalizePayload` 的 `safeParse`），
- 旧键迁移的读口（`projectNormalize.ts:108-120`），
- 规划模型输出的读口（`runStoryboardPlanner.ts:40` 把它发布成 JSON Schema），
- 作者面 schema 的来源（`agentCapabilities/generationPlanSchemas.ts:61-62` 的 `omit`/`merge`）。

为了第四个受众（想让模型少写错字段）加的 `.strict()`，代价落在第一个受众身上：
**一份存着的方案多一个历史键 → 整个 payload safeParse 失败 → `normalizePayload` 抛 `corruptPayload`
→ 这个项目打不开**；迁移那条路则是 `return []`，分镜静默消失。两条路都不会说是 `.strict()` 干的。

处置（commit `6dab1bd23`）：持久化/迁移面回到剥离未知键；严的那一面本来就自带 `.strict()`，没有动。

### 2.2 一个字段，两个推导式（attempt）

`prepareProductionGenerationAuthorization.ts:105` 按 `metadata.shotId` 数；
`productionGenerationSubmission.ts`（原 `latestGenerationAttempt`）按 jobId 前缀（含 contractHash）数。
两者今天答案一样，但**问的不是同一个问题**：换一个参数就换 contractHash，后者会把这一镜的谱系从 1 重来。
真要发生时，授权盖的 jobId 和提交找的 jobId 不是同一条 job，没有任何一处会说出这件事。

处置（commit `e85935813`）：删掉第二份，提交侧从同一个 owner 派生（`addressedGenerationAttempt = next - 1`）。

### 2.3 一个信封，两种信任级

`electron/shared/agentLane/laneDesktopContracts.ts` 的 `LaneComposerContext` 里，
`target`/`preconditions` 自注「untrusted selectors」，而 `admissionSurface`（决定 destructive 动词能不能跑）
和 `skillPrompt`/`skillSnapshot`（主进程派生）住在同一个结构里。区别只写在注释上，**类型上没有区别**，
所以谁进 zod schema、谁不进，只能靠人记得。`admissionSurface` 就是被记漏的那个
（`laneDesktopInput.ts:30`，commit `3170ed3ef`）。

同一形状第二次：`agentCapabilities/generationInvocationContext.ts:43` 的注释写着 "Trusted host context"，
而它整份来自那个不可信信封（commit `8125c0478`）。

### 2.4 一个消息字段，两个意思

`appIntegrationSpendConfirm.ts` 的 `failed()` 用同一个 `message` 同时表达「账本上发起没发起」
和「语义上是什么错」。于是想把 `generation_reference_*` 这类自家语义码放出去，就会顺手改掉
渲染层挑句子的判据。**这条本轮没改**（见 §4），因为修它要给 `ProductionActionResult` 加一个
独立的 `reason`，是跨 IPC 的契约改动。

### 2.5 一个值，两条生产路径（旧的那条没人叫，也没人删）

`ApimartReferenceUrlResolver`（注入函数现算 URL）与 `input.referenceUrls`（授权时封存的快照）并存，
而新分支**无条件覆盖**旧的结果（`apimartGenerationProjection.ts` 原 :205-220）。旧路唯一的作用是
被六处测试养着。处置：整刀删除（commit `837a3b4ed`）。

---

## 3. 为什么合同数会堆到 15 / 31

不是「这层 bug 多」，是**这层是所有受众的交汇点**：Run 是钱、执行、画布、外部 MCP 四条链的共同下游；
`electron/shared` 是渲染层与主进程唯一的共享词汇表。任何一条链提一个新要求，落点都在这里。
所以合同密度本身不是坏信号，**「每份合同都在给同一个形状打补丁」才是**——本轮五处同形，就是那个信号。

---

## 4. 这一层该建的防线（按「能让编译器拦的别留给门岗」排序）

1. **把信任级放进类型，不放进注释。** 给 `LaneComposerContext` 里主进程派生的字段一个类型级标记，
   再加一条装配期断言：打标记的字段不得出现在 `composerSchema`/`intentSchema` 里。这条能一次挡住
   §2.3 的两次复发，也是本仓已有的正确做法（`skillPrompt`/`skillSnapshot`）的机器化版本。**未做**。
2. **一份 schema 只许有一个受众。** 持久化读口与模型入参面必须是两个导出，共享字段但不共享严格度。
   §2.1 修完之后这条已经成立，但**没有门岗**：下一个人仍然可以往共享那份上加 `.strict()`。
   建议做成棘轮：扫 `storyboardPlanSchema.ts` 里的 `.strict()` 出现次数，硬零。**未做**。
3. **同一语义两个推导式要能被扫出来。** `check:vocabularies` 管的是状态/阶段词表，不管「attempt 怎么算」
   这种派生函数。建议扩一档：同一模块内两个函数返回同一个语义量（名字里含同一个词根、签名同形）时报出来
   让人裁决。**未做，成本不低，先记。**
4. **`ProductionActionResult` 分开「账本事实」与「语义码」。** §2.4 的结构修法。跨 IPC + 渲染层配对，
   单独立项。**未做**。
5. **`generation.present` 重写顶层 `candidate` 这一行要裁决。**
   `productionGenerationPlanEdits.ts` 里 `candidate: visible.shots?.find(...)?.candidate ?? visible.candidate`
   让一个被多处当稳定标识的字段随用户勾选漂移（消费者：`productionRunReducer.ts:243` 单镜封存身份、
   `productionGenerationOperationStore.ts:156-158` 幂等键）。`generationBatches.test.ts:111` 把它锁成了预期。
   本轮**没改**：它是花钱这条轴上的行为改动，改之前要把 `plan.candidate` 的消费者数清。**留给下一刀。**

本轮实际落地的防线：`hasUnsettledLiability` 具名化 + 九行表驱动测试（commit `06591db1f`）、
作者字段描述缺登记即装配期抛（commit `0eb61842e`）、`run` 从可选改必填（commit `e85935813`）。
三条都是「把靠人记得的东西交给机器」，但覆盖面只到本轮碰过的那几处。

---

## 5. 给下一位的判据

再往这两层里落根因合同之前，先问一句：**这次要改的值，有几个受众？**
答案 ≥2 而契约只有一份 —— 那要修的不是这次这个症状，是那份契约该拆成两份。
