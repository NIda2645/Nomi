# 测试文件从来没被类型检查过 —— 补门岗 + 清 src 存量

日期：2026-08-25 · 分支：`claude/intelligent-engelbart-ff0100`

## 背景（为什么做）

`pnpm typecheck` 的绿灯只覆盖一半代码库：

- `tsconfig.app.json` 里 `exclude` 掉了 `src/**/*.test.ts`（339 个文件）。
- `electron/tsconfig.json` 里 `exclude` 掉了 `electron/**/*.test.ts`（352 个文件）。
- `evals/**/*.test.ts`（3 个文件）不在任何 tsconfig 覆盖范围内。
- vitest 用 esbuild 转译，**只删类型标注、从不核对**。

合计 **694 个测试文件**的类型无人检查。写在测试里的类型级护栏（`Required<T>` 夹具 /
`Record<keyof T,…>` 穷尽表 / `satisfies` / `@ts-expect-error`）等于装饰品，类型漂移不报红。

**排除的理由不是「慢」**——实测把测试放进检查范围耗时无差异（8.4/9.3/13.1s vs 8.6/10.0/10.2s，
同一档三次跑的波动比两档之间的差还大）。查 git：`tsconfig.app.json` 建档提交（80a47066，2026-06-05）
里排除和那句自相矛盾的注释（写着「含测试」）是**同一次写下去的**，从第一天起就是错的，且未记录任何理由。

实跑一次校准，挖出的不只是「写得糙」，还有真坏了的：

| 文件 | 问题 |
|---|---|
| `src/ui/browser/popover/browserAssetPopoverUtils.test.ts:7,87` | 同一标识符声明两遍，第二遍盖掉第一遍 → **有一条断言从未生效** |
| `src/workbench/generationCanvas/events/canvasEventReplay.property.test.ts:113` | `Op` 联合类型漏了 `lock` 变体，但 :80 会生成、:113 会处理 → 目录与动作漂移，`op.locked` 未受检 |
| `src/workbench/generationCanvas/adapters/clipboardImagePaste.test.ts:224` | 从 `[]`（长度 0 元组）取下标 0 |
| `src/config/modelArchetypes/seedance20Contract.test.ts:122` | `Object.hasOwn` 超出 `target: ES2020` |

## 范围（做什么）

1. **新增 `tsconfig.test.json`** —— 一份配置同时管 `src/` + `electron/` + `evals/` 的测试文件。
   必须新配一份而不是删两处 `exclude`：`electron/` 的测试会 import `src/` 下的东西（违反它
   `rootDir: "."`）且用了 ESM 顶层 await（与它 `module: CommonJS` 冲突），删 exclude 会炸出
   112 个纯配置形状错（TS6059/TS1378/TS1343）。实测新配置只剩真错。
   `target: ES2022` 是测试的诚实目标——vitest 在 Node 里跑测试，不是浏览器。
2. **新增棘轮门岗 `scripts/check-test-types.mjs` + `scripts/test-types-baseline.json`**
   —— 按「文件 → 错误数」记基线，只减不增；抄 `check-heavy-path.mjs` 的既有套路
   （含 `--update-baseline`）。
3. **清掉 `src/` 的 83 个错（37 个文件）**，其中上表 4 条按根因修（P2），不是塞 `any` 糊过去。
   清完 `src/` 不进基线 → 以后 src 测试**新增任何类型错当场报红**。
4. **`electron/` 124 个（44 文件）+ `evals/` 8 个（3 文件）进基线**，只减不增，后续慢慢清零。
5. 接进 `package.json` 的 `check:test-types` 与 `gates`；`tsconfig.app.json` 注释指向新配置。

## 不动项（明确不做）

- **不改 `tsconfig.app.json` 的 include/exclude**——那份是「app 构建面」的定位，测试不属于 app 构建面。
  只更新它的注释（已完成）。
- **不改 `electron/tsconfig.json`**——它要产出 `dist-electron`，`rootDir`/CommonJS 都是构建需要，
  不能为了查测试去动它。
- **不动任何测试的断言语义**——除非该断言本来就是坏的（上表 4 条）。修夹具只补字段，不改期望值。
- 不碰 `scripts/**/*.test.mjs`、`tests/**/*.test.mjs`（是 JS 不是 TS，另一个问题）。
- `evals/` 的 8 个错是 `.mjs` 无声明文件的 JS 互操作问题，与类型漂移不同类，只进基线不在本轮修。

## 回滚

单 commit 可整体 revert。新增文件（`tsconfig.test.json`、`scripts/check-test-types.mjs`、
`scripts/test-types-baseline.json`）删掉即回到原状；`src/` 测试的夹具补全是纯增量，
不影响运行时行为（vitest 本来就不看类型）。

## 验收门

- `npx tsc -p tsconfig.test.json` 在 `src/` 下 **0 错**。
- `pnpm run check:test-types` 绿（electron/evals 不超基线）。
- `pnpm run test` 全过，且**测试数不减少**（证明没靠删测试来消错）。
- `pnpm run gates` 全过。
- 上表 4 条逐条复验：重复声明消失、`lock` 进入 `Op` 联合、空元组下标修掉、`Object.hasOwn` 可用。
