import { vi } from 'vitest';

// 技能目录自 2026-09-18 起由 pi 的 `loadSourcedSkills` 给（ESM 岛 `electron/agentLane/laneSkillCatalog.mts`），
// 主进程 CJS 侧的 `readSkillRecords()` 经编译产物 `laneNativeLoader.cjs` 桥过去。vitest 跑的是源码，没有那座桥，
// 于是每一条经 skillStore 读目录的测试（制作 Run 的阶段证据、提示词库的策展半边、MCP 分发器）都会在桥上炸。
// 这里把桥换成岛本身：**同一条 `readSkillRecords`（pi 加载器、同一批有序根、同一份投影）**，只是不经 .cjs。
// 与 `networkTransport.ts` 同款纪律：换的是传输，不是行为；要验桥本身的用 agent-runtime 套件（它编译出 .cjs）。
// 岛 import 被 mock 的 skillStore，所以岛必须在调用时才 import（工厂里 import 会和模块图互等成死锁——2026-09-18 实跑撞过）。
vi.mock('../../electron/skills/skillStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../electron/skills/skillStore')>();
  return {
    ...actual,
    readSkillRecords: async () => (await import('../../electron/agentLane/laneSkillCatalog.mjs')).readSkillRecords(),
  };
});
