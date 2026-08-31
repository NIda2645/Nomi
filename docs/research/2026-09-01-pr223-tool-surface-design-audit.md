# PR #223 工具面设计审计：先减少模型要选择的工具，再谈延迟加载

日期：2026-09-01  
定位：上一份 Agent 架构审计的补充；本稿只回答一个更底层的问题：**Nomi 当前暴露给模型的工具是否已经被设计过度原子化，哪些应该删除、合并或移出模型面。**

## 0. 结论先说

是的，当前模型工具面偏多，而且问题不只是数量。

PR #223 的源码显示：20 个 canonical capability 被投影成约 50 个模型可见 descriptor。`canvas-agent` 基础路径一次会拿到约 33 个工具；叠加 production 目标可达到约 43 个。很多 descriptor 的差别只是：

- 同一 capability 的 alias（例如 `get_media` / `inspect_media` / `search_media` 等）；
- 一个内部状态机的不同步骤（例如 generation 的 create → submit → preview → gate → start）；
- 本来应该由 Host/UI 的确认、进度推送或恢复机制完成的动作；
- 同一资源的不同读取形态，却没有统一的资源查询语义。

我的判断是：**不要先给这 50 个工具做 Deferred Loading。先把模型面收敛到约 12–14 个“用户意图级工具”，内部仍可保留 20 个 canonical capability 作为安全和领域执行边界。**

工具搜索/延迟加载只应成为第二层扩展机制：当未来接入长尾 provider、Skill 或 MCP 后，模型面超过 10 个且确实出现选择冲突时再启用。对当前主路径，它不是第一修复。

## 1. 证据：当前工具面到底有多大

### 1.1 50 个模型可见 descriptor 的静态盘点

`electron/harness/tools/agentToolCatalog.ts:105-141` 定义了六个模型工具组。按 PR head 的 descriptor 源码逐项计数：

| 工具组 | 当前模型可见数量 | 主要来源 | 初步判断 |
|---|---:|---|---|
| document | 6 | `documentDescriptors.ts:38-79` | 读/写/建 Skill 混在同一面；写入 3 个 alias 可合并 |
| canvas | 10 | `canvasDescriptors.ts:405-440` + registry write/delete | 画布计划、单节点写入、图结构操作、整理/删除混在同一面 |
| timeline | 14 | `timelineDescriptors.ts:48-78` | 读、媒体查询、导出、编辑计划、撤销过度拆分 |
| generation | 9 | `generationDescriptors.ts:64-110` | 计划状态机几乎每个阶段都暴露成工具 |
| production | 10 | `productionRunDescriptors.ts:11-98` | run/artifact/gate/progress 操作混在同一面 |
| skills | 1 | `skillDescriptors.ts:5-14` | `load_skill` 可保留 |
| **合计** | **50** | — | 不包含未来 MCP/connector 长尾 |

这是按源代码结构得到的静态计数，不是模型 token 计费值；真实 token 成本还取决于每个 JSON Schema 和 description 的长度。

### 1.2 一次请求实际会看到多少

- `agentChatPolicy.ts:82-98`：`canvas-agent` 基础工具集是 `canvasAll + timelineAll + generationAll`，即约 `10 + 14 + 9 = 33` 个。
- `agentChatPolicy.ts:193-249`：production profile 还会加入 production 工具；因此一条跨“项目 → 生成 → 成片”的自然语言请求可能拿到约 43 个 descriptor。
- `agentChatPolicy.ts:138-166` 只根据 prompt 正则选 profile，`:169-185` 又让 profile 只增不减；线程越长，模型可见 schema 集合不会缩小。

这正是用户感受到“工具太多”的根源：模型不是在 50 个完全不同的能力中选择，而是在大量重叠的名称和状态步骤中做选择。

## 2. 工具是不是应该少：先建立正确的判断标准

不能用“数量越少越好”替代设计。工具应该少到让模型能稳定选对，但不能少到变成一个无法校验的万能 `execute_anything`。

### 2.1 一个新工具必须满足的四个条件

只有同时满足以下条件，才值得成为模型可见工具：

1. **不同用户意图**：用户说法、目标和下一步决策明显不同，而不是同一动作的别名。
2. **不同安全/授权边界**：至少有不同的风险、审批、项目 scope 或预算语义。
3. **不同结果合同**：调用完成后模型需要不同类型的结果来决定下一步。
4. **不同失败/恢复语义**：失败不是简单换个参数重试，而是进入不同的恢复路径。

如果只是“内部函数不同”“数据库状态不同”“UI 上有两个按钮”，不应自动变成两个模型工具。

### 2.2 官方资料支持“少而强”，而不是“每个动作一个工具”

Anthropic 的工具设计指南明确建议把相关操作合并为更少、更有能力的工具，例如用一个带 `action` 参数的工具承载一组相关操作，并指出更少的强工具可以降低选择歧义。[Anthropic Managed Agents Tools](https://platform.claude.com/docs/en/managed-agents/tools)

Anthropic 的 tool search 指南把边界说得很清楚：少于 10 个工具、工具定义很小或每次都会用到时，普通工具调用更合适；达到 10 个以上、定义超过约 10k tokens、选择准确率下降或工具库持续增长时，才适合 tool search/deferred loading。[Anthropic Tool Search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)

OpenAI 对 GPT-5.4 的说明也把 tool search 描述为“工具很多时减少 upfront schema”，并没有把它当作糟糕工具设计的替代品。[OpenAI GPT-5.4 Tool Search](https://openai.com/index/introducing-gpt-5-4/)

因此正确顺序是：

```text
用户意图建模
  -> 合并/删除重复模型工具
  -> 隐藏内部状态机步骤
  -> 得到小而稳定的核心工具面
  -> 长尾能力再用 discover/load/deferred loading
```

## 3. 当前设计的底层问题：把三种接口混成了一个接口

这里有一个很重要的“设计意图与实现落差”：Nomi 已批准的统一运行时规格已经写对了抽象。`docs/superpowers/specs/2026-08-22-unified-runtime-mcp-generation-design.md:90-101` 明确把 MCP/UI/Canvas 定义为 transport 或 projection 而非事实源，并要求 stage-aware tool exposure 与 typed output；总方案也把目标定为 12 个语义工具。问题不是原则不存在，而是 `agentToolCatalog` 仍把大量 alias/operation alias 原样提升为 model-facing tool，导致模型面再次变成内部工具箱。

更早的总计划甚至已经把 L2 写成“12 语义工具”（`docs/superpowers/plans/2026-08-24-unified-agent-master-plan.md:14-24`）。所以本轮不是重新发明“少工具”方向，而是要把已拍板的语义工具边界从文档落回真正的 Pi projection；当前约 50 个 descriptor 是这条边界在实现层发生漂移的证据。

### 3.1 领域 capability ≠ 模型 tool

`electron/shared/agentCapabilities/registry.ts:35-56` 有约 20 个 canonical capability；它们是安全、权限、schema、执行 owner 的内部合同。  
`electron/harness/tools/agentToolCatalog.ts:105-141` 又把 capability 的 aliases、operation aliases、领域描述分别变成模型工具。

这导致同一个层同时承担：

- 内部执行的最小安全边界；
- 模型选择的语言接口；
- MCP/外部连接器的传输投影；
- UI 需要的状态机操作。

这四者的优化目标不同。内部 capability 需要精确、可审计、可回放；模型 tool 需要少、清楚、有意图；MCP 需要协议兼容和输出 schema；UI 需要阶段反馈和可恢复。把它们一对一投影，必然造成工具膨胀。

### 3.2 状态机步骤泄漏给了模型

generation descriptor 有：

- `nomi_operation_create`
- `nomi_submit_generation_plan`
- `nomi_preview_execution`
- `nomi_request_generation_gate`
- `nomi_start_generation`
- `nomi_operation_read`
- `nomi_cancel_generation`
- `nomi_reconcile_generation`

见 `electron/harness/tools/generationDescriptors.ts:64-110`。

对 Host 来说，这些阶段必须存在；对模型来说，用户只表达了一个目标：“用这张参考图生成一段 5 秒视频”。模型应该负责形成可编辑计划、读取状态和解释结果，而不应被迫管理支付/确认/提交/核账的内部状态机。

production descriptor 也有同样问题：`subscribe_production_run`、`decide_production_gate`、`review_production_artifact`、`materialize_production_storyboard` 等是 Host/UI 协作和用户确认的边界，不应全部成为模型可自由调用的动作。

### 3.3 Alias 被当成了新的选择分支

例如 asset read 一个 canonical capability 被投影为五个模型名：

- `get_media`
- `inspect_media`
- `search_media`
- `inspect_source_range`
- `read_waveform`

它们确实有不同读取目的，但当前的模型面没有一个统一的“资源查询”概念，模型必须先在五个名字中猜语义。类似的拆分也出现在 document、export、timeline、production。

这里应该先问：差异是否改变授权/副作用？如果都是只读、同一 project binding、同一结果脱敏边界，那么模型面可以用一个 typed query 工具，内部仍映射到多个 canonical operation。

## 4. 逐组删减与合并建议

下面的数量是“模型可见工具”目标，不是要删除内部 capability。所有合并都要求保留 canonical adapter、Host policy、proposal/receipt、Undo 和 MCP 兼容层。

### 4.1 Document：6 → 3

| 当前 | 建议模型面 | 原因 |
|---|---|---|
| `read_full_text`、`read_selection` | `document_read({scope: full\|selection})` | 同一只读意图，只是 scope 不同 |
| `insert_at_cursor`、`replace_selection`、`append_to_end` | `document_edit({operation, content})` | 同一可撤销写入边界，operation 是强枚举 |
| `author_skill` | `skill_author` | 这是高阶资源创建，不应和日常文稿编辑混淆，但可保留独立工具 |

约束：`document_edit.operation` 不能接受任意字符串；Host 仍按 canonical `document.write` 做 selection/lease/approval 校验。

### 4.2 Canvas：10 → 4

| 当前 | 建议模型面 | 原因 |
|---|---|---|
| `read_canvas_state` | `canvas_read` | 保留，作为 JIT 项目上下文入口 |
| `propose_storyboard_plan`、`arrange_storyboard_to_timeline`、`create_staging_reference`、`create_camera_move` | `canvas_plan({kind, plan})` | 都是“为镜头/画布形成可审查计划”，不应让模型先猜四个动作名 |
| `set_node_prompt`、`create_canvas_nodes`、`connect_canvas_edges` | `canvas_edit({operations[]})` | 同一画布 proposal/Undo/selected-node 边界；操作 union 要严格枚举、限制数量 |
| `delete_canvas_nodes`、`tidy_canvas` | `canvas_maintenance({action})` | 都是高风险结构整理/删除，应单独保留硬审批工具，避免被普通 edit 混用 |

不建议把所有东西合成一个 `canvas_execute`：那会让 schema 变成难以理解的巨大 union，并把高风险删除混进普通写入。

### 4.3 Timeline/Media/Export：14 → 4

| 当前 | 建议模型面 | 原因 |
|---|---|---|
| `get_media`、`inspect_media`、`search_media`、`inspect_source_range`、`read_waveform` | `media_query({kind, ...})` | 都是项目绑定的只读媒体查询；kind 用严格 union 选择返回形状 |
| `read_timeline`、`inspect_timeline_range` | `timeline_read({scope})` | full/range 是同一读取意图 |
| `propose_edit_plan`、`apply_edit_plan`、`undo_timeline_edit` | `timeline_edit({action, plan/ref})` | plan → apply → undo 共享 compare-and-swap/Undo 语义；默认只读 preview，apply/undo 仍触发审批 |
| `inspect_export_job`、`verify_render`、`export_timeline`、`cancel_export_job` | `export_job({action})` | 同一个 export job 资源的 status/verify/start/cancel；start/cancel 由 Host policy 保护 |

这里的合并重点不是省四个名字，而是让模型围绕“媒体、时间轴、导出任务”三个资源思考，而不是围绕十四个内部函数思考。

### 4.4 Generation：9 → 3（其中 2 个模型工具 + 1 个 Host/UI 动作）

| 当前 | 建议 |
|---|---|
| `nomi_get_generation_context` | 保留为 `generation_context`，只读、无额度 |
| `nomi_operation_create`、`nomi_submit_generation_plan`、`nomi_preview_execution` | 合并为 `generation_plan({action: create\|patch\|preview, ...})`；仍是草稿/预览，不提交供应商 |
| `nomi_operation_read`、`nomi_reconcile_generation` | 合并为 `generation_status({action: read\|reconcile})`；reconcile 只做核账 |
| `nomi_request_generation_gate`、`nomi_start_generation` | **移出普通模型工具面**。模型可以请求“需要用户确认”，但真正打开确认卡和 start 由 Host/UI 在 approved plan 上触发 |
| `nomi_cancel_generation` | 放入 `generation_status/control` 的 Host-controlled action，或只保留一个明确的 `generation_cancel` 硬门工具 |

关键原则：支付、额度、提交和未知结果核账不是模型要“选择”的业务工具；它们是用户确认后的 Host transition。这样既减少工具，也减少 prompt injection/模型误触发付费的机会。

### 4.5 Production：10 → 3

| 当前 | 建议 |
|---|---|
| `start_production_run`、`get_production_run`、`control_production_run` | `production_run({action: create\|read\|pause\|resume\|cancel})`；create 只建 reviewable brief/playbook draft |
| `read_production_artifact`、`read_production_artifact_content`、`revise_production_artifact`、`review_production_artifact` | `production_artifact({action: read\|read_content\|revise})`；review 保留 Host/UI 用户操作，不让模型代替用户批准 |
| `subscribe_production_run`、`decide_production_gate`、`materialize_production_storyboard` | 从模型工具移出，改为 Host event / UI command；模型通过状态结果得知 gate，不能伪造用户 decision |

另外，`start_production_run` 与 generation 的 `operation_create` 有明显重叠。推荐保留 production 作为“长任务 playbook/阶段机”，generation 作为“具体图/视频生成计划”；两者的边界应写进 description 和 contract，而不是让模型通过名称猜。

### 4.6 目标总量

按以上建议，模型面约为：

```text
document 3
canvas 4
media/timeline/export 4
generation 2–3
production 2–3
skill 1
--------------------------------
合计约 16–18（再从高频路径投影到 10–14）
```

第一阶段不必追求数学上的 10 个。真正的目标是：一个普通创作请求只看到与该任务有关的 6–10 个；跨域长任务才通过明确的 context/plan/status 工具逐步进入下一域。只有长尾工具继续增长时，再接 Deferred Loading。

## 5. 三种方案的取舍

| 方案 | 模型看到什么 | 优点 | 代价/风险 | 判断 |
|---|---|---|---|---|
| A. 维持 50 个，直接 Deferred Loading | 50 个长尾定义 + search/load | 改动表面小，扩展快 | 根本的 alias/状态机歧义仍在；把设计债转成搜索债；搜索结果本身也会增加一步 | 不选 |
| B. 语义合并到 12–18 个，再按需加载长尾 | 资源/意图级工具；内部 capability 隐藏 | 选择分支少、描述清楚、Host 安全边界不丢、可逐步扩展 | 需要一次模型面 contract 迁移和旧 alias 收口 | **推荐** |
| C. 一个万能 `execute(action,args)` | 只有一个工具 | 名字最少 | schema 失去可理解性；模型更容易错 action；授权/审计/结果合同变成动态字符串，违反“结构化意图”原则 | 不选 |

底层取舍不是“50 还是 10”，而是：**我们要让模型选择用户意图，还是让模型选择 Nomi 内部状态机。** 推荐 B，因为它把模型放在正确抽象层，同时保留内部精细执行。

## 6. 对 PR #223 现有实现的具体优化顺序

### Step 1：先做工具面盘点，不改 runtime

建立一张机器可读的 `modelToolSurfaceManifest`，每条记录：

```text
modelToolId
canonicalCapabilityIds[]
userIntent
resource
risk / approvalBoundary
resultKind
hiddenInternalActions[]
replacementToolId
```

静态检查必须能回答：一个模型工具映射几个 canonical capability；一个 canonical capability 被多少模型工具重复暴露；是否存在只因 alias/状态机步骤而重复的模型工具。

### Step 2：先删模型入口，保留内部 adapter

先在 `agentToolCatalog` 增加新 semantic projection，逐一把旧 alias 从 `agentToolProjection` 移除；Host registry、MCP projection、UI command 不跟着删除。这样回滚只涉及模型面，风险可控。

这符合 P1：新 projection 落地的同一提交删除旧模型 projection，不长期并行暴露两套模型接口。

### Step 3：把审批/进度/核账从模型工具移到 Host event

至少先移出：

- `nomi_start_generation`
- `decide_production_gate`
- `review_production_artifact`
- `materialize_production_storyboard`
- `subscribe_production_run`

模型得到的是结构化状态/“等待用户确认”结果；用户确认由 Resident Shell/Host command 完成。这样可以减少模型决策空间，同时让“谁有权批准”在架构上不可混淆。

### Step 4：给合并工具设计严格 union，而不是自由字符串

例如：

```ts
z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), ... }),
  z.object({ action: z.literal("patch"), operationId, ... }),
  z.object({ action: z.literal("preview"), operationId }),
])
```

每个 branch 都要有独立的 input/output schema、风险和测试；不能用 `z.record(z.unknown())` 把合并工具重新变成隐形万能工具。

### Step 5：测量“少工具是否真的更好”

用同一组真实任务做 A/B：旧 50-tool surface、新 semantic surface。不要只比较 token。

必须记录：

- 首次工具选择正确率；
- 错工具/重复工具/无效参数比例；
- 完成同一目标所需 round trips；
- tool schema 输入 token 与 cache hit；
- Host 拒绝率（区分模型选错与越权）；
- 任务完成率、重复提交率、用户确认次数；
- 结果中可继续决策的字段比例；
- 100-turn 线程的 context growth。

### Step 6：只有指标仍显示长尾冲突，才加 Deferred Loading

Deferred catalog 的第一批应该是低频/高成本工具，不是当前高频核心。保留 3–5 个最常用工具常驻，其余通过 discover/load；这与 Anthropic 的官方工具搜索建议一致。[Anthropic Tool Search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)

## 7. 需要补的测试

### 7.1 合并正确性

- `document_read(scope=full|selection)` 与旧两个入口得到同一 canonical result。
- `document_edit(operation=...)` 三个 branch 各自保留 selection、Undo、approval 和 revision guard。
- `media_query(kind=...)` 不允许跨 branch 读取未声明字段或泄漏路径。
- `generation_plan` 的 create/patch/preview 不会触发 provider submit 或额度扣减。
- production artifact 的 review/decision 不能由模型工具伪造为用户批准。

### 7.2 选择质量

- 同一任务在 semantic surface 下不得调用 `export_job`、`production_run` 等无关工具。
- 文本出现“生成/预览/确认”时，模型不会直接调用 start；只有 Host/UI approved event 才能提交。
- 错误结果要返回下一步可执行的结构化状态，而不是让模型猜内部错误字符串。

### 7.3 安全与兼容

- 旧 alias 从模型 projection 删除后，MCP/内部 UI 的 canonical alias 仍可用。
- 动态合并工具不能扩大 `requestedCapabilities`、project lease、selected node 或 approval policy。
- 所有合并工具仍经过统一 input/output schema、redaction、receipt 和 idempotency。
- 旧历史中记录的 tool name 可通过 versioned alias reader 回放，但不得重新暴露给新模型。

## 8. 给下一位审核 AI 的执行任务单

请按下面顺序复核，而不是直接提出“加 tool search”：

1. 读取 `agentToolCatalog.ts`、六组 descriptor 和 canonical registry，生成当前 50 项映射表。
2. 对每项标记：`keep`、`merge`、`host-only`、`delete`，并给出用户意图/安全边界/结果合同证据。
3. 先审 `generation` 和 `production` 的状态机泄漏，再审 `timeline/media/export` 的只读重复。
4. 输出新模型面 manifest 和旧 alias 迁移表；没有这两张表不进入实现。
5. 实现一个垂直切片：推荐先做 `generation_context + generation_plan + generation_status`，跑完整的 plan → preview → user gate → host start 旅程。
6. 用真实任务 A/B 测量；若新面已经稳定在 6–10 个工具，不引入 Deferred Loading。
7. 只有长尾确实超过选择/成本阈值，才设计 `discover_tools/load_tool`，并将其作为独立阶段，不和语义合并混在同一 PR。

## 9. 最终判断

Nomi 现在最需要的不是更聪明地管理 50 个工具，而是承认其中一部分根本不应该是模型工具。模型需要的是“读项目、形成计划、修改一个可审查对象、查看状态、请求用户确认”；Host 需要的是“校验、授权、执行、回执、重试、恢复、进度和账本”。

把后者原样暴露给前者，工具越多，模型越容易把内部流程当成用户目标。先做语义合并和 Host-only 收口，才能让后面的 Deferred Loading 真正解决长尾问题，而不是把工具设计问题搬到搜索结果里。
