# 走查手写的模型面调用没有类型，动词一改名它就静默失配

> 📎 教训 · 首次记录 2026-09-18 · 状态：✅ 已固化（`check:walkthrough-tool-args` 接管）
> **触发场景**：你刚给某个动词的字段改名/改结构，准备说「引用方都同步了」；或者某条走查突然报「某某东西没有落成/没有出现」，而你并没有改那条链路的生产代码。

**结论**：改动词字段名时，`tests/ux/**` 里手写的 `args: { ... }` 字面量**不在任何编译器的视野里**——
它经 JSON + IPC 进宿主，两头没有共同的静态类型。改名之后它不会报错，只会**静默少传一个字段**，
表现成一个看起来像产品 bug 的现象。现在由 `check:walkthrough-tool-args` 拦（判据本体
`scripts/walkthrough-tool-args-lib.mjs`，真相源是 `MODEL_FACING_TOOL_SPECS` 的发布 schema）。

**为什么会踩**：

2026-09-18，PR #814 把模型面四对字段改了名（`modelKey→modelId`、`draftId→operationId`、
`changeId→undoToken`、`revision→baseRevision`）。#814 **自己的**测试全同步了。
另一条分支上的 `tests/ux/golden-path.e2e.mjs:245` 还写着 `modelKey`，没人管——它不在那个 diff 里。

那条分支追平 main 时，git 的表现是这次最阴的一环：

| 那一行 | git 怎么处理 | 结果 |
|---|---|---|
| `draftId` | 标成冲突 | 有人看，改对了 |
| `modelKey` | **自动合并，不报** | 没人看，漏网 |

CI 于是报「草稿没有落成 3 个镜头节点」。这句话读起来像**落画布的生产代码坏了**，
而真实原因是走查递给宿主的每个 shot 都没有模型——`shots.items.required` 只有 `prompt`，
少个 `modelId` 不会被 schema 拒，只会安静地产出一个没有模型的镜头。

**这不是孤例，是一整片没人看的地**：`eslint.config.mjs:28` 把 `tests/ux/**` 整个 ignore
（`scripts/check-e2e-launch.mjs:6` 的注释里前人已经写下这句话，当时只修了「启动路径」一个症状）。
门岗刚写出来对着 `origin/main` 跑第一次，**当场抓到 5 处**，我修的只是其中 1 处：

| 文件 | 键 | 谁在跑它 |
|---|---|---|
| `tests/ux/golden-path.e2e.mjs` | `shots[].modelKey` | CI E2E 链 |
| `tests/ux/agent-runtime-production.walk.mjs` | `shots[].modelKey` | **没人**（只有注释里的手动 `Run:` 行）|
| `tests/ux/g1/sweep-surfaces.mjs` | `shots[].modelKey` | **没人** |
| `tests/ux/agent-timeline-ops.walk.mjs` | `revision` | **没人** |
| `tests/ux/agent-timeline-receipt.walk.mjs` | `revision` | **没人** |

后四条更危险：它们不在 CI 里，所以坏了没人知道；等哪天有人手动跑其中一条去验别的东西，
拿到的是一个**看起来像产品 bug 的假红**——正是我这次撞的那个形状，只是延后了。
`edit_timeline` 的 `baseRevision` 还是**必填**，那两条走查原本要验的乐观并发闸，一次都没验过。

**这一类的形状**：和「五遍手写重述、之间无比对、错了不响」（工具层那 14 条缺陷）是同一个结构，
只是发生在测试里。测试是手写副本的**最后一层**，也最容易被当成「已经在验了」而免检。

**怎么用**：

- 改动词字段名后，别只跑 `grep <新名>` 看有没有漏——**漏的那份写的是旧名，grep 新名永远是绿的**。
  跑 `pnpm run check:walkthrough-tool-args`。
- 追平 main 之后，**冲突标记只覆盖了 git 认为有歧义的那部分**。同一次改名里，
  一行标冲突、另一行自动合并，是完全正常的 git 行为，不是异常。所以「解完冲突 = 追平干净」不成立。
- 走查报「某某东西没有出现/没有落成」时，先分清是**生产代码坏了**还是**走查递进去的东西不对**。
  两者的现象一模一样，而后者不改一行生产代码。
- 一条走查的注释里只写着 `// Run: node tests/ux/xxx.walk.mjs`、package.json 和 workflow 里都搜不到它，
  就是一条**没人跑的走查**。它的绿不代表任何事，它的红也没人会看见。

**出处**：PR #814（`2a35523aa`）改名；`tests/ux/golden-path.e2e.mjs:245`；
门岗首跑对 `origin/main` `e3ab6f8b7` 抓到 5 处；`eslint.config.mjs:28`；
判据与阳性对照 `scripts/walkthrough-tool-args-lib.mjs` / `scripts/check-walkthrough-tool-args.node-test.mjs`。
相邻教训：[技能里的指令会跨代累积](stale-directives-outlive-tool-renames.md)（同一次改名的另一面：技能正文里的祈使句）、
[门岗的 scope 指到不存在的目录会安静报绿](gate-scope-pointing-nowhere-passes-silently.md)。
