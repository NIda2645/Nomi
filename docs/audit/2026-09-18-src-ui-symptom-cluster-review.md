# src/ui 与 src/i18n 症状聚类结构评审（2026-09-12 → 2026-09-18）

> 状态：结论已定，行动项待排期
> 触发：`check:symptom-cluster` —— 同一层 7 天里收到第 3 份根因合同就该问「是不是这一层的结构不对」，
> 而这一次是 **7 份**。本文回答那个问题；不修代码，只定性 + 给出可验证的行动项。

## 被聚到一起的七份

| 合同 | 它说的类根因 |
|---|---|
| `2026-09-12-model-availability-single-owner` | 「这个模型能不能用」没有 owner，每个界面自己重拼一次合取 |
| `2026-09-14-mcp-connection-truthfulness` | 同一份状态多扇写门只守一扇；写了不读回；「有哪些客户端」这份名单没有 owner |
| `2026-09-17-credential-failure-preserved-clause` | 一句真值取决于状态的话被写死进固定串，够不到唯一能判它的那层 |
| `2026-09-17-interactive-import-project-context` | 动作的项目 IO 归属靠各个 helper 自己现抓，而不是入口处由 owner 签发一次 |
| `2026-09-17-mcp-launcher-ownership` | 自动修复分不清「资源坏了」和「换了个合法的主人」 |
| `2026-09-17-project-artifact-storage-and-projection` | 存储 / 落位 / 传输投影三件事揉在一起，类型·身份·几何三条不变量没各自留住 |
| `2026-09-18-vendor-upsert-drops-fields`（本刀） | 重建一条记录靠手抄字段清单，漏一个字段没人报错 |

## 结论：不是七个 bug，是同一句话的七种说法

七份里有六份能归到同一个形状——**一份事实有几个人在回答**：

- **没有 owner**（availability、客户端名单、连接记录完整性）：真相散在各消费者手里，各拼各的，谁漏一项就多一个答案；
- **归属自己现抓而不是入口签发**（project IO context、launcher ownership）：谁先执行谁决定，于是同一个动作在不同路径下答案不同；
- **职责揉在一起**（storage/placement/projection、fixed string 里嵌状态判断）：一层同时回答几个问题，其中任何一个变了都没人负责。

第七份（本刀）是同一形状在**写路径**上的版本：`Vendor` 的字段清单同时存在于 `types.ts`（声明）和
`apply*Upsert`（手抄），两份规则，谁漏一项没人报错。

**为什么都落在 `src/ui`**：不是渲染层代码质量差，而是**渲染层是所有跨进程真相的最终消费者**。
主进程任何一处「事实没有 owner」，都要等到某个界面把它拼错、用户看见不一致时才暴露出来。
于是根因在 `electron/`，症状在 `src/ui`，合同的 `scope_paths` 因为要覆盖被改的界面文件而记在 `src/ui` 名下。
这条本身是**门岗的一个已知偏差**：它按 `scope_paths` 归模块，于是「主进程缺 owner」的一类问题会
持续堆在 `src/ui` 这一格上。

## 行动项（可验证，待排期）

1. **owner 登记表**（对应前三份）：延续 `check:vocabularies` / `check:boundary-owners` 的做法，
   给「跨进程事实」建一张登记表——每条事实一个 owner 模块 + 一条「读者不得重算」的断言。
   验收：随便抽三条已登记事实，渲染层没有任何一处重算它。
2. **动作入口签发归属**（对应 project IO context / launcher ownership）：把「谁是这个动作的
   window + project 主人」做成动作入口签发一次的令牌，helper 只许收不许抓。
   验收：helper 里不再出现 `getActive*()` 这类现抓调用。
3. **写路径穷尽约束推广**（本刀已在 catalog 做完）：`UpsertDraft<T>` 这类「每个字段都要有一条裁决」
   的编译期约束，横扫到 catalog 之外仍在手抄字段清单的持久化重建点（projects / 画布节点）。
   验收：给那些类型各加一个字段，写路径不改必须编译红。
4. **门岗归模块的偏差**：`symptom-cluster` 按 `scope_paths` 归模块，会把「根因在主进程、症状在界面」
   的合同一律堆进 `src/ui`。建议按合同的 `shared_boundaries[].path` 归模块（那才是修在哪一层），
   `scope_paths` 只当覆盖面。验收：拿这七份重跑，聚类落到真正的边界层上。

## 同一窗口里的第二个聚簇：`src/i18n`（6 份）

`check:symptom-cluster` 同时报了 `src/i18n`：`2026-09-12-announced-card-never-rendered`、
`2026-09-12-storyboard-plan-defaults-passthrough`、`2026-09-14-agent-panel-action-receipts`、
`2026-09-14-import-borrows-generation-waiting-surface`、`2026-09-14-media-import-single-owner`，
加上本刀。

**结论：这一格是纯粹的归模块噪音，不是结构问题。** 六份合同没有任何一份的类根因在文案层——
它们各自修的是投影、归属、单一 owner，只是「改了行为就得改一句话」，于是
`src/i18n/locales/*.ts` 出现在 `scope_paths` 里，被 `moduleKey()` 归进 `src/i18n`。
`src/i18n/locales/` 是**纯数据**（词典），没有判断、没有状态、没有写路径，结构上不可能是
七天里六个 bug 的共同成因。

这正是上面行动项 4 的第二份证据，而且比 `src/ui` 那份更干净：
`src/ui` 至少还有「渲染层是所有跨进程真相的最终消费者」这层真实关联，`src/i18n` 连这层都没有。
**建议把纯数据目录（`src/i18n/locales/`、各类 `*-baseline.json`）整体排除出聚类的模块归属**，
和 `check:root-cause-contracts` 里已有的 `isGeneratedDataFile` 豁免同一个道理：
一个会因为「改了一句文案」而报红的聚类门岗，报的不是结构问题，而是它自己的归类方式。
验收：拿这六份重跑，`src/i18n` 那一格消失，`src/ui` 那一格仍在。

---

本刀（`2026-09-18-vendor-upsert-drops-fields`）的修法与行动项 3 是同一件事，已落地；
其余三项（含两条门岗归类改进）不在本 PR 范围内，排期见 `docs/roadmap/TODO.md`。
