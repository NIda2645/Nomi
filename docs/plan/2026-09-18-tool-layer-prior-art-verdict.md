# 工具层分层裁决：拿 14 条发现去对照顶尖产品（2026-09-18）

> 状态：现行 · 2026-09-18 · 分支 `research/tool-layer-prior-art-20260918`（基线 `fix/verb-host-contract-sweep-20260918` @ 3bc0ca364）
> **输入**：`docs/plan/2026-09-18-tool-layer-findings-inventory.md`（14 条发现 + §4 九项已落地）与
> `docs/audit/2026-09-18-agent-capability-restatement-layers.md`（结构评审）。两份都读完了；本文回答它们 §5 的四问。
> **纪律**：每条结论带链接或 file:line；外网页面全部于 2026-09-18 抓取；凭记忆的东西一律标「未证实」。
> 对照用的仓库克隆（浅克隆，含 commit）在会话 scratchpad `prior-art/`，本文引用时给出 commit 与 file:line。
> **这份文件是要拿去做架构决定的。** 它允许、并且下面确实推翻了我们自己的一半判断。

## 0. 一句话裁决

**「该有两遍，不该有四遍」对了一半、错了关键的一半。**

- **对的一半**：模型面与宿主准入之间必须有**两道运行时动作**——校验 + 审批——而且花钱的审批必须在宿主侧、绑定在模型给出的那份参数上。六个对照面全是这样（§2）。
- **错的一半**：**没有任何一家把这两道做成两份独立手写的 schema。** 六个面全部是「**一份 schema，两个用途**」：给模型看的 JSON Schema 从它派生，执行前用它校验，handler 的参数类型从它推导（MCP TS SDK 源码注释原话：*"so the listing and the call cannot diverge"*）。「宿主内部名 vs 模型友好名」这种差异在别人那里**不存在**——要么名字只起一次，要么差异是宿主**算出来**的（`mcp__server__tool` 命名空间、`x-mcp-header`、Codex `sanitize_json_schema`），从来不是手写对照表。
- 所以「第三遍从对应关系生成」是**第二好的解**：它属于 MapStruct / AutoMapper 那一族（声明对应 + 未映射即报错），那一族存在的前提是「两边的类型各自独立演化、且都不由你控制」——而我们两边**都是我们自己写的**。**第一好的解是让第三遍不存在**：模型面 schema = 宿主 schema 的**投影**（子集 + 描述 + 去掉宿主自补的字段），名字只起一次；宿主自补（`operation`、`cardHidden`、参考图身份）作为显式 `fill`，补完**再过同一份 schema**（Claude Code 原话：策略按钩子返回的输入评估，不按模型发的）。对应表上 9 条 `rename` 里 7 条的 `why` 是「模型面叫 X，宿主面叫 Y」——按我们自己的 R5.5，**偏好不是合法的偏差理由**。
- **它对在哪个前提上**：我们两面之间隔着 `RuntimeToolCall.args: unknown`（`electron/shared/agentCapabilities/transportContracts.ts:22-26`）——类型在传输处被抹平，TypeScript 看不见这条缝。这是「四遍手写还能活着」的结构原因，也是别人没有这个问题的原因：别人的 handler 直接调用领域 API，参数类型齐全。**前提变了**（工具同进程执行，或传输改成类型化）→ 对应表可以整个删掉。但注意：即便类型化，TS **也抓不到「漏传一个可选字段」**（B3 那种静默丢），所以投影化（名字相同 ⇒ 不需要传）比类型化更根本。

## 1. 我们今天实际有几层（实测，不是清单说的「四遍」）

沿 `draft_shots` 在内部 lane 上走一遍，参数被**校验或重建**的点：

| # | 在哪 | 用哪份 schema | 做什么 |
|---|---|---|---|
| 1 | `VerbDeclaration.prepareArguments`（`writeVerbs.ts:174`，pi 官方钩子） | 无 | 容忍（整包 JSON 串、数组写成串、单对象→一元数组、字段别名） |
| 2 | pi `validateToolArguments`（`@earendil-works/pi-ai/dist/utils/validation.js:280-307`） | `toModelVisibleSchema(verb.schema)`（`laneToolSchema.mts`） | TypeBox 编译校验 + 四道内置容忍梯 |
| 3 | `laneTools.mts:237` `descriptor.schema.safeParse(params)` | **同一份** verb zod | 跑 zod 才有的 `superRefine`（跨字段约束） |
| 4 | `laneExtendedDesktopPorts.ts:88` `spec.schema.parse(wire.args)`（prepare）与 `:162`（execute，用来比对审批时的那份） | **同一份** verb zod，第 3、4 次 | 归一 + 审批绑定 |
| 5 | `verbToTransportCall`（`laneVerbTransport.ts:64`）执行 `verbTransportRoutes.ts` 的表 | 表 | **翻译**：改名 / 折缺省 / 参考图补壳 / 选分支 |
| 6 | `generationTransportAdapters.ts:67-96` `parsedArgs` | `generationPlanInputSchema`（**宿主契约**，`generationPlanSchemas.ts:113`） | 准入校验；同一函数里还有一份**更窄的手抄** create/patch/present schema（清单 E1，仍在） |
| 7 | `mcpGenerationMultiShot.ts:336-367` | 无（手写 `inherited` 合并） | handler 自己再做一次「顶层缺省折进每镜」 |
| 8 | 花钱卡 / 节点标签 / 持久化投影 | `generationShotEnvelopeOf` | 下游投影（已整只搬） |

三点实测结论：
- **模型面那一份 schema 被校验了三到四次**（#2 ajv、#3 zod、#4 zod×2），`laneToolSchema.mts:19-21` 头注释写的「校验只发生一次：pi 的 ajv 那次。宿主不再用 zod 复验」与 `laneTools.mts:237` 的「契约自己的那一次 parse……必须在这里、且只在这里」**互相矛盾**——两份文件头各自成立，合起来不成立。这不是 bug（superRefine 只有 zod 能跑），但说明「有几层」连我们自己也没数清。
- **翻译层（#5）做的「顶层缺省折进每镜」，宿主 handler（#7）自己也做了一遍**——`DRAFT_SHOTS_FIELD_MAP` 的两条 `defaults` 关系（`verbTransportRoutes.ts:190-191`）与 `mcpGenerationMultiShot.ts:359-366` 的 `inherited` 是同一件事的两份实现。外部 MCP 面只经过 #7，内部面两者都过。**任何住在翻译层里的逻辑，外部面天然没有**——清单 B5（`?? "full"` 只在内部 lane 有）是这一形状的一个实例，不是孤例。
- 审批闸（`laneApprovalGate.ts` → `preflightLaneApproval`，`laneApproval.ts:95-125`）跑在 pi 的 `before_tool`，**看到的是模型面参数**（#4 之前）；真正的花钱闸是宿主密封候选后摆出的报价卡（`nextAction: user_sees_spend_card`），**看到的是翻译 + 合成之后的宿主形状**。两道闸之间的一致性完全靠 #5 的翻译正确——`title` 在五处投影里各死一次，就是这条缝的直接证据。

## 2. 六个面逐个对照

每个面回答同样四件事：(a) 模型面与执行之间分几层、各叫什么；(b) 校验在哪、审批在哪；(c) 模型面 schema 与准入契约是不是**同一个对象**；(d) 有没有改名/翻译层，怎么做的。

### 2.1 MCP 规范（现行版 **2026-07-28**，不是任务书写的 2025-06-18）+ 参考实现 TS SDK

- 版本：https://modelcontextprotocol.io/specification/versioning — *"The **current** protocol version is 2026-07-28"*（本人 2026-09-18 抓取核实）。
- 规范原文（https://modelcontextprotocol.io/specification/2026-07-28/server/tools ，schema 存 scratchpad `prior-art/schema.ts`）：
  - 工具只有**一份** `inputSchema`（`schema.ts:1995`），加 `outputSchema` / `annotations` / `_meta`。
  - 校验双方都做、都对着**同一份**：Servers **MUST** *"Validate all tool inputs"*；Clients **SHOULD** *"Follow the `$ref` resolution requirements when validating tool inputs and outputs against `inputSchema` and `outputSchema`"*（客户端也校验输入这一句是 2026-07-28 新增的，2025-06-18 没有）。
  - 错误分两类、**语义校验失败归 `isError`**：Protocol errors（*"Unknown tool / Malformed requests … / Server errors"* → `-32602`）vs Tool execution errors（*"Input validation errors (e.g., date in wrong format, value out of range) / Business logic errors"* → `isError: true`），并且 *"Clients SHOULD provide tool execution errors to language models to enable self-correction."*
  - 审批是**宿主的独立一层、不在 schema 里**：*"there SHOULD always be a human in the loop with the ability to deny tool invocations"*；Clients SHOULD *"Prompt for user confirmation on sensitive operations"*、*"Show tool inputs to the user before calling the server"*。`ToolAnnotations` 明写 *"are hints … Clients should never make tool use decisions based on ToolAnnotations received from untrusted servers"*（`schema.ts:1903-1909`）。
  - **唯一的「字段要在别处再出现一次」机制是挂在字段上的注解，不是第二份映射**：`x-mcp-header` 写在模型面属性 schema 里，告诉传输把该参数镜像成 `Mcp-Param-{name}` 头；约束（只许基本类型、大小写不敏感唯一、静态可达）由客户端 **MUST** 校验，不合规就把工具从 `tools/list` 里剔除。
  - 新增 `InputRequiredResult`：`tools/call` 可以回 `resultType: "input_required"` + `elicitation/create`，**执行中途的人工闸成了协议结果形状**。
- 参考实现（`modelcontextprotocol/typescript-sdk` @ `6032170`，2026-09-16；本人复核）：`packages/server/src/server/mcp.ts:240-242` `tools/list` 用 `standardSchemaToJsonSchema(tool.inputSchema, 'input')` 派生模型面；`:272-274` `tools/call` 先 `validateToolInput(tool, …)` 再 `executeToolHandler` 再 `validateToolOutput`——**同一个对象**；`:276-280` 注释原话 *"The codec receives the SAME advertised JSON Schema `tools/list` emits … so the listing and the call cannot diverge."*
- (a) **1 层 schema + 1 层宿主审批**；(b) 校验：服务端必做、客户端应做，同一份；审批：宿主，作用在模型给的原始参数上；(c) **同一对象**；(d) **没有改名层**，只有字段级注解（`x-mcp-header`）这种「投影元数据挂在字段上、机器核」。

### 2.2 Claude Agent SDK / Claude Code（`@anthropic-ai/claude-agent-sdk@0.3.274`；docs 2026-09-18）

- 工具定义（`package/sdk.d.ts:9145`，本人复核）：`tool(name, description, zodShape, handler)`——**一份 zod**：模型面 JSON Schema 从它派生、执行前用它校验、`handler(args: InferShape<Schema>)` 的类型从它推导。文档：*"the handler's `args` are typed from it automatically"*（https://code.claude.com/docs/en/agent-sdk/custom-tools ）。
- 模型看到的名字和作者写的名字**确实不同**——`mcp__{server_name}__{tool_name}`——但这是宿主**算出来**的命名空间，不是作者写第二份。
- 审批是一条**与 schema 正交的六步流水线**（https://code.claude.com/docs/en/agent-sdk/permissions ）：hooks → deny 规则 → ask 规则 → permission mode → allow 规则 → `canUseTool`。规则语法是「工具名 + 参数前缀」（`Bash(npm run *)`），**不是**第二份 schema。
- **宿主准入层可以改写模型参数，改完重新过准入**：`PermissionResult = {behavior:'allow', updatedInput?: Record<string,unknown>} | {behavior:'deny', message}`（`sdk.d.ts:2389-2391`，本人复核）。PreToolUse 钩子 `updatedInput` 的原话（https://code.claude.com/docs/en/hooks ）：*"Replaces the entire input object … **Claude Code evaluates permission rules … against the input your hook returns, not the input Claude sent.**"* `PermissionRequest` 钩子：*"The modified input is re-evaluated against deny and ask rules."* ——**宿主自补 = 改写 + 重新准入**，不是一条看不见的翻译。
- **花钱/不可逆的闸是挂在同一份定义上的一个声明**：`_meta: { "anthropic/requiresUserInteraction": true }`（https://code.claude.com/docs/en/mcp ）——每次调用都弹窗，`bypassPermissions` / allow 规则 / 钩子的 `allow`+`updatedInput` 都跳不过，无 UI 的 `dontAsk` 模式下**拒绝而不是放行**：*"auto-approval would mean no human ever agreed."*
- (a) **2 层**：一份 schema；一条按名字 + 原始参数走的审批流水线；(b) 校验 = 同一份 zod；审批 = 流水线，可改写、改写后重审；(c) **同一对象**；(d) 没有改名层；只有宿主计算的命名空间。

### 2.3 Anthropic Messages API（docs 2026-09-18；页面存 scratchpad `prior-art/define-tools.md`、`strict-tool-use.md`、`so.md`）

- 一份 `input_schema`。`strict: true` 用文法约束采样保证输入合 schema（https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use ），但**表达不了钱相关的约束**：不支持 `minimum`/`maximum`/`multipleOf`、字符串长度、递归、`additionalProperties ≠ false`；`minItems` 只许 0/1（https://platform.claude.com/docs/en/build-with-claude/structured-outputs#json-schema-limitations ）。`refusal` / `max_tokens` 两种 stop_reason 下输出可能不合 schema；枚举大小写不保证。
- 定义工具的指导（`define-tools.md:73-86`）：*"Provide extremely detailed descriptions. This is by far the most important factor"*；*"Consolidate related operations into fewer tools … a single tool with an `action` parameter"*；*"Return semantic, stable identifiers (for example, slugs or UUIDs) rather than opaque internal references."* **没有任何一句支持「给模型一个与宿主不同的字段名」。**
- (a) 1 层；(b) 校验：采样期（可选）+ 宿主；审批：不在 API 里；(c) 同一对象；(d) 无。

