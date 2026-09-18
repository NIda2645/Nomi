# 接模型 = Agent 经 MCP 交声明卡，Nomi 照卡执行（#754 正身 · 方案 v3）

> 2026-09-18 · Fable 方案稿 · **只出方案，不改产品代码** · 分支 `docs/agent-model-onboarding-plan-20260918`（从 `origin/main` 568b58272 切）
> 上游：任务书 `~/Desktop/nomi-scratch-0917/batch3/pr754-agent-onboarding-brief-v2.md`（用户 09-18 04:0x 拍板「就按这个方案」）；反方 `onboarding-prior-art/report-full.md`；普查 `protocol-census/report.md`；规格 `pr754-rewrite-spec.md`；现状体检 `docs/plan/2026-09-11-model-onboarding-flow.md`。
> 所有 `file:line` 对 `origin/main` 568b58272 核实（`git show` / `node scripts/door-map.mjs` 实跑）。
> 状态：📋 待用户看一眼 → 派 Opus 实施。§11 是派实施前要用户答的 grill 清单（每题带默认）。

---

## 0. 一页读懂（D6）

**真实摩擦**（用户原话的北极星）：「哪怕把内置的全删掉，任何人接上这个 MCP 工具，就能把任何供应商、任何模型接进来，并且全部很好地使用。」今天做不到，且不是差一点：外部宿主（Claude Code）接一家中转再出片**走不通**（09-15 真机，四轮 ¥0、五道闸一道没绕过，`docs/evidence/2026-09-15-mcp-onboarding-real-host/` 在 #799 分支）；就算走通，Agent 也只能把模型接成「OpenAI 兼容模板」那一种形状——图片/视频/音频没有协议可选（普查 Q3），原生报文不长那样的供应商（xAI / Google 直连、Higgsfield…）用户自己接不进来。

**这份方案做的事**：把「Agent 交一张声明卡」做成接模型的**唯一可写单元**，卡的形状与内置 90+ 家档案用的是同一个 `HttpOperation` / `AssetIngestion` 类型（`electron/catalog/types.ts:387,44`）——手写档案只是这条流水线的**预验证缓存**，不是另一门手艺（任务书附四）。Nomi 收卡后机器校验三件 + 免费自检 + 登记；第一次真实生成就是试跑；错了错误带位置回 Agent，改一次再交。入口是工具会话，不是文件夹；Agent 永不写脚本。

**要权衡的那一个东西：地址由谁说了算。** 今天 Agent 在 `begin` 里直接给 `baseUrl`，`nomi_integration_manage update_vendor` 还能**事后改**一条已存 key 的连接的地址（`electron/catalog/catalogManagement.ts:19-24`）——这意味着一段未签名的对话文本可以决定用户的密钥发往哪里（Cherry 铁律的反面）。本方案把「地址 + key 放哪」收回到用户在 Nomi 贴 key 的那一页：Agent 只能**建议**地址，页面把它摆在 key 输入框上方，用户按下保存 = 把 key 和这个 origin 绑在一起；此后**凡改变 key 去哪或怎么放的字段，都只能再走一次这一页**。代价是 Agent 改地址不能一句话搞定（要回到用户那一页），收益是「key 只去用户亲眼看过的地方」变成机器守的不变量而不是注释。

**用户体验（改完后）**：对 Claude Code 说「把 X 接进 Nomi，文档在 …」→ Nomi 弹一页：地址已填好、贴 key、保存（**一页一按**）→ Agent 读文档交卡 → 模型出现在模型框、标「未试跑」→ 画布上生成一次（报价先出、点一次确认）→ 出片后角标变「已出片 1 次 · 刚刚」；失败则 Agent 拿到「哪个适配器 / 哪一步 / 供应商原话」改卡再交。四跳：贴 key → 给文档 → 同意报价 → 出片。

---

## 1. 范围 / 不动项 / 回滚（R4）

| | 内容 |
|---|---|
| **做** | ① 新工具面 `electron/capabilityCore/modelOnboarding/`（声明式单一 owner，仿 #754 分支 `declarations.ts` + `envelope.ts` 形状，落到 main 现役的 `check:tool-face` 单入口）；② 声明卡 schema 扩展（§5）；③ 三件机器校验 + 免费自检合成一跳（§4.2）；④ 凭据-origin 绑定不变量 + 出站守卫扩展 + 门岗（§6）；⑤ run 失败信封带上下文（§4.4）；⑥ 「已验证」词表收敛 + 真实 run 派生角标（§7）；⑦ 删 `nomi_integration` / `nomi_integration_manage` / `catalogManagement.ts` 及两张 action 表（P1 同 commit）；⑧ #799 题库与 `check:onboarding-usecases` 搬到 main 接进 `gates:contracts`；⑨ README / `capability-core-cli-mcp.md` / `integrate-with-your-agent.md` 三处同步（`nomiMcpProductionRuns.test.ts:130-142` 会核） |
| **不动** | 设置页「接入模型」填表路与其自检（它们产出同一种卡、登记同一目录）；内置 90+ 档案（继续加）；人写 `customCall` 脚本路（沙箱 / 试跑 / AI 帮写）；#797 的 `MODEL_SETUP_OPEN_CAPABILITY`（`electron/shared/agentCapabilities/modelSetup.ts`）——本方案**从它派生**，不复造；20-verb 内部面的其余 19 个动词；`integrationSessionRecord.ts` 的「说真话」逻辑（沿用，不覆盖）；付费认证不回来（09-18 B4 裁决） |
| **附带删（任务书附二已定，前置条件见 §6.3）** | 跨供应商互借 `assetLocalization.ts:745-758`、匿名图床链 `assetIngestionRegistry.ts:90-116` |
| **回滚** | 三块独立：(a) 工具面：删 `modelOnboarding/`、恢复两个旧工具文件——**但 `update_vendor.baseUrl` 不许随回滚复活**（那是安全洞，单独一条 commit 先删）；(b) 出站守卫扩展：`vendorOutboundGuard.ts` 去掉 credential-origin 判据，`check:credential-origin` 会红——那正是它存在的意义；(c) 词表收敛：i18n 词条改回，`check:vocabularies` 基线回退。**刻意不可半途回滚**的一处：删旧工具与上新工具在同一 commit（否则两套「Agent 接模型」并行 = P1）。 |
| **验收门** | §10 |

---

## 先查别人（R5 五触发面 · 本方案第 2 节）

### 2.1 四列表（R5.4 姿势，对象是本仓两个「框架级」子系统：`electron/providerAdapter/` 与 `electron/integrationCertification/`）

> 为什么把自家子系统当框架查：反方报告 §0 指出 v1 讨论「没人提 `compiler.ts:30`」= 没查就提。本方案先把这两个子系统**已经提供的能力**逐条列出来，再决定另写什么。

| 已提供（file:line） | 我们用了 | 另写了（本方案新增，理由） | 拆散了（本方案要收的） |
|---|---|---|---|
| 声明卡类型 `ProviderAdapterDraft` / `AdapterModeDraft`：`create/query/result/statusMapping/delivery/abandon/referenceParam/testParams/sourceUrls`（`providerAdapter/types.ts:80-126`） | ✅ 卡的主体原样用 | provider 块加 `authScheme`；卡加 `assetIngestion`、`selfCheck`、`omitted[]`、`parameters[].sourceUrl`（§5）——都是「声明位已在 Vendor 上、卡上缺」的补齐，不是新概念 | `AdapterAuthType` 与 `VENDOR_AUTH_TYPES` 手抄多处（`catalog/types.ts` 注释原话「手抄在 15 处」）——本方案卡上的 authType 从 `modelAccessCapabilities.ts:105` derive，不再抄 |
| 校验器 `validateProviderAdapterDraft`：zod + 四根模板白名单 + 方法白名单 + 原型污染黑名单 + **同源**（`validator.ts:218` 操作 URL 同源；`:385-387` provider.baseUrl 同源） | ✅ 唯一校验边界（门表 5 扇写入口，§6.2） | 同源判据扩到 `assetIngestion.endpoint`（初始化端点带 key） | — |
| 免费自检 `selfCheck.ts`：`probeAdapterCredential`（`GET /models`，401/403 判死、404/405 不判死）+ `checkAdapterModeContract`（no_channel / async_without_query / reference_slot_missing）（`selfCheck.ts:52-133`） | ✅ 自检原样用 | 探针形状可由卡声明（`selfCheck: model-list | liveness-probe`），因为 `/models` 对 Higgsfield **不是权威源**（`higgsfieldVendor.ts:36-43` 实测两把 key 返回逐字节相同目录、且不列 DoP） | **两台探针机器**：curated 直填 key 走 `validateCandidateCredential.ts:59` + 种子 `livenessProbe`；Agent/向导路走 `probeAdapterCredential`。§8 Q2 收成一台 |
| 外部交件 `agentCompileRequest.ts`：目标 schema 从 zod 派生、身份锁死、出口必过校验（`:62`） | ✅ `submit_declaration` 就是它 | — | `compileRequestFor`（`integrationAdapterContract.ts:21-53`）在私网 host 上**静默**返回 undefined → 走 `builtinOpenAiCompatibleDraft` 模板。任务书 §2「不许静默落回」——本方案把它改成显式 `nextAction: needs_declaration` + `unverified: declaration_valid`（§3 发现 4） |
| 发布判据 `derivePublishedExecution`（`shared/modelPublication.ts:117-165`，09-11 不变量「自检失败不下架」）+ 发布印记 `evidence: "self-check"`（`promotionMeta.ts:59`） | ✅ | 角标改从真实 run 派生（§7），印记保留为「发布凭据」 | 渲染层 duck-typing 读 `meta.adapter.evidence`（`useDedupedModelSelect.ts:124-131`）——字段取值来源该收进一条链（§7） |
| 会话状态机 `IntegrationSessionService`：owner / revision / stage 词表 / 看门狗 / 迁移（`integrationSession.ts:553`，`integrationContract.ts:4-70`） | ✅ 底座不换：新工具面是**投影层**，`setupId` 就是 session id | 幂等：宿主按 `(setupId, action, SHA-256(canonicalJson(args)))` 派生 changeId（#754 `idempotency.ts` 思路），`expectedRevision` 不进模型入参 | `begin(baseUrl)`（`:882-883`）与 `update_vendor(baseUrl)` 两扇 Agent 写地址的门（§6） |
| 贴 key 页：`open_credentials` → 持久 handoff + MCP URL elicitation 一次性票（`dispatcher.ts:735-750`，`mcpCredentialElicitation.ts:102-`）；渲染层两种 op 同一个处理（`mcpHostSurfaceOps.ts:5`） | ✅ `connect_provider` 的 `user_sees_key_page` 就是它 | 页面要显示**将要绑定的 origin**（含私网；`safeHandoffOrigin` 今天把私网 origin 剥掉，`integrationHandoffOrigin.ts:9-40`） | `start_model_setup`（内部面，`profiles:["internal"]`，`writeVerbs.ts:362`）与 `open_credentials`（外部面）是同一件事的两扇门——本方案让外部 `connect_provider` 的描述从同一份声明派生（#797 正文写死的边界） |
| 出站守卫 `authorizeSubmitDestination`（`vendor/vendorOutboundGuard.ts`）：私网策略 + `declaredVendorOrigins` 精确 origin 例外；唯一分类器由 `check:outbound-policy` 盯 | ✅ 挂点就在这里 | 加一条判据：**带 key 的请求 origin 必须 == 用户确认的绑定 origin**（§6.1）——同一个函数、不造第二个分类器 | 运行时 `joinUrl` 对绝对 URL 原样放行（`ai/requestPipeline.ts:229`），今天只有校验器一层挡 |
| 错误码 → 人话表 `mcpToolErrorResults.ts:7`；`INTEGRATION_ERROR_CODES` 词表（`integrationContract.ts:37-52`） | ✅ 新码并进同一张表 | 新增 `declaration_rejected`（带 `rejections[]`）、`no_generic_contract`、`credential_origin_mismatch` | — |
| 隐藏/显示、`Model.enabled` 唯一闸门（09-11 ⑦） | ✅ `show_models` 直接调 | — | — |

### 2.2 参考实现逐层对照

| 层 | LiteLLM `health_check` | Dify 声明式 provider | Cherry Studio 凭据去向 | #797 `start_model_setup` | 本方案 |
|---|---|---|---|---|---|
| 探针形状 | `model_info.mode` 一等公民（chat / embedding / image_generation / audio_speech / video_generation / image_edit …）+ `health_check_timeout / health_check_max_tokens / health_check_voice / health_check_model` 逃生阀；**真发请求、花几个 token**（docs.litellm.ai/docs/proxy/health，2026-09-18 实抓） | `openai_api_compatible` provider class 是 `pass`，一份 YAML 的 `credential_form_schemas`（`endpoint_url` 必填、`api_key` secret-input、`mode` select…）扛全部 OpenAI 兼容端点（raw.githubusercontent.com/langgenius/dify-official-plugins …/openai_api_compatible.yaml，实抓） | — | — | 卡上 `selfCheck: {kind:"model-list"} \| {kind:"liveness-probe", request, successPath, sourceUrl}`；本仓种子**已有**这个形状（`higgsfieldVendor.ts:36-50 livenessProbe`，`apimartVendor.ts`），只是卡上没有。**免费**是硬约束（09-12 拍板），所以不抄 LiteLLM 的付费探针，只抄「探针差异外化成声明」 |
| 可写单元 | `config.yaml` + 自定义 `.py`（启动期 import 执行） | manifest.yaml + provider.yaml + models/*.yaml + *.py（裸子进程） | 表单行（SQLite `user_provider`） | 无（只开面板） | **纯数据**：声明卡 JSON；Agent 永不写脚本（`compiler.ts:30` 保持）；脚本逃生口只给人（`customCallRunner.ts:1-2`） |
| 凭据去向 | env 引用 | 租户级加密 | **铁律**：「Provider routing remains bundled because unsigned data must never control credential destinations」（`ProviderRegistryUpdaterService.ts:70-71`，反方报告 §1） | key 只在面板输入、工具「stored nothing」 | Agent 交的卡 = 未签名数据 → **不许决定 key 去哪**：origin 绑定只由 `saveCredential`（可信 UI）写；卡上任何带 key 的端点必须同源（§6） |
| 失败回给谁 | `unhealthy_endpoints[]` + 脱敏 | `ValueError(str(ex))` 拍平 | 20 类 `ERROR_CATEGORIES` 脱敏 | — | 信封 `rejections[{path, code, sourceUrl?}]`（收卡时）+ run 失败 `{vendorKey, modelKey, mode, step, upstreamStatus, upstreamBodyRedacted≤512}`（出片时）——两维正交沿用 `errorCategory × selfCheckReason`（`verifier.ts:16-21`） |
| 「已验证」 | healthy = 探针过 | 校验通过即可用 | 「连接成功」= 一次真请求过 | — | 自检过 = 「未试跑」；**只有真实 run 出过片才算「已出片」**（§7） |

### 2.3 标准对齐（R5.5 · 声明卡能不能直接吃 OpenAPI 片段）

| 规范链接 | 我们的偏差 | 偏差理由（领域约束，不是偏好） |
|---|---|---|
| OpenAPI 3.1.0（spec.openapis.org/oas/v3.1.0.html，2026-09-18 实抓）：Operation / Security Scheme（`http` 的 `scheme` 可以是任意 IANA 方案词，`Key` 可表达）/ Link Object + Runtime Expression（`$response.body#/id` 可以表达「把 create 的 id 喂给 query」）/ `x-` 扩展 | **不把声明卡做成 OpenAPI 文档**；卡是 Nomi 自定义形状（已登记为 `model-catalog-package` 的一部分，`docs/engineering/standard-formats.json:382`，kind=`nomi-defined`），但 **每个字段带 `sourceUrl`，允许（可选）带 `openapi: {operationId | operationRef}` 指回供应商自己的 OpenAPI 文档**，作为来源证据的机器可读形式 | ① OpenAPI **没有**轮询/终态语义（Callbacks/Webhooks 是反向通知，不是 poll；实抓确认「No」）——`delivery/statusMapping/abandon` 是本域核心，塞进 `x-nomi-*` 扩展等于把 80% 的内容放进扩展点，别的 OpenAPI 工具读到的只剩一个壳；② OpenAPI 描述的是**服务端全部**接口，我们要的是「这一个模型的这一种模式怎么调 + 模板变量从哪来」——它没有 `{{request.prompt}}` 这类调用方变量的概念；③ 供应商文档站几乎不发 OpenAPI（apimart/kie/Higgsfield 都是 markdown 页），Agent 读的是 markdown 不是 OAS，「吃 OAS 片段」没有输入源。**登记**：`standard-formats.json` 的 `model-catalog-package.searched[]` 补一条 `{what: "OpenAPI 3.1 Link/Runtime Expression", verdict: "能表达 id 传递，不能表达轮询终态与调用方模板变量"}`；卡上 `openapi` 指针字段是标准的扩展方向（我们指向它，不复制它） |
| MCP 2025-11-25 URL elicitation（贴 key）、MCP 有状态工具指南（返回显式 handle） | 无偏差：沿用 `credentialElicitation.ts`、`setupId` 句柄 | — |
| JSON Schema draft-07（工具 `inputSchema`）：条件必填标准写法是 `allOf/if-then` | 扁平 schema + 描述里逐字说真话 + 运行时一次列全 | Anthropic 适配器丢根 `allOf`、Google 不认 `const`（`check:model-schema` 门岗实证，`mcpIntegrationTools.ts:27-45`） |

### 2.4 反方 prior-art（R5.2）

已有：`onboarding-prior-art/report-full.md`（九家；结论「零先例 Agent 写适配器 / 接模型全表单 / 文件夹是供应链入口」）。本方案采纳其全部四条判断（只改两个词；不做付费认证；先解「已验证」双定义；Cherry 铁律成不变量）。**补一条反方没查的**：九家里没有一家让 Agent 改**已存 key 连接的地址**——LobeChat/Cherry 改地址都是人在表单里改；本仓今天允许（§3 发现 1）。

---

## 3. 结构性发现（动手前，只记不修；每条给 file:line）

1. **地址由 Agent 决定，且可事后改**：`begin` 收 `baseUrl`（`integrationSession.ts:882-883`）；`update_vendor` 能 patch `baseUrlHint`（`catalogManagement.ts:19-24`）而 key 原样留着；#754 分支设计话术 #10「我地址填错了，baseUrl 改成 …」→ `connect_provider(vendorKey, baseUrl)` upsert（设计正本 §2）——三处同一个洞。
2. **`nomi_list_models` 是已退役的名字**：`mcpSurfaceCollapse.test.ts:18` 的 `RETIRED_OLD_NAMES` 明列它，读侧已收进 `nomi_read target=models`（`mcpToolCatalog.ts:90-101`）。任务书按规格 §4 要 `nomi_list_models` / `nomi_await_setup` 两个新读工具 = 复活退役名 + 第二个读入口（R14.1 工具面维度）。
3. **外部宿主没有 `start_model_setup`**：它 `profiles:["internal"]`、`exposure:"internal_only"`（`writeVerbs.ts:362`，`modelSetup.ts:23`）。外部从零的门是 `nomi_integration.begin + open_credentials`；删了它们，`connect_provider` 就是外部唯一的门——必须从同一份声明派生，不能第二份。
4. **静默落回 OpenAI 兼容模板**：`compileRequestFor` 在 `!canHostPublicDocs(hostname)` 时返回 `undefined`（`integrationAdapterContract.ts:38`），会话直接 `ready_to_certify`，模板来自 `builtinOpenAiCompatibleDraft.ts`。对自建/内网端点这是 09-11 的正确默认；对 Agent 路它违反任务书 §2「不许静默落回」。
5. **运行时不查 origin**：`joinUrl` 对绝对 URL 原样返回（`requestPipeline.ts:229`）；`authorizeSubmitDestination` 只判私网策略（`vendorOutboundGuard.ts:99-`）。校验器是唯一挡同源的层——**旧数据 / 手改 catalog 文件 / 未来第二个写入口**都绕得过（P2 自检「同类问题还能从旧数据回来吗」答不出「不能」）。
6. **两台探针机器**（§2.1 第 3 行）。
7. **Higgsfield 已是内置供应商**（`74b27569b`「接入 Higgsfield：旗舰三个」，`seedBuiltins.ts:83-84,345`；`deriveVendorKeyFromBaseUrl` 对已知 host 直接复用内置 key，`catalogCommit.ts:409-410`），且其目录里**没有 GPT Image 2.5**（`higgsfield-onboarding-research.md` §2：76 条无 openai 命名空间）。任务书 §2 的验收「只用 MCP 接 Higgsfield GPT Image 2.5 + Seedance 2.5」按现状**不成立**，要重定（§10、§11 Q9）。
8. **LiteLLM 那种探针声明本仓已有**：`livenessProbe {request, successPath, source}`（`higgsfieldVendor.ts:36-50`）、`keyValidation: "liveness-probe"`——但只有 curated 种子能声明，卡上没有。
9. **`authScheme` 在 Vendor 上有、卡上没有**（`catalog/types.ts` Vendor.authScheme；`providerAdapter/types.ts:112-118` provider 块无）；Higgsfield 的 `Authorization: Key id:secret` 经卡接不进来。
10. **贴 key 页看不到私网 origin**：`safeHandoffOrigin` 把 10./192.168./localhost 剥掉（`integrationHandoffOrigin.ts:23-37`）——用户给 LAN 中转贴 key 时，页面上没有「这把 key 要去哪」。
11. **「未试跑」由渲染层 duck-typing 决定**（`useDedupedModelSelect.ts:124-131` 读 `meta.adapter.evidence`），而「最近多次失败」由另一条链（`AilingProbe`，`:49-60`）决定——同一个「这个模型能不能信」有两条取值链（R14.1 字段取值来源）。
12. **`docs/plan/2026-08-04-custom-call-script.md:4` 引用的研究文件不存在**（`find` + `git log --all --diff-filter=A` 零命中，反方报告 §5 已证）；其立论「声明式够不到异步视频」已被本仓自己证伪（`AdapterModeDraft.delivery/query/abandon`；apimart/kie/Higgsfield 异步视频全是声明式）。

---

## 4. 工具面（最终 action 集与信封）

### 4.1 为什么是这个形状（一个工具 = 一种后果 = 动哪个状态 × 效果类别；同格合并 `action`，跨格必拆）

| 格 | 工具 | action | 动的状态 | nextAction |
|---|---|---|---|---|
| read | **`nomi_read`**（现役，`mcpToolCatalog.ts:107`） | `target=models`（现役）/ `target=setup`（**改名自 `integration`**，加 `setupId?`、`waitMs?`） | — | none |
| reversible_local | **`nomi_model_setup`**（新） | `connect_provider` / `submit_declaration` / `show_models` / `cancel` | S11.1 连接 · S11.3 模型记录 · S11.4 声明 · S11.5 自检 · S11.6 显示 · S11.0 在途 | 见下 |
| irreversible | **`nomi_remove_provider`**（新） | 无（`vendorKey` + 可选 `modelKeys[]` + `ifUnchanged`） | S11.6 删除 | user_sees_confirm_card |

- **不建 `nomi_list_models` / `nomi_await_setup`**（发现 2）。「查一眼 vs 等到好」用 `nomi_read target=setup waitMs`——与 `target=run_events waitMs` 同一个长轮询习语（`mcpToolCatalog.ts:87`），模型不用学第二种等法。对外工具数 23 − 2 + 2 = **23**，`mcp-payload` 棘轮按实测重记。
- **`check_connection` 不单独一跳**：自检是收卡的一部分（任务书 §3）。用户问「它为什么 401」→ `nomi_read target=setup` 念 `selfCheck.evidence`。
- **`choose_models` 不单独一跳**：卡上 `models[]` 就是选择；供应商列表只是证据（`unverified: model_id_exists` 在目录非权威时保留而不判死，与 `verifier.ts:113` `modelNotListed` 同义）。
- **`update_vendor` / `set_proxy` 的去向**（规格 §5 不确定项②）：改名、`proxyEnabled` 开关并入 `connect_provider(vendorKey)`（同格 reversible_local）；**`baseUrl / authType / authHeader / authQueryParam / authScheme / proxyUrl` 一律不再是任何 MCP 工具的入参**——它们只能在贴 key 页上改（§6.1 不变量的推论）。`delete_model` 并入 `nomi_remove_provider`（同格 irreversible）。

### 4.2 每个 action 的一种后果

| action | 入参（扁平 schema，必填按描述与运行时同一张表） | 做什么 | 后果 / nextAction |
|---|---|---|---|
| `connect_provider` | `name`（新建必填）· `docs?`（正文或每行一个 URL）· `suggested?: {baseUrl, authType, authHeader, authQueryParam, authScheme, sourceUrl}`（**建议**，只用于预填与展示）· `vendorKey?`（改已存连接：只许 `name`、`proxyEnabled`、`reissueKey`） | 新建 setup（= `IntegrationSession`），入队贴 key handoff + 铸一次性 elicitation 票（现役 `dispatcher.ts:735-750`）。带 `vendorKey` 时是 upsert 名字/代理开关；`reissueKey` 或建议地址与已绑定 origin 不同 → 再开贴 key 页 | `user_sees_key_page`（页面显示：**将绑定的 origin（含私网）+ key 放法一句话 + 来源 URL**，用户贴 key 按保存）；已有 key 且无地址变化 → `none` |
| `submit_declaration` | `setupId` · `declaration`（JSON 文本 ≤512KB，形状 = `adapterContractJsonSchema()`，§5） | **一跳三件**：① zod 校验（`validateProviderAdapterDraft`）；② 同源（卡上所有带 key 的端点 origin == 绑定 origin）；③ 免费自检（卡声明的 `selfCheck`：`GET /models` 或 liveness-probe；+ `checkAdapterModeContract` 逐模式）。全过 → 登记（`promotion`，印记 `evidence:"self-check"`），模型进模型框标「未试跑」 | `none`；信封 `unverified` 里**永远**留 `model_produces_output`；`changes` 列每个模型；失败 → `declaration_rejected` + `rejections[]`（§4.3），会话停 `needs_input`，什么都不登记 |
| `show_models` | `vendorKey` · `modelKeys[]` · `visible` | 改 `Model.enabled`（唯一闸门），不读自检结果（#754 门岗 O6） | `none`；`blastRadius.modelsAppearing/Disappearing` |
| `cancel` | `setupId` | 会话 `cancelled`；已存连接与 key 都不动 | `none` |
| `nomi_remove_provider` | `vendorKey` · `modelKeys?[]` · `ifUnchanged`（`nomi_read target=setup/models` 给的指纹） | 删模型或整家（含 key）；`ifUnchanged` 不符 → `stale_fingerprint` | `user_sees_confirm_card`（由 `effect: irreversible` 派生，与 `delete_from_canvas` 同机制） |

### 4.3 信封 schema（两个写工具同一形状；沿用 #754 分支 `envelope.ts`，加三格）

```ts
type OnboardingResult = {
  ok: true
  setupId?: string; vendorKey?: string; changeId?: string        // changeId = SHA-256(setupId, action, canonicalJson(args))
  state: SetupProjection                                          // 与 nomi_read target=setup 同形状的子集
  unverified: Array<{ claim: 'endpoint_reachable' | 'credential_accepted' | 'model_id_exists'
                           | 'declaration_valid' | 'asset_upload_works' | 'model_produces_output'
                    reason: string; evidenceWouldBe: string }>    // model_produces_output 只有真实 run 能消掉
  changes: Array<{ state: 'S11.0'|'S11.1'|'S11.3'|'S11.4'|'S11.5'|'S11.6'; summary: string }>
  blastRadius: { modelsAppearing: number; modelsDisappearing: number; recordsDeleted: number
                 outboundRequests: Array<{ origin: string; count: number; billable: false }> }
  nextAction: { kind: 'none'|'user_sees_key_page'|'user_sees_confirm_card'|'waiting_for_user'|'working'
                userSees: string; waitWith?: 'nomi_read target=setup waitMs'; url?: string }
}
type OnboardingFailure = {
  ok: false
  code: 'wrong_verb' | 'needs_input' | 'not_found' | 'invalid_args' | 'stale_fingerprint'
      | 'declaration_rejected' | 'credential_origin_mismatch' | 'no_generic_contract' | 'provider_failed'
  message: string; useInstead?: string; needs?: string[]          // needs 一次列全
  rejections?: Array<{ path: string                               // "models[1].modes[0].query.path"
                       code: 'schema' | 'same_origin' | 'no_channel' | 'async_without_query'
                           | 'reference_slot_missing' | 'credential_rejected' | 'endpoint_unreachable'
                           | 'model_not_listed' | 'upload_strategy_unsupported'
                       message: string; sourceUrl?: string }>     // sourceUrl = 卡上该字段自己声明的出处
  evidence?: { status?: number; bodyExcerpt?: string }            // 上游原文，截断不改写（≤512）
  nextAction: string
}
```

- `no_generic_contract` 的 `nextAction` 固定指向设置页脚本路（「这家需要 X，声明卡表达不了；在 Nomi 设置 → 该模型 → 调用脚本 手写」），**不许**指向 OpenAI 兼容模板。
- 五槽描述第五槽（consequence）由 `effect × nextAction` 派生，不手写（#754 `declarations.ts` 的 `consequenceText`）。措辞门岗：只要 `unverified` 可能含 `model_produces_output`，描述与 `userSees` 里不许出现 connected / verified / ready to use。

### 4.4 run 失败带上下文（任务书 §3 第 4 条）

`nomi_read target=run` 投影（`structuredContent.nomiRunData`，lessons `nomi-get-run-mcp-projection-shape`）的失败项加 `adapterFailure?: { vendorKey, modelKey, mode: ProfileKind, step: 'upload'|'create'|'poll'|'result'|'extract', upstreamStatus?, upstreamBodyRedacted?: string /*≤512*/, errorCategory?, selfCheckReason? }`。owner：抛出点（`vendorHttp` 的 `VendorRequestError` 已带 `httpStatus/category`；`step` 由 `runtime.runTask` 的阶段派发处带）——不在投影层猜。Agent 据此改卡再 `submit_declaration`（同 setupId 或新 setup 均可；旧卡被新 revision 取代，`ProviderAdapterRevision` 已有 lineage）。

---

## 5. 声明卡 schema 扩展（在 `AdapterSuppliedContract` / `ProviderAdapterDraft` 上加，不另起格式）

| 字段 | 位置 | 形状 | 为什么 |
|---|---|---|---|
| `provider.authScheme?` | provider 块（Nomi 从已绑定 vendor 填，卡上只能复述、不能改） | string（`Key` / `Bearer`…） | 发现 9；Vendor 已有 |
| `assetIngestion?` | 卡顶层（一家一份，落 `Vendor.assetIngestion`） | `AssetIngestion` 的子集：`inline-base64 \| none \| upload-url \| upload-multipart \| upload-stream \| upload-presigned \| upload-initiate-put \| upload-initiate-multipart`（**不含** `anon-chain` / `comfyui-upload`），每条带 `sourceUrl` | 任务书附二；Higgsfield 的两步预签名（`generate-upload-url` → PUT 带 `upload_headers`）= 现役 `upload-initiate-put` + `uploadHeadersPath`（`catalog/types.ts:155-176`，09-17 实测已落）。**`none` 必须显式**：没声明 = 卡不合格，不是「用兜底」 |
| `selfCheck?` | 卡顶层 | `{kind:'model-list'}`（默认）\| `{kind:'liveness-probe', request: HttpOperation, successPath: string, sourceUrl}` | 发现 8；`/models` 非权威的供应商声明自己的免费探针；探针**不许**是生成端点（校验：path 不得等于任一 mode 的 `create.path`，且 `billable:false` 由类型钉死） |
| `omitted[]` | 卡顶层 | `Array<{field, reason, sourceUrl}>` | 任务书 §3：「文档写了但不声明的字段 + 理由」——让 Agent 的取舍可审计；不参与执行 |
| `models[].parameters[].sourceUrl?` | 参数表 | URL | 每个数字能追到出处（R5.1 G3）；`mode.sourceUrls[]` 已有，参数级补齐 |
| `models[].modes[].estimate?` | 模式 | `HttpOperation`（可选） | Higgsfield 有 `/estimate/<slug>` 真报价端点；有它报价卡就能显示真价。**v1 是否收进**见 §11 Q6 |
| `openapi?` | 卡顶层（可选） | `{url, operationIds?: Record<modeKey, string>}` | §2.3：指回供应商 OAS 作为证据，不复制 |

**明确表达不了的（→ `no_generic_contract`，README 诚实边界）**：请求签名 / HMAC / OAuth 换 token（火山三头鉴权那类，`authType:"none"` 只是放行不是支持）；非 HTTP（gRPC / WebSocket / 流式媒体）；SDK-only；超出「（上传初始化 →）create → query → result」的多请求编排；自定义编码。这些走人写脚本路（`customCall`），**不许**静默落回模板。

---

## 6. 同源不变量 + 门岗

### 6.1 不变量（一句话）与它归哪层

> **任何带着用户 key 出站的请求，其 origin 必须等于用户在贴 key 页亲手确认并保存的那个 origin（`credentialBinding.origin`）；改变这个 origin 或 key 的放法，只能再走一次贴 key 页。**

- **绑定时**（owner：`catalogStore` 的 `saveCredential` 事务，`integrationSession.ts:985-1019`）：保存 key 的同一事务写 `vendor.meta.credentialBinding = { origin, authType, authHeader, authQueryParam, authScheme, proxyUrl?, confirmedAt }`。它是**唯一**写入口；`upsertModelCatalogVendor` 的公开 patch 路径对这几个字段**只读**（tsc 层：patch 类型 `Omit<…>`）。curated 种子的绑定 = 种子 `baseUrl` + `vendorBaseFallback` 的官方备用域（代码声明，不是数据）。
- **收卡时**（owner：`validateProviderAdapterDraft`，5 扇写入口见 §6.2）：已有 `:218/:385` 同源判据 + 新增 `assetIngestion.endpoint`、`selfCheck.request.path`、`estimate.path` 三处。第二步上传目标（预签名 URL）**不带 key**（策略设计如此，`catalog/types.ts:151-153` 注释），不在此判、由私网策略照判。
- **发送时**（owner：`vendorOutboundGuard.authorizeSubmitDestination`，同一函数）：`collectRequestSecretValues`（`requestPipeline.ts`）说这次请求带 key 且 vendor 有 `credentialBinding` → `url.origin ∈ {binding.origin} ∪ codeDeclaredFallbackOrigins(vendor)`，否则拒绝 `NOMI_ERR::outbound-blocked-credential-origin`（请求从未离开本机，文案「没扣费」那一支）。这一层同时罩住 **customCall 脚本**（它也走 `vendorHttp.requestJson`，`customCallRunner.ts:11-12`）——§8 Q1。
- **MCP 面**：任何工具入参不再含 `baseUrl / authType / authHeader / authQueryParam / authScheme / proxyUrl`（`connect_provider.suggested` 只进 handoff 的 display，永不落 vendor）。

### 6.2 门表（`node scripts/door-map.mjs` 2026-09-18 实跑，粘进 R21 合同 `doors`）

- `validateProviderAdapterDraft`（写 5）：`providerAdapter/agentCompileRequest.ts:62`、`compiler.ts:291,302,328`、`serviceCompilation.ts:126`——**不减**（编译器三处是同一函数的三种输入源：首编/修复/重放；`why_not`：分属 AI 编译 / 外部交件 / 重启恢复三条输入路，收成一处会把校验从执行边界挪回收件处，正是 `serviceCompilation.ts:113-118` 注释反对的）。
- `manageModelCatalogConnection`（写 1）：`capabilityCore/dispatcher.ts:780`——**删**（after 0）。
- `resolveAssetIngestionWithFallback`（读 4）：`assetTransportDescribe.ts:63`、`assetTransportRuntime.ts:31`、`customCallDispatch.ts:65,79`——附二删兜底后函数改名 `resolveAssetIngestionDeclared`，读入口数不变。
- `derivePublishedExecution`（写 10）：`apimartGenerationProvider.ts:260`、`generationDefaultModelResolver.ts:56`、`moduleCatalogBootstrap.ts:65`、`catalogStore.ts:292`、`rendererCatalogMutation.ts:94`、`stagedVendorIdentity.ts:97`、`vendorLineageLifecycle.ts:86`、`existingConnection.ts:193`、`modelAvailability.ts:89`、`modelPublication.ts:174`——**不动**（本方案不改发布判据，只改角标派生）。
- 实施前再数：`saveCredential`、`upsertModelCatalogVendor`、`authorizeSubmitDestination`、`joinUrl`（本稿在无 node_modules 的 worktree 里补装后跑了前四个符号；后四个由实施者按 R21.3 跑）。

### 6.3 门岗（R17：加规则先验它会红）

| 门岗 | 判据 | 先验会红的样本 |
|---|---|---|
| `check:credential-origin`（新，进 `gates:contracts`，与 `check:outbound-policy` 同文件族） | ① AST：`baseUrlHint / authType / authHeader / authQueryParam / authScheme / network.proxyUrl` 的写入只许出现在 `catalogStore.ts`（saveCredential 事务）与 `seedBuiltins.ts` / `builtinVendorSeeds.ts`；② MCP `tools/list` 投影里任何 `inputSchema.properties` 不得含这六个名字；③ `vendorOutboundGuard.ts` 必须引用 `credentialBinding` | 今天：`catalogManagement.ts:19-24` 写 `baseUrlHint`（红）；`mcpIntegrationTools.ts:124-129` 广播 `baseUrl/authType/authHeader/authQueryParam`（红） |
| `check:outbound-policy`（现役棘轮） | 不新造分类器：credential-origin 判据必须在 `authorizeOutboundDestination` 同一调用链内 | 在别处写第二个 `url.origin ===` 判断 → 红 |
| 单测「同类问题从旧数据回来」 | 夹具：盘上 catalog 里一条 mapping 的 `create.path` 是别家绝对 URL（模拟手改文件 / 旧版本写入）→ `requestVendor` 拒绝且**未发出** | 回退守卫 → 红 |
| 单测「贴 key 页看得见去向」 | handoff display 对私网 origin 也带 `origin`（改 `safeHandoffOrigin` 语义：显示归显示，公网/私网判归 `handoffQueue`） | 现状 → 红 |
| `check:tool-face`（现役单入口） | 新 3 个工具的五槽描述 / 同格多工具 / 跨格合并 / 措辞门岗 O5 | 把 `show_models` 拆成独立工具 → 红 |
| `check:onboarding-usecases`（#799 搬来） | 零额度契约司机按**广播 schema** 校验每跳，写对率 ≥90%；阳性对照臂 = 冻结的现役 `nomi_integration` schema 快照 | 对照臂不落 55–70% → 夹具坏 |
| `check:vocabularies` | `ModelEvidenceState` 登记；`AdapterModeState` 债不增 | — |

---

## 7. 「已验证」词表横扫（R14.1 七维 · 2026-09-18）

| # | 定义 | 位置 | 含义 | 处置 |
|---|---|---|---|---|
| 1 | `AdapterModeState = queued\|testing\|repairing\|verified\|failed` | `providerAdapter/types.ts:150`（vocab 基线登记为 debt，跨 IPC 多份） | `verified` = **免费自检通过**（09-11 后） | 保留为自检结果词，**不再对用户译成「已验证」** |
| 2 | `AdapterModelMeta.state = unverified\|testing\|verified\|partial\|failed` | `types.ts:262`；写入 `promotionMeta.ts:47,58`、`serviceCatalog.ts:180,249,440,481` | 同上，模型级汇总 | 同上 |
| 3 | `adapter.evidence: "self-check"` | `promotionMeta.ts:59` 写；`useDedupedModelSelect.ts:129` 读 | 发布凭据是自检 → 「未试跑」 | 保留为**发布凭据**；角标不再直接读它（见 8） |
| 4 | i18n `onboardingProviders.adapter.title.readyVerified`「已测试，可以使用」/ `verified`「自动适配已验证」/ `modelState.verified`「已验证」/ `cardStatus.verified`「已验证」 | `onboardingProviders.ts:107-118, 843-866`；驱动 `src/ui/onboarding/modelAdapterDetailState.ts` | 三处把「自检过」说成「已验证 / 已测试」——**这就是双定义**：自检没测过出片 | 文案改「自检通过」；`readyVerified`（已测试可用）只在 `ModelEvidenceState==='produced'` 时出现 |
| 5 | i18n `generationCommon.parameters.untried`「未试跑 / not tried yet」 | `generationCommon.ts:580, 2006` | 模型框角标 | 保留；派生源换成 8 |
| 6 | `antigravity.check.passed`「已验证」 | `antigravity.ts:54` | 登录态自检（另一域） | 不动（不是同一语义） |
| 7 | `ProviderAdapterRegistration.models[].state:"unverified"` | `types.ts:70` | 登记态 | 不动 |
| 8 | **对偶路径**：「最近多次失败」`AilingProbe`（`useDedupedModelSelect.ts:49-60,185`）由真实 run 失败派生；「已出片 N 次」不存在 | 渲染层 | 负面角标有、正面角标无 = 只做了一半（R14.1.a） | **新 owner** `electron/catalog/modelRunEvidence.ts`：单点记录 `{vendorKey, modelKey, taskKind, producedCount, lastProducedAt, recentFailures[]}`（写入点 = `runtime.runTask` 结算处，一扇门）；派生 `ModelEvidenceState = 'untried' \| 'produced' \| 'ailing'`（登记 `check:vocabularies`）；模型框 / 设置卡 / `nomi_read target=models` 三处**只读这一个函数** |
| 9 | #754 分支 `UNVERIFIED_CLAIMS`（`envelope.ts:10-17`） | 分支 | 信封「哪些话此刻没证据」 | 采纳（§4.3），`adapter_compiles` 改名 `declaration_valid`，加 `asset_upload_works` |

结论：**「已验证」= 自检过 与 「已验证」= 出过片 两定义合一**——对用户只剩两个词：「未试跑」/「已出片 N 次 · 何时」（外加负面「最近多次失败」）；「自检通过」只在设置页详情里作为过程信息出现。设置页路与 Agent 路读同一个 `modelRunEvidence` → §8 Q2。

---

## 8. §7 四个结构性问题（只答不修）

**Q1 custom-call（人：任意 JS、能读 key、出站不限）与 providerAdapter（Agent：只声明）两套威胁模型要不要收成一个 owner？**
答：**执行器不收，边界收。** 两条路的「谁写、写什么」应该保持两套（人写脚本 vs Agent/人写声明），因为它们的信任来源不同、且 P1 不允许把脚本路砍掉（它是 `no_generic_contract` 的唯一出口）。但「key 能去哪」今天在脚本路是**没有 owner**的（`customCallRunner.ts:4-6` 注释「刻意不做 SSRF 私网拦截」，key 在 guest 且出站不限）。§6.1 的不变量建在两条路**共用**的最早层——`vendorHttp` → `authorizeSubmitDestination`——之后，脚本再怎么写，带 key 的请求也只能去用户确认过的 origin。所以答案是：**一个凭据边界 owner（绑定 + 出站守卫），两个执行 owner**。`invariant_owner_layer` 写「vendor 出站层 + catalog 凭据绑定事务」，不写 validator（它只是收卡处的发现者）。

**Q2 「已验证」两定义合一后，设置页路的自检与 Agent 路是否同一台机器、同一份词表？**
答：**词表已是同一份**（§7：`ModelEvidenceState` 唯一 owner，三处只读它）。**机器今天不是**：curated 直填 key 走 `validateCandidateCredential.ts:59` + 种子 `livenessProbe`，向导/Agent 走 `selfCheck.probeAdapterCredential`。本方案把 `selfCheck` 声明进卡（§5）之后，两台机器只剩一个差别——探针形状从哪读（种子 vs 卡）——那就该是一台机器：`credentialProbe.run(declaration)`，`validateCandidateCredential` 与 `probeAdapterCredential` 都改成薄壳。派实施时作为 R14.1 收敛项，不是本刀主线；不做也不阻塞验收，但要登 `vocabularies-baseline` 的 debt 并绑到期日。

**Q3 `docs/plan/2026-08-04-custom-call-script.md:4` 引用的研究文件不存在：重建还是删引用？09-11 推荐 B2 落地 B4 的裁决怎么补？**
答：**删引用 + 一条明写裁决，不重建。** 重建一份 08-03 的调研等于伪造出处（R5「凭记忆 = 没查」）；而且它的立论（「声明式够不到异步视频」）已被本仓自己证伪（发现 12）。改法：把该文件第 4-6 行改成「原引用文件从未入库；其立论在 2026-09-11 `AdapterModeDraft.delivery/abandon` 落地后已不成立；脚本路的存在理由收窄为 §5 列出的四类声明表达不了的情况」并链到本方案。B2→B4：在 `docs/plan/2026-09-11-model-onboarding-flow.md` §10 末尾加「**2026-09-12 裁决**：用户拍板 B4（免费自检即发布，标『未试跑』；付费烟测改成第一次真实生成，钱闸在提交处）。§6.B 对 B4『把可用变成谎话』的评语由『未试跑』角标（D4 明标）回答——模型框里不再声称『点了一定能出片』，而是如实说『还没试过』」。这是两行文档改动，随实施 PR 一起走。

**Q4 协议族由 Agent 新增没有先例（业界 = 已知协议下任意 baseUrl）：v1 怎么说？**
答：v1 **不支持新协议族**，但要把「协议族」在本域说准（否则「不支持」和「什么都支持」一样不可证伪）：声明卡能表达的 = 任意 **HTTP + JSON/multipart 请求模板 + 可选轮询 + 可选一步上传初始化**；这已经比业界「3 种文本协议 + 1 种媒体模板」宽（它覆盖 apimart / kie / Higgsfield / Runway / fal 这些内置家的全部形状）。**不支持的**四类见 §5 末段，命中即 `no_generic_contract` 指向脚本路。README 诚实边界原文：「Nomi 的 Agent 接模型能接任何『HTTP 请求 + 轮询』形状的供应商；需要签名、非 HTTP、SDK 或多步编排的，请在设置里手写调用脚本。」这与业界「已知协议下任意 baseUrl」的差别是：我们的『已知协议』是一张可声明的模板，不是一个枚举。

---

## 9. 6 角色评审 + 反方

| 角色 | 判断 | 落到方案的哪一条 |
|---|---|---|
| CTO | 最大风险是把安全边界做成第二个分类器；坚持 `authorizeSubmitDestination` 单入口、`check:outbound-policy` 盯 | §6.1 第三点、§6.3 第二行 |
| 设计 | 贴 key 页多显示一行 origin 不算加摩擦，但**私网也要显示**，否则 LAN 用户根本不知道在给谁 | §6.3 第四行；发现 10 |
| PM | 验收目标失真（Higgsfield 已内置、无 GPT Image 2.5）会让整刀「绿了但没证明北极星」 | §10 重定；§11 Q9 |
| 前端 | 角标派生从 duck-typing 改成单函数，模型框 / 镜卡 / 设置三处必须共用，否则三套心智又来（09-11 B7 教训） | §7 第 8 行 |
| 后端 | `submit_declaration` 一跳三件要**原子**：自检失败不许留半个 vendor（`saveCredential` 已是一个 catalog 事务，登记也要是） | §4.2 `submit_declaration` 行 |
| 真实用户 | 「我给了文档链接，几分钟后模型在框里能出片」；错了要看到「你声明 A，文档第 N 节写 B」——所以 `rejections[].sourceUrl` 必须是**卡上自己声明的那条**，不是我们猜的 | §4.3 |

**反方（对抗评审）**：「一页一按」仍多了一次人的动作——为什么不让 Agent 直接给地址、只让用户贴 key（今天的做法）？答：今天的做法里用户贴 key 时**看不到**地址（私网被剥），且事后 Agent 还能改地址；如果只是把地址显示出来、禁掉事后改，「Agent 给地址 + 用户贴 key」和「用户在页面上确认地址 + 贴 key」在用户手上是**同一个动作**（都是那一页点一次保存）——差别只在实现上把「确认」记成绑定。所以反方成立的部分被吸收：不加第二次确认，只把保存那一下升级成绑定。反方不成立的部分：允许事后改地址——那是 Cherry 铁律的反面，且九家无一家允许 Agent 改。

---

## 10. 验收门（R13 三档 + 任务书 §2 重定）

- **A · 北极星（从零，只用 MCP、不改代码）**：隔离 profile（`prepareIsolation` 灌真 key），外部宿主 = Claude Code。供应商**必须不在 `seedBuiltins`**（发现 7）：默认候选见 §11 Q9。走通：贴 key 页显示 origin → 交卡 → 模型框出现「未试跑」→ 画布出一张图 / 一段视频（报价先出）→ 角标「已出片 1 次」→ `nomi_remove_provider` 一键撤。zh/en 真机截图（贴 key 页、模型框角标、失败信封各一）。
- **B · 内置家加新模型走同一条线**：Higgsfield 连接（内置）上经 `submit_declaration` 加 **Seedance 2.5（bytedance 命名空间）** 一条视频模式并出片（≤ $0.6）；APIMart 上加雷达新报的 `gpt-image-2.5-flare` 出一张图（≤ $1）。证明「手写档案 = 预验证缓存」这句话成立。
- **C · 数字进 PR**：#799 题库工具写对率 ≥90%（先对现役 `nomi_integration` 跑一次阳性对照，落在 55–70%）；回合成功率；三类失败（假必填 / expectedRevision / 等人时只有写动词）各 0；09-15 五道闸逐个「消掉」或「明标」。
- **D · 零额度**：loopback（同源拒绝 ×3：绝对 URL / 上传初始化端点 / 旧数据；静默模板不再发生；`no_generic_contract` 指向脚本路）；`check:credential-origin` 先验会红两处（§6.3）。
- **E · 钱**：Higgsfield 剩约 $4.1，每次 `/estimate` 先看；用完标 `unverified` 停下，不换供应商兜底。
- **F · mcp-ux 留存**：每个 MCP 调用截图 + 原始返回到 `mcp-ux/`（09-17 用户要求）。

---

## 11. Grill 清单（派实施前要用户答的；不回复按默认）

| # | 问题 | 默认 |
|---|---|---|
| Q1 | **地址由用户在贴 key 页确认并绑定**（Agent 只能预填；改地址 = 再走一次那页；MCP 不再有 baseUrl/auth 入参）——接受这一条吗？它是本方案与 v2 任务书最大的差异 | **接受**。理由：Cherry 铁律 + 发现 1 是真实安全洞；用户手上仍只有「那一页按一次」 |
| Q2 | 读侧**不建** `nomi_list_models` / `nomi_await_setup`，并进 `nomi_read target=models` / `target=setup(waitMs)`（`integration` 改名 `setup`） | **并进**。`nomi_list_models` 是退役名（`mcpSurfaceCollapse.test.ts:18`），第二个读入口违反 R14.1 |
| Q3 | 自建/内网端点（`!canHostPublicDocs`）今天静默用 OpenAI 兼容模板。Agent 路改成：返回 `needs_declaration` + 建议「若是 OpenAI 兼容中转，卡可以直接引用内置模板 id `openai-compatible/*`」——即模板变成**Agent 显式选**，不再静默 | **显式选**。设置页填表路保持静默默认（那是人在选「中转站」预设） |
| Q4 | 卡上 `assetIngestion` **必填**（含显式 `none`）；`none` 的模型在参考图路径上诚实报错指向接入页——接受「没声明上传方式 = 卡不合格」？ | **接受**（任务书附二） |
| Q5 | 附二删跨供应商互借 + 匿名图床：前置是给缺声明的内置家（火山图片侧、newapi 中转）补 `AssetIngestion` 并逐家小文件真往返。是**本刀做**还是**单独一刀先做**？ | **单独一刀先做**（它有自己的门表与真往返成本；本刀只删对 Agent 路的兜底调用） |
| Q6 | 卡上 `estimate?: HttpOperation`（真报价）v1 收不收？ | **v1 不收**；报价卡对无价模型显示「价格未知」（D4）。v2 收 |
| Q7 | 两台探针机器（curated `livenessProbe` vs `probeAdapterCredential`）合一：本刀做还是登 debt？ | **登 debt，到期 2026-10-18**；本刀先让卡能声明 `selfCheck` |
| Q8 | 「已出片 N 次」的 owner `modelRunEvidence` 需要在 `runtime.runTask` 结算处加一扇写门；同时把「最近多次失败」的派生也迁过去（今天在渲染层）——一起迁还是只加正面角标？ | **一起迁**（R14.1.a 对偶路径；只加一半又是「做了一半看着完整」） |
| Q9 | 验收 A 的供应商：Higgsfield 已内置且无 GPT Image 2.5。候选 (a) 用户给一家他有 key、不在 `seedBuiltins` 的供应商（中转站 / 自建 new-api 也行）；(b) 在隔离 profile 里先 `nomi_remove_provider higgsfield` 再经卡重接（但 `deriveVendorKeyFromBaseUrl` 会复用内置 key、下次启动 `seedVendor` 会重种，需要实施者先证明不会串） | **(a)**，用户提供；没有则 (b) 并把「删内置后不重种」做成验收断言 |
| Q10 | Higgsfield 上 B 档的视频模型：Seedance 2.5 具体 slug 以 `GET /models` 实查为准（research 只记了命名空间 `bytedance`）——接受实施者按实查定，不预先写死？ | **接受** |
| Q11 | 贴 key 页对私网 origin 也显示（改 `safeHandoffOrigin` 只管显示、不管判定） | **显示** |
| Q12 | `nomi_remove_provider` 删整家时是否连 `suppressedBuiltinModels` 一起写（删内置家 = 永久不重种）？ | **是**，但只对用户显式删的家；升级/重装不视为删 |

---

## 12. 与 v2 任务书的差异（实施者必读）

1. **读侧**：不建 `nomi_list_models` / `nomi_await_setup`；用 `nomi_read target=models` / `target=setup(waitMs)`。工具数 23 不变。
2. **地址与鉴权放法不是 Agent 入参**：`connect_provider` 只能 `suggested`（预填/展示）；`update_vendor` 整个取消，改名/代理开关并入 `connect_provider(vendorKey)`；`delete_model` 并入 `nomi_remove_provider`。
3. **同源不变量的落点**：不是「baseUrl 同源 + 声明里列出的上传 host」白名单，而是「**带 key ⇒ 同源**；不带 key 的第二步上传走既有私网策略」——白名单会把预签名 S3 这类**动态**目标（Higgsfield）判死。
4. **验收目标重定**：Higgsfield 已内置、无 GPT Image 2.5（§10 A/B 拆两档；§11 Q9）。
5. **卡上多三格**：`selfCheck`（LiteLLM 形状，本仓种子已有）、`assetIngestion` 必填含显式 `none`、`omitted[]`；`estimate` 留 v2。
6. **静默模板**改为 Agent 显式选（Q3）。

## 13. 派工要点（给 Opus 实施的一行头）

档位：Opus · 新供应链 + 要判断。先跑 `delivery:preflight`；R21 `recurring` 合同一份（`docs/fixes/2026-09-18-credential-destination-is-user-confirmed.root-cause.json`：`invariant_owner_layer` = vendor 出站层 + catalog 凭据绑定事务；`doors` 用 §6.2 + 实施时再数四个符号）；验证档 focused + contracts + 自己 1–2 条 E2E；不进 gates 锁；不 push、不 PR、不 stash、不 `--no-verify`；供应商字段以文档 URL 为准（凭记忆 = 没查）。
