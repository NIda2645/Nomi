# `.github/workflows` 这一层的结构评审：车道、证据、判决三件事挤在一份手写 YAML 里（2026-09-22）

> 状态：📎 结构评审（`check:symptom-cluster` 触发：模块 `.github/workflows` 7 天内已有 5 份根因合同）
> 触发合同：[`2026-09-22-core-flow-walkthrough-never-ran-in-ci`](../fixes/2026-09-22-core-flow-walkthrough-never-ran-in-ci.root-cause.json)
> 同层近邻：[`2026-09-18-e2e-job-fail-fast-serializes-findings`](../fixes/2026-09-18-e2e-job-fail-fast-serializes-findings.root-cause.json)、[`2026-09-18-pr-body-gate-reads-a-stale-payload`](../fixes/2026-09-18-pr-body-gate-reads-a-stale-payload.root-cause.json)、[`2026-09-18-agent-storyboard-single-ledger`](../fixes/2026-09-18-agent-storyboard-single-ledger.root-cause.json)、[`2026-09-17-shipped-feedback-intake-config`](../fixes/2026-09-17-shipped-feedback-intake-config.root-cause.json)

## 1. 这一簇是不是同一个结构问题

**一半是，一半不是。**`.github/workflows` 这个键覆盖全部工作流文件，簇里有两份只是**顺带**改到了它：

| 合同 | 真正的题目 | 和本层的关系 |
|---|---|---|
| 09-17 shipped-feedback-intake-config | 必须随产物走的配置被写成运行时 env 查找 | 只因为 env 是在 `desktop-preview.yml` / `desktop-rc.yml` 里播下的，**不同层** |
| 09-18 agent-storyboard-single-ledger | 同一件用户可见的东西有两个 owner（画布节点 / 分镜表） | 只因为顺手加了一道 check 到 `quality-gate.yml`，**不同层** |
| 09-18 e2e-job-fail-fast-serializes-findings | fail-fast 链把互相独立的判据串行化，一轮只学一件事 | **同层** |
| 09-18 pr-body-gate-reads-a-stale-payload | 门岗读触发时的事件快照，而不是被判对象的当前状态 | **同层** |
| 09-22 core-flow-walkthrough-never-ran-in-ci | 登记过的核心场景可以一次都没起过进程，而车道只按改动路径开 | **同层** |

键太粗是已知欠账（09-21 `src/workbench` 那两份评审记过同一件事）。下面只看真正同层的三份。

## 2. 同层那三份缺的是同一个不变量

三份的症状差得很远——一条红掩盖另外几条红、重跑永远变不绿、一片绿其实什么都没跑——但缺的是同一句话：

> **这一轮验证的「判据、输入、覆盖面」三者，必须各自有一个可机器核对的 owner；工作流只是执行它们，不是定义它们。**

`quality-gate.yml` 目前同时扮演三个角色，而且三个角色都以**手写 YAML 步骤**的形式存在：

1. **车道路由**——哪些 job 该起。此前由散落在各 job `if:` 里的路径条件决定（09-22 那次：坏在共享 CSS 上，画布车道因路径不匹配整条没开）。
2. **证据收集**——跑完留下什么。此前 fail-fast 链一红即停，后面的判据连跑都没跑（09-18 第一份）。
3. **判决**——这一轮算过还是不过。此前有的判据读的是事件负载而不是当前状态（09-18 第二份）。

三个角色挤在一处、又都没有 owner 时，**失败模式是共通的：错的、旧的、缺的输入，和「通过」长得一模一样**。这正是本层反复产出根因合同的原因——每次修的是其中一个角色的一个侧面。

## 3. 已经在收敛的方向（不是本次才开始）

这一层其实一直在往「**YAML 只执行，判据从代码里的单一 owner 派生，并由门岗钉死两者一致**」走：

- `scripts/run-gates-contracts.mjs`：collect-then-summarize 取代 fail-fast，并把 advisory 做成**登记制**（谁能进 advisory、为什么，由 `run-gates-contracts.node-test.mjs` 逐条钉住）——回应 09-18 第一份。
- 判据改读被判对象的当前状态而不是事件快照——回应 09-18 第二份。
- `scripts/validation-policy.mjs` 成为车道的唯一 owner，`select-quality-gate-profile.mjs`（CI）、`run-gates-tests.mjs`（本机）、`git-delivery.mjs`（合后收据）三个消费方都读它。
- `scripts/check-quality-gate-workflow.node-test.mjs` 把工作流的**形状**钉到那些常量上：job 的 `needs` / `if`、matrix 取值、check 名、上传步骤的 `if: always()`，以及汇总脚本里那段 fail-closed 分支的正则。

本次这一刀继续同一方向：核心冒烟的 matrix 取自 `CORE_SMOKE_FIXTURES`，check 名取自 `coreSmokeCheckName`，`continue-on-error` 表达式取自 `CORE_SMOKE_BLOCKING_FIXTURES`，合后收据要哪几份 check 也取自同一处——四者逐字一致由上面那份门岗断言。**新增一条核心场景只需在清单里加一行，不必碰工作流。**

## 4. 还缺什么（结构欠账，本次不做）

诚实记下没做的部分，避免这份评审被当成「已经修好了」：

1. **`quality-gate.yml` 仍然是手写的。** 现在是「代码定义判据 + 门岗断言 YAML 与之一致」，不是「YAML 由判据生成」。门岗只覆盖它断言到的那些字段；没被断言的步骤仍可以漂。彻底的做法是让这份工作流（至少 job 矩阵与汇总判定那段）从 `validation-policy.mjs` 生成，`--check` 模式比对——仓里 `gen-agents-md.mjs --check`、`gen-archetype-wire-defaults.ts --check` 已有同形状的先例。
2. **「登记过的东西真的跑过」目前只对核心冒烟成立。** 本次立的是 `CORE_SMOKE_SCENARIOS` 这一份清单；仓里别的走查（`tests/ux/*.walk.mjs`）仍然可能写了却不在任何车道里。同类扫描已经抓到一个活样本：`Golden path (Agent storyboard lands on canvas)` 从 09-15 改名 `draft_shots` 起就没在任何工作流里跑过（`quality-gate.yml` 里原有注释写明）。**这条不在本 PR 范围内，但它证明这一类不是孤例**——该有一道门岗回答「`package.json` 里每条 `test:*` 脚本，谁在跑它；没人跑的要么删、要么登记理由」。
3. **`.github/workflows` 这个聚类键太粗**，会把 desktop-preview 的 env 播种和 quality-gate 的判决算成同一层，于是簇满得很快、信号被稀释。聚类键应当细到单个工作流，或者按角色（发布 / 验证 / 文档回写）分。

## 5. 本次这一刀落在哪、不落在哪

- **落在**：车道开关（`coreSmoke = !docsOnly`，不挂任何路径前缀）、场景清单单一 owner、阻断/非阻断名单单一 owner，以及把这三者与 YAML 钉在一起的那份门岗。
- **不落在**：上面第 4 节的三条欠账；以及 `quality-gate.yml` 里其它 job 的判据（画布、性能、打包）一律未动。
- `used` 夹具当前是非阻断档（实测 5 跑 1 绿，三条小窗布局 bug 挡着），升阻断条件与做法见方案与 TODO 的 T-QA-23。
