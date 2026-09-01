# M0 旧路径清单与删除里程碑

原则：新实现与旧实现同一提交删除；旧路径若只能做迁移读，必须 versioned、只读、不可扩大 lease/budget/approval，且有删除里程碑。

| 旧路径 / 证据（#223@46066ed0） | 类根因 | 删除里程碑 | 删除动作与验收 |
|---|---|---|---|
| `history: { kind: "ephemeral" }`（`projectAgentExecutionCoordinator.ts:655-666,1161-1167`） | Host/Pi/prompt 三份 conversation owner | M1 | Host ledger 成为唯一 durable history；结构扫描禁止生产调用 |
| 全文 `executionPrompt` replay（`projectAgentExecutionHelpers.ts:44-55`） | 旧文本拼接绕过 Item/summary/context revision | M1 | 删除生产 fallback；仅保留迁移读说明/测试 fixture |
| 每轮新建 Pi session（`harness/runtime/pi/run.mts:52-80`）作为事实恢复 | loop session 冒充 durable owner | M1 | Pi session 可重建；按 `threadId + seq + contextRevision` replay |
| `agent_end` / stream close / provider response 当 completed | 缺 settlement barrier | M1 | 只允许 `execution_settled` 发布 UI completed |
| `deviated: false` 的 9 处硬编码（coordinator/helpers） | 偏差状态无共享 owner/写入边界 | M1 | 状态字段由 reducer 持久化；报告案例+同类入口测试 |
| document/canvas/timeline/production/generation 的 alias 一对一 model projection | 模型被迫学习内部状态机 | M2 | manifest 生成 12–15 semantic tools；旧 alias 从 model surface 删除 |
| `nomi_start_generation`、`decide_production_gate`、`review_production_artifact` 的 model-facing 调用 | 模型可伪造批准/推进 | M2 | Host/UI event-only；MCP compatibility reader 不回投新模型 |
| `subscribe_production_run` 模型订阅 | 模型拥有进度生命周期、重复消费 | M2 | event stream 推送；模型只按需 read |
| `materialize_production_storyboard` 模型直接调用 | artifact→canvas 越权 | M2 | Host/UI command + approved version/ref |
| 全量 Skill/project/history 字符串 join（`agentContext.ts:73-97` 等） | context 无稳定性/trust/provenance/预算 | M3 | PromptPipe + JIT index/search/read；删静默吞错与全量 join |
| 只记录 compaction 次数的成功判断（`run.mts:200-205`） | 摘要缺 goal/decision/ID/receipt 合同 | M3 | `AgentContextSummaryV1` + handoff；缺 ID fail closed |
| `unknown` 直接 `modelText(decision.result)`（`run.mts:101-104`） | output projection 不闭合 | M4 | 唯一 safeParse/redact/size-cap projection；schema 失败不得入模型 |
| 未知 provider 提交自动重提 | effect 与 receipt 未分类 | M4 | `unknown → reconcile`；删除盲重提 fallback |
| deferred `discover/load` 作为默认工具面 | 长尾机制先于语义合并 | M5（仅当 A/B 证明必要） | 若未满足阈值则不引入；若引入不得扩大权限 ceiling |

OPEN QUESTION：PR #272 维护者评论正文目前不可达，无法确认是否另有裁决指定某条 legacy path 的例外。未取得原文前以上表是方案 §8 顺序，不是评论裁决的替代品。

