# Provider Capability Degradation Design

日期：2026-08-23  
状态：已获用户原则确认；核心链路已实现，进入全门与真实场景验收
关联计划：`docs/superpowers/plans/2026-08-23-p1-p3-editable-mcp-generation.md`

## 1. 问题与用户价值

当前的 P3 provider gate 把 `submitIdempotency`、`query`、`reconcile`、`cancel` 全部当成提交前置条件。这样会造成一个错误结果：供应商少一个“安全增强能力”，用户连基本生成能力都无法使用。

正确边界是：

> 供应商能力缺失只降低 Nomi 能承诺的自动恢复程度，不取消用户的基本生成能力。

用户正常使用时仍然只需：编辑 → 预览 → 一次确认 → 等结果。只有异常路径才显示供应商能力差异；内部的 WAL、Run、合同、receipt 和 fencing 继续保护 Nomi 自己的状态，不要求用户学习这些术语。

## 2. 能力分级

Provider 仍然必须提供可验证的 `buildRequest` 和 `submit`；没有真实提交入口、模型/模式映射或凭证时，才在提交前阻塞。其余能力独立分级：

| 等级 | 供应商已证明的能力 | Nomi 用户体验 | Nomi 可以承诺什么 |
|---|---|---|---|
| `full_recovery` | 原生提交幂等、查询、核账、取消 | 自动观察、恢复、取消 | 断线后可安全恢复，不盲目重复提交 |
| `observe_only` | 查询/核账；没有原生幂等或取消 | 正常提交；拿到 task ID 后显示进度；未知回执时进入核账 | 已知 task ID 可继续观察；未知时不自动重提 |
| `submit_only` | 只有一次提交入口 | 正常提交；结果和状态以供应商入口为主 | Nomi 只记录一次明确尝试，不伪造进度/取消 |
| `unsupported` | 没有可执行提交或当前模式不支持 | 提交前说明缺少模型/模式/凭证 | 不触达 provider，不花额度 |

APIMart 当前落在 `observe_only`：官方接口证明了异步提交和按 task ID 查询，但没有证明原生 idempotency key 或取消接口。因此 APIMart 可以正常生成，不能自动重试，也不能承诺远端取消。

## 3. 统一提交链路

所有等级都经过同一条 Run-owned 链路，不回退旧 `runTask` 或 `production.generate-node → arrange → export`：

1. `PlanCandidate` 在封存前自由编辑模型、供应商、模式、任意参数和参考素材。
2. 合同封存，生成稳定 `contractHash`、`requestFingerprint`、`providerIdempotencyKey` 和 runtime envelope。
3. 真人确认 receipt 与提交 intent 先持久化，再调用 provider `submit`。
4. provider 返回 `providerTaskId` 时，先把 task ID 和 raw receipt 写入 Run/envelope，再开始观察。
5. 根据 capability profile 决定后续动作：
   - `full_recovery`：允许按原生能力恢复/重试/取消。
   - `observe_only`：有 task ID 就查询；回执丢失进入 `submission_unknown`，只核账，不自动再次提交。
   - `submit_only`：提交结果只保留为 provider reference；Nomi 不猜测远端状态。
6. 任何新的付费尝试都必须是新的 attempt、sealed contract 和一次新的明确确认；不能通过重放旧 command 或自动 retry 产生。

## 4. 用户可见体验

### 正常路径

用户在当前 MCP 客户端完成编辑和确认，不需要切换到 Nomi。预览只显示模型、供应商、模式、关键参数、参考素材和一句简短的恢复说明，例如：

- “可自动恢复”
- “生成正常可用；如果提交回执丢失，需要到供应商处核对”

不展示 `fencingEpoch`、WAL、receipt、capability enum 等内部术语。

### 回执丢失

对于 `observe_only` 或 `submit_only`：

- 首先显示事实：“请求可能已经提交，Nomi 没有拿到确认回执。”
- 主操作是“核对这次尝试”；如果已有 task ID，直接继续查询。
- 不自动产生第二次提交。
- 用户可以主动选择“创建新尝试”；按钮必须同时显示“可能重复计费”，并创建新的 attempt/receipt，而不是复用旧确认。

### 取消

- 有原生取消：调用 provider cancel，显示远端结果。
- 没有原生取消：停止 Nomi 的等待和轮询，显示“已停止等待；供应商任务可能仍在运行”。不得显示“已取消”这种无法证明的结论。

### 错误

错误始终回答三件事：发生了什么、是否可能已经提交、用户现在只有哪一个最合理的下一步。技术错误码保留在结构化日志和 MCP error envelope 中，用户界面使用人话。

## 5. 通用性约束

- Provider、model、mode、参数和参考素材均来自 manifest/catalog/contract 数据；不能为 APIMart、某个模型或某种输入模式复制 dispatcher/UI 分支。
- capability profile 是 provider 运行时声明，不是模型名称的硬编码判断。
- 同一 `GenerationProvider` 接口支持 image/video/audio 等模式；差异进入 `buildRequest` 与 capability profile。
- 供应商不支持的参数在封存前解释并阻塞该字段，不静默丢弃；供应商不支持的恢复能力不阻塞基本提交。
- Nomi 的稳定 idempotency key 仍然生成并持久化，即使供应商暂不识别它；它用于 Nomi 内部去重、审计和未来升级，不得被误报成 provider 原生幂等。
- 所有提交都必须经过主进程 receipt、Run-owned intent/WAL、envelope 和 provider adapter；旧 legacy 入口继续被 firewall 拦截。

## 6. 状态与数据不变量

- `submission_unknown` 表示“可能已提交但回执不确定”，不是失败，也不是允许自动重提。
- `providerTaskId` 一旦收到，必须在进入 polling 前持久化。
- `attempt` 只在用户明确创建新尝试并重新确认时递增。
- 同一个 `commandId`、`contractHash` 和 `attempt` 重放返回原 receipt/result，不增加 provider submit 次数。
- provider 不能取消时，Run 状态只能进入 `detached`/`too_late` 等已定义降级状态，不能伪造 `cancelled_remote`。
- provider 能力缺失不得让预览、编辑、确认链产生 provider/spend side effect；只有用户明确确认后才允许一次提交。

## 7. 验收测试

1. 四种 fake provider profile（full/observe-only/submit-only/unsupported）共用同一 semantic MCP/GUI 旅程。
2. observe-only：提交一次、拿到 task ID 后重启可继续查询；提交回执丢失时 provider submit 计数保持 1，返回核账动作。
3. submit-only：提交一次后不伪造进度或取消；返回可复制的 provider reference 和明确下一步。
4. 用户主动创建新尝试：必须产生新的 attempt、contractHash/receipt，旧 attempt 不被覆盖；测试 provider submit 计数为 2 且第二次不是自动触发。
5. full provider：保留现有 exactly-once、reconcile、cancel 和 restart 测试。
6. unsupported：在 provider、模型、模式或凭证缺失时，submit/provider/spend/asset 计数均为 0。
7. APIMart adapter contract：验证通用 image request 到 `/v1/images/generations` 的 model/prompt/size/resolution 映射，以及 `/v1/tasks/{task_id}` 查询；不把缺少的 idempotency/cancel 伪报为 true。
8. UX 走查：正常路径一次确认；异常路径只显示事实、一个推荐动作和一个带重复计费警告的主动新尝试动作；不要求用户切换到 Nomi 才能完成确认。

## 8. 非目标

- 不为供应商“发明”原生幂等、查询或取消接口。
- 不在 Nomi 内把“停止轮询”包装成“远端已取消”。
- 不自动重试未知回执。
- 不恢复 legacy provider path，也不把 P3 结果自动写入 Canvas/Timeline。
- 不要求用户在每个供应商页面学习不同的 Nomi 配置格式。

## 9. 完成标准

当任意供应商只具备 `submit`，用户仍能完成一次明确、可审计的生成尝试；当供应商具备更多能力时，Nomi 自动增加恢复和取消能力；无论供应商能力如何变化，都不会出现静默丢参数、隐式重复扣费、伪造取消状态或跨入口第二套事实源。
