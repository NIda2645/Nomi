# T1 · elicitation-first 画布方案确认 + 会话级信任（P0-A）

日期：2026-08-18 ｜ 母方案：`docs/plan/2026-08-18-mcp-experience-overhaul.md` 执行表 T1。

## 范围（只做这一件）

批量加节点（`nomi_add_nodes`，≥2 节点触发 `confirmPlan`）的确认改 **elicitation-first**：
声明支持 elicitation 的聊天客户端 → 把「要不要加这批节点」递进对话里问一次，且**按 (会话 × projectId) 记一次会话级信任**，同会话同项目后续批量不再问；App 内渲染进程弹窗仅在**客户端不声明 elicitation** 时保留（逐字节不变）。

**不动（明确排除）**：花钱 / 导出 / 发布确认、创意门（`nomi_decide_gate`）、任何渲染层 UI——钱路最终决定权仍在 App。母方案引言把「花钱确认」也并进 P0-A，但执行表 T1 行与本 T1 任务书都钉死「花钱/导出路径不动」，以后者为准。

## 现状（读码实证，非猜）

- `core.ts:203` `addProjectNodes`：`specs.length >= 2` → `gateway.confirmPlan(...)`；`!approved` → `{ids:[],cancelled:true}`。**唯一** confirmPlan 调用点（delete/connect 都不过 confirmPlan）。
- App 开着：`nomi_add_nodes` → `transport.invoke('canvas.addNodes')` → RPC 到 `rpcServer.ts`（另一进程）→ 渲染层/混合网关 → `requestRenderer('plan.confirm')` 弹窗（`gateway.ts:132-140`，65s 超时→false）。
- Headless：进程内 `dispatch` → `createDiskGateway.confirmPlan()` 直返 true（免费可撤，`gateway.ts:84-86`）。
- 协议层已有 elicitation：`mcpProtocol.ts:410` `elicitBooleanConfirm`（300s），已被 `nomi_decide_gate`（:568）与「App 关着的花钱确认」（:601）用。二者都是「协议层拦在 `transport.invoke` 之前，拿到 accept 才 invoke」。
- 付费透传先例：`McpInvokeOptions { spendConfirmed }`（:25）→ `mcpStdioServer.invoke`（:93）换 `makeConfirmedGateway`。但 spend 只在 headless 触发，`spendConfirmed` **从不跨 RPC**。

## 设计（root-cause，mirror 现有先例，P1 无并行版）

协议层在 `tools/call` 里为 `nomi_add_nodes` 加一段前置判定（与 decide_gate/generate 同构，同一 seam）：

判定输入：`clientSupportsElicitation`、`transport.isAppOpen()`、`nodes.length`、`projectId`。

1. `nodes.length < 2` 或 **客户端不声明 elicitation**：原样 `transport.invoke`（App 弹窗/ headless 自动放行都不变）。
2. 客户端声明 elicitation **且 headless**（App 没开）：不 elicit，原样 invoke（headless 本就自动放行——母方案与任务书均要求保留）。
3. 客户端声明 elicitation **且 App 开着**：
   - 已按 (session×projectId) 信任 → 直接带 `{ planConfirmed:true }` invoke（不 elicit、不弹窗）。
   - 未信任 → `elicitBooleanConfirm` 问一次。accept+confirm → 记信任 + 带 `{ planConfirmed:true }` invoke；decline/超时 → 直返 `{ids:[],cancelled:true}` 形状（不 invoke，形状与今天一致）。

**不重复问（1c 关键）**：App 开着走 elicitation 时必须让下游渲染层弹窗**不出现**。做法 = 把 `planConfirmed` 透过 `McpInvokeOptions` 传下去，让最终跑 `confirmPlan` 的网关**预批准**（返回 true 不弹卡）。这是 `spendConfirmed` 的对称扩展；因方案 elicitation 发生在 App 开着，故 `planConfirmed` **必须跨 RPC**——两处 `callViaRpc`（stdioServer、nodeLauncher）把它放进 RPC body，`rpcServer` 读出、`dispatch` 收进 ctx，`canvas.addNodes` 用一个「confirmPlan 预批准」网关包裹。core.ts 的 `addProjectNodes` 不改签名（仍调 `gateway.confirmPlan`，只是它现在返回 true）。

**信任存储**：纯内存，挂 `createMcpProtocol` 闭包（= 一条 MCP 连接/会话），连接断即随进程亡；不持久化；键 = `session × projectId`（每连接一个协议实例故 session 天然隔离，键只需 projectId；不同 projectId 各自 elicit）。逻辑单拎一个小模块 `mcpPlanTrust.ts`（mcpProtocol.ts 已 719 行，加逻辑必破 800 门 R9）。

**文案**：zh-CN，跟现有 elicit 提示口吻（「往画布加 N 个节点」+ 免费可撤 + 批准后本会话该项目不再问）。locale 管道是后续任务，这里不建。

## 改动清单

- 新 `electron/capabilityCore/mcpPlanTrust.ts`：会话级信任 store（内存 Set of projectId）+ 方案确认文案构造。
- `mcpProtocol.ts`：`McpInvokeOptions` 加 `planConfirmed?`；tools/call 加 `nomi_add_nodes` 前置判定；用 trust store。
- `mcpStdioServer.ts`：`invoke` 里 `planConfirmed` → RPC body 带上 / 进程内 dispatch 用预批准网关。
- `mcpNodeLauncher.ts`：`callViaRpc` 把 `planConfirmed` 放进 RPC body。
- `rpcServer.ts` + `dispatcher.ts`：读出 `planConfirmed`，`canvas.addNodes` 用「confirmPlan 预批准」网关包裹。
- `gateway.ts`：加一个「预批准 confirmPlan」的薄包裹工具（供 dispatch 用），不动现有三网关语义。

## 测试（TDD，纯协议层注入假 transport；复用 nomiMcpElicitation.test.ts 的 ProtocolHarness 模式）

a. 声明 elicitation + App 开 → 恰好一次 elicit、renderer 不被调、accept 返 true 且带 planConfirmed。
b. 同 session 同 project 第二批 → 不 elicit、直接带 planConfirmed invoke。
c. 同 session 不同 project → 再 elicit 一次。
d. decline → cancelled 形状、不 invoke。
e. elicit 超时 → cancelled 形状、不 invoke。
f. 不声明 elicitation + App 开 → 老路（invoke 无 planConfirmed），逐字节不变。
g. headless（App 没开）+ 声明 elicitation → 不 elicit、invoke 无 planConfirmed（自动放行不变）。
+ 现有 capabilityCore 全套仍绿（core.test / dispatcher / journey / elicitation）。

## 验收门

`pnpm vitest run` 相关文件全过 + `pnpm run typecheck` + `pnpm run check:filesize`。单 commit，不 push。
