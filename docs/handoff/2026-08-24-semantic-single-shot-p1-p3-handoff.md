# 交接报告：Semantic Single-Shot 生成链路（P1–P3）

- 日期：2026-08-24
- 交接对象：下一位负责 Nomi 生成能力的工程师/AI
- 当前工作树：`/Users/aoqimin/Desktop/Nomi-video-generation-parameter-research-20260823`
- 当前分支：`codex/video-generation-parameter-research-20260823`
- 最新提交：`2ff55e1f feat: complete semantic single-shot GUI fallback`
- 远端：`origin/codex/video-generation-parameter-research-20260823`
- PR：[#124](https://github.com/aqm857886159/Nomi/pull/124)
- PR 状态：OPEN，`mergeStateStatus=BLOCKED`。仓库策略禁止自动合并/管理员绕过；不要使用 `--admin`。用户已授权推进和合并，但合并仍应等待仓库策略或维护者处理。
- 工作树状态：交接时应保持 clean；主分支没有在本工作树中被改写。

## 0. 先读什么

接手后按以下顺序阅读，避免只看最后一个 commit 而误解边界：

1. 本文件。
2. `AGENTS.md`：项目纪律、P0 默认自主推进、用户价值优先、真实任务测试和五门验收。
3. `docs/superpowers/plans/2026-08-23-p1-p3-editable-mcp-generation.md`：方案、范围、不动项和验收门。
4. `docs/audit/2026-08-23-p1-p3-evidence.md`：实施证据和审计结论。
5. P0 防火墙/纯读相关提交及测试：
   - `0e6a323a`
   - `4694e88b`
   - `7e2b9359`
   - `484ec38a`
   - `cb38bb5e`
   - `567b1fb8`
6. P1–P3 生成链路提交：
   - `0e37f748`
   - `e6849e48`
   - `080bb790`
   - `5538cbf2`
   - `b394021d`
   - `2ff55e1f`

## 1. 一句话结论

本分支已经完成“语义化单镜头生成”的零额度交付：MCP 与 GUI 使用同一套可编辑计划、同一份真实模型目录上下文、一次确认、ProductionRun 单一事实源、提交/查询/恢复/物化的耐久边界，并验证了“不支持高级能力的供应商仍可做一次明确提交；提交未知时只能核账，禁止盲重提”。

这不等于 P0–P7 全部完成。P0 的语义入口防火墙已落地；P1–P3 的单镜头语义链路已完成；多镜头连续性、时间线采纳、动态模块、Agent 全面 parity、各供应商真实付费覆盖仍属于后续阶段。

## 2. 用户真正得到的价值

### 2.1 MCP 用户有确认能力的客户端

用户在自己的 MCP 客户端里操作时：

1. 客户端先打开/确认当前项目，并拿到主进程签发的项目 lease。
2. MCP 根据当前项目和真实 GUI catalog 生成 context。
3. 用户或模型可以自由编辑模型、供应商、variant、模式、参数、prompt 和参考素材。
4. 预览阶段只计算计划，不发供应商请求，不消耗额度。
5. 用户在 MCP 客户端完成一次可验证的确认。
6. Nomi 主进程消费一次性 receipt，升级本次 Run 的 submit scope，然后只提交一次。
7. 后续状态通过同一个 ProductionRun 查询/恢复，不再创建第二份任务状态。

用户看到的是“检查一次、确认一次、得到结果”，而不是学习内部 schema、手写供应商参数或在多个系统之间重复确认。

### 2.2 MCP 客户端没有 elicitation/确认能力

这是本轮最重要的体验补偿：

1. MCP 请求进入 Nomi 后，计划仍然正常生成和编辑。
2. Nomi 发现当前通道没有可验证的人类确认时，不返回模糊错误，也不直接花费。
3. 主进程通过 GUI bridge 在 Nomi 当前窗口显示一张确认卡。
4. 卡片展示最少但足够做决定的信息：
   - 要做什么（单镜头生成）
   - 供应商/模型/variant
   - prompt 摘要
   - 参考素材数量/类型
   - 预计成本或成本未知
   - 确认有效期
   - “忽略”和“确认生成”两个明确动作
5. 用户在 Nomi 界面点击一次“确认生成”后，原始 MCP 请求继续执行；点击“忽略”则不提交、不扣费。
6. MCP 客户端不会再出现第二张确认卡，Nomi 也不会让用户重复点两次。

这解决了“用户明明开着 Nomi，但 MCP 在另一个软件里”的真实摩擦：确认发生在用户看得见、能判断的地方，但结果仍回到原始 MCP 调用，不需要用户把整套工作转移到 Nomi UI 里重新做一遍。

### 2.3 失败时的用户价值

- provider 明确拒绝：显示可理解的失败原因，不自动重复扣费。
- provider 接受但本地丢失 task ID/receipt：Run 进入 `submission_unknown`，只允许查询/人工核账，不盲目再次提交。
- provider 没有 cancel/query/idempotency/materialize：能力按实际支持情况降级，界面说明“需要手动核账”或“已提交但暂不能在 Nomi 内继续操作”，不把不存在的按钮伪装成可用。
- 预览、编辑、只读查询不会碰 provider，不会铸 spend grant，不会写 Canvas/Timeline 第二事实源。

## 3. 完整链路

~~~text
MCP / GUI 请求
  → transport 身份与 verified origin
  → session/open：主进程签发 ProjectLease
  → generation context：读取当前真实 catalog、项目素材和可用 profile
  → operation.create：建立可编辑草稿
  → operation.patch：编辑 provider/model/variant/mode/params/references/prompt
  → preview：生成 candidate、effective parameters、成本/能力摘要；provider call = 0
  → seal：冻结 ExecutionContract + contractHash + request fingerprint
  → request gate：MCP receipt 或 Nomi GUI fallback confirmation
  → decide/confirm：主进程验证并消费一次性 receipt，升级 submit scope
  → ProductionRun：持久化 job、budget reservation、runtime envelope、intent/WAL/outbox
  → provider adapter：一次 submit，保存 providerTaskId/raw receipt 后才进入 polling
  → poll/reconcile：同一个 Run 查询、重启恢复、fencing 防并发
  → provider output descriptor
  → provider-owned materialize（若支持）
  → deterministic Asset sink / materialization receipt
  → ProductionArtifact
  → operation.read / result 展示
~~~

重要顺序不可以交换：

- 先 seal 再确认；确认后不能偷偷改变模型、参数、参考素材或 prompt。
- 先持久化 intent/WAL 再 dispatch。
- provider 返回后先持久化 providerTaskId/raw receipt，再开始 polling。
- provider 已接受但本地没有返回证据时只能 reconcile，不能 retry。
- 预览和编辑绝对不能调用 provider。

## 4. 计划和编辑模型

### 4.1 语义工具/入口

主要入口集中在：

- `session.open`
- `generation.get-context`
- `generation.operation.create`
- `generation.operation.patch`
- `generation.preview`
- `generation.request-gate`
- `generation.decide-gate`
- `generation.start`
- `generation.operation.read`
- `generation.reconcile`
- `generation.cancel`

具体 transport（MCP RPC、MCP stdio、桌面 GUI、测试 loopback）只是入口差异，核心 planning、contract、Run owner 不应复制。

### 4.2 可编辑字段

在 seal 前，用户可以像编辑真实 GUI 一样改变：

- provider
- base model
- model variant / variantId
- mode（例如文生视频、图生视频、首尾帧等，仅当该模型真实 catalog 声明支持）
- mode-specific parameters
- prompt
- reference assets（替换、增加、删除、重排）
- 画幅、时长、分辨率、帧率等模型实际声明的参数
- 任何 provider-specific option，只能通过该 provider 的能力档案进入，不能冒充通用字段

每次实际改变都会提升 operation revision 并重新计算计划 hash。已 seal 的合同若要修改，必须新建 draft；不能原地修改已确认请求。

### 4.3 模型通用性原则

这套系统不是把 Seedance 的字段硬编码成所有模型都拥有，也不是把“轨迹控制”等别的模型能力推广给 Seedance。

正确做法：

1. 从真实 catalog/manifest/archetype 读取模型、variant、mode、参数 schema 和 capability flags。
2. shared planning 只理解稳定的通用概念：候选、模式、参数约束、参考素材角色、成本估计、能力状态。
3. provider-specific mapping 只放在 provider adapter。
4. 如果某模型没有某能力，context 不显示该选择，contract validation 在提交前拒绝；不要等 provider 付费后才失败。
5. 如果供应商没有 idempotency/query/reconcile/cancel/materialize 等能力：
   - 不因为缺少可选能力而阻止“一次明确提交”（这是已经确认的产品原则）。
   - 本地提交未知时必须 reconcile-only，禁止盲重提。
   - 没有 materialize 时保留 provider descriptor，并明确提示用户需要手动核账/取回，不伪造本地 Asset。
6. 未知 provider/model 可以进入 planning 以便用户编辑和看见限制，但 submit readiness 必须明确为 unsupported/unknown，不能假装可安全执行。

Seedance 的 variant identity 已贯穿：

~~~text
真实 catalog base row
  → variantChoices / variant aliases
  → MCP context
  → PlanCandidate.variantId
  → ExecutionContract.variantId
  → runtime request.variantId
  → recommendation/result identity
~~~

已覆盖 standard / fast / mini、Veo、Hailuo 等代表性档案；fast/mini 的 variant-specific effective modes/params 会收窄 context。variant alias 会 canonicalize，未知 variant 会拒绝；同模型只修改参数时会保留当前 variant，不会意外回到 standard。

## 5. 一次确认和授权

不能把以下任何东西当成人类授权：

- 裸 `confirm: true`
- `spendConfirmed: true`
- `approved: true`
- MCP client proof 本身
- body 里的 `projectId`
- `runId`、`modelKey` 或其它可复制字符串
- renderer 回传的未绑定 boolean

真正的授权在主进程完成：

- lease 必须绑定项目、scope、revision/generation、过期时间和撤销状态。
- receipt 必须绑定 challenge、目标 Run/operation、contractHash、actor、有效期和 replay 状态。
- GUI fallback 只提供“用户看见并点击”的信号，主进程负责验证/签发 receipt。
- receipt 被消费一次后不能重复使用。
- submit scope 只有在 receipt 验证通过后才加入；planning scope 与 submit scope 分离。

## 6. Runtime 开关

| 环境 | 行为 | 用户价值 |
|---|---|---|
| 两个开关都未设置 | 生成语义链路保持 schema-only/off，不提交 | 生产环境安全默认关闭 |
| 仅 `NOMI_MCP_GENERATION_SINGLE_SHOT_V1=1` | E0：context、create、patch、preview 可用，provider call=0 | 可体验/调试但不会花费 |
| `V1=1` 且 `E1_V1=1` | E1：在 receipt 或 GUI fallback 确认后允许单镜头 submit/query/reconcile | 完整单镜头链路 |
| 仅 `E1_V1=1` | 仍视为 off | 避免误开 |

主要接线：

- `electron/capabilityCore/mcpGenerationPolicy.ts\)：策略和开关。
- `electron/capabilityCore/appIntegration.ts\)：桌面 RPC 默认使用 runtime policy。
- `electron/capabilityCore/mcpStdioServer.ts\)：stdio 默认使用同一 runtime policy。
- `electron/capabilityCore/generationDispatcher.ts\)：当前项目 bootstrap 时签发 planning scope；receipt 验证后才加入 submit scope。
- E2E 使用两个开关和 loopback fake provider，真实 provider quota = 0。

## 7. 单一 owner 和关键文件

### 7.1 ProductionRun owner

- `electron/productionRun/productionRunTypes.ts\)：Run、Job、Gate、Artifact、ExecutionBinding 类型。
- `electron/productionRun/productionRunRepository.ts\)：snapshot/events/approvals/budget 的 durable JSONL、CAS、command dedupe、纯读重建。
- `electron/productionRun/productionRunLock.ts\)：跨进程锁和 owner fencing。
- `electron/productionRun/productionGenerationOperationStore.ts\)：语义 operation 到 ProductionRun 的映射和 origin/policy scope 持久化。
- `electron/productionRun/productionGenerationSubmission.ts\)：合同冻结、提交意图、provider dispatch 接缝。
- `electron/productionRun/submissionOutbox.ts\)：durable intent/recovery/reconcile 机制。
- `electron/productionRun/productionRunRuntimeEnvelope.ts\)：运行时请求封装和 hash。
- `electron/productionRun/productionRunResume.ts\)：重启后的恢复/查询路径。

ProductionRun 是唯一事实源：job 状态、gate、budget、outbox、reconcile 和最终 artifact 都必须归它管理。不要让 RuntimeTask cache、Canvas store、Timeline sidecar 或 MCP transport 维护第二份提交状态。

### 7.2 MCP/transport

- `electron/capabilityCore/dispatcher.ts\)：通用入口、防 legacy semantic alias 绕过。
- `electron/capabilityCore/generationDispatcher.ts\)：generation 专用 dispatch 和 scope。
- `electron/capabilityCore/mcpGenerationTools.ts\)：context、candidate、recommendation、patch、preview。
- `electron/capabilityCore/mcpGenerationPolicy.ts\)：phase/feature policy。
- `electron/capabilityCore/generationBindingGuard.ts\)：唯一 semantic marker 集合、递归扫描和深度 fail-closed。
- `electron/capabilityCore/rpcServer.ts\)、`mcpStdioServer.ts\)、`mcpRpcError.ts\)、`mcpToolResults.ts\)：typed error 在 transport 之间保留。
- `src/workbench/capability/capabilityApplyHandler.ts\)：GUI fallback confirmation；必须在 mint grant/provider call 之前做 guard。

### 7.3 Provider 和 Asset

- `electron/productionRun/generationRuntimeAdapter.ts\)：provider-neutral runtime adapter contract。
- `electron/productionRun/generationProviderBootstrap.ts\)：按真实 module manifest/capability 注册 provider。
- `electron/productionRun/generationOutputMaterializer.ts\)：provider-owned optional materialize。
- APIMart adapter：只负责 APIMart 的真实 endpoint/auth/model/variant/mode/parameter mapping。
- `electron/assets/projectAssetStore.ts\)：本地 bytes/metadata/materialization sink。
- `electron/capabilityCore/moduleManifest.ts\)：capability manifest；`materialize` 是 optional capability，不是所有 provider 的硬要求。

## 8. 本轮关键根因修复

1. **runtime policy 原来只是 skeleton，没有默认接线。**
   - 修复：新增 `createRuntimeMcpGenerationPolicy()`，明确 E0/E1 开关；桌面和 stdio 共用。
2. **当前项目 bootstrap 只发了 read scope。**
   - 后果：GUI fallback 点确认后，原始请求仍因缺 submit scope 被拒。
   - 修复：bootstrap 发 planning scope；只有 verified receipt 消费后才加入 submit scope。
3. **origin 在某些 Run 路径被硬编码成 `semantic-mcp`。**
   - 后果：真实 desktop host 的 `nomi-app`/verified host 无法通过 Run policy。
   - 修复：从 verified transport 传 origin，并让 Run policy scope 到 host 和当前 candidate provider/model。
4. **manifest schema 只接受固定 capability。**
   - 后果：provider 声明可选 `materialize` 时启动失败。
   - 修复：把 `materialize` 作为 optional capability，并加 manifest contract test。
5. **读取路径曾经带有恢复副作用。**
   - 修复：ProductionRun read/list/readEvents/readApprovals/readBudgetLedger/rebuild 对坏 snapshot/旧 cursor 只做内存重建，不备份、不 atomic rewrite、不改磁盘。
6. **semantic legacy 绕过。**
   - 修复：实际 MCP `nomi_generate` 映射到 dispatcher 的 `generate` 已纳入 firewall；所有 `production.*` aliases 和 renderer `production.generate-node` 在 service/grant/provider 前拒绝 semantic binding。
7. **marker 漂移和深嵌套 DoS。**
   - 修复：dispatcher/renderer 共用 `generationBindingGuard.ts`；递归数组/对象、WeakSet 防循环、MAX_DEPTH=32 超深 payload fail-closed；包含 `executionBinding`、`requestFingerprint`、`providerIdempotencyKey`、`runtimeEnvelope*`、`fencingEpoch`、`providerTaskId`、`moduleRef`、`operationRef`、`candidate`、`baseRevision`、`projectRevision`、`attempt` 等 canonical markers。
8. **typed error 在 RPC/stdio/MCP structured outcome 中丢失。**
   - 修复：保留 `message/code/nextAction/phase/capability/errorCode`；host 也复用 wire serializer。

## 9. 已验证的证据

### 9.1 全门

在当前干净分支执行过：

~~~text
pnpm run gates
~~~

结果：

- 700 个 test files passed
- 6192 tests passed
- 1 skipped
- lint：0 errors，95 个既有 warnings
- typecheck、build、filesize、tokens、i18n、audit、secrets 等静态门均通过
- 没有新增 provider quota 消耗

### 9.2 真实用户任务 E2E（零额度）

命令：

~~~text
node tests/ux/mcp-generation-single-shot-gui-fallback.e2e.mjs
~~~

结果：14/14 assertions passed；loopback provider 的 POST=1、GET=1，真实 provider quota=0。

14 个断言覆盖：

1. 启动独立临时项目。
2. MCP/desktop handshake 成功。
3. 当前 project lease 成功。
4. planning scopes 正确。
5. `operation.create` 不触 provider。
6. preview 使用真实 seeded catalog 的 provider/model。
7. preview provider call 仍为 0。
8. 无 MCP elicitation 时出现一张 Nomi GUI confirmation card。
9. 卡片展示模型、prompt、参考素材、cost 等可决定信息。
10. 点击一次“确认生成”。
11. 原始 MCP 请求恢复并完成。
12. provider submit POST 恰好 1 次。
13. 同一个 Run 查询可得到 providerTaskId/状态。
14. 重复触发不会再次 submit，最终 artifact/run 证据存在。

截图（应使用同一构建/同一入口复核）：

- `tests/ux/shots/mcp-generation-single-shot-gui-fallback/01-semantic-gate.png`
- `tests/ux/shots/mcp-generation-single-shot-gui-fallback/02-semantic-complete.png`

人工检查结论：

- gate 卡片居中，背景 dim，确认/忽略动作清楚。
- 模型、prompt、参考素材和成本摘要可见。
- 完成后回到正常 Nomi UI，没有第二张确认卡。
- 这证明的是用户所见和点击闭环，不只是 API 断言。

### 9.3 重点单测类别

已覆盖的 focused suites 包括：

- E0/E1 policy、dispatcher、GUI fallback。
- lease、receipt、legacy firewall、nested/deep marker。
- contract freeze、variant alias/canonicalization、unknown provider fallback。
- providerTaskId/raw receipt 先持久化、poll restart、crash-before-dispatch。
- provider accepted 但 receipt/task 丢失时进入 reconcile-only。
- cross-process mutex/fencing。
- provider 缺 materialize 时诚实降级。
- stable materialization retry / deterministic asset identity。
- semantic path 不再调用旧 `production.generate-node → arrange → export`。
- RPC/stdio/host/MCP structured typed error parity。
- repository corrupt/stale read bytes 与目录不变。

## 10. 还没有做完的事情

### 10.1 需要用户独有资源的唯一决策点

如果下一步要做真实 provider paid smoke，必须由用户提供/确认：

- 使用哪个已接入 provider/account/profile。
- 具体 model、variant、mode。
- 最小预算和可接受额度。
- 真实参考素材（如果走 I2V/首尾帧/参考图）。
- 是否允许把结果 materialize 到当前测试项目。

这不是代码不完整，而是避免未经授权的真实扣费。当前零额度链路已经可以继续维护和扩展，不应为了“看起来完整”自行使用真实凭据。

### 10.2 产品/架构后续

尚未完成：

- P4：多镜头连续性、跨镜 identity/参考素材继承、拆镜头和续写。
- P5：时间线/Canvas 的 proposal/adopt 语义和用户可撤销编辑。
- P6：动态 module registry、更多 provider/模型档案的真实官方文档对账。
- P7：Agent/GUI/MCP 全面 parity、运营指标、长期用户测试。
- 各 provider 的真实付费覆盖。APIMart loopback/adapter 的通过不能证明其它 provider 的 endpoint、参数或变体映射正确。
- provider-specific cancel：provider 没有原生 cancel 时只能诚实提示，不能伪造“已取消”。

### 10.3 非阻塞技术 follow-up

当前 planning slice 尚有两个可独立处理的通用性增强：

1. `parameterFieldForControl` 对离散数值 select（例如 Hailuo duration 6/10）目前可能退化成 number；后续应保留 enum/options，让 GUI/MCP 都能看到真实可选值。
2. `videoParameterSchema` 若同一 `transportTaskKind` 未来存在多个参数不同的 mode，不能再取第一个 mode；应把 mode identity 纳入 schema lookup。

这两项不阻塞本轮单镜头交付，但修复时必须来自真实 catalog/profile，不得凭空创建通用字段。

## 11. 下一位建议执行顺序

### A. 先确认基线（零额度）

~~~bash
cd /Users/aoqimin/Desktop/Nomi-video-generation-parameter-research-20260823
git branch --show-current
git status --short
git log -6 --oneline
pnpm run build
node tests/ux/mcp-generation-single-shot-gui-fallback.e2e.mjs
~~~

预期：E2E 14/14；loopback POST=1、GET=1；真实 quota=0。若 POST>1，立即停止，不要继续加重试。

### B. 再跑全门

~~~bash
pnpm run gates
~~~

任何失败先分类：

- 401/auth：停止重试，检查凭据/账户权限。
- provider 参数/模式不支持：回到官方文档和能力档案，修 mapping/contract validation。
- 本地类型/测试 bug：修根因后重跑。
- timeout/unknown：进入 reconcile，不要直接 retry。
- 素材或本地协议问题：先用 ffprobe/文件存在性/可见播放器证据判断，不能只凭 UI 猜。

### C. 若用户确认真实 provider smoke

每个 provider 单独做，不把一个 provider 的成功推广给全部：

1. 先查该 provider 当前官方 API 文档：鉴权、submit endpoint、query endpoint、task ID、idempotency header/body、variant/model ID、mode、参数范围、输入素材 URL/上传要求、结果 URL、materialize、cancel。
2. 对照 `moduleManifest`、`ModelArchetype`、`PlanCandidate`、`ExecutionContractV1` 和 adapter，逐项记录“已证实/未知/不支持”。
3. 建立隔离临时项目和最小测试素材；只做一镜头、低分辨率/最短时长、n=1。
4. preview 阶段确认 provider call=0。
5. 用户确认后检查一次 submit；保存并核对 providerTaskId/raw receipt，再 poll。
6. 测试重启/reconcile；如果返回丢失，确认 second submit=0。
7. 若 provider 支持 materialize，验证 deterministic Asset/Artifact；不支持则验证 honest manual-check 状态。
8. 使用 ffprobe、关键帧抽样和可见播放器检查媒体，不以“文件存在”代替用户可见证据。
9. 记录额度、请求数、状态迁移、失败分类，报告中不得写 API key/token。
10. 不要对 auth、unknown、明确不支持参数做 blanket retry。

### D. 开始 P4+ 前

先新建 `docs/superpowers/plans/<date>-<scope>.md`，写清：

- 用户任务和真实摩擦。
- 不动项（semantic single-shot 与 ProductionRun owner）。
- 真实模型/供应商能力证据。
- 多镜头状态如何仍由 ProductionRun 单一 owner 管理。
- 失败/撤销/重启语义。
- 真实用户任务 E2E 和视觉走查。
- 回滚方式和验收门。

P4+ 不要把旧 driver 恢复成 semantic fallback；旧 `nomi_generate` 只保留明确的 legacy 兼容边界。

## 12. 强制不回归清单

- 不得恢复 semantic 的 `nomi_generate` 或 `production.generate-node → arrange → export` 旧链路。
- read/readProjection 必须纯读，不得借读取偷偷 resume、备份或重写文件。
- 不得把 `projectId`、`runId`、`modelKey`、裸 boolean 当 lease/receipt。
- GUI fallback 只能完成一次确认，不能自己铸 grant 或创建第二份 provider 状态。
- preview/edit/context 必须保持 provider call=0。
- provider 已接受但本地丢失证据时只允许 query/reconcile，禁止盲重提。
- 不得把 Seedance-only 参数推广成所有模型共有参数；能力必须由真实 catalog/manifest 声明。
- 不得把某 provider 的 model/variant alias、endpoint 或参数范围复制给另一 provider。
- 不得把真实 API key、MCP token、receipt token、用户素材或 provider 返回的敏感信息提交到仓库。
- 不得用 `gh pr merge --admin` 绕过仓库保护。
- 改用户可见 UI 后必须跑真实任务、截图并人工检查；单测全绿不代表体验完成。

## 13. 当前交接完成标准

下一位接手后，应该能在没有额外口头上下文、没有真实 API key 的情况下：

1. 跑通零额度 GUI fallback 旅程。
2. 解释用户为什么只需要一次点击、为什么 MCP 和 Nomi 不会双重确认。
3. 找到计划、合同、Run、provider adapter、Asset/Artifact 的唯一 owner。
4. 知道哪些 provider 能力是可选降级，哪些失败必须进入 reconcile-only。
5. 知道真实付费 smoke 的唯一停点是 provider/account/model/mode/预算确认。
6. 在开始 P4+ 前写新的计划和用户任务测试，而不是直接在旧链路上堆功能。

如果只记住一句话：先让用户看懂并确认“这一次到底要花什么、用什么模型、输入了什么”，然后由 ProductionRun 负责一次提交和后续核账；任何不确定都可以诚实停住，但不能悄悄重复扣费或制造第二份真相。

