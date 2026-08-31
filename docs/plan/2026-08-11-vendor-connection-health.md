# 供应商连接健康：从「未测试」死路到自动检查

**日期**：2026-08-11
**触发**：用户反馈「接入模型的时候显示『已保存 · 未测试』，用户会疑惑去哪里测试」
**拍板**：方案 A（Nomi 自己扛连通性检查），用户 2026-08-11 选定

---

## 1. 问题：四个 bug 叠在一起

| # | 现象 | 位置 |
|---|---|---|
| ① | 胶囊写「已保存 · 未测试」，但整张卡没有任何测试入口——胶囊本身长在展开 toggle 里，点它只折叠卡片 | `VendorOnboardCard.tsx:197-207` + `FoldableModelCard.tsx:78-83` |
| ② | `connectionState` 是组件内 React state，关面板重开即回 `idle`——测通过的家退回「未测试」 | `VendorOnboardCard.tsx:57` |
| ③ | `failed` 掉进三元链最后的 else，测过没通也显示「未测试」 | `VendorOnboardCard.tsx:204-206` |
| ④ | 8 家里只有 3 家声明 `connectionTest: 'models'`，其余显示「暂不支持自动测试」（同样死路）；自定义中转家连状态都没有——恰是最容易填错 baseUrl 的那类 | `knownVendors.ts:73`、`CustomVendorManage.tsx` |

**根因（P2）**：状态标签说的是「我们做了什么」（测没测），不是「你能不能用」；且它是 renderer 内存里的临时变量，不是供应商的持久属性。

**这类 bug 的入口集**：所有「向用户汇报一个状态、却不提供改变它的出口」的控件——设计系统 §1.6 的同族（C1 可点即有效 / C4 禁用不做沟通死路）。

---

## 2. 硬约束：探测必须挪到主进程

现在的探测只能在 `handleUnlock` 里跑，因为**那一刻明文 key 在 renderer 手上**。自动检查时 renderer 只有 `hasApiKey` 布尔，key 在主进程（`state.apiKeysByVendor` + `decryptApiKeyRecord`）。

→ 新增主进程能力 `vendorHealth`，按 `vendorKey` 自取 key/baseUrl/providerKind 后探测。renderer 只订阅结果。

---

## 3. 判据全部 derive，删掉白名单（P1 加新必删旧）

`knownVendors.connectionTest?: 'models'` 这份人工名单**整个删除**。「这家支不支持预检」由探测结果 derive：

| 探测结果 | 判定 | 依据 |
|---|---|---|
| 2xx + 是模型列表 | `reachable` | 地址和 key 都对 |
| 任一候选 401 / 403 | `unreachable` | key 无效——最有价值的信号。**优先于下一行**：`/models` 回 401、`/v1/models` 回 404 时只看末位会把 key 失效吞掉 |
| 候选全是 404 / 405 / 2xx-但解析不出列表 | `unsupported` | 「地址响应了，但这里没有模型列表」——我们没法预检 |
| 网络错误 / 超时 / 5xx | `unreachable` | 真连不上（含代理问题、上游此刻故障） |

**为什么「2xx 但不是模型列表」判 unsupported 而不是 unreachable**（实现中途改的判据）：火山语音那类原生上游、以及 new-api 后台裸地址回 index.html，都会落这里。误报「连不上」会让**本来能用**的家看着像坏了，用户恐慌 + 不信任状态；漏报只是没帮上忙，退回现状。宁可漏报不误报（D4：展开后如实说「没法预检」）。代价：填错 BaseURL 指向后台页面的用户得不到主动提示。

**不发请求的前置跳过**（也是 derive，不是名单）：无 key（`hasApiKey=false`）、无 baseUrl、或 `authType==='none'`（本地后端 comfyui-local / codex-local，各有专属卡）。

代价：那 5 家不支持的家每次开面板会白发一个必然 404 的请求——零额度（就是 `GET /models`）、有缓存、无害。换来的是新增供应商不用再维护名单（P4 通用第一）。

---

## 4. 用户可见状态（样张已拍板）

| state | 胶囊 | 展开后 body |
|---|---|---|
| `checking` | 检查中（灰 + loader） | — |
| `reachable` | 已连通（绿点） | — |
| `unreachable` | 连不上（红点） | 具体原因 + 「重新检查」+「改地址」 |
| `unsupported` | 已保存（灰点） | 「这家没有可预检的接口，第一次生成时才知道通不通」 |

「未测试」「暂不支持自动测试」两条文案**从代码里消失**。

「重新检查」是失败态的情境控件（§1.5 L2，选中/出错才出），不进常驻——不占卡片的常驻预算。

---

## 5. 改动清单

**新增**
- `electron/ai/onboarding/vendorHealth.ts` — 探测 + 结果缓存（模块级 Map，fingerprint = baseUrl+key 指纹）+ 同 vendorKey 并发去重
- `src/ui/onboarding/useVendorHealth.ts` — renderer hook：订阅结果、mount 触发、`recheck()`

**改**
- `electron/ai/onboarding/onboardingIpc.ts` — 注册 `nomi:onboarding:vendor-health`
- `electron/preload.ts` + `src/desktop/onboardingBridgeTypes.ts` — 暴露 + 类型
- `src/ui/onboarding/VendorOnboardCard.tsx` — 删本地 `connectionState`，改用 hook；补失败态 body
- `src/ui/onboarding/CustomVendorManage.tsx` + `OnboardingDrawer.tsx` 自定义家卡 — 补同一套状态
- `src/config/knownVendors.ts` — **删** `connectionTest` 字段及 3 处声明
- `src/i18n/locales/onboardingProviders.ts` — 删 `connectionUntested` / `connectionTestUnavailable`，加新四态文案（zh-CN + en）

**不动**
- catalog schema / IPC 既有通道 / 三套 vendor 名单
- `adapterVerification`（那是模型参数验证，跑真生成，与连接健康是两件事——不合并、不复用）
- `OnboardingWizard` 的「测试连接」按钮（接入向导里用户手上有明文 key，是另一条合法路径）

---

## 6. 回滚

单 commit，`git revert` 即可。删掉的 `connectionTest` 字段若要回退，恢复 `knownVendors.ts` 三处声明 + 类型即可，无数据迁移（探测结果只活在内存，不写盘）。

---

## 7. 验收门

1. 五门全过（`pnpm run gates`）
2. 单测：探测结果 → 四态的映射（含 401/404/网络错三条分支）、缓存 fingerprint 失效、并发去重
3. **真机走查（R13）**：打开模型面板 → 已连通家自动变绿；改坏一家的 baseUrl → 变「连不上」+ 给出原因 + 点「重新检查」有反应；关面板重开 → 状态不回退
4. **R16 真实任务**：以「我要接入一个新模型并用它生成一张图」为任务跑通闭环，把过程中冒出的体验问题一并修掉
