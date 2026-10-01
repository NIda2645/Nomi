<!-- 本文件由 scripts/gen-agents-md.mjs 从 CLAUDE.md 自动生成，请勿手改。 -->
<!-- 改纪律请改 CLAUDE.md，再跑 pnpm run gen:agents；check:agents-sync 在 gates 链里拦漂移。 -->
# Nomi — 工程纪律

> **3 层**：**L0 每轮** = `scripts/claude-hooks/self-check.sh`（常驻约 0.7 KB + 按用户消息关键词注入的块）｜**L1 常驻** = 本文件，**每次 session 读完再动手**｜**L2 触发才查** = `docs/engineering-rules.md`（R# 详解 + 旧号别名）、`docs/engineering/`（命令全表、交付与评审、每日雷达、原则全文、编排手册……）、`docs/lessons/INDEX.md`、`docs/ARCHITECTURE-NOW.md`、`docs/GLOSSARY.md`。
>
> **维护纪律**：本文件是策展的，不是 append 的——只放「删掉它 Claude 就会犯错」的内容，字节只减不增（2026-10-02 瘦身后约 13.7 KB，瘦身前 32 KB）。新踩的坑进 `docs/lessons/` 或 hook 的 `violations.log`；只在特定场景才用的细则放 L2 并挂到 hook 的关键词块上（保证用到时一定加载）。**禁止手改 `AGENTS.md`**：改纪律只改本文件，再跑 `pnpm run gen:agents`。

## 项目概览

Nomi：本地优先 AI 视频创作工作台。
**技术栈**：Electron + React 18 + Tailwind 3 + Zustand + React Flow (`@xyflow/react`) + Vercel AI SDK。
**主要模块**：项目库 → 创作（文本）→ 生成画布（节点系统）→ 时间轴预览 → 导出 MP4。
**设计系统**：`Design.md` + `src/design/`，token-only，光/暗双模式（默认按本地时间「天黑自动暗」·手动切一次后记住·token 翻转），密度优先。
**主仓库**：`/Users/aoqimin/Desktop/Nomi/`。所有改动从最新 `origin/main` 创建独立任务分支/worktree，通过 PR 交付；禁止直接 push `main`。

## 常用命令

| 命令 | 用途 |
|---|---|
| `pnpm dev` / `pnpm build` | 开发模式（Vite + Electron）/ 构建 |
| `pnpm run test` / `pnpm run typecheck` | Vitest 单测 / TypeScript 双向检查 |
| `pnpm run gates` | 五门（按风险分档，和 CI 共用 `scripts/validation-policy.mjs`）：contracts + 改动相关测试 + build + 盖戳 |
| `pnpm run gates:full` | 全量档：测试基础设施改动、手动发布边界、想自己兜底时用 |
| `pnpm run test:core-smoke -- --fixture <empty\|used\|profile-copy>` | 核心流程冒烟（非纯文档 PR 与 main push 必跑）；清单唯一 owner `tests/ux/core-smoke/scenarios.mjs` |

**全表**（各门岗、冒烟、数门、评审命令……）：`docs/engineering/commands.md`。**push 前分层、交付身份、Ponytail**：`docs/engineering/delivery-and-review.md`。开任务先 `pnpm run delivery:preflight`；**合并规矩**：CI 绿 + 扫描干净就合，最多 3 个在等收据，任何一个收据红了立刻停、交人定修还是回滚。

## 核心原则

**P0 只写我们独有的** — Nomi 自己写的只有领域本身（分镜、镜头与制作流程、画布、素材、按镜头的花钱语义……以 `docs/engineering/self-written.json` 的领域目录为准）；其余一律接入现成的框架 / 库 / 标准，「先查别人」的结论**默认是接入**。领域目录之外自写一项通用能力是例外：必须进自写登记表，理由只认领域约束（花钱要批准、画布写入要回执、隐私承诺不经第三方……）。自检：「这段是我们独有的吗？不是 → 先找现成的接入。」（门岗 `check:self-written`；R5 是执行手册。）

**P1 加新必删旧** — 引入新实现时同 commit 删旧实现，无并行版、无 fallback、无逃生口。CSS 同理：新样式只写组件 `className`，全局 CSS 只可减不可增。

**重写判据（R21.2，试用到 10-15）** — 出现任一条就停止打补丁：① 同一文件 14 天内第三次因 bug 修改；② 要给现有函数加第三个特例分支或参数；③ 改一处要读两处以上的旁路逻辑。此时选定「补 / 重写 / 删」并写出特征测试路径；选重写：先写特征测试钉住旧行为，只重写一个模块，同一次提交删掉旧的。

**P2 修根因不修症状** — 任何 bug、回归、CI/平台失败、性能/安全问题，动生产代码前执行 `.agents/skills/root-cause-remediation/SKILL.md`：分清症状/直接原因/类根因，判断 `one_off`/`recurring`，先 `node scripts/door-map.mjs <符号或文件>` 数清全部写/读入口，修在最早共享边界。自检：「同类问题还能从另一个调用者、供应商、版本、平台或旧数据回来吗？」答不出"不能" = 没解决。全文：`docs/engineering/principles-detail.md`。

**P3 全绿 ≠ 完成** — CI 只证代码健康，证不了体验对不对。用户可见改动报完成前：① 和获批样张逐项对账；② 真体感走查（截图自己亲眼 Read 过）。功能交付另过 R13 第二档：建几条真实用户任务跑通整个使用闭环、冒出的问题全修掉，不留半成品。

**P4 通用第一** — 能力/组件/交互按「模型身份 / 通用场景」设计，与具体供应商/模型解耦；不为不同模型写两套 UI。

**P5 想清楚再动手** — UI 改动先读 `docs/design/nomi-design-system.md`、出可体验样张 + 用户拍板，改现有 UI 先看它真实样子；接线前先看真实数据；多文件改动先写 `docs/plan`。**动手前先 grill**：重要改动（产品行为 / 架构 / 外部契约 / 用户可见流程 / 花钱边界 / 会连带别的面）先**一轮批量**问清，每题带默认答案，**连带面单独成题**；纯 bug 修复（根因明确、不改行为）不问。全文：`docs/engineering/principles-detail.md`。

## 规则索引（R# 详解在 `docs/engineering-rules.md`）

> 2026-09-14 合并：30 条 → 17 条，一条都没删（`R6/R20/R29/R31 → R5`｜`R16/R30 → R13`｜`R18/R26/R28 → R17`｜`R19 → R11`｜`R10 → R1`｜`R12 → R9`｜`R23 → L2`）；引用旧号不作废，`check:rule-aliases` 保证任何 `R<数字>` 都解析得到。

| # | 规则 | 一句话 |
|---|---|---|
| R1 | 加新必删旧 | 新替旧同 commit 删旧；CSS 只写组件 `className`；生成画布只许 React Flow 一个内核（旧 R10、R23）|
| R2 | 用户视角 + 极简 | 每条信息问「有行动价值吗」，没有删；每屏记信息密度三个数 |
| R3 | 决策对比表 | 涉及取舍先给用户对比表，不单方面开干；样张内两条拍板冲突 → 停下上报 |
| R4 | 执行前写文档 | 多文件/多步改动先写 `docs/plan`：范围/不动项/回滚/验收门；「先查别人」一节是 R5 的落点 |
| R5 | 先查别人（P0 的执行）| 凭记忆判断 = 没查，结论默认接入：①三方库 API→Context7 ②方案→近邻开源+反方报告 ③通用能力→build-vs-buy 三问（`check:self-written`）④框架/SDK→四列表+参考实现逐层对照 ⑤外部也读写的格式→先找规范。细节由 hook 的【先查别人】块注入 |
| R7 | 6 角色评审 | 方案定稿前 CTO / 设计 / PM / 前端 / 后端 / 真实用户各审一遍；另开 agent 对抗评审 |
| R8 | 先出样张 | 用户可见改动先出 mockup + 拍板，实现后逐项对账（`check:mockup-contracts`）；画新面走三件产物（hook 注入）|
| R9 | 模块化 + 防巨壳 | 写码前想清楚分层；单文件 ≤800 行（`check:filesize`，旧 R12）|
| R11 | 交付与状态 | 按 R22 档通过即自己 commit + push；状态词只有四档：已实现未推送 / 已推送待合入 / 已合入待验证 / 已解决（需 merge SHA 上的 `delivery:verify-merged` 收据）|
| R13 | 完成标准 | 用户可见→样张对账+眼见链+zh/en 双语真截图｜功能交付→≥2-3 条真实任务闭环｜Agent/工具/契约→真实模型数字。四件真实：真应用/真输入/真工具轨迹/真素材。执行版 `docs/engineering/acceptance-walkthrough-doctrine.md` |
| R14 | 周期审计 | ≥25 commit 或发版前：多维 subagent 审计 + 走查 + `docs/audit`；R14.1 同一语义有几份定义七维横扫 |
| R15 | 可见文字国际化 | 所有用户可见文字走 i18n（`zh-CN`/`en`）；`check:i18n` 硬零；zh/en 两轨都要真截图 |
| R17 | 防线建在最早能拦住的那层 | 能让编译器拦的别留给门岗，能让门岗拦的别留给人；登记不是防线；棘轮基线只减不增、加规则先验它会红；门岗红了先读它红在哪条判据，别抬基线挤 PR |
| R21 | 修复走根因流程 | 纠正性改动走 `root-cause-remediation`；可复发/高风险交 v3 合同（`check:root-cause-contracts`），必答 `invariant_owner_layer`、带 `doors`；**R21.2 重写判据**：同一层 7 天第三份合同 → 写 `rewrite_decision` |
| R22 | 验证分层与测试预算 | contracts 常跑，其余维度按真实风险独立触发；没有真实资源记 `unverified`，不许 mock 绿灯替代 live 证据 |
| R25 | 交工前 Ponytail 评审 | 交工前 `pnpm run review:branch`、PR 正文 `## Ponytail` 节逐条表态；当前提示模式（`docs/engineering/ponytail-mode.json`）|
| R27 | 多智能体编排手册 | 谁的方案谁实施·验收必跨池、任务书带开工三行头、收货三查；**一个概念一个 PR、按阶段攒**（提交不压缩；跨概念/热修/别的线等着/大到审不过来才拆）。`docs/engineering/agent-orchestration-playbook.md` |
| R33 | 概念的 owner 先于目录 | 派工切概念不是文件夹：任务书带「概念占用表」（碰哪些概念 / 唯一 owner / 允许谁消费），写不出不开工；同一概念同一时段只归一条 lane；验收问「有没有多出第二个 owner」，测试绿不作放行理由；正本 `docs/engineering/concept-owners.json` |

## 每日雷达

用户反馈 / 供应商模型 / 论文 / 三日竞品四个雷达，由 **SessionStart hook（`scripts/claude-hooks/daily-radar.sh`）直接跑脚本并把结果注入会话**；脚本失败时它会明说「今天没查成」——**不许**说成「没有新反馈 / 没有新模型」。分诊规矩与细则：`docs/engineering/daily-radars.md`；技能 `nomi-intake-radar` / `nomi-model-radar` / `nomi-research-radar` / `nomi-competitive-radar`。研究建议不能自动变成开发或发布授权。

## 决策自治

**P0 默认自主推进到底，不留遗留（2026-06-23 用户要求）。** 发现的问题就全部整完，不要扫出一堆然后停下来等用户一项项点头；有合理默认的，按 D1-D6 选他会选的那版做掉再报。**只在关键决策才停**：产品方向 / 不可逆取舍 / 架构岔路 / 需要用户独有资源 / 样张需求自相矛盾（自相矛盾时停下上报，不许自己挑一条实现）。

**自己定**：实现细节、命名、模块拆法、测试策略、bug 修复顺序；评测/测试/验证类的额度花费默认授权，事后报花了多少。**才问用户**：产品方向 / 架构岔路 / 需要用户独有资源（额度仅产品级/大额/不可逆才问），合成一轮、给推荐项。做事前先对照待办正本（在私有位置，由协调会话读写），做完改状态。

## 用户决策逻辑（替他做决策时按这套想）

拿不准仍给对比表让他拍（R3），但默认解要长成他会选的样子。

**D1 从用户真实摩擦出发，不从实现出发。** 先问「用户那一刻卡在哪、累不累、要不要学/读/配置」；直接出效果 > 让他看表单/配置/说明；让用户多读、多配、多学我们格式的东西，默认砍。
**D2 从结构和约束推，不从功能列推。** 先定位「在价值链/护城河的哪个位置」「我一个人扛不扛得动」；约束就是战略，投机的大盘先砍或延后。
**D3 第一性，追到底层「为什么」。** 给方案要给底层逻辑 + 取舍；论断要有据，不确定就实查；任何提议讲清：① 为什么这么做 ② 会发生什么 ③ 用户体验是什么。叫某东西是 bug 前先搞懂现有设计为什么这么写。
**D4 狠的极简 + 诚实交付。** 砍一切不挣命的；缺口/限制明着标，不藏不糊弄。
**D5 逻辑清楚就快决。** 他要敢分析、敢反驳、敢下判断的伙伴，不是附和者；「你怎么看」就是要你的判断。
**D6 出方案的表达纪律。** 让他一眼看懂：①背后逻辑（解决哪个真实摩擦，大白话 + 例子）②他要权衡的那个核心东西（一句话点破）。他复述不出「为什么」和「我在纠结什么」= 没讲清，重写。

## 工作目录

主仓库：`/Users/aoqimin/Desktop/Nomi/`。操作文件用绝对路径；新建 worktree 放仓库目录**同级**（非嵌套），分支从最新 `origin/main` 创建。

**并行纪律**：独立 sibling worktree 的干净任务分支先跑 `delivery:preflight`，新 worktree 先 `pnpm install`；不在共享主仓里切分支/commit/解决冲突；push 前整合最新 `origin/main`（merge，不对着 origin/main reset 或压缩），只 push 任务分支并开 PR；不 force-push；评审/打捞分支先算 merge-base（两点视图里的大片删除多半是 main 前进了）。桌面预览、RC 与正式晋级见 `docs/release-process.md`。

**多会话统御（长期有效）**：同一时段只有一个**协调会话**，由它按 R33 分「概念 lane」、合并、向用户汇报；**用户只和协调会话说话**。其他会话：动手前向协调会话报要碰的概念，冲突排队；做完只开 PR 并把 PR 号发给它，**不自己合并**；途中发现的新问题**不建任务卡**（不调 `spawn_task`）、要用户拍板的问题**不直接问用户**（不调 `AskUserQuestion`），都用消息发给协调会话（连同推荐项和各选项代价）。同时进行的实现会话控制在 3 个左右。细节（派工、问题转交、合并、归档、额度恢复、发版前真实付费矩阵）见编排手册 §19。

---
