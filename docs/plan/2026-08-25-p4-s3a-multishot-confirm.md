# P4 S3a — 多镜确认链路（payload 三层扩展 + 多镜确认卡）实施计划

日期：2026-08-25 · 分支 `claude/p4-s3a-multishot-confirm` · 上游：#132(S1 schema)/#138(S2 定价)/#128(token 根层收口)

> 这是 P4 第一个用户可见 UI 切片。样张已用户拍板（见 p4 计划 §6 / 交接单「获批样张」），本切片**实现并逐项对账**，不重开样张。

## 0. 范围（做什么 / 不做什么）

**做（S3a）**：
1. **payload 三层扩展**：electron gate 请求（`mcpProtocol.ts` gate 段 → `appIntegration.ts` 转发 → 渲染层 `capabilityApplyHandler` → `spendConfirm` store 的 contract 槽）从扁平字段扩为**可选**多镜合同投影；**单镜路径字节级不回归**（无 shots → 走今日 `kind:'generation'` 扁平卡，E2E 14/14 兜底）。
2. **多镜确认卡渲染**：`SpendConfirmDialog` 的 `kind:'contract'` 分支，当 contract 带 `shotList` → 渲染新 `MultiShotContractSummary`（逐镜清单 + 固定 footer + 冻结项 + 倒计时伸缩暂停 + 试拍/返回修改文字链）；无 `shotList` → 渲染既有 `ProductionContractSummary`（legacy driver 门不动）。
3. **「先试拍第 1 镜」**：卡上第三种 resolution `trial_first`（confirmed/ignored 之外）沿确认链回传。**主进程真实重封存回路属 S4**——S3a 只交付**卡上按钮 + resolution 回传 + 渲染层把它翻成 gate 决议信号**；若发现与 receipt/challenge 机制有计划未覆盖的冲突→停下按两按钮交付并写报告（禁自行发明授权语义）。
4. **elicitation 优先断言**：一条零额度走查，自声明 elicitation 的假客户端确认多镜计划 → 0 张 GUI 卡（expectAbsent + 阳性基线）。
5. **零额度 E2E 走查**：seed 带 pricing 的多镜计划 → gate → 卡出现（逐镜清单/价格/冻结项/固定 footer 可见）→ 光/暗双截图（卡整体 + footer 特写）→ 点确认 → receipt 消费 + 勾选镜 per-shot 批准盖章 → 到此为止（派发是 S4，显式断言 provider call=0）。单镜回归 14/14 保持。

**不做**：S4 调度/急停、S5 画布、S3b 置顶浮窗、legacy 批量路径收敛、MCP 新工具。卡内不加编辑控件（只读 + 返回修改，一功能一个家）。

## 1. 数据形态（真相源单一，从 S1/S2 derive）

新增**可选** projection，跨 3 层传（都可 JSON 序列化，主进程 → RPC → 渲染层）。定义在渲染层 `productionContractView.ts`（与既有 view 同宿）+ electron 侧一份镜像类型（`mcpProtocol.ts` 的 gate projection）。

```ts
// 逐镜行（只读）
type MultiShotContractShot = {
  shotId: string
  index: number                 // 镜号（1-based）
  sceneOneLiner: string         // 画面一句（PlanCandidate.prompt 截断）
  providerModelText: string     // 模型·模式人话（已在 electron 侧拼好，渲染层不拼串）
  durationSeconds: number | null// 时长（估不出=null→「未知」）
  price: ShotPrice              // S2 的 { known:true, amount } | { known:false }
  degradations: ShotDegradation[] // S2 结构化 code+params，渲染层 t() 翻人话
}
// 计划级
type MultiShotContractProjection = {
  shots: MultiShotContractShot[]
  reminderShotCount: number     // 有提醒（降级）的镜数 → 汇总行「M 镜有提醒」
  knownSubtotal: number         // 已知单价合计（S2 knownSubtotal）
  unknownShotCount: number      // 未知价镜数
  currency: string
  hardLimit: number | null      // 硬上限（≤¥X）
  anchorChips: Array<{ label: string; price: ShotPrice }> // 主角形象 chips（含锚参考费用）
  waitSeconds: number | null    // 预计等待
  frozenItems: string[]         // 冻结项清单（i18n key 数组：shots/models/references/price）
  expiresAt: string | null      // 有效期
}
```

`ProductionContractView` **加一个可选字段** `shotList?: MultiShotContractProjection`。有它→多镜卡；无它→legacy 卡。`buildProductionContractView`（legacy driver 门）不产出 `shotList`，零回归（其 test 用 toMatchObject，加字段安全）。

## 2. 三层管线（每层 diff 点）

| 层 | 文件 | 改动 |
|---|---|---|
| ① electron 协议 | `mcpProtocol.ts` | `GenerationGateChallengeProjection` 加可选 `shots?: MultiShotGateProjection`；类型即协议契约 |
| ① electron 挑战 | `approvalReceipt.ts` | `HumanApprovalDisplay` 加可选 `shots?`（随 challenge MAC 签名，防篡改；这是诚实来源） |
| ② electron 转发 | `appIntegration.ts` | `confirmGenerationInNomi` 把 `challenge.display.shots` 透传进 `requestRenderer('generation.gate.confirm', {...})` |
| ③ 渲染层 handler | `capabilityApplyHandler.ts` | `GenerationGateConfirmPayload` 加 `shots?`；`confirmGenerationGateForAgent`：有 shots→`buildMultiShotContractView`→`requestConfirm({kind:'contract', contract, source:'agent', countdownMs})`；无 shots→今日扁平路径**字节不动** |
| ③ 渲染层 view | `productionContractView.ts` | `buildMultiShotContractView(payload)` 纯函数：payload → ProductionContractView(带 shotList) |
| ③ 渲染层 store | `spendConfirm.ts` | `SpendConfirmRequest` 加可选 `onTrialFirst?: () => void`（试拍回传，沿用「请求对象带回调」模式，不改 boolean 契约） |
| ③ 卡 | `SpendConfirmDialog.tsx` | contract 分支：`contract.shotList` 有→`<MultiShotContractSummary>`+ 多镜专属 footer/按钮；无→`<ProductionContractSummary>`（今日） |
| ③ 卡 | `MultiShotContractSummary.tsx`（新） | 逐镜清单（内部有界滚动 ~40vh）+ 规格条 + 主角 chips + 汇总行 |

**单镜兼容锚**：单镜 gate 的 title 仍 `runtime.capability.generationGateTitle`（「允许 Nomi 生成这一镜？」）——E2E line 150 硬匹配；多镜用新 key `generationGateBatchTitle`（「允许 Nomi 生成这一批镜头？」）。title 由 handler 按有无 shots 二选一。

## 3. 「先试拍第 1 镜」的 S3a 边界

- 卡 footer 左侧文字链「先试拍第 1 镜（¥x）」；点它 → `pending.onTrialFirst?.()` 回传 + `resolvePending(false)`（不算确认、不铸 grant）。
- 渲染层 `confirmGenerationGateForAgent`：`onTrialFirst` 回调把结果标成 `{ confirmed:false, trialFirst:true, challengeId }` 返回给主进程。
- **主进程收到 trialFirst 后的「缩到首镜 + 重封存 + 重发 gate」= S4**。S3a 到「回传信号」为止；`appIntegration.ts` 只需能接住并原样上抛（不落地重封存）。若接住处发现与 receipt 机制冲突（如 gateConfirmation 契约只认 confirmed boolean）→ **停，按两按钮交付**（去掉试拍链），冲突写报告。

## 4. 文案（零内部术语，全走 i18n · zh-CN + en）

新 key 落 `generationCommon.production.batch.*`（卡文案）与 `runtime.capability.generationGateBatchTitle`（标题）+ `generationCommon.production.degradation.*`（降级 code→人话）。术语红线：卡上不得出现「锚/封存/物化/合同」。

## 5. TDD 顺序

1. `productionContractView.test.ts`（扩）：`buildMultiShotContractView` 把 payload 投影成带 shotList 的 view；未知价→「未知」不伪造 0；降级 code 透传。
2. `MultiShotContractSummary` 结构测试（可选，走 vitest + RTL 若已有范式）——优先靠 E2E 真机走查覆盖视觉。
3. 单元：handler 有/无 shots 的分支（有→contract kind + 新 title；无→generation kind + 旧 title 字节不变）。
4. 走查：elicitation 优先（0 卡）+ 多镜 E2E（卡可见 + 双截图 + 确认 + per-shot 盖章 + provider=0）。
5. 回归：`node tests/ux/mcp-generation-single-shot-gui-fallback.e2e.mjs` 14/14。

## 6. 验收门

`pnpm run gates` 全绿；样张逐项对账表（见最终报告）；术语人话；降级/未知走结构化 code 经 t()；截图光/暗双模式亲读。

## 7. 回滚

每层改动都是**加可选字段 + 有它才走新分支**；删掉 `shots` 透传即回今日扁平卡。单镜 E2E 是回归门。
