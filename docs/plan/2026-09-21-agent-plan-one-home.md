# Agent 产出的分镜「一个家」（批次 A · Pass 2）

- 分支 `integration/core-a-salvage-20260921`，起点 `eedad89b9`（Pass 1 完成态）。
- 规格正本：scratchpad `crosscheck-agent-plan-home.md`（Q1–Q5 + 推荐 A）、`user-decisions.md`、`MASTER-PLAN.md` Pass 2 段。
- 审计来源：D 主题 B/C/E/F/J/N、A 的 T5/T6/T11、B1 的 T3/T9、E 的 T4/T15/S4。

## 为什么（底层逻辑）

同一个语义——「一份分镜方案」——今天有**两个家**：

| | 谁建的 | 住哪 | 能改名/删除/复制 | 徽标 | 编辑宿主 |
|---|---|---|---|---|---|
| 本地方案 | 用户手建 / 外部 MCP `propose_storyboard_plan` | 项目记录 `storyboardDesignsByDocumentId` | ✅ | ✅ | `StoryboardPlanEditor` legacy 分支 |
| Run 方案 | 应用内创作区 Agent（`draft_shots`） | Run 的 `generationPlan.editorial` | ❌ | ❌ | 同一个编辑器的 `host` 分支 |

两个家永不同步、也永不互建；侧栏把两类画成同一种行，用户右键一个有菜单一个没有。
代价还包括：1.5s `setInterval` 轮询、一套只服务它的 Run 侧 CAS、每轮对话被结构性地逼出一份新方案
（`useAgentPanelV4Actions.ts` 没选中 Run 时 `targetRunId = op-<uuid>`，而 transport 会把模型自带的
`operationId` 判成 `storyboard_target_mismatch` 拒掉）。

**「Agent 产出 → 侧栏一条方案」这条机制 main 上本来就在**（`applyCanvasToolCall.ts` 的
`propose_storyboard_plan → setStoryboardPlan(createNew)`，外部 MCP 宿主天天走）。缺的只是**应用内那条 lane 够不到它**。
所以这一刀不是新造，是**把门开过去**：Agent 的创作面产出直接写成一条普通本地方案。

## 用户拍板（不可改）

1. Agent 对话产出的分镜 = 一条普通本地方案：同一份存储、同一个编辑器、没有第二个宿主、没有轮询。
2. 多轮修改必须由 Agent **明确指名**方案（带 id）；拿不准先问用户。不按「当前打开的那份」隐式推断、不每轮新建。
   → 模型要能读到现有方案清单（id + 标题）才指得出名。
3. Agent 方案默认标题 = 模型给的；缺省则与手动新建同一套编号。
4. 「落画布」= 用户显式点「放入画布」。`electron/productionRun/canvasLandingHost.ts` 那条
   「文稿来源的计划不自动落画布」闸**保留**；禁止出现「Agent 产出哪都不出现」的中间态。
5. 编辑器抬头删「重新拆分」「丢弃方案」是用户要求，保留删除（本 Pass 只核对删干净）。
6. 外部 MCP 宿主产出：这轮不动，记待办。

## 范围

### 删（整刀，同 commit 删旧，无 fallback、无并行版）

渲染层：`activeCreationRunId` 选择轴（slice / store / lifetime 全部引用）｜侧栏 Run 行｜
`useCreationRunPlans`（含 1.5s 轮询与 `readCreationRunSelection`）｜`useStoryboardRunHost`｜
`storyboardRunDraftSession`｜`storyboardEditorHost` 与 `StoryboardPlanEditor` 的 `host` 参数｜
`StoryboardNodeBindings` 这条「宿主注入节点绑定」的管道（`storyboardRunBindings` 是它唯一的生产者）｜
`production.materialize-shots` 的 `authorContentToken` 分叉（审计 D 主题 N）。

主进程：`ProductionGenerationPlan.editorial` 持久化｜`generation.save_storyboard` 命令（IPC/reducer/repository）｜
`productionStoryboardAuthoring.ts`｜`generationPlanEditorial.ts` 里只为 `editorial` 存在的三支
（`generationDraftFromStoryboard`、`storyboardContentToken`、`storyboardPlanFromGeneration` 的 editorial 分支）｜
`mcpGenerationTools.ts` 的 `if (current.editorial)` 四处早返回分叉｜
`canvasLandingHost` 的 `projectAuthorEdit` 绕闸参数｜`StoryboardRequestTarget` 的 `targetRunId` / `expectedRevision`
与 transport 里那套 `requestRevisions` CAS（含 128 条 FIFO 驱逐后静默放掉 CAS 的 B1-T10）。

只为上述存在的测试 / 走查 / 夹具 / i18n 词条（`storyboardEditor.runPlan.*`）一并删；根因合同覆盖多主题的改成实话，不整份删。

### 留（明确不动）

- `canvasLandingHost` 的来源闸本体（文稿来源 + 无绑定 → 不自动落画布）。
- 审计 D 主题 E 的行动作所有权闸：只删 `!host &&` 这类宿主分叉，legacy 分支即唯一分支。
- 主题 O 项目事务闸 + `existingOnly`；P `'any-published'`；Q `immutableProjectUuid`/`expectedBinding`；R i18n。
- `generationShotScope.ts`（present 与 confirm 同源）、付费卡 quoteId 校验与那批真竞态 e2e。
- 画布 Agent composer 入口的 `--production-table` 旅程（现役入口）。
- **未知价相关代码一律不动**（`shotPricing.ts`、`assertKnownShotPrice` 调用点、`unknownShotCount` 判据及其测试）
  ——2026-09-21 用户拍板另立项，本 Pass 保持行为等价。

### 加（最小集）

1. 两个窄渲染层 op：`storyboard.upsert-design`（建/整份替换）与 `storyboard.patch-design`（改一镜）。
   它们把主进程手里那份一次性的 `StoryboardPlan` 载荷交给**已有的** `setStoryboardPlan` / `addStoryboardDesign`，
   design 的 id 就是 `operationId`——模型手里那个 id 与用户侧栏那一行是**同一个身份**。
2. `StoryboardRequestTarget` 改成「文稿身份 + 这份文稿现有方案清单（id+标题）」：
   这就是决策 2 要的「给模型读的口」，不新增动词、不动 `document.read` 契约。
3. `storyboardPresent` 改读本地 design，内容比对用 `stableProjectAgentJson(design.plan)`
   ——编辑器 legacy 分支今天用的就是这套。

## 不动项

Pass 3–6 的任何一项（schema strict、admissionSurface、拖动租约、付费卡 × 根治、体验修复）；
顺手重构；为迁就门岗改 baseline（脚本再生成的除外）。

## 先查别人（R5）

- 本刀的 prior-art 报告 = scratchpad `crosscheck-agent-plan-home.md`：它逐 file:line 核了
  main / PR head 两个 ref 上两条产出路径的真实归宿，并给出反方（「留 B 修毛病」≈ +350 行、两次产品拍板、结构问题修不掉）。
- 不引入新框架/新协议/新对外格式：`storyboard.upsert-design` / `storyboard.patch-design` 是**内部**渲染层 op，
  与既有 `production.materialize-shots` / `storyboard.present` 同一张表、同一条 `requestRenderer` 窄 RPC。
  模型可见面只减不增（`draft_shots` 的 schema 一字未动；只改描述与 target 提示词）。

## 旧数据

`editorial` / `generation.save_storyboard` **从未进过 main**（`git show origin/main:...` 两处均 0 命中），
即没有任何发布过的构建写过这个字段。Run 记录读路径是宽松 `JSON.parse`（无 strict schema），
所以一条带 `editorial` 的历史记录：**读得进、不崩、字段被忽略**；已落画布的节点住在项目记录里，不受影响。
写路径不再产生该字段。补一条历史夹具测试钉住这条容忍。

## 回滚

单点回滚 = `git revert` 本 Pass 的 commit 区间（逐里程碑本地 commit，互不交叉）。
不涉及磁盘格式迁移，回滚后旧构建仍能读同一批 Run 记录。

## 验收门

1. `pnpm run typecheck`、`check:filesize`、`check:root-cause-contracts`、`check:door-map`、
   `check:vocabularies`、`check:i18n`、`check:boundaries`、model-face 门岗、`lint:ci`、`test:system:focused`。
2. `pnpm build` 后真机走查（loopback 供应商）：对话委托创建 → 左栏出现 1 条**普通**方案（有 ⋮ 菜单、能改名删除）、
   无 Run 行、**1.5s 间隔的 `productionRunApi.list` 调用数 = 0** → 编辑 → 「放入画布」→ 节点出现；
   第二轮对话不指名时 Agent 不得静默新建第二份。
3. zh/en 双语真截图，亲眼 Read。
