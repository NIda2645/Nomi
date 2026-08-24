/**
 * 全仓**唯一**关掉落盘屏障（fsync）的地方 —— 由 `vitest.config.ts` 的 `setupFiles` 挂上。
 *
 * 为什么：单测把数据写进 `os.mkdtemp()` 的临时目录、进程退出即丢，没有任何消费者需要它跨掉电存活，
 * fsync 在这里的价值恰好为零；成本却是套件的绝大部分耗时（本机实测 productionRun 子集
 * 98.7 s → 4.95 s）。更要命的是它让墙钟随磁盘队列深度漂移 —— 最重的几个 productionRun 测试
 * 因此贴在 Vitest 默认 5000 ms `testTimeout` 上间歇性红。完整根因见
 * `docs/plan/2026-08-25-production-run-test-flake-fsync.md`。
 *
 * 开关放在 harness 层（而不是让每个测试自己传 `durability: 'ephemeral'`）是故意的：
 * 将来新写的测试自动就在 ephemeral 下跑，**不可能忘记**，flake 长不回来。
 *
 * 要断言真·崩溃语义的测试，自己在 `beforeEach` 翻回 `'durable'`、`afterEach` 翻回来 ——
 * `electron/durability.test.ts` 就是这么钉住生产保证的。
 */

import { setDurabilityMode } from "../../electron/durability";

setDurabilityMode("ephemeral");
