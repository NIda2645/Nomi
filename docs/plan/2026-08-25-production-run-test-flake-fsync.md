# productionRun 单测 flaky 根因修复：durability barrier 分级

> 2026-08-25 · 分支 `claude/brave-hopper-552d34`

## 症状

`electron/productionRun/**` 的测试在**干净 `origin/main`** 上间歇性红，导致 `pnpm run gates`
（`... && pnpm run test && pnpm run build`）谁都跑不过，push 闸的 `.claude/.gates-ok` 永远盖不上。

失败个数在 1 → 2 → 7 → 12 之间跳，但失败文件恒在 `electron/productionRun/**` 内 —— 典型的
负载/时序敏感，不是逻辑回归。

## 根因（实测，不是猜）

失败信息统一是 **`Error: Test timed out in 5000ms.`** —— Vitest 默认 `testTimeout`。

这些测试跑的是**真的**事件溯源仓库，每条命令要落三次带 `fsync` 的盘：
事件追加（`appendDurableJsonLine`）+ 命令追加 + 快照原子重写（`writeJsonFileAtomic`）。
一个测试文件因此产生 **100–500 次 fsync**。

实测（本机 macOS APFS）：

| 指标 | 空载 | 全量套件并行时 |
|---|---|---|
| 单次 `fsyncSync` | ~5 ms | **~10–11 ms** |
| 单测 fsync 占墙钟 | — | **42–50 %** |

把 `fsyncSync` 换成 no-op 后逐项对照：

| 测试 | 带 fsync | 去 fsync | 倍数 |
|---|---|---|---|
| `productionQaVerify`（最重） | 4907 ms | **298 ms** | 16× |
| `productionShotGate` | 4012 ms | 258 ms | 16× |
| `productionSampleGate` | 3642 ms | 199 ms | 18× |
| `productionRunPauseSemantics` | 3489 ms | 189 ms | 18× |
| `productionGateIdempotency` | 3519 ms | 133 ms | 26× |
| productionRun 子集总测试时间 | 98.7 s | **4.95 s** | 20× |

去掉 fsync 的收益（20×）远大于 fsync 自身占比（42–50%），因为并行 worker 的 fsync 会在同一设备上
排队——**移除它同时消掉了拖慢其它一切的 I/O 争用**，效果是超线性的。

**结论**：最重的几个测试本来就贴在 4.9 s / 5000 ms 上（余量 2%），全量套件一起跑时 fsync 延迟翻倍，
直接把它们顶过线。哪几个红取决于那一刻磁盘队列多深 —— 这就是 flake 的全部来源。

**波及面不止 productionRun**：全量套件共 **45 s** 花在 fsync 上、涉及 **67 个测试文件**；
productionRun 占 80%，另有 `capabilityCore/core.test.ts`（2.3 s）、`providerAdapter/service.test.ts`（1.75 s）等。
所以修在 productionRun 层不够，要修在**共享的 durability 原语**层（P2 修根因 + 通用性判定）。

## 改法

fsync 的意义是「掉电/崩溃后数据不撕裂」（见 `jsonFile.ts` 注释：保护 `project.json` 不被
「保存时崩溃 → 整个项目丢了」打掉）。这个保证在**生产必须留**；但在测试里，数据写进
`os.mkdtemp()` 建的临时目录、进程退出即丢，**没有任何消费者需要它跨崩溃存活** —— 保证值为零、成本却是套件 95% 的耗时。

于是把 durability barrier 抽成一个显式开关，**由测试框架在唯一一处翻**，而不是让原语去嗅探环境：

1. **新增 `electron/durability.ts`** —— `setDurabilityMode()` / `fsyncIfDurable()`，默认 `'durable'`。
2. `electron/jsonFile.ts`、`electron/productionRun/productionRunRepository.ts`、
   `electron/productionRun/productionRunLock.ts` 的 fsync 点统一走 `fsyncIfDurable()`。
3. **新增 `tests/setup/durability.ts`** —— 调 `setDurabilityMode('ephemeral')`；
   经 `vitest.config.ts` 的 `setupFiles` 挂上。**这是全仓唯一一处关 fsync 的地方。**
4. **新增 `electron/durability.test.ts`** —— 钉住生产保证：`'durable'` 模式下
   `writeJsonFileAtomic` / 事件追加**必须**真的调 `fsyncSync`（P1：不许留悄悄削弱生产的逃生口）。

### 为什么不选另外两条

| 方案 | 代价 |
|---|---|
| 每个 factory 注入 `durability`，21+ 测试文件各传一次 | churn 大；**每个新写的测试都可能忘 → flake 会重新长回来**，还得再加一道 grep 棘轮才拦得住。花得更多、护得更少。 |
| 调大 `testTimeout` | 明确不做：那是把 flake 藏起来，不是修它。阈值挪一挪，负载再重一点照样红。 |

选中的做法是唯一「**新测试不可能忘**」的：开关在 harness 层，全仓 67 个文件一次性受益，
将来新增的测试自动就在 ephemeral 模式下跑。

## 顺带修掉的第二个洞：10 份复制粘贴的 `waitFor`

改的过程中发现 `electron/productionRun/*.test.ts` 里散着 **10 份一模一样的 `waitFor`**，
默认超时从 500 一路飘到 5000 —— 这正是当年给 flake 一处一处打补丁留下的年轮
（5000 = `testTimeout` 本身，等于那道闸永远轮不到它先响）。同时违反 P1「加新必删旧、不许并行版」，
因为 `productionRunTestHelpers.ts` 里本来就有一份 `waitForProduction`。

更糟的是其中一份有实质缺陷：

| 文件 | 超时后 |
|---|---|
| 其余 9 份 | `throw new Error('waitFor timed out')` |
| **`productionRunDriver.test.ts`** | **什么都不做，静默往下走** |

也就是说该文件 9 处 `waitFor` 在负载下会**悄悄放行**，后面的断言在一个没推进完的状态上跑 ——
假绿，而且长得和真绿一模一样。这多半就是它在用户那次 12 个失败里症状飘忽的原因。

已全部并到 `waitForProduction` 一份：统一 2000 ms 预算（约为实际耗时的 10×），
超时信息带上 `check.toString()`（「waitFor timed out」看不出在等什么）。
合并后 192/192 全过 —— 没有任何测试是靠那条静默放行才绿的。

## 不动的东西

- `src/workbench/ai/**` —— 与本次无关，不碰。
- 生产默认值：`'durable'` 不变；生产代码不读任何环境变量来决定要不要 fsync。
- 各测试自己的 `waitFor(...)` 轮询：修完后余量从 2% 涨到 ~94%（0.3 s / 5 s），先不动；
  真要再收紧留作后续（见「验收」第 3 条的实测余量）。

## 验收结果（已实测，2026-08-25）

**1. 全量套件连续 13 次全绿，0 次 timeout。**（单次绿不算数——子集本来就是绿的）

| 批次 | 结果 |
|---|---|
| 修 fsync 后 × 5（空载） | 5/5 绿，`6250 passed`，timeouts=0，墙钟 21–42 s |
| 合并 `waitFor` 后 × 5（空载） | 5/5 绿，同上，24–38 s |
| 合并 `waitFor` 后 × 3（**跑满所有核心的人造 CPU 负载**） | 3/3 绿，timeouts=0，29–34 s |

对照修复前同一台机器：`7 failed`，错误全是 `Test timed out in 5000ms`。

**2. 余量从「贴着线」变成「远离线」**（对 5000 ms `testTimeout`）：

| 测试 | 修复前 | 修复后 | 余量 |
|---|---|---|---|
| `productionQaVerify`（原最重） | 4907 ms | ~300 ms | 1.02× → **~16×** |
| `productionTrustLevel` budget_only | 3418 ms | 391 ms | → ~13× |
| `productionTrustLevel` set_trust | 3646 ms | 315 ms | → ~16× |
| productionRun 子集总测试时间 | 98.7 s | 4.18 s | **20×** |

**3. 反向保证有效**：`electron/durability.test.ts` 4 条全过 —— `'durable'` 下
`writeJsonFileAtomic` / 事件追加确实调了 `fsyncSync`，`'ephemeral'` 下不调**且写入字节完全一致**。

**4. 全门**：`pnpm run gates` 全过（这正是用户报的「谁都跑不过」的那条链）。
`lint:ci` 97 warnings（棘轮 98，删掉重复 helper 后还降了 1）。

### 仍然最厚的那块（不是 flake，记录在案）

`productionRunE2eFixture` 的「materializes a playable local clip and a valid MP4」约 1.2 s ——
真在编码 MP4，CPU-bound，跟 fsync 无关，也从未出现在这次的失败集里。余量 ~4×，暂不动。

## 回滚

改动集中在 4 个新/改文件 + `vitest.config.ts` 一行 `setupFiles`。
回滚 = 还原这几个文件；生产行为本来就没变，回滚无数据风险。
