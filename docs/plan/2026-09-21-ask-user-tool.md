# 通用反问：模型自己能问用户一句话

状态：✅ 已交付（分支 `lane/salvage-ask-tool-20260921`，未 push）· 2026-09-21

## 0. 它在解决哪个真实摩擦

2026-09-21 真实模型实测（DeepSeek 官方 `deepseek-v4-pro`，隔离 profile，像人一样在
composer 里打字，`scratchpad/investigate-askback.md`）：**16 句该反问的话，反问卡触发
0/16。**

根因不是「触发条件太窄」，是**根本没有触发条件**：

- 20 个模型可见动词里，没有一个能让模型问一句话；
- 介入槽的反问格只在待决调用的 `args` 里带 `question` / `missingParam` / `options` 时才画得出来，
  而那三个字段整个 `electron/` 生产代码里 0 次出现；
- 身份提示词里那条常驻的「主动但不越权：**该调工具就调**」没有任何对手，
  「信息不足先问一句」只写在几条 skill 正文里（用户不挂那条 skill 就永远看不到）。

用户那头看到的是：含糊的话六成被直接动手猜。「把这个改好看点」指的是文稿，
模型去排了一份 8 镜分镜方案。

## 1. 用户拍板的形状（2026-09-21）

> 「这个是模型要自己输入选项吧，通用的吧，别搞错了，只有那一种反问就离谱了」

- **通用**：模型自己写问题、自己写 2–4 个选项（标签 + 一句说明 + 可标推荐），
  任何面（文档 / 画布 / 时间轴）任何话题都能问。**不是**「问画幅」那种固定问卷。
- 卡内**永远**带一行自由输入，它不是一个选项，是卡的固有能力。
- chip 点即提交；答完收成一行回执。
- 参照物是 Claude Code 自己怎么做事：能用合理默认就不问；只在答案会实质改变产出、
  且猜错代价高时问；一次问清。

## 先查别人

**结论：用已有的形状，不自研协议。**挂起/恢复语义照抄 AI SDK 的人机回环，
卡的形状对齐 MCP elicitation 能对齐的部分，只在「不给用户看表单」这一条上偏离并写明理由。

| 四问 | 实查结果 |
|---|---|
| **依赖里已有？** | 有一半。`@earendil-works/pi-agent-core` 的 `before_tool` 钩子能让一次调用停住等人——`electron/agentLane/laneApprovalGate.ts:231` 的 `runPreflight` 已经把它用成了完整的审批状态机（等待、按停、关窗、重启四种收尾都在）。**所以挂起不自研**，提问直接用它。上游**没有**的是「带选项的问题」这个语义——pi 的钩子只有准 / 不准。 |
| **仓库里已有？** | 渲染层已有卡，主进程没有生产者。`git grep -n "missingParam\|parseQuestionAsk"` → 渲染层 `src/workbench/ai/v4/agentPanelV4Question.ts`（本次改成派生）、`agentPanelV4Intervention.ts:110`；而 `missingParam` 在整个 `electron/` 生产代码里 **0 次**出现。另有 `electron/capabilityCore/mcpBriefIntake.ts`（≤3 题、`enum`+`enumNames` 喂 MCP elicitation）——它是**立项专用的固定问卷**，且 `electron/shared/agentCapabilities/` 里没有 `brief` 契约，内部 lane 没有动词指向它。用户 09-21 明确说「不是照搬旧 brief.intake」。 |
| **生态里已有？** | 见下表两条规范。另查 Claude Code 自己的 `AskUserQuestion`（用户点名的参照物）：多题一轮、每题带默认/推荐、永远可自由作答——我们 v1 取「一次一题」，其余同构。 |
| **TikHub 自媒体里怎么说？** | 未查（本条是工具协议，不是用户可感知的产品形态，自媒体侧没有对应讨论面）。记为 `unverified`。 |

### 2.1 规范链接

| 出处 | 它定了什么 |
|---|---|
| MCP `elicitation/create`（<https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation>） | 服务端向用户要信息的标准方法：`params.message`（一句话）+ `params.requestedSchema`（**扁平对象、只许原始类型**）。选项用 `{"type":"string","enum":[…],"enumNames":[…]}` 表达。回复是三态：`action: "accept"`（带 `content`）/ `"decline"` / `"cancel"`。规范明写「复杂嵌套结构、对象数组等高级 JSON Schema 特性**刻意不支持**」。安全条款：服务端 **MUST NOT** 用它要敏感信息。 |
| AI SDK 人机回环（<https://ai-sdk.dev/docs/agents/workflow-agent>、`tool-loop-agent` 参考页） | 一个工具可以声明 `needsApproval: true` / `toolApproval: { x: 'user-approval' }`，于是它的 `execute` **暂停**，等用户的答复；答复以 tool message 的形式**推回同一段对话历史**继续（`ToolApprovalResponse` / `addToolApprovalResponse`）。 |

### 2.2 我们的偏差

| # | 偏差 | 理由（只许领域约束） |
|---|---|---|
| ① | 不收 `requestedSchema` 那种表单，收的是 `question` + `options[{label, description?, recommended?}]` | **D1（用户摩擦优先）**：让用户读一张表单、理解字段类型，就已经输了（用户原话「让用户照我们格式手写 = 离谱」）。而且 elicitation 的 `enum`/`enumNames` 表达不了「每个选项一句说明」和「我建议这一个」——那两样恰恰是让用户**不用读文档就能答**的东西。 |
| ② | 自由输入永远在，且**不是**一个选项 | 同上。在 elicitation 里这要多声明一个 string 属性，于是变成「一张有两个字段的表单」。一张卡只问一件事。 |
| ③ | 回复不是三态，是「答了（`answered`，带原话）」或「这一轮被打断（`cancelled`）」 | 一个**问题**没有「拒绝」这件事：不想答就自己说一句（自由输入），或者按停。`decline` 是针对**动作**的，而这不是动作。 |
| ④ | 挂起机制不自造，直接用审批闸的 `awaiting-user` | 与 AI SDK 的 `toolApproval` 逐字同义（暂停 → 答复作为 tool result 回到同一回合）。自造第二套「等用户」就是 P1 违规，而仓库里那一套已经处理好了按停 / 关窗 / 切项目 / 重启四种收尾。 |

**偏差可无损降级**：哪天 Nomi 作为 MCP 服务端要向外部宿主问一句话，
`question → message`、`options → enum + enumNames`（`label` 进 `enumNames`）即可，
丢的只有 `description` / `recommended` 两个装饰。反过来不成立——所以内部面按我们这份来。

### 2.3 不投对外 MCP profile

外部宿主有它自己问人的办法（就是 `elicitation/create`），而这条 lane 在那边
`hasUserInterface = false`，投过去只会得到一句「这里没有窗口可问」。

## 3. 契约只有一份

用户 09-21 点名的坑：同一个工具的契约有好几份（schema / 描述 / 提示词里的用法 /
MCP 目录 / 校验器 / 渲染层类型），每份不一样，Agent 因此很难触发它。09-18 已经为这个坑
做过一次根治（`4b43f3ac9`）：模型可见工具的唯一 owner 是
`electron/shared/agentCapabilities/verbs/*.ts` 的动词声明，schema / 描述 / 必填 / 注解
全部算出来。提问工具照这条做，不另起一套。

| 出现的地方 | 身份 |
|---|---|
| `electron/shared/agentCapabilities/askUser.ts` | **owner**（zod schema + 契约 + 选项区间 + 动词名） |
| `electron/shared/agentCapabilities/verbs/askVerbs.ts` | **派生**（只写说明书；`schema: askUserInputSchema`） |
| 模型看到的 JSON Schema | **派生**（`toPublishedJsonSchema`，与 pi 跑 ajv 的同一份） |
| 主进程校验 | **派生**（`laneTools.mts` 那一次 contract parse） |
| `src/workbench/ai/v4/agentPanelV4Question.ts` 的类型 | **派生**（`z.infer`；原来手写的两份类型已删） |
| `V4_QUESTION_OPTION_RANGE` | **派生**（`= ASK_USER_OPTION_RANGE`） |
| 身份提示词里的例子 | **派生**（动词的 `examples`，装配期逐条喂回同一份 schema） |
| 熔断 / 缺参数构造的参数 | **派生**（`askUserPendingArgsSchema` = 同一份 + 两个宿主字段） |
| 渲染层的**解析器** `parseQuestionAsk` / `questionOptions` | **对拍测试覆盖**（`src/workbench/ai/v4/askUserContract.test.ts`） |
| `scripts/model-face-baseline.json` | **冻结快照**（`check:model-face-frozen` 逐字节比） |

对拍测试的判据不是「两份手写清单相等」（那只是把漂移抄两份），而是：
**字段名单从模型真正收到的那份 JSON Schema 取**，逐个要求渲染层给出「它怎么落到卡上」。
先验红三次，日志 `scratchpad/C-redproof-drift.txt`。

## 4. 「等用户」只有一个 owner

- 契约新增 `alwaysAsksUser`，`capabilityIsHardGated` 第 ⑥ 条读它：
  **任何档位、任何会话级授权都不许替用户答**。
- 它不能用 `effectClass` 表达（那张表只有 reversible_local / spend / irreversible 三格）：
  写成 `irreversible` 能凑出同样的闸，代价是每一份读那张表的代码从此都读到一句假话。
- `effect` 仍是 `read`（它什么都不改），所以 `ask` / `editSelection` 两个窄工作模式下
  模型照样有权说「我不确定」——那比动手更安全。
- 审批协议加第四个动作 `answer` + 第七个结局 `answered`。它**不是** `deny` 的别名：
  在它之前反问只能借 `deny(toolCallId, 答案)` 送出去，转录里留下的是一条用户从没做过的
  拒绝，面板那一行还得靠嗅 `args` 把它读回成「已回答」。

## 5. 三振熔断转提问

`electron/agentLane/laneRepeatedFailure.mts` 里已有的「同一堵墙连撞 3 次就拦」
（09-17 加的，且**用户再说一句话就归零** = J 会话层 owner 那条拍板）现在多做两件事：

1. 拦截理由从「换条路，或者跟用户说清是什么挡住了」改成**点名 `ask_user`**，
   并把上一次拒收信里那份 `allowed` 合法值当成现成的选项交出去
   （让模型自己回忆拒收信写了哪几个值，是在赌它已经连错三次的那件事）；
2. 新增 `exhausted()`：撞满之后紧跟的那次 `ask_user`，由宿主在 `before_tool` 里
   给它的 args 盖一个 `askReason: { code: 'retry_exhausted', attempts }`。
   只传码 + 数，文案在渲染层 i18n——生产者传成句的字符串就绕过翻译。
   模型**填不出**这个字段（`askUserInputSchema` 不收），也不该填得出。

反向验红三次，日志 `scratchpad/C-redproof-fuse.txt`。

## 6. 何时问 / 何时不问

规则只写在 `verbs/askVerbs.ts` 的 `promptGuidelines`（那条通道本来就进系统提示词，
`lanePromptSections.renderLanePromptSections`）。身份提示词**不复述**，只补上它缺的半句：
原来只有「该调工具就调」，现在是「默认动手，不默认发问；但指向好几个东西、缺关键信息、
或要花钱/撤不回时先问一句」。不改软成「要谨慎」——那不可判定，模型会当客套话
（实测里它就是这么当的）。
