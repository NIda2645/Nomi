# 2026-09-18 结构评审：交付流水线（`scripts/lib` 一天三份合同）

> 触发：`check:symptom-cluster` — 模块 `scripts/lib` 在 7 天窗口里收到第 3 份根因合同
> （`2026-09-18-ci-e2e-chain-not-runnable-locally` / `…-e2e-job-fail-fast-serializes-findings` /
> `…-pr-body-gate-reads-a-stale-payload`）。R21：第三份合同是「这一层的结构不对」最便宜的证据，
> 不是再修一次的理由——所以先写这份，再谈继续修。

## 1. 先回答门岗问的那一问：`scripts/lib` 是不是一层在反复坏

**不是。** 这三份合同不是同一层反复坏，是**一次刻意的批次**把三条新的共享边界都放进了 `scripts/lib/`
（`chainSummary.mjs`、`prBody.mjs`）。三条不变量互不相干：一条讲「本地有没有入口」、
一条讲「独立判据不该串成 fail-fast」、一条讲「门岗读的是快照还是当前状态」。

这本身是**门岗的一条结构性发现**（只记不修，见 §4）：`modulesOf()` 用的模块键是**目录前缀**，
于是 `scripts/lib` 这种「公共小工具箱」目录会把完全无关的边界聚成一簇。
真正想问的是「同一份状态 / 同一条不变量这周第三次出事了吗」，而目录回答不了这个问题。
今天这一簇是**假阳性**——但它花的代价只是这份文档，而漏报的代价是下一个 `electron/harness`，
所以处置是把键改准，不是把窗口调松。

## 1.5 第二簇：`.github/workflows` 一周三份

同一个门岗还报了第二簇：`.github/workflows`（`2026-09-17-shipped-feedback-intake-config` +
本批的 B、C 两份）。这一簇**比上一簇实在**——工作流确实一周被三份合同碰到——但成员之间仍然没有
共享的不变量：一份是「发版包里的反馈上报配置」，两份是本批的 CI 编排。

真正值得记下来的共性只有一条，而且它和 §2 是同一条：
**工作流 YAML 是一份没有类型、没有本地执行入口的生产代码**。
它出问题的方式高度雷同——某个字段/语义写错了，而唯一的发现渠道是「推一次看看」。
本仓已经有 `check:quality-gate-workflow`（把 YAML 的关键结构钉成断言）和 `check:workflow-script-refs`
（每个 `pnpm run` 都解析得到）两道，本批又往前推了一格（七步的 id / continue-on-error / 汇总引用
全部进了断言）。**结论是：继续往这两道门里加断言，而不是把工作流拆得更细。**
拆细只会让「推一次看看」的次数变多。

## 2. 那么真正的结构问题是什么

三件事收敛到**同一句话**：

> 交付流水线里，**判据的执行位置**和**判据要判的那个东西**被摆错了地方。

| 件 | 判据 | 它判的东西在哪 | 它被执行的地方 | 错位的代价 |
|---|---|---|---|---|
| A | 七条走查过不过 | 本地就能跑（Electron、Playwright 都在本机） | 只有 CI 有入口 | 「本地全绿」悄悄缩水成「本地那部分全绿」 |
| B | 七条互相独立的走查 | 七条各自的结果 | 串成 fail-fast，只有第一条能说话 | 排查墙钟 = 红的条数 × 40 分钟 |
| C | PR 正文引没引用方案 / 门表 | 正文**此刻**是什么 | 读 push 那一刻的事件负载 | 重跑这个 job 永远不可能变绿 |

A 是「能在早层拦的留给了晚层」，B 是「能并行给出的证据被串行化了」，C 是「判据的输入不是被判对象」。
三条都是 **R17 的同一句话**：防线要建在最早能拦住的那层，而且判据必须落在它声称要判的那件事上。

**为什么这一族在本仓特别贵**：本仓的验证面是按风险分档独立触发的（R22），这个设计是对的——
走查慢、占全机锁，不该每次 push 都跑全套。但分档隐含一个前提：**被分出去的那些面，本地也得有入口**。
这个前提从来没有被写下来，也没有机器核。`gates` 覆盖 unit / contracts / build 三面，
而 desktop / journeys / canvas 三面只存在于 YAML 里——分档把它们分出去之后，就没人把它们分回来了。

## 3. 本批做了什么（以及刻意没做什么）

- **A**：`CI_E2E_CHAIN`（`scripts/run-ci-e2e-chain.mjs`）是七步的唯一清单，
  `check:quality-gate-workflow` 逐项比对它与 `desktop-linux` job；任一侧漂移当场红（已实测）。
- **B**：七步 `continue-on-error` + 末尾汇总步下结论；判据 `outcomeIsRed` fail-closed
  （只认 `success`/`skipped`，没见过的值一律红）。并行度、命令、`if:` 一个没改，全绿时长不变。
- **C**：正文取法收敛成 `scripts/lib/prBody.mjs` 一个 owner，一律现取；
  `pull_request` 事件里取不到 = 红；push 前在 pre-push 先跑一遍同样的判据。
- **本机实跑一遍**：7 步全绿、9m21s、只排一次锁（feel 2.9s / smoke 26.5s / journeys 2m32s /
  mcp-journey 1m04s / mcp-elicitation 26.5s / real-user-journeys 3m01s / canvas-critical 1m28s）。
  另跑了阳性对照（三步两红）确认「红了继续跑、退出码=任一红」。
- **顺手补的一条**：走查会重写**已跟踪的**证据文件（`outputs/canvas-card-stack-20260827/*.png`
  实测 677KB → 184KB、`docs/plan/…-triage-board-evidence/*.png` 同理）。
  这堆脏东西极易被 `git add -A` 捎进无关提交，所以链跑完会点名列出来。
- **刻意没做**：没有把 `test:e2e:ci-chain` 塞进 `pnpm run gates`。
  塞进去等于让每个功能 lane 都占着全机那把锁跑十分钟走查，
  那会重演 `local-gates-ran-full-suite-and-jammed-the-machine-lock` 那条教训。
  它是**集成 / 碰面 / 开 PR 分支**的一步，写进了 playbook §2.1 的交工链。

## 4. 结构性发现（只记不修，留给排期）

1. **`check:symptom-cluster` 的模块键是目录前缀**（`scripts/symptom-cluster-lib.mjs` 的 `modulesOf`）。
   公共工具目录（`scripts/lib`、`src/shared`、`electron/shared`）会把无关边界聚成假簇；
   真正该聚的是「同一份状态 / 同一个 `invariant_owner_layer`」。
   建议：键改成合同的 `invariant_owner_layer.layer`（那是作者已经写下来的「谁管这条不变量」），
   目录只作为 fallback。今天这一簇是它的第一个实证假阳性。
2. **根因合同门禁使历史合同不可机械迁移**。`validateRootCauseChange` 只校验「本次 diff 里变化的合同」，
   而一份合同一旦进了 diff 就被当成「此刻正在被引入」全量重校（它声明的每个 `regression_test` /
   `prevention.artifact` / `removed_path` 都必须也在本次 diff 里）。
   于是任何跨合同的格式迁移都会触发几百条 `was not changed in this diff`——
   本次给 43 份合同跑过一遍去行号迁移，正是这个结果，随即整体还原
   （详见 `docs/fixes/2026-09-18-door-map-pinned-to-line-numbers.root-cause.json` 的 `migration`）。
   这不是 bug，是「合同 = 那一次改动的说明书」这个定义的直接推论；
   但它意味着**合同的 schema 只能向前演进，不能回溯统一**，而这一点目前没有写在任何地方。
   建议：要么接受「历史合同按当时的 schema 冻结」并写进 R21，
   要么给门禁加一个显式的「格式迁移」模式（只校验 schema、不校验 diff 同步）。
3. **`gates` 覆盖面与 CI 触发面之间没有机器对照**。本次只把 `desktop-linux` 那七步接上了；
   `canvas-acceptance`（full 两片）与 `canvas-performance` 仍然只有 CI 入口，
   本地虽有 `test:canvas:acceptance` / `test:canvas:performance` 可单跑，但没有「CI 会触发哪几面、
   本地怎么一次跑完那几面」的对照。`scripts/validation-policy.mjs` 已经知道答案（它就是分档器），
   缺的是让它同时产出一条本地命令。
