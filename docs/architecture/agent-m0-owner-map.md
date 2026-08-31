# M0 owner map：三种状态、一个 owner

基线 ref：`origin/codex/project-agent-host-phase1-20260827@46066ed0`。这里的 owner 是“可写入并发布终态事实的唯一边界”，不是消费投影或调用者。

| 状态 / 字段 | 唯一 owner（#223 ref） | 其它参与者的边界 | 证据与 M1 验收 |
|---|---|---|---|
| Conversation：Thread、Turn、Item、Checkpoint、summaryRef、contextRevision | `ProjectAgentHost`：`electron/projectAgentHost/projectAgentHost.ts:21-89`、`projectAgentHost/projectAgentRepository.ts` | Pi 只运行 loop；renderer 只消费事件投影 | append-only ledger；重启/reconnect/remount 只 replay 一次 |
| Conversation：assistant/tool/approval/compaction/handoff item 生命周期 | `ProjectAgentHost` reducer/ledger：`projectAgentAssistantReducer.ts`、`projectAgentCommandLedger.ts` | `run.mts` 返回结构化结果，不落项目事实 | 每个 item 一次 terminal；乱序/截断 fail closed |
| Execution：Operation、Attempt、Step、队列、CAS、interrupt/steer/resume | `ProjectAgentHost` execution coordinator：`projectAgentExecutionCoordinator.ts:291-375` | Pi `runAgentTurn` 是可替换 loop adapter | 两并发 turn 的 revision CAS；旧 lease/epoch 拒绝 |
| Execution：approval / proposal receipt / ProjectLease 绑定 | Host policy + proposal receipt store：`projectAgentExecutionPolicy.ts`、`projectAgentProposalReceiptStore.ts` | UI 只能发用户动作；模型不能伪造 receipt | approval 持久化解决后才能继续；重复 receipt 不重复 effect |
| Execution：Provider 任务 effect、预算、run 状态 | `ProductionRun` domain owner：`electron/productionRun/productionRunState.ts:42-83`、`productionRunRuntime.ts` | Host 只持有 operation/attempt 引用和 settlement 状态 | `done/failed/cancelled/unknown` 明确分类；unknown 进入 reconcile |
| Domain：Document 内容与版本 | Document domain/store（由 capability adapter 调用） | Agent/renderer 只经 document capability | 不在 Host ledger 复制正文；版本冲突显式失败 |
| Domain：Canvas nodes/edges/selection/geometry | Canvas Zustand store + React Flow 单内核（capability adapter 是唯一写入口） | Agent 只提交 typed proposal；renderer 不创建第二份事实 | 写入可撤销、幂等；跨项目 binding 拒绝 |
| Domain：Timeline/EditPlan/export receipt | Timeline store / export domain；capability adapter 负责 preflight | Host 只保存 operation/ref/receipt | exact revision、undo、导出状态可恢复 |
| Domain：Asset bytes / media metadata | Asset store / asset capability | Agent 只看 bounded projection | 资产内容不进入 conversation ledger；引用带 revision/hash |
| Domain：Production Artifact metadata/content/preview ref | Artifact owner：`electron/productionRun/artifactProjection.ts:13-35,203-255` 与 ProductionRun repository | Host 只保存 `artifactId/sourceVersion/contentHash` 引用 | artifact version 不隐式覆盖；preview token 绑定 project/run/artifact |
| Domain：Provider catalog/task identity | Provider adapters + ProductionRun task repository | Agent 只能看到脱敏状态/receiptRef | Provider task ID 不成为 conversation owner；重启查询不盲重提 |
| Loop implementation：Pi session、stream、tool batch、compaction callback | Pi adapter：`electron/harness/runtime/pi/run.mts:52-240` | 不拥有 Thread/Turn/Project/ProductionRun | `agent_end`/stream close 不能直接发布 completed |
| Model projection：工具描述与安全裁剪 | `modelToolSurfaceManifest`（M2 新 owner，当前 #223 目录为 `electron/harness/tools/agentToolCatalog.ts`） | canonical capability registry 保留完整内部 schema | 普通任务 ≤10；host-only transition 不进入模型面 |

## 三种状态不可越权

```text
Conversation state  --refs-->  Execution state  --refs-->  Domain state
        ^                              |                         |
        └────── model/UI projection ───┴──── capability adapter ─┘
```

裁决已落仓：维护者对 M 线的全部裁决见 [agent-m-line-rulings.md](./agent-m-line-rulings.md)（出处 PR #272 两条评论）。approval / proposal receipt 的档位语义见该文件 R-M-4，`deviated` 收编与 I-1/I-2 硬前置见 R-M-1；本 owner map 未被裁决指定额外的例外 owner。

