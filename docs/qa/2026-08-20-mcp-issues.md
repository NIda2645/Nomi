# MCP 问题清单（2026-08-20 实测）

> 来源：用 MCP 批量出营销海报时逐条踩出来的，全部有复现步骤。
> 环境：装机版 **v0.20.0**（`/Applications/Nomi.app`，asar mtime 2026-08-17 17:12），客户端 Claude Code。
> ⚠️ 排查提醒：**MCP server 就是装机 app**，改源码不重新打包看不到效果；但下面 M1 已确认**不是**打包滞后，是真 bug。

---

## M1 · 内置供应商的图生图经 MCP 全废（P0，真 bug）

**现象**：`nomi_generate` 带 `references` 调 apimart 的任何图像模型，一律被拒：

> 模型「Seedream 5.0 Pro」在这个接入方式下发不出：参考图。连上的这些素材不会进入请求——为免白扣费这次不发。

**实测矩阵**：

| vendor / modelKey | 带参考图 | 结果 |
|---|---|---|
| apimart / `doubao-seedream-5-0-pro` | ✓ | ✗ 拒发 |
| apimart / `gemini-2.5-flash-image-preview` | ✓ | ✗ 拒发 |
| apimart / `qwen-image-2.0` | ✓ | ✗ 拒发 |
| modelscope / `Qwen/Qwen-Image-Edit-2511` | ✓ | ✓ **通过**（卡在 M3 付费闸） |

**不是能力缺失**——装机版 asar 里 Seedream 5.0 Pro 的 mode 定义完整：
```js
{id:"edit", intent:"edit", vendorTerm:"改图", transportTaskKind:"image_edit",
 slots:[{kind:"image_ref", label:"输入图", min:1, max:10, inputKey:"image_urls"}]}
```

**根因链路**：
1. [core.ts:293](../../electron/capabilityCore/core.ts:293) — MCP 路径正确推断出 `kind = image_edit`，参考图放进 `extras.referenceImages`
2. [archetypeInput.ts:42](../../electron/catalog/archetypeInput.ts:42) — `referenceInputParams` 把它映射到**通用键** `reference_images`
3. [archetypeInput.ts:47](../../electron/catalog/archetypeInput.ts:47) — 只有 `extras.archetypeInput` 有值时才 `Object.assign` 投影成该 mode 声明的键（`image_urls`）。**MCP 路径从没填过 `archetypeInput`**（UI 路径由渲染层按 slot 定义填）
4. [taskParams.ts:260](../../electron/catalog/taskParams.ts:260) `unreachableReferenceLabels` — 渲染 body 引用的键、逐条比对参考 URL 在不在里面。apimart 的 body 引用 `{{request.params.image_urls}}`，该键不存在 → 判定发不出 → 拒发

**为什么 modelscope 能过**：通用中转模板的 body 引用的就是标准键，正好接得住 `reference_images`。[archetypeInput.ts:44-46](../../electron/catalog/archetypeInput.ts:44) 的注释自己写了：「内置家零影响：它们的 body 只引用各自声明的键」——**这句话描述的正是这个 bug 的成因**。

**影响面**：不止海报。任何经 MCP 的图生图 / 首帧图生视频 / 多图参考，只要走内置家（apimart / kie / 火山 / RunningHub）就全部发不出去。UI 里能用、MCP 里不能用，这是两条路走岔了。

**修复方向**：MCP 侧在推断出 `kind` 之后，应按该 mode 的 `slots[].inputKey` 把参考图投影进 `extras.archetypeInput`，让两条路共用同一套投影逻辑（现在渲染层有、主进程没有 → 建议把投影下沉到 `capabilityCore`，UI 和 MCP 都调它，避免再分叉）。

**复现**：
```
nomi_generate(projectId, vendor:"apimart", modelKey:"doubao-seedream-5-0-pro",
              intent:"image", prompt:"任意", references:["https://任意可达图片URL"])
```

---

## M2 · 本地文件无法经 MCP 进系统（P0，能力缺口）

**现象**：`nomi_generate` 的 `references` 只收 URL 字符串数组。本地 PNG 没有任何 MCP 入口。

**证据**：
- [mcpToolCatalog.ts:271](../../electron/capabilityCore/mcpToolCatalog.ts:271) — `references: { type:'array', items:{type:'string'}, description:'参考图 URL（可选）' }`
- `importLocalFile`（`electron/.../localFileImport.ts`）存在于 runtime，**未暴露成 MCP 工具**
- 整份 `mcpToolCatalog.ts` 无 import / upload / addAsset 工具

**影响**：Agent 想拿本机素材（截图、用户给的参考图、上一步的产物文件）当参考，只能靠人手先在 UI 里拖进去。「让 Agent 端到端跑完」这个卖点在素材侧断了。

**已验证绕法**：素材放公开仓库，用 GitHub raw 链接。
`https://raw.githubusercontent.com/aqm857886159/Nomi/main/marketing/assets/screen-canvas-2026-08-17.png` → `curl -I` 返回 200，可用。
但这只对开源仓库里的素材成立，用户自己的私有素材无解。

**修复方向**：加一个 `nomi_import_asset(projectId, path)` MCP 工具，落盘为项目素材并返回 `nomi-local://` URL；后续 `localizeAssetsForVendor` 已有的上传/base64/流传策略可直接接上。

---

## M3 · Claude Code 下付费生成 100% 发不出（P0，不是「批量」问题）

**现象**：任何 `nomi_generate` 付费调用，**一次都发不出去**，不是「每张要点一次」：

> ✗ 此付费生成未经用户确认（缺少授权令牌），已拦截。

**根因链路**（比想象的严重，没有「点一下就行」的路径）：
1. [mcpStdioServer.ts:113](../../electron/capabilityCore/mcpStdioServer.ts:113) — `const makeGateway = options?.spendConfirmed ? makeConfirmedGateway : createDiskGateway`
2. `spendConfirmed` 只在客户端经 elicitation 返回 `action:'accept' + confirm:true` 时为真（[gateway.ts:78](../../electron/capabilityCore/gateway.ts:78) 注释写明信任边界）。**Claude Code 不声明 elicitation 能力 → 恒 false**
3. 于是落到 [gateway.ts:129](../../electron/capabilityCore/gateway.ts:129) `createDiskGateway.confirmSpend` — 它只认 `process.env.NOMI_LOOP_SPEND_OK === '1'`，否则返回 `null`
4. 无 grantId → [spendGrant.ts:79](../../electron/spendGrant.ts:79) `assertAndConsumeSpendGrant` 主进程硬拦

**关键点：MCP 分支上没有接「应用内弹确认卡」这条路。** GUI 开着也没用——`createDiskGateway` 是为无窗口 headless 设计的，而进程内 MCP server 在没拿到 elicitation 确认时就退到了它。结果是：**GUI 里点生成能用，Claude Code 经 MCP 发同样的生成，一次都发不出。**

**顺带的次级问题**：即使解决了上面这条，`spendGrant` 的 `maxAttemptsPerNode` 也只支持**同一节点重试 N 次**，不支持**一次授权跑 N 个不同节点**；`automationPolicyContract.ts` 的 `maxSpend` / `autoContinueWithinBudget` 只在 playbook 编排（`productionRunDriverOps.ts`）里检查，管不到 `nomi_generate` 单次调用。

**影响**：
- 「让你的 AI 助手替你导演」这个核心主张，在最主流的 MCP 客户端（Claude Code）上，**一碰到要花钱的那一步就断**。免费的画布操作能跑，一到生成就死。
- 我们自己出营销底板卡在这；真实用户拿 Claude Code 驱动 Nomi 也会卡在同一处。
- 用户会体验成「MCP 是个半成品」——前面都跑通了，最后一步永远失败。

**修复方向**（按性价比排序）：
1. **MCP 分支接上应用内确认卡**：进程内 MCP server 在 app 有窗口时，`confirmSpend` 应转发到渲染层弹卡（就是 GUI 现在走的那条路），而不是退到 `createDiskGateway`。这是最小修复，也最符合直觉——人就在电脑前，卡弹出来他点一下即可
2. `spendGrant` 支持「一次授权 N 次 / X 元额度内不再问」，令牌带次数与金额双上限
3. 加 MCP 工具 `nomi_request_spend_budget(amount, count)`，Agent 显式申请一次批量额度，GUI 弹一次卡覆盖后续 N 次

> 注：不建议让 Agent 能设 `NOMI_LOOP_SPEND_OK` —— 那是脚本/评测的显式授权口，红队边界（「Nomi 的 AI 触发不了未确认的付费生成」）不能从这里破。

---

## M4 · `nomi_list_models` 列出没配 key 的模型（P1，体验）

**现象**：`nomi_list_models` 返回 kie 的全部模型（GPT Image 2 i2i、Nano Banana、Seedream 4.5…），但一发就报：

> ✗ API key missing: kie

**影响**：Agent 只能靠「试错 + 撞错误」来发现哪些模型真能用，每次撞都是一轮无效往返。对「让 Agent 自己选型」这条路是直接的阻碍。

**修复方向**：返回结构里加 `available: boolean` / `unavailableReason: 'no_api_key' | ...`，或默认只返回可用的、加参数才返回全量。

---

## M5 · `nomi_generate` 缺画幅 / 种子等关键参数（P2）

**现象**：入参只有 `projectId / vendor / modelKey / intent / prompt / references / nodeId`（[mcpToolCatalog.ts:257](../../electron/capabilityCore/mcpToolCatalog.ts:257)）。没有 size / aspect_ratio / seed / 数量。

**影响**：
- 出竖版海报只能在 prompt 里写「竖版 3:4」赌模型理解，实际上装机版 Seedream 5 Pro 的 `size` 选项是 `["16:9","9:16","1:1"]`，**根本没有 3:4**，默认 `16:9`
- 没有 seed → 同一 prompt 出不了可复现的结果，系列风格一致性只能靠参考图（而参考图又被 M1 挡着）

**修复方向**：`nomi_generate` 增加可选 `params` 对象透传给 archetype，或至少暴露 `size` / `seed` 两个高频项。

---

## M6 · `nomi_add_nodes` 建不出带参考图的节点（P2）

只有 `nomi_generate` 能带 `references`；`nomi_add_nodes` 的节点字段只有 `kind / title / prompt / vendor / modelKey / x / y`（[mcpToolCatalog.ts:47](../../electron/capabilityCore/mcpToolCatalog.ts:47)）。
Agent 只能先建节点、再靠 `nomi_connect_nodes` 连线来表达参考关系，多一次往返，且连线的 source 必须已经是画布上的素材节点——本地素材又回到 M2。

---

## 优先级建议

| # | 问题 | 优先级 | 为什么 |
|---|---|---|---|
| M3 | Claude Code 下付费生成 100% 发不出 | **P0 最高** | 「AI 助手替你导演」的主张在最主流客户端上，一到花钱那步就断。前面全跑通、最后一步永远失败，体验上等于 MCP 是半成品 |
| M1 | 内置家图生图经 MCP 全废 | **P0** | 能力在、路走岔，补一个投影就能修好；影响所有内置供应商的图生图/首帧图生视频/多图参考 |
| M2 | 本地文件进不来 | **P0** | Agent 端到端在素材侧断了；开源仓库素材可用 raw URL 绕，用户私有素材无解 |
| M4 | 模型列表不标可用性 | P1 | 便宜，收益立竿见影；否则 Agent 只能靠撞错误发现哪些能用 |
| M5 | 缺画幅/种子参数 | P2 | 有 prompt 兜底，但复现性差；且 Seedream 5 Pro 的 size 选项里根本没有 3:4 |
| M6 | 节点建不出参考 | P2 | 有绕法（先建节点再连线），只是多一次往返 |

**一句话**：M3 和 M1 加起来，等于「经 Claude Code 用 MCP 出图」这条链**当前完全不通**——M1 挡住带参考图的，M3 挡住所有花钱的。两条都修好，才算兑现了 README 上那句「让 Claude Code 经 MCP 直接开工」。
