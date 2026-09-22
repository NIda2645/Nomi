# 先查别人 —— 进程重启后，那些「还在跑」的活该落到哪一格

> 2026-09-22 · 服务于 [docs/plan/2026-09-22-deconstruction-node-terminal-state.md](../../plan/2026-09-22-deconstruction-node-terminal-state.md)
>
> 结论先说：**这个问题别人全都解过，而且答案惊人地一致——
> 「还在跑」这句话必须锚在一个「它死了你看得见」的东西上。**
> 别人锚的是进程外的东西（VS Code 锚在独立的 pty host、BullMQ 锚在 Redis 里的锁 + 心跳），
> 所以他们能**续跑**；我们没有那个东西可锚（拆解全程活在一次 IPC invoke 里，没有 taskId、没有可轮询的上游），
> 所以我们锚在**进程本身**——进程没了登记自然空，于是「重启后每一张 running 都是中断」变成机械成立的。
> 换句话说：**同一条原理，落在不同的锚点上，得到「可续跑」与「可找回」两种不同但都诚实的答案。**
> 本轮自研的只有那份在飞登记（约 20 行），其余判据全部复用仓库既有形状。

---

## ① 依赖里已有？

- **`p-cancelable` 在，但它解的不是这道题，而且它自己劝你别用它**：
  `node_modules/.pnpm/p-cancelable@2.1.1/node_modules/p-cancelable/readme.md:7` 原话是
  *"If you target Node.js 15 or later, this package is less useful and you should probably use
  `AbortController` instead."*
  更关键的是它解的是「**我这一侧不想等了**」，而本轮的病灶是「**等的人已经不存在了**」——
  取消需要一个活着的取消者，而重启之后连取消者都没了。
  **怎么用它**：不用。取消那一半我们用同一个在飞登记里的 `cancelled` 标记实现
  （IPC invoke 本来就没有取消口，包一层 cancelable promise 只是把「结果作废」写得更绕）。

- **Node 的 `child_process` 已经把子进程死亡说得很干净**，
  [nodejs.org/api/child_process.html](https://nodejs.org/api/child_process.html)（本次实读）：
  `'exit'` 的原话是 *"If the process exited, `code` is the final exit code of the process, otherwise `null`.
  If the process terminated due to a signal, `signal` is the string name of the signal, otherwise `null`.
  One of the two will always be non-`null`."*；
  `'close'` 则是 *"emitted after a process has ended and the stdio streams of a child process have been closed…
  The `'close'` event will always emit after `'exit'` was already emitted, or `'error'` if the child process failed to spawn."*
  **查出来的结论是「这一格我们本来就做对了」**：`electron/video/detectShotCuts.ts:102-103` 同时挂了
  `child.on("error", reject)` 与 `child.on("close", resolve)`——文档明确警告 `'close'` 在 spawn 失败时
  **不会**发，只挂 close 会永远悬住。所以「ffmpeg 子进程死」这条从来不是本轮的病灶，
  本轮只给它补了一条回归测试钉住不回退（`deconstructionTerminalState.test.ts`）。
  **这也解释了为什么本轮不需要给子进程加心跳**：子进程的死亡在同一个进程里是**同步可观测**的事件，
  心跳是给「观测不到对方死活」的场景用的（见 ② BullMQ）。

- **zustand 的 `persist` 有 `onRehydrateStorage`（`node_modules/zustand/middleware/persist.d.ts:70`），
  但画布根本没走 persist 中间件**：画布的读回是项目文件 + 事件日志两段自持逻辑
  （`restoreSnapshot` / `applyEventTail`）。
  **怎么用它**：不用，但它的**形状**正是本轮的教训——`onRehydrateStorage` 是一个
  「水合**结束之后**」的统一钩子；我们原来的收敛写在水合的**中间**（快照归一化那一步），
  后面还有一步重放，于是被盖掉了。修法本质上就是把收敛挪到「最后一步之后」。

## ② 生态里已有？

- **VS Code：任务重连的前提是「那个进程还活着」，活不了就从持久化里删掉**。
  实读 [`abstractTaskService.ts`](https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/workbench/contrib/tasks/browser/abstractTaskService.ts)：
  构造函数里 `this._terminalService.whenConnected.then(...)` 先筛
  `instances.filter(e => e.reconnectionProperties?.ownerId === TaskTerminalType)`，
  **筛到了才** `_attemptTaskReconnection()`；`_attemptTaskReconnection` 还要求「这次是 reload 而不是首次启动」
  且 `TaskSettingId.Reconnection` 开着。任务被用户终止时，则**从持久化存储里移除**那条记录。
  **关键差别（也是本轮最有用的一条）**：VS Code 敢「续跑」，是因为终端进程住在**独立的 pty host 进程**里，
  窗口 reload 它不死——它有一个「进程外的活体」可以去认领。
  Nomi 的拆解**没有这个东西**：编排全程活在主进程那一次 `nomi:video:deconstruct` invoke 里，
  app 一关就什么都不剩。**所以照抄「重连」是错的**，正确的对应物是它的另一半：
  认领不到就不要假装还在跑，把那条记录清掉。我们比它多做一步——不是清掉，而是落成
  `interrupted` 并给出找回入口（证据还在，用户只是要重来一次）。

- **BullMQ：worker 死在半路 = 作业永远卡在 active，靠「锁 + 心跳 + 巡检」把它推到终态**。
  实读 [docs.bullmq.io/guide/jobs/stalled](https://docs.bullmq.io/guide/jobs/stalled)：
  作业 active 期间 worker 必须持续告诉队列自己还在干活；一旦不再更新，
  *"that job is moved back to the waiting list, or to the failed set"*；默认巡检间隔 30 秒；
  超过 `maxStalledCount`（默认 1）就 *"failed permanently with the error 'job stalled more than allowable limit'"*。
  **这是与本轮最同形的一条**：症状一模一样（干活的人没了，状态字段还写着「进行中」），
  解法的骨架也一样（活性要有独立的信号，没信号就推到终态）。
  **差别在锚点**：BullMQ 的心跳锚在 Redis——一个**比 worker 活得久**的外部存储，所以它能等 30 秒再判。
  我们的锚点是**渲染进程自己**：在飞登记是模块级单例，进程没了它一起没，
  于是「没有信号」这件事是**瞬时且确定**的，不需要 30 秒窗口、也不需要心跳定时器。
  **少一个定时器就少一类竞态**——这正是我们不照抄心跳的原因，不是偷懒。
  （另：BullMQ 默认把反复 stalled 的作业判成 `failed`。我们分成 `interrupted` 与 `cancelled` 两格，
  因为它们的下一步动作不同，而且把「用户自己取消」记成失败会在拆解成功率里留假数据。）

## ③ 仓库里已有？

- **同一个 app 里已经有一份做对了的**：`src/workbench/generationCanvas/store/canvasSnapshotNormalizer.ts:32-44`
  的 `convergeStuckMidFlightNode`——磁盘里 status 还是 `running`/`queued` 的生成节点，
  有 `taskId` → `recoverable`（上游可能仍出了片，给「重新拉取结果」入口，免费续查），
  无 `taskId` → `idle`，`progress` 一律清空（`:43`）。
  2026-09-17 付费走查 §5.2 H **当场点名**它与拆解那条形成鲜明对比：
  「同一个 app 里两套完全不同的中断处理」。
  **怎么用它**：复用它的**诚实**（重启后不继续转圈、给出口、清掉进度残影），
  不复用它的**续跑方式**（`taskId` 免费重拉）——拆解没有 taskId，硬塞一个假的比现状更糟。
  这也是本轮把新状态叫 `interrupted` 而不是 `recoverable` 的原因：
  `recoverable` 在本仓已有确定语义（钱已花、上游多半已出片、只配免费续查、永不进批量，
  见 `shotTable.ts` 行态词表的登记理由），拆解中断**一分钱没花、上游什么都没有**，
  共用那个词会让「可找回」在两处指两件事。

- **「取消」与「失败」分开记，仓库里也早有先例**：
  `src/workbench/generationCanvas/runner/generationQueueStore.ts:21`
  `QueueEntryState = 'queued' | 'running' | 'success' | 'error' | 'cancelled'`。
  **怎么用它**：直接照着分。本轮给拆解补 `cancelled` 不是新发明，是把队列那边已经做过一次的判断补齐。

- **`electron/tasks/*` 查过了，本轮用不上**：那一族（`taskCache` / `taskResultQuery` / `unrecognizedTaskStatusQuery`）
  的终态是给**可轮询的供应商任务**用的——`taskResultQuery.ts:88` 的注释原话是
  "Treat that as a terminal failure for async media instead of persisting a…"，
  它的前提是存在一个可以再查一次的远端任务。视频拆解不走这条路：没有 taskId、没有可轮询的上游、
  重启后没有任何东西能替它续跑。**所以「让节点读任务表的终态」这个选项在这里不成立**，
  硬造一个 taskId 只会多一份假账。（这一条是本轮明确**排除**的方案，记在这里以免下次有人重提。）

## ④ TikHub 自媒体里怎么说？

- 未查。本刀修的是「进程重启后悬空任务落到哪一格」这一内部状态所有权问题，
  用户侧可见差异只是「那一格从空白变成一句话 + 一颗按钮」，不存在「别家产品这个功能怎么做」的对照点
  （真正的对照点在 ② 的 VS Code / BullMQ，都是工程文档而非自媒体）。
  用户对这个卡死态的真实反馈已有一手来源且更硬——
  `docs/audit/2026-09-17-post-804-walkthrough.md` §6.5 的付费真机走查，本报告不重抄。

---

## 结论

**用已有**：
- 收敛的**诚实标准**复用 `convergeStuckMidFlightNode`（重启后不转圈、清 progress、给出口）；
- **取消 ≠ 失败**复用 `QueueEntryState` 已有的分法；
- **子进程死亡**复用 Node `'error' + 'close'` 双挂（本来就对，只补回归测试）；
- **收敛位置**采纳 zustand `onRehydrateStorage` 的形状：放在水合的**最后一步之后**，而不是中间某一步。

**自研（约 20 行）**：那份与渲染进程同寿命的在飞登记。
理由是 ② 两条都指向同一个原理——活性必须锚在「它死了你看得见」的东西上——
而我们唯一具备这个性质的东西就是进程本身。
锚在进程上换来一个额外好处：**不需要心跳定时器和巡检窗口**（BullMQ 需要，因为它跨进程），
「没有登记」即「没有在飞」，瞬时且确定，少一个定时器就少一类竞态。

**明确不做**：
- 不照抄 VS Code 的任务重连（我们没有 pty host 那样的进程外活体可认领）；
- 不给拆解造假 taskId 去蹭 `electron/tasks` 的终态；
- 不复用 `recoverable` 这个词（本仓已有确定且不同的语义）；
- 不加心跳 / 巡检定时器（跨进程才需要）。
