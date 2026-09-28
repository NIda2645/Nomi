# 结构评审：`src/ui` / `src/config` / `src/i18n` 的症状聚簇（2026-09-17 → 2026-09-22）

状态：**已完成**（由 `check:symptom-cluster` 触发；R21「同一层 7 天内第三份合同先出结构评审」）
触发者：`docs/fixes/2026-09-22-vendor-connection-identity.root-cause.json`（#831）

---

## 为什么有这份评审

症状聚类门岗在这一周里报了三个模块：

| 模块 | 7 天内的合同数 |
|---|---|
| `src/ui` | 6 |
| `src/config` | 3 |
| `src/i18n` | 3 |

门岗的判断是「同一层被修第三次，就先别修第四次，去看看那一层的结构对不对」。这份评审就是那一眼。

**结论先说：这三个模块不是「结构坏了」，而是「它们根本不是那些 bug 的层」。** 六份合同落在 `src/ui` 上，是因为症状在那里被看见；没有一份的不变量归它管。真正该被看的结构问题在别处，而且这一周的合同已经在同一句话上撞了四次。

---

## 证据（逐份合同的 `invariant_owner_layer`，机器取值不是印象）

| 合同 | 不变量 owner | owner 在 `src/ui*`？ |
|---|---|---|
| 2026-09-17 local-speech-provider | `electron/downloads/verifiedAssetCache.ts` | 否 |
| 2026-09-17 credential-failure-preserved-clause | `electron/catalog/validateCandidateCredential.ts` | 否 |
| 2026-09-17 interactive-import-project-context | `src/workbench/project/projectCanvasReadSurface.ts` | 否 |
| 2026-09-17 mcp-launcher-ownership | `electron/capabilityCore/mcpConfig.ts` | 否 |
| 2026-09-17 project-artifact-storage-and-projection | `electron/shared/contracts/mediaImportPolicy.ts` | 否 |
| 2026-09-18 vendor-upsert-drops-fields | `electron/catalog/upsertDraft.ts` | 否 |
| 2026-09-21 storyboard-model-vendor | `src/workbench/generationCanvas/agent/storyboardPlanEdits.ts` | 否 |
| 2026-09-22 shot-cut-truncation | `electron/shared/canvas/shotTable.ts` | 否 |
| 2026-09-22 vendor-connection-identity（本次） | `electron/catalog/connectionVendorKey.ts` | 否 |

**9 / 9 在 `src/ui` 之外**（7 份在 `electron/`，2 份在 `src/workbench/`）。

复核方法（任何人都能重跑）：

```bash
for f in docs/fixes/2026-09-1[78]-*.root-cause.json docs/fixes/2026-09-2[12]-*.root-cause.json; do
  python3 -c "import json,sys;c=json.load(open('$f'));print('$f', (c.get('invariant_owner_layer') or {}).get('layer'))"
done
```

---

## 这些合同其实在说同一句话

把四份合同的 `class_root` 并排读，用词不同、形状是同一个：

- **storyboard-model-vendor**：「No single owner for 'storyboard model selection' … every reader invented its own answer for a vendor-less key（first row / preference order only / catalog order），so display and execution could disagree」
- **vendor-upsert-drops-fields**：「写路径没有『记录必须完整』这条不变量的持有者……忘了同步改那坨字面量，就是一次没人报错的数据丢失」
- **shot-cut-truncation**：「**没有单一 owner 的状态会被各方各自重新计算，分叉处安静地错**」
- **vendor-connection-identity（本次）**：身份**派生**只有一个 owner，身份**识别**却被抄了 21 份；身份一变宽，21 处集体认错，没有一处报错

一句话：**一份状态如果没有 owner，它会被每个读它的地方各自重新算一遍；分叉的那一刻不报错，报错的是几周后的用户。**

`src/ui` 之所以反复出现在 `scope_paths` 里，正是因为它是**最下游的那一批读者**：设置页、接入抽屉、模型选择器都要把主进程的状态再讲一遍。owner 缺位时，它是最先长出「第二份判据」的地方，也是用户最先看见错的地方。

`src/config` 与 `src/i18n` 的 3 份同理：`src/config/modelIdentity.ts` 是「同一个模型先走哪家」的渲染层投影（本次 `vendorTier` 那处 `Set.has` 就是它的一份复本），`src/i18n` 只是这些改动顺带要加的可见文案。

---

## 裁决

**不对 `src/ui` 做结构重构。** 对着投影层重构，治的是症状。

这一周真正该收的是「**状态的 owner 在哪**」，而它已经在被一条一条地收：

| 这一周新立起来的 owner | 收的是什么 |
|---|---|
| `electron/catalog/upsertDraft.ts` | 记录写回必须逐字段裁决，不许白名单保留 |
| `electron/shared/canvas/shotTable.ts` | 联系表行数只算一处 |
| `src/workbench/generationCanvas/agent/storyboardPlanEdits.ts` | 分镜的模型选择只有一个写入口 |
| `electron/catalog/connectionVendorKey.ts`（本次） | 一次保存落在哪条连接上，只有一处判据 |
| `electron/shared/builtinVendorIdentity.ts`（本次） | 「这条 vendor 是不是某个内置家」只有一种问法 |

方向是对的，节奏也在加快。本次额外做的一件事，是把这一类**做成了门岗**而不只是又修一遍：`scripts/check-builtin-vendor-literals.mjs` 会在任何人再写一次 `vendor.key === "apimart"` 时当场报红（阳性对照：对 `origin/main` 跑出 20 处）。**这正是这个聚簇缺的东西——前面几份合同修好了各自那一处，但没有一份留下「下次再抄一份会被拦住」的机制。**

### 建议（不在本 PR 做，留给周期审计 R14.1）

1. **把「同一语义有几份定义」这把尺对着 `src/ui` 扫一遍**。本次是靠一个新门岗扫出了 `relayImageEditMigration.ts` 的 `BUILTIN_VENDOR_KEYS` 和 `vendorTier` 的 `Set.has`——两处人没找到的复本。同样的扫法值得对「模型可用性」「供应商健康」「连接状态」三组语义各跑一次。
2. **`src/config/modelIdentity.ts` 值得单独看一眼**：它同时持有 `vendorTier`（分级）、`sortModelProviders`（排序）、`pickImplicitVendorMatch`（隐式选家）、`dedupeModelOptions`（聚合）四件事，而另一会话正在把其中两把尺收成一份。收完之后它是不是还该叫 `modelIdentity`，值得重新划一次线。
3. **门岗覆盖面有个已知盲点**：`door-map` 不扫 `Set.has` / `new Set([...])` 形状，本次是靠新门岗补上的。这个盲点对所有「按集合判身份」的语义都成立，值得在 `door-map` 里补一条规则，而不是每次靠专用门岗各补一次。

---

## 本次合同与这份评审的关系

`2026-09-22-vendor-connection-identity` 的 `scope_paths` 里有 `src/ui/onboarding/`（添加连接表单那一行提示）、`src/config/modelIdentity.ts`（`vendorTier`）与 `src/i18n/locales/modelSetup.ts`（两条新文案）——它们都是**这次改动真实碰到的文件**，不缩窄、不藏。它的不变量 owner 写的是 `electron/catalog/connectionVendorKey.ts`，与上表一致。
