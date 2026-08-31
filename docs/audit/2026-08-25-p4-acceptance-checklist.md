# P4 多镜连续性 · 验收门逐项打钩（2026-08-25 收官）

> 验收门原文：`docs/superpowers/plans/2026-08-24-p4-multishot-continuity.md` §5。
> 交付链：S1 #132 / S2 #138 / S3a #143 / S4 #148 / S5 #151 / S6 #153 / S6.5 #155（生产入口）/ 加固 #156+#158 / 修复 #154 #162 #163 / 锚复用 #161 / S7a #165 / 形象确认卡 #167 / 防误诊护栏 #168。全部在 `origin/main`。

## §5.1 E2E 变体（loopback 零额度）——✅ 5/5

| 变体 | 证据 |
|---|---|
| 1. 超预算批次停在正确第 K 镜 | `multiShotBatchScheduler.e2e.test.ts`（¥13 授权→触顶即 typed halt，needs_attention + BudgetHalt 结构）|
| 2. 两镜同参数不撞键 | `productionGenerationSubmission.ts:262-287` shotId 显式编入幂等键；`batchScheduleDerivation` jobId 含 shotId；e2e 断言 `new Set(submits).size===submits.length` |
| 3. 锚不满意只重锚 | `anchorCheckpointApproval.e2e.test.ts`（reject → gate rejected、零新提交、定妆照保留、镜头不派发）+ S6 返工链（锚也是 shot）|
| 4. 用已有锚开新计划 | #161 `mcpMultiShotAnchorReuse.e2e.test.ts` 6 用例（复用锚 0 提交/无检查点/合同带资产/跨镜同 assetId + 归属校验负例 3 条）|
| 5. 断开客户端批次继续 | J3 detached 用例（fire-and-forget 后台完成）+ #158 慢供应商重启用例（FRESH scheduler 从 durable Run 恢复、re-kick 零新提交）|
| 不变量「每 Job ≤1 submit · 总请求=锚+镜」 | 9 处断言（multiShotBatchScheduler e2e ×7、入口 e2e、检查点 e2e）|

## §5.2 P1-P3 单镜回归门——✅

每次 gates 全量跑（收官日多轮 6400-6477 用例全绿）；`createNewAttempt` reason 门未动；单镜确认卡字节不动（S6 裁定记录）。

## §5.3 R13 走查截图亲读——✅（一项范围裁定）

| 项 | 证据 |
|---|---|
| 多镜卡（固定 footer）| `mcp-generation-multishot-confirm.e2e.mjs` 4 截图（光/暗 × 卡/footer），卡上零内部词断言 |
| 锚检查点 | #167 `anchor-checkpoint-card.walk.mjs` 15 断言 + 光/暗/zh/en 截图（样张 2026-08-25 用户拍板后实现，逐项对账 ✅）|
| 三态占位 | S5 `p4-s5-canvas-landing.e2e.mjs`（光/暗 + warning≠danger 计算色断言）|
| 编组一步撤销 | 同上（4 节点+组一步 Cmd+Z 全撤，03-after-undo 截图）|
| halt 卡片 | S5/S6 走查（已停占位 warning 暖底+人话文案+提额续拍钮）|
| 时间轴连片 | **范围裁定**：按已终审 Master Plan（2026-08-25 B0 定稿）§5.1，「整批按分镜顺序排进时间轴」= E1 采纳桥（P5）交付物，非 P4 项。纸面依据在案 |

## §5.4 APIMart 低规格真付费验收——✅（超额完成）

- #158 记账：3 轮真金（含内容审核挡 0 计费 ×2），**链路史上第一条真视频 submit→慢轮询→completed→materialize 全程落盘**，花销 ≈¥1.32。
- S6.5 首轮：真入口→GUI 真卡→真收据→2 条 t2v 真提交（`provider_accepted`）。
- 体验走查 J1 真金：锚图+镜头图真生成（`docs/audit/2026-08-25-experiential-walkthrough-j1.md`）。

## §5.5 gates 全绿 · 样张对账 · 术语人话——✅（一项小残留入 backlog）

- 收官日每个 PR 合并前 gates 全链真退出码通过（filesize/tokens/i18n/heavy-path/test-waits/walkthroughs/agents-sync/batch-machines/lint/typecheck/test/build）。
- 样张对账：S3a 卡、S5 三态、S6 版本条、#167 形象确认卡——获批样张逐项对账记录在各 PR。
- 术语：S3a 卡零内部词断言在门；「冻结」族 #162 收敛为「定妆」；「合同」族 #163 清零；**残留**：「锚」族在分镜方案编辑器（storyboardEditor.ts）文案中仍在——列 backlog 小切片（非确认卡面，不阻验收）。

## 范围裁定与债务（诚实边界，D4）

| 项 | 裁定 | 去向 |
|---|---|---|
| S7 legacy 收敛 | S7a 交付（#165：三台机器盘点、legacy MCP 路验证 fail-closed、GUI 路显式冻结、`check:batch-machines` 门岗 4 规则先验会红、冻结判据防第三份）；全量收敛受 08-22 运行时 ADR 约束（Canvas owner 迁移=P5） | S7b（driveGeneration 收编，删 ~120 行）已排期；S7c 挂 P5 后 |
| 插镜 | durable 模型无「向已 submitted 计划追加 shot」命令，S6 有意识裁剪（注释在案） | 计划修订命令层，随 S7b/编辑计划迭代 |
| 复用徽标投影 | #167 视图留 `reused` 槽，等复用真相源投影 | 小项，随 E1 前清理 |
| 超时自动放行 per-gate 取消 | #156 无 per-gate 覆写接口，生产默认不设自动放行 | 需要时随配置面演进 |
| F3 拆镜显著性 + F16b 双确认卡/记住托管选择 | 需样张 | 合并一轮样张拍板 |

## 结论

**P4「小说/剧本→一集」生产段验收门全项达标，宣告完成。**多镜+锚一致性+一次确认+落画布+返工/续拍/版本+生产入口+真金验证全链在 main；两项范围外推有已终审文档纸面依据；债务清单如上、每项有归属。体验走查（R16）报告另见 `2026-08-25-experiential-walkthrough-j1.md`：8 摩擦 6 修入 main、1 撤案（误诊，护栏落 #168）、1 进样张队列。
