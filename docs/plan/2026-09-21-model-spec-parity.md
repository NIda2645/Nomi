# 模型说明书对等 + 分级披露 + 参数值层设防（2026-09-21）

> 状态：现行 · 分支 `fix/model-spec-parity-20260921`（基线 `origin/main` @ 5f17a7d17）
> 用户拍板（2026-09-21）：①「MCP 不能重造一套，而是复用」②「分级披露，里外都要做」
> ③ Nomi **不计算任何 API 花费**——返回里不许编造金额；档案参数选项自带的 `priceLabel` 可原样带出，没有就不写。

## 0. 一句话

「这个模型接受哪些参数」今天在仓里有**三份互不比对的定义**，而对外 MCP 面**一份都拿不到**；
参数值层又在一个两面共用的函数里**静默丢弃**未知键。本刀把这三份收敛成一份「准入契约」，
两个模型面都从它投影（薄名单 + 单模型详情两档），并让参数填错**明确拒绝而不是无声丢掉**。

## 1. 真实摩擦（从用户那一刻倒推，D1）

外部宿主（Claude Code 当 MCP 宿主）里的 AI 想「用 Seedance 2.5 的 720p、不要声音，出一条 5 秒视频」。
它先 `nomi_read{target:"models"}`，拿回来的每行只有 `vendor/modelKey/kind/label/keyStatus/usable/statusReason/references`
——**没有模式、没有参数、没有变体**。它只能猜参数名。猜错了，`compileParameters` 把那个键
默默扔掉，计划照样「成功」，用户拿到的是一条**带声音的 1080p** 片子，而且没有任何一处报错。

应用内 Agent 不猜：`list_models` 返回的是完整 `AgentModelEntry[]`（modes/params/slots）。
**同一件事，两个入口的质量差了一个数量级。**

## 2. 类根因

### 2.1 「这个模型接受哪些参数」有三份定义

| # | 在哪 | 从哪 derive | 谁读 |
|---|---|---|---|
| ① | `src/config/modelArchetypes/**` 的 `ArchetypeMode.params`（`ModelParameterControl[]`） | 人工 curated 档案 | 渲染层 UI 参数面板；`buildAgentModelEntries`（`src/workbench/generationCanvas/agent/availableModels.ts:59-81`）→ 应用内 Agent 的 `list_models` |
| ② | `modelParameterSchema`（`electron/capabilityCore/moduleCatalogBootstrap.ts:36-55`） | `model.onboarding.fields` + mapping `create.defaultParams` | **花钱那道闸**：`compileParameters`（`electron/capabilityCore/executionContract.ts:111-131`）真正拿它校验 |
| ③ | `videoParameterSchema`（`electron/capabilityCore/mcpGenerationVideoResolve.ts:220-226`） | video 档案的 mode params（video 档案住 `electron/shared/videoCapabilities`，主进程够得到） | 同上，video 时**覆盖** ② |

对外 MCP 面（`ModelListingEntry`，`electron/catalog/modelCatalogListing.ts:25-49`）**一份都不投**。

后果是机械的：
- **video** 模型走 ③，模型面（①）与准入面（③）同源，大体对得上；
- **image / audio / 3d** 模型走 ②，而 ② 来自 onboarding 字段——**档案里有、onboarding 里没有**的参数键，
  应用内 Agent 会被 ① 告知它存在，`compileParameters` 却按 ② 判定它「不被支持」→ 静默丢弃。
  这条缝**没有任何测试或门岗在比**。
- 外部 MCP 面不知道任何参数名 ⇒ 100% 靠猜 ⇒ 100% 落进同一个静默丢弃分支。

### 2.2 参数值层不设防

`compileParameters`（两面共用）今天的行为：
- **未知键** → `droppedFields.push(...)` + `warnings.push(...)`，**继续**（值没了，调用照常成功）；
- 类型不符 / 不在枚举 → 抛 `ContractCompilationError`，但消息只说「不符合当前模型的声明」，
  **不说合法取值是什么** ⇒ 模型无法自纠（MCP 规范要求 tool execution error 要能让模型 self-correct）；
- **越界**（min/max）→ 根本没有判据：`ParameterField`（`moduleManifest.ts:5-10`）只有 `type/required/enum/description`；
- `variantId` 不存在或不属于该模型 → `compileExecutionContract:146` 只判「非空串」，不判存在性。

### 2.3 节点模型键写入不设防

`bindModelIdentity`（`electron/capabilityCore/canvasNodeFactory.ts:71-85`）注释自陈
「非法/未知值原样存——校验留在 UI」。外部 MCP 面走的正是这条路（`canvasGraph.addNodes` 只校验 `kind`），
UI 面压根不传 `vendor/modelKey`（`src/workbench/generationCanvas/store/canvasNodeActions.ts:77-88` 传的是已组装好的 `meta`）。
即「留给 UI 的那层校验」**对这条路不存在**。而 `canvasRead`（`canvasRead.ts:36-52` 的 `.strict()` 节点）
**不返回任何模型字段** ⇒ 写进去的错模型键连读都读不回来。

## 3. 范围

### 做
- **A** 一份「模型准入契约」owner + 两面分级披露（薄名单 / 单模型详情），两面同一份投影。
- **B** `compileParameters` 改成结构化拒绝（未知键 / 错类型 / 不在枚举 / 越界 / 错变体），
  错误里带**合法键清单或最接近的键**与**合法取值**；`droppedFields` 删除（记了没人读的字段不留）。
- **C** `bindModelIdentity` 校验模型身份（注入校验器，保持本文件零 import 的约束）；
  `canvasRead` 把模型标识与变体读回来（参数按需）。

### 不动
- 不动花钱闸的相位（`phase`/`action`/报价卡）与审批收据；
- 不动 `tools/list` 的工具**数量**（棘轮）——分级走既有 `nomi_read` 的 `target` 机制扩展，不新增工具；
- 不动 `src/config/modelArchetypes` 的归属（见 §6 残余风险）；
- 不计算、不显示任何金额。

### 回滚
单分支、按 A/B/C 分 commit；任一档出问题可单独 `git revert` 该 commit，
门岗基线（`check:vocabularies` 登记、`check:mcp-payload` 字节）在同 commit 内改，不跨 commit。

## 4. 验收门
1. 「这个模型接受哪些参数」的来源数：改前 3（+MCP 面 0）→ 改后 1 + 投影层；报告里给逐条清单。
2. A/B/C 各有先红后绿用例；B 覆盖未知键 / 错类型 / 越界 / 错枚举 / 错变体 / 合法跨模型残留。
3. **两面对等性测试**：同一模型经 `list_models`（内部面）与 `nomi_read{target:"model"}`（外部面）
   拿到的详情**逐字段一致**。
4. 两面模型清单字节数改前/改后各量一次；`tools/list` 总字节不增。
5. 真实模型数字（R13.3）：工具写对率 / 回合成功率改前 vs 改后，只到「计划/预览」为止，不下单。

## 5. 先查别人（R5⑤：外部也读写的契约）

**这条契约外部宿主也读写**（Claude Code / Codex 当 MCP 宿主时按它写参数），按 R5.5 三列表登记。

### 规范
- **MCP 2026-07-28 · Tools**（https://modelcontextprotocol.io/specification/2026-07-28/server/tools ，本人 2026-09-21 抓取全文）：
  - 错误分两类，**「Input validation errors (e.g., date in wrong format, value out of range)」明确归 Tool Execution Errors → `isError: true`**，
    且 *"Clients **SHOULD** provide tool execution errors to language models to enable self-correction."*
    → **我们的偏差**：今天未知键根本不报错（静默丢）。**偏差理由**：无。本刀消除。
  - `outputSchema` + `structuredContent`：*"Servers **MUST** provide structured results that conform to this schema"*；
    *"a tool that returns structured content SHOULD also return the serialized JSON in a TextContent block."*
    → 我们已是这个形状（`structuredContent.nomiRunData` 一族），新 `target:"model"` 沿用。
  - `tools/list` 支持分页与缓存、**要求确定性顺序**——但**规范里没有**「工具结果内部再分级」的机制。
    → 分级披露是**规范之上的设计模式**，不是协议特性；我们据此选择「不新增工具、在 `nomi_read` 的 `target` 里分级」。
  - Security：*"Servers **MUST**: Validate all tool inputs"* → C 与 B 都落在这条上。
- **Stateful Tools 一节**（同页，非规范性指引）：*"A call against an expired or unknown handle should return
  a tool execution error that says so, so the model can recover by creating a new one."*
  → 同构地，未知 `modelId`/`variantId`/参数键都该是「说清楚 + 给出路」的执行错误，而不是丢弃或泛化消息。

### 同类做法（分级披露怎么做）
- **Solo.io agentgateway**（https://www.solo.io/blog/mcp-progressive-disclosure ，本人 2026-09-21 读全文）：
  *"the gateway replaces the upstream tool list with two meta-tools (`get_tool` and `invoke_tool`)
  so clients see only a lightweight index"*；文中明说这是 **layered on top of MCP，不是协议的一部分**。
  形状 = 「薄索引 + 按名取详情」，与本刀的 `target:"models"` / `target:"model"` 同构。
- **Anthropic Skills 的结构**（同一模式的另一处实例）：名字 + 一句描述进上下文，正文调用时才载入。
- **MCP 社区综述**（https://modelcontextprotocol.io/docs/2026-07-28/develop/clients/client-best-practices 与
  https://github.com/orgs/ModelContextProtocol-Security/discussions/3 ，检索所得、**未逐句复核**）：
  反复出现的建议是 *separate manifests from schemas*、`list_tools` / `describe_tool` 两级。

### 仓库里已有
- 外部 MCP 面已经是**投影形状**：`electron/capabilityCore/mcpGenerationToolCatalog.ts:22`（`.omit().extend()`）——
  本刀延用同一手法，不再手抄第二份。
- 档案→主进程的**既有桥**是 codegen：`scripts/gen-archetype-wire-defaults.ts` →
  `electron/catalog/archetype*.generated.ts`，带漂移门 `check:archetype-defaults`。本刀不新增第二种桥。
- 分级披露在本仓已有先例：`skills.list`（元数据，不含正文）/ `skills.read`（正文）——
  `electron/capabilityCore/dispatcher.ts:390-404`，注释原话「渐进披露，不含正文」。
  **模型目录照抄这个已被接受的形状**，不发明第三种。

### 反方 / 推翻
- 2026-09-18 的裁决（`docs/plan/2026-09-18-tool-layer-prior-art-verdict.md` §0）说「一份 schema 两个用途」，
  唯一「两份手写」的先例 Codex 已被量到漂移。本刀的三份参数定义正是那条裁决点名的形状。
- **不采纳**「给外部面另造一份模型详情、从档案 derive」的做法（同日 scratchpad `mcp-paid-path/PLAN.md` 的提法）：
  那会变成第四份。正解是接到**准入契约**这一份上——它才是真正决定成败的那份。

## 6. 残余风险 / 没做的
- `src/config/modelArchetypes`（image/audio/3d 共 58 个档案）仍住渲染层，主进程够不到；
  video 那 39 个已在 `electron/shared/videoCapabilities`（index.ts 自称 *canonical home*）。
  **本刀不做这次搬家**（42 个数据文件 + 17 个测试 + 85 个消费方，是它自己的一刀）。
  代价：模型面详情里的**人话文案**（`vendorTerm`/`intent`/`hint`/`slots`）在外部面仍只对 video 齐全；
  **参数与变体两面等价**，因为它们来自准入契约。这条写进合同 `residual_risks`。
- `ParameterField` 新增 `min/max` 后，onboarding 字段里没有范围声明的模型仍然无范围可判——
  那是目录数据的缺口，不是校验层的缺口，按 R17 记成「能判的就判、判不了的明说」。
