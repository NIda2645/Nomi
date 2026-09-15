# 生态插件怎么补齐基本能力（pi 侧 · 通用判断 + 四个检验用例）

> 状态：📋 方案待拍板 — 2026-09-14 调研，**只读，一行代码未动**。四条裁决里三条是「不用做 / 小改」，一条（联网读素材）是真缺口且要先 grill。
> 相关：[插件宿主方案](2026-09-14-plugin-host-plan.md)（这份回答「怎么装别人的插件」，本篇回答「哪一层根本不该自己写」） · [TODO · 生态与插件](../TODO.md)

**用户 09-14 原话**：「重点是我希望我们要思考这类生态插件怎么快速补齐我们的基本能力，而不是重复造轮子。」

---


> 只读调研，一行代码未动。日期 **2026-09-14**。
> 版本基准：`package.json:230-232` 锁 `@earendil-works/pi-{ai,agent-core,coding-agent}@0.85.1`；
> npm registry 实查（2026-09-14）三个包 `dist-tags.latest` **也都是 0.85.1**（发布 2026-09-05）——**我们没落后上游**。
> 下载量窗口一律 `api.npmjs.org/downloads/point/last-week`，当天返回 **2026-09-05 → 2026-09-11**。
> 前置结论不重做：`docs/research/2026-09-07-pi-package-ecosystem.md`（扩展零校验、完整系统权限、代码不借）、
> `2026-09-07-pi-coding-tools-layer.md`（coding 工具 7 个原样接、"我们另写了"一列全空）、
> `docs/engineering/framework-boundaries.json` `id=pi`。

---

## 0. 通用判断（这才是用户要的那条，四个用例只是检验）

**一句话**：pi 生态对 Nomi 的价值**不是「装包」，是「告诉我们哪一层根本不该自己写，以及那一层的事实格式长什么样」**。
装包这条路对我们**结构上关死**（`docs/packages.md:20`：任意代码 + 完整系统权限 + 无签名无完整性校验；我们是握密钥、花真钱的桌面 App）。
剩下能取的只有三种形态，按「代价在谁身上」排序：

| 形态 | 判据 | 我们该怎么做 |
|---|---|---|
| **A. pi 原生就有** | 在 `pi-ai` / `pi-agent-core` / `pi-coding-agent@0.85.1` 的公开导出或 docs 里 | **必须用原生**。R29 已把这条做成门岗（`check:framework-surface`）。今天四列表的「我们另写了」列全空，保持 |
| **B. pi 没有、但生态已收敛出**一个事实格式/协议 | 多个独立作者、含**厂商官方**包（Langfuse / LangChain / Braintrust / Tavily / Ollama 都发了 pi 包）指向同一份规范 | **借格式不借代码**（R31）。我们自己实现读写面，但字段名/语义对齐那份规范，并在 `docs/plan` 里写「规范链接 / 偏差 / 偏差理由」 |
| **C. pi 没有、生态也只是各写各的**（中位包是"作者为自己写的"） | 头部包周下载 < 几千、作者单人、最近更新散乱 | **自研，但必须说得出领域约束**。说不出 = 就是在重造轮子 |

**判 A/B/C 的固定动作**（这三步就是用例 4 要机器化的东西）：
1. `grep -n "export" node_modules/@earendil-works/pi-*/dist/**/*.d.ts` + 翻 `pi-coding-agent/docs/`（随包 31 篇，**不用上网**）；
2. `registry.npmjs.org/-/v1/search?text=<关键词>+keywords:pi-package`，再对头部包逐个拉 `downloads/point/last-week` 与 `registry.npmjs.org/<pkg>`（看 author / repository / **dependencies**——依赖表就是安全面的第一读数）；
3. 仓库侧 `grep` 出我们自己那份的 `file:line`。

**安全面怎么一眼读**：看 `dependencies`。
`pi-web-access` 依赖 `unpdf/linkedom/undici/@mozilla/readability` + 已知读 Chrome cookie / 钥匙串 → 碰本机凭据；
`pi-web-search` **零依赖**、只发 HTTPS 到模型厂商 → 不碰本机凭据；
`@langfuse/pi-observability-plugin` 依赖 `@opentelemetry/exporter-trace-otlp-http` → **默认出网**。

---

## 1. 检验用例一 · 轨迹导出与评测

| pi 原生提供 | 生态包（名 / 周下载 2026-09-05→09-11 / 最后更新 / 安全面） | 我们另写了（file:line） | 裁决建议 |
|---|---|---|---|
| **会话 JSONL 本身就是可回放原料**：`~/.pi/agent/sessions/--<path>--/<ts>_<uuid>.jsonl`，一行一 entry，`id`/`parentId` 成树（就地分支），v3 自动迁移；`AssistantMessage` 带 `provider/model/usage{input,output,cacheRead,cacheWrite,cost}/stopReason`，`ToolResultMessage` 带 `toolCallId/toolName/isError/details`（`pi-coding-agent/docs/session-format.md:1-10`、`:22-28`、`:75-110`）。`JsonlSessionRepo` 提供 `open/list/delete/findEntries` | **官方厂商三家已发 pi 包，全部走 OTel GenAI**：`@langchain/langsmith-pi-extension` **10 296**/wk，0.2.0，2026-08-17，作者 LangChain（deps `langsmith`,`zod`，出网到 LangSmith）；`@raindrop-ai/pi-agent` **7 099**/wk，0.2.1，2026-09-10；`@braintrust/pi-extension` **4 651**/wk，2.0.1，2026-09-09，作者 braintrustdata（零 deps，出网）；`@langfuse/pi-observability-plugin` **416**/wk，0.1.2，2026-08-31，deps `@langfuse/otel`+`@opentelemetry/{api,sdk-trace-node,exporter-trace-otlp-http}` → **明确 OTel**。本地档：`pi-phoenix` 1 670、`pi-trace-extension` 168（"Langfuse-style trace viewer, local-first, zero-setup"）、`pi-trace-viewer` 152、`pi-observability` 75。**`pi-eval` / `pi-replay` / `pi-session-export` 这三个名字在 npm 上一个都不存在**（搜到的全是相关度噪音）——**生态做的是 trace 导出，不是 replay/eval** | ① 会话落盘**没另写**：`electron/agentLane/laneSession.mts:1-5`（"pi 的 JsonlSessionRepo，不是我们自己的第二份持久化"），`:41-44` `laneSessionsRoot = <project>/.nomi/agent-sessions`；② **派生视图是我们的**：`electron/agentLane/laneTrace.mts:23-33` `LaneTraceTurn{schemaVersion:1,…}`，`:62` `spanName:'invoke_agent Nomi'`，`:78` `execute_tool <name>`，`:153-159` 写 `trace.jsonl` + `trace.md` 到 `laneTraceDirectory()`（`:139-142`，**刻意放进 `<id>.trace/` 子目录避开 pi 的顶层 `*.jsonl` 扫描**）；③ 打包导出是另一条、且**明确排除创作内容**：`electron/diagnostics/diagnosticsBundle.ts:96-121`（只装 `logs/` + `model-catalog.json`），`:151` `why:"creative-content-by-design"`；`electron/diagnostics/agentTraceIpc.ts:29` 的 `nomi:diagnostics:open-agent-trace` 只**开目录**不打包；④ 回放夜跑读的是**旧格式**不是 pi JSONL：`tests/agent-runtime/replayShadowSources.mts:14-20`（实核 369 个项目里方案点名的那份快照 **0 命中**，真正有料的是旧 `agent-session.json`） | **原生（会话）+ 借格式（导出）+ 保留自研（派生视图）**。<br>① pi JSONL **就是**评测原料，**别造第二份落盘**——已经做对了，守住；<br>② `trace.jsonl` 的 span 命名已对齐 OTel GenAI，偏差理由已成文（`docs/plan/2026-09-10-trace-log.md:12`：不引 exporter、不宣称是 OTLP、`input/cacheRead/cacheWrite` 分列不冒充 OTel 总输入）——**R31 这一格是合规的，不用重做**；<br>③ **真缺口在这里**：回放/评测的**输入端**还挂在旧格式上（`replayShadowSources.mts` 三个 legacy 适配器），而 R30 要的「工具写对率 / 回合成功率」（`docs/engineering-rules.md:816-817`、`:828`）天然该从 pi JSONL 的 `toolCall.arguments` + `ToolResultMessage.isError` 直接数出来 |

**三行判断**
1. **不要另造导出格式**：用户要「导出轨迹」时，正解是**在 pi session JSONL 上做字段过滤**（复用 `laneTrace.mts` 已有的 `applyTraceRedactions` + `traceSafeValue`），不是发明第三种文件。今天已经是这样，只是那份派生物还没有"导出"这个产品入口——`agentTraceIpc` 只会 `shell.openPath`。
2. **要补的一件事**：把 `replayShadowSources.mts` 加一个 **pi JSONL 适配器**（`<project>/.nomi/agent-sessions/**/*.jsonl`），让 L2 回放和 R30 两个数字都从当前真相源取料；旧三个 legacy 适配器随迁移期结束一起删（P1）。
3. **不装任何 observability 扩展**：Langfuse/LangSmith/Braintrust 三个包的价值是**证明 OTel GenAI 是这层的事实标准**，不是拿来跑。它们默认出网、把提示词与产物送到第三方后台，与「本地优先 + 不上传创作内容」（`diagnosticsBundle.ts:151`）正面冲突。

---

## 2. 检验用例二 · 联网搜素材

| pi 原生提供 | 生态包（名 / 周下载 / 最后更新 / 安全面） | 我们另写了（file:line） | 裁决建议 |
|---|---|---|---|
| **没有。** `pi-coding-agent@0.85.1` 的 `dist/core/sdk.d.ts:71` 导出的工具工厂只有 8 个：`createReadTool/createGrepTool/createFindTool/createLsTool/createEditTool/createWriteTool/createBashTool/createPowerShellTool` —— **一个 web 工具都没有**。这和 `docs/usage.md:309` 的自陈一致（不内置 MCP / 子 agent / 权限弹窗…） | **碰本机凭据的**：`pi-web-access` **96 837**/wk（0.29.0，2026-09-10，Nico Bailon；deps `undici/linkedom/unpdf/@mozilla/readability/turndown`；09-07 已实核会读 Chrome cookie + 钥匙串解密）；`@amaster.ai/pi-web-access` 795/wk。<br>**不碰本机凭据、走 API 的**：**`pi-web-search` 5 328**/wk（1.5.0，2026-09-08，作者 ttttmr，**零运行时依赖**，"provider-native web search：Gemini + URL Context / xAI Grok / OpenAI Responses（Azure·Codex·Copilot）/ Anthropic"——**复用已有模型密钥，不需要第四个搜索厂商的 key**）；`@juicesharp/rpiv-web-tools` 1 189/wk（Brave/… 可插拔）；`@tian.zuo/pi-web-search` 260/wk（OpenAI/Exa/Tavily 回退链）；`@hyav/pi-search` 218/wk；`@tavily/pi-extension` **56**/wk（**Tavily 官方发的，但几乎没人用**，0.1.2 停在 2026-05-19）；`pi-exa-search-api` 24/wk；`pi-jina-webtools` 32/wk；`pi-search-hub` 76/wk（19 个后端）。<br>**读法**：这一类**极度长尾**——头部两个占绝大多数，其余几十个是"作者为自己写的" | **一个都没有。** `nomi_*` 模型可见工具 36 个（`electron/shared/agentCapabilities/` + `electron/agentLane/`）里没有任何 web/fetch/search/browse；`grep -niE "web_search\|web_fetch\|tavily\|firecrawl\|jina" electron/agentLane/ electron/shared/agentCapabilities/ electron/harness/` **零命中**。<br>唯一的痕迹是一个**空槽**：`electron/harness/context/provenance.ts:3-10` 的 `PROVENANCE_SOURCES` 里有 `"web_fetched"`，但没有任何生产者写它。<br>而 coding 工具那条路**被沙箱堵死**：`electron/agentLane/laneCodingSandbox.mts:206` `network:{allowedDomains:[...policy.allowedDomains], deniedDomains:[]}`，`:104` 默认 `allowedDomains: []` → Agent 的 `bash` **出网被拒**（`docs/research/2026-09-07-pi-coding-tools-layer.md` §2 本机实跑：出网被拒） | **保留自研（但必须现在就动），格式/设计借 `pi-web-search`。**<br>不装包的理由是硬的：`pi-web-access` 读 Chrome cookie + 钥匙串，把它塞进握着用户 API key 的 Electron 主进程 = 把别人的威胁模型搬进我们家（R28）。<br>但"因此什么都不做"是错的——**这是一个真实能力缺口**：Agent 今天做不了「去网上找一张参考图 / 查一下这个人物长什么样 / 读一篇文章改成分镜」 |

**三行判断**
1. **缺口是真的，而且是产品级的**：`provenance.ts` 里 `web_fetched` 这个空槽说明**当初设计时就想到了会有联网素材**，只是没人填。`docs/research/2026-09-07-pi-package-ecosystem.md` §3.3 分桶里"图像/视频"那 125 个包大量在做素材获取——生态在这条线上跑得比我们快。
2. **该抄的是 `pi-web-search` 的结构判断，不是它的代码**：它的核心洞察是**「用模型厂商自带的 search/URL-context，而不是再接一个搜索厂商」**——Gemini URL Context、OpenAI Responses 的 web_search、Anthropic 的 web_search 都是模型侧能力。对 Nomi 的意义极大：**不用让用户再配第四个 key、不用引入新的花钱面**，而 Nomi 已经有完整的模型目录与花钱闸。这条直接落在 P4（能力按模型身份声明）上。
3. **落地形状**（建议，不是决定）：一个 `nomi_web_read` 工具，**只读不搜**（给 URL 取正文/图），走现有 provider 的 URL-context 能力或一次纯 HTTPS GET；产物一律打 `provenance: web_fetched, trust:"untrusted", tainted:true`（槽已经在）；出网面**不开给 `bash`**（沙箱那条 `allowedDomains: []` 不动），只开给这一个有审批闸的工具。**这件事要先 grill 再派工**（碰外部契约 + 花钱边界 + 安全面，P5）。

---

## 3. 检验用例三 · Agent 直接接中转站模型（OpenAI 兼容 / Anthropic 兼容）

| pi 原生提供 | 生态包（名 / 周下载 / 最后更新 / 安全面） | 我们另写了（file:line） | 裁决建议 |
|---|---|---|---|
| **全都有，而且我们已经在用。** `pi-ai` 的 `createProvider({id,name,baseUrl,auth,models,api})` + 三个协议 API 工厂 `openAICompletionsApi` / `openAIResponsesApi` / `anthropicMessagesApi`（`pi-coding-agent/docs/custom-provider.md:31-56`）。文档明列支持面：自定义 `baseUrl`✅、自定义 headers✅（`ProviderHeaders`）、**模型列表发现**✅（"Register New Provider" 带 `models[]`；provider 也可自己 `resolve`）、流式✅（`ProviderStreams` / 自定义 streaming API 一节）、工具调用✅、**cost 表**✅（`models[].cost{input,output,cacheRead,cacheWrite}` + `contextWindow` + `maxTokens`）、OAuth✅、context-overflow 错误归一✅。`registerProvider` 的**扩展**形式只是 pi CLI 的装配糖——**同一套 `createProvider` 在 SDK 里直接可调，不需要扩展运行时** | `@indexyz/pi-custom-provider` **749**/wk（0.1.33，2026-09-12，作者 5aaee9，deps 仅 `@earendil-works/pi-ai`；"generic pi provider for OpenAI-compatible, Anthropic-compatible, OpenAI Responses, Ollama"——**和我们 `protocols` 那三行是同一个东西**）；`pi-provider-litellm` **23 624**/wk（2.3.0，2026-08-26，LiteLLM 代理）；`pi-cliproxyapi-provider` 1 184/wk（**带自动模型发现 + models.dev 富化**）；`pi-freeflow` 1 231/wk；`@esuyo/pi-esuyo-custom-provider` 57/wk（JSON 配置注册）；`@robhowley/pi-openrouter` 540/wk（实时 spend 覆盖层）。<br>**这一格的读法**：生态里所有"接中转站"的包都是 `createProvider` 的薄壳 + 各自的模型发现/配额逻辑。**没有一个提供了 pi-ai 本身没有的能力** | **"我们另写了"这一列是空的 —— Agent 文本模型已经直接走 pi-ai provider。**<br>`electron/agentLane/laneModelProvider.mts:9-12` 直接 `import { createProvider, InMemoryCredentialStore } from '@earendil-works/pi-ai'` + 三个 `*.lazy` API；`:58-62` 的 `protocols` 表把 `'openai-compatible' / 'openai-responses' / 'anthropic'` 三种 kind 映到 pi 的三个 API；唯一装配点，`laneHost.mts:180` 与 `laneSingleShot.mts:18` 两个调用者共用 `createNomiProvider`。<br>**Vercel AI SDK 那条路（`electron/ai/buildAiSdkModel.ts`）不参与 Agent lane**——它服务的是生成侧。<br>我们在 pi 之上只加了四样：① **密钥保管**（`InMemoryCredentialStore`，key 不落 pi 的凭据盘）；② **配置校验/领域不变量**（`:21-53` 的 zod：`baseURL` 必须 http(s)、`authType:'none'` 只许 openai-compatible、**`tokenPricing` 与 `free` 互斥**——"挑哪个都是我们在替用户猜"）；③ **价目→花钱闸**（`NomiPricingBasis` 三态，`catalog/types.ts:294` 说明「每百万」这个单位是给 `createNomiProvider` 原样用的）；④ **协议补丁 + 流保护**（`:65-80` `anthropicFetch` 改写 `/v1/messages`→`/messages` 以兼容用户网关前缀；`laneProviderGuard.mts` 的 `guardProviderStreams`） | **已经是"用原生"，不需要替换。** 问的那个「能不能直接走 pi-ai provider 而不经我们的适配层或 MCP」——**答案是：已经是了**，中间没有第二个适配层。<br>**不能整块删掉的那部分**（领域约束，逐条有 file:line）：<br>• 密钥保管：`laneModelProvider.mts:9` 用 `InMemoryCredentialStore`，而 pi 默认会把凭据写进 `~/.pi/`——Nomi 的密钥住在自己的加密存储里，**不能让第二个进程目录持有一份**；<br>• 花钱闸：`tokenPricing`/`free` 互斥 + `NomiPricingBasis` 三态（`shared/agentLane/laneModelConfig.ts:51`）是「每次提交看报价确认」那条闸的输入，pi 的 `cost` 表只是数字、没有三态；<br>• 模型目录：`NomiModelConfig` 由 Nomi 的 `model-catalog.json` derive，不是 pi 的 `models.json`——用户接模型那条流程（09-11 群反馈的最大主题）归我们管 |

**三行判断**
1. **这一格不用做任何事，但要把结论写进四列表**：今天 `framework-boundaries.json` 的 `id=pi` 只登记到 `pi-agent-core` 的 `AgentHarnessTool` / `AgentHarnessOptions` / `HookMap` 三个类型；**`pi-ai` 的 `ProviderConfig` / `Model` 字段还没有逐字段裁决**（那条 source 在文件里是截断的）。上游一旦加字段（比如新的 `cost` 维度或 `thinking` 参数），`check:framework-surface` 今天拦不住。
2. **生态那 6 个 provider 包一个都不装**，但 `pi-cliproxyapi-provider` 的"**自动模型发现 + models.dev 富化**"是值得读设计的一条：用户接中转站最痛的一步就是"我得手抄 20 个模型名"（09-11 `model-onboarding-feedback` 的卡点表里就有）。pi-ai 原生的 provider `resolve` 就能做发现——**这是 A 类（原生就有）而我们没用**。
3. **一条要核实的欠账**：`docs/engineering/framework-boundaries.json` 里 `AgentHarnessOptions.streamOptions` 判 `unused`，理由是"出站报文只允许一个改写点 = `createNomiProvider` 的 `requestOptions/onPayload`"。这条和「模型发现」不冲突，但如果要接模型发现，得先确认发现走的是 provider 的 `resolve` 而不是第二个出站点。

---

## 4. 检验用例四 · 「遇到问题先查插件」怎么机器化

**现状**（实读 `scripts/prior-art-lib.mjs:1-60`、`scripts/check-prior-art.mjs`）：门岗已经在，判据是——
- ① `docs/plan/<日期>-*.md` 必须有 `## 先查别人` 一节，节内 **≥3 条带出处**的条目（出处 = http(s) URL / `file:line` / 指向仓库真实存在文件的链接）；
- ② 改 `src/` 或 `electron/` **超过 300 行**的 PR，正文必须引用一份带该节的计划文档；
- ③ 老文档按日期阈值豁免；判据住在 lib 里以便 node-test 喂假仓库（R17）。

**它今天漏掉的**：判据只数"**有几条带出处的条目**"，**不看查的是哪几个池子**。所以一份只引了三条我们自己仓库 `file:line` 的方案也能过——而 #546 那次（五项能力各写了一份更差的）**恰恰就是"没去看依赖里有没有"**。

**建议的固定动作（三池，输出格式建议一段；不改文件）**：在 `## 先查别人` 下面固定三个子标题，门岗升级成"**三个池子各至少一条带出处**"：

```markdown
## 先查别人

### 框架原生（pi / 已装依赖）
- `createProvider` / `openAICompletionsApi` — node_modules/@earendil-works/pi-coding-agent/docs/custom-provider.md:31 — 自定义 baseUrl + headers + cost 表 + 流式全有 → **结论：用原生，不自研**
- （查法：`grep -n "export" node_modules/@earendil-works/pi-*/dist/**/*.d.ts` + 随包 `docs/` 31 篇，离线可查）

### 生态（npm `pi-package` 关键字 + pi 官方目录）
- `pi-web-search@1.5.0` — https://www.npmjs.com/package/pi-web-search — 5 328/wk（2026-09-05→09-11）· 零运行时依赖 · 不碰本机凭据 → **结论：借结构不借代码（复用模型厂商自带 search）**
- `pi-web-access@0.29.0` — 96 837/wk · **读 Chrome cookie + 钥匙串** → **结论：拒（安全面不可接受）**
- （查法：`curl -s "https://registry.npmjs.org/-/v1/search?text=<关键词>+keywords:pi-package&size=10"`；
   逐包 `https://api.npmjs.org/downloads/point/last-week/<pkg>` 取周下载，
   `https://registry.npmjs.org/<pkg>` 取 author / repository / **dependencies**（依赖表 = 安全面第一读数）；
   官方目录 https://pi.dev/packages）

### 我们自己（仓库现状）
- electron/agentLane/laneModelProvider.mts:58 — 三协议映射已在 → **结论：不新增，扩这一处**
```

**每条必须四段**：`名字 — 出处(URL 或 file:line) — 关键数字/安全面 — 结论(用原生/装包/借格式不借代码/保留自研+为什么)`。
门岗侧的最小改法（不在本次范围内，仅给形状）：`prior-art-lib.mjs` 现在按 `BULLET` 数带出处的条目，改成**按三个 `###` 子节各自数一次**，任一池 0 条即红；豁免仍按日期阈值。

**三行判断**
1. **不要新建门岗**，`check:prior-art` 已经是正确的那一层（R27/R29 的派工侧）——缺的只是**把"查了哪三个池子"变成结构**，这是判据从"数量"升到"覆盖面"的一次收窄，成本很小。
2. **"生态"这一池的查法要写死成可复制的三条 curl**，否则高负载下必漏（这正是 `prior-art-lib.mjs:5-10` 自己写的类根因："只要『查』这一步靠人记得，高负载下它就必漏"）。
3. **安全面判据要机械化**：`dependencies` 里出现 `keytar`/`better-sqlite3`/`puppeteer`/读 cookie 的库 = 碰本机凭据 → 直接判拒，不进讨论。

---

## 5. 汇总裁决（四行）

| 用例 | 裁决 | 今天要不要动 |
|---|---|---|
| 轨迹导出与评测 | **原生（pi JSONL 会话）+ 借 OTel GenAI 格式（已做）+ 保留自研派生视图** | 要：给 `replayShadowSources.mts` 补 pi JSONL 适配器，让 R30 两个数字从当前真相源取料；不装任何 observability 扩展 |
| 联网搜素材 | **保留自研（唯一真缺口），借 `pi-web-search` 的结构判断——用模型厂商自带 search，不接第四个搜索厂商** | 要，但**先 grill 后派工**（外部契约 + 花钱边界 + 安全面三件全占） |
| Agent 接中转站模型 | **已经是用原生**（`createProvider` + 三协议 API），我们只加密钥保管/花钱闸/模型目录三条领域约束 | 不动实现；要补 `pi-ai` 侧的 framework-surface 逐字段裁决（今天没登记 = 上游加字段拦不住） |
| 先查插件机器化 | **扩 `check:prior-art` 的判据形状**（三池各一条带出处），不新建门岗 | 小改，成本低 |

## 6. 没核实的，明着标
- `pi.dev/packages` 官方目录页本次**没抓**（沿用 09-07 的"分页到 106 页"），本次全部数字来自 npm registry / downloads API，取数日 **2026-09-14**，下载窗口 **2026-09-05→2026-09-11**。
- `https://pi.dev/docs/latest/sdk/custom-provider` 与 `/models` 两个线上页**没抓**：随包 `node_modules/@earendil-works/pi-coding-agent/docs/{custom-provider,models,session-format}.md` 就是同一份文档且与装的 0.85.1 严格同版本，比线上 latest 更准。
- 生态包的**实际行为**一个都没跑（只读 registry 元数据 + 描述 + 依赖表）。`pi-web-access` 读 Chrome cookie / 钥匙串这条沿用 09-07 的实核结论，本次未复验。
- `@indexyz/pi-custom-provider` 等 provider 包的源码**没读**，"没有提供 pi-ai 本身没有的能力"这句是**从描述 + 依赖表（只依赖 `@earendil-works/pi-ai`）推的**，不是读码得出的。
