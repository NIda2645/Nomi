# 门岗账本：最近 50 个已合并 PR 里，每道门岗红过几次、红的是真问题还是纸面（2026-10-01）

> 状态：📎 只读调研，删除和降级等用户拍板，本文不改任何门岗。
> 为什么做：现在有 112 道检查，只加不减；用户邀请质疑和优化。先拿数据，再出清单。
> 数据与口径见文末「方法与局限」。原始数据：50 个 PR 的 91 次 `quality-gate.yml` 运行、30 次红灯的 Contracts / 各 job 日志与修复提交的文件清单（采集脚本在本机，未入库）。

## 一屏结论

1. **91 次运行里 30 次红（33%）；50 个 PR 里 21 个（42%）至少红过一次。** 红的 30 次里，Contracts job 红了 21 次；执行类 job（Canvas Acceptance、Unit、E2E、核心冒烟、打包）红了 15 次（共 20 个 job 失败），其中 9 次两边一起红。
2. **Contracts 里的 42 次门岗阻断，按「修它的提交改了什么」分：真问题 17、纸面 25（60%）、误报 0。** 纸面全部来自五道「登记 / 文档 / 仪式」类门岗：`check:prior-art`（9）、`check:symptom-cluster`（6）、`check:door-map`（5）、`check:root-cause-contracts`（3）、`check:concept-owners`（2）。它们红了，修法是补一节文档、补一份合同、补一张门表，没有一次改了产品行为。
3. **真正抓到行为回归的是执行类 job，不是那 100 多道静态门岗。** 执行类 20 个 job 失败里，修复提交改了 `src/` / `electron/` / `tests/` 的有 18 次（Canvas Acceptance 7、E2E 4、Unit 4、核心冒烟 2、Mac 打包 1）；另外 2 次 Unit 红，修复提交只改了文档，疑似不稳定测试（误报候选）。
4. **Contracts 里真问题的 17 次全是「代码卫生」类**：测试类型（5）、文件体积（4）、走查写法（3）、设计实验室 / lint / 测试等待 / 词表 / 图标语义各 1。它们抓的是真实的代码问题，但不是用户会撞到的产品问题。
5. **93 道门岗在这 50 个 PR 里一次没红，合计约 250 秒 / 次。** 零红不等于没用（可能是它在，所以没人犯），本文不据此建议删除；只把「贵而零红」的几道挑出来，建议复审它拦过什么历史问题。
6. **成本**：Contracts 单次约 394 秒；最贵的四项占 45%：`check:test-types` 55 秒、`typecheck` 50 秒、`lint:ci` 46 秒、`check:design-lab` 25 秒。前两项都是 tsc。
7. **三道 advisory（docs-index / doc-status / research-sources）49 / 49 次都红**，永远不阻断，没有读者。

## 一、门岗账本（在窗口里红过的 13 道）

「真 / 纸 / 误」按修复提交判：改了 `src/` / `electron/` / `tests/` 的行为或类型 → 真；只改文档、登记 JSON、PR 正文 → 纸；修复提交没有文件变化（重跑过绿）→ 误。「每 PR 平均红几轮」= 红过的 PR 里，同一道门岗连续红了几次。

| 门岗 | 红 | 真 | 纸 | 误 | 涉及 PR | 轮数 | 单次耗时 | 推荐 | 一句话理由 |
|---|---|---|---|---|---|---|---|---|---|
| `check:prior-art` | 9 | 0 | 9 | 0 | 9 | 1 | 2.3s | **保留，已改判**（本 PR） | 全是补一节「先查别人」；改成只管新增通用能力，领域方案不再被要这一节 |
| `check:symptom-cluster` | 6 | 0 | 6 | 0 | 6 | 1 | 0.6s | **降级为提示** | 6 次全是补一份结构评审文档；键太粗（`scripts`、`src/workbench` 一个键盖整棵树），逼出来的评审与改动关系松 |
| `check:door-map` | 5 | 0 | 5 | 0 | 5 | 1 | 1.5s | **合并**进 `check:root-cause-contracts` | 门表本来由脚本生成（`node scripts/door-map.mjs`），红了只是没粘进合同；让合同检查自己调脚本补全，不再多一道门 |
| `check:root-cause-contracts` | 3 | 0 | 3 | 0 | 3 | 1 | 6.2s | **保留** | 它是 P2「修根因」的载体；3 次红都是字段没填全——recurring 档 20+ 个必填字段，连脚手架 `new:contract` 都要单独写，表单偏宽，可再收窄 |
| `check:concept-owners` | 2 | 0 | 2 | 0 | 2 | 1 | 15.5s | **保留** | 挡的是「第二个写口」，是 R33 的核心；红的 2 次是合同声明的边界没登记，可改成合同提交时自动给出登记草稿 |
| `check:test-types` | 5 | 5 | 0 | 0 | 5 | 1 | 55s | **保留；与 `typecheck` 合成一次 tsc** | 真问题（测试里的类型错），但是全量最贵的一项，且和 `typecheck` 重复编译 |
| `check:filesize` | 4 | 4 | 0 | 0 | 4 | 1 | 0.4s | **保留** | 便宜、真问题（拆文件）；注意「真」只说明改了代码，不保证是有意义的拆分 |
| `check:walkthroughs` | 3 | 3 | 0 | 0 | 3 | 1 | 3.3s | **保留** | 走查写法质量（「不存在」断言要先证探针有效）；改的是测试代码 |
| `check:design-lab` | 1 | 1 | 0 | 0 | 1 | 1 | 25s | **保留，列入「贵」复审** | 真问题，但 25 秒、窗口里只红过 1 次 |
| `lint:ci` | 1 | 1 | 0 | 0 | 1 | 1 | 46s | 保留 | 真问题；成本是 eslint 本身 |
| `check:test-waits` | 1 | 1 | 0 | 0 | 1 | 1 | 5.2s | 保留 | 真问题 |
| `check:vocabularies` | 1 | 1 | 0 | 0 | 1 | 1 | 10.7s | 保留 | 真问题（状态词表新增副本） |
| `check:icon-semantics` | 1 | 1 | 0 | 0 | 1 | 1 | 1.6s | 保留 | 真问题 |

「平均修复轮数」在这个窗口里全是 1：这些门岗红了之后，修一次就过。真正让 PR 多推几轮的是**同一次推送里连着红好几道**——例如 #937 一次 6 道、#939 一次 6 道、#921 一次 4 道（见下）。

### 一次红好几道的 PR（修复成本被放大）

| PR | 一次红几道 | 哪几道 |
|---|---|---|
| #939 | 6 | design-lab、prior-art、symptom-cluster、concept-owners、lint:ci、test-types |
| #937 | 6 | root-cause-contracts、prior-art、concept-owners、walkthroughs、test-types、door-map |
| #921 | 4 | icon-semantics、filesize、prior-art、door-map |
| #908 | 3 | root-cause-contracts、prior-art、door-map |
| #916、#923、#907 | 3 / 2 / 2 | 类似 |

这些里面，prior-art / door-map / root-cause-contracts / symptom-cluster / concept-owners 五道纸面类常常**同时**红，因为它们验的是同一件事的不同表单（合同 + 门表 + 登记 + 评审 + 查证）。

## 二、执行类 job（真正抓回归的）

| job | 红 | 修复提交改了什么 | 判断 |
|---|---|---|---|
| Canvas Acceptance (Linux) (2) | 7 | 7 次都改了代码 | 真问题；是整个窗口里最稳定的真回归来源（也是分类器漏判画布改动时恰恰没跑的那一档，#944 已修） |
| Unit | 6 | 4 次改了代码，2 次只改文档 | 4 真；2 次疑似不稳定测试 |
| E2E Walkthroughs (Linux) | 4 | 4 次改了代码 | 真问题 |
| Core Flow Smoke (empty / used) | 1 / 1 | 改了代码 | 真问题 |
| Mac Package | 1 | 改了代码 | 真问题 |

## 三、没红过的 93 道

窗口内零红，合计约 250 秒 / 次；其中 68 道每次不到 2 秒。零红的原因本文分不清：可能是门岗在，所以没人犯；也可能是它根本没卡到任何事。**不建议据此删。** 只把几道「每次 10 秒以上、50 个 PR 零红」的列出来，请复审它历史上拦过什么：

`typecheck`（50s，tsc 全量；**零红是因为别的门岗和 job 先红了？需要看**）、`check:packaged-deps`（21s）、`check:verb-host-conformance`（15s）、`check:hook-behavior`（13s）、`check:secrets`（13s）、`check:framework-surface`（13s）、`check:i18n`（11s）。

## 四、噪音清单

| 噪音 | 数据 | 建议 |
|---|---|---|
| `check:docs-index` / `check:doc-status` / `check:research-sources`（advisory） | **49 / 49 次都红**，每次在 PR 日志末尾列出十几到几十个文件；永远不阻断；合入 main 后由 docs-autosync 自动补 | **删除出 PR 的 Contracts**（留给 docs-autosync 自己做）。永远红、不阻断、没人读的检查等于不存在，还会训练大家无视红色 |
| Ponytail | 50 个 PR 里 47 个写了 `## Ponytail` 节，**其中约 33 个（70%）是 `--defer` / runner 不可用**；`check:ponytail-review` 在 CI 里 49 / 49 绿（只验收据在不在） | 降级为提示，或改成真能落地的形态（runner 可用时才要求）。现在的形状是要求每个 PR 交一份「已延后」的收据，没有信息量 |
| 每轮注入的交付账本 | 本次实测：「现役欠账 315 篇，最久停滞 34 天」，每条消息都注入 | 没人会因为这句话去清欠账；改成每周一次或只在 session 第一条出现 |
| 反复只改到期日的欠账 | `framework-boundaries.json` 里 xyflow 接触面 `colorMode`、`ariaLabelConfig` 已**重定到期日 3 次**（09-14→09-22、09-22→10-15，加本次 10-15→12-15），`onError` 2 次，每次都写「判据一字未改」；2026-10-01 一天顺延了 pi 对照债、xyflow、ai、mantine、standard-formats 两笔、package-budget 两笔、real-media 三笔 | 这类债不该是日期。要么给它绑一条真能被执行的计划（本次 0.24 技术栈线是第一份），要么承认没人在做并摘掉门岗，而不是每次到期前一天改日期 |
| 一次红多道纸面门岗 | 见上表：prior-art / door-map / root-cause-contracts / symptom-cluster / concept-owners 经常同时红 | 合并成一张表单：合同一次填完，门表、登记草稿由脚本补，只留一道检查 |

## 五、建议清单（等用户拍板，未执行）

**保留（真问题，成本可接受）**：`check:test-types`、`check:filesize`、`check:walkthroughs`、`check:design-lab`、`lint:ci`、`check:test-waits`、`check:vocabularies`、`check:icon-semantics`、`check:concept-owners`、`check:root-cause-contracts`，以及执行类 job 全部。

**已改（本 PR）**：`check:prior-art`——改成只管新增通用能力。

**合并**：`check:door-map` → 并进 `check:root-cause-contracts`（脚本自动补门表）；`check:test-types` + `typecheck` → 一次 tsc（省约 50 秒 / 次，需要先验证两份 tsconfig 能合）。

**降级为提示**：`check:symptom-cluster`（键太粗，6 次全是补文档）；Ponytail（70% 延后）。

**删除**：三道 advisory（docs-index / doc-status / research-sources）移出 PR 的 Contracts，只留 docs-autosync。

**复审但不动**：「贵而零红」的七道（见第三节）。

**降低每次的摩擦**（不删门岗，只改体验）：交付账本提醒改频率；欠账改日期的做法换成绑计划；5 道纸面门岗的表单收成一张。

## 六、建议新增的结果检查（等用户拍板）

这些是现有门岗查不到、而本窗口里真发生过的漏洞——都是**结果层**，不是「交没交文档」：

| # | 检查 | 抓什么 | 证据 |
|---|---|---|---|
| 1 | 全功能走查监视器加一条：界面出现**服务商原始 JSON / 内部 id / 价格预算字样**就红 | 用户直接看到的东西不该有的内容 | 反馈里「服务商原始 JSON 报错摆给用户」「Agent 话里念 id」；「预算」字样出现就是 bug（现有规矩，没有机器守） |
| 2 | 上报检查：**非终态不许当结果上报**（排队 / 运行中不得记成取消） | 数据本身是错的，看板上的数字没有意义 | 本窗口里查出：异步任务提交时被记成「取消」，视频 0/58 很可能是它造成的（#943 修了，没有机器守） |
| 3 | 分类器完备性：每个画布显示主人的改动必须选到 full 画布验收 | 验证被悄悄跳过 | #934 / #940 / #937 只跑了 critical（#944 已加测试，属于这一类的第一个） |
| 4 | 同一个「等用户」只有一种表示 | 两三份表示各自漏状态 | 付费卡轮询 + 审批闸 + ask_user（pi 九层对照问 1） |
| 5 | 自写登记（本 PR 的 `check:self-written`） | 重新造通用轮子 | #945 的 `laneContextFit`，引了出处照样自写 |
| 6 | 稳定性：Unit 红后「只改文档就变绿」的自动标记为疑似不稳定测试，周期性汇总 | 把误报从「靠人记得」变成数据 | 本窗口 2 次 |

## 七、方法与局限

- **范围**：`gh pr list --state merged --limit 50`（#888–#942 附近），按分支取 `quality-gate.yml` 的 `pull_request` 事件运行，共 91 次；红的 30 次逐个取 job，Contracts 失败的取日志，解析末尾「N 个门岗阻断失败」汇总（21 个 job）；另取 49 个 PR 各自最后一次成功运行的 Contracts 日志，统计每道门岗的耗时与 advisory 出现率。
- **分类口径**：对每次红灯，取同一 PR 的**下一次运行**，比较两次的提交之间改了哪些文件（`compare` 接口，仅用于文件类型判断，不用于 Git 身份）。纸面类门岗（prior-art、symptom-cluster、root-cause-contracts、door-map、concept-owners 等）只要修复里有文档 / 登记 JSON 变化就算纸面；代码类门岗（类型、体积、走查、lint 等）只要改了 `src/` / `electron/` / `tests/` 就算真。同一次提交里混着修多道门岗时，这个口径会把一部分归得偏「真」；本文没有逐个人工核对。
- **局限**：① 只覆盖已合并的 PR，被放弃的 PR 不在内；② 最后一次运行没有「下一次」的红灯不存在（合并前总有一次绿）；③ 「真」只表示改了代码，不表示这个问题会影响用户——例如文件体积那 4 次是不是有意义的拆分，没有判断；④ 零红的门岗没有判断它拦过什么历史问题；⑤ 误报只有「重跑过绿」和「修复只改文档的 Unit 红」两种可自动识别的形态，其它环境问题会被归进「真」。
- 本文不改任何门岗、不改任何基线；删除和降级等用户批示。
