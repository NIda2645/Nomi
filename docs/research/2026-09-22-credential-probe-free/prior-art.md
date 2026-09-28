# 2026-09-22 凭据验证的付费边界 · 先查别人报告

> 方案：docs/plan/2026-09-22-credential-probe-free.md
> 根因合同：docs/fixes/2026-09-22-credential-probe-paid-without-consent.root-cause.json
> 要回答的问题：「点一次保存验证要不要花用户的钱」这件事，依赖里 / 仓里 / 生态里 / 真实用户那儿，
> 已经有人做过了吗？做成什么形状？

## ① 依赖里已有？

**没有可用的现成件。**

- `electron`：`safeStorage`（`node_modules/electron/electron.d.ts` 里的 `safeStorage.encryptString`）只管
  凭据**怎么存**，不管**怎么验**，更不表达「验它要花多少钱」。
- `ai` / `@ai-sdk/*`：`node_modules/@ai-sdk/provider/dist/index.d.ts` 的 `ProviderV3` 只有
  `languageModel/textEmbeddingModel/imageModel` 三个工厂，**没有** `validateCredential` 这类端点，
  也没有任何「这次调用花多少」的声明位。SDK 的立场是「发出去才知道」。
- `undici` / `zod` / 传输层依赖：与本题无关（它们不知道请求的价钱）。

结论：依赖里**没有**「凭据探测 + 价格声明」的概念，必须自研声明位。

## ② 仓库里已有？

有三块可复用，**都复用了**，所以这一刀没有新造任何一张卡、任何一份报价逻辑：

| 已有的 | 在哪（file:line） | 本刀怎么用 |
|---|---|---|
| 付费确认卡（全仓唯一一张） | `src/workbench/generationCanvas/spend/spendConfirm.ts:57`（`SpendConfirmRequest`）、`src/workbench/capability/capabilityApplyHandler.ts:154`（`confirmSpendFromMainProcess`） | 加一个 `intent: 'credential-probe'` 分支，措辞另立一家（`credentialProbeSpendCard.ts`），卡本身不动 |
| 报价 owner | `electron/spendQuote.ts:9` `quoteSpendLine` | 直接调它算金额；算不出价回 `amount: null`（卡上显示「未知价」，不兜底成 0/免费） |
| 主进程 → 渲染层的问人通道 | `electron/capabilityCore/rendererBridge.ts:1-11`（文件头「付费确认走它时：confirmed=true 只可能来自渲染层那条 reply」） | 原样走它，信任边界不破；渲染层不可达 → fail-closed |
| 种子声明位 | `electron/catalog/builtinVendorSeeds.ts` `VendorSeed.livenessProbe` | **不复用**：它是每周雷达的逐模型存活探针（见 §④ 结论），本刀给凭据探测单开 `credentialProbe` |

反例也在仓里，正是本题的价值：`electron/vendor/vendorBaseFallback.ts:11-12` 实测注释说
apimart 对无鉴权 `GET /v1/models` 恒 401，所以**不能**拿模型列表当它的 key 判据——
这条正是 TODO T-MO-10 的 09-17 裁决要求「实测证伪一次」的那条。

`git grep -n "grantId" electron/ | head` 显示付费闸只长在 `runtime.ts` / `spendGrant.ts` 那条链上，
而凭据探测走 `electron/appFetch.ts` 直接出门——**结构上**够不到那道闸。这不是漏挂，是两条路。

## ③ 生态里已有？

同类工具怎么验 key、怎么处理「验证要不要花钱」：

| 项目 | 做法 | 出处 |
|---|---|---|
| LiteLLM | `/health` 与 `/health/readiness` 分开：前者**真打上游**（文档明写「makes a call to the model」并提示成本），后者只查本地配置；还提供 `health_check_model` 让运维指定一个便宜模型 | <https://docs.litellm.ai/docs/proxy/health> |
| OpenAI 官方 | `GET /v1/models` 免费且按 key 鉴权，是文档推荐的「key 是否有效」检查 | <https://platform.openai.com/docs/api-reference/models/list> |
| Anthropic 官方 | `GET /v1/models` 同上（需 `anthropic-version` 头） | <https://docs.anthropic.com/en/api/models-list> |
| OpenRouter | 专门给了 `GET /api/v1/key`（查这把 key 的额度与限流），不必发生成请求 | <https://openrouter.ai/docs/api-reference/limits> |
| APIMart | `GET /v1/balance` 查这把 token 的余额；本刀实测假 key 与无鉴权都回 401 | <https://docs.apimart.ai/en/api-reference/account/token-balance.md> |

**共识形状**：业界普遍认为「验 key」应当走一个免费的账户/目录端点；**只有在没有这种端点时**
才退到真实调用，且退到真实调用时会明说它要花钱（LiteLLM 的 `/health` 文档就是这么写的）。
这与用户 09-22 的拍板逐字同形：免费优先 → 无免费则先问。

我们比 LiteLLM 多做的一步：把「这个探测花不花钱」写成**声明的一部分**（`credentialProbe.cost`）、
缺省 fail-closed。LiteLLM 那边这件事仍然靠运维读文档、自己配 `health_check_model`。

## ④ TikHub 自媒体里怎么说？

**本次没用 TikHub，因为**这一题不是「用户想要什么形状的功能」，而是「一个具体供应商的具体端点
收不收费」——它的权威源只有官方 API 文档与一次真实的对照实验（假 key vs 无鉴权），
自媒体内容既不构成证据、也无法证伪。本刀的关键事实全部来自 §③ 的官方文档 + 2026-09-22 的实测：

```
GET https://api.apimart.ai/v1/balance   Authorization: Bearer sk-this-is-not-a-real-key-000000
→ 401 {"error":{"message":"invalid API key (request id: …)","type":"apimart_error"}}

GET https://api.apimart.ai/v1/balance   （不带 Authorization）
→ 401 同上
```

## ⑤ 结论：用已有 / 自研 + 理由

- **确认面、报价、问人通道：用已有**（仓里三处，逐条见 §②）。这一刀一张新卡都没造。
- **「这个探测花不花钱」的声明位与它的唯一读者：自研**。依赖里没有这个概念（§①），
  生态里最接近的 LiteLLM 也只做到「分两个端点 + 在文档里提醒」（§③），没有把价格变成
  机器可判的声明。而本仓真正付过学费的恰恰是「没写下来的免费」：T-MO-20 把 Higgsfield 的
  `POST /marketing-studio/image` 当余额探针，当场烧掉 $0.439。所以声明位 + 缺省 `paid` +
  装配期不变量（声明成 free 的端点不许长成生成提交）这三样是本刀的自研部分，也是它的全部。
- **端点选择：用已有的官方免费端点**（APIMart `GET /v1/balance`、Higgsfield `/estimate`），
  不自己发明探测方式，且每条都带官方出处与实测对照组。
