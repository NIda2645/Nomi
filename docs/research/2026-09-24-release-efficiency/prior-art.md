# 先查别人：发布验证如何一次收齐失败（2026-09-24）

> 服务于 [`docs/plan/2026-09-24-release-followup-and-batch-rc.md`](../../plan/2026-09-24-release-followup-and-batch-rc.md)。
> 目标是确认本轮应复用的收集、分层和 fail-closed 机制，不为发布流程再造第二套执行器。

## 要回答的问题

1. 依赖、仓库和生态里是否已有「全部跑完再汇总」及「每步有界」的正解？
2. 本轮哪些能力应复用，哪些只需为桌面 RC 增加结构门禁？
3. 哪些外部资料与本次内部 CI 问题无关，不能假装查过？

## ① 依赖里已有？

- GitHub Actions 原生支持 step 的 `continue-on-error` 与 `timeout-minutes`；官方语法见 <https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax>。因此本轮不引入新的 CI 编排依赖，直接用 workflow 原语收集 outcome，再由最后一步作结论。
- Playwright 自身提供测试级 timeout，但它不能替代 GitHub step 的外层上限；RC 需要同时约束测试和 runner 死等，故采用仓库 workflow 的 20 分钟 step timeout。

## ② 仓库里已有？

- `scripts/run-gates-contracts.mjs:3-12,104-161` 已经定义「所有门岗跑完再汇总」，并保持阻断失败 fail-closed；这是本轮批量收集的直接范式。
- `.github/workflows/quality-gate.yml:171-220` 已经把多条 Electron/浏览器旅程设为 `continue-on-error`，由末尾 summary 读取每个 step 的 `outcome`，未知状态按失败处理；本轮桌面 RC 沿用同一判据。
- `scripts/validation-policy.mjs:30-57` 已经把验证基础设施改动提升到 full unit、desktop、journeys 和 canvas 套件，说明「改验证器不能只跑 focused」是仓库已有的风险分层规则。
- `scripts/check-quality-gate-workflow.node-test.mjs` 是 workflow 结构门禁的现成做法；本轮新增 `check-desktop-rc-workflow` 只钉住桌面 RC 的五条旅程、timeout、summary 和 artifact，不另造运行时。

## ③ 生态里的边界

GitHub 官方文档支持本轮采用的 step 级 timeout 和继续收集语义；没有必要再引入第三方 CI 编排器。外部产品、市场和 TikHub 资料不参与本次判断：这是仓库内部发布验证的结构问题，不是用户市场或产品交互调研；本报告没有把「未查 TikHub」写成「生态没有先例」。

## 结论

复用仓库已有的「批量执行 → 汇总判定 → fail-closed」链路，并在桌面 RC 的结构门禁中补齐五条 release-critical journey 的身份、20 分钟上限、最终 summary 和证据制品。Unit full lane 继续按 required check 等到终态或仓库明确 timeout；不以 focused、旧 SHA 或人工拼接替代。MCP C9b 若重复红，按独立 blocker PR 处理，避免把业务故障和流程固化混在 #854。
