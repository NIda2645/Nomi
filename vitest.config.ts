import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["electron/**/*.test.ts", "src/**/*.test.ts", "evals/**/*.test.ts", "scripts/**/*.test.mjs", "tests/**/*.test.mjs"],
    environment: "node",
    // 单测不做真 fsync：临时目录的数据没人需要它跨掉电存活，但 fsync 会让墙钟随磁盘队列漂移，
    // 把 productionRun 的编排测试顶过 5000ms testTimeout（flake 根因）。见该文件顶部注释。
    setupFiles: [fileURLToPath(new URL("./tests/setup/durability.ts", import.meta.url))],
  },
  resolve: {
    alias: {
      // node 单测不得加载真 electron 运行时（import 即抛"failed to install"）。
      // 统一指向无副作用的桩；真实构建走 vite.config.ts，不受影响。
      electron: fileURLToPath(new URL("./tests/stubs/electron.ts", import.meta.url)),
    },
  },
});
