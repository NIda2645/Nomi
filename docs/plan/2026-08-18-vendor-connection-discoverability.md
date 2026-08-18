# 「改 Base URL / 删供应商」找不到 —— 可发现性修复（2026-08-18）

来源：微信群两条反复出现的投诉。
1. 「接入了阶跃星辰的文本大模型无法使用……要改一下 api url，结果翻了半天没找到修改的地方」
2. 「api 配置这里需要加一个单独的删除按钮，这样没有用的 api 能单独删除」

**能力自 v0.16.1（2026-07-05）就在**（`CustomVendorManage.tsx`：改地址 / 换 key / 删整家齐全，
v0.19 / v0.20 都带着）。该文件第 5 行注释本就写着「本就现成，只是没在这张卡上露出来」。
所以这是**可发现性**问题，按 D1 从用户摩擦出发解——**不重新实现一遍功能**（那是并行版，违反 P1）。
分诊背景见 `docs/plan/2026-08-18-private-fork-diff-triage.md` §二。

## 一、真机走查测到的东西（不是推测）

脚本 `tests/ux/vendor-baseurl-discoverability.walk.mjs`，造 24 个模型的中转站 + 填错地址（本地
mock 回 401），截图逐张人眼看过（`tests/ux/shots/baseurl-discoverability/`）。

| 量 | 值 |
|---|---|
| 铅笔矩形 | y=817 |
| 设置弹窗底边 | y=706 |
| `elementFromPoint` 打到谁 | 遮罩层，**不是铅笔** |
| 铅笔命中区 | 17×17 px（WCAG 2.2 AA 要求 ≥24）|
| 外层还需滚 | 205 px |
| 模型列表自带内滚 | `max-h-[300px]`，521 px |

即：**落地连接详情页那一屏，「改地址」根本没渲染在可视区内**，它被弹窗的 overflow 裁掉了。

## 二、三层根因

1. **诊断和药分居两端。** 红色「连不上」胶囊在卡头最上面，治它的地址行在 24 个模型之后的最底下。
2. **连接详情页的主语被附属项挤掉。** `CustomVendorCard` 的 body 顺序是
   `ModelEnableEditor`（模型列表）→ `CustomVendorManage`（地址/key/删除）。页面叫「连接」，
   主语却排在页尾。**内置家 `VendorOnboardCard` 没有这个病**（它的 `ModelChipGroups` 本来就在最后）——
   只有自定义家写反了。
3. **首页那一行不显示连接故障。** `useVendorHealth` 只在两张卡里跑；`ModelSettingsHome` 的已连入行用
   `summarizeModelHomeConnection(models, mappings)`，只看模型能力不看网络。于是 401 的中转站在用户
   **扫视的那一屏**上写着灰色「24 个可使用」，副标题还写「查看并增删模型」——主动把人往「这行是管
   模型的」上带。这才是「翻了半天」的真正机制。

另有两处结构问题，同一轮一起清：
- **删除整家有两个家**：`CustomVendorCard` 的 `headerAction` 垃圾桶 + `CustomVendorManage` 底部按钮
  （违反 §1.5.2「一功能一个家」）。
- **地址行是并行实现**：`VendorOnboardCard` 与 `CustomVendorManage` 各写了一份逻辑与 markup 完全
  相同的地址编辑块（同样的 `handleSaveBaseUrl`、同样的 `data-model-connection-*`、同样的 13px
  铅笔）。修一次得改两处 = 违反 P1。

## 三、方案（§1.5.3 只用了前三招：分组 → 去重 → 归位，没用「收纳」）

用户 2026-08-18 拍板：首页行**上 health + 改副标题**；删除整家**放「连接」组里**。
样张：`docs/design/mockups/2026-08-18-vendor-connection-discoverability.html`（已拍板）。

| # | 改动 | 手法 | 可达性代价 |
|---|---|---|---|
| 1 | 抽出 `VendorBaseUrlField`，两张卡共用；灰小字 + 13px 铅笔 → 带标签字段行 +「修改」文字按钮（≥24px）| 去重 + 字段化 | 0 |
| 2 | `CustomVendorManage` 收成有边界的「连接」组：状态横幅 → 凭证 → 地址 → 删除整家（带「24 个模型一并移除」后果说明）| 分组 | 0 |
| 3 | `CustomVendorCard` body 顺序反转：连接组在模型列表**之前**；删掉 `headerAction` 垃圾桶 | 归位 + 去重 | 0 |
| 4 | 首页已连入行接 `useVendorHealth`，连不上显红；副标题「查看并增删模型」→「管理地址、密钥与模型」| 归位 | 0 |

**#4 怎么做不违反 P1**：不新写探测逻辑、不加 `useVendorHealthMap`。把 `ConnectedRows` 的每一行提成
一个组件，那个组件调**现成的** `useVendorHealth`——同一个 hook、同一份主进程缓存与并发去重。
`ModelSettingsHomeConnection` 补 `baseUrl` / `hasApiKey` / `skipHealthProbe` 三个字段（`OnboardingDrawer`
手上有 `vendorMeta`，直接填），探测策略与卡片侧保持同一套 `shouldRunVendorHealthProbe`。

## 四、不动项

- 不给首页行加删除按钮。删除整家在 §1.5.1 判定里是 <1/10 的 L4 动作，归属连接详情页；#3 的归位
  已经让它在落地首屏可见，够了。
- 不动 `VendorOnboardCard` 的多段凭证结构（`isMulti` / `fields`）——那是内置家的真实差异，不是重复。
  本轮只共用地址行。
- 不动六 tab 信息架构（`settingsDialogStructure.test.ts` 钉着）。
- 不碰 `AiModelsSection.tsx` 等五个非模型 section（同测试按 sha256 钉死）。

## 五、验收门

- `pnpm run gates` 全过。
- 单测钉住：地址行只剩一份实现（grep 断言）、删除整家入口唯一、首页行连接态。
- R13 真机走查 `vendor-baseurl-discoverability.walk.mjs` 升级成回归门：断言「落地首屏
  『修改地址』可见且点得着」「删除整家入口恰好 1 个」「401 的家在首页行显红」——**截图自己亲眼看过**才算。
- R16 真实用户任务：以「地址填错了要改」跑通完整闭环——改完地址 → 状态转绿 → 模型真能用。

## 六、回滚

四处改动彼此独立。风险最高是 #4（首页行引入探测）：若出现打开模型 tab 变慢，先确认主进程
`vendorHealth` 的新鲜期缓存是否命中，而不是把探测整块删掉——真要退，只退 #4，#1–#3 与它无耦合。
