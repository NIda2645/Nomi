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

- [x] 在 `electron/catalog/antigravityWriteGuard.test.ts` 先写并观察 RED：其他 vendor 使用 `antigravity-cli-image` 时 enabled/disabled 均拒绝；canonical disabled mapping 无 proof 可写；canonical enabled mapping 无/错 capability proof 拒绝、exact image/edit historical proof 允许；复用同 id 的非 Antigravity enabled mapping 不得偷渡。
- [x] 在 catalog 临时目录集成测试先写并观察 RED：`upsertModelCatalogMapping` 与 `importModelCatalogPackage` 都拒绝 reserved parser 冒用，import 失败时 vendors/models/mappings 整体不落盘。
- [x] 在 `electron/catalog/antigravityWriteGuard.ts` 定义并导出单一 canonical validator。只允许 vendor `antigravity-cli`、model `generate_image`、taskKind `text_to_image|image_edit`，create/query 的 bin/parser/args 与 `antigravityCatalog` 单一 builder 一致，并拒绝额外 `build/fileParams/appendDownloadDir`。
- [x] 从 `electron/catalog/catalogStore.ts::applyMappingUpsert` 调守卫，direct upsert 与 package import 自动共用。canonical disabled 不需 proof；enabled 要求当前 CLI version 下对应 image/edit 的历史 passed evidence，不使用十分钟 `canEnable`；vendor/model false→true 仍保留现有 fresh `canEnable`。
- [x] 运行新增定向测试，确认 GREEN；再运行相关 catalog/Antigravity 回归（9 文件 / 137 测试通过）。

## Task 3：旧污染 catalog 的运行时纵深（TDD）

- [x] 在 `electron/catalog/processOperation.test.ts` 先写并观察 RED：任意其他 vendor/model 的 reserved parser 在 dispatch 前拒绝；canonical identity/process 仍调用 mock Antigravity task；畸形 args/危险 process 字段拒绝。
- [x] 在 `electron/ai/antigravityTask.test.ts` 先写并观察 RED：无 evidence、failed/cancelled、错 capability、错 CLI version 均不得启动用户任务；current-version historical passed 可运行；text 保持同模型 text 或 vision proof 均可，vision/image/edit 必须 exact。
- [x] 让 `electron/runtime.ts` 把 vendor/model/taskKind identity 传到 `executeProcessOperation`；该函数在 reserved parser 分派前复用 Task 2 的 canonical validator，拦截旧磁盘污染。
- [x] 为 `AntigravityConnection` 增加不含十分钟 freshness 的 version-bound historical proof 查询；`runAntigravityTask` 首次幂等 restore 主进程 evidence、probe CLI version 后再检查 proof。verification 流程继续直接调用 `runAntigravityProcess`，不得经用户任务 gate 自锁。
- [x] 运行新增定向测试，确认 GREEN；再运行 process/media/artifact/owner/cancel/IPC 全套回归（与 Task 2 合并定向回归 9 文件 / 137 测试通过）。

## Task 4：验证与交付

- [x] 运行 Electron 与 renderer typecheck、build，以及完整 `pnpm run gates`；780 测试文件中 779 通过 / 1 跳过，7293 测试中 7292 通过 / 1 跳过；lint 0 错误 / 96 存量 warning；renderer 与 Electron build 通过。全程未设置 `NOMI_LIVE_ANTIGRAVITY`。
- [ ] 检查 diff 只含 main integration、安全修复、测试与本 plan；提交 scoped security commit。
- [ ] 再次确认 PR #188 远端 head 仍为起始 oid `2ff8517a131ec2a3f902fb0aef5c71da6b74aeaa`，普通 push `HEAD:codex/agnes-gemini-integration-20260826`，禁止 force。
- [ ] 可将 PR 从 draft 标记 ready，等待远端 Quality Gate / Mac Package；未经用户明确要求不得 merge。

## Task 5：规格审查二轮——operation envelope 与 stage 绑定（TDD）

- [x] 先写并观察 RED：篡改 create body、create 新增 paramMap、query 新增 body、create 换成 `query_result`、query 换成 `text_to_image` 均拒绝；额外 operation 字段与错误 response_mapping 也拒绝。
- [x] 将 canonical builder 提升为完整 create/query `HttpOperation` envelope 单一真相；比较覆盖所有字段且不依赖对象 key 顺序。
- [x] 显式引入 `create|query` stage：`executeProfileOperation` 在持有完整 operation 的边界校验对应 canonical envelope，再将 stage + identity 传给 `executeProcessOperation`；process choke 复核该 stage 的 canonical process。
- [x] 追踪生产 create/query 调用点（任务提交、任务轮询、catalog mapping 测试、adapter verification），显式传 stage；其他 vendor 的 HTTP/process transport 保持兼容，不接受 renderer 自报的 trusted flag。
- [x] 定向回归 27 文件 / 325 测试、typecheck、build、完整 gates 全绿；完整测试 780 文件中 779 通过 / 1 跳过，7302 项中 7301 通过 / 1 跳过。
- [ ] 提交独立 fix；确认远端仍为 `01c7a52f7c049f140dc98d2132bf33bf72833cff`，普通 push 同一 PR 源分支，不 force、不 merge。

## Task 6：规格审查三轮——CLI executable identity 与付费前置闸（TDD）

- [x] 系统追踪 probe → proof → process spawn 以及 `runTask` 的 cache → grant → execute → trace/admit 顺序，记录当前两个断点：只传 version，且 canonical/evidence 晚于 grant 消费。
- [x] 先在 `electron/ai/antigravityProcess.test.ts` / `antigravityTask.test.ts` 写 RED：probe A 后 resolver 切 B，或同 path 的 realpath/stat identity 改变，都必须在 spawn 前 fail closed；正常路径只 spawn 那份已 probe 的 exact invocation。
- [x] 抽出 main-only prepared invocation：携带 absolute realpath、stat 稳定身份、args、env 和 discovery/version。probe、evidence 与执行复用同一份产物；spawn 前及释放 prompt 前复核 identity，升级/原子替换时提示重测。
- [x] 先在 `electron/runtime.antigravityPreflight.test.ts` 写 runTask 级 RED：污染 create operation、无 proof、错 proof 在 create 边界直接拒绝，且 grant 不消费、local job 不入队、不记 `vendor.requested`、不返回 queued；合法路径仅消费一次并使用同一 prepared invocation。
- [x] 在 mapping 缓存命中之后、grant 消费/任务入队之前 await Antigravity create preflight；将产物通过 `executeProfileOperation` → process choke → local job 透传，job 内不得再 probe/resolve。query 仅做现有 stage/canonical 验证，不消费 create grant。verification 仍使用 prepared invocation 直接运行，不经 historical-proof 用户任务闸。
- [x] Antigravity/process/runtime 定向 18 文件 249 测试、typecheck、build 与完整 gates 全绿；完整测试 781 文件中 780 通过 / 1 跳过，7310 项中 7309 通过 / 1 跳过。`runtime.ts` 保持 539 行基线，非 Antigravity transport 与缓存命中分支未改变。
- [ ] 提交本轮 scoped fix；核对远端 PR head 仍为 `d9212f9070cc4c4492708f7a3c70999a11954ac3`，普通 push 同源分支，不 force、不 merge。

## Task 7：规格审查四轮——media bytes 纳入付费前完整 preflight（TDD）

- [x] 先扩充 runTask RED：`file://`、不存在的 `nomi-local://`、超过 4 张、非法 data URL、local reader 抛错均在 create 返回前拒绝，grant/local job/admission/vendor trace 保持零副作用；新增文件首跑 7/7 按预期失败。
- [x] 先扩充 task/process RED：合法 local/data reference 在 preflight 只读取/解码一次，queued 后的 job 只消费内存中的 prepared bytes，不再次读 URL；prepared task 绑定 prompt/model/capability/images 与第三轮 exact CLI invocation。
- [x] 将 input/media materialization 收进 cache miss 后、grant 前的 `prepareAntigravityCreateOperation`；返回完整 main-owned prepared task，经 runtime → process choke → local job 透传，runPrepared 阶段只复核 abort/identity 并执行。
- [x] 保持敏感 bytes 仅存在内存，不写日志/持久目录；沿用单图 20 MiB、总计 40 MiB、最多 4 张、MIME/URL/redirect 与 decoded image 现有边界。
- [x] 回归 verification、query、owner/cancel、cache-hit、grant 与非 Antigravity transport；定向 20 文件 261 测试通过，完整 gates 全绿：782 文件中 781 通过 / 1 跳过，7319 项中 7318 通过 / 1 跳过，typecheck 与 renderer/Electron build 通过。
- [x] 提交 scoped fix；提交前核对远端 PR head 仍为 `de26baf58cf6defa83fc948a5b8a289a5d16406d`，普通 push 同源分支，不 force、不 merge。

## Task 8：规格审查五轮——不可伪造的一次性 prepared media（TDD）

- [x] 先写并观察 RED：合法媒体 prepare 后，即使公开返回值的 bytes/MIME 被突变，job 也只能使用验证时私有 snapshot 或直接拒绝；clone/伪造 token、重复消费和同 token 重复引用均拒绝。首轮 2 文件新增 6 项全部按预期失败，23 项既有通过。
- [x] 将 prepared image 改成不暴露权威 bytes/MIME 的 main-owned opaque token；WeakMap 私有保存 defensive bytes snapshot + metadata，一次性消费先完整校验全组 token，再原子 invalidate，staging 只克隆私有 bytes。
- [x] prepared task 的 prompt/model/capability/exact ordered image URLs、proof 与 exact invocation 同样由 main-owned record 提供；process choke 通过私有 record 比对请求，公开对象或 clone 不得改写执行语义。
- [x] 补充审查 RED/GREEN：私有 task record 绑定 exact ordered image URLs，不再只比数量；同数量替换/重排必须在 grant/admission/trace 前拒绝；prepared task 在 grant 前认领、local job admission 前一次性消费，重复认领/消费/运行 fail closed。新增 5 项首跑按预期失败，修复后 4 文件 / 59 测试通过。
- [x] 保持 verification 的 raw image 路径、合法 local/data 单次读取/解码、owner/cancel/query/cache/non-Antigravity 语义；合入最新 main 后安全扩展回归 18 文件 / 271 测试通过；完整 gates 退出码 0：785 文件通过 / 1 跳过，7355 测试通过 / 1 跳过，typecheck、测试类型门与 renderer/Electron build 通过。
- [ ] 提交 scoped fix；核对远端 PR head 仍为 `c991642fe7d796203789b647563846e1bb8ebe5e`，普通 push 同源分支，不 force、不 merge。

## Task 9：合入 #183 后的最终组合验证

- [x] fetch 后精确确认 `origin/main=4fd8d5b4e7c22bcf8fd06551af028194c2794876`，且 PR #188 source 与远端源分支仍为 `d43457bd64c66ff6f9f02e3529fd4a43d687f6c1`。
- [x] 普通 merge `origin/main`，禁止 rebase/force；自动合并无文本冲突。组合测试发现语义冲突：#183 将 snake empty/null 权威泛化到 non-Comfy，并让 headless 派生 `reference_images` 成为第二真相源，导致 #188 media preflight 绕过。
- [x] 修复后仅与本次 selected vendor/model identity 匹配的有效 Comfy contract 可让 empty/null 权威；non-Comfy nonempty snake 保持合法，camel 聚合不被 empty default 吞；Antigravity 不再提前派生重复 `reference_images`。identity 贯穿 profile/process preflight、custom-call 与 audio 所有生产 `taskTemplateParams` 调用。原 3 项组合 RED + 2 项 contract RED 转绿，组合定向 32 文件 / 561 测试通过，typecheck 通过。
- [x] 完整 `pnpm run gates` 退出码 0：802 个测试文件中 801 通过 / 1 跳过，7627 项测试中 7626 通过 / 1 跳过；lint 0 错误 / 96 个存量 warning，typecheck、测试类型门与 renderer/Electron build 均通过。提交 merge 前再次精确 guard `d43457bd64c66ff6f9f02e3529fd4a43d687f6c1`，普通 push PR source，不合并 PR。

## 回滚

未发布前保留隔离工作树和原 PR 头，不影响主线。发布后若需撤销，通过后续修复 PR 或明确批准的 revert，不 force push、不 reset 共享树。

## 验收记录

工程整合与安全修复已验证，尚未 push、未将 PR 标为 ready 或合入：

- `catalogStore.applyMappingUpsert` 接受通用映射的 `process.parser`；当前只对 Antigravity vendor/model 启用实施证明校验，没有映射层校验。
- `processOperation.executeProcessOperation` 只凭 `antigravity-cli-image` parser 分派，不核对 vendor/model 身份。其他供应商映射因此可能调用已登录的 Antigravity CLI，绕过预期身份与试跑门槛。
- 映射 upsert/import 与运行边界现均校验保留执行器的 canonical 身份、结构和对应 main-owned historical proof；导入继续保持全事务回滚，旧磁盘污染在 dispatch 前拒绝。该生产行为修复使用独立 security commit，不混入 main integration merge commit。
- TDD 证据：catalog 组先观察 5 个预期失败 / 6 个既有通过；runtime/evidence 组先观察 5 个预期失败 / 53 个既有通过。实现后定向相关回归 9 文件 / 137 测试通过，完整 gates 亦通过。
- 本地界面证据：`/var/folders/f4/vz86j5nd0_sf56qdhzrmbbvw0000gn/T/nomi-model-discovery-asIiqP`。真实上游验证缺口与工程验证继续分开报告。
