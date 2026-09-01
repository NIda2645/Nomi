# 生成积分估算与实际记录实施计划

> 🚧 进行中：2026-09-01 返工——估算侧已由 main 的 spend 体系实现，仅落「实际扣费证据」增量（见文末逐项裁决表）；其余估算/契约设计仅存档。原始执行状态：用户已确认直接推进；实现完成后先测试与走查，再决定是否推送/提 PR。

## 目标

在统一的 provider-neutral 成本契约上，完成 APIMart/KIE 实际积分提取、模型目录估算、单节点/批量条件交互，以及向后兼容的 provenance/event 传播。

## 实施步骤

### 1. 先写纯函数与测试（TDD）

文件：

- 新增 `electron/vendor/cost.ts` 与 `electron/vendor/cost.test.ts`。
- 新增 `src/workbench/generationCanvas/spend/generationCost.ts` 与同名测试。
- 修改 `src/config/modelOptionMappers.ts` 及测试。

任务：

1. 定义 `CostUnit = 'credits'`、`CostActual`、`CostEstimate` 的最小结构，数值只接受 finite/non-negative。
2. 覆盖 APIMart `data.credits_cost`（含 0 与小数）、KIE `data.creditsConsumed`、错误响应/字符串/缺失字段、未知 provider。
3. 估算 base + matching spec costs、裸值/`key:value`、变体相乘、批量任一 unknown 则 unknown。
4. 修改 mapper 不再 floor 小数，补 8.52、0.06 的回归测试。

验收：纯函数测试全绿，且不依赖 Electron/React/网络。

### 2. 接入任务终态与已有记录

文件：

- `electron/vendor/provenance.ts`
- `electron/runtime.ts`
- `electron/tasks/taskResultQuery.ts`
- `electron/events/vendorCallTrace.ts`
- `src/workbench/api/taskApi.ts`
- `src/workbench/generationCanvas/model/generationCanvasTypes.ts`
- `src/workbench/generationCanvas/model/generationCanvasSchema.ts`
- `src/workbench/generationCanvas/runner/catalogTaskResultParse.ts`

任务：

1. `buildProfileTaskResult` 以 vendor key + 原始响应提取 actual，成功/失败结果都保留 raw；只有有值时才写 provenance.cost。
2. 让 `traceVendorCompleted` 接收可选 cost，所有 profile/fallback/query 终态调用点传同一 actual。
3. 让 fallback 与无状态轮询路径也使用同一适配器，不产生重复或猜测。
4. renderer DTO/schema/parser 增加可选 actual cost，旧数据保持可读。

验收：APIMart/KIE fixture 测试能看到 actual；缓存命中和未知字段没有伪造费用。

### 3. 接入单节点 B 方案

文件：

- `src/workbench/generationCanvas/nodes/NodeGenerationComposer.tsx`
- `src/i18n/locales/generationCommon.ts`

任务：

1. 从已有 `selectedModelOption` 和 `node.meta` 计算估算，变体数变化时同步更新。
2. 有值时在原生成按钮位置显示 token-only 胶囊 `约 {{credits}} 积分 ↑`；无值时继续使用原 `GENERATE_BUTTON_CLASS` 圆形按钮。
3. 不改变 `handleGenerate`、依赖计划、spend confirm、variant runner 的调用链。
4. 补结构测试：有 pricing/无 pricing 两个 DOM 分支，按钮 aria-label 与 disabled 语义不变。

验收：无 pricing 模型截图中没有费用占位；有 pricing 模型按钮宽度和设计系统 token 正确。

### 4. 接入批量 B 方案

文件：

- `src/workbench/generationCanvas/components/useCanvasProductionActions.ts`
- `src/workbench/generationCanvas/components/CanvasBatchGenerateDock.tsx`
- `src/workbench/generationCanvas/components/CanvasSelectionToolbar.tsx`
- `src/workbench/generationCanvas/components/BatchPlanOverlay.tsx`
- 必要时 `src/workbench/generationCanvas/components/batchPlanPreview.ts`

任务：

1. 在 production actions 里按节点 execution kind 读取目录选项，使用同一个纯函数得到全批量 estimate。
2. 将可选 `costEstimate` 传入三种批量入口；全 known 才渲染汇总，unknown 则不渲染。
3. 复用现有主按钮与确认函数，避免第二套 submit/grant 流程。
4. 批量文案统一 i18n，显示格式最多保留两位小数且不把金额混进积分。

验收：混合一颗无 pricing 节点时批量栏不出现成本；全 known 时显示总积分且点击行为不变。

### 5. 设计系统与文档自检

任务：

1. 对照 `docs/design/nomi-design-system.md` 检查新 class 仅使用 token。
2. 对照已确认的 v3 mockup 逐项核对：单节点有/无、批量全知/未知、确认链路。
3. 更新必要的结构测试与 i18n 基线，不新增硬编码可见文字。

### 6. 全量验证与交付

按项目门禁运行：

```bash
pnpm run check:filesize
pnpm run check:tokens
pnpm run check:i18n
pnpm run lint:ci
pnpm run typecheck
pnpm run test
pnpm run build
```

另外运行真实用户任务走查：

1. 有 APIMart/KIE pricing 的图片/视频节点：切换参数、变体数，确认积分文案变化。
2. 没有 pricing 的普通模型：确认只有原圆形箭头。
3. 批量全 known：确认汇总出现；加入 unknown 节点：确认汇总完全消失。
4. 点击生成：确认仍经过原 spend confirmation，确认前无 vendor 请求。

截图和测试结果先交给用户确认；不推送、不提 PR，直到用户明确确认。

## 回滚

本分支所有改动可回滚为：删除成本适配器/估算模块，恢复 provenance/event 的可选字段和 mapper 原有 floor；不会修改现有任务执行、确认令牌或模型目录数据结构。

---

## 2026-09-01 与 main 现行 spend 体系对照 + 逐项裁决（返工）

**背景**：本方案 2026-08-25 起草时，main 尚无成本体系。此后 main 长出了完整的 spend 子系统。**原样合入 = 两套算钱真相源，违 P1**。本轮和解原则：**只落 main 确实缺的那一件事（实际扣费证据），其余重复的一律不落代码、只留本对照**。

### main 现在已经实现了什么（估算侧全部已有，file:line）

- **每节点 + 每 spec 附加费 + 未知≠0 的估算**：`electron/productionRun/shotPricing.ts:88` `deriveShotPrice`——`price = pricing.cost + Σ 命中 specKey 的 spec.cost`，specKey 同时匹配「裸值」与「paramKey:value」，未知返回 `{ known: false }` 绝不填 0。**这正是本方案 `estimateGenerationCost` 想做的事，已在 main 落地**（还额外做了预览投影 `projectMultiShotPreview:191`、确认卡投影 `buildMultiShotGateProjection`、封板可负担性 `checkSealAffordability`）。
- **画布批量估算**：`src/workbench/generationCanvas/spend/planCostEstimate.ts:24` `estimatePlanCost` + `components/useBatchPlanCost.ts` + `components/BatchPlanOverlay.tsx:52`（已渲染「约 N 积分 / 价格未知」，带 `data-batch-plan-cost`）。⚠️ **已知不一致**：画布侧 `estimatePlanCost` 只累加 `pricing.cost`、**不含 specCosts**，而生产侧 `shotPricing` 含——两条估算路径对同一批的报价可能不一致。这是 main 自身的内部债，不是本方案要新引擎去解决的（正解是让 `estimatePlanCost` 复用/对齐 `deriveShotPrice`，另开单）。
- **spend 确认闸 + 预算令牌**：`electron/spendGrant.ts`（grantId 只主进程铸、绑 nodeIds、同 tick 原子校验消费、TOCTOU 安全）+ `spend/SpendConfirmDialog.tsx` / `ProductionContractSummary.tsx` / `MultiShotContractSummary.tsx`。
- **`ModelOptionPricing.specCosts`**：`src/config/models.ts:15` 早已声明。

### main 还缺什么（本轮唯一落码点）

- **实际扣费证据（actual cost）**：main 全程只做**估算**，从不读供应商**真实扣了多少**。`electron/events/vendorCallTrace.ts` 的 completed 事件只记 status/assetCount，无 cost；无 `ProviderCostActual` 等价物（全仓 grep 只有注释提到 `credits_cost: 0`）。这是真实缺口，且是自洽的新证据信号，不是第二套引擎。

### 逐项裁决表

| #247 原改动 | 裁决 | 理由 | main 对应物 file:line |
|---|---|---|---|
| `electron/vendor/cost.ts`（提取 apimart/kie 实际积分） | ✅ **落**（增量） | main 无任何实际扣费捕获，是真缺口 | 无 |
| `electron/vendor/cost.test.ts` | ✅ 落 | 覆盖上条 | 无 |
| `electron/runtime.ts`（`buildProfileTaskResult`/`runTask` 抽 actualCost → provenance + completed 事件） | ✅ 落（增量，接进现有 provenance/trace） | 把实际扣费接进 main 现有 provenance 与 vendorCallTrace，非新链 | `runtime.ts` provenance 出口 + `vendorCallTrace.ts` |
| `electron/vendor/provenance.ts`（+`cost` 字段 + `actualCost` 参数）+ test | ✅ 落（增量） | 复用 main 现有 `buildTaskProvenance` 单一真相 | `provenance.ts:114 buildTaskProvenance` |
| `electron/events/vendorCallTrace.ts`（completed 事件带 cost） | ✅ 落（增量） | 现有事件加一字段 | `vendorCallTrace.ts:44 traceVendorCompleted` |
| `electron/tasks/taskResultQuery.ts`（异步查询终态带 cost） | ✅ 落（增量） | 现有查询收口加实际扣费 | `taskResultQuery.ts` 终态事件 |
| `catalogTaskResultParse.ts` + `generationCanvasTypes.ts` + `generationCanvasSchema.ts`（渲染层投影 `provenance.cost`） | ✅ 落（增量） | 让实际扣费落进节点 provenance，可显示、可持久化 | 现有 provenance 投影/schema |
| `ProvenancePanel.tsx`（显示「实际扣除」行） | ✅ 落（增量，含内联 `formatCredits`，**不引** generationCost） | main 溯源面板未显示任何成本；这是新证据的诚实消费者 | `ProvenancePanel.tsx`（无成本行） |
| i18n `generationCommon.provenance.actualCost` | ✅ 落 | 上条所需，仅此一键 | — |
| `src/workbench/generationCanvas/spend/generationCost.ts`（+test） | ❌ **不落** | **与 `shotPricing.deriveShotPrice` 几乎逐行同构**（同 specKey 加法、同未知≠0）＝第二套估算引擎，违 P1 | `shotPricing.ts:88`（含 specCosts）+ `planCostEstimate.ts:24`（画布侧） |
| `BatchPlanOverlay.tsx`（并行批量估算显示） | ❌ 不落 | main 已用 `useBatchPlanCost` 显示批量估算 | `BatchPlanOverlay.tsx:52`、`useBatchPlanCost.ts` |
| `NodeGenerationComposer.tsx`（每节点估算按钮） | ❌ 不落 | 依赖被否的 `generationCost.ts`；每节点估算若要做应复用 main 估算器（另开单） | 无（main 无每节点显示，属真空缺但不该用第二引擎填） |
| `CanvasBatchGenerateDock.tsx` / `CanvasSelectionToolbar.tsx` / `useCanvasProductionActions.ts` / `GenerationCanvas.tsx` | ❌ 不落 | 均为并行估算引擎的接线 | 同上 |
| `modelOptionMappers.ts`（+test）/ `taskApi.ts` | ❌ 不落 | 服务于并行估算引擎 | — |
| i18n `composer.estimateCredits` / `batchGenerate.estimateCredits` | ❌ 不落 | 属未落的每节点/批量估算显示 | — |
| `tests/ux/generation-cost.walk.mjs` | ❌ 不落 | 走查覆盖并行估算 UI，未落 | — |

### 仍缺、留作后续单（不在本轮范围）

1. **画布 `estimatePlanCost` 对齐 `shotPricing.deriveShotPrice`**（消掉「画布不含 specCosts、生产含」的双报价）。
2. **每节点成本预览**（NodeGenerationComposer）：若产品上要，应复用 main 估算器，而非本方案的第二引擎。
3. **实际 vs 估算的对账展示**（provenance 里同时留估算与实际，给用户看偏差）——本轮 schema 的 `unit: 'estimate' | 'actual'` 已为它留位，但只落了 `actual`。
