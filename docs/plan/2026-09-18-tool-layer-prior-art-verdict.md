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

### 2.4 OpenAI：function calling / Agents SDK / Codex

- **function calling 指南**（https://platform.openai.com/docs/guides/function-calling ，存 scratchpad `prior-art/function-calling.md:576-582`）的最佳实践原句，直接判了清单 A 类：
  *"**Don't make the model fill arguments you already know.** For example, if you already have an `order_id` based on a previous menu, don't include an `order_id` parameter. Instead, define `submit_refund()` with no parameters and pass the `order_id` in your code."*；
  *"**Use enums** and object structure to prevent invalid states. For example, `toggle_light(on: bool, off: bool)` allows for invalid calls."*；
  *"Make the functions predictable and intuitive"*；*"Combine functions that are always called in sequence."*
- **Agents SDK（JS）**（`openai/openai-agents-js` @ `506f736a1`，2026-09-16；本人复核 file:line）：`tool()` 一份 `parameters`（zod 或 JSON Schema），同一对象既发给模型又做运行时 parser（`packages/agents-core/src/tool.ts:2323` `getSchemaAndParserFromInputType`）；zod 参数**强制** strict（`tool.ts:2278` *"Strict mode is required for Zod parameters"*）；到 OpenAI strict 方言的转换是**生成 + 无损断言**（`utils/tools.ts` 的 `toOpenAIStrictToolSchema` / `assertLosslessOpenAIStrictZodSchemaConversion`）。审批只有 `approve(item, {alwaysApprove})` / `reject(item, {alwaysReject, message})`（`runState.ts:3117/3144`），**不能改参数**；参数解析失败**fail-closed**（文档：*"the SDK calls it only after the tool arguments have parsed into an inspectable object. Malformed JSON and non-object values fail closed"*，https://openai.github.io/openai-agents-js/guides/human-in-the-loop/ ）；输入护栏可配置在审批前跑、审批后**再跑一次**（*"in case the tool call became unsafe while waiting"*）。
- **Codex**（`openai/codex` @ `c775dd3`，2026-09-17；本人读 clone）：
  - 每个工具有两处手写：`core/src/tools/handlers/<tool>_spec.rs`（模型面 `ToolSpec`，JSON Schema 手写）与 `<tool>.rs`（handler 从 `ToolPayload::Function { arguments }` 字符串自己反序列化）。**这是六个面里唯一「模型面与 handler 两处手写」的**——但它们之间没有第三份翻译：handler 直接 `serde` 进自己的 struct，字段名与 spec 相同；Rust 类型系统在 handler 侧兜底，spec 侧靠 `*_spec_tests.rs` 快照。**没有改名。**
  - **审批的 affordance 长在模型面 schema 里**（`shell_spec.rs:232-275`）：`sandbox_permissions: "use_default" | "with_additional_permissions" | "require_escalated"`、`justification`（*"User-facing approval question for `require_escalated`; omit otherwise."*）、`prefix_rule`（*"Reusable approval prefix for `cmd`"*）。即：**模型自己声明这次要不要升级权限、给用户看的问题是什么**；决定权在宿主（`core/src/safety.rs:44-57` 按 `AskForApproval` 策略判），但"问什么"是模型填的字段。
  - MCP 工具进 Codex：`codex-rs/tools/src/json_schema.rs:62-71` `sanitize_json_schema`——*"Sanitize a JSON Schema … so it can fit our limited schema representation: Ensures every typed schema object has a `type` … Collapses `const` into single-value `enum` … Fills required child fields … with permissive defaults"*。这是一层**方言转换**（作者的 schema → 模型能吃的子集），方向与我们相反（它把「外部工具的 schema」投影成「模型面」，不是把「模型面」翻成「宿主面」），且是通用算法不是逐字段表。
- (a) function calling 1 层；Agents SDK 1 份 schema + 审批决定层；Codex **2 处手写但同名**（spec / handler struct）+ 策略层；(b) 校验：同一 schema（Agents SDK 强制 strict）；审批：独立层，只能批/拒（Agents SDK）或按策略判（Codex），审批的问题文本由模型面字段承载（Codex）；(c) 同一对象（Agents SDK）/ 同名两份（Codex）；(d) **没有逐字段改名层**；只有生成式方言转换（`toOpenAIStrictToolSchema`、`sanitize_json_schema`）。

### 2.5 pi（`@earendil-works/pi-agent-core@0.85.1`，本仓依赖，`node_modules/.../dist` 本人直接读）

- `AgentTool<TParameters> extends Tool<TParameters>`（`pi-agent-core/dist/types.d.ts:340-361`）：`parameters` **一份** TypeBox schema；`prepareArguments?: (args: unknown) => Static<TParameters>`（原注 *"Optional compatibility shim for raw tool-call arguments before schema validation. Must return an object that matches `TParameters`"*）；`execute(toolCallId, params: Static<TParameters>, …)`——**handler 的参数类型从同一份 schema 推导**。
- 校验一次、一份：`agent-loop.js:411` `validateToolArguments(tool, preparedToolCall)` → `pi-ai/dist/utils/validation.js:280-307`：`structuredClone` → `normalizeOptionalNulls` → `Value.Convert` → 非 TypeBox schema 再 `coerceWithJsonSchema` → `Compile(schema).Check`。失败抛带路径的错误串（**回显了整包参数**，`:303`——这也是我们 #547 那次「8 行报错只有 1 行是真的」的来源之一）。
- 没有审批层（pi 把它留给宿主的 hooks，我们的 `laneApprovalGate` 就挂在 `before_tool`）。`Tool.constrainedSampling?: {type:"json_schema", strict:"prefer"|"require"}`（`pi-ai/dist/types.d.ts:375-387`）是 strict 采样的开关。
- (a) 1 层 schema（+ `prepareArguments` 容忍钩子）；(b) 校验：pi 内一次；审批：宿主钩子；(c) **同一对象**，且 handler 参数类型 = `Static<TParameters>`；(d) 无改名层。**注意**：我们把 verb 的 zod 转成 TypeBox/JSON 给 pi 校验，然后又在 `execute` 里用 zod 再校验一次（§1 #3）——pi 的设计前提是「`execute` 拿到的就是校验过的 `Static<TParameters>`」，我们在它上面又叠了一台验证器。

### 2.6 ChatCut Desktop（最近的近邻：跨进程 + 花钱；本机 MCP 面本人 2026-09-18 直接读）

- 拓扑：`~/Library/Application Support/ChatCut/chatcut-mcp` 是 709 字节 shell 脚本，`exec /Applications/ChatCut.app/Contents/MacOS/ChatCut …/app.asar/out/main/mcp/server.js`，并设 `CHATCUT_MCP_SOCKET=…/mcp.sock`——MCP server 是**独立进程**，经 Unix socket 进桌面 app。**与我们同构**：模型面在 server 进程，执行在 app 进程，中间跨进程。
- `submit_video` 的 `inputSchema`（本会话 `mcp__chatcut_desktop__submit_video` 定义，本人读）：
  - `additionalProperties: false`，`required: ["model","taskMode"]`；`model` 是**给模型的别名枚举** `seedance-2-5 | seedance2 | seedance2fast | seedance2mini | kling | omni`；供应商参数的翻译在 handler 里，**并且写进了工具描述让模型知道**：*"For Kling customize multi-shot, omit prompt and pass model:kling, shotType:customize, and multiPrompts; the tool submits provider params as multiShot:true, shotType:customize, multiPrompt, and prompt:\"\"."*
  - 容忍写进 schema 本身而不是另一层：`durationSeconds: {anyOf:[number,string]}` *"Prefer a number; simple seconds strings like \"8s\" are accepted."*
  - **模型只给素材引用，身份宿主解析**：`refImages/refVideos/refAudios` 是 *"asset refs (UUID, short prefix, or asset://id)"*；`submit_image.referenceAssetIds` 原话 *"the backend resolves bytes server-side"*——与我们 A2 修法同一条。
  - 互斥约束只写在描述里（*"Do not combine with frame inputs"*），schema 上没有 `oneOf`——和我们 C2 一样靠模型自觉。
- `edit_item`（时间轴写，最复杂的一支）：`adds/updates/deletes` 是 `items: {type:"object", additionalProperties: {}}`——**模型面是松壳，真校验在 app 进程里**，配 `validateOnly: true` 干跑（*"dry-run validation/planning; no commit"*）与 `json` 字符串兼容入口。即 ChatCut 在最复杂的工具上选择了**「一份松 schema + 描述承载规则 + 宿主强校验 + 干跑」**，没有第二份模型面 schema。
- **钱怎么闸**：`submit_video`/`submit_image` **直接花额度、没有宿主审批卡**。闸有三道，没有一道是 schema：① 技能文本（`~/.claude/skills/chatcut-video-gen/SKILL.md:273` *"Generation costs credits. Before submitting, briefly tell the user what you're about to generate."*、`:107` *"Ambiguous or missing — ASK the user … A round-trip confirmation is cheaper than a wasted generation."*）；② 后端权益（`chatcut-image-gen/SKILL.md:10` `FEATURE_NOT_INCLUDED`）；③ `track_progress` 的 `recoveryUrl`（*"instead of resubmitting and spending credits again"*）。
- (a) 1 份 schema（模型面 = MCP inputSchema）+ app 进程内校验；(b) 校验：server 进程按 inputSchema、app 进程按内部规则（`edit_item` 明示）；审批：**没有宿主层**，靠提示词 + 后端权益；(c) 同一对象；(d) 模型别名 → 供应商参数的翻译**在 handler 里**、并在描述里向模型公开，没有对照表。

### 2.7 其它对照（Vercel AI SDK · LangGraph · Pydantic AI · Composio · DTO 映射器）

- **Vercel AI SDK**（`vercel/ai` @ `12845693d`，2026-09-17；本人复核 file:line）：`inputSchema` *"Serves dual purpose: generates the model-facing JSON schema AND performs runtime validation"*（https://ai-sdk.dev/docs/reference/ai-sdk-core/tool ）。顺序**先校验再审批再执行**：`resolve-tool-approval.ts:37` 的参数注释是 *"Valid tool call."*；*"Approval decisions cannot modify tool input"*（https://ai-sdk.dev/docs/agents/tool-approvals ）。**唯一的输入变换是 `T → T`**：`tool-input-refinement.ts:14-18` `(input: InferToolInput<T>) => InferToolInput<T>`，注释 *"must return an input with the same type shape"*，用途是跨供应商归一（`null` vs `""`），**不是改名**。花钱闸的绑定：`tool-approval-signature.ts:72` `hashCanonical(input)` 进 HMAC 载荷 `['ai-sdk-tool-approval-v1', approvalId, toolCallId, toolName, inputDigest]`——**审批绑定的是这份参数的规范哈希**（我们 `laneExtendedDesktopPorts.ts:169` 用 `JSON.stringify` 比对是同一个意图的手工版）。`@ai-sdk/policy-opa` 把「谁能花多少」放进 OPA 策略，*"entirely on top of the public `toolApproval` callback"*。
- **LangGraph HITL**（https://docs.langchain.com/oss/python/langchain/human-in-the-loop ）：四种决定 `approve / edit / reject / respond`，`edit` 的 resume 形状 `{"type":"edit","edited_action":{"name":…,"args":{…}}}`——人可以改参数，但改完**回到同一份工具契约**。
- **Pydantic AI**（https://pydantic.dev/docs/ai/tools-toolsets/tools-advanced/ ）：schema 从函数签名派生；`prepare: (RunContext, ToolDefinition) -> ToolDefinition | None` 可以**按次改模型看到的 name/description/parameters_json_schema**（只改模型面视图，执行函数不动）；审批 `ToolApproved(override_args=…)` 可改参数；`ToolReturn(return_value, content, metadata)` 是**输出侧**的「模型看的 / 应用看的」显式分离。**这是最接近「两个视图」的设计——但它是一份定义 + 一个声明的投影函数，不是两份 schema。**
- **Composio 修饰器**（https://docs.composio.dev/docs/tools-direct/modify-tool-behavior/before-execution-modifiers ，本人抓取）：`modifySchema({toolSlug, toolkitSlug, schema}) => schema`（删属性、改描述）、`beforeExecute({toolSlug, toolkitSlug, params}) => params`（*"modify the arguments called by the LLM before they are executed"*，例子就是宿主填值 `params.arguments.size = 1`）、`afterExecute`。三者都是**声明的、按工具挂的变换函数**，类型 `Schema→Schema` / `Params→Params`——用在**你不拥有执行端**的边界上。
- **DTO 映射器（我们对应表真正的同族）**：MapStruct（https://mapstruct.org/documentation/stable/reference/html/ §2.4）`unmappedTargetPolicy = ERROR|WARN|IGNORE`（默认 WARN）、`unmappedSourcePolicy`（默认 IGNORE），编译期生成、*"Clear error-reports at build time"*；AutoMapper（https://docs.automapper.io/en/stable/Configuration-validation.html ）`AssertConfigurationIsValid()` *"checks to make sure that every single Destination type member has a corresponding type member on the source type"*，出路是 custom resolver / projection / `Ignore()`。**`verbFieldMap.ts` 的五条不变量（①每个源字段有关系 ②关系源存在 ④落点存在 ⑤同落点分优先级）就是 `unmappedSourcePolicy=ERROR` + `unmappedTargetPolicy` 的运行时复刻**，`resolved`/`consumed`/`absentOn` 对应 custom resolver / `Ignore()`。这一族的适用前提在它们自己的动机里写着：AutoMapper *"eliminate the need for manual testing"* 之于「两边类型独立演化」——**两边都是你自己写的时候，这一族是在维护一条你自己造出来的缝**。

