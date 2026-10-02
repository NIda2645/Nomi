# 右侧 Agent 面板接入外部 Agent：ACP 调研（2026-10-02）

> 只读调研，没有改任何产品代码。对照基线：调研当天的 `origin/main`。
> 方案文档：[`docs/plan/2026-10-02-acp-agent-host.md`](../../plan/2026-10-02-acp-agent-host.md)。
> 标「未核实」的条目是真没核实，不是省略；「未读全文」= 只看到摘要或部分代码。

## 一屏结论

**推荐 B：内置 pi 照旧，面板加一个 ACP 宿主接用户自己的 Codex（之后 Gemini、Claude Agent）；面板工具行的中立契约直接采用 ACP 的 ToolCall 形状；花钱确认的 owner 不动（主进程 ProductionRun 的 pendingSpend + 面板付费卡），不交给 ACP。**

1. **Nomi 同时是 ACP 客户端和 MCP 服务器。** 外部 Agent 调 Nomi 的 MCP 工具，主进程自己知道这一次调用，付费卡照旧画在 Nomi 面板上——卡不需要穿过 ACP，所以「按镜头逐张决定」不受 ACP 选项模型限制。
2. **A（pi 也走 ACP）不划算。** 社区的 `pi-acp` 不把客户端给的 mcpServers 交给 pi，也不发 `session/request_permission`；A 等于我们自己把 pi 包成 ACP agent，再把付费卡、回执、撤销、反问塞进私有 `_meta`。内置 Agent 换来的开放性为零，却要动 agentLane（约 8.7k 行）和 v4 面板（约 7.5k 行）的接缝。
3. **C（照 infinite-canvas 本机服务跑 Codex）是网页应用的解法。** 它讲 Codex 私有的 app-server 协议、只能接 Codex、要额外一个本机服务和 token；Nomi 是 Electron，主进程本来就能起子进程，ACP 给出同样的效果且不限 Codex。
4. **合规提醒**：Anthropic 的 Agent SDK 文档写明，未经事先批准，第三方开发者不得在自己的产品里提供 claude.ai 登录或订阅额度（[Agent SDK 概览](https://code.claude.com/docs/en/agent-sdk/overview) 的 Note）。所以 Claude 那一项只能走 API key（或客户端网关），适配器为此专门提供了 `--hide-claude-auth`（`claude-agent-acp/src/hide-claude-auth.ts:1-30`）；对外名字只能叫「Claude Agent」，不能叫「Claude Code」（同页 Branding 一节）。

**最小可交付的第一步**：
- 所有 MCP 客户端都受益的一刀：外部 Agent 的「生成」先建节点和连线、出付费卡就返回，不在工具调用里阻塞等人（顺带消掉 60 秒工具超时）。
- 面板能选 Codex：主进程用 `@agentclientprotocol/sdk` 起 `codex-acp`，`session/new` 交出 Nomi 现有的 stdio MCP 启动条目；登录走 Codex 自带的浏览器登录，不开终端。

---

## 1. ACP 规范要点

当前稳定协议版本是 **v1**（`protocolVersion: 1`）；v2 仍是草案，官方 TS SDK 明说 v2 "may change incompatibly"（[typescript-sdk README](https://github.com/agentclientprotocol/typescript-sdk)）。下文都是 v1。

| 主题 | 要点 | 出处 |
|---|---|---|
| initialize | 客户端声明 `clientCapabilities`：`fs.readTextFile/writeTextFile`、`terminal`、`auth.terminal`、`elicitation{form,url}`、`session.configOptions.boolean`；Agent 回 `agentCapabilities`：`loadSession`、`promptCapabilities{image,audio,embeddedContext}`、`mcpCapabilities{http,sse}`、`auth`、`sessionCapabilities`，外加 `authMethods[]` | https://agentclientprotocol.com/protocol/initialization |
| session/new | `cwd` + `mcpServers[]`。**stdio 是所有 Agent 必须支持的**：`{name, command, args, env:[{name,value}]}`；http / sse 要先看 Agent 的 `mcpCapabilities` | https://agentclientprotocol.com/protocol/session-setup |
| session/load、session/resume | `load` 以 `session/update` 回放历史后再响应；`resume`（`sessionCapabilities.resume`）只重连不回放。两者都要**重新传** `mcpServers`。Session Resume RFD 已于 2026-04-22 完成 | 同上；https://agentclientprotocol.com/rfds/updates.md |
| MCP-over-ACP | MCP 服务器住在客户端进程里、走 ACP 通道（`type:"acp"`，单方法 `mcp/message`）。**状态 Draft**，绑 MCP 2026-07-28；codex-acp 明确声明 `mcpCapabilities.acp: false`（`codex-acp/src/CodexAcpServer.ts:406-410`）。今天不能依赖，stdio 够用 | https://agentclientprotocol.com/rfds/mcp-over-acp |
| session/prompt | `{sessionId, prompt: ContentBlock[]}`；返回 `stopReason`：`end_turn`/`max_tokens`/`max_turn_requests`/`refusal`/`cancelled` | https://agentclientprotocol.com/protocol/prompt-turn |
| session/update | `user_message_chunk`、`agent_message_chunk`、`agent_thought_chunk`、`tool_call`、`tool_call_update`、`plan`、`available_commands_update`、`current_mode_update`、`config_option_update`、`session_info_update`、`usage_update` | 同上 |
| tool_call | `toolCallId`、`title`、`kind`（read/edit/delete/move/search/execute/think/fetch/switch_mode/other）、`status`（pending/in_progress/completed/failed）、`content`（文本/图片块、diff、terminal）、`locations`、`rawInput/rawOutput`；可选 `name`（Tool Call Name RFD 2026-09-17 完成）。`tool_call_update` 只带变了的字段 | https://agentclientprotocol.com/protocol/tool-calls |
| session/request_permission | `{sessionId, toolCall, options[]}`；选项 `{optionId, name, kind}`，`kind` 只有 `allow_once`/`allow_always`/`reject_once`/`reject_always`；回应 `selected{optionId}` 或 `cancelled`。**平铺单选，不能带表单** | 同上 |
| elicitation | `elicitation/create`，form / url 两种模式；form 的 schema 是平铺对象，**支持多选枚举数组**；可带 `toolCallId`。RFD 2026-07-24 完成；RFD 主张与 permission 分开（「要批准」vs「要信息」） | https://agentclientprotocol.com/rfds/elicitation.md ；https://agentclientprotocol.com/protocol/v1/elicitation.md |
| 扩展点 | `_meta` 可挂在任何协议对象上，根部保留 `traceparent`/`tracestate`/`baggage`；自定义方法 / 通知以 `_` 开头；自定义能力在 capability 的 `_meta` 里协商 | https://agentclientprotocol.com/protocol/extensibility |
| 鉴权 | `authMethods[]` 的 `type`：`agent`（默认，Agent 自己处理，比如自己开浏览器）或 `terminal`（客户端带 `args/env` 重新起一次 Agent 程序，退出码 0 = 成功，需 `clientCapabilities.auth.terminal`）；`authenticate{methodId}`；`logout`（`agentCapabilities.auth.logout`） | https://agentclientprotocol.com/protocol/v1/authentication.md |
| 客户端能力 | 文件系统（`fs/*`）、终端（`terminal/*`）都是可选；不声明则 Agent 用它自己本机的文件和命令行 | https://agentclientprotocol.com/protocol/initialization |
| 取消 | `session/cancel` 是通知；Agent 尽快停下并以 `cancelled` 结束这一轮；**客户端**必须把所有挂着的 `request_permission` 回成 `cancelled`。另有通用请求取消（Request Cancellation RFD 2026-06-29 完成） | https://agentclientprotocol.com/protocol/prompt-turn ；https://agentclientprotocol.com/rfds/updates.md |

**官方 TS 库**：`@agentclientprotocol/sdk` 1.6.0（Apache-2.0，2026-10-01 发版，npm 周下载约 756 万，`npm view` 与 npm downloads API 实查）。旧名 `@zed-industries/agent-client-protocol` 已废弃并指向新名。客户端写法：`client({ name })` 注册 `requestPermission`/`sessionUpdate`，再 `connectWith(stream, …)`（SDK README）。结论：成熟，直接用。

## 2. 各 Agent 怎么接

ACP 注册表（`https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json`，2026-10-02 抓取，41 个 agent）给出的分发方式：`codex-acp` → `npx @agentclientprotocol/codex-acp@2.1.1`；`claude-acp` → `npx @agentclientprotocol/claude-agent-acp@0.85.0`；`gemini` → `npx @google/gemini-cli@0.62.0 --acp`；`pi-acp` → `npx pi-acp@0.0.34`。

| Agent | 安装 / 启动 | Windows | 登录能不能不开终端 | 用谁的账号 |
|---|---|---|---|---|
| **Codex** | `@agentclientprotocol/codex-acp`（TS），内部起 Codex App Server；npm 包自带 `@openai/codex`，`CODEX_PATH` 可指向用户已装的 codex（[codex-acp README](https://github.com/agentclientprotocol/codex-acp)；`src/CodexCli.ts:21-31`） | `@openai/codex` 有 win32-x64 / arm64 平台包 | **能**。`chat-gpt` 是 agent 型，适配器自己 `open(authUrl)` 开浏览器（`src/CodexAcpClient.ts:217-222`）；设备码方式走 URL elicitation（`:234-265`）；`api-key` 走 `_meta`（`src/CodexAuthMethod.ts:16-25`）。已登录过的直接复用：只有 `requiresOpenaiAuth && !account` 才要求登录（`src/CodexAcpClient.ts:352-362`） | 用户的 ChatGPT 订阅或 OpenAI key；客户端声明 `auth._meta.gateway` 时还能走客户端网关（`src/CodexAuthMethod.ts:46-84`） |
| **Claude Agent** | `@agentclientprotocol/claude-agent-acp`，内置 `@anthropic-ai/claude-agent-sdk`（package.json） | SDK 有 win32-x64 / arm64 平台包；Claude Code 原生 Windows 是否需要 Git Bash，**未核实** | 订阅 / Console 登录只有 `terminal` 型（`--cli auth login --claudeai` / `--console`，`src/acp-agent.ts:2533-2575`），需要客户端声明 `auth.terminal`。由 Nomi 无窗口起这个进程能否完成浏览器 OAuth，**未核实** | **合规上只能用 API key 或网关**（见一屏结论第 4 条）；`--hide-claude-auth` 隐藏订阅登录（`src/hide-claude-auth.ts:1-30`）；客户端网关 `auth._meta.gateway`（`src/acp-agent.ts:2470-2495`） |
| **Gemini CLI** | `@google/gemini-cli --acp` | 支持 | **能**。Login with Google（agent 型，浏览器）、API key、Vertex、网关（`gemini-cli/packages/cli/src/acp/acpRpcDispatcher.ts:47-69`）；会话 MCP 与本机设置合并（`acpSessionManager.ts:382-423`） | 用户的 Google 账号或 key |
| **pi** | `pi-acp` 起 `pi --mode rpc`，要求 PATH 上有全局 pi（v0.81+）与 Node 22+ | README 未提 | pi 自己的 login / `--terminal-login` | README 写明客户端给的 MCP servers 只存进会话状态、不交给 pi；没有 `fs/*`、`terminal/*` 委托；未写 request_permission（[pi-acp](https://github.com/svkozak/pi-acp)）。**对 Nomi 不可用** |

**Zed 里用户怎么登录**：terminal 型在 Zed 自己的内置终端里跑（`zed/crates/agent_servers/src/acp.rs:680`、`:702`、`:936`）；agent 型由 agent 自己开浏览器。

**体积（npm 实查）**：`@openai/codex` 的 win32-x64 平台包解压约 448 MB；`@anthropic-ai/claude-agent-sdk` 的 win32-x64 平台包约 245 MB；适配器本体分别约 1.5 MB / 1.2 MB。**不能随安装包带**，只能「选了再下」或复用用户已装的 Codex（`CODEX_PATH`）。适配器本体可用 Electron 自带 Node 跑（`ELECTRON_RUN_AS_NODE=1`），Nomi 的 MCP 启动器已经这么做（`electron/capabilityCore/mcpConfig.ts:191-212`），用户不用装 Node。

## 3. 现有宿主怎么做

**Zed**（Rust）
- 交出自己的 MCP：把配置的 context server 逐个转成 `acp::McpServer::Stdio` / `Http`，在 new / load / resume 三处都传（`zed/crates/agent_servers/src/acp.rs:1442-1465`、`:5504-5544`）。
- 授权卡：`handle_request_permission` 把 `options` 以 `PermissionOptions::Flat` 交给线程渲染，`cancellation.run_until_cancelled` 保证取消时回 `cancelled`（`:5689-5719`）。
- 进程生死：子进程退出上报 `LoadError::Exited`（`:65-73`、`:2101-2123`），由用户重启。

**AionUi**（Electron + TS，Apache-2.0）
- 自动检测本机已装的 CLI 并用 ACP 连（[AionUi](https://github.com/iOfficeAI/AionUi)）。
- 渲染层可参考：`packages/desktop/src/renderer/pages/conversation/Messages/acp/MessageAcpPermission.tsx`、`MessageAcpToolCall.tsx`、`packages/desktop/src/renderer/components/agent/AcpRuntimeRestartButton.tsx`（手动重启按钮）。
- 主进程那一半的连接代码在仓库树里没定位到，**未读全文**。

**JetBrains**：官方支持 ACP（https://www.jetbrains.com/help/ai-assistant/acp.html ，**未读全文**）。codex-acp / claude-agent-acp 里的「AIR」扩展就是给它的，全部在 `_meta` 里协商（codex-acp README「AIR extensions」），是「领域扩展怎么挂」的现成先例。

**其他客户端**：ACP 官网客户端列表还有 Obsidian 插件、acp-ui、Kepler 等（https://agentclientprotocol.com/get-started/clients ，**未逐个读码**）。

## 4. 对照 infinite-canvas（AGPL-3.0，只学做法、不抄代码）

**它的做法**
- 本机起 express 服务；网页经 SSE + `/rpc` 跟它说话。
- 服务起 `codex app-server`，讲 **Codex 私有 JSON-RPC**，不是 ACP（`canvas-agent/codex.mjs`）。
- `thread/start` 时把自己的 MCP 写进 `config.mcp_servers`，并设 `default_tools_approval_mode:"approve"`、`tool_timeout_sec:90`（`canvas-agent/index.mjs:121-136`）。
- MCP 服务器是薄转发：工具定义与执行都在**网页**里（网页 `/connect` 登记工具，MCP 调用转 `/tools/call` 给网页执行，`index.mjs:142-196`）。
- 还能装成 Codex 插件（`canvas-agent/.codex-plugin/plugin.json`、`canvas-agent/README.md`）。

**值得学的**
- 工具在画布侧执行，节点和连线天然落画布。
- 自己的工具在 Agent 层默认放行，避免双重确认。

**不适合 Nomi 的**
- 只能接 Codex，协议跟着 Codex 版本走（锁 `@openai/codex 0.159.2`，`canvas-agent/package.json`）。
- 多一个本机服务和 token。
- 这些都是「网页应用碰不到子进程」的代价；Electron 主进程本身就能当那个服务。

ACP 等于把它的「服务 + Codex 私有协议」那一层换成标准，换 Agent 不用重写。

## 5. 对照 Nomi 现状（读码）

**右侧面板链路**
- pi lane：`electron/agentLane/laneHost.mts` 把闸挂在 pi 的 `before_tool`（`:486-494`），文件头写明它只管生命周期、闸、领域记录（`:15-27`）。
- 投影：`electron/shared/agentLane/laneProjection.ts`（纯函数，文件头 `:1-22`）把 pi 快照变成 `LaneProjection`（`electron/shared/agentLane/laneContracts.ts:334`）；`LanePart` 分 text / thinking / tool-call / tool-result / task（`:40-123`）。
- 面板：`src/workbench/ai/v4/`；视图模型 `src/workbench/ai/lane/laneViewModel.ts`。

**付费卡**
- pi lane 的 `generate`：所有「等人」都发生在 `before_tool`，**不计入工具超时**（`electron/agentLane/laneExtendedDesktopPorts.ts:173-245`）。
- 等待靠闸的 `hold` / `settleHold`（`electron/agentLane/laneApprovalGate.ts:111-115`）。
- 面板每 1.5 秒轮询 `productionRunApi.pendingSpend`（`src/workbench/ai/v4/useAgentPanelSpendConfirm.ts:52`、`:147-151`）。
- 付费卡的编排即闸本身：挑战 → 主进程手势证明 → 收据 → 授权 → 开跑（`electron/capabilityCore/appIntegrationSpendConfirm.ts:5-28`）。

**Nomi 的 MCP 服务器**
- 自写协议层（`electron/capabilityCore/mcpProtocol.ts`，791 行；`mcp*` 生产代码合计约 9.8k 行）。
- stdio 入口是 Nomi 自身二进制 + `NOMI_MCP_STDIO=1`，GUI 开着时经回环 RPC 转给它（`mcpStdioServer.ts:1-10`、`mcpNodeLauncher.ts:1-6`）。
- 启动条目由 `mcpServerEntry()` 生成，各客户端带独立签名证明（`mcpConfig.ts:221-245`）。
- **付费确认在工具调用里阻塞等待**：`nomi_operation_gate phase=request` 进 `handleSemanticGenerationGate`，先要挑战、再等确认、再开跑（`mcpProtocol.ts:574-585`、`mcpSemanticGenerationFlow.ts:12-25`）；客户端能问人就弹在客户端，否则落应用内兜底卡（`mcpGateConfirmation.ts:1-8`）。
- 「一键接入」是改写用户自己的配置文件（`docs/engineering/standard-formats.json:166-220`）。
- Codex 的 10 秒启动超时、60 秒工具超时是已知的「连不上 / 发了没反应」来源，今天靠在 config.toml 里写 60 / 600 秒兜（`mcpConfig.ts:370-386`）。

**逐层判断**

| 层 | ACP 能替吗 | 结论 / 领域逻辑放哪 |
|---|---|---|
| 外部 Agent 的接入、配置、登录 | **能** | `session/new` 交 MCP，用户不再手配；`authMethods` 登录 |
| 外部 Agent 的流式消息、工具行、取消、恢复 | **能** | `session/update`、`tool_call`、`session/cancel`、`resume` |
| 面板工具行的数据形状 | **建议采用** | 面板中立契约 = ACP ToolCall（C1 就做这件事） |
| pi 运行时、审批闸、`hold` | 不替 | pi 是进程内库，`pi-acp` 不可用 |
| 按镜头的花钱确认 | **不替，必须留** | owner 仍是主进程 ProductionRun 的 pendingSpend + 面板卡。领域约束：钱要有可机验的手势收据 |
| 画布写入回执、撤销 | 不替 | 留在能力核与 MCP 工具结果 |
| 落画布节点 + 连线 | 不替 | 放在 **MCP 工具**层，所有客户端共用 |
| MCP 服务器本身 | 不替（ACP 只负责交给 Agent） | 换官方 SDK 是另一件事 |

## 6. 关键设想：Nomi 起 Codex 适配器并在 session/new 交出自己的 MCP

**成立。**
- 规范：stdio mcpServers 是 Agent 必须支持的（§1）。
- codex-acp 以请求里的 mcpServers 为准（`CodexAcpServer.ts:653`、`:721`、`:2496-2512`）；claude-agent-acp 与自身配置合并（`acp-agent.ts:1374-1423`）。
- Nomi 已有 `mcpServerEntry()`（`electron/capabilityCore/mcpConfig.ts:226-245`），转成 `{name:"nomi", command, args, env:[...]}` 即可；client 身份另立一个（例如 `nomi-acp`），与「用户自己在 Codex 里配的 nomi」分开记账。
- Nomi 重启：重新起适配器 → `session/resume`（或 `session/load`）并**再传一次 mcpServers**——codex-acp 在 load / resume 没有显式 mcpServers 时跳过恢复（`CodexAcpServer.ts:2510-2511`）。

**坑**
- **工具超时**：`session/new` 没有超时字段；Codex 默认 60 秒（https://developers.openai.com/codex/mcp ）。能否用 codex-acp 的 `CODEX_CONFIG` 环境变量给会话传来的 server 改超时，**未核实**。今天 MCP 付费确认是阻塞在工具调用里的，用户 60 秒没点就会断——这与「容易断线」的反馈吻合。根本解是让生成工具「出卡就返回」，不靠调大超时。
- **双重确认**：Agent 自己会对 MCP 工具发一次 `request_permission`，Nomi 又出一次付费卡。要在 Agent 层把 Nomi 的工具设成默认放行（infinite-canvas 用 `default_tools_approval_mode:"approve"`）；ACP 会话里怎么设，**未核实**。
- **进度**：适配器会不会把 MCP progress 通知转成 `tool_call_update`，**未核实**。
- **Windows**：子进程树要 `taskkill /T /F` 收干净（infinite-canvas `canvas-agent/codex.mjs` 的 `close`）；`windowsHide`；codex-acp 指定 `CODEX_PATH` 时以 `shell:true` 起进程（`src/CodexCli.ts:26-28`），路径带空格要实测。
- **cwd 与权限**：外部编码 Agent 默认能读写本机文件、跑命令。cwd 给专用目录，默认只读 / 沙箱（codex-acp `INITIAL_AGENT_MODE=read-only`，见 README Runtime options）。

## 7. 付费卡在 ACP 下怎么表达

- `request_permission` 不够：只有平铺单选（四种 kind），表达不了「逐镜勾选」。
- 标准里够用的是 `elicitation/create` 的 form 模式（多选数组）。codex-acp 与 claude-agent-acp 都把 **MCP 服务器发起的 elicitation** 转成 ACP 的 `elicitation/create`（`codex-acp/src/CodexElicitationHandler.ts`；`claude-agent-acp/src/elicitation.ts:22-30`）。
- **Nomi 不需要绕这一圈**：Nomi 自己就是 MCP 服务器 + ACP 客户端，付费卡直接由主进程推到面板，沿用现有按镜卡与收据链；只依赖「这次调用来自 Nomi 自己的 ACP 会话」这个事实（MCP 连接证明）。elicitation 与 `_meta` 只作为给第三方客户端的退路。

## 8. 方案对比表

| | A：面板整体做 ACP 宿主，pi 也走 ACP | **B：pi 照旧，外部 Agent 走 ACP（推荐）** | C：仿 infinite-canvas，本机服务跑 Codex |
|---|---|---|---|
| 用户看到什么 | 一个下拉选 Agent，所有 Agent 行为一致 | 同一个下拉：默认 Nomi（pi），可选 Codex / Gemini / Claude Agent；外部 Agent 没有撤销、反问等 Nomi 专属卡 | 只能选 Codex |
| 我们要写什么 | ACP 客户端宿主 + **把 pi 包成 ACP agent**（审批、回执、撤销、反问、历史全映射到 `_meta`） | ACP 客户端宿主（进程、登录、会话、映射到面板行）；适配器定位 / 按需下载；MCP 生成工具落节点 + 连线并改成不阻塞 | 本机服务 + Codex 私有协议桥 + token；每多一个 Agent 再写一份 |
| 为什么必须写 | 宿主：面板要在画布旁（领域）；包 pi：**理由不成立**，只为形式统一 | 宿主同左；下载：安装包体积；MCP 工具：落画布是 Nomi 的领域规则 | 只有网页应用才需要 |
| 工作量 / 风险 | 最大；同时动 agentLane 与 v4 面板，回归风险高 | 中；新代码集中在新目录，pi 线零回归 | 中；只解决一家 |
| 对 0.24 B / C1 | 两刀被重写吞掉，0.24 推后 | B 照做（改成推送）；C1 改成「采用 ACP 行形状」 | 无关，两刀照旧 |
| 对 MCP 换官方 SDK | 无关 | 不阻塞；但 MCP 成了外部 Agent 唯一通道，优先级上升 | 同 B |
| 对 AI SDK 收敛 | pi 外多包一层，收敛面变复杂 | 不影响 | 不影响 |
| 开放性 / 一个人维护 | 高，但维护面最大 | 高，维护面可控，跟着标准走 | 低 |

**推荐 B**：用户摩擦上，第一天就能「选 Codex → 浏览器登录 → 直接用」，不手配 MCP、不开终端；结构约束上，领域护城河（花钱卡、回执、落画布）全部留在我们自己的 MCP 与主进程里，ACP 只做通用的「接谁」，广度交给标准和别人写好的适配器。

## 9. 对 0.24 排期的影响

- **B（付费卡并进投影、删 1.5 秒轮询）**：照做，而且更该做。外部 Agent 的付费卡也出在面板上，owner 不变（主进程 pendingSpend），改成主进程推事件。与 ACP 正交。
- **C1（一次工具调用对应一条）**：改做法——面板工具行的中立契约采用 ACP `ToolCall`（以 toolCallId 为键、四态 status、kind、title、content）；pi 投影映射过去，ACP 更新直接落入。一次做好，两条线共用，不多出第二个 owner。
- **MCP 换官方 SDK**：不阻塞 ACP 第一步（ACP 只需要现有 stdio 入口）。建议 ACP 最小版先上，把它当 MCP 的真实回归用例，再换 SDK 内核；MCP-over-ACP 与 elicitation 都绑 MCP 2026-07-28，换了官方 SDK 更好跟。
- **最小第一步**：见一屏结论。Gemini 第二个，Claude Agent（API key）第三个。

## 不确定之处（照实写）

1. codex-acp 的 `CODEX_CONFIG` 能否给 ACP 会话传来的 MCP server 改 `tool_timeout_sec`、设 `default_tools_approval_mode`：**未核实**。
2. Claude 的 terminal 型登录能否由 Nomi 无窗口起进程完成：**未核实**（且按 Anthropic 条款，订阅登录本就不提供）。
3. OpenAI 是否允许第三方产品用 ChatGPT 订阅登录：**没找到明文**。Zed、JetBrains、AionUi 都在这么做，但这不等于授权。
4. 适配器会不会把 MCP progress 转成 `tool_call_update`：**未核实**。
5. 外部 Agent 侧 ACP 的 `toolCallId` 与 Nomi MCP 侧那一次调用怎么一一对上（决定付费卡能不能贴在对应工具行旁）：**未核实**。第一版先放在面板现有的介入槽。
6. AionUi 主进程 ACP 实现、JetBrains ACP 文档：**未读全文**。
7. 「外部 MCP 直接出图、不落节点」来自用户转述；本次只确认了 MCP 付费流程在工具调用里阻塞，生成工具是否建节点 / 连线**没逐条读完**，切片 1 开工第一步用门表核实。
8. Claude Code 原生 Windows 是否需要 Git Bash：**未核实**。
