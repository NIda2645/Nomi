# P4 — 锚定妆照检查点的生产审批入口（修 §8.5 停死 gap）

> 来源：S6.5 付费验收实查发现（#155 plan §8.5）——带锚多镜批走到 anchor_checkpoint 就停死无路可走。
> 本切片 = §8.5 裁定的「加 MCP 审批入口 + scheduler 重踢」腿（headless，选项 A）。渲染层检查点卡（选项 B）是用户可见 UI，按 R8 需样张拍板，本切片不做、单独上报。

## 1. 根因（两条腿，缺一都停死）

1. **没有任何入口被授权决定这道门**：
   - `dispatcher.ts:378-380`：`production.decide-gate` 只放行 creative 门（stage + direction/sample/freeze 前缀），anchor_checkpoint 403「must be decided in Nomi」；
   - `mcpProtocol.ts:281-283`：协议层 elicitation 前置检查**手抄了同一条判定**（报错串还不同——查重按签名不按报错串的教训又一例），支持 elicitation 的客户端在这里就被拦，根本到不了 dispatcher；
   - 渲染层无审批卡（S5 只落了展示占位）。
2. **就算门决了也没人重踢批次**：生产 scheduler 不设 `anchorAutoReleaseMs`（有意——付费镜必须真人过目），而 `gate.decide` 落库后没有任何钩子恢复批次。对照：freeze/sample/shot/export 门在 `productionRunService.command` 决议后都有 `driveGeneration`/`driveExport` 重踢钩子（`productionRunService.ts:545-611`），唯独 anchor_checkpoint 没有——因为它的驱动器（多镜批 scheduler）活在 appIntegration，service 够不着。

测试全靠 `repository.execute` 直发 gate.decide 或 `anchorAutoReleaseMs:0` 绕过，把两条腿都盖住了。

## 2. 方案（修在根因层）

**重踢挂在 service 的 post-decide 钩子层**（与 freeze/sample 门同一个家，P1）：任何入口（MCP dispatcher、渲染层 IPC、未来的检查点卡）的 gate.decide 都过 `service.command` → 钩子统一触发，「入口忘了踢」这类 bug 整族消失（P2）。service 够不着 appIntegration 的 scheduler builder → 新增晚绑定插槽（appIntegration 已有同 idiom 的模块级 hook slot）。

| # | 文件 | 改动 |
|---|---|---|
| 1 | `electron/productionRun/batchSchedulerKick.ts`（新） | 晚绑定 kicker 插槽：`registerBatchSchedulerKicker` + `kickBatchSchedulerForRun`（异常吞掉只 warn） |
| 2 | `electron/productionRun/productionRunService.ts` | post-decide 钩子：decidedGate 是 anchor checkpoint（`isAnchorCheckpointGate`）→ kick。approved/rejected 都踢——纯重派生，rejected 未 stage 新 attempt 时是免费空 tick；stage 过（S6 重出形象）就续跑 |
| 3 | `electron/capabilityCore/dispatcher.ts` | 放行 `isAnchorCheckpointGate(gate)`（共享判定，不再手抄前缀）；其余非 creative 门仍 403 |
| 4 | `electron/capabilityCore/mcpProtocol.ts` | elicit 前置检查同步放行 anchor checkpoint；elicitation 文案走 W2 冻结门同款「视觉确认」语义：先过目定妆照（Nomi 画布已落 S5 占位图/助手展示 artifact），批准=开拍已授权预算内的镜头批（检查点本身不授权新预算，如实说） |
| 5 | `electron/capabilityCore/appIntegration.ts` | `registerBatchSchedulerKicker(kickSchedulerForRun)`（紧跟其定义处） |
| 6 | `electron/capabilityCore/mcpToolCatalog.ts` | `nomi_decide_gate` 描述补：定妆照检查点（gate-anchor-checkpoint-*）可决，决前先取定妆照给真人过目 |
| 7 | `electron/capabilityCore/mcpToolResults.ts` | ① get_run：waiting 的检查点门 → 转述「定妆照在等确认，先看 gate.jobIds 对应 artifacts 再 nomi_decide_gate」；② decide 回执：检查点批准 → 「✓ 定妆照通过，开拍镜头批次」/ 否决 → 「保留定妆照，重出形象后再来」 |

## 3. 不动项

- `anchorAutoReleaseMs` 生产仍不设——付费前真人过目是有意设计，不是本 gap。
- 渲染层「定妆照检查点」审批卡（选项 B）：UI 改动，R8 样张+拍板后另做；本次 service 钩子落地后，卡只剩「画 UI + 发 gate.decide IPC」，resume 免费拿到。
- S4 poll 循环对慢真 provider 失效（§8.5 连带 gap #2）：已另 spawn，不混进来。
- scheduler/derivation 内部逻辑零触碰。

## 4. 验收门

- 单测：dispatcher 403 矩阵（anchor 放行；budget_envelope/export/job_set 仍拒）；service 钩子（anchor 决议触发 kicker、别的门不触发、无注册不炸）；协议层 elicit 接受检查点门。
- **E2E（真入口，不再 repository.execute 注入）**：真 loopback vendor + 真 durable Run + 真 service + 真 dispatcher —— create→锚生成→checkpoint waiting→`production.decide-gate` approved→**钩子重踢**→镜批完成；断言总提交=锚+镜、每 job ≤1 submit；另一条 rejected：门落 rejected、零新提交、批次安睡。
- `pnpm run gates` 全绿。

## 5. 回滚

纯入口+接线，无数据结构/门 schema 变更：revert 即回到「检查点只能测试注入」现状，存量 Run 不受影响。
