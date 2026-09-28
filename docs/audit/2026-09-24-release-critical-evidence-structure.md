# `.github/workflows` 结构评审：发布候选验证必须先收集证据，再做一次判决（2026-09-24）

> 状态：✅ 结构评审已交付（`check:symptom-cluster` 触发；本轮 `.github/workflows` 在 7 天窗口内已有多份根因合同）
> 本轮合同：[`2026-09-24-release-critical-batch-evidence`](../fixes/2026-09-24-release-critical-batch-evidence.root-cause.json)
> 近邻评审：[`2026-09-22-quality-gate-workflow-structure.md`](./2026-09-22-quality-gate-workflow-structure.md)

## 1. 这次新增的失败模式

`desktop-rc.yml` 的 release-critical 验收把 Clip、Production MCP、MCP suite、elicitation 和 canvas performance 放在同一个多命令 `run: |` 里。第一条旅程退出非零后，shell 直接结束，后面的旅程既没有通过也没有失败证据。RC 得到的是“第一条红”，不是“这一轮所有问题”。

这与 9 月 18 日的 E2E fail-fast 合同属于同一类结构缺口：**证据收集和最终判决共用一个退出码**。它与 9 月 22 日“核心走查根本没启动”又相邻：**车道是否执行、执行留下什么、最终如何判定没有被拆成机器可核对的三个职责**。

## 2. 现有合同是否重复修同一件事

不是重复实现同一条逻辑，而是同一层暴露了三个不同入口：

| 合同 | 真正问题 | 关系 |
|---|---|---|
| `2026-09-18-e2e-job-fail-fast-serializes-findings` | 一条链第一处失败掩盖后续失败 | 同类证据收集问题 |
| `2026-09-22-core-flow-walkthrough-never-ran-in-ci` | 登记的核心场景没有真正启动 | 车道路由/覆盖面问题 |
| `2026-09-23-release-candidate-browser-runtime` | RC 浏览器运行时与发布验证边界不一致 | RC 环境问题 |
| `2026-09-24-release-critical-batch-evidence` | release-critical 长链无法收齐独立失败 | 本轮直接问题 |

工作流目录是粗模块键，不能据此断言这些合同都应合并。它们共同指向一个更稳定的不变量：**每条独立验收必须有自己的执行结果，整个 RC 只能在所有结果收齐后由一个 fail-closed 汇总步骤判定。**

## 3. 结构决策

本轮将五条旅程拆成五个串行、`continue-on-error: true` 的步骤。保持串行是为了复用同一 Electron runner、端口和测试项目；允许单步失败后继续，是为了收齐剩余旅程；末尾 `if: always()` 的 summary 读取所有 step outcome，遇到失败、取消、未知或缺失均失败。无论前面结果如何，截图、日志和输出目录由独立 artifact 步骤上传。

唯一 owner 如下：

| 概念 | Owner | 消费者 |
|---|---|---|
| release-critical 旅程清单与顺序 | `.github/workflows/desktop-rc.yml` | summary、artifact 步骤 |
| outcome 的 fail-closed 判定 | `scripts/summarize-e2e-chain.mjs` | RC summary |
| 工作流形状门禁 | `scripts/check-desktop-rc-workflow.node-test.mjs` | `gates:contracts` |

## 4. 机器防回退

`check:desktop-rc-workflow` 锁定五个独立 step、各自 `continue-on-error`、`if: always()` summary、summary 不得继续吞错，以及始终上传证据。它已接入 `gates:contracts`，因此后续 AI 若把步骤合回 fail-fast 长链，会在提交前被拦下。

这份评审只处理工作流的证据编排；不把本轮 Clip 走查中修正的命中点、可见节点计数或时间轴判据当成生产修复，也不因此扩大到 MCP 或性能实现。

## 5. 仍然保留的边界

单个旅程自身如果挂死，仍由该命令的超时策略负责终止；串行收集不会替代旅程内部的超时。RC 结论仍以真实 merged SHA、真实 Electron 旅程和最终工作流结果为准，本地走查通过不能直接代替发版收据。
