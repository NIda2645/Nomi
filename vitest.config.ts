import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * 真素材腿的文件名约定 —— 这份清单只有这一个 owner。
 * 默认车道按它 exclude，`vitest.realMedia.config.ts` 按它 include，两边读同一个常量，
 * 不会出现「一边排掉了、另一边没收进来」的静默空洞（正是本分支在修的那类根因）。
 */
export const REAL_MEDIA_TESTS = ["**/*.realMedia.test.ts"];

/** 两条车道都要排掉的产物目录。同样只有一个 owner，免得两边各写一份、漂成两套。 */
export const BUILD_ARTIFACTS = ["**/node_modules/**", "**/dist/**", "**/dist-electron/**"];

export default defineConfig({
  test: {
    // scripts/ 两种后缀都收：历史门岗脚本是 .mjs，需要 import 仓库 TS 的脚本（如 model-radar 要
    // 从 seedBuiltins/档案 derive「我们接了哪些模型」）只能是 .ts。漏掉 .ts 的后果是**测试文件静静躺着不跑**
    // ——比没写测试更糟，因为它看起来有覆盖。
    include: [
      "electron/**/*.test.ts",
      "src/**/*.test.ts",
      "evals/**/*.test.ts",
      "scripts/**/*.test.mjs",
      "scripts/**/*.test.ts",
      "tests/**/*.test.mjs",
    ],
    // 真素材腿**不进这条车道**。它们按设计「缺素材就硬红」（R13 四件真实第④件 / R17：
    // 登记即放绿的 skip 是自欺），而 CI runner 上没有那 1.38GB 素材——放进来只会让每个 PR
    // 红在一件与改动无关的事上，红灯一旦不可信，人就开始绕过它。
    // 登记表 tests/ux/real-media-fixtures.json 里其余 live 条目（.probe.mjs / .walk.mjs /
    // scripts/*.ts）天然落在 include 之外，本行只是把同一条规矩写给 *.realMedia.test.ts。
    // 跑它：`pnpm run test:real-media`（缺素材照样硬红，不 skip）。
    exclude: [...REAL_MEDIA_TESTS, ...BUILD_ARTIFACTS],
    environment: "node",
    // 单测不做真 fsync：临时目录的数据没人需要它跨掉电存活，但 fsync 会让墙钟随磁盘队列漂移，
    // 把 productionRun 的编排测试顶过 5000ms testTimeout（flake 根因）。见该文件顶部注释。
    setupFiles: [fileURLToPath(new URL("./tests/setup/durability.ts", import.meta.url)),
      fileURLToPath(new URL("./tests/setup/networkTransport.ts", import.meta.url)),
      // 技能目录的 CJS→岛桥在源码上不存在（要编译产物）；单测里把 readSkillRecords 直接接到岛上（见文件头）。
      fileURLToPath(new URL("./tests/setup/skillCatalogBridge.ts", import.meta.url))],
    // flake 的另一条腿：测试自己不 fsync 了，但**邻居进程**打满文件系统时（这台机器 20+ worktree
    // 并行跑 gates 是常态），最重的编排测试仍会被外部负载从 ~300ms 拖过 5s——2026-08-25 实测：
    // 8 个 fsync 锤子进程加载下，durability 修复后 productionGateIdempotency / productionQaVerify
    // 仍两连挂在「Test timed out in 5000ms」，而安静机器 5 连绿。测试从未断言过自己的耗时，
    // 拿墙钟当判据只会把「机器忙」误报成「代码坏」。30s = 最重测试的 ~100× 余量，真死锁仍然会红。
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      // node 单测不得加载真 electron 运行时（import 即抛"failed to install"）。
      // 统一指向无副作用的桩；真实构建走 vite.config.ts，不受影响。
      electron: fileURLToPath(new URL("./tests/stubs/electron.ts", import.meta.url)),
    },
  },
});
