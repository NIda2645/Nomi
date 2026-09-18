# 投影原型：`cancel_job` 一个动词（2026-09-18）

> 状态：✅ 已交付 · 2026-09-18 · 分支 `feat/tool-projection-20260918`
> 上游：`docs/plan/2026-09-18-tool-layer-handoff.md` §8 第 4/5 条（「先在一个小动词上做原型再铺开」）与
> `docs/plan/2026-09-18-tool-layer-prior-art-verdict.md` §2（六家的做法）。
> **这份文档只管一个动词。** 它要回答的是一个能不能的问题，不是一次铺开。

## 为什么做这件事（一句大白话）

今天一个工具在我们这里被写**两遍**：模型看的那份 schema 一遍，宿主收的那份 schema 一遍。两遍之间
再手写一张对照表，说清「模型的 A 对应宿主的 B」。三份东西描述的是同一件事，所以任何一份改了、
另外两份没跟上，值就会在中间无声地丢掉——2026-09-18 当天量到两次。

外面的做法是**一份 schema 两个用途**：宿主契约那份是唯一真相，模型看的那一面是它的**投影**
（藏掉宿主自己会补的字段、覆写描述），宿主补完值之后**再过一遍同一份 schema**。没有第二份 schema，
也就没有对照表，更没有「两份之间漂移」这件事。

**这次要权衡的那个东西**：投影能不能表达我们真实的复杂度？具体就是**双域动词**——`cancel_job`
既能停一笔生成，也能停一次导出，而这两个域的宿主用的是**两个不同的字段名**（`operationId` /
`jobId`），各自还都是磁盘上的目录名。一份 schema 投不出两个域。所以拿它做原型，不是因为它最简单，
是因为它最能把边界照出来。

## 先查别人

（出处从 `docs/plan/2026-09-18-tool-layer-prior-art-verdict.md` §2 抄来，那份是当天真做过的检索报告。）

- **依赖里已有？** pi 的 `AgentTool<TParameters>` 一份 TypeBox 两用，`execute` 的参数类型从同一份 schema 推导 —— `node_modules/@earendil-works/pi-agent-core/dist/types.d.ts:340-361`（裁决 §2.5 本人直接读过）。我们现在却是把 verb 的 zod 转成 TypeBox 给 pi 校验，再在 `execute` 里用 zod 验第二次。
- **仓库里已有？（模型面投影）** 我们对外 MCP 面**已经是投影形状**：`electron/capabilityCore/mcpGenerationToolCatalog.ts:22` 用的就是 `.omit().extend()`。本原型是把同一手法搬到内部动词面，不是新发明。
- **仓库里已有？（补值 + 重过同一份 schema）** `electron/shared/agentCapabilities/exportCapabilities.ts:157` 的 `exportWriteInputForAlias` 已经在做 `exportWriteSemanticInputSchema.parse({ operation: alias, ...schema.parse(value) })`。本原型直接接到它上面，不另写一段。
- **生态里已有？（Claude Agent SDK）** 一份 zod 派生模型面 + 执行前用同一份校验，handler 参数类型从它推导（`package/sdk.d.ts:9145`）；宿主改写参数之后**重新过准入**（`sdk.d.ts:2389-2391`，PreToolUse 原话 *"Claude Code evaluates permission rules … against the input your hook returns, not the input Claude sent."*）。出处：https://code.claude.com/docs/en/agent-sdk/custom-tools 与 https://code.claude.com/docs/en/hooks 。「补完重过同一份 schema」这一条就是从这里抄的。
- **生态里已有？（MCP 参考实现）** `modelcontextprotocol/typescript-sdk` @ `6032170` `packages/server/src/server/mcp.ts:240-242` 用 `standardSchemaToJsonSchema` 派生模型面、`:272-274` 用同一个对象校验调用，注释原话 *"the listing and the call cannot diverge."*；规范见 https://modelcontextprotocol.io/specification/2026-07-28/server/tools 。
- **反方证据？** 唯一「模型面与执行两处手写」的先例是 Codex（`openai/codex` @ `c775dd3`），而它**已经被量到漂移**：`core/src/tools/handlers/unified_exec.rs:40` 的 `timeout_ms` 在 `shell_spec.rs` 里 0 次出现——宿主收一个模型从没被告知的字段。它是反例不是支持（裁决 §2.4）。OpenAI 自己也只给两条出路：派生，或 CI 拦漂移 —— https://developers.openai.com/api/docs/guides/structured-outputs 。
- **TikHub 自媒体里怎么说？** 本次没用 TikHub：这是一次纯内部的类型/schema 结构改动，没有任何用户可见面，自媒体上不会有人讨论「某个 Electron 应用的动词 schema 该不该从宿主契约派生」。可复核的对照面全在上面五条的源码与官方文档里（裁决 `docs/plan/2026-09-18-tool-layer-prior-art-verdict.md` 六个面）。
- **结论** 用已有：手法抄 Claude Agent SDK 与 MCP TS SDK，落点接我们自己已有的 `exportWriteInputForAlias`（`electron/shared/agentCapabilities/exportCapabilities.ts:157`）。不自研任何新机制；这一刀新增的只有一个 30 行的派生模块。

## 范围

**只有 `cancel_job` 这一个动词，只有它的导出域那一半。**

- 模型面 schema 从宿主契约 schema **派生**：`exportWriteSemanticInputSchema.options[1]`
  （`{ jobId, operation: 'cancel_export_job' }`）`.omit({operation})` + 描述覆写。
- 宿主自己补的那个字段写成**显式常量** `CANCEL_JOB_HOST_FILL`，类型是「宿主面减模型面」的差集
  ——多补一个字段、少补一个字段、补错一个值，都是 tsc 红。
- 补完**重过同一份宿主 schema**（`cancelJobHostArgs`），再交给既有的 `exportWriteInputForAlias`
  走那道跨进程准入。准入那道**不删**：它是花钱/不可逆闸那一侧的规定（裁决 §0「对的一半」）。
- `RuntimeToolCall` 收成 `RuntimeToolCall<TArgs = unknown>`，**只在这一条路上**带上推断出来的参数类型。
- 同 commit 删掉 `EXPORT_JOB_ROUTES.cancel_job` 那条对应关系（P1：投影替代了它）。

## 不动项

- **`cancel_job` 的生成域那一半不动**（`SIMPLE_VERB_ROUTES.cancel_job`，`jobId → operationId` 仍是
  一条声明的 rename）。原因见下节——这是原型量到的结论，不是省事。
- 其余 19 个动词一概不动；`verbFieldMap` / `verbTransportRoutes` 的机制不动。
- 对外 MCP 已发布 schema 不动；磁盘格式不动；宿主准入校验不动。
- `RuntimeToolCall` 的默认类型参数仍是 `unknown`，其余调用点逐字不变。

## 双域：原型覆盖到哪、覆盖不到哪（**明说，不静默降级**）

投影的前提是「**有且只有一份**宿主 schema 是真相」。`cancel_job` 有两份：

| 域 | 宿主 schema | 那个 id 叫什么 | 它在磁盘上是什么 |
|---|---|---|---|
| 导出 | `exportWriteSemanticInputSchema` 的 `cancel_export_job` 分支 | `jobId` | `…/jobs/<jobId>/` 的目录名 |
| 生成 | `generationStatusInputSchema` 的 `cancel` 分支 | `operationId` | `.nomi/runs/<operationId>/` 的目录名 |

模型面只能有一个名字（今天是 `jobId`，与它声明的契约 `export.write` 同名）。所以：

- **导出域**：模型面 = 宿主面的真投影，零 rename。✅ 原型覆盖。
- **生成域**：同一个模型面字段要落到另一份 schema 的**另一个名字**上。这不是投影能表达的——
  投影只会藏字段和覆写描述，它没有「改名」这个动作，**故意没有**。所以生成域那一条仍然是
  `verbFieldMap` 上一条声明的 rename，而且它的 `why` 现在写着真正的领域理由（两个域两份持久化，
  各用各的目录名），不再是「模型面习惯叫另一个名字」。

**结论（原型要回答的那个问题的答案）**：投影能消掉「命名偏好」造出来的缝，消不掉「一个动词跨两个
宿主域」造出来的缝。后者不是表达力不够，是那里**真的有两件东西**。铺开时的判据因此很清楚——
**单域动词走投影，双域动词保留一条带领域理由的声明映射**。今天 20 个动词里双域的只有
`check_job` / `cancel_job` 两个。

## 顺带修掉的一处错绑（不是本刀的目标，是做的时候撞见的）

`EXPORT_JOB_ROUTES.cancel_job` 的目标字段名单取自 `exportReadSemanticInputSchema.options[0]`
（`inspect_export_job`），而这条路真正调用的是 `EXPORT_WRITE_ALIASES.cancel`
（`exportWriteSemanticInputSchema` 的 `cancel_export_job` 分支）。两份 schema 今天字段名单恰好相同
（都是 `{jobId, operation}`），所以没有出过错——但那张表核的一直是**另一份 schema**。
投影按构造消灭这一类：真相源就是这条调用真正要过的那份 schema，取错都取不了。

## 回滚

一个 commit，三个文件加一个新模块。回滚 = `git revert`：
`cancelJobProjection.ts` 删掉，`writeVerbs.ts` 的 `cancelJob.schema` 回到手写的
`z.object({ jobId: … }).strict()`，`EXPORT_JOB_ROUTES.cancel_job` 那条关系回来，
`RuntimeToolCall` 的类型参数去掉（默认 `unknown`，其余调用点本来就没用到它）。
没有任何持久化、没有任何对外契约、没有任何模型可见字段名变化（`jobId` 前后逐字相同）。

## 验收门

1. `pnpm run typecheck` 绿；`pnpm run check:verb-host-conformance` 绿且 14 条变异探针仍逐条验红。
2. **编译器真的抓得到漂移**（这条是本原型存在的理由，必须有证据）——已做 A/B，把宿主 schema 里
   那个字段临时改名（`exportJobPiInputSchema` 的 `jobId` → `jobIdRenamed`）再 `pnpm run typecheck`：

   | | 错误数 | 红在哪 |
   |---|---|---|
   | **投影之前**（模型面是手写的 `z.object({ jobId: … })`） | 2 | 全在**宿主侧**消费点 `src/workbench/timeline/agent/phase4CapabilityTargets.ts:51,77`。**模型面一个字都不红**——模型继续被告知 `jobId`，宿主已经改收 `jobIdRenamed`，没有任何一层报这件事。这正是 Codex `timeout_ms` 的形状。 |
   | **投影之后** | 3 | 多的那一条就是模型面自己：`electron/shared/agentCapabilities/verbs/cancelJobProjection.ts(49,36): error TS2339: Property 'jobId' does not exist on type '{ jobIdRenamed: ZodString; } & { operation: ZodLiteral<"cancel_export_job">; }'` |

   结论：**「宿主改了名、模型面没跟上」这件事第一次成为一个编译错误**，而不是一次付费运行里的失败。
   验完已改回，工作区干净。
3. `cancel_job` 翻出来的传输调用与改动前**逐字节相同**（`verbTransportRoutes.test.ts` /
   `laneVerbTransport.test.ts` 既有断言不改而仍绿）——投影是换真相源，不是换行为。
4. `pnpm exec vitest run electron src` 全绿；`pnpm run gates` 绿。
