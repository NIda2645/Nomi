# PR #188 主线整合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将用户明确要求合并的 #188 同步至包含 #184、#190、#193 的最新主线，保留双方行为并验证合并结果；同时封闭 Antigravity 特权 process parser 可被通用 catalog mapping 冒用的写入与运行时入口。#183 因独立复核发现直接上传多输入的任务类型缺口暂缓，不带入本次整合。

**Architecture:** main integration commit 只解决并行追加造成的 Git 冲突，保留模型目录发现与 Antigravity 类型，以及参数控制与首帧参考投影的全部回归用例。随后独立安全 commit 在 catalog mapping 唯一写入咽喉保留 `antigravity-cli-image` parser，并在 process dispatch 与 Antigravity 用户任务入口复核 canonical 身份和主进程验证证据；不改变模型契约、界面设计、账号权限或上游调用策略。

**Tech Stack:** Git、TypeScript、Vitest、Electron、现有 pnpm gates。

## 范围与不动项

- 隔离工作树：`/Users/aoqimin/Desktop/Nomi-pr188-main-integration-20260827`。
- 原 PR 起点：`2ff8517a131ec2a3f902fb0aef5c71da6b74aeaa`。提交前再次确认远端没有作者的新提交；禁止 force push。
- 手工解决 `electron/catalog/taskParams.test.ts` 与 `src/desktop/onboardingBridgeTypes.ts` 的追加冲突。
- 更新 `electron/ai/onboarding/onboardingIpc.test.ts` 的 Electron app 替身，补齐新注册的 Antigravity 生命周期所需 `on/quit`，保留全部网络和鉴权断言。合并后已观察 11 项测试因替身缺少 `app.on` 报红；这是测试宿主接缝，不改生产处理器。
- 不改共享主工作树、不重写任何既有提交、不放宽测试与安全检查。
- 安全修复严格 TDD：每组生产行为先写定向失败测试并观察预期 RED，再写最小实现；不得用 live/付费调用作为测试。
- Google 图像额度耗尽、独立 Gemini API 凭证缺失以及既有真实模型矩阵失败仍按原验收报告记录。本轮不重试已知耗尽的额度，不把模拟通过视为真实 GPU/上游调用通过。

## Task 1：整合并验证

- [x] fetch 最新 `origin/main`（当前 `aa26d3813e26845b41cd656d00258ae86145c486`）；运行 `git merge --no-commit --no-ff origin/main`。
- [x] 合并 bridge 顶部的独立类型导入，保留以下三个来源：

```ts
import type { ProviderKind } from './providerKind'
import type { AntigravityConnectionStatus, AntigravityTestRequest } from '../../electron/shared/antigravity'
import type { ModelListFailureKind } from '../../electron/ai/onboarding/modelListResponse'
export type { AntigravityConnectionStatus } from '../../electron/shared/antigravity'
```

- [x] 在测试文件中完整保留 `declared numeric and negative controls` 的两个用例，并在其独立 `describe` 结束后保留主线新增的帧意图优先与全内置 mapping 不变量两个 `describe`；只移除冲突标记、补回分组闭合，不改断言。
- [x] 运行 `pnpm exec vitest run electron/catalog/taskParams.test.ts electron/ai/onboarding/onboardingIpc.test.ts electron/ai/antigravityIpc.test.ts`，3 文件 / 54 测试全部通过。
- [x] `pnpm run gates` 退出码 0：779 测试文件、7278 测试通过，1 跳过；lint 0 错误、96 存量警告；类型与构建通过。组合构建的供应商模型发现走查退出码 0，生成请求 0。
- [ ] 复核合并 diff 与远端头；仅在工程验证通过后提交并普通 push 到 #188 的源分支，重新等待 Quality Gate / Mac Package。不使用管理员绕过。

## Task 2：mapping 写入保留字守卫（TDD）

- [ ] 在 `electron/catalog/antigravityWriteGuard.test.ts` 先写并观察 RED：其他 vendor 使用 `antigravity-cli-image` 时 enabled/disabled 均拒绝；canonical disabled mapping 无 proof 可写；canonical enabled mapping 无/错 capability proof 拒绝、exact image/edit historical proof 允许；复用同 id 的非 Antigravity enabled mapping 不得偷渡。
- [ ] 在 catalog 临时目录集成测试先写并观察 RED：`upsertModelCatalogMapping` 与 `importModelCatalogPackage` 都拒绝 reserved parser 冒用，import 失败时 vendors/models/mappings 整体不落盘。
- [ ] 在 `electron/catalog/antigravityWriteGuard.ts` 定义并导出单一 canonical validator。只允许 vendor `antigravity-cli`、model `generate_image`、taskKind `text_to_image|image_edit`，create/query 的 bin/parser/args 与 `antigravityCatalog` 单一 builder 一致，并拒绝额外 `build/fileParams/appendDownloadDir`。
- [ ] 从 `electron/catalog/catalogStore.ts::applyMappingUpsert` 调守卫，direct upsert 与 package import 自动共用。canonical disabled 不需 proof；enabled 要求当前 CLI version 下对应 image/edit 的历史 passed evidence，不使用十分钟 `canEnable`；vendor/model false→true 仍保留现有 fresh `canEnable`。
- [ ] 运行新增定向测试，确认 GREEN；再运行相关 catalog/Antigravity 回归。

## Task 3：旧污染 catalog 的运行时纵深（TDD）

- [ ] 在 `electron/catalog/processOperation.test.ts` 先写并观察 RED：任意其他 vendor/model 的 reserved parser 在 dispatch 前拒绝；canonical identity/process 仍调用 mock Antigravity task；畸形 args/危险 process 字段拒绝。
- [ ] 在 `electron/ai/antigravityTask.test.ts` 先写并观察 RED：无 evidence、failed/cancelled、错 capability、错 CLI version 均不得启动用户任务；current-version historical passed 可运行；text 保持同模型 text 或 vision proof 均可，vision/image/edit 必须 exact。
- [ ] 让 `electron/runtime.ts` 把 vendor/model/taskKind identity 传到 `executeProcessOperation`；该函数在 reserved parser 分派前复用 Task 2 的 canonical validator，拦截旧磁盘污染。
- [ ] 为 `AntigravityConnection` 增加不含十分钟 freshness 的 version-bound historical proof 查询；`runAntigravityTask` 首次幂等 restore 主进程 evidence、probe CLI version 后再检查 proof。verification 流程继续直接调用 `runAntigravityProcess`，不得经用户任务 gate 自锁。
- [ ] 运行新增定向测试，确认 GREEN；再运行 process/media/artifact/owner/cancel/IPC 全套回归。

## Task 4：验证与交付

- [ ] 运行 Electron 与 renderer typecheck、build，以及完整 `pnpm run gates`；读取完整输出并记录文件/测试计数。全程不设置 `NOMI_LIVE_ANTIGRAVITY`。
- [ ] 检查 diff 只含 main integration、安全修复、测试与本 plan；提交 scoped security commit。
- [ ] 再次确认 PR #188 远端 head 仍为起始 oid `2ff8517a131ec2a3f902fb0aef5c71da6b74aeaa`，普通 push `HEAD:codex/agnes-gemini-integration-20260826`，禁止 force。
- [ ] 可将 PR 从 draft 标记 ready，等待远端 Quality Gate / Mac Package；未经用户明确要求不得 merge。

## 回滚

未发布前保留隔离工作树和原 PR 头，不影响主线。发布后若需撤销，通过后续修复 PR 或明确批准的 revert，不 force push、不 reset 共享树。

## 验收记录

工程整合已验证；安全复核发现的阻塞方案已经批准并进入本计划执行，尚未 push、未将 PR 标为 ready 或合入：

- `catalogStore.applyMappingUpsert` 接受通用映射的 `process.parser`；当前只对 Antigravity vendor/model 启用实施证明校验，没有映射层校验。
- `processOperation.executeProcessOperation` 只凭 `antigravity-cli-image` parser 分派，不核对 vendor/model 身份。其他供应商映射因此可能调用已登录的 Antigravity CLI，绕过预期身份与试跑门槛。
- 需在映射 upsert/import 与运行边界校验保留执行器的身份、结构和对应证明，并补拒绝路径回归。该生产行为修复使用独立 security commit，不混入 main integration merge commit。
- 本地界面证据：`/var/folders/f4/vz86j5nd0_sf56qdhzrmbbvw0000gn/T/nomi-model-discovery-asIiqP`。真实上游验证缺口与工程验证继续分开报告。
