# Lane B — 非 Anthropic AI 宿主的插件信任模型

抓取日期：**2026-09-14**（所有 URL 当日实抓）。
方法说明：抓取经 WebFetch（页面转 markdown 后由小模型摘要+引述）。**带引号的句子是该页面上的原文引述**；没有引号的是我对页面内容的概括；拿不到原文的一律标 `未核实 (unverified)`。

---

## 0. 一眼对照表

| 维度 | Dify Plugin | Open WebUI Tools/Functions | Open WebUI Pipelines | OpenAI Apps SDK / Plugins | Cline / Cursor MCP |
|---|---|---|---|---|---|
| 插件在哪跑 | **独立进程/容器/远端**：local=子进程(STDIN/STDOUT)、debug=TCP、serverless=AWS Lambda 之类走 HTTP | **宿主主进程内** `exec()` 加载的 Python | **另一台/另一个容器**（`:9099`），宿主只当它是 OpenAI 兼容 API | **开发者自己托管的远端 MCP server**（HTTPS streamable HTTP） | **本机子进程**（stdio）或远端 HTTP/SSE |
| key 怎么到插件 | 两条路：① 插件自己的第三方 key 由 Dify 存、运行时注入 `self.runtime.credentials[...]`；② **要调 LLM 时不给 key——反向调用宿主** `self.session.model.llm.invoke(...)` | Valves/UserValves 里自己填（可加密存），插件直接拿明文用 | 同上（Valves） | **从不给**。ChatGPT 不把自家 key/模型给 app；app 用自己的 OAuth token 访问自己的后端 | **env 注入明文**：`"env": {"API_KEY": "..."}` 写在 json 里 |
| 宿主能不能拦截花钱/工具调用 | **能**（模型调用走宿主 = 天然计费/拦截点）；工具调用无逐次人工确认 | 基本不能（同进程任意代码） | 不能（独立服务器自己发请求） | 能拦工具调用（host 确认 UI），但 app 花的是开发者自己的钱 | 能：默认每次工具调用弹确认；`autoApprove` 可关 |
| 声明式权限清单 | **有**：`manifest.yaml` 的 `resource.permission.*` + `meta.runner` | **无**（只有 docstring 元数据 `title/author/version/requirements/license`） | 无 | 有但不是"能力清单"：MCP tool schema + OAuth `securitySchemes` scopes | 无（配置=启动命令，不是权限声明） |
| 全局限制开关 | 有：`FORCE_VERIFYING_SIGNATURE`、工作区「谁能装/谁能调试」 | 有：Workspace 权限（Functions 仅管理员） | 有（不部署就没有） | 有（企业/连接器管控，本轮未核实细节） | 有：`disabled: true` / Cursor Run Modes |

---

## 1. Dify Plugins

### 1.1 插件在哪跑 — 三种 runtime，都不在 Dify 主进程里

来源：`dify-plugin-daemon` 官方 README（<https://raw.githubusercontent.com/langgenius/dify-plugin-daemon/main/README.md>，2026-09-14）

- **Local Runtime**：`"runs on the same machine as the Dify server."` 插件是 **子进程**，走 STDIN/STDOUT 双向通信。
- **Debug Runtime**：`"listens to a port to wait for a debugging plugin to connect."` 全双工 TCP，供开发者把本地插件挂到远端 Dify。
- **Serverless Runtime**：打到 AWS Lambda 之类第三方平台，daemon 用 HTTP 调。
- 协议翻译那句原文：`"All requests from Dify api based on HTTP protocol, but depends on the runtime type, the daemon will forward the request to the corresponding runtime in different ways."`

官方博客补充（<https://dify.ai/blog/dify-plugin-system-design-and-implementation>，2026-09-14）：本地部署是 `"a subprocess managed by the parent process"`，经 `"standard input-output pipes"` 通信；SaaS 走 AWS Lambda `"elastic scaling based on usage"`；企业版 `"high controllability and privacy protection, supporting private deployment within enterprises"`；远程调试用 `"Redis HashMap to manage plugin connection states"` 把请求路由回正确的 pod。

**对 Nomi 的含义**：Dify 选的是「**独立进程 + 明确 IPC 协议**」，不是同进程加载。这是 Electron 里最容易照抄的一档（utilityProcess / child_process + stdio JSON-RPC）。

### 1.2 manifest.yaml 的 RAW 字段

来源：<https://docs.dify.ai/en/develop-plugin/features-and-specs/plugin-types/plugin-info-by-manifest>（2026-09-14）

顶层字段：`version`、`type`（目前只支持 `"plugin"`）、`author`、`label`（多语言）、`created_at`（RFC3339，不得晚于当前时间）、`icon`、`privacy`（隐私政策路径或 URL，**上架 Marketplace 必填**）、`resource`、`permission`、`plugins`、`meta`。

`resource`：内存上限（字节），页面说明主要服务于 SaaS 上的 AWS Lambda 资源申请。

`permission` 下的子项，及该页对每项的原文说明：

| 字段 | 官方说明（原文引述） |
|---|---|
| `tool` | `"Permission for reverse invocation of tools"` |
| `model` | 开模型访问，下面再分 `llm` / `text_embedding` / `rerank` / `tts` / `speech2text` / `moderation` |
| `node` | `"Permission for reverse invocation of nodes"` |
| `endpoint` | `"Permission to register endpoint"` |
| `app` | `"Permission for reverse invocation of app"` |
| `storage` | 持久化存储，带 size 上限（字节） |

`meta.runner`：`language`（仅 Python）、`version`（当前 `3.12`）、`entrypoint`（Python 填 `"main"`）。
`meta.arch`：`amd64`、`arm64`。
`plugins`：列出具体能力的 yaml 文件路径（如 `openai.yaml`）。该页明确禁止组合：`"Extending both tools and models"` 与 `"Extending both models and Endpoints"` 都不允许。

> 注：完整 YAML 缩进层级（`permission:` 下 `model:` 下 `enabled: true` 那一层）我没能逐字取到原始 YAML 块，**字段名已核实、嵌套写法标 未核实 (unverified)**。

### 1.3 关键问题：插件要调 LLM 时，拿到 key 还是求宿主代调？

**求宿主代调。** 这是 Dify 最值得抄的一条。

来源：<https://docs.dify.ai/en/develop-plugin/features-and-specs/advanced-development/reverse-invocation-model>（2026-09-14）

- 调用方式：`self.session.model.llm.invoke()`。
- 签名（来自搜索结果引述同一族文档）：
  `def invoke(self, model_config: LLMModelConfig, prompt_messages: list[PromptMessage], tools: list[PromptMessageTool] | None = None, stop: list[str] | None = None, stream: bool = True) -> Generator[LLMResultChunk, None, None] | LLMResult`
- 插件 YAML 里声明一个模型选择器参数，让**用户**在 Dify UI 里挑模型：
  ```yaml
  - name: model
    type: model-selector
    scope: llm
    required: true
  ```
  运行时 `model_config=tool_parameters.get('model')` —— 插件拿到的是**宿主发的模型引用**，不是 API key。
- 官方博客把这类能力统称 `"call internal Dify services"`，包括已配置认证的模型、工具和应用。

**插件自己的第三方凭据**走另一条路（来源：<https://docs.dify.ai/en/develop-plugin/dev-guides-and-walkthroughs/tool-plugin>，2026-09-14）。provider yaml：

```yaml
credentials_for_provider:
    serpapi_api_key:
        type: secret-input
        required: true
        label:
            en_US: SerpApi API key
        placeholder:
            en_US: Please input your SerpApi API key
        url: https://serpapi.com/manage-api-key
```
运行时读：`self.runtime.credentials["serpapi_api_key"]`。
即：**宿主的模型 key 永不外流；插件自己的 key 由宿主代存代注入。**

### 1.4 能不能拦截花钱

能，而且是结构性的：模型调用必须经 `session.model.*` 回到宿主，宿主可在此计费、限额、拒绝。
（Dify 文档没有把这条写成「花钱闸」，我是从架构推的 —— **这条推论标 未核实 (unverified)**，但反向调用必经宿主是核实过的。）

### 1.5 用了没声明的能力会怎样

未在文档中找到明确的错误语义描述。合理推断是 daemon 侧按 manifest 的 permission 拒绝该次反向调用。**标 未核实 (unverified)。**

### 1.6 安装摩擦

- 三种来源：Marketplace / GitHub 仓库 URL+release / 本地 `.difypkg` 文件。本地安装路径：插件管理页右上角 `Install Plugin → Install via Local File`，或把文件拖到空白处。（<https://docs.dify.ai/en/plugins/quick-start/install-plugins> 相关搜索结果，2026-09-14）
- 工作区页（<https://docs.dify.ai/en/use-dify/workspace/plugins>，2026-09-14）：三条来源分别描述为 Marketplace `"Integrations from Dify, its partners, and community developers"`、GitHub 按 URL+版本、本地 `"Custom .zip packages for private or internal integrations"`。管理员可把「安装与管理权限」「调试权限」各设为 **Everyone / Admins / No one**；每类集成的更新策略可设 disabled / 只收补丁 / 总是最新。
- **签名门**：默认开启验签，装未在 Marketplace 验证过的插件会报
  `"plugin verification has been enabled, and the plugin you want to install has a bad signature"`
  解法是在 `.env` 里设 `FORCE_VERIFYING_SIGNATURE=false` 并重启。（来源：langgenius/dify issues #13842 / #31486 与 Dify FAQ 页的搜索摘要，2026-09-14；**FAQ 页我直连 404，这条按 issue 原文核实，FAQ 原文标 未核实 (unverified)**）
- 官方博客对安全模型的定性原文：不是重沙箱，而是 `"public-key cryptography-based signature strategy."`，插件必须 `"explicitly declare functional permissions"`，未签名插件会触发安全告警；Marketplace 上架要过 `"privacy policy review"`。
- 一键禁用/卸载：文档未给出明确操作，**未核实 (unverified)**。

---

## 2. Open WebUI — Tools / Functions / Pipelines

这是**反面教材**，值得原样记下来当「不要这么做」的样本。

### 2.1 在哪跑

来源：<https://docs.openwebui.com/features/extensibility/plugin/functions/>（2026-09-14）

Functions 以 **Python 源码存在数据库里**，运行时用 `exec()` 动态加载进临时模块命名空间，缓存在内存（`request.app.state.FUNCTIONS`），源码变了才重载。**跑在 Open WebUI 服务端主进程内**。

来源：<https://docs.openwebui.com/features/extensibility/plugin/>（2026-09-14）原文：
> `"Tools, Functions, Pipes, Filters, and Pipelines execute arbitrary Python code on your server"`

**Pipelines** 是唯一跑在外面的：单独容器
```
docker run -d -p 9099:9099 --add-host=host.docker.internal:host-gateway -v pipelines:/app/pipelines --name pipelines --restart always ghcr.io/open-webui/pipelines:main
```
宿主把它当 OpenAI 兼容端点接（默认 key `0p3n-w3bu!`）。文档同时写着 `"Pipelines are legacy and are no longer recommended"`。（<https://docs.openwebui.com/features/extensibility/pipelines/>，2026-09-14）

### 2.2 key 怎么到插件

**Valves / UserValves**（<https://docs.openwebui.com/features/extensibility/plugin/tools/development/>，2026-09-14）：
- `Valves`：`"used for specifying customizable settings of the Tool."` 全体用户共享，可存 API key 之类 secret（支持加密存储）。
- `UserValves`：按用户存在个人资料里。
- 二者都是 `BaseModel` 子类，用 pydantic `Field()` 定义。
- 事件类可带 `Valves` 但**永远不能带 `UserValves`**，因为 event handler 没有用户上下文。

插件直接拿明文 key 自己发请求 —— **宿主完全不在链路上**。

### 2.3 声明式权限

**没有。** 唯一的「清单」是文件头 docstring 元数据：`title`、`author`、`author_url`、`funding_url`、`version`、`requirements`、`license`。

而 `requirements` 不是声明、是**执行**：保存 tool 时 `"the line will be parsed and pip install will be run on all requirements at once."` 生产环境建议 `ENABLE_PIP_INSTALL_FRONTMATTER_REQUIREMENTS=False` 关掉，改在镜像里预装。
→ **导入一个社区 tool = 在你服务器上跑一次 `pip install` + 跑任意 Python。**

### 2.4 用了没声明的能力会怎样

无概念。没有能力边界。加载失败（语法错/import 失败/构造异常）时平台会自动禁用该 function，避免每次请求重复失败 —— 这是稳定性措施，不是安全措施。

### 2.5 安装摩擦与警告原文

来源：<https://docs.openwebui.com/features/extensibility/plugin/tools/>（2026-09-14）
四步：Community Tool Library → 点 **Get** → 填自己实例 URL（如 `http://localhost:3000`）→ **Import to WebUI**。

警告原文：
> `"Never import a Tool you don't recognize or trust. These are Python scripts and might run unsafe code on your host system."`

来源：<https://docs.openwebui.com/features/extensibility/plugin/>：
> `"Only install from trusted sources. Never import Tools or Functions from unknown or untrusted sources. Malicious code can compromise your entire system."`

同页还写了 `"Featured does not mean vetted"`，并要求 `"Regular users should not have Workspace access unless explicitly required."`

Pipelines 页警告原文：
> `"Pipelines are a plugin system with arbitrary code execution: don't fetch random pipelines from sources you don't trust. A malicious Pipeline could access your file system, exfiltrate data, mine cryptocurrency, or compromise your system."`

Tools 页把授权说得最直白：给用户 Tool 权限 `"equivalent to the ability to run arbitrary code on the server"`。

**全局限制开关**：Functions 只有管理员能建/管；Tools 需要 `Workspace > Tools` 权限。Tool 还必须按模型启用（Workspace → Models 勾选）或在单次对话里用 Integrations 图标临时开。

---

## 3. OpenAI Apps SDK / Plugins

（站点已并入 `developers.openai.com/plugins`，Apps SDK 路径仍在。）

### 3.1 在哪跑

**开发者自己托管的远端 MCP server。** 原文（<https://developers.openai.com/plugins/concepts/mcp-server.md>，2026-09-14）：生产 MCP server 应 `"deploy[ed] at stable HTTPS endpoints using the streamable HTTP transport."`；server `"expose[s] tools, resources, prompts, and instructions"`，`"Plugins primarily use tools"`。纯 skill 插件可以完全没有 server：`"A plugin that only provides instructions and resources can consist of skills alone"`。

UI 组件（widget）跑在 ChatGPT 里的 **隔离 iframe + 严格 CSP**，拿不到特权浏览器 API（<https://developers.openai.com/apps-sdk/guides/security-privacy.md>，2026-09-14）。

### 3.2 key 怎么到插件

**ChatGPT 的模型/密钥永不给 app。** app 用自己的 OAuth 2.1 授权码流 + PKCE 认自己的用户（<https://developers.openai.com/apps-sdk/build/auth.md>，2026-09-14）：
1. ChatGPT 取你的 protected resource metadata；
2. 用 CIMD（Client ID Metadata Documents）或 DCR 向你的授权服务器表明身份；
3. 用户在**你的** IdP 上认证并同意 scopes；
4. 换 access token；
5. 后续 MCP 请求带 `Authorization: Bearer <token>`；
6. 你的 server 自己验 token。

原文强调：`"Once a request reaches your MCP server you must assume the token is untrusted and perform the full set of resource-server checks yourself."` 官方还建议 `"use an existing established identity provider rather than implementing authentication from scratch yourself."`

反过来：app 也**不能**用 ChatGPT 的模型额度 —— 它要调模型就是自己掏钱调自己的。（这一点文档没有一句话明写，是从「无模型访问通道」推的，**标 未核实 (unverified)**。）

### 3.3 宿主能不能拦

能拦工具调用：安全页写宿主对破坏性操作提供确认提示，并要求 `"Human confirmation for irreversible operations"`、`"Make sure users understand when they are linking accounts or granting write access."`

### 3.4 声明式清单

不是「能力权限清单」，是两层：
- MCP **tool schema**（结构化输入定义，模型据此调用）；
- OAuth `securitySchemes` 里声明的 **scopes** —— 声明准确，用户连接时看到的同意屏才准确（原文：`"the consent screen is accurate"`）。
- widget 的嵌套 iframe 要在 **resource CSP metadata** 里显式 allowlist。

### 3.5 数据/安全守则原文要点

（<https://developers.openai.com/apps-sdk/guides/security-privacy.md>，2026-09-14）
- `"Use OAuth 2.1 authorization-code flows when integrating external accounts."`，过期/畸形凭据返回 401。
- 最小化：只带当前操作必需的信息；`"Avoid embedding secrets or tokens in component props."`
- 日志：`"Redact PII before writing to logs."` 存关联 ID 而非原始 prompt 文本。
- 最小权限、服务端自行校验模型给的输入、发布前做安全审查、公布保留策略并响应删除请求。

### 3.6 安装摩擦

用户在 ChatGPT 里连接一个 app → 跳到开发者 IdP 的同意屏（显示 scopes）→ 授权返回。审核/提交流程页（`/plugins/deploy/review`）我直连 404，**提交与审核细则、断开连接/删除的具体 UI 文案 标 未核实 (unverified)**。

---

## 4. Cline / Cursor 的 MCP 配置（时间允许的补充）

### Cline
来源：<https://docs.cline.bot/mcp/configuring-mcp-servers>（2026-09-14）

```json
{
  "mcpServers": {
    "server-name": {
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": { "API_KEY": "your_api_key" },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```
核实到的字段：`command`、`args`、`env`、`disabled`、`autoApprove`；文档提到 `type`（选传输）。`alwaysAllow` / `timeout` 在该页**没看到**，标 未核实 (unverified)。
- key：**明文写进 json 的 `env`**，以子进程环境变量注入。文档只建议 `"Store secrets in environment variables"`。
- stdio server = 本机 spawn 的子进程。
- 拦截：`autoApprove` 是白名单数组；文档建议 `"Limit autoApprove to safe tools"` 和 `"Review tool calls before approval"`。**逐工具的 auto-approve UI 该页未描述**，标 未核实 (unverified)。
- 一键禁用：`"disabled": true`。

### Cursor
来源：<https://cursor.com/docs/context/mcp>（2026-09-14）
- 文件位置：项目级 `.cursor/mcp.json`，全局 `~/.cursor/mcp.json`。
- stdio 字段：`command`、`args`、`env`、`envFile`（从文件加载更多环境变量）；远端字段：`url`、`headers`（含认证头）。
- stdio server 跑在本机，**作为子进程**，按你给的命令+参数+环境变量直接执行。
- 审批：默认 `"Cursor asks for approval before using MCP tools."` 随 Run Modes 变化 —— Auto-review 模式下 allowlist 里的工具直接跑，其余交分类器审。
- 安全提示原文：`"only install MCP servers from trusted developers and repositories"`，装前审 `"what data and APIs the server will access"`；API key 用最小权限；敏感 server 用本地 stdio 而非远端。

---

## 5. 给 Nomi 的三条可抄结论

1. **要抄 Dify 的反向调用，不要抄 Open WebUI 的 Valves。** 插件需要模型时，交给宿主调（`session.model.llm.invoke` 那一手），插件只拿到一个用户在 UI 里选定的 model 引用。这样价格确认卡天然落在宿主，插件根本没有绕过花钱闸的通道 —— 这正是 Nomi「每次提交看报价确认」的结构前提。
2. **进程边界照 Dify 的 local runtime：子进程 + stdio 协议 + daemon 做协议翻译。** 同进程 `exec()` 那条路（Open WebUI）在 Electron 里等于把用户的 key 和文件系统直接交出去，而它自己的文档就写着 `"Malicious code can compromise your entire system."`
3. **清单要抄 `resource.permission.*` 的粒度**：`tool` / `model.{llm,tts,...}` / `node` / `endpoint` / `app` / `storage` 这六类正好对应 Nomi 要管的「调工具、调模型花钱、注册回调、读写持久化」；再加 Dify 没有而 Nomi 需要的 `network`（出站域名白名单）和 `fs`（可读目录）。签名+来源分档（official/partner/third-party）+ `FORCE_VERIFYING_SIGNATURE` 式全局硬开关，是成本最低的一层。
