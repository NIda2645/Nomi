# `.github/workflows` 结构评审：候选包的「内容」此前没有任何一步在看（2026-09-28）

> 状态：✅ 结构评审已交付（`check:symptom-cluster` 触发：`.github/workflows` 在 2026-09-22 至 2026-09-28 的 7 天里收到第 5 份根因合同）
> 本轮合同：[`2026-09-28-package-contents-unaudited`](../fixes/2026-09-28-package-contents-unaudited.root-cause.json)
> 方案：[`docs/plan/2026-09-28-release-audit.md`](../plan/2026-09-28-release-audit.md)
> 近邻评审：[`2026-09-24-release-critical-evidence-structure.md`](./2026-09-24-release-critical-evidence-structure.md)、[`2026-09-22-quality-gate-workflow-structure.md`](./2026-09-22-quality-gate-workflow-structure.md)、[`2026-09-23-ci-release-validation-structure-review.md`](./2026-09-23-ci-release-validation-structure-review.md)

## 1. 这次新增的失败模式

`desktop-rc.yml` 的两个平台作业原先是：打包 → 验反馈回路的出厂配置 → 验 ffmpeg/ffprobe 平台目标 → 打包版 MCP 冒烟 → 上传候选包。每一步回答的都是「这个包能不能跑通某条路」，没有一步回答「这个包里装了什么、多大」。于是 0.22.4 的 Windows 包装完 1.2GB、`app.asar` 654MB，其中界面代码只有 30MB——47 个界面库被 electron-builder 原样又装了一份，外加 1.4 万个 source map、55 个语言包和 6 个在 Windows 上跑不起来的原生文件。2026-08-07 的 ffmpeg/ffprobe 多平台 560MB 是同一个空洞的上一次发作。

## 2. 与本窗口其它合同的关系

| 合同 | 真正的问题 | 与本次的共同点 |
|---|---|---|
| `2026-09-22-core-flow-walkthrough-never-ran-in-ci` | 登记的核心走查根本没起进程 | 「用户会碰到的东西」有没有被某条验证覆盖，没人声明 |
| `2026-09-23-release-candidate-browser-runtime` | RC 的执行环境缺浏览器，测试没开跑就挂 | RC 这一层的执行边界靠事后补 |
| `2026-09-24-release-critical-batch-evidence` | 第一条旅程红了，后面的证据全丢 | 证据收集与判决没分开 |
| `2026-09-25-canvas-video-players-always-mounted` | 画布视频播放器常驻；为防回退接了质量门的车道 | 验证覆盖在出事后才加 |
| `2026-09-28-package-contents-unaudited` | 候选包的内容与大小没人看 | 同上：出事后才加 |

这五份不是在修同一段逻辑，工作流目录只是粗的模块键。它们共同暴露的结构问题是：**「发版前要验证哪几类东西」没有一张清单，工作流里的检查是一次事故补一步长出来的**。每一步补得都对，但下一个没人看的面只能等用户撞上。

## 3. 结构决策

- 方案 §1 把用户真正拿到、而仓库门岗都没看过的东西列成四类（安装包本身、装完与升级、真人全功能点一遍、发版后的表现），§2 给每类定了一层检查与接入时机。这张表就是缺的那张清单；本轮先接 A（安装包本身），B–E 按 §4 的顺序接。
- 方案 §2 的「例行问题」——每份审计报告都要回答「这次有没有用户会碰到、但没有任何检查看过的东西？」——是给「发现盲区」这件事本身安排了 owner，而不是等下一次事故。
- 判据不写在工作流里：工作流只负责在对的时机调用、上传报告、让作业变红。

| 概念 | Owner | 消费者 |
|---|---|---|
| 包里允许有什么（身份与大小基线、禁带文件、运行时闭包） | `scripts/audit-package.mjs` + `docs/engineering/package-budget.json` | `desktop-rc.yml` 两个平台作业 |
| `dependencies` 与主进程运行时证据的对账 | `scripts/check-packaged-deps.mjs` | `gates:contracts` |
| 二进制能不能在目标平台跑 | `scripts/packaging/native-binaries.cjs` | afterPack 裁剪、包体审计 |
| RC 工作流的形状 | `scripts/check-desktop-rc-workflow.node-test.mjs` | `gates:contracts` |

## 4. 机器防回退

- `check:packaged-deps` 与 `check:package-budget` 在每个 PR 的 contracts 里跑：多数包体回退（把界面库放回 `dependencies`、排除名单与 `build.files` 不同步、欠账过期）在合并前就红，不必等到打候选包。
- `check:desktop-rc-workflow` 钉住：审计步骤不许 `continue-on-error`，报告上传 `if: always()`，审计排在候选包上传之前，不许再出现并行的媒体目标检查入口。
- 基线只许 `--update-baseline` 显式改，变大必须写理由进 history；有禁带文件或断链的包不许当基线。

## 5. 仍然保留的边界

- macOS 的大小与身份基线要等下一次 desktop-rc 的报告登记（欠账 2026-10-12 到期）；在那之前 mac 作业只查禁带文件与运行时闭包。
- desktop-preview 的包继承了同一套打包配置，但没有接审计。
- 装完与升级（B）、全功能走查（C）、性能预算（D）、发版后盯盘（E）仍未接入，它们是这一层下一批「没人看」的面，顺序见方案 §4。
