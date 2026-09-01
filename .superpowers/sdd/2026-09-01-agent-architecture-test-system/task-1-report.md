# Task 1 / M0 Report

Commit: `6cba650d`

## 改动文件

- `tests/agent-system/schema.mts`
- `tests/agent-system/schema.node-test.mts`

## 设计决策

- 用单一 `AGENT_SYSTEM_SCHEMA_VERSION = 1` 冻结 case / trace / evidence / verdict 的版本策略，版本不匹配直接拒绝。
- case schema 只保留目标、输入、预算、环境、禁用 effect、rubric 和 evidence 引用，不包含答案字段。
- J1-J5 以纯数据方式固化为 charter baseline，预算默认零金额、有限 turns/tokens，便于后续 fake-provider 分层接入。
- authority / adapter owner 只做当前 `docs/ARCHITECTURE-NOW.md` 对齐快照，不把它们混成生产逻辑。
- harness self-test 只做纯函数比较，专门验证“预期 Item 未消费”和“effect 次数错误”两类失配。

## 命令和输出

- `pnpm install --frozen-lockfile --ignore-scripts`
  - 输出：lockfile up to date，安装完成，补齐 `vitest` / `tsx` / `zod` 等本地依赖。
- `node --import tsx --test tests/agent-system/schema.node-test.mts`
  - 输出：4/4 tests pass。
- `pnpm exec tsc --noEmit --skipLibCheck --module ESNext --moduleResolution Bundler --target ES2022 --allowImportingTsExtensions tests/agent-system/schema.mts tests/agent-system/schema.node-test.mts`
  - 输出：exit 0。
- `pnpm exec prettier --check tests/agent-system/schema.mts tests/agent-system/schema.node-test.mts`
  - 输出：All matched files use Prettier code style.

## 剩余担忧

- 这版只冻结了 M0 contract / charter / self-test，尚未接入后续 fake provider、fault matrix、property、journey 流程。
- 当前 authority / adapter owner 表是对 `docs/ARCHITECTURE-NOW.md` 的手工对齐快照，后续若现状漂移，需要同步更新。
- 新测试目前用 `node --import tsx --test` 直接跑；后续若要纳入现有 test-system 编排，还需要把 profile / discovery 接进脚本层。

## Fix round 1

- 按架构审查要求把 `agentSystemAuthorityAdapterOwners` 改成 current/planned 分层，当前真实 seam 明确落到 `electron/productionRun/productionRunRuntime.ts`、`electron/harness/context/contextService.ts`、`electron/harness/runtime/pi/session.mts`、`electron/harness/runtime/pi/run.mts`、`electron/capabilityCore/rendererBridge.ts`、`electron/skills/skillStore.ts`；未存在的目标架构只以 `planned` 标记在 `tests/agent-system/harness/`。
- 追加 schema/node-test 断言，确保 current seams 和 planned test doubles 不混淆。
- 复跑结果：`node --import tsx --test tests/agent-system/schema.node-test.mts` 5/5 pass；`pnpm exec tsc --noEmit --skipLibCheck --module ESNext --moduleResolution Bundler --target ES2022 --allowImportingTsExtensions tests/agent-system/schema.mts tests/agent-system/schema.node-test.mts` exit 0；`pnpm exec prettier --check tests/agent-system/schema.mts tests/agent-system/schema.node-test.mts` pass。
