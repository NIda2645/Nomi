# 连接身份 = 域名 + 连接名（GitHub issue #831）

状态：**已实施**（第二段完成；下方「实施后的偏差」记录方案与落地的出入）
分支：`fix/vendor-connection-identity-20260922` · worktree `/Users/aoqimin/Desktop/Nomi-fix-831-0922`
Issue：https://github.com/aqm857886159/Nomi/issues/831

---

## 1. 背后逻辑与摩擦（D6）

### 用户现在卡在哪

报告人 dreamcolor123 在一个中转站买了**三个分组**，它们地址完全一样、只有 Key 不同：

| 他心里的「连接」 | Base URL | Key | 这把 Key 能调什么、什么价 |
|---|---|---|---|
| 满血组 | `https://xxx` | Key A | 多个 Seedance 模型，倍率 0.95 |
| Mini 特价组 | 同上 | Key B | 只有 `seedance-2.0-mini`，倍率 0.4 |
| Fast 特价组 | 同上 | Key C | 只有 `seedance-2.0-fast`，倍率 0.6 |

他按 Nomi 的「添加连接」加第二个，填了新名字、新 Key，保存 —— **第一个连接的名字和 Key 被当场改掉了**，三个分组变成一个。更糟的是第一个连接下已经接好的模型还在，于是它们现在拿着「Mini 特价组」那把只能调 mini 的 Key 去跑满血模型：要么直接 401，要么算错钱。

用户原话：「这些是需要同时保留的独立连接，不是替换旧 Key。」

### 为什么会这样（一句话）

Nomi 里**一条连接的身份就是它的域名**。`deriveVendorKeyFromBaseUrl`（[electron/catalog/catalogCommit.ts:400](../../electron/catalog/catalogCommit.ts):400-420）只看 hostname；两条连接同一个 host，算出来就是同一个 `vendorKey`。而 `vendorKey` 是全系统的主键：模型挂在它下面、Key 存在 `apiKeysByVendor[vendorKey]`、报价和生成都按它路由。所以第二次保存不是「新增一行」，是「覆盖那一行」——`serviceCatalog.register`（[electron/providerAdapter/serviceCatalog.ts:106](../../electron/providerAdapter/serviceCatalog.ts):106-157）拿同一个 key 做 `upsertVendor` + `upsertApiKey`，名字和 Key 一起被后来者顶掉。

这个设计当初是刻意的：设计文档写得很清楚「同 host = 同 vendor，name 只作显示」（[docs/plan/onboarding-baseurl-entry.md:84](./onboarding-baseurl-entry.md)、[docs/plan/2026-06-29-model-fetch-pick-confirm.md:54](./2026-06-29-model-fetch-pick-confirm.md)）。它服务的是「同一个用户重复接同一家，别在目录里长出两个柜子」。代价当时没人付；中转站分组一来，代价全落在用户身上。

### 真正要权衡的那一个点

> **一条连接的身份，是「你连的是哪台服务器」，还是「你在那台服务器上的哪个身份」？**

现在选的是前者。issue #831 说明前者不成立 —— 同一台服务器上，一把 Key 就是一种权限 + 一种价，那才是用户心里的那条「连接」。用户 2026-09-22 已拍板走后者：**域名 + 连接名**。

拍板的具体形状（不再改）：

1. **连接身份 = 域名 + 连接名**。创建时派生一次 key（`<hostKey>--<slug(name)>`），**第一个连接保持现有 hostKey 不变 → 存量目录零迁移**。同域名同名 = 更新那条连接的 Key；不同名 = 新的独立连接。改名不换 key。
2. **模型选择器只在重名时**把供应商 chip 换成「连接名」，其它情况显示不变（R2 信息密度）。
3. **添加连接表单**在域名撞上已有连接时，**内联一行**说明（不弹窗、不拦保存）。

### 这不只是一个 bug，是一个类根因（P2）

派生身份在**一处**（`deriveVendorKeyFromBaseUrl`），但「这条 vendor 是不是 apimart / kie / …」的判断**散在 15+ 处字面量比较**里（`vendor.key === "apimart"`）。一旦内置家也能有第二条连接（key 变成 `apimart--mini`），这 15 处全部认不出它 —— 症状会是「接了 APIMart 特价组，但图生图/上传通道全没了」。所以这次必须把「是不是某个内置家」的判断收进**一个共享 helper**，15 处调用点全换过去，不留一处字面量（P1 无并行版）。

---

## 2. 范围 / 不动项 / 回滚 / 验收门

### 范围（本次要改）

| 层 | 文件 | 改什么 |
|---|---|---|
| 身份派生 | `electron/catalog/catalogCommit.ts` | `deriveVendorKeyFromBaseUrl` 旁边加 `deriveConnectionVendorKey(baseUrl, connectionName, existingKeys)`；旧函数保留为「host 段」的 owner，不再单独当身份 |
| 注册 | `electron/providerAdapter/registration.ts` | 新连接走新派生；`catalogVendorKey` 给定时仍按它（= 编辑既有连接） |
| 目录写入 | `electron/providerAdapter/serviceCatalog.ts` | `register` 不再把「同 host 的另一条连接」当 existingVendor / 候选源 |
| 候选隔离 | `electron/catalog/stagedVendorIdentity.ts` | `planStagedVendorIdentity` 的 lineage 只在**同一条连接**内找前任，不跨兄弟连接 |
| 内置身份解析 | `electron/shared/`（新建 `builtinVendorIdentity.ts`） | 共享 helper：`resolveBuiltinVendorKey(vendors, vendorKey)` / `isVendorOfBuiltin(...)` |
| 15 处字面量 | 见 §4.4 | 全换成 helper |
| 模型选择器 | `src/config/modelIdentity.ts` 的投影层 | 重名时加「· 连接名」后缀，只算一处 |
| 添加表单 | `src/ui/onboarding/OnboardingWizard.tsx` | 域名撞上已有连接时的内联一行 + zh/en 文案 |
| i18n | `src/i18n/locales/modelSetup.ts` | 两条新串（zh/en） |

### 不动项（硬约束，跨会话）

- **`electron/catalog/catalogStore.ts`**：「读入失败不覆盖写回」那段与导入/导出相关函数**不碰**（另一会话改过）。本次只可能新增读取，不改写回策略。
- **`src/workbench/settings/AiModelsSection.tsx`**：供应商列表/添加 UI 可动，**导入导出两颗按钮不挪位**。
- **供应商偏好两把尺**（`orderByVendorPreference` [electron/shared/contracts/vendorPreference.ts:24](../../electron/shared/contracts/vendorPreference.ts):24、`pickImplicitVendorMatch` [src/config/modelIdentity.ts:175](../../src/config/modelIdentity.ts):175）：另一会话正在把它们收成一份，**本次一行不改**。只需确认新 key 在两把尺下都按 key 隔离（见 §4.7）。
- **不新增**对 `src/config/modelArchetypes/...` 的 import（已搬到 `electron/shared/modelArchetypes`）。
- Core-A 会话确认 `electron/providerAdapter/{registration,serviceCatalog,service}.ts`、`electron/catalog/{catalogCommit,stagedVendorIdentity}.ts` 它没动，可以改。

### 回滚

单 PR、单 commit 边界。回滚 = revert 该 PR：新 key 规则只在**新建连接**那一刻生效，存量连接的 key 一个字都没动（第一条连接仍是 hostKey），所以 revert 后存量目录照常可读；revert 前建的「第二条连接」会退化成一条 hostKey 认不出的孤儿 vendor 行 —— 在 PR 描述里写明「回滚前请先删掉同域名的第二条连接」。

### 验收门

见 §6。

---

## 先查别人

四问：依赖里已有？仓库里已有？生态里已有？TikHub 怎么说？下面每条都带出处（实查，不是凭记忆）。

- **仓库里已有（可复用，别再造）**：`electron/shared/vendorLineage.ts:88` 的 `resolvedVendorLineageRoot(vendors, vendorKey)` 已经是「从任意 vendor key 解析回它的血统根」的**唯一** owner，`electron/catalog/stagedVendorIdentity.ts:137`、`electron/catalog/catalogCommit.ts:413` 都已走它。**本次的「这是不是 apimart」helper 必须建在它之上**，不许平行再造第二套 lineage。
- **仓库里已有（现成的反面教材）**：`electron/catalog/stagedVendorIdentity.ts:45` 的 `stagedVendorKey()` 已经在做「同一个 root 下派生兄弟 key」的事，且注释明写「without deriving identity from secret material」—— 但它的语义是**替换候选**（supersede / lineage 前任），不是**共存**。本次新增的连接 key 必须走另一条分支，不能复用它的 `--candidate-<hash>` 形状，否则 `planStagedVendorIdentity`（同文件 :177-222）会把兄弟连接当成待淘汰的候选删掉。
- **生态里已有（最贴近的一份，值得抄形状）**：Cherry Studio 的 `Provider` 把三件事拆成三个字段 —— `id`（身份）/ `name`（显示）/ `presetProviderId`（它属于哪个内置预设），见 https://github.com/CherryHQ/cherry-studio/blob/main/src/shared/data/types/provider.ts#L237-L243 。自定义 provider 的 id 是 `const providerId = uuid()`（https://github.com/CherryHQ/cherry-studio/blob/main/src/renderer/pages/settings/ProviderSettings/ProviderList/useProviderEditor.ts#L140 ），**和 Base URL 完全无关**；删除逻辑用 `presetProviderId === providerId` 判断「这是不是内置那条本尊」（https://github.com/CherryHQ/cherry-studio/blob/main/src/main/data/services/ProviderService.ts#L969-L997 ）。→ 这正好是我们要的：**身份 / 显示名 / 内置血统三个字段各归各位**，「是不是 apimart」查血统字段而不是查 id 字面量。
- **生态里已有（同一个需求的另一种解法，实测不够用）**：Cherry Studio 后来给 provider 加了**多 Key**（`ApiKeyEntrySchema { id: uuid, key, label, isEnabled }`，https://github.com/CherryHQ/cherry-studio/blob/main/src/shared/data/types/provider.ts#L58-L67 ；UI 在 `ProviderApiKeyListDrawer.tsx`），闭掉的是 https://github.com/CherryHQ/cherry-studio/issues/14771 —— 但那几把 Key 是**互为备份轮换**用的（`src/main/ai/runtime/aiSdk/retry/buildApiKeyFallbackModels.ts`），**共享同一份模型清单**。#831 要的恰恰相反：每把 Key 各有各的模型清单和倍率。→ **反方结论：多 Key 挂一个 provider 解决不了 #831**，只会让「哪把 Key 跑了哪个模型」变得不可解释，别照抄。
- **生态里已有（把 Key 放进身份的坑）**：LiteLLM 的每个 deployment 就是 `model_list` 里的一行，同 `api_base` 不同 `api_key` 天然是两行（https://docs.litellm.ai/docs/proxy/configs ）；没写 `model_info.id` 时由 `generate_model_id(model_group, litellm_params)` 哈希出来（https://github.com/BerriAI/litellm/blob/main/litellm/router.py#L8602-L8617 ），而 `litellm_params` **包含 api_key**。→ **反方结论：把 Key 哈希进身份，换一次 Key 就换一条身份**，历史/计价/偏好全断。我们的 `stagedVendorKey` 早就刻意排除了密钥（stagedVendorIdentity.ts:123 的注释），新规则必须同样只用「域名 + 连接名」，**不含 Key**。
- **生态里已有（用数组下标当身份的坑）**：Open WebUI 的 OpenAI 连接是两条平行数组（`OPENAI_API_BASE_URLS` / `OPENAI_API_KEYS`），身份就是下标 `url_idx`：`get_openai_connection(idx)` 直接 `api_base_urls[idx]` / `api_keys[idx]`，而 per-connection 配置查的是 `api_configs.get(str(idx), api_configs.get(url, {}))` —— 那个「查不到下标就退回按 url 查」的兜底就是迁移疤（https://github.com/open-webui/open-webui/blob/main/backend/open_webui/routers/openai.py#L338-L343 ）。→ **反方结论：序号身份删一条就全体错位**；我们要的是稳定的、可读的、和顺序无关的 key。
- **生态里已有（用户心智的参照）**：one-api / new-api 的 `Channel` 就是用户嘴里那条「分组」：`Id`（自增代理键）+ `Name`（显示）+ `BaseURL` + `Key` + `Models`（CSV）+ `Group`（计价分组），见 https://github.com/songquanpeng/one-api/blob/main/model/channel.go#L21-L43 。**BaseURL 从来不是身份**，两个 channel 共用同一个 BaseURL 是日常。报告人说「独立的连接 ID」，脑子里就是这个 Channel。
- **TikHub / 自媒体**：本轮没查（这是工程内部身份建模，不是产品形态取舍，自媒体侧没有可采信的一手材料）。**这一条诚实记为未查**，不假装查过。

**综合结论**：采用 Cherry Studio 的三字段分离（身份 / 显示名 / 内置血统），但身份不取 uuid 而取「域名 + 连接名 slug」—— 因为我们有存量目录要零迁移（uuid 做不到「第一条连接保持现有 hostKey」），而且可读的 key 让导出/排查/偏好列表都能看懂。血统那一格**复用仓库已有的 `vendorLineage`**，不另造。

---

## 3. 门表（R21.3）

### `node scripts/door-map.mjs deriveVendorKeyFromBaseUrl`（机器生成，2026-09-22）

```
写入口 5 扇 · 读入口 0 扇 · 共 5 扇（7 处出现）
  [write] electron/integrationCertification/httpModelDiscovery.ts:21
  [write] electron/integrationCertification/integrationSession.ts:207 / :984 / :1184
  [write] electron/integrationCertification/service.ts:157
  [write] electron/providerAdapter/registration.ts:42
  [write] electron/providerAdapter/service.ts:195
```

```json
[
  { "kind": "write", "path": "electron/integrationCertification/httpModelDiscovery.ts", "symbol": "deriveVendorKeyFromBaseUrl" },
  { "kind": "write", "path": "electron/integrationCertification/integrationSession.ts", "symbol": "deriveVendorKeyFromBaseUrl" },
  { "kind": "write", "path": "electron/integrationCertification/service.ts", "symbol": "deriveVendorKeyFromBaseUrl" },
  { "kind": "write", "path": "electron/providerAdapter/registration.ts", "symbol": "deriveVendorKeyFromBaseUrl" },
  { "kind": "write", "path": "electron/providerAdapter/service.ts", "symbol": "deriveVendorKeyFromBaseUrl" }
]
```

五扇门都是「从 baseUrl 算一个 vendorKey 出来」。**其中只有 `registration.ts:42` 是「创建连接」那一刻**；其余四扇是「拿 baseUrl 反查我刚才存的那条连接」—— 一旦身份不再由 baseUrl 唯一决定，这四扇就**不能再靠 baseUrl 反查**，必须改为沿用调用方手里的 `catalogVendorKey`，取不到就报错而不是猜一个。这条是本次最容易漏的门。

### 第二族门：`vendorKey` 字面量比较（手工补齐，door-map 不扫字符串常量）

探针（改前必红，已在 2026-09-22 于 `origin/main` 实跑，**24 处命中**，其中 15 处是生产判据）：

```bash
grep -rnE "(\.key|vendorKey|providerId|targetVendor|modelVendor)[[:space:]]*(===|!==)[[:space:]]*['\"](apimart|kie|volcengine|dreamina|dreamina-member|codex-local|antigravity-cli|replicate|minimax|higgsfield)['\"]" \
  electron src --include='*.ts' --include='*.tsx' | grep -vE '\.test\.|__tests__'
```

清单见 §4.4。

### 判定：`recurring`

理由：身份派生在一处、而「这是不是某个内置家」的判断散在 15 处，每一处都是同一条不变量的独立复本。今天改的是 apimart/kie 两家；明天任何一个新内置家、或任何一个新写的 `=== 'xxx'` 都会把同一个 bug 带回来。→ 实施阶段必须提交 schema-v3 根因合同 `docs/fixes/2026-09-22-vendor-connection-identity.root-cause.json`（形状参照 [docs/fixes/2026-09-22-card-face-over-own-ports.root-cause.json](../fixes/2026-09-22-card-face-over-own-ports.root-cause.json)），必答 `invariant_owner_layer` 并带上面两份门表。

---

## 4. 设计

### 4.1 key 派生规则

```
newConnectionVendorKey(baseUrl, connectionName, takenKeys):
  host = deriveVendorKeyFromBaseUrl(baseUrl)      // 不变，仍是内置 host → 内置 key 的那一份
  if host not in takenKeys:        return host                    // 第一条连接 = 今天的行为，零迁移
  slug = slugify(connectionName)                                   // [a-z0-9-]，折叠连写、去首尾 -，截断 24
  if slug is empty:                slug = "c"                      // 名字全是符号/表情时的兜底
  candidate = `${host}--${slug}`
  if candidate not in takenKeys:   return candidate
  // 同域名同名 → 这就是「更新那条连接」，调用方把它当 catalogVendorKey 传回去，不在这里造新 key
  return candidate                                                 // 命中既有 = 复用，不加后缀
```

要点与理由：

- **分隔符用 `--`**，和 `stagedVendorKey` 的 `${root}--candidate-<hash>` 同一族形状，`resolvedVendorLineageRoot` 那条「从 key 反查 root」的路走得通；单 `-` 会和 host 自己的连字符混淆（`gw-example-com`）。
- **slug 只取连接名，不取 Key**（LiteLLM 的坑，见「先查别人」）。
- **改名不换 key**：key 只在创建那一刻派生一次，之后存进 `vendor.key` 就是它。改名只改 `vendor.name`。代价：key 里的 slug 可能和现在的名字对不上 —— 接受，因为「改个名字把所有模型/偏好/历史换主键」代价大得多。这一点必须在代码注释里写死，防止后人「顺手」让它跟着改。
- **碰撞**：同 host + 同 slug = 同一条连接（这是拍板 1 的直接后果：同域名同名 = 更新那条）。所以**不需要** `-2` 后缀。唯一的灰区是「两个不同的名字 slug 化后撞车」（`满血组` / `满血-组`）—— slug 保留中日韩字符的 punycode 化会让 key 不可读，因此规则是：**slug 化后撞车 = 视为同名**，UI 在提示行里就已经告诉用户「这个地址已经有连接 X」。实施时用一条测试钉死这个行为，别让它变成静默覆盖。

### 4.2 lineage root 怎么登记

**复用 `vendorLineage.ts` 现有字段，不新增。** 新连接写 `ADAPTER_CANDIDATE_ROOT_VENDOR_KEY = host`（[electron/shared/vendorLineage.ts:4](../../electron/shared/vendorLineage.ts):4），**不写** `ADAPTER_CANDIDATE_SOURCE_VENDOR_KEY`。

理由：

- `resolvedVendorLineageRoot`（同文件 :88-104）的循环是「有 explicitRoot 就返回它，否则看 source 继续往上爬」。只写 root 不写 source，`apimart--mini` 一步就解析回 `apimart`，正是我们要的。
- `isCandidateVendor`（:84）判的是 **source** 有没有值 —— 所以只写 root 的新连接**不会**被当成替换候选。这正好把红测试 (b) 的那条断言变绿，而且是从语义上变绿，不是绕过去。
- `modelSuccessorDepth`（:129）要求「同 root 才可能是前任」，但还要 `predecessorForModel` 能爬到 —— 兄弟连接之间爬不到（都没 source），所以互相不是前任。兄弟共存与替换候选两套语义在同一份 lineage 里天然分开，**不需要第二套字段**。
- ⚠️ 要核的一条：`predecessorForModel`（:106-121）有个向后兼容分支「没有任何 predecessor 元数据时，退回用 source」。新连接没有 source，走不进那个分支，行为正确。实施时补一条测试钉死。

### 4.3 共享 helper：名字与放置层

新建 `electron/shared/builtinVendorIdentity.ts`（`electron/shared/` = 主进程与渲染层同源，`vendorLineage.ts` 就住这儿）：

```ts
/** 这条 vendor（可能是某个内置家的第二条连接）最终属于哪个内置身份；不属于任何内置家返回 null。 */
export function resolveBuiltinVendorKey(
  vendors: readonly VendorLineageEntry[],
  vendorKey: string,
): BuiltinVendorKey | null

/** 「这条 vendor 是不是 apimart」的唯一问法。 */
export function isVendorOfBuiltin(
  vendors: readonly VendorLineageEntry[],
  vendorKey: string,
  builtin: BuiltinVendorKey,
): boolean

/** 只有 key、拿不到 vendors 列表的调用点用（纯字符串解析：host 段 + 内置名单）。 */
export function builtinVendorKeyOfKey(vendorKey: string): BuiltinVendorKey | null
```

- 内部实现 = `resolvedVendorLineageRoot` → 再对 root 查内置名单（`builtinVendorSeeds.ts` 已有 `HOST_TO_BUILTIN_VENDOR_KEY` / `SEEDED_BUILTIN_KEYS`）。
- `BuiltinVendorKey` 做成字面量联合类型，这样 15 处调用点的参数**由编译器拦**（R17：能让编译器拦的别留给门岗）。
- 三个函数而不是一个：有些调用点手里有完整 vendors 列表（主进程 `readCatalog()`、渲染层 `listVendors()`），有些只有一个 key 字符串（`assetUploadConsent` 从 node.meta 拿到的 `modelVendor`）。**不给「只有 key」的调用点假装能解析 lineage**，那是 `unsupported` 而不是 `undefined`（R17）。

### 4.4 15 处字面量的逐条改法

| # | 位置 | 现状 | 改法 |
|---|---|---|---|
| 1 | `electron/capabilityCore/generationProviderBootstrap.ts:101` | `vendors.find(v => v.key === "apimart" && v.enabled)` | `vendors.find(v => v.enabled && isVendorOfBuiltin(vendors, v.key, 'apimart'))` |
| 2 | 同上 `:121` | 同形 | 同上 |
| 3 | `electron/capabilityCore/apimartGenerationProvider.ts:254` | `vendors.find(c => c.key === "apimart" && c.enabled)` | 同上 |
| 4 | 同上 `:256` | `models.find(c => c.vendorKey === "apimart" …)` | 先解析出上面那条 vendor 的 key，再按它过滤模型 |
| 5 | 同上 `:433` | 同 :254 | 同上 |
| 6 | 同上 `:559` | `input.providerId !== "apimart"` throw | `builtinVendorKeyOfKey(input.providerId) !== 'apimart'`（这里只有 providerId 字符串） |
| 7 | 同上 `:598` | 同 :559 | 同上 |
| 8 | `electron/catalog/assetLocalization.ts:770` | `targetVendor?.key !== "apimart"` | `!isVendorOfBuiltin(state.vendors, targetVendor.key, 'apimart')` |
| 9 | `electron/catalog/kieGptImage2.ts:118` | `mapping.vendorKey !== "kie"` | `builtinVendorKeyOfKey(mapping.vendorKey) !== 'kie'`（mapping 侧没有 vendors 列表） |
| 10 | `src/workbench/settings/AiModelsSection.tsx:149` | `channels.some(c => c.vendorKey === 'kie')` | `channels.some(c => builtinVendorKeyOfKey(c.vendorKey) === 'kie')`（**导入导出按钮不动**） |
| 11 | `src/ui/onboarding/ModelSettingsHome.tsx:315` | `connection.vendorKey === 'apimart'` → hint | 同 :432 那条一起收成一个 `builtinHintKey(connection.vendorKey)` |
| 12 | 同上 `:316` | `=== 'kie'` | 同上 |
| 13 | 同上 `:318/:319/:320` | `dreamina-member` / `codex-local` / `antigravity-cli` | 这三家**不会有第二条连接**（本地运行时 / 会员登录，没有 baseUrl+key 形态）→ 仍走字面量，但**集中到同一张表**里，并写清「为什么这三条可以是字面量」 |
| 14 | 同上 `:432` | `=== 'apimart'` → 推荐徽章 | `builtinVendorKeyOfKey(...) === 'apimart'`；⚠️ 这是 `availableConnections`（**还没接入的目录卡**），它的 vendorKey 恒为内置 key，改了行为不变 —— 但为了不留第二种问法，一起换 |
| 15 | `src/workbench/generationCanvas/nodes/NodeErrorReport.tsx:62` | `vendorKey === 'dreamina' \|\| 'codex-local' \|\| isComfyuiVendorKey(...)` | 前两个同 #13 归表；`isKnownVendor(vendorKey)`（:61，[src/config/knownVendors.ts:319](../../src/config/knownVendors.ts):319）**必须换成** lineage 解析 —— 否则 `apimart--mini` 会被当成「未知自定义家」而弹出自定义调用入口 |
| 16 | `src/workbench/generationCanvas/runner/assetUploadConsent.ts:81` | `listVendors().find(v => v.key === 'kie')` | `listVendors().find(v => isVendorOfBuiltin(vendors, v.key, 'kie'))` —— **这条最要紧**：认不出就会把本该走 Kie 通道的素材推去匿名图床 |
| 17 | `src/devlab/designLab/catalogLiveness/states/01-listing.tsx:25` | `KNOWN_VENDORS.find(v => v.vendorKey === 'apimart')` | **保持字面量**：这是实验室夹具在查**展示目录**（KNOWN_VENDORS 恒为内置 key），不是在判运行时 vendor。写注释说明，并列进门岗豁免名单（豁免要当断言验，见 §6） |
| 18 | `src/config/modelIdentity.ts:114-119` `vendorTier` | `OFFICIAL_VENDOR_KEYS.has(k)` / `BUILTIN_RELAY_VENDOR_KEYS.has(k)` | **grep 探针扫不到的第 16 处**（形状是 `Set.has` 不是 `===`）。先过 `builtinVendorKeyOfKey` 再查 Set，详见 §4.7 |

### 4.5 模型选择器的「· 连接名」后缀在哪一层算

**在 `src/config/modelIdentity.ts` 的 provider 投影层算，只算一处。**

判据：同一个 `modelKey` 在同一次投影的候选集里出现 ≥2 次且它们的 `vendorName` 不同 → 全部候选都加后缀；否则都不加。

为什么在那一层：`sortModelProviders`（[src/config/modelIdentity.ts:202](../../src/config/modelIdentity.ts):202）已经是「同一个模型有哪几家、什么顺序」的唯一 owner，每个模型选择器、自动选家、批量摊平都过它。后缀是纯展示派生，跟着它走就自动全覆盖；放在任何一个具体的选择器组件里都会变成第二份。

⚠️ 后缀**只进显示名**，不进任何持久化字段、不进请求、不进 Agent 的 `list_models`（那里已经有独立的 `vendor` 字段，照旧）。

### 4.6 添加表单内联提示的数据来源

**走现有读，不加 IPC。** `useOnboardingDrawerCatalog()`（[src/ui/onboarding/useOnboardingDrawerCatalog.ts:33](../../src/ui/onboarding/useOnboardingDrawerCatalog.ts):33）返回的 `vendorMeta: Map<vendorKey, { name, baseUrl, … }>` 已经带了每条连接的 `baseUrl` 和 `name`。表单只要：

```
hostOf(draftBaseUrl) === hostOf(meta.baseUrl)  →  收集同域名的已有连接名
```

两种文案共用同一个容器（样张 §5）：

- 同域名 + **不同名** → 「这个地址已经有连接「X」。填不同名称会新建一个独立连接，各自存 Key 和模型；想改「X」的 Key，去那个连接里改。」
- 同域名 + **同名** → 「保存会更新连接「X」的 Key。」

不弹窗、不 disable 保存按钮（D1：effect-first，别让用户先读一段再做事）。

放在 `OnboardingWizard.tsx` 的 BaseURL `<Field>` 之下；现有的 `data-connection-save-notice`（:653-661）是**保存之后**的那一句，语义不同，不复用那个容器，但复用它的视觉档位。

### 4.7 供应商偏好两把尺（只确认，不改）

- `orderByVendorPreference`（vendorPreference.ts:27）按 `rank.get(vendorOf(entry))` 排 —— 精确字符串匹配。`apimart--mini` 不在用户排过的列表里 → 落到 `MAX_SAFE_INTEGER`，排在最后。**按 key 隔离，正确**（它是一条用户还没表过态的新连接）。
- `pickImplicitVendorMatch`（modelIdentity.ts:175）同理 + `vendorTier(vendor)` 兜底。**已实查**：`vendorTier`（[src/config/modelIdentity.ts:114](../../src/config/modelIdentity.ts):114-119）是 `OFFICIAL_VENDOR_KEYS.has(k)` / `BUILTIN_RELAY_VENDOR_KEYS.has(k)` 两个 Set 的精确查表 —— **这是第 16 处字面量判断，只是形状是 Set.has 而不是 `===`，上面那条 grep 探针扫不到它**。`apimart--mini` 会落进 tier 2（用户自接），排在 `apimart` 之后。
  → 裁决：**这是可接受的默认**（用户新建的特价组不该自动顶掉主连接），但必须是决定过的，不是漏网。实施时：① `vendorTier` 内部先过 `builtinVendorKeyOfKey` 再查 Set（这样 `apimart--mini` 拿到和 `apimart` 同一档），② 排序在同档内仍按 catalog 原序 → 主连接仍在前（它先建、序在前）。这样"默认不被顶掉"由**顺序**保证，而不是由"把兄弟连接降档"这种副作用保证。
  → **门岗补一条**：§6.2 的 grep 探针必须同时扫 `Set` 形状（`new Set([... 'apimart' ...])` / `.has('apimart')`），否则这一族会从门岗底下漏过去（这正是"死选择器同时造假红假绿"那一课）。
- `VendorPreferenceOrderSection` 的 `configuredVendorEntries`（AiModelsSection.tsx:158-164）按 `provider.key` + `provider.name` 建条目 → 三条连接会各占一行、各自可排。**符合预期，不改**。

---

## 5. 样张（R8）

**先看它真实样子**（真机跑出来的 before，不是脑补）：

| | 路径 |
|---|---|
| zh 添加连接表单（空） | [assets/…/02-zh-add-connection-form-empty.png](./assets/2026-09-22-vendor-connection-identity/02-zh-add-connection-form-empty.png) |
| zh 添加连接表单（填好） | [assets/…/03-zh-add-connection-form-filled.png](./assets/2026-09-22-vendor-connection-identity/03-zh-add-connection-form-filled.png) |
| en 添加连接表单（空） | [assets/…/05-en-add-connection-form-empty.png](./assets/2026-09-22-vendor-connection-identity/05-en-add-connection-form-empty.png) |
| en 添加连接表单（填好） | [assets/…/06-en-add-connection-form-filled.png](./assets/2026-09-22-vendor-connection-identity/06-en-add-connection-form-filled.png) |

采集方式：真实 Electron 冷启动、隔离 profile、走真实用户路径（连接模型 → 本地运行时与即梦会员 → 自定义 API / 中转站），en 轨走设置 → 通用 → English 的真实切换（不是注入 locale；切不过去就抛错，不许把没切过去当切过去）。取证用的一次性探针在证据落盘后已删（Ponytail 建议）；同一条路径由带断言的验收走查 [tests/ux/vendor-connection-identity.walk.mjs](../../tests/ux/vendor-connection-identity.walk.mjs) 长期覆盖。

**样张（真实布局 + 只加那一行）**：

| | 路径 |
|---|---|
| HTML 源 | [assets/…/mockup-duplicate-host-hint.html](./assets/2026-09-22-vendor-connection-identity/mockup-duplicate-host-hint.html) |
| 渲染图（zh + en 并排） | [assets/…/07-mockup-duplicate-host-hint.png](./assets/2026-09-22-vendor-connection-identity/07-mockup-duplicate-host-hint.png) |

token-only（值逐字抄自 `src/theme/nomi-tokens.css` 的暗色块），zh/en 两轨，英文那句约为中文 1.6 倍长、两行仍在同一块里收住。

---

## 6. 验收门

### 6.1 单测（先红后绿）

1. **`electron/providerAdapter/registrationSameHostSecondConnection.test.ts`（已落位，2026-09-22 实跑确认红：2 failed / 1 passed）**
   - (a) 未发布的第一条连接：第二条同 host 连接保存后，第一条的 `name` / 凭据一个字不动，第二条落在自己的 key 上。当前红在 `upsertVendor` 被用同一个 hostKey 调了一次。
   - (b) 已发布的第一条连接：第二条不得带 `adapterCandidateSourceVendorKey`（= 不得被当替换候选）。当前红在它带了 `"gateway-example-test"`。
2. **新增「三连接独立」测试**（`electron/providerAdapter/sameHostConnectionsIndependence.test.ts`）：同域名建三条连接 →
   - 三把 Key 各自独立（`apiKeysByVendor` 三个不同的键，值各不相同）；
   - 模型归属独立（`models[].vendorKey` 三分，删一条连接只带走它自己的模型和 mapping）；
   - 删中间那条，另外两条的 key / 名字 / 模型 / 凭据不变；
   - **重启后仍独立**：写盘 → 重新 `readCatalog()` → 上面三条全部成立（不是同一个内存对象）。
3. **key 派生规则测试**：第一条 = hostKey（零迁移）；第二条 = `host--slug`；改名不换 key；slug 撞车 = 同一条连接（不静默覆盖成第二条）；slug 为空时的兜底。
4. **lineage 测试**：`resolvedVendorLineageRoot(vendors, 'apimart--mini') === 'apimart'`；`isCandidateVendor(兄弟连接) === false`；`modelSuccessorDepth(兄弟A, 兄弟B, …) === null`。

### 6.2 类回归门岗（grep 型，改前必须先验它会红）

新增 `scripts/check-builtin-vendor-literals.mjs`，判据 = §3 那条 grep。

**改前已实跑：24 处命中（其中 15 处生产判据）→ 门岗当前必红。** 这一步已完成，命中清单存 `scratchpad/literal-sites.txt`，实施时把它当基线，目标是降到**豁免名单那一档**（§4.4 的 #13 三家 + #17 实验室夹具），且豁免名单本身要被**一条断言**验（memory：死 i18n 词条那课 —— 豁免名单要当断言验，不能只写在注释里）。棘轮：只减不增。

### 6.3 i18n 门岗

`pnpm run check:i18n` 硬零。两条新串进 `src/i18n/locales/modelSetup.ts` 的 zh 与 en 两块；zh/en **两轨都要真截图**（R15）。

### 6.4 真机走查（R13 第一档 + 第二档）

新增 `tests/ux/vendor-connection-identity.walk.mjs`，按 `tests/ux/*.walk.mjs` 风格（真实 Electron、隔离 profile、假网关不花额度）：

1. 建连接「满血组」（Key A），接入 2 个模型 → 截图；
2. 同地址建「Mini 特价组」（Key B），**先断言那一行内联提示出现且文案里有「满血组」**，再保存，接入 1 个模型 → 截图；
3. 同地址建「Fast 特价组」（Key C）→ 截图；
4. 回设置页断言三条连接都在、名字都对、各自的模型数对 → 截图；
5. 打开模型选择器，断言重名模型带「· 连接名」后缀、不重名的不带 → 截图；
6. 删掉「Mini 特价组」，断言另外两条纹丝不动 → 截图；
7. **冷启动重来**（不是 `win.reload()`，memory 有这条坑），断言 4 的全部结论仍成立 → 截图。

zh / en 两轨各跑一遍（R15）。截图**人眼判断**，不只看断言（P3）。

### 6.5 四件真实（R13）

真实应用（真 Electron 冷启动）/ 真实页面输入（真的在表单里打字）/ 真实工具轨迹（不适用）/ 真实素材（本次不碰素材路径，`check:real-media-fixture` 不受影响）。

### 6.6 门岗全家

`pnpm run gates`（contracts 全量 + 改动相关测试 + build）。改到 `electron/shared/` 与 15 处调用点，会触发 `check:vocabularies` / `check:boundaries` / `check:door-map` / `check:prior-art` / `check:root-cause-contracts`。

---

## 7. 6 角色评审（R7）

### CTO

- 这次真正买到的东西不是「能加第二条连接」，是**把一条不变量从 15 份复本收回一份**。前者是 issue，后者是这个 PR 值不值得做的理由。如果实施时为了赶工只改了注册链、15 处字面量留着，**这个 PR 的净效果是负的**：内置家的第二条连接会静默走错通道（#16 那条尤其危险，素材会被推去匿名图床）。要么整包做，要么不做。
- 零迁移这条约束是对的，但它让 key 有两种形状（`apimart` 和 `apimart--mini`）。这个不对称会长期存在，必须在 `builtinVendorIdentity.ts` 的文件头把它写成规格，而不是让后人从两个 if 里反推。
- 风险点排序：#16 assetUploadConsent > #6/#7 apimart providerId throw > 四扇「拿 baseUrl 反查连接」的门 > 其余。

### 设计

- 内联一行、不弹窗、不拦 —— 对的。这里的用户是**知道自己在干嘛**的（他买了三个分组），弹窗等于怀疑他。
- 但要盯一个细节：提示行出现的**时机**。如果在用户敲第一个字符时就闪出来（`https://g` 还不是合法 URL），会像个 bug。规则应是：URL 能 `new URL()` 解析出 hostname **且** 输入停顿后才渲染，不做逐字符抖动。
- 「· 连接名」后缀只在重名时出现 —— 对（R2）。但要注意它在窄容器里会被截断；后缀应该和模型名**共享同一个 truncate 容器**，而不是各自 truncate 出两个省略号。
- 样张里那个 info 蓝块在暗色下和 `focused` 输入框的蓝边同色系，视觉上会有一点点"这块是不是也能点"的错觉。实施时若觉得抢，退一档到纯 `text-caption text-nomi-ink-60` 的一行小字（不带底色），先按样张做，走查时人眼定。

### PM

- issue 里六条期望行为，本方案逐条对上：独立连接 ✅ / 新增 vs 改 Key 明确区分 ✅（靠提示行 + 同名=更新）/ 同名模型可区分 ✅（后缀）/ 报价生成重试查询用所选连接 ✅（vendorKey 已是主键，本就按它路由）/ 改停删互不影响 ✅（6.4 第 6 步）/ 重启仍保留 ✅（6.1 第 2 条 + 6.4 第 7 步）。
- **没对上的一条**：issue 里提到「计价分组 / 倍率」。Nomi 的报价是按 model+vendor 查的，三条连接各有各的模型行 → 各有各的价，**机制上成立**；但用户要**自己填**那个倍率还是从上游拉，本方案没涉及。这属于另一件事，不塞进这个 PR，在 issue 里回一句说明。
- 优先级：这是「接进来就用不了」级别的问题，且报告人是本地源码开发版用户（= 会看 PR）。做完值得在 issue 下贴走查截图。

### 前端

- `OnboardingWizard.tsx` 已经 777 行，再塞提示行逻辑会逼近 800（R9）。提示行的**判据**（同域名已有哪些连接、该出哪一句）抽成 `src/ui/onboarding/duplicateHostConnections.ts` 纯函数 + 它自己的单测，组件里只剩渲染。
- `vendorMeta` 是 `Map`，每次输入都全量扫一遍在这个量级无所谓（连接数是个位数），不要提前优化成 index。
- 后缀那一层要小心：`sortModelProviders` 返回的是 `ModelProviderRef[]`，后缀属于 `option.vendorName` 之外的第三个显示字段。**别直接改 `vendorName`**（它是排序判据之一，改了会让排序跟着抖）；加一个独立的 `displaySuffix` 字段。
- `isKnownVendor`（#15）在渲染层，拿不到完整 vendors 列表的地方要用 `builtinVendorKeyOfKey`。两个函数长得像，容易用错 —— 让类型不同（一个吃 `vendors`，一个只吃 string）就能让编译器帮忙。

### 后端

- 四扇「拿 baseUrl 反查 vendorKey」的门（`httpModelDiscovery.ts:21`、`integrationSession.ts:207/984/1184`、`integrationCertification/service.ts:157`）是本方案最大的**隐性**风险面。它们今天能工作纯粹因为 baseUrl → key 是双射。改完不再是双射，这四处会在「用户有两条同域名连接」时**静默选错一条**（选到 host 那条）。处理方式必须是：调用方一律把手里的 `catalogVendorKey` 传下来，取不到就抛 —— 不许留「算一个默认的」兜底（P1 无逃生口）。
- `planStagedVendorIdentity` 的 `lineageVendors`（stagedVendorIdentity.ts:79-83）会把「root 相同」的全部 vendor 收进来。兄弟连接 root 相同 → 会互相进对方的 lineage 集合 → `supersededVendorKeys`（:211-213）有可能把兄弟当成"未发布的候选"删掉。**这是 (b) 那条红测试背后真正的雷**，实施时必须让 lineage 集合区分「候选」和「兄弟」：候选有 source，兄弟没有。已有的 `isCandidateVendor` 正好是这个谓词，:212 那行已经带了它 —— 要补一条测试证明兄弟不会被扫进去，而不是看代码觉得没问题。
- `apiKeysByVendor` 是 safeStorage 加密的扁平 map，按 key 分桶天然独立，不需要改 schema。**catalog 版本号不用升**（没有新字段、没有语义变更，只是 key 空间变大）—— 这一条要在合同里显式写明「不升版」的理由，别让后人以为漏了。

### 真实用户（就是报告人）

- 「我加第二个分组，第一个被改掉了」→ 修了。但我最担心的其实是**第二件事**：我已经在第一个连接下接好了一堆模型，你们改完之后，那些模型还在原来那条连接上吗？会不会被迁走？
  → 方案的答复：**一个都不动**。第一条连接的 key 还是原来的 hostKey，它下面的模型、Key、排序全部原样。新规则只影响你**接下来新建**的那条。这一点要在 PR 描述和 issue 回复里说在最前面。
- 「同名模型怎么分清」→ 只在重名时加「· 连接名」。我三个分组里只有 mini 和 fast 是独有的，满血组那几个才重名 —— 所以界面上大部分模型看起来没变，只有真冲突的那几个多一截。这正是我要的，不是每个模型后面都挂一串。
- 一个提醒：我改分组名字是常事（比如从「满血组」改成「0.95 组」）。如果改名会把我的模型全部搬家，那比 bug 还难受。
  → 方案已钉死：**改名不换 key**，模型一个不动。

---

## 8. 待主会话裁的点

五条已于 2026-09-22 裁决完毕（vendorTier 同档 / 提示行不用蓝块 / 四扇门不盲抛 / catalog 版本不升 / 计价倍率不做），裁决内容已并入上面各节。

---

## 9. 实施后的偏差（方案 → 落地）

方案写在实施之前，落地时有五处与它不同。**偏差本身不是问题，写下来才是**——不记就会变成下一个人「照方案读代码读不懂」。

1. **共享派生住 `electron/catalog/` 而不是 `electron/shared/`**（裁决 3 说的是后者）。理由：host 步要查「内置 host 别名表」，那张表是从 19 个 vendor seed 模块派生的。放进中立契约层 = 渲染层一 import 就把 19 个种子模块拖进浏览器 bundle，正是 `.dependency-cruiser.mjs` R-B5 注释里记着的那次白屏（#614）。**六个调用方全在主进程**，所以派生住 `electron/catalog/connectionVendorKey.ts`；渲染层要的那半（「这条 key 属于谁」）住 `electron/shared/builtinVendorIdentity.ts`，两边共用同一套 key 形状常量。裁决的意图（一份派生、六处都走它）完整保留。

2. **身份解析落在 `serviceCatalog.register`，不落在 `registration.ts`**。方案原本要在 `registration.ts` 决定 key。实际上「落在哪条连接」必须由**读得到目录**的那一层决定，而 `registration.ts` 不读目录；而且红测试 (a)(b) 正是在 `defaultCatalog.register` 这个边界上断言的。`registration.ts` 现在只解析到 root（`resolveHostVendorKey`）。

3. **多出两扇门**：`electron/runtime.ts` 有一条无人使用的 `deriveVendorKeyFromBaseUrl` re-export（方案没数到），一并删掉，否则门岗守不住「不许外部直接调」。

4. **字面量实际是 16 + 5 处，不是 15 处**。方案里的 grep 探针漏了两族：`vendorTier` 的 `Set.has`（已在 §4.7 补记），以及 `relayImageEditMigration.ts` 的 `BUILTIN_VENDOR_KEYS`——后者是**新门岗自己扫出来的**，不是人找出来的。它被 4 个 relay 迁移共用，认不出兄弟连接就会去改写 APIMart 特价组那些本该由 seedBuiltins 独占的 mapping。已收成 `isBuiltinRelayVendorKey()`。

5. **回环地址按端口分家**（方案完全没想到）。真机走查第一条断言就红了：本地目录里预置着 `comfyui-local`（`http://127.0.0.1:8188`），于是给一个**另一个端口**的本地网关填地址时，表单跳出「此地址已有连接「本地 ComfyUI」」——一句准确的谎话。已加 `connectionHostScope()`：普通域名只看 hostname，回环地址连端口一起看，与 `deriveVendorKeyFromBaseUrl` 的 `local-<port>` 同一条规则。**这条只有真机走查抓得到**——纯单测里没人会想到去造一个预置的本地供应商（P3：全绿 ≠ 完成）。

### 模型选择器：重名时显示连接名（裁决 2 的另一半，实施时改过一次）

方案原本写的是「加『· 连接名』后缀」。实验室那一格（`vo-07-picker-sibling-connections`）第一次拍出来是
`APIMart · …` —— 两段拼起来超出 chip 宽度，**被截掉的恰好是唯一有区分力的那一段**，等于白加。
改成：同一家有多条连接时，chip 直接显示**自己的连接名**（满血组 / Mini 特价组）；品牌名在这一刻是
冗余的（两个 chip 本来就同属一家，用户要认的是「哪个分组」）。不重名时一个字都不改。

**已知限制（不藏）**：EN 侧连接名更长，`Mini budget tier` 在 chip 里会截成 `Mini budg…`。
仍然与 `Full tier` 区分得开，且这一行现在被视觉基线钉着——谁把它弄得更糟，那一格当场变样。

### 提示行的最终形态（裁决 2）

不要蓝底信息块。表单的视觉词汇就是「标签 / 输入框 / 灰字提示」，蓝块和聚焦态输入框同色系会被读成控件。落地做法：撞域名时把 Base URL 下面那句静态 hint **原位替换**成动态句，同一个容器、同一档 muted token，只有连接名用 ink 色加粗。三种状态（`none` / `create` / `update`）共用那一行，不新增元素、不新增样式。

### 欠账（跨会话）

`electron/capabilityCore/generationProviderBootstrap.ts` 与 `src/ui/onboarding/ModelSettingsHome.tsx` 的字面量**本次不改**：两个文件在 Core-A 打捞分支上已重写，同时改必冲突。它们登记成门岗里的**带到期日的债**（owner `integration/core-a-salvage 总合并`，到期 2026-10-06，只减不增、到期即红）。在总合并落地前的实际影响写进了根因合同的 `residual_risks`：第二条 apimart 连接不会被 `generationProviderBootstrap` 认成 apimart 执行器（只影响新建的兄弟连接，不影响存量单连接）；`ModelSettingsHome` 把兄弟连接显示成自定义卡（仅外观）。
