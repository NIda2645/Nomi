# `scripts` 层结构评审：脚本替交付流水线判断「该跑什么、该装什么、该拦什么」，判据没有对照清单（2026-10-01）

> 状态：✅ 结构评审已交付。
> 触发：`check:symptom-cluster`——模块 `scripts` 在 2026-09-27 至 2026-10-01 的 7 天里收到第 3 份根因合同。
> 本轮合同：[`2026-10-01-canvas-classifier-display-owners`](../fixes/2026-10-01-canvas-classifier-display-owners.root-cause.json)
> 同层近邻（本文在它们的基础上写，不另起一套）：
> [`2026-09-27-scripts-ponytail-receipt-structure-review.md`](2026-09-27-scripts-ponytail-receipt-structure-review.md)（发布收据边界）、
> [`2026-09-28-release-package-contents-structure.md`](2026-09-28-release-package-contents-structure.md)（候选包内容没人看）、
> [`2026-09-22-quality-gate-workflow-structure.md`](2026-09-22-quality-gate-workflow-structure.md)（车道 / 证据 / 判决挤在一份 YAML 里）。

## 1. 窗口里的三份合同

| 合同 | 症状 | 脚本替谁做了什么判断 | 判据对着什么 |
|---|---|---|---|
| `2026-09-27-release-tag-blocked-by-dev-hook` | 发版打标签被开发用的 pre-push 钩子拦住，发布靠人在本机补打标签 | `verifyPushReceipt`：这次推送带不带需要评审的新内容 | 按 ref 的**形状**判（非删除即新内容），没有对着「这个提交是不是已经在远端历史里」 |
| `2026-09-28-package-contents-unaudited` | 安装包 334MB，里面有渲染层库、source map、测试、外来平台二进制，没人看 | 打包配置 + 审计脚本：该装什么 | 按**声明的依赖**装，没有对着主进程运行时真实引用的证据，也没有对着上一次包的身份与体积 |
| `2026-10-01-canvas-classifier-display-owners` | 画布显示的改动只跑了 critical，full 档的 Canvas Acceptance 被跳过，S5 回归进了 main | `classifyValidationPolicy`：这个 diff 该跑哪些验证 | 按**手写路径正则**判，没有对着「谁决定画布上显示什么」的概念清单 |

三份的症状相距很远（推送被拦、包太胖、回归漏网），改的是三个不同的文件，所以**不是同一段逻辑反复坏**。`scripts` 只是一个很粗的模块键，这一点和 09-27、09-22 两份评审的判断一致。

## 2. 共同的结构问题

三份缺的是同一句话：

> **脚本层里每一条「替流水线做的判断」，必须有一份它要覆盖的真实集合，并且有一个机器去核对「判据和这份集合对得上」。**

现状是三处都只有判据、没有集合：

- 标签：判据是 ref 形状，真实集合是「远端已有的提交」，两者从没对过；
- 包：判据是 `dependencies` 声明，真实集合是「主进程运行时真的 require 到的包」和「上一次包里真的有什么」，两者从没对过；
- 分档：判据是路径正则，真实集合是 `docs/engineering/concept-owners.json` 里「画布显示」相关概念的 owner 与写口，两者从没对过。

没有对照，判据就只能靠「出一次事、补一个文件名 / 一个检查」长出来。每一次补都是对的，但下一次漏的是另一个文件。这是 09-28 那份评审对 `.github/workflows` 写过的同一个形状（「检查是一次事故补一步长出来的」），现在在 `scripts` 里又出现一次：**脚本层是流水线的判官，却没有给判官配对照表。**

## 3. 这次的做法算不算从结构上治住了

**治住了一部分，没治住全部。**

已经治住的：

1. 分档清单 `CANVAS_DISPLAY_OWNER_PATTERNS` 现在有一个机器核对它的测试：对着 `concept-owners.json` 里 6 个画布显示相关概念（`production.shot-phase` / `shot-generation-ownership` / `shot-jobs` / `run-stop-reason` / `run-lifecycle-settle` / `node-run-record`）的 owner 与写口，每个文件单独改都必须得到 full。从清单里删掉一条（本次验证过，删掉 `productionRunLifecycle` 测试即红）测试就红。
2. `generationCanvas` 的每个子目录必须表态：产出显示的归 full，只管手势或样式的归 critical。**新增目录没表态，测试就红**——这堵住的是「新目录默认落到低档」这条回来的路。
3. #934 / #940 / #937 的真实文件清单作为输入固定在 `scripts/validation-policy-canvas-escapes.json`，这三次不会再漏。
4. 分类器本身登记成概念 `delivery.validation-policy`（`docs/engineering/concept-owners.json`），CI 选档、本机 gates、交付收据三处共用它这一个函数，登记里写明不许任何一处自己再判一遍。

仍然没治住的：

- 对照集合里「哪些概念算画布显示」是测试里**手写**的 6 个 subject。概念改名或删除会让测试红（有断言），但**新增一个画布显示概念不会自己被纳入**——还得有人想起来往这个集合里加。这是把「靠人记文件名」降级成「靠人记概念名」，范围小得多，但没有消失。
- 清单里 `electron/productionRun/*` 和 `src/workbench/production/*` 仍是文件名枚举；它们是被概念表对照住的，但对照只覆盖概念表里登记过的文件，表外的新文件仍会落到低档。
- critical 与 full 两档各跑哪些场景（`tests/ux/canvas-real-suite.mjs` 的两张清单）和「哪些显示主人该被哪个场景保护」之间没有对照：本次是把主人全部提到 full，用 CI 时间（两片并行各约 3 分钟）换覆盖，而不是证明 full 里确实有场景覆盖它们。
- 标签与打包这两条线（09-27、09-28）的对照问题，各自的评审已经处理：前者收据判据按「已在远端历史」判（`alreadyOnRemote`），后者有 `check:packaged-deps` 与 `package-budget.json` 的运行时证据与身份基线。本次没有碰。

## 4. 同类判据还剩哪些（只列，不在本次动）

都在 `scripts/validation-policy.mjs` 里，都是路径 / 文件名正则，没有对照表：

| 判据 | 位置 | 风险 |
|---|---|---|
| `JOURNEY_PATTERNS` | 靠文件名里的 `agent` / `bridge` / `credential` / `model` / `provider` / `catalog` 等词选「真实旅程」档 | 名字里没有这些词的新主人漏档；与 `REAL_USER_TEST_MANIFEST` 登记的走查没有机器对照 |
| `PACKAGE_PATTERNS` | 决定何时跑打包档 | 新增原生依赖或打包脚本落在表外时漏档 |
| `PERFORMANCE_PATTERNS` / `PERFORMANCE_INSTRUMENT_PATTERNS` | 决定何时量性能 | 性能预算的输入（真实素材登记表）已列，其余画布路径靠人记 |
| `DESKTOP_PATTERNS` | 只有 `src/desktop/bridge.*` | 渲染层与主进程的其他边界文件不触发 desktop 档（`electron/` 整树另有规则兜住主进程一侧） |
| `DOCS_ONLY_PATTERN` | 判纯文档，纯文档跳过核心冒烟 | 判错的代价是漏跑，但它是白名单形状，已有删除 / 重命名 fail-closed 兜底 |
| `scripts/test-focused.mjs` 的相关测试选择 | focused 档下选哪些单测 | 同样靠命名与目录约定，不是对照依赖图 |

这些的共同修法也是同一句：给每张表配一个「真实集合」（登记的旅程清单、打包入口清单、测试依赖图），让测试核对对得上，而不是继续补正则。这是下一轮的结构工作，不在这次分类器修复里。

## 5. 结论

不是 `scripts` 这一层「又坏了一次」，而是这一层作为判官一直没有对照表。这次分类器修复把**画布这一张表**配上了对照（概念表 + 子目录表态），其余判据表原样留着，已列在上面。若同一层再收到同类合同，先看第 4 节那几张表，而不是再补一个文件名。
