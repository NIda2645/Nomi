# 拆解中断后，分镜表节点不再永远停在「进行中」

> 状态：🚧 进行中（分支 `fix/deconstruction-node-terminal-state-20260922`）· 2026-09-22
> 根因合同：`docs/fixes/2026-09-22-deconstruction-node-terminal-state.root-cause.json`
> TODO：T-ED-06（发版前阻断，用户 2026-09-22 拍板）

## 0. 一句话

拆解跑到一半关掉 app 再打开，分镜表节点**永久停在「本地找切点 / 0 镜」**——不报错、不续跑、
不提示可重试。不是没人收敛，是**收敛完又被事件尾巴重放原样盖了回去**。

---

## 1. 概念占用表（R33）：「拆解任务的终态」这件事今天住在哪

### 1.1 数门

```
node scripts/door-map.mjs deconstructVideo --roots=electron,src
  → 写入口 1 扇：electron/video/videoIpc.ts:43 deconstructVideo
```

引擎入口只有一扇，很干净。**问题不在引擎，在读回来那一侧**。真正拥挤的是「节点状态的写口」：

| # | 写口 | 写的是什么 | 今天谁在为这句话作保 |
|---|---|---|---|
| 1 | `factBridge.ts` 起跑前 | `status: 'running'` | 发起它的那次 `deconstruct()` promise |
| 2 | `factBridge.ts` 进度回调 | `phase` / `progressDetail` | 同上 |
| 3 | `factBridge.ts` 完成 / 失败 | `ready` / `failed` | 同上 |
| 4 | `shotTableFacts.ts` | `ready` + 全表 | 同上 |
| 5 | `canvasSnapshotNormalizer.ts`（09-10 加） | `running → idle` | **快照这一趟**——而这正是漏的地方 |
| 6 | `generationCanvasStore.applyEventTail` | 重放事件日志里的任何 patch | **没有人**：它照抄磁盘，包括抄回 `running` |

第 5 扇和第 6 扇是同一个概念的两个主人，**而且执行顺序是 5 先 6 后**。
两个主人对同一格给出相反结论，后说话的那个赢。

### 1.2 「中断」有几种，每种今天落到哪

| 中断方式 | 今天落到哪 | 该落到哪 |
|---|---|---|
| **进程重启**（关 app / 崩溃） | ❌ `running`（快照收成 `idle`，事件尾巴又写回 `running`） | 中断，可重试 |
| **窗口关闭 / 切项目**（A→B→A） | ❌ `running` **永久焊死**（且有一条单测正把它钉住） | 中断，可重试 |
| **用户取消** | ❌ **根本没有取消这个动作** | 取消 |
| **ffmpeg 子进程死** | ✅ `failed` + ffmpeg 原话（`detectShotCuts` 的 `close` 事件 → 抛 `ShotCutError` → IPC reject → catch） | 不变 |
| **供应商 / 本地模型超时** | ✅ 逐镜 `visionFailed` + 整批 `ready`（诚实回报，见 09-17 §6.3） | 不变 |

五种里两种落在非终态、一种压根没有出口。**「永远在跑」这一格是真实存在的，而且有三条路通向它。**

### 1.3 owner 定为一份

> **「这次拆解还有没有可能完成」这个判断，归攥着那个 promise 的那一层所有。**

视频拆解**不是任务表里的一行**：它没有 `taskId`、没有可轮询的上游、重启后没有任何东西能替它续跑
（`electron/tasks/*` 那套终态是给**可轮询的供应商任务**用的——查了，拆解不走它，所以不存在
「读任务表的终态」这个选项，也就不该硬塞一个假 taskId 进去）。
在飞与否，只有发起它的**那个渲染进程**知道；磁盘上的 `status: 'running'` 只是它的一张影子照片。

于是落点是 `src/workbench/generationCanvas/nodes/shotTable/deconstructionLifecycle.ts`：
一份**在飞登记**（模块级单例，与渲染进程同寿命）+ 一个**纯收敛函数**。
节点**不自己算终态，只投影它**。

**不新造第二套状态机**：`deconstructionShotTableSchema.source.status` 仍是唯一那一份状态词表，
本次只往里加了两格，读侧判据全部收口到 `isDeconstructionTerminal` / `canRestartDeconstruction`
两个函数，JSX 与 store 都不再各列一遍状态词。

### 1.4 避让（#837 已合那一刀）

先读了 `docs/plan/2026-09-22-shot-cut-truncation.md` 与
`docs/fixes/2026-09-22-shot-cut-truncation.root-cause.json`。那一刀的判据是
**「这批结果给全了没有」必须有跨进程的 owner、且写侧必填」**（`shotCutCoverage`）。
本次动 `electron/shared/canvas/shotTable.ts` 只加了 `status` 的两个成员，
`cutCoverage` 那一块**一个字没碰**；`detectShotCuts.ts` / `deconstructVideo.ts` **完全没动**。
两刀方向一致（都是「把一份没人拥有的状态收给一个 owner」），不冲突。

---

## 2. 根因

`writeTable` 每写一次进度都走 `store.updateNode(..., { history: false })`。
`history: false` 只关掉撤销栈，**没有关掉事件发射**（`shouldEmitCanvasMutation` 只看 `emit`）。
于是拆解过程中的每一下 `status: 'running'` 都作为 `canvas.node.updated` 进了事件日志。

重开项目时：

```
restoreSnapshot(payload.generationCanvas)      ← 快照里 running，收敛成 idle ✅
  ↓
replayCanvasEventTailAndSealGenesis()
  → applyEventTail(canvas.* 尾巴)               ← 把 running 原样写回来 ❌
```

收敛发生在重放**之前**，等于没发生。再叠上两条：
`deconstructToShotTable` 对 `running` 直接早退（不会重跑），
footer 的重试钮只认 `failed` / `idle`（不会出现）。三者合起来 = 点不动的空白格。

### 类根因

> **一份状态有两个主人，而且执行顺序决定谁赢。** 快照归一化说了一句真话（「没有活着的调用了」），
> 事件重放随后说了一句过期的话（「它在跑」），后者赢，因为它在后面。
> 收敛的判据挂在「哪一趟读路径」上，而不是挂在「这件事本身」上——换条读路径就漏。

---

## 3. 先查别人（R5）：别人怎么处理「进程重启时在飞的活」

| 产品 | 做法 | 本次实读出处 |
|---|---|---|
| **本仓 · 生成节点** | `convergeStuckMidFlightNode`：有 `taskId` → `recoverable`（免费续查）；无 → `idle`。09-17 走查 §5.2 H 记着这条「诚实、可恢复」，并当场点名它和拆解那条形成鲜明对比 | `src/workbench/generationCanvas/store/canvasSnapshotNormalizer.ts` |
| **本仓 · 生成队列** | `QueueEntryState` 有独立的 `cancelled`，与 `error` 分开记 | `runner/generationQueueStore.ts` |

**结论：答案就在同一个 app 里。** 生成节点那条路早就做对了——重启后在飞的活变成「可找回 / 重新拉取」，
而不是继续转圈。本次做的事，本质是把**同一个诚实**补到拆解这条路上。
差别只在续跑方式：生成节点有 `taskId` 可以免费续查；拆解没有，所以它的找回入口是「重新拆解」。

---

## 4. 改了什么

| 状态 | 含义 | 用户的下一步 |
|---|---|---|
| ⏳ `running` | **唯一非终态**，且只在这个渲染进程真有一次在飞调用时才成立 | 等，或点「取消拆解」 |
| ✅ `ready` | 拆完了（可能带一句「对白没取到」） | 勾镜头加进画布 |
| ❌ `failed` | 跑挂了，有供应商 / ffmpeg 的原话 | 看原因 → 重新拆解（重新付费） |
| 🔁 `interrupted` | 跑过、被关 app / 切项目打断。没有原因可说，**证据都在** | 重新拆解 |
| 🚫 `cancelled` | 用户自己不要了 | 重新拆解 |
| ⚪️ `idle` | **从没拆过** | 开始拆解 |

1. **终态 owner**（新文件 `deconstructionLifecycle.ts`）：在飞登记 + 纯收敛函数
   `convergeDeconstructionTable`。判据只有一条——`running` 而登记里没有它 → `interrupted`。
2. **两条读路径共用它**：快照归一化 **和** 事件尾巴重放之后各调一次（幂等）。
   重放之后那一次是修好重启卡死的关键。
3. **引擎调用前后登记 / 注销**；`finally` 里整张画布扫一遍。
   扫全画布而不是只写发起时那个 id：收敛不携带任何引擎产出，它是一句关于**当前这张画布**的真话，
   所以既不需要套「原项目仍当前」那道写回闸（那道闸挡的是迟到的**结果**），也不可能串到别的项目去。
4. **取消**：新增 `cancelDeconstruction`。IPC 的 invoke 没有取消口，所以取消 = 把这次调用的结果作废。
   取消**不记成失败**——那会在「这台机器上拆解成功率」里留一条假失败。
   停在 `running` 却没有在飞调用时点它，按 owner 判据落 `interrupted`（不留点不动的按钮）。
5. **UI**：中断 / 取消的说明是**中性色、不带 `role="alert"`**（它不是失败）；
   找回入口判据换成 `canRestartDeconstruction`；`running` 时多一颗「取消拆解」。
6. **i18n 中英两语**，词表 baseline 登记两个新成员并写清三者为什么不可合并。

---

## 5. 红绿证明

新测 4 条，**先在 main 上验红**（`deconstructionTerminalState.redproof.test.ts`，验完即删）：

| 断言 | main | 本分支 |
|---|---|---|
| 重启（快照 + 事件尾巴重放）后不是 `running` | ❌ `expected 'running' not to be 'running'` | ✅ `interrupted` |
| 项目被换走后不是 `running` | ❌ 同上 | ✅ `interrupted` |
| 用户取消 → `cancelled` | ❌ `expected 'running' to be 'cancelled'` | ✅ |
| ffmpeg 子进程死 → `failed` + 原因 | ✅ **本就绿**（钉住不回退） | ✅ |

另有 4 条 owner 纯函数单测（只有 running 不是终态 / 在飞时不收敛 / 中断要清掉 `phase` 与
`progressDetail` 这两条「还在演」的视觉证据 / 收敛幂等 / 在飞登记只认自己那次 requestId）。

**两条既有单测的断言被改了**，改的是「表停在哪一格」，**不是**它们原本要钉的那件事
（「迟到的引擎结果不许写回」——这一条一字未动）：

- `rejects an old completion when the same project canvas is restored`：`idle` → `interrupted`
- `never writes a late engine result after the originating project was replaced, even A to B to A`：
  `running` → `interrupted`。**后面这一条原本正把 bug 本身钉住**。

真机走查：`tests/ux/deconstruction-interrupted-recovery.walk.mjs`（零成本，不调模型）。
用 store seam 摆出「磁盘上留着一张 running 的表」这个前置现场，然后**真的关 app、真的再启一次**，
断言全落在重启后的真实界面上：① 不再印「本地找切点」② 有一句说人话的中断说明
③ 「重新拆解」可见且可点。外加 R15 双轨（English 下那句话是英文）。

---

## 6. 没做 / 留着

- **重启后不自动续跑。** 拆解的后半段要花钱，替用户重新发起就是替他花钱。
  找回入口是一颗要他点的按钮。
- **没有跨进程的在飞登记。** 主进程那次调用在 app 被杀时一并没了，不存在「app 死了但拆解还在跑」
  的情形，所以登记留在渲染进程即可。若将来拆解改成主进程常驻任务，这份登记要跟着上移。
- **取消不打断主进程那次调用**（IPC invoke 没有取消口）：本地切点那几秒可能仍在跑完，
  只是结果不再写回。真正的中断需要给 `deconstructVideo` 加一条取消通道，本次未做。
- **T-DS-17（画面六格失败不给原因）不在本刀范围**，它是 `visionFailed` 的渲染问题，另案。
