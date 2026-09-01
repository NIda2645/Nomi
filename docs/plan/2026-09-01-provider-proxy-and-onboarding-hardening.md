# 计划：per-connection provider proxy + onboarding 加固（#258 拆项①③）

> 状态：🚧 进行中（实现完成，待 PR/合并）｜日期：2026-09-01｜分支 `feat/provider-proxy-onboarding-20260901`
> 来源：`docs/plan/2026-09-01-pr258-derived-directions-eval.md` 的方向①🟢 + 方向③🟢。**方向②（即梦改名）不做。**
> 不动 PR #258 本体。从 #258 authored commit（`03a4e532`/`30c4bd5a`）按文件 port 到 main 现状，逐文件适配。

## 范围

**①per-connection provider proxy**：给单个供应商连接一个可选 `network.proxyUrl`，产出只属于该连接的 undici dispatcher，贯穿模型发现 / 连接测试 / 适配器认证 / 生产请求 / AI SDK 请求 / 产物下载。空值 = 走既有全局 dispatcher（行为与现状完全一致）。本地 CLI（即梦/ComfyUI）不继承 HTTP 代理。
- `electron/providerNetwork.ts`（新）+ `electron/systemProxy.ts` 扩展（`createExplicitProxyDispatcher`/`normalizeExplicitProxyUrl`）
- `electron/catalog/types.ts`：`Vendor.network?: { proxyUrl?: string }`
- 穿线：`buildAiSdkModel.ts`、`ai/onboarding/modelListProbe.ts`、`ai/onboarding/onboardingIpc.ts`、`vendor/vendorHttp.ts`、`providerAdapter/{types,registration,serviceCatalog,service,existingConnection}.ts`、`providerAdapter/docsDiscovery.ts`
- UI：`src/ui/onboarding/ProviderProxyField.tsx`（新，低频高级字段，归 Advanced 折叠区）+ `OnboardingWizard.tsx` 穿线（proxyUrl 贯穿发现/测试/保存）
- i18n：`src/i18n/locales/modelSetup.ts` 四条（`proxyUrl`/`proxyUrlHint`/`proxyUrlPlaceholder`/`invalidProxyUrl`）zh-CN+en

**③onboarding 加固**：
- `src/ui/onboarding/useOnboardingConnectionTest.ts` 抽取（**P1：同 commit 删 OnboardingWizard 内联 ~70 行探测块**）
- `src/ui/onboarding/CodexLocalImageCard.tsx` 补 catch→toast（静默失败修复）+ `docs/fixes/2026-08-31-codex-local-toggle-version-skew.root-cause.json`
- `src/i18n/locales/onboardingProviders.ts` **只取 `clearTask`/`clearRecord` 两条**（minimax/elevenlabs/meshy promo 是 B 类噪音，不带）

**不动项 / 不带**：方向②即梦全部（`dreaminaSeedance3.ts`/`dreaminaImage.ts` 收窄/`dreaminaVideos`+`Codec` 对齐/各 dreamina test）、B 类 archetype 认证体系（minimax/elevenlabs/meshy/runway/suno/lyria）、`providerAdapter/store.ts` 的 `deleteRun`/`ProviderAdapterRunActiveError`（属独立的 adapter-run-lifecycle 线，不是①③）、`integrationCertification/*` 的 lifecycle 改动。

## 三条硬门（评估文档定的，本计划的验收核心）

### a) 代理凭据不入日志
proxyUrl 可能含 `user:pass`。per-connection 路径的报错须走 `systemProxy.ts` 既有 `redactNetworkMessage`/`safeNetworkUrl` 一族脱敏（`safeNetworkUrl` 只留 `protocol//host{pathname}`，丢弃 userinfo/query）。
- 断言：含凭据的 proxyUrl（`http://user:REDACTED-EXAMPLE@127.0.0.1:7897`）不出现在任何日志/错误输出。
- 附带：grep 确认无处 raw 打印 proxyUrl。

### b) 私网重定向防护（本任务的技术核心，#258 的真缺口）
main 的 `appDispatcher` 每次 dispatch 查 `isPrivateTarget`（私网 origin→直连 `privateDispatcher`，防私网 URL 302 跳公网继承直连），且 `SelectiveProxyDispatcher` 同语义（私网 bypass 代理走直连）。
**#258 的 `createExplicitProxyDispatcher` 返回裸 `ProxyAgent`/socks dispatcher——无 `isPrivateTarget` bypass**；作为 `suppliedDispatcher` 传给 `appFetch` 时**完全跳过** `appDispatcher`（见 `appFetch.ts`：`suppliedDispatcher ?? getAppDispatcher`）。
- **修法（P2 根因，改在唯一共享边界）**：`createExplicitProxyDispatcher` 返回 `new SelectiveProxyDispatcher(proxy, new Agent())`——每次 dispatch 对私网/回环 origin 走直连、公网走代理，与 app dispatcher 同语义。所有 caller（buildAiSdkModel/modelListProbe/onboardingIpc/vendorHttp/docsDiscovery）自动继承。
- 断言：per-connection dispatcher 对 `127.0.0.1`/`localhost` origin 走 direct、对公网 origin 走 proxy；结构测试。

### c) 凭据存储层级（诚实边界）
- **现状**：API key（主凭据）走 `safeStorage`（OS 钥匙串，`enc: "safeStorage"`）；`extraHeaders`（可含 `Authorization: Bearer <secret>` 的连接级凭据）存在 `vendor.meta.extraHeaders`（catalog JSON 明文）。
- **#258 把 proxyUrl 存进 `vendor.network.proxyUrl`（catalog JSON 明文）**——与 `extraHeaders` 同一层级。
- **裁决**：proxyUrl 是「可能带凭据的连接级配置」，与 `extraHeaders` 同性质，都必须能在**每次出网时同步读到**（vendorHttp 拿 `vendor` 同步读 `vendor.network`，10 处读点大多只有 `Vendor` 对象、无 catalog state）。app 对这类配置的既有边界就是 catalog vendor 记录（明文），主凭据（API key）才进 safeStorage。故 proxyUrl **与 `extraHeaders` 同级**是对齐 app 既有边界、非回归。**不伪造半加密路径**（那会在 10 个读点漏解密、违 P2）。
- 落实：`check:secrets` 门岗须绿（proxyUrl 不落进被扫的敏感位）；gate a 证明它不进日志；catalog 文件本就是该连接的凭据配置文件。root-cause 契约明写此边界，不谎报「已加密」。

## 回滚
纯增量：新增 `providerNetwork.ts` + `Vendor.network` 可选字段 + proxy 穿线 + `useOnboardingConnectionTest` 抽取 + CodexLocalImageCard catch。旧连接缺 `network.proxyUrl` → 走既有 app dispatcher，行为与现状一致。revert 本分支即可。

## 验收门
- 三条硬门测试全绿（`providerNetwork.test.ts` 扩：redaction + selective private bypass；onboardingIpc 保持 proxyUrl 穿线测试）。
- P1：内联探测块删除，`useOnboardingConnectionTest` 是唯一实现（`codexDirectionSeparation.test.ts` / `saveFirstOnboardingContract.test.ts` 保持绿）。
- i18n：四条文案 zh+en，`check:i18n` 绿。
- UI 走查：真 Electron 打开含 proxy 字段的 onboarding 表单，截图亲眼看（proxy 字段在 Advanced 折叠区、不抢 L1 常驻位）。
- 全量 `pnpm run gates` 绿。
- 诚实边界：无 APIMart 之外付费号，真实出网验证标「留待编排者/社区验收」，dispatcher 选择逻辑用单测锁死。
