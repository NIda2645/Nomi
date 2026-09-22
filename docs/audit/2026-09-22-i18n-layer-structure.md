# `src/i18n` 结构评审 —— 三份合同撞在一起，有几份是真的

> 状态：📎 交接/日志 · 2026-09-22
> 触发：`check:symptom-cluster` 报 `src/i18n` 模块 7 天内第 3 份根因合同（R21）
> 结论先说：**三份里只有一份是真的同层问题，另两份是顺带；但那一份是真的，而且有普遍形状。**
> 本评审只定位与开清单，**不在本 PR 动手**。

---

## 1. 触发这一簇的三份合同

| 合同 | 它为什么碰了 `src/i18n` | 门 | 判定 |
|---|---|---|---|
| [`2026-09-18-vendor-upsert-drops-fields`](../fixes/2026-09-18-vendor-upsert-drops-fields.root-cause.json) | 根因是**供应商记录重建用了白名单式保留而非白名单式覆写**，`assetIngestion` / `authScheme` 被静默抹掉。i18n 只出现在**读**门（`onboardingProviders.ts` / `resources.ts` 的 `zhOnboardingProviders`）——修的时候顺带补了几句接入文案 | read | 🟡 **顺带** |
| [`2026-09-22-shot-cut-truncation`](../fixes/2026-09-22-shot-cut-truncation.root-cause.json) | 根因是**「这批结果给全了没有」没有跨进程 owner**。改 `generationCommon.ts` 是因为旧文案「只取了前 N 个」**正是在准确描述旧 bug**，行为改了文案必须跟着改 | write | 🟡 **顺带**（文案跟着行为走，是对的） |
| [`2026-09-22-deconstruction-node-terminal-state`](../fixes/2026-09-22-deconstruction-node-terminal-state.root-cause.json) | 根因是**终态判定没有 owner**。碰 i18n 有两件事：①新增两个状态词的文案（正常）；②**真机走查抓到译好的句子被写进了落盘字段**，切语言不跟随 | write | 🔴 **真同层**（第 ② 件） |

**先说诚实的那一半**：`src/i18n/locales/` 是一个扁平目录，**任何**用户可见的改动都要碰它。
门岗的模块键取路径前两段（`src/i18n`），所以一周里只要有三次用户可见的修复，
它**必然**成簇。这一簇里 2/3 属于这种机械聚集，不是结构证据。

**再说不诚实地放过去会亏的那一半**：第三份里的第 ② 件是真的，而且它**不是拆解独有的**。

---

## 2. 真的那一条：哪些文字该落盘，哪些只该投影

本轮的病灶原话（合同 `residual_risks` 与 PR 正文均有记）：
中断那句话原本在收敛时 `i18n.t()` 译好写进 `source.errorMessage`，
而 `errorMessage` 随分镜表落进 `project.json`。
于是**用户在中文界面下中断一次、之后切 English，这句话永远留在中文**。

扫了一遍 `src/workbench` 里 `i18n.t()` 的结果流向（`grep -rn "i18n\.t(" src/workbench`，
排除测试与 `desktopT`），**两类混在一起、仓库没有规则分开它们**：

### 🟢 盖章类（落盘是对的，不该改）

节点标题、提示词这类**一经创建就归用户所有**的内容：

- `nodes/extractShotCutsToNodes.ts:62`（切点节点标题）、`:80`（组名）
- `nodes/extractVideoFrameToNode.ts:51-52`（抽帧节点标题）
- `nodes/buildContactSheetNode.ts:112`（联系表节点标题）
- `nodes/PanoramaViewer.tsx:143-144`（全景截图节点的 title / prompt）
- `textEdit/buildTextEditNode.ts:58`、`nodes/renderRegistry.tsx:91`（默认标题）

**为什么盖章是对的**：用户随时可以重命名这些节点。
切语言时把它们重新翻译一遍，等于**覆写用户自己改过的名字**——那是更严重的 bug。
（同一个「盖章 vs 读时解析」的取舍，`docs/research/2026-09-12-storyboard-plan-defaults-passthrough/prior-art.md`
里对 React Flow `defaultEdgeOptions` 已经分析过一次，结论一致。）

### 🔴 投影类（落盘是错的）

**机器状态的说法**——状态本身是机器可读的，那句话只是它的一种呈现：

- ✅ 已修：拆解的 `interrupted` / `cancelled`
  → 改成只落 `status`，句子由 `deconstructionNoticeKey(status)` 在渲染时现取
- ❌ **仍在（同一个文件里就还剩一处）**：
  `nodes/shotTable/factBridge.ts:93`
  `errorMessage: i18n.t('generationCommon.node.deconstruct.desktopOnly')`
  ——「视频拆解需要桌面端」是**界面文案**，不是供应商原话，却同样被冻进 `project.json`

### 由此看清的结构问题

> **`errorMessage` 这一个字段同时装着两种东西**：
> 供应商 / ffmpeg 的**原话**（没有译文，也不该有，落盘正确）
> 与**我们自己写的界面文案**（有译文，必须跟随语言，落盘错误）。
>
> 字段名不区分，类型不区分，门岗不区分——于是每次写它的人**各凭直觉判一次**，
> 而判错的那一次要等到有人切语言才会被发现（本轮是真机走查抓到的，单测抓不到）。

这才是 `src/i18n` 这一簇里唯一值得记的共同结构：
**不是「i18n 这层不对」，而是「状态与它的说法之间缺一条分界」**，
分界没有 owner，于是落在每个调用点的自由心证上。

---

## 3. 另一条（更弱，只记不判）：键的增删没有单一登记点

三份合同都往 `locales/*.ts` 里加了键。今天的保证来自事后门岗
（`check:i18n` 的 key-parity / key-refs / dead-keys 四件），**没有**一个「新增一个用户可见状态
就必须同时登记它的文案」的**前置**登记点。

本轮的 `interrupted` / `cancelled` 是靠**人记得**同时改三个地方
（zod 枚举、`vocabularies-baseline.json`、两语文案）才没漏。
`check:vocabularies` 会拦住漏登记的状态词，但**不会**拦住「状态词登记了、文案没加」——
那要等 `check:i18n-key-refs` 在引用处才报。

证据不足以判它是结构问题（今天这套事后门岗确实拦得住，只是拦得晚），
**记在这里，等下一次同形复发再升级**。

---

## 4. 下一刀清单（**不在本 PR 做**）

| # | 事 | 为什么不现在做 |
|---|---|---|
| 1 | 把 `errorMessage` 拆成两个字段：`vendorMessage`（原话，落盘）与状态投影出来的界面文案（不落盘）。先清掉 `factBridge.ts:93` 这一处已知的 | 它会动分镜表的持久化 schema——T-ED-06 是发版前阻断，不该在同一刀里带一个 schema 迁移进去 |
| 2 | 全仓普查 `i18n.t()` → 落盘字段，按 §2 的「盖章 / 投影」两类逐条判 | 本评审只扫了 `src/workbench`，`electron/` 侧的 `desktopT` 是另一套（主进程按用户语言生成后下发，**不落盘**，本轮判过不构成同一问题），要一起看 |
| 3 | 若 ① ② 判下来「投影类」不止一两处，给它一道门岗（落盘 schema 的字段不许接 `i18n.t()` 的返回值） | 现在只有 1 处已知在途，样本不够。**≥3 处再上门岗**，否则是拿门岗猜 |
| 4 | §3 那条（状态词 ↔ 文案的前置登记）继续观察 | 证据不足 |

---

## 5. 本评审自己的结论

- `src/i18n` **这一层没有结构性问题**，成簇主要是「扁平目录 + 用户可见改动必经」的机械结果；
- 但本簇暴露了一条**跨层**的真问题：**状态与它的说法之间没有分界 owner**，
  典型症状是译好的句子被当数据落盘（已修一处、已知还剩一处）；
- 清单四条**全部留到下一刀**，本 PR 不动。
