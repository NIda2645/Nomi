# P4 S4 — 派生批次调度器 + 预算 halt + 急停 + 锚检查点（执行计划）

> 母计划：`docs/superpowers/plans/2026-08-24-p4-multishot-continuity.md`（§1 不动项 / §3.2 锚检查点 / §3.3 执行·预算·急停 / §4 语义表 / §5 验收 / §6 拍板）。
> 本片是 P4 安全语义最重的一片。隔离 worktree `/Users/aoqimin/Desktop/Nomi-p4-s4-batch-scheduler`，分支 `claude/p4-s4-batch-scheduler`。

## 0. 范围与不动项

**做**：① 派生调度循环（无自有持久状态）；② 并发语义（并发等 provider，写 Run 单写者串行）；③ 预算 halt（锁内累计校验 + typed `BudgetExhaustedError`）；④ 急停（pause/cancel 接批次三态）；⑤ 锚亮相检查点（锚 Job 完成→写 Run gate→gate 通过放行镜头批，超时可配）；⑥ display.shots 装配（把 shots+S2 定价穿进真实 MCP gate）+ trial 回路后端半（trialFirst→缩到首镜→重封存→重发 gate）。

**禁**：画布落地（S5）、置顶浮窗（S3b）、UI 组件改动（S3a 卡只喂真数据不动）、legacy 路径、配音。

## 1. 核心设计：为何「无第二真相」

调度器**不持有任何可变状态**。每一拍（tick）都在 Run 锁内，从**三个纯输入**（`plan.shots + jobs[] + ledger`）+ 锚检查点 gate 状态，**纯函数派生**「下一批可派发集合」：

```
deriveBatchPlan({ plan, jobs, ledger, anchorGate, now, options })
  → { anchorDispatch: AnchorTask[], shotDispatch: ShotTask[], halt?: BudgetHalt, checkpoint: CheckpointState }
```

**为什么没有第二真相源**：调度器如果自己记「已派了哪几镜/已花多少」，崩溃恢复就得对账两份真相（内存 vs 盘），必然出现「盘上已提交但内存丢了→重复提交」或反之。所以我们照搬 `productionGenerationSubmission.ts` 已验证的做法（`latestGenerationAttempt` 从 `jobs[]` 纯派生 attempt，从不自持计数）：

- **「这镜派过没有」** = 查 `jobs[]` 里有没有该 shot 该 attempt 的 job（jobId 由 `jobIdFor(runId, contractHash, attempt, shotId)` 派生，天然幂等键）。
- **「已花多少」** = `summarizeBudgetLedger(ledger)` 的 reserved+actual+unsettled（ledger 是 append-only 事件重放，本身就是单一真相）。
- **「锚过了没」** = 查锚检查点 gate 的 `status === 'approved'`（gate 写在 Run 里，不在渲染层 store）。
- **崩溃恢复 = 同一个 `deriveBatchPlan` 重算**：重启后读回 durable Run，调同一函数，得到同一「下一批」——已完成的 job 已在 `jobs[]` 里、不会重派；已花的钱已在 ledger 里、halt 判定一致。

**单写者**：每个 Run 由**一个**调度器循环驱动，它是该 Run 的唯一写者。每一拍的「reserve + 提交」在**同一把 Run 锁**内串行（`productionGenerationSubmission.start()` 已在 `runLock.withLock` 内做 reserve+dispatch）。并发只在**等 provider 回结果**这一段（N 个已提交 job 并发 poll），不跨提交持锁。这消灭了 revision CAS 互踩（每次 execute 短锁 + commandId 幂等）。

## 2. 新文件（electron/productionRun/）

| 文件 | 职责 | 纯度 |
|---|---|---|
| `batchScheduleDerivation.ts` | 纯派生函数 `deriveBatchPlan` + typed `BudgetExhaustedError` + halt/checkpoint 结构 | 纯（无 IO） |
| `batchScheduleDerivation.test.ts` | 派生函数单测（锚先行/检查点未过/included 过滤/halt 停在第 K 镜/崩溃恢复重算一致） | — |
| `multiShotBatchScheduler.ts` | 编排层：读 Run→`deriveBatchPlan`→在锁内 reserve+提交锚/镜→poll 收敛→写检查点 gate→halt/停止状态；轮询有界 | 副作用（走 submission + repository） |
| `multiShotBatchScheduler.test.ts` | 编排单测（预算停第 K 镜、急停三态、崩溃≤1 submit、trial 回路、锚检查点放行） | — |
| `anchorCheckpoint.ts` | 锚检查点 gate 的建/查/放行纯逻辑（gateId 规约、超时自动放行判定） | 纯 |

改动文件：
- `productionRunTypes.ts`：`ProductionGate.scope` 加 `'anchor_checkpoint'`（锚检查点门）；加 `BudgetHalt`/批次投影类型。
- `mcpGenerationTools.ts`（:616 装配缺口）：preview/gate_request 从单镜 1-shot 投影扩为「读 plan.shots → 多镜 display.shots」。
- `productionGenerationSubmission.ts`：`start` 的「首条 authorize」改为「计划级硬顶 authorize」（把 §3.3 留给 S4 的累计上限落地）。
- `appIntegration.ts`：`start` handler 对多镜 plan 走 scheduler；`confirmGenerationInNomi` 的 trialFirst 上抛已由 S3a 完成，S4 在 gate_decide/后续把它落成「缩到首镜+重封存+重发 gate」。
- `productionRunService.ts`：`resumeUnfinishedRuns` 把多镜语义 Run 纳入恢复（走 scheduler 的派生重算，不走 legacy driver）。

## 3. 预算 halt 语义（§3.3）

- receipt 消费时：计划级 `authorize` = 硬上限（sum 勾选镜单价上界，或 policy.maxSpend 的更小者）。这是**唯一**授权额度。
- 每镜派发前（Run 锁内）：`reserve` 单镜上限，ledger 的 `applyBudgetEntry(reserve)` 已在超 `availableBudget` 时抛 `"Budget authorization exceeded"`。S4 在**派生层**先判：`reserved+actual+unsettled + thisShotPrice > authorized` → 该镜及其后**不派**，返回 `halt{ completedCount, remainingCount, haltedAtShotId }`。
- 触顶 → typed `BudgetExhaustedError`（scheduler 捕获 → Run 进 halt：`needs_attention` + 结构化计数可查）。**绝不静默超支**：即使派生漏判，ledger 的 reserve 仍是最后一道硬墙（会抛）。
- 提额续拍 = 同 plan 二批：用户提高 maxSpend → 重发计划级 authorize（ledger `authorize` 只增不减，`applyBudgetEntry` 校验新额 ≥ 当前 liability）→ scheduler 下一拍重算，之前 halt 的镜现在可派。included 复用 S1 机制。

**并发不双 reserve**：因为 reserve 在 Run 锁内串行（单写者），两镜不可能同时 reserve；派生层的累计判定读的是**当前** ledger 快照，锁内每次 reserve 后 ledger 增长，下一镜判定自然看到。

## 4. 急停三态（§3.3 / §4）

复用 `applyRunControl`（pause/cancel）。scheduler 每拍先看 `run.status`：
- `pausing/paused/cancelled` → 派生返回空派发集合（**未提交镜=不提交不扣费**）。
- **进行中**（job 在 `ACTIVE_JOB_STATUSES`）= 等收尾（provider 无 cancel 则诚实等，poll 到终态）。
- **已完成**（job `ready`/`adopted`）= 保留。
- 停止后状态结构化可查：`{ stopped, completed, pending }` 计数（从 `jobs[]` + `plan.shots` 派生）。
- pause 的 `pausing→paused` 收尾走 `settlePauseIfQuiet`（已无 active job 即落 paused）。

## 5. 锚亮相检查点（§3.2）

- 锚 Job（图像）+ 镜 Job（视频）**混同一 Run**。provider 注册表按 `job.provider` 解析（后端 #7 拒点一）；policy 建档写入**锚+镜并集**的 provider/model（拒点二/三）。
- 锚 Job 完成 → scheduler 写一道 `scope:'anchor_checkpoint'` 的 Run gate（`gate-anchor-checkpoint-<runId>`，jobIds=锚 job 们），**不依赖渲染层 store**（复用 `gate.add`/`gate.decide` 通道）。
- gate `waiting` → 派生**不放行镜头批**（`shotDispatch=[]`）。gate `approved` → 放行。gate `rejected` → 只重锚（锚的 `new_attempt` 谱系），不动镜头。
- **超时自动放行可配**（默认不自动）：`options.anchorAutoReleaseMs`。派生层判 `now - gate.createdAt > ms` → 视作放行（不改 gate，派生态放行；scheduler 顺手把 gate 决议成 approved 留痕）。

## 6. display.shots 装配 + trial 回路（§2 缺口 4/6）

- `mcpGenerationTools.ts` preview/gate_request：当 operation 背后的 Run 有 `plan.shots` → 用 `projectMultiShotPreview` 投影**全部勾选镜** → 组 `MultiShotGateProjection`（S3a 已定形），塞进 `gate_request` 结果的 `display.shots`（经 dispatcher `requestChallenge({ display: { shots } })` → challenge → `confirmGenerationInNomi` 转发 → S3a 卡吃真数据）。单镜 operation 无 shots → 走今天的扁平 1-shot（字节不变，14/14 守着）。
- trial 回路：S3a 的卡回 `{ confirmed:false, trialFirst:true }`（`appIntegration.ts:126` 已上抛）。S4 收到 → 把 plan 的 included 缩到**首镜**（`generation.patch` 各镜 included，只留 shot-1）→ 重封存（`generation.seal` 新 shots+planHash）→ 重发 gate（新 `display.shots` 只列 1 镜）。

## 7. 测试（TDD，先写后实现）

**派生纯测**（`batchScheduleDerivation.test.ts`）：
- 锚先行：无锚 job → anchorDispatch 含锚，shotDispatch 空。
- 检查点未过不放镜：锚 job ready 但 checkpoint gate waiting → shotDispatch 空。
- 检查点过放镜：gate approved → shotDispatch 含全部勾选镜。
- included 过滤：excluded 镜不进 shotDispatch。
- halt 停第 K 镜：构造 authorized 只够前 K 镜 → 第 K+1 镜起不派，halt.completedCount/remaining 正确（按勾选序）。
- 崩溃恢复重算一致：给「已有前 3 镜 job」的 Run → 派生只出剩余镜（不重派前 3）。
- 并发不双 reserve：派生对同一 ledger 快照两镜的累计判定单调（编排层锁内串行验证）。

**编排测**（`multiShotBatchScheduler.test.ts`，mock provider submit）：
- 预算：超顶批次停在正确第 K 镜（按勾选序），halt 结构化计数；总 submit 数 = 锚数 + 可负担镜数。
- 急停三态：pause 后未提交镜不增长；已完成保留；进行中等收尾。
- 崩溃恢复：每 Job ≤1 次 submit；**总请求数 = 锚数 + 勾选镜数**（不是「≤镜数」）。
- 锚检查点：不过不放行；rejected 只重锚不动镜；超时放行配置生效。
- trial 回路：trialFirst → 重封存 1 镜 → 新 gate display 只 1 镜。

**E2E（零额度 loopback，`tests/ux/`）**：
- `mcp-generation-multishot-batch.e2e.mjs`：J1 全链（多镜计划→gate（真 display.shots）→确认→锚→检查点→镜头批→逐镜完成）。
- J3 崩溃恢复 + 断开 stdio 客户端批次继续（同一 Run 重算）。
- 回归门：单镜 14/14、S3a multishot 34/34、elicitation 5/5 全保持。

## 8. 验收门

`pnpm run gates` 全绿（filesize/tokens/i18n/heavy-path/lint/typecheck/test/build/walkthroughs …）→ push → `gh pr create` 标题 `feat: P4 S4 batch scheduler, budget halt, stop, anchor checkpoint` **不合并**。

## 9. 回滚

开关 `NOMI_MCP_GENERATION_MULTISHOT_V1`（母计划 §3.6），仅在 SINGLE_SHOT_V1+E1_V1 之上生效，默认关；关掉即回 P1–P3 单镜现状。每文件独立 PR 可回滚；legacy 未动。

## 10. 岔路（停下上报）

- 若发现「锚检查点 gate 的授权面」与 receipt 授权面语义冲突（gate 管质量不管钱，但 gate.decide 在 service 层会连坐预算授权）——需确认锚检查点走**独立 gateId 前缀**不触发 `budget_envelope` 授权路径。**已在设计中规避**：锚检查点用 `scope:'anchor_checkpoint'`，service 层 `gate.decide` 的预算连坐只对 `scope==='budget_envelope'` 触发。

## 11. 实现落点（交付时补）

**新文件（electron/productionRun/）**：
- `batchScheduleDerivation.ts` — 纯派生 `deriveBatchPlan` + typed `BudgetExhaustedError` + 检查点/halt/进度结构。**无第二真相**：每拍从 `plan.shots(按 role 分锚/镜)+jobs[]+ledger+锚 gate` 纯派生；jobId 用 `jobIdFor(runId,contractHash,attempt,shotId)`（镜像 submission）；已花从 `summarizeBudgetLedger` 读；锚过了从 gate.status 读；崩溃恢复=同函数重算。测试 `batchScheduleDerivation.test.ts`（20）。
- `multiShotBatchScheduler.ts` — 编排层 `runToQuiescence`。startup 两个一次性幂等种子：`draft→running`（让批次可暂停）+ 计划级 `authorize=min(估算总价, policy.maxSpend)`。每拍：开检查点 gate/自动放行/派锚/等检查点/halt/派镜。测试 `multiShotBatchScheduler.test.ts`（7）+ `multiShotBatchScheduler.e2e.test.ts`（3，真 loopback HTTP vendor 跑 submit→poll→materialize→artifact）。
- `anchorCheckpoint.ts` — 检查点 gate 建/查（`scope:'anchor_checkpoint'`、gateId 前缀、英文 agent 面标题、承重比喻文案）。测试 `anchorCheckpoint.test.ts`（3）。

**改动**：
- `productionRunTypes.ts` — `ProductionGate.scope` 加 `'anchor_checkpoint'`；`ProductionGenerationShot` 加 `role?:'anchor'|'shot'`。
- `productionRunState.ts` — 加 `draft → running` 合法转移（语义批次需可暂停）。
- `productionRunReducer.ts` — 加 `generation.trial_narrow` 命令（试拍：sealed 多镜缩到首镜视频 + 清计划级 receipt + 新 planHash，锚保留）。
- `productionRunRepository.ts` — `gate.decide+approved` 的预算授权分支加 `scope==='budget_envelope'` 守卫（锚检查点不再误触发授权/policy 校验）——P2 根因修，防这类通用性问题从别的免费门复发。
- `shotPricing.ts` — 加 `buildMultiShotGateProjection`（真 display.shots 的组装，与单镜 preview 同一定价/降级真相源）；删死码 `normalizedIdentity`。
- `mcpGenerationTools.ts` — `GenerationOperation` 加 `shots/planHash/planVersion`；preview/gate_request 检测多镜 → 组 `display.shots` + 计划级 cost + 计划 hash receipt；加 `providerModelText`/`multiShotGateProjectionFor` 助手 + 操作存储 `trialNarrow`。
- `productionGenerationOperationStore.ts` — `operationFromRun` 投影 shots/planHash；实现 `trialNarrow`。
- `generationDispatcher.ts` — 挑战 `display` 透传 `shots`（进 MAC 签名 → 卡数据防篡改）。
- `mcpProtocol.ts` — `GenerationGateConfirmation/VerificationResult` 加 `trialFirst`；`confirmGenerationInNomi` 兜底分支透传。
- `appIntegration.ts` — `start` handler 对多镜 plan 走 scheduler（detached、client-independent）；`confirmGenerationInNomi` 收 `trialFirst` → `onTrialFirst` 落 `trialNarrow`。

**验收**：gates 全绿（filesize/tokens/i18n/heavy-path/controls/e2e-launch/walkthroughs/site/lint/typecheck/test 6335/build）；回归 E2E 单镜 14/14、S3a 多镜 34/34、elicitation 5/5 全过；S4 批次 E2E J1/J3 全过。
