# 凭据验证走免费探测；没有免费端点就先问（2026-09-22）

> 状态：🚧 现行 · 分支 `fix/credential-probe-free-20260922`（基线 `origin/main` @ 60b7f0b3b）
> 用户拍板（2026-09-22，TODO T-MO-10）：① 能用免费端点就用；② 没有免费端点时**不再静默发付费请求**，
> 走既有的报价卡问一句（金额如实、说明这是验证请求），同意才发；③ 09-21「无 key 也能写完并校验整份配置，
> key 只在真试跑前需要」不许倒退。

## 0. 一句话

用户在接入页点「保存验证」，我们当场替他发了一次真实生成并扣了他的积分，而那条路在结构上
**永远不可能**出现报价卡。本刀把「这把 key 怎么验、验它花不花钱」收成一份策略，
免费的直接验、要花钱的先问。

## 1. 真实摩擦（09-11 群反馈）

用户粘上 APIMart 的 key，点「保存验证」。按钮上写的是「保存验证」，没有一个字提到钱。
`probeDirectKeyCredential` 当场发出 `POST /api/v1/chat/completions`（`max_tokens:1`）——
一次**真实生成**，扣的是他的积分。他没同意过，也没看见任何报价。

## 2. 类根因

「这次出站会不会花用户的钱」这个判断，**没有 owner**。

付费的闸（用户 2026-09-09 拍板「每次提交看报价确认」）挂在 `runtime.ts` → `grantId` 那条链上。
凭据探测走 `appFetch` 直接出门，不碰 `runtime.ts`，没有 `grantId`——于是报价卡不是「忘了弹」，
而是**在结构上不可能弹**。而「花不花钱」这件事当时只存在于一句注释里
（`builtinVendorSeeds.ts` 原话「Paid only by the weekly radar」，09-17 已核实为假话）。

注释不是判据。没写成判据的「我以为它免费」，在 T-MO-20 上已经真金白银付过学费：
把 Higgsfield 的 `POST /marketing-studio/image` 当余额探针，它只要 prompt 就真排任务，当场烧掉 $0.439。

## 先查别人

报告全文：`docs/research/2026-09-22-credential-probe-free/prior-art.md`（四问齐全）。结论摘要
（每条都带出处；`file:line` 与 URL 为准）：

- **依赖里已有？没有。** `node_modules/@ai-sdk/provider/dist/index.d.ts:1` 的 `ProviderV3` 只有三个模型工厂，既没有 `validateCredential` 这类端点，也没有「这次调用花多少」的声明位；`node_modules/electron/electron.d.ts:1` 的 `safeStorage` 只管凭据怎么存，不管怎么验。
- **仓库里已有（付费确认卡 → 复用）**：`src/workbench/generationCanvas/spend/spendConfirm.ts:57` 与 `src/workbench/capability/capabilityApplyHandler.ts:154` 已经是全仓唯一那张卡，本刀只加一个 `intent` 分支，不造第二张。
- **仓库里已有（报价与问人通道 → 复用）**：`electron/spendQuote.ts:9` 的 `quoteSpendLine` 是唯一报价 owner；`electron/capabilityCore/rendererBridge.ts:11` 的文件头写明「付费确认走它时 confirmed=true 只可能来自渲染层那条 reply」，信任边界照旧。
- **仓库里已有（反例）**：`electron/vendor/vendorBaseFallback.ts:12` 的实测注释说 apimart 对无鉴权 `GET /v1/models` 恒 401——所以模型列表**不能**当它的 key 判据，这正是 09-17 裁决要求实测证伪的那条。
- **生态里已有（共识形状）**：LiteLLM 把「真打上游、文档明说要花钱」的 `/health` 与只查本地配置的 `/health/readiness` 分开，并让运维指定便宜模型 <https://docs.litellm.ai/docs/proxy/health>。
- **生态里已有（免费 key 判据）**：OpenAI <https://platform.openai.com/docs/api-reference/models/list>、Anthropic <https://docs.anthropic.com/en/api/models-list>、OpenRouter 的 `GET /api/v1/key` <https://openrouter.ai/docs/api-reference/limits>、APIMart 的 `GET /v1/balance` <https://docs.apimart.ai/en/api-reference/account/token-balance.md> —— 全都免费且按 key 鉴权。
- **TikHub 自媒体？本次没用**，因为这一题的权威源只有官方文档与一次真实对照实验（假 key vs 无鉴权，见 §4），自媒体内容既不构成证据也无法证伪；详见 `docs/research/2026-09-22-credential-probe-free/prior-art.md`。
- **结论：确认面 / 报价 / 问人通道用已有，声明位自研。** 自研的只有 `credentialProbe.cost` 这个声明位、它的唯一读者 `electron/catalog/credentialProbePolicy.ts:56`，以及缺省 `paid` + 装配期不变量这两道 fail-closed——生态里最接近的 LiteLLM 也只做到「分两个端点 + 在文档里提醒」，没把价格变成机器可判的声明 <https://docs.litellm.ai/docs/proxy/health>。

## 2.8 顺带分家的一件事：`livenessProbe` 曾经兼职

`VendorSeed.livenessProbe` 原本同时回答两个问题：

1. **每周雷达**问的「这个模型这周还活着吗」——按定义就得真发一次最小生成，也该由
   `scripts/model-liveness.ts` 那条每周任务付钱；
2. **接入页**问的「这把 key 能不能用」——不必发生成。

合用一个声明位，第二个问题就**继承了第一个问题的价格**。所以本刀给凭据探测单开
`VendorSeed.credentialProbe`，两条各自带 `cost` 与出处；apimart 的 `livenessProbe`
原样留给雷达（并如实标 `cost: 'paid'`），凭据侧换成免费的 `GET /v1/balance`。

## 3. 改法：一份「探测策略」，三档

`electron/catalog/credentialProbePolicy.ts` 是唯一分派点：

| 档 | 谁落在这 | 行为 |
|---|---|---|
| `seed-probe` + `cost:'free'` | apimart（`GET /v1/balance`）、higgsfield（`POST /estimate/...`），均由 `credentialProbe` 声明 | 直接发，不打扰用户 |
| `seed-probe` + `cost:'paid'`（**含缺省**） | 种子声明了端点却没说它免费的 | 先经确认面问一句；没同意 / 问不到人 → `declined`，**一个字节都不发** |
| `model-list`（免费） | 没有内置种子的行（自定义供应商 / 用户自建中转 / 认证晋升候选） | `GET /models`，零费用 |
| `first-use`（免费） | 内置家里没有便宜且可信的预检的 12 家 | 不发请求，判据留给首次真实调用的诚实报错 |

**缺省 fail-closed**：种子没写 `cost` 就按付费办。理由见 §2 末段——免费必须有出处地声明，不能靠默认。

## 4. APIMart 的免费端点（实测，不是猜的）

TODO 09-17 裁决要求「合法 key 不 401 要实测一次」，因为仓里现有证据说的正相反
（`vendorBaseFallback.ts` 注释：apimart 对无鉴权 `GET /v1/models` 恒回 401）。

实测（2026-09-22，只发 GET、不生成）对 `GET https://api.apimart.ai/v1/balance`：

| 用什么 key | HTTP | 响应体 |
|---|---|---|
| 假 key `sk-this-is-not-a-real-key-…` | 401 | `{"error":{"message":"invalid API key …","type":"apimart_error"}}` |
| 完全不带 `Authorization` | 401 | 同上 |

即这个端点**按 key 判**（不是 `/v1/models` 那种无差别 401），所以「401/403 → key 无效」这条判据
在它上面成立。成功判据取 `remain_balance`（官方文档：`message` 只在失败时出现；无限额度时它是 `-1`，仍非 null）。

出处：<https://docs.apimart.ai/en/api-reference/account/token-balance.md>（2026-09-22 核）。

## 5. 付费档怎么问

走**全仓唯一**那张付费确认卡：主进程 `requestRendererDecision('spend.confirm', …)`
→ 渲染层 `useSpendConfirmStore`。新增 `intent: 'credential-probe'` 分支，只换措辞，不造第二张卡。

两处刻意的取舍：

- **不铸令牌**。`confirmSpendAndMintGrant` 那条链的下游是 `runTask` 的硬闸——令牌按节点记预算、
  由生成调用消费。凭据探测没有节点、不经 `runtime.ts`，铸一颗没人消费的令牌只会在预算账上
  留一笔假授权。所以只复用同一个**报价 owner**（`quoteSpendLine`），不碰 grant。
- **拒绝 ≠ 失败**。用户说「不发」，密钥照存（标未验证），判据留给首次真实调用。
  把它当失败等于「不付这一下钱就别想接入」。

## 6. 首用前的复验

`revalidatePendingCredential` 对付费档**直接早退**：会花钱的探测只由用户显式点「保存验证」发起。
首用前那一下是我们自己挑的时机，不该在那里横插一张付费确认卡——而且判据本来就有，
就是紧接着的那次真实调用。

## 7. 接入页文案

按钮上方一句如实的说明，四种情形各说各的：免费验证 / 预计消耗 N 额度 / 这家没填价所以说不准 /
读不到这家的验证方式。料源是主进程那份策略经 `nomi:model-catalog:credential-probe-plan` 投影，
渲染层不第二次判。**问不到时不许默认显示「免费验证」**——不知道就不许说免费。

## 8. 没做 / 留给下一刀

- `electron/ai/onboarding/onboardingIpc.ts` 的 `probeOneProtocol`（自定义供应商「测试连接」/ 协议
  自动探测）同样发真实 `POST /chat/completions`，是本概念的第 5 扇门。本刀**没改它**，
  理由与去向见根因合同的 `same_class_entry_points`。
- `electron/providerAdapter/service.ts` 的 "Model self-check"（认证流程的真实生成自检）在另一条
  会话的改动面上，按避让约定只读不改。

## 9. 门岗

typecheck · `electron/catalog` 全量 vitest · `check:root-cause-contracts` · `check:door-map` ·
`check:spend-receipt` · `check:outbound-policy` · `check:credential-origin` · `check:i18n` · `check:walkthroughs`。
