# P4 批次调度器：慢供应商轮询修复（2026-08-25）

## 问题（S6.5 APIMart 真付费验收现场抓到）

真实慢供应商（APIMart Seedance 视频，分钟级）的多镜批次**永远物化不了**：两镜都拿到真实
task id（`provider_accepted`）后，run.json 冻在 `polling`/`processing`，`updatedAt` 停在调度器
歇下的那一刻，供应商侧早已完成也没人再去取。S4 e2e 全绿掩盖了它——loopback vendor 首查即
`succeeded`，从没有测试逼调度器熬过「连续多次 processing」。

## 根因（三个洞，缺一都不成立）

1. **轮询环不等**：`multiShotBatchScheduler.ts` `dispatchUnit` 的 `for (i<32)` 轮询之间没有任何
   `sleep`——32 次在毫秒内烧完，全部返回 `processing`，单元停在 `polling`。（对照：单镜 legacy 链
   `core.ts:595-618` 有 3s 间隔 + 300s 视野 + `NOMI_POLL_TIMEOUT_MS` 覆盖。全仓实扫确认这是
   electron/ 里唯一一个无等待轮询环。）
2. **歇下后无人再驱动在飞 job**：派生层 `needsDispatch` 对已提交（`polling`）的 job 返回 false，
   派生结果里**没有任何「去观察这些在飞 job」的输出**——所以哪怕 re-kick（开项目 reconcile /
   gate 决策后），派生也说「无事可做」，在飞 job 一辈子没人再 poll。重启也救不回。
3. **静止谎报**：tick 循环第 7 步在「无可派发」时返回 `quiescent: true`，即使 `progress.inFlight>0`
   ——调用方以为批次已落定，不会再踢。

## 方案（修在根因层，保持「调度器无自有状态」不变式）

- **派生层**（`batchScheduleDerivation.ts`）：新增 `observe: DispatchTask[]` 输出——当前 attempt 的
  job 处于 `provider_accepted`/`polling` 且有 `providerTaskId` 的单元（锚+镜）。停态（paused/
  cancelled）也照常输出 observe：停拍只拦**新派发**，已付费在飞 job 落定归档是保用户的钱
  （§3.3「In-flight jobs settle on their own」从此真的成立）。纯派生，重启后从 jobs[] 重算即得。
- **调度器**（`multiShotBatchScheduler.ts`）：
  - `dispatchUnit` = start + **立即 poll 一次**（即时 mock/loopback 当 tick 落定，现有测试的
    tick/submit 经济学不变），慢供应商则留 `polling` 交给 observe。
  - tick 循环新增 observe 分支（在派发分支之后、各歇点之前）：逐单元 poll 一轮；有落定（物化/
    attention）→ 继续推进；无落定 → `sleep(backoff)` 再来。退避 3s 起步、指数到 15s 封顶（守
    厂商「查询间隔 ≥3-5s」契约，docs/plan/2026-07-31-seedance-api-contract-reconciliation.md §三）。
  - 等待总额受 `pollHorizonMs` 界（默认 `NOMI_POLL_TIMEOUT_MS` 或 300s，对齐 legacy 链）；耗尽
    仍有在飞 → 歇下并**如实** `quiescent: false`。等待轮不消耗 maxTicks（进度 tick 才计数）。
  - `sleep` 走 deps 注入（默认真 setTimeout），测试注入虚拟时钟——测试零墙钟（R18 门岗兼容）。
  - observe 轮的 poll/materialize 异常按单元吞并 warn（长跑韧性，下一轮重试）；submit 路径的
    预算异常照旧上抛（halt 语义不动）。
- **appIntegration**：统一 `driveScheduler(projectId, runId, scheduler, label)` 包住四处
  `runToQuiescence()`（start / kick / rework / resume）：`quiescent:false` → 15s 定时器
  `kickSchedulerForRun` 再踢（每 run 至多一个待踢定时器，`unref` 不拖进程）；kick 路径带在飞
  dedupe（长跑 drive 存续期间 timer/reconcile 不叠踢；rework/resume 语义路径不 dedupe——
  提额要立即落 ledger，并发 drive 本就被 Run lock + intent log + commandId 幂等保住）。
  重启安全：定时器丢了没关系，开项目 reconcile 的 kick 现在真能推进在飞 job（洞 2 已补）。

## 不动项

- 不动 `productionGenerationSubmission`（poll/materialize 本就幂等可重入）。
- 不动 ledger/预算/halt 语义、checkpoint 语义、jobId/幂等键推导。
- 不动单镜 legacy 链（core.ts 自带等待）。
- ≤1 submit per job 与不重扣费由既有结构保证（outbox intent log + commandId 幂等），新增测试再锁一遍。

## 回滚

单 PR 三文件 + 测试；revert 即回到「即时供应商可用、慢供应商冻结」的 S4 现状。

## 验收门

1. 新 e2e（零额度 loopback 模板扩展，虚拟时钟）：慢供应商（前 N 查 processing）批次**仍物化**，
   且证明是「等」不是「烧」（虚拟钟推进 ≥ 供应商加工时长、查询次数远小于烧环）。
2. 新 e2e：供应商超过单次 drive 视野 → drive 1 如实 `quiescent:false`、job 停 `polling`；时间过后
   **新调度器 re-kick**（= 重启/定时/开项目）→ 物化、submits 不增（≤1 submit per job）。
3. 派生单测：observe 的入选/排除（provider_accepted/polling 入；attention/pre-submission/无
   taskId 不入；停态仍出 observe）。
4. 既有 S4/S6 单测 + e2e 全绿（tick/submit 计数不变）。
5. 五门 + `check:test-waits` 硬零全过。
