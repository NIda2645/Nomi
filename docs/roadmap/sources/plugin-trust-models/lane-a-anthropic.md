# Lane A — Anthropic host family 插件信任模型调研

调研日期：**2026-09-14**（所有 URL 均于当日 fetch）
调研范围：① Claude Desktop Extensions（`.mcpb` / 前 DXT）② Claude Code plugins + marketplaces ③ MCP 规范本身的安全条款

> 标注约定：凡是**今天没能从官方文档核实到原文**的，一律标 `未核实 (unverified)`。

---

## 0. 一句话结论（给 Nomi 的可抄对象）

三者是**同一套思路的三个成熟度**：

- **进程隔离靠「子进程 + stdio」，不靠沙箱。** 三家都明说插件/MCP server 是**本机子进程、跑在用户权限下、不沙箱**。Claude Code 的沙箱官方原文写死了只管 Bash：「**Sandboxing provides OS-level enforcement that restricts what Bash commands can access at the filesystem and network level. It applies only to Bash commands and their child processes.**」
- **密钥永不给插件看是做不到的，两家都选「宿主注入 env」。** 声明在 manifest（`user_config` / `userConfig`），宿主收集、存 OS keychain、以 `${user_config.KEY}` 模板替换进 `env`/`args` 再 spawn。插件进程**拿得到明文**。
- **真正的闸在「每次工具调用」那一层，不在 manifest 那一层。** MCP 规范把这条写成 SHOULD：「**there SHOULD always be a human in the loop with the ability to deny tool invocations**」。Claude Code 把它做成 `permissions.allow/deny/ask` + hooks；manifest 里那些字段**不是能力授权，只是 UI 元数据**。
- **「未声明就用」在三家都没有运行时后果。** 没有一家做 capability enforcement——manifest 里的 `tools` 数组是展示用的，MCPB 甚至专门有个 `tools_generated: true` 承认服务端会在运行时长出新工具。

**对 Nomi 的直接含义**：如果要抄，**别抄 manifest 的能力声明当防线**（那是展示层），要抄的是 ①密钥由宿主存 keychain + env 注入子进程 ②花钱/副作用走宿主的 per-call 确认闸 ③管理员侧的 allowlist/blocklist/全局关闭。

---

## 1. Claude Desktop Extensions（`.mcpb` bundle）

来源：
- https://claude.com/docs/connectors/building/mcpb （fetched 2026-09-14）
- https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md （fetched 2026-09-14，另经 raw.githubusercontent 全文核对）
- https://www.anthropic.com/engineering/desktop-extensions （fetched 2026-09-14）
- https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop （fetched 2026-09-14）

### 六问六答

**① 插件跑在哪里 → 本机子进程（stdio），不是同进程、不是远端。**
官方原文：「An `.mcpb` file is a zip archive containing a local MCP server and a `manifest.json`.」「Runs locally on the user's machine / Communicates via stdio transport / Bundles all dependencies / Works offline」。
manifest 里 `server.mcp_config` 就是一条 `command` + `args` + `env`：

```json
"server": {
  "type": "node|python|binary|uv",
  "entry_point": "path/to/file",
  "mcp_config": {
    "command": "execution_command",
    "args": ["arg1", "${__dirname}/path"],
    "env": { "VAR": "${user_config.key}" }
  }
}
```

Node 运行时由宿主自带：「**We ship Node.js with Claude Desktop, eliminating external dependencies.**」（engineering blog）
→ 结论：Claude Desktop 用 `command`/`args` **spawn 一个子进程**，用 stdio 跟它说话。（「子进程」这个词官方文档没有逐字写，但 stdio transport + command/args 只有这一种实现方式；若要严格，spawn 机制细节 = `未核实 (unverified)`。）

**② 密钥怎么到插件手里 → 宿主收集 → OS keychain → `${user_config.x}` 模板替换 → env 注入。插件拿到明文。**
MANIFEST.md 原文：「**`${user_config.KEY}`**: Replaced with the user-provided value for configuration KEY」「Environment variables are ideal for sensitive data」。
标准用法：

```json
"env": { "API_KEY": "${user_config.api_key}" }
```

存储：engineering blog 写「**Sensitive data stays in the OS keychain**」、「Securely store sensitive values」。
MANIFEST.md 自己只说「**sensitive**: For string types, mask input and store securely (default: false)」——**规范层面只承诺"安全存储"，keychain 是 Claude Desktop 的实现选择**。
「macOS Keychain / Windows Credential Manager」这组具体对应只在第三方页面看到 = `未核实 (unverified)`。
→ **宿主不代理模型调用**；密钥直接进插件进程的环境变量。

**③ 宿主能不能拦截花钱/工具调用 → 机制存在但今天没核实到官方原文。**
MCP 规范要求客户端做（见 §3）。Claude Desktop 实际的「Allow once / Allow always / Allow for this chat」三选一弹窗，今天**只在第三方文章和 GitHub issue 里看到**，官方 support 文档没有逐字描述 = `未核实 (unverified)`。
官方文档确实写到安装期有权限步骤（见⑤），但那是**安装期一次性**，不是 per-call。
**没有任何「花钱拦截」概念**——MCPB 模型里没有 spend/cost 的位置。

**④ 声明式权限 manifest 字段（RAW 字段名）**

顶层必填：`manifest_version` / `name` / `version` / `description` / `author` / `server`
顶层可选（挑与信任相关的）：`icon` `icons` `display_name` `long_description` `repository` `homepage` `documentation` `support` `screenshots` `tools` `tools_generated` `prompts` `prompts_generated` `keywords` `license` `privacy_policies` `compatibility` `user_config` `_meta` `localization`

`user_config.<KEY>` 的字段（MANIFEST.md 原文）：
- `type`：`"string"` / `"number"` / `"boolean"` / `"directory"` / `"file"`
- `title`：Display name shown in the UI
- `description`：Help text explaining the configuration option
- `required`：Whether this field must be provided (default: false)
- `default`：Default value（支持 `${HOME}` `${DESKTOP}` `${DOCUMENTS}`）
- `multiple`：For directory/file types, allow multiple selections (default: false)
- `sensitive`：**For string types, mask input and store securely (default: false)**
- `min` / `max`：For number types, validation constraints

**注意这里没有一个字段是「网络权限」「文件权限」「模型调用权限」。** `directory`/`file` 类型是**让用户挑路径再把路径传给 server**（如 filesystem server 的 `ALLOWED_DIRECTORIES`），执行层不强制——插件自己不遵守也没人管。

**⑤ 未声明就用会怎样 → 什么都不会发生（无运行时 enforcement）。**
`tools` 数组是**可本地化的展示元数据**；而且规范专门留了 `tools_generated`：「Boolean indicating the server generates additional tools at runtime (default: false)」——等于官方承认工具清单不是封闭集合。
唯一的把关在**上架审核**，不在运行时：提交 Connectors Directory 的要求包括「Mandatory tool annotations for all tools」「Privacy policy requirements」（mcpb 文档 "Ready for distribution" 段）。
→ 未声明的网络/文件访问，manifest 层**拦不住**。

**⑥ 安装摩擦**
- **从"看到"到"能用"**：官方 blog 写成三步：「**Download a `.mcpb` file. Double-click to open with Claude Desktop. Click 'Install'.**」目录内安装更短：Settings > Extensions → Browse extensions → Install → 填配置（如 API key）。
- **三条安装路径**（官方文档）：双击 `.mcpb` / 拖进窗口 / Settings → Extensions → Advanced settings → Install Extension…
- **安装时看到什么**（官方文档逐字）：「All three open an installation UI where the user reviews **extension details and permissions**, configures required settings, **grants permissions**, and completes installation.」
  具体弹窗里那句警告文案（是否提示"扩展以你的权限运行/可能是恶意的"）今天**没找到官方原文** = `未核实 (unverified)`。
- **一键停用/卸载**：Settings > Extensions 里管理。逐字的开关措辞 = `未核实 (unverified)`。
- **全局"受限/安全模式"开关**：**个人版没有**。企业侧有（engineering blog 逐字）：「Group Policy (Windows) and MDM (macOS) support」「Ability to pre-install approved extensions」「**Blocklist specific extensions or publishers**」「**Disable the extension directory entirely**」「Deploy private extension directories」。support 文档补充：Team/Enterprise 的 Owner 可以整体 enable/disable 公共扩展、上传自建扩展供全员一键安装。

---

## 2. Claude Code plugins + marketplaces

来源：
- https://code.claude.com/docs/en/plugins-reference （fetched 2026-09-14）
- https://code.claude.com/docs/en/discover-plugins （fetched 2026-09-14）
- https://code.claude.com/docs/en/permissions （fetched 2026-09-14）
- https://code.claude.com/docs/en/sandboxing （fetched 2026-09-14）

### 六问六答

**① 插件跑在哪里 → 子进程，且明确不在沙箱里。**
plugins-reference 原文：「**Hook execution**: Runs unsandboxed at same trust level as hooks」「**Monitor processes**: Run unsandboxed at same trust level as hooks」。
sandboxing 文档原文：「**Sandboxing provides OS-level enforcement that restricts what Bash commands can access at the filesystem and network level. It applies only to Bash commands and their child processes.**」
→ **插件的 MCP server、hooks、LSP server 都在沙箱之外**，以用户权限运行。
discover-plugins 的 Security 段逐字：「**Plugins and marketplaces are highly trusted components that can execute arbitrary code on your machine with your user privileges. Only install plugins and add marketplaces from sources you trust.**」
（沙箱本身：macOS 用 Seatbelt，Linux/WSL2 用 bubblewrap；配置字段 `sandbox.enabled` / `sandbox.filesystem` / `sandbox.network.allowedDomains` / `sandbox.credentials.files[].mode:"deny"` / `sandbox.excludedCommands` / `sandbox.failIfUnavailable` / `sandbox.enableWeakerNetworkIsolation`。）

**② 密钥怎么到插件手里 → 两条路，都是 env 注入；敏感值走单独的环境变量名。**
plugins-reference 原文（`userConfig`）：
1. **非敏感值**：在 MCP 配置的 `url` / `headers` / `args` / `env` 里用 `${user_config.KEY}` 替换
2. **敏感值**：导出为环境变量 **`CLAUDE_PLUGIN_OPTION_<KEY>`**（KEY 大写）

```json
{
  "userConfig": {
    "api_token": { "type": "string", "title": "API token", "sensitive": true },
    "api_endpoint": { "type": "string", "title": "API endpoint" }
  },
  "mcpServers": {
    "my-api": {
      "command": "node", "args": ["server.js"],
      "env": {
        "ENDPOINT": "${user_config.api_endpoint}",
        "TOKEN": "${CLAUDE_PLUGIN_OPTION_API_TOKEN}"
      }
    }
  }
}
```

另有 `headersHelper`（指向一个脚本，运行时动态生成 HTTP header）——**给「密钥不落配置文件」留的口子**，值得 Nomi 参考。
路径变量：`${CLAUDE_PLUGIN_ROOT}`（插件安装目录）、`${CLAUDE_PLUGIN_DATA}`（`~/.claude/plugins/data/{id}/`，跨更新保留）、`${CLAUDE_PROJECT_DIR}`。
→ **宿主不代理模型调用**；密钥明文进子进程 env。

**③ 宿主能不能拦截工具调用 → 能，这是三者里唯一做实的。机制名：permission rules + permission modes + hooks。**
- **`permissions.allow` / `permissions.deny` / `permissions.ask`**，规则语法 `Bash(npm run *)`、`Read(./path)`、`WebFetch(domain:example.com)`、`mcp__<server>__<tool>`
- 插件 MCP 工具的规则名有命名空间：**`mcp__plugin_<plugin-name>_<server-name>__<tool>`**；hook matcher 里引用 server 用 `plugin:<plugin-name>:<server-name>`
- **优先级**：deny > ask > allow（原文：「a matching ask rule prompts even when a more specific allow rule also matches the same call」）
- **裸工具名 deny 会把工具从上下文里整个删掉**（原文：「A bare tool name like `Bash` removes the tool from Claude's context entirely, so Claude never sees it.」）；`"deny": ["mcp__*"]` 一条关掉全部 MCP 工具
- **permission modes**：`default` / `plan` / `acceptEdits` / `bypassPermissions`（+ `auto`）；管理员可 `permissions.disableBypassPermissionsMode` / `permissions.disableAutoMode` 设为 `"disable"`
- **hooks**（PreToolUse 等）可以在工具执行前介入——这是「花钱前确认」最接近的对应物
- **没有 spending/cost 的原生概念**；`/plugin` 详情页有 **Context cost** 估算（token 成本，不是钱）

**④ 声明式字段（RAW 字段名）**

`.claude-plugin/plugin.json`：
`name` `displayName` `version` `description` `author` `homepage` `repository` `license` `keywords` `metadata` `defaultEnabled` `skills` `commands` `agents` `workflows` `hooks` `mcpServers` `outputStyles` `lspServers` `userConfig` `channels` `dependencies` `experimental`（`themes` / `monitors` / `evals`）

MCP server 配置字段：`command` `args` `env` `url` `headers` `headersHelper`

settings 侧（`.claude/settings.json` / managed settings）：
`permissions`（`allow` `deny` `ask` `defaultMode` `additionalDirectories` `disableBypassPermissionsMode` `disableAutoMode`）、`enabledPlugins`、`extraKnownMarketplaces`（含 `source` / `autoUpdate`）、`strictKnownMarketplaces`、`pluginSuggestionMarketplaces`、`sandbox`、`forceLoginMethod` / `forceLoginOrgUUID`

**注意：`plugin.json` 里一个「我要网络 / 我要读文件」的能力声明字段都没有。** 权限是**宿主侧 settings 的事**，不是插件自己声明的。这是跟浏览器扩展模型最大的分叉点。

**⑤ 未声明就用会怎样 → 同样没有 enforcement；但规则本身写错会被丢弃并告警。**
- 插件没有能力声明，所以「未声明就用」这个问题在 Claude Code 里**不存在**——插件想干什么就干什么，直到撞上 `permissions.deny` 或沙箱（而沙箱只管 Bash）。
- 规则层面的 fail-closed 细节值得抄：
  - `mcp__` 规则带括号的会被跳过，并在启动的 invalid-settings 弹窗和 `claude doctor` 里列出来
  - allow 规则里不带 `mcp__<server>__` 前缀的 glob（`"*"`、`"mcp__*"`）**被跳过并告警，不授权任何东西**
  - `Bash(command:rm *)` 这类想约束主内容字段的规则会被忽略 + 启动告警（因为复合命令可绕过）
- 项目作用域插件要先过 workspace trust：「Project-scope plugins (`.claude/skills/`): Require workspace trust before loading」，MCP server 还要**逐个 per-server approval**。

**⑥ 安装摩擦**
- **从"看到"到"能用"：2 步**（官方就是这么分步的）：`/plugin marketplace add owner/repo` → `/plugin install <name>@<marketplace>`。官方 marketplace 是**首次交互启动时自动添加的**，所以从官方目录装只要 1 步 `/plugin install github@claude-plugins-official`。
- **安装时看到什么（官方逐字警告）**：
  > **Make sure you trust a plugin before installing it. Anthropic doesn't control what MCP servers, files, or other software are included in plugins and can't verify that they work as intended. Check each plugin's homepage for more information.**
  
  以及 Security 段：
  > **Plugins and marketplaces are highly trusted components that can execute arbitrary code on your machine with your user privileges.**
- **安装前的信息披露（很值得抄）**：详情面板显示 **Context cost**（每回合加多少 token）、**Last updated**、**Will install** 段落——「listing the plugin's commands, agents, skills, hooks, and MCP and LSP servers, **so you can review exactly what it adds before installing**」。
- **安装作用域三选一**：User scope / Project scope / Local scope（还有管理员下发的 **managed** scope，用户改不了）。
- **一键停用/卸载**：有。`/plugin disable <name>@<mkt>`、`/plugin enable`、`/plugin uninstall`，或 `/plugin` → Installed tab 里按 Enter 进详情操作。另有 **Not used recently** 分组，主动提示你清理装了不用的插件。
  - 移除 marketplace 会连带卸载：「**Removing a marketplace will uninstall any plugins you installed from it.**」
- **全局"受限/安全模式"开关**：
  - `/sandbox` 命令 + `sandbox.enabled`（但只管 Bash）
  - workspace trust 对话框：不信任这个文件夹，仓库提供的 hooks/settings 就不生效（`claude -p` 和 SDK 会话**永远不显示这个对话框**，等同已接受 —— 这是个坑）
  - managed settings：`strictKnownMarketplaces` 限制能加哪些市场、`permissions.disableBypassPermissionsMode`、`DISABLE_AUTOUPDATER`
- **分级信任**：官方市场（`claude-plugins-official`，Anthropic 策展）> 社区市场（`anthropics/claude-plugins-community`，「passed Anthropic's automated validation and safety screening」，**每个插件 pin 到具体 commit SHA**）> 第三方/本地（默认**关闭**自动更新）。

---

## 3. MCP 规范本身的安全条款

来源：
- https://modelcontextprotocol.io/specification/draft/index （fetched 2026-09-14）
- https://modelcontextprotocol.io/specification/draft/server/tools （fetched 2026-09-14）
- https://modelcontextprotocol.io/specification/draft/basic/security_best_practices （fetched 2026-09-14）

### 六问六答

**① server 跑在哪里 → 规范不强制；本地 stdio 子进程与远端 HTTP 都在范围内。**
规范区分 **Hosts**（发起连接的 LLM 应用）/ **Clients**（宿主内的连接器）/ **Servers**（提供能力的服务）。
Security Best Practices 专门有一节 **"Local MCP Server Compromise"**：「Local MCP servers are binaries that are downloaded and executed on the same machine as the MCP client.」

**② 密钥怎么走 → 规范只管 OAuth 那条路，且明令禁止透传。**
「**MCP servers MUST NOT accept any tokens that were not explicitly issued for the MCP server.**」（Token Passthrough 反模式）
本地 stdio server 的 API key 怎么给，规范不管（那是 MCPB/宿主的事）。

**③ 宿主能不能拦截工具调用 → 规范把这条写成核心义务。机制名：human in the loop / consent flow。**
Tools 页 Warning 逐字：
> **For trust & safety and security, there SHOULD always be a human in the loop with the ability to deny tool invocations.**
> Applications SHOULD:
> - Provide UI that makes clear which tools are being exposed to the AI model
> - Insert clear visual indicators when tools are invoked
> - **Present confirmation prompts to the user for operations, to ensure a human is in the loop**

规范首页 Key Principles 逐字：
> **User Consent and Control** — Users must explicitly consent to and understand all data access and operations / Users must retain control over what data is shared and what actions are taken / Implementors should provide clear UIs for reviewing and authorizing activities
> **Tool Safety** — Tools represent arbitrary code execution and must be treated with appropriate caution. … **Hosts must obtain explicit user consent before invoking any tool** / Users should understand what each tool does before authorizing its use

Tools 页 Security Considerations 里给客户端的 SHOULD 清单：
> - Prompt for user confirmation on sensitive operations
> - **Show tool inputs to the user before calling the server, to avoid malicious or accidental data exfiltration**
> - Validate tool results before passing to LLM
> - Implement timeouts for tool calls
> - Log tool usage for audit purposes

**④ 声明式字段（RAW）**
Tool 定义：`name` `title` `description` `icons` `inputSchema` `outputSchema` `annotations`（`x-mcp-header` 是可选扩展）
能力协商：`capabilities.tools.listChanged`
**关键一条**：annotations **不可信**——
> **For trust & safety and security, clients MUST consider tool annotations to be untrusted unless they come from trusted servers.**

→ 规范自己明说「插件的自我描述不能当安全依据」。**这条直接适用于 Nomi：任何插件自报的「我只读」「我不花钱」都不能信。**

**⑤ 未声明就用会怎样 → 规范对 client 有硬性拒绝要求（少数几处 MUST）。**
- `x-mcp-header` 违反约束 → 「Clients **MUST** reject tool definitions … the client MUST exclude the invalid tool from the result of `tools/list`」并 SHOULD 记日志
- 授权 URL scheme：「MUST only allow `http://` and `https://`」「MUST reject `javascript:`, `data:`, `file:`, `vbscript:`」；「**MUST NOT** use shell commands (e.g., `cmd.exe`, `sh`, PowerShell) to open URLs」
- SSRF：client **SHOULD** 拒 `http://`（loopback 除外）、屏蔽私有 IP 段（`10/8` `172.16/12` `192.168/16` `127/8` `169.254/16` `fc00::/7` `fe80::/10`）、校验重定向目标
- State handle：「MCP servers **MUST NOT** treat possession of a state handle as authentication.」

**⑥ 安装摩擦 → 规范对「一键安装本地 server」写了硬性同意要求。这段最该抄。**
> If an MCP client supports one-click local MCP server configuration, it **MUST** implement proper consent mechanisms prior to executing commands.
>
> **Pre-Configuration Consent** — The MCP client **MUST**:
> - **Show the exact command that will be executed, without truncation** (include arguments and parameters)
> - Clearly identify it as a potentially dangerous operation that executes code on the user's system
> - Require explicit user approval before proceeding
> - Allow users to cancel the configuration

以及一串 SHOULD（Nomi 可以逐条当验收项）：
> - Highlight potentially dangerous command patterns (e.g., commands containing `sudo`, `rm -rf`, network operations, file system access outside expected directories)
> - Display warnings for commands that access sensitive locations (home directory, SSH keys, system directories)
> - **Warn that MCP servers run with the same privileges as the client**
> - **Execute MCP server commands in a sandboxed environment with minimal default privileges**
> - Launch MCP servers with restricted access to the file system, network, and other system resources
> - **Provide mechanisms for users to explicitly grant additional privileges (e.g., specific directory access, network access) when needed**
> - Use platform-appropriate sandboxing technologies (containers, chroot, application sandboxes, etc.)

**讽刺点值得记一笔**：规范这段 SHOULD 要求沙箱 + 逐项授权，而 Anthropic 自己两个宿主（Claude Desktop 扩展、Claude Code 插件）**都没做沙箱**，走的是「充分告知 + 你自己判断信不信来源 + per-call 确认」。

---

## 4. 三方对照表

| 维度 | Claude Desktop `.mcpb` | Claude Code plugins | MCP 规范 |
|---|---|---|---|
| **跑在哪** | 本机**子进程**，stdio，宿主自带 Node（不沙箱） | 本机**子进程**，明确 **unsandboxed**，用户权限 | 不强制；本地 stdio 或远端 HTTP 都在范围 |
| **密钥怎么到插件** | **宿主 env 注入**：`${user_config.KEY}` → `mcp_config.env`；敏感值存 OS keychain | **宿主 env 注入**：非敏感 `${user_config.KEY}` 替换；敏感值 → `CLAUDE_PLUGIN_OPTION_<KEY>`；另有 `headersHelper` 动态生成 | 不管本地 key；OAuth 侧 **MUST NOT** 透传非本 server 的 token |
| **宿主能否拦调用** | 安装期有权限步骤；per-call 弹窗官方原文 `未核实` | **能**：`permissions.allow/deny/ask` + `mcp__plugin_<p>_<s>__<tool>` + permission modes + hooks | **SHOULD**：human in the loop，可 deny 每次调用；tool inputs 必须先给用户看 |
| **声明式权限字段** | `user_config.<KEY>`：`type` `title` `description` `required` `default` `multiple` `sensitive` `min` `max`；顶层 `tools` `tools_generated` `privacy_policies` `compatibility` | **plugin 侧无能力声明**；`plugin.json`: `mcpServers` `hooks` `lspServers` `userConfig` `dependencies` `defaultEnabled`…；权限在宿主 settings 的 `permissions.{allow,deny,ask,defaultMode}` | Tool: `name` `title` `description` `inputSchema` `outputSchema` `annotations`——且 **annotations MUST 视为不可信** |
| **未声明就用** | **无运行时后果**；`tools_generated: true` 官方承认运行时可长新工具；把关只在上架审核 | **无能力声明所以无所谓**；只有写错的规则会被丢弃 + 启动告警；项目域插件需 workspace trust + per-server approval | 对 client 有几处 MUST 拒绝（非法 `x-mcp-header`、危险 URL scheme） |
| **安装步数** | 3 步：下载 → 双击 → Install（目录内更短） | 2 步：`/plugin marketplace add` → `/plugin install`；官方市场自动添加故常为 1 步 | 不适用 |
| **安装时的文案** | 「reviews extension details and permissions … grants permissions」；具体弹窗警告文案 `未核实` | **逐字**：「Anthropic doesn't control what MCP servers, files, or other software are included in plugins and can't verify that they work as intended」+「can execute arbitrary code on your machine with your user privileges」 | **MUST** 展示未截断的完整命令 + 明说这是危险操作 + 可取消 |
| **一键停用/卸载** | Settings > Extensions（逐字措辞 `未核实`） | **有**：`/plugin disable` / `uninstall`；移除市场自动卸载其插件 | 不适用 |
| **全局受限/安全模式** | **个人版无**；企业有 MDM/GPO、blocklist、「Disable the extension directory entirely」 | 部分：`/sandbox`（只管 Bash）、workspace trust、managed `strictKnownMarketplaces`、`disableBypassPermissionsMode` | **SHOULD** 沙箱 + 最小权限 + 按需逐项授权（两个 Anthropic 宿主都没照做） |

---

## 5. Nomi 能直接抄的五条

1. **密钥模型照抄 MCPB**：插件在 manifest 声明 `user_config` 槽（带 `sensitive: true`），Nomi 收集 → 存 OS keychain → 用 `${user_config.x}` 替换进子进程 `env` → spawn。插件**永远拿不到 Nomi 自己的模型 key**，只能拿用户为它单独填的那份。
2. **花钱闸不要放在 manifest**，放在 per-call。Nomi 已有的「每次提交看报价确认」正好对应 MCP 规范的 human-in-the-loop MUST/SHOULD，比两个 Anthropic 宿主都强（它们根本没有 spend 概念）。**这是 Nomi 的差异化，不是补课项。**
3. **抄 Claude Code 的安装前披露面板**：Will install 段落逐项列出这个插件会加哪些工具/hook/MCP server，加上成本估算。用户点"安装"前就看得见清单。
4. **抄「自报不可信」这条硬规则**：插件自称 readOnly / 不花钱，一律不作为放行依据（规范原文是 MUST）。Nomi 的价格卡必须由 Nomi 自己的计费层算，不能读插件声明。
5. **抄分级市场 + commit SHA pin**：官方策展 / 过自动安检的社区 / 第三方（默认关自动更新）。社区那层「pinned to a specific commit SHA」是防供应链的关键一笔。

---

## 6. 本次调研中明确「未核实」的项

- Claude Desktop 安装弹窗的**逐字警告文案**（是否提示"扩展以你的权限运行"）
- Claude Desktop 扩展**单条停用/卸载**的逐字 UI 措辞
- Claude Desktop MCP 工具调用的 **per-call 授权弹窗**（「Allow once」/「Allow always」/「Allow for this chat」）官方原文——只在第三方文章与 GitHub issue 见到
- `sensitive: true` 在 **Windows 上对应 Credential Manager** 的官方说法（只有 macOS Keychain 在 blog 里以「OS keychain」泛称出现）
- Claude Desktop spawn 子进程的**具体实现机制**（从 stdio transport + `mcp_config.command/args` 推断，官方未逐字描述）

---

## 附：本次 fetch 的全部 URL（均 2026-09-14）

1. https://claude.com/docs/connectors/building/mcpb
2. https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md （+ raw.githubusercontent.com/modelcontextprotocol/mcpb/main/MANIFEST.md 全文）
3. https://github.com/modelcontextprotocol/mcpb/blob/main/README.md
4. https://www.anthropic.com/engineering/desktop-extensions
5. https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop
6. https://code.claude.com/docs/en/plugins-reference
7. https://code.claude.com/docs/en/discover-plugins
8. https://code.claude.com/docs/en/permissions
9. https://code.claude.com/docs/en/sandboxing
10. https://code.claude.com/docs/en/iam
11. https://modelcontextprotocol.io/specification/draft/index
12. https://modelcontextprotocol.io/specification/draft/server/tools
13. https://modelcontextprotocol.io/specification/draft/basic/security_best_practices
