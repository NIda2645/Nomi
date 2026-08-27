# Nomi Generation Operation 控制面设计

日期：2026-08-27

状态：基于真实宣传片旅程的设计补充，待按配套计划实施

作用：修正并具体化 2026-08-22 Unified Runtime 设计的用户可见控制面；**不新建第二套 Run、Asset、Timeline 或 provider runtime owner。**

问题证据：[`docs/audit/2026-08-27-mcp-generation-journey-incident-review.md`](../../audit/2026-08-27-mcp-generation-journey-incident-review.md)

执行计划：[`docs/superpowers/plans/2026-08-27-mcp-generation-control-plane-journey-plan.md`](../plans/2026-08-27-mcp-generation-control-plane-journey-plan.md)

## 1. 设计目标

让用户从任何入口发起一次生成后，都能回答六个问题：

1. 我现在在批准什么？
2. 具体是哪张图、哪段视频、什么角色？
3. 模型、分辨率、时长和费用有没有变？
4. 它现在到底处于什么阶段？
5. 关闭 MCP/Nomi 或重启后，怎么继续？
6. 最后得到的媒体和导出是否能在项目里再次找到、再次验证？

硬不变量：

- 确认前不消费额度、不提交供应商、不物化最终资产；
- 一次批准只绑定一份不可变 revision/digest；
- 一个 operation 对应一个 ProductionRun/shot/job 绑定，不复制 owner；
- provider submit exactly-once，`submission_unknown` 只能 reconcile，不能默认重发；
- 所有表面从同一事件账本派生状态，不各自维护独立真假；
- 导出落盘 manifest 必须是实际执行的 resolved manifest；
- 没有宿主富 UI 时仍可恢复，不能把“支持 MCP Apps”作为正确性的前提。

## 2. 方案取舍

| 方案 | 用户看到 | 优点 | 代价/风险 | 结论 |
|---|---|---|---|---|
| A. 在现有 `nomi_generate` 上补图、补文案 | 原调用继续长时间挂起，确认更好看 | 改动小 | MCP Apps 仍只能在 result 后出现；断线/重启/状态分裂不解决 | 不采用，只允许做过渡兼容 |
| B. Nomi durable Operation + MCP 渐进适配 | 先得到 operation 卡，再确认、后台运行、随时恢复 | 同时解决确认、媒体、状态、恢复、导出事实；复用 ProductionRun | 需要分阶段迁移 legacy tool | **采用** |
| C. 直接引入 Temporal/LangGraph 作为运行时 | 新工作流引擎管理暂停与恢复 | 成熟的 durable workflow 模式 | 新基础设施和第二 owner；本地优先 Electron 复杂度大，吞掉 Nomi 业务护栏 | 不采用；只借鉴模式 |

真正的取舍不是“弹窗好不好看”，而是：继续让一次 15 分钟生成等于一次 15 分钟 RPC，还是把生成变成一个跨入口持久存在的产品对象。选择后者。

## 3. 外部实现给出的边界

### 3.1 MCP Apps：负责丰富显示，不负责成为唯一控制面

[MCP Apps 官方概览](https://github.com/modelcontextprotocol/ext-apps/blob/main/docs/overview.md)支持富媒体、表单、审批和实时显示；但 App 通过 tool result 注入宿主。官方仓库的 [rich UI elicitation 提案 #511](https://github.com/modelcontextprotocol/ext-apps/issues/511) 仍明确指出：当前没有协议级方式把 App 挂到 `elicitation/create` 后暂停 agent 等待交互。

设计结论：

- 不等待这个协议缺口未来被填；
- `prepare` 先返回 operation/result，MCP App 才有机会渲染；
- 审批是对 operation revision 的独立命令，不是卡在原工具调用内部；
- 不支持 Apps 的 host 返回同一份纯文本/structured projection。

### 3.2 MCP Elicitation：flat form 只能做轻确认，URL mode 可做深链恢复

[MCP Elicitation 规范](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation)规定 form mode 是 flat primitive schema；URL mode 可把用户带到 out-of-band 页面并通过 completion notification 继续。

设计结论：

- boolean form 不能承载多图/视频审阅，不再假装它是完整媒体确认；
- host 支持 URL mode 时，可打开本地 Nomi approval deep link；
- completion notification 只是唤醒机制，approval receipt 仍由 Nomi 主进程产生和校验；
- 不支持 URL/Apps 时，返回 typed `input_required` 和明确的 “在 Nomi 打开” action。

### 3.3 MCP Tasks：作为可选传输适配，不作为 Nomi 真相源

[MCP Tasks 2025-11-25 规范](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks)把 task 定义为带唯一 ID 的持久状态机，支持轮询、延迟取结果和 `input_required`；同时仍标注 experimental，需要双方 capability negotiation。

设计结论：

- 支持 Tasks 的 host：`operationId` 一对一投影为 MCP taskId；
- 不支持 Tasks 的 host：仍返回普通 tool result + operationId；
- MCP Task 不能成为第二份 job store，也不能决定额度、项目权限或 provider retry。

### 3.4 LangGraph / Temporal：借鉴检查点，不引入第二运行时

[LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)强调暂停前持久化、使用同一 thread id 恢复、节点重放时副作用必须幂等；[Temporal](https://docs.temporal.io/)强调 durable execution、signals/updates 和事件历史。

设计结论：

- 把“暂停点、resume token、exactly-once side-effect、history replay”落实在 ProductionRun；
- 不把 LangGraph/Temporal 类型带进 Nomi 领域模型；
- 不把本地项目、资产或 spend grant 放到外部 workflow engine。

### 3.5 ComfyUI：提交、事件、历史三层分开

[ComfyUI Server Overview](https://docs.comfy.org/development/comfyui-server/comms_overview)将完整 workflow 在提交时冻结，通过 HTTP 提交、WebSocket 进度和 history/status 查询分开；提交后编辑 UI 不会改变已排队任务。

设计结论：

- Nomi 也要在批准时冻结 revision；
- 实时进度只是投影，history 才是恢复依据；
- 修改模型/参数必须产生新 revision，而不是悄悄改变已批准任务。

## 4. 核心对象：补全现有 GenerationOperation 投影

当前 `mcpGenerationTools.ts` 已有 `GenerationOperation`，`productionGenerationOperationStore.ts` 已把它持久化到 ProductionRun。需要做的是补全并版本化这份 projection，不新建独立数据库、不另造同义 operation 类型。

```ts
type GenerationOperationProjectionV1 = {
  operationId: string
  project: {
    projectId: string
    immutableProjectUuid: string
    projectGeneration: number
    revision: number
  }
  execution: {
    runId: string
    shotId: string
    contractHash: string
    runtimeTaskId?: string
    providerTaskId?: string
    attempt: number
  }
  revision: OperationRevisionV1
  phase: OperationPhase
  decision?: ApprovalProjectionV1
  progress: OperationProgressV1
  result?: OperationArtifactProjectionV1
  nextActions: OperationActionV1[]
  lastEventCursor: string
}
```

```ts
type OperationPhase =
  | 'draft'
  | 'awaiting_input'
  | 'awaiting_approval'
  | 'authorized'
  | 'submitted'
  | 'running'
  | 'verifying'
  | 'ready'
  | 'adopted'
  | 'exported'
  | 'failed'
  | 'cancelled'
  | 'submission_unknown'
```

状态只能由 ProductionRun 已提交事件派生。Canvas node、MCP result、Agent 消息和任务中心不直接写 phase。

## 5. 不可变 revision 和媒体合同

```ts
type OperationRevisionV1 = {
  revisionId: string
  digest: string
  selectedModel: {
    vendorKey: string
    modelKey: string
    mappingId: string
  }
  taskKind: string
  prompt: string
  params: Record<string, unknown>
  media: MediaBindingV1[]
  cost: {
    currency: 'credits'
    upperBound: number
    estimateKind: 'exact' | 'upper_bound' | 'unknown'
  }
  createdAt: string
}
```

```ts
type MediaBindingV1 = {
  bindingId: string
  role:
    | 'reference_image'
    | 'reference_video'
    | 'reference_audio'
    | 'first_frame'
    | 'last_frame'
    | 'style'
    | 'continuity'
  assetId?: string
  sourceUrl: string
  contentHash: string
  mimeType: string
  width?: number
  height?: number
  durationMs?: number
  poster?: {
    url: string
    contentHash: string
    timeMs: number
  }
  label?: string
}
```

规则：

- 视频在 preflight 时必须得到 poster；没有 poster 的视频不能进入“可确认”状态；
- UI 显示真实媒体、role、顺序和缺失项，不只显示 `referenceCount`；
- digest 覆盖媒体顺序、role、hash、模型、prompt、参数和 cost upper bound；
- 任何字段变化都产生新 revision，旧 approval 自动失效；
- provider submit 只消费已批准 revision 的 prepared task。

## 6. 用户流程与现有工具映射

沿用现有 wire names，不再增加 `prepare/approve/read` 的同义工具：

| 用户阶段 | 现有工具 |
|---|---|
| 打开与取上下文 | `nomi_session_open`、`nomi_get_generation_context` |
| 创建/编辑计划 | `nomi_operation_create`、`nomi_submit_generation_plan` |
| 查看冻结输入 | `nomi_preview_execution` |
| 请求/决定确认 | `nomi_request_generation_gate`、`nomi_decide_generation_gate` |
| 开始/观察 | `nomi_start_generation`、`nomi_operation_read`、`nomi_subscribe_run` |
| 取消/对账 | `nomi_cancel_generation`、`nomi_reconcile_generation` |

当前 `mcpSemanticGenerationFlow.ts` 和 `mcpProtocol.ts` 会把 request gate、阻塞确认、decide、start 合并在一次工具调用里；这必须拆回上述工具合同，才能先返回 App operation 卡、再由同一 revision 独立确认。

### 6.1 Plan / Preview

```text
Agent/MCP/Nomi 发起意图
→ 解析项目与选中模型
→ 读取并验证媒体、生成 poster
→ 解析兼容参数
→ 计算 cost upper bound
→ 写入 draft/awaiting_approval operation
→ 立即返回 operationId + projection
```

此阶段零 provider、零 spend、零最终物化。

### 6.2 Request Gate / Decide Gate

确认卡中心区域必须显示：

- 模型与供应商；
- 1080p / 16:9 / 13s 等实际参数；
- 每个参考媒体的画面、类型和 role；
- 相对上一 revision 的变更：保留、替换、被默认值覆盖、已不兼容；
- 成本上限和真实 ETA 置信度；
- “批准这一版”而不是模糊的“确认”。

确认产生一次性 `HumanApprovalReceipt`，绑定 operationId、revision digest、项目 generation、actor、expiry 和 scope。

### 6.3 Start / Observe

批准后：

```text
consume receipt
→ reserve/consume spend at the existing hard gate
→ persist provider-submit intent
→ exactly-once submit
→ append provider task id
→ return/stream projections
```

客户端断开不改变运行状态。重连使用 operationId + cursor 读取快照和增量事件。

### 6.4 Ready / Adopt / Export

结果完成后必须产生项目内 Artifact projection：

- image：thumbnail + full asset；
- video：poster + duration + playable URL；
- audio：waveform/时长（后续）；
- 可执行动作：播放、在 Nomi 打开、加入时间轴、复制路径、显示文件。

导出也是 operation/artifact，不只是一条 toast。

## 7. 不同 MCP host 的渐进退化

| Host 能力 | Prepare 返回 | 用户确认 | 运行/结果 |
|---|---|---|---|
| Apps + Tasks | MCP App operation 卡 + taskId | 卡内触发独立 approve tool 或 Nomi deep link | task/status + App 实时投影 |
| Tasks，无 Apps | structured projection + taskId | form/URL elicitation 或 typed nextAction | tasks/get/list/result |
| Apps，无 Tasks | App 卡 + operationId | 独立 approve tool | `nomi_operation_read` / events |
| form elicitation only | 文本摘要 + operationId | 轻量 boolean，只适用于无媒体/低风险；有媒体时转 Nomi | read/poll tool |
| URL elicitation | operationId + Nomi approval URL | Nomi 富媒体确认；completion notification 唤醒 | read/poll tool |
| plain tools only | typed `input_required` + operationId + deep link | 在 Nomi 确认 | 模型/用户再次调用 read/start；不挂死原调用 |

任何一行都必须安全、可恢复；富 UI 只是体验增强。

## 8. 参数切换设计

切换 vendor/model 时不再直接把当前 meta 改成默认值。先计算：

```ts
type ModelChangeDiff = {
  preserved: ParamChange[]
  normalized: ParamChange[]
  incompatible: ParamChange[]
  addedDefaults: ParamChange[]
  mediaRebinding: BindingChange[]
}
```

规则：

- 同语义且新 profile 支持：保留用户值；
- 需要格式转换：展示 normalized diff；
- 不支持：明确显示“13s → 5s（模型上限）”，不能静默；
- 切换后创建新 revision，原 approval 作废；
- 只有用户批准新 revision 才能提交。

## 9. 状态与 ETA

### 9.1 一份事件事实

ProductionRun event 至少包含：

```ts
type OperationEventV1 = {
  eventId: string
  cursor: string
  operationId: string
  runId: string
  attempt: number
  type: string
  phase: OperationPhase
  occurredAt: string
  provider?: { rawState?: string; observedAt?: string }
  progress?: { ratio?: number; stage?: string; message?: string }
}
```

Canvas node、MCP、任务中心只读这一 projection。允许 UI 有渲染延迟，不允许语义状态各写一份。

### 9.2 ETA 诚实规则

- 键：`vendorKey + modelKey + taskKind + duration/resolution bucket`；
- 使用最近成功样本的 p50/p90，显示“通常 9–17 分钟”，不显示伪精确倒计时；
- 样本不足：显示“厂商排队时间不稳定，暂无法准确估计”；
- provider 给出 queue position/ETA 时可显示，但标明来源与更新时间；
- 40 秒静态常数删除，不设 fallback 假数。

## 10. 导出事实设计

当前内存 prepared manifest 成功执行但没有作为 job 事实落盘。修正顺序：

```text
resolve assets + ffprobe + overlays
→ build resolved manifest
→ validate + compile plan
→ atomically create job with resolved manifest and plan fingerprint
→ execute
→ persist result artifact + ffmpeg command/input hashes
```

`ExportJobSnapshot.manifest` 必须等于实际执行 manifest。原始 renderer request 可作为 `sourceRequest` 审计字段，不能伪装成执行事实。

项目内导出结果卡显示：文件名、分辨率、时长、音频、创建时间、来源 timeline revision、播放、显示文件、复制路径、再次导出。

## 11. 标题作为故事节拍

本次问题不是“把字幕移到中间”这么简单。需要一个最小语义层：

```ts
type ChapterTitleBeatV1 = {
  beatId: string
  atFrame: number
  durationFrames: number
  title: string
  subtitle?: string
  placement: 'center' | 'lower_third'
  transition: 'cut' | 'fade' | 'iris' | 'film_burn'
  audioCue?: 'none' | 'hit' | 'whoosh' | 'projector'
  safeArea: 'center-9x16' | 'full-16x9'
}
```

它仍落到现有 TimelineTextClip/overlay owner，不建第二套时间轴。目标是让 Agent 能说“在第三个转场处插入 WAN 3.0 章节卡”，系统负责居中、安全区、自动 fit 和预览，而不是靠坐标点击。

## 12. 电脑控制的正确位置

电脑控制保留为应急和探索手段，不作为产品主路径。正常链路必须提供语义动作：

- 打开 operation / project / artifact；
- 审阅并批准指定 revision；
- 播放指定视频；
- 加入时间轴末尾/指定 playhead；
- 新建/修改 chapter title beat；
- 发起导出、读取导出结果、显示文件。

这样 element index、坐标漂移、隐藏 modal 的 AX ghost、焦点卡死或 `noWindowsAvailable` 不再决定任务成败。

## 13. 安全与隐私

- 媒体 poster 由 Nomi 本地生成；绝不把本地绝对路径放进 MCP/LLM 文本；
- widget 使用签名、短 TTL preview URL；视频使用 poster 或 `<video>`，不把 MP4 当图片；
- approval receipt 只由主进程铸造，不接受裸 `confirm:true` 作为花费凭证；
- operation projection 不暴露 API key、grantId、provider auth、绝对路径；
- history/cursor 绑定 project lease 和 transport session；
- revision digest、provider idempotency 和 export plan fingerprint 都使用 canonical encoding。

## 14. 成功标准

一条真实 4 镜宣传片旅程必须满足：

- 批量建 4 节点只需一次明确确认；取消带 reason/nextAction；
- 在 MCP 或 Nomi 任一处能看到 4 个 reference media 的真实 poster/缩略图和 role；
- 选择 APIMart 后 1080p/13s 不静默变成 720p/5s；若模型不支持则显示 diff；
- 每镜付费前一次确认、供应商 raw submit 恰好一次；
- host 关闭并重开后用 operationId 继续，状态与 Nomi 一致；
- 视频完成后 MCP 有可判断的 poster/播放器和 Nomi deep link；
- ETA 使用历史区间或明确未知；
- chapter title beat 可由语义动作添加和修改，无需坐标点击；
- 最终导出 job 的 persisted manifest 与 ffmpeg 输入、音频和 overlays 对账一致；
- 项目内能播放最终 MP4、显示文件、复制路径并再次导出。

## 15. 六角色设计复核

| 角色 | 判断 | 关键约束 |
|---|---|---|
| CTO | 通过，需守 owner 边界 | 复用 ProductionRun、ExecutionContract、Asset、Timeline；禁止新 Operation DB 和第二 provider runner |
| PM | 通过 | 用户只面对“审阅这一版 → 确认一次 → 等待/恢复 → 使用结果”，不暴露 receipt/hash/cursor 术语 |
| 设计 | 通过，P3 前需样张拍板 | 媒体与标题居中成为视觉主层；技术详情折叠；没有 poster 时不允许伪确认 |
| 前端 | 通过，需渐进退化 | Apps/Tasks/URL/form/plain host 共用 projection；React 只读 phase，不另写状态 |
| 后端 | 通过，需先补对抗测试 | revision digest、receipt、outbox、reconcile、resolved export manifest 必须可重启并 fail closed |
| 真实用户 | 通过，验收最严格 | 不切窗口找确认、不猜参数和状态、不翻目录找结果；电脑点击只做视觉 QA |

复核结论：**推荐方案 B 可以实施，但第一批必须先让现有 semantic operation 成为真实旅程入口；只做富媒体卡不得标记完成。**
