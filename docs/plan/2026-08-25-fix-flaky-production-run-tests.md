# productionRun 单测 flake：赛跑腿的收口 + R18 测试等待门岗

日期：2026-08-25 · 分支：`claude/laughing-mestorf-f98fdf` · 类型：测试基建（不改产品代码行为）
关系：**叠在 PR #139（`docs/plan/2026-08-25-production-run-test-flake-fsync.md`）之上的补件**，不是替代。

## 背景：同一个 flake 的两条腿

`electron/productionRun/**` 在并行 `vitest run` 下间歇翻红（干净 main 上 5 跑 4 挂），
失败统一是 `Test timed out in 5000ms`。这个 flake 站在两条腿上：

1. **耗时腿**——测试驱动真实事件溯源仓库，每条命令 3 次真 fsync，单文件 100–500 次；
   并行时 fsync 在同一磁盘排队，最重的测试从 4.9s 顶穿 5s。
   **PR #139 修掉了它**：`electron/durability.ts` 落盘屏障分级，单测全局 ephemeral，
   测试 20× 提速（4.9s → ~0.3s），并把 10 份复制粘贴的私有 `waitFor` 并回
   `waitForProduction` 一份（统一 2000ms、超时带 `check.toString()`）。
2. **赛跑腿**——「测试拿手感闹钟赛跑后台真实工作」这个**写法类**本身。
   #139 修完后余量 ~10×，但没有东西拦住下一个人再复制一份 500ms 闹钟进新测试；
   而且 #139 的收编漏了第 11 处：`productionStoryboardBinding.test.ts` 里一段
   **没有名字**的内联 `const deadline = Date.now() + 500` 轮询（不叫 waitFor，按名字扫不到）。

本分支交付赛跑腿的收口件。

## 本分支改了什么（在 #139 之上的 delta）

1. **`productionStoryboardBinding.test.ts`**：内联 500ms 截止轮询 → 共享 `waitForProduction`
   （与 #139 的其余 10 文件同款收编；至此该类在全仓清零）。
2. **`scripts/check-test-waits.mjs` + `check:test-waits` 进 `gates` 链（R18）**：
   扫所有 `*.test.{ts,tsx,mts,cts,mjs}`，两条规则硬零无基线——
   ① 私有 `waitFor` 定义（`function waitFor` / `const waitFor =`）；
   ② `Date.now()` + `deadline` 同行的墙钟截止轮询（抓改名/匿名的复制品，正是第 11 处的形态）。
   按模式扫而不按名字扫，是从第 11 处漏网学来的。
3. **对 #139「不调 testTimeout」的数据性修正**：`vitest.config.ts` 全局 `testTimeout: 30_000`
   + helpers `WAIT_TIMEOUT_MS` 2000 → 20_000（内层先于 vitest 抛**带条件源码**的错）。
   #139 反对调闹钟的理由是「那是把 fsync 根因藏起来」——根因已修，这条反对随之失效；
   而它的 CPU 负载对照没覆盖**文件系统层**的邻居争用：实测（下节）durability 修复后，
   8 个 fsync 锤子进程加载下 `productionGateIdempotency` / `productionQaVerify` 仍**两连挂**
   `Test timed out in 5000ms`（安静机器 5 连绿）。这台机器多 worktree 并行跑 gates 是常态，
   该条件不是假想。测试从未断言过自己的耗时；30s = 最重测试 ~100× 余量，真死锁照样红。
4. **文档**：`docs/engineering-rules.md` R18 详解 + CLAUDE.md 规则索引一行。

**不动项**：产品代码零改动；#139 的 durability 分级、helpers 收编、auto-label 设计全部原样采用。

## 验证

- 阳性对照 ①（两腿都没修，干净基线 + 8 fsync 锤）：**7 文件 / 9 测试挂**，全是
  `Test timed out in 5000ms`——仪器有效。
- 阳性对照 ②（只修耗时腿 = 纯 #139 态 + 同款锤）：**两连挂同样 2 文件 2 测试**（安静 5 连绿、
  serial 绿）——耗时腿修完，赛跑腿仍在，这就是第 3 条存在的理由。
- 终态（两腿都修）：并行 `npx vitest run electron` ≥5 次全绿 + 同款 fsync 锤 ≥2 次全绿 +
  `--no-file-parallelism` 全绿 + `pnpm run gates` 全过（数据见 PR 描述）。
- 独立旁证：本分支最初的单腿方案（60s waitFor + 120s testTimeout，不含 #139）也在
  5 快 + 2 锤全绿——两条腿各自都能止血，合在一起才是「快 + 不可赛跑 + 有门岗」。

## 回滚

单 commit 叠在 #139 之上，revert 即回 #139 态；#139 回滚不受本分支影响（门岗会红，提示重新收编）。
