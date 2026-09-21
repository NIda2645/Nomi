# 结构评审：`electron/capabilityCore` 的「值层没有主人」（2026-09-21）

> 触发方式：`check:symptom-cluster` 红——2026-09-14 到 2026-09-21 的 7 天窗口里，
> `electron/capabilityCore` 收到第 9 份根因合同。门岗的原话是
> 「第三份合同是『这一层的结构不对』最便宜的证据，不是再修一次的理由」。
> 这份文件是那句要求的回应：**先看清这一层为什么反复出血，再继续修。**
>
> 范围：只评审 `electron/capabilityCore` 这一层。不提新架构方案，不改代码。

## 1. 簇里有什么

同窗口的 9 份合同（按日期）：

| 日期 | 合同 | 它治的那一刀 |
|---|---|---|
| 09-18 | `credential-destination-is-user-confirmed` | 凭据要发去哪里，宿主说了不算 |
| 09-18 | `draft-shots-drops-declared-model-identity` | 模型点名的 `modelKey`/`providerId` 在解构里没被列出来，**静默丢掉** |
| 09-18 | `full-auto-spend-card-and-static-receipt` | 花钱卡与收据的相位 |
| 09-18 | `shot-envelope-fields-die-in-hand-written-projections` | 镜头信封字段在五处手写投影里各死一次 |
| 09-18 | `skill-loader-diverges-from-ecosystem` | 技能加载与生态漂移 |
| 09-18 | `submission-not-dispatched` | 提交了没派发 |
| 09-18 | `verb-host-input-conformance` | 动词面与宿主面字段级不一致 |
| 09-20 | `shot-number-identity` | 镜号身份 |
| 09-21 | `model-spec-parity`（本刀） | 参数值层静默丢弃 + 模型身份不校验不可读 |

## 2. 一句话结论

**这一层的结构问题不是「边界画错了」，是「边界只管形状，不管值」。**

`electron/capabilityCore` 的每一条路上都已经有**结构**的主人：
schema 有主人（`generationPlanInputSchema` 一族）、路由有主人（`dispatcher.ts` 的 method 表）、
能力契约有主人（`registry.ts` 的 `CapabilityContract`）、投影有主人（`mcpCapabilityProjection`）。
9 份合同里有 7 份出血的地方**不在**这些主人身上，而在它们之间那一格：
**一个值通过了形状校验之后、到被真正使用之前，没有人负责它是不是这个模型真能吃的那个值。**

三种长相，同一个形状：

- **值被丢掉**（`draft-shots-drops-declared-model-identity`、本刀的 `compileParameters`）——
  形状合法，但解构/校验没列它，于是它无声消失；
- **值被重算**（`shot-envelope-fields-die-in-hand-written-projections`、`shot-number-identity`）——
  形状合法，但下游每处自己重新算一遍，算法不同就各自漂；
- **值没人核**（本刀的 `bindModelIdentity`、`verb-host-input-conformance`）——
  形状合法，注释写着「校验留在别处」，而那个「别处」在这条路上不存在。

三种都有同一个可观测特征：**不报错**。这正是它们能攒到 9 份的原因——
形状错会当场红，值错只会安静地做出一个不对的结果。

## 3. 为什么这一层特别容易出这个形状

三个可核实的结构原因：

1. **这一层有两个面，形状共用、值不共用。** 内部 lane 与外部 MCP 共用同一批
   schema 与契约（这是 09-18 那一刀的成果，是对的），但**值层的判据各自为政**：
   翻译层里的逻辑外部面天然没有（`docs/plan/2026-09-18-tool-layer-prior-art-verdict.md` §1 已记），
   而本刀查到的是它的对偶——准入层的判据两面都有、但**它判的那份 schema 有三个来源**
   （渲染层 curated 档案 / 目录 onboarding 派生 / video 档案投影），没有任何东西比对它们。

2. **「校验留在 X」这句注释没有任何机器在核。** 本刀那处的原话是「校验留在 UI 校验处」，
   而走这条路的是 MCP、UI 那层根本不在路上。这类注释在这一层还有多处，
   它们都是**声明过的 owner**——`check:boundary-owners` 已经在核「声明的 owner 在不在」，
   但核不了「那个 owner 在**这条调用路径上**在不在」。

3. **丢弃比拒绝便宜，而且当时看起来更安全。** `droppedFields` 是一个真实的好意：
   记下来、不打断用户。但记下来的东西**没有读者**，于是「记下来」在工程上等于「丢掉」。
   这一层至少还有一处同族写法（`warnings` 数组），它今天有读者，但没有任何东西保证它继续有。

## 4. 可检验的判据（给下一刀用，不是给这一刀）

从这 9 份里归纳出三条，都能机械判定：

- **判据 A**：一个值进了系统、又没进最终请求/写入，中间必须有一个**结构化的、带读者的**说明。
  「push 进一个数组」不算，除非那个数组有生产读者。
- **判据 B**：任何写成「校验留在 X」的注释，必须说得出 X **在哪条调用路径上**；
  说不出 = 这条路没有校验。
- **判据 C**：同一个语义（「这个模型接受什么」「这一镜是第几镜」「这个信封有哪些字段」）
  在这一层有两个以上来源时，必须有一条测试让它们**逐字段**对账；没有这条测试，来源数就会继续涨。

本刀落实了 A 与 B（值层改成结构化拒绝、注释里那个不存在的 owner 换成注入的真 owner），
**C 只落实了一半**：参数与变体两面同源了，模型说明书的人话文案还没有（见下）。

## 5. 这一层现在最该动的一刀（建议，未拍板）

**把「这个模型接受什么」收敛成一个主人。** 本刀把花钱那条路上的准入判据收成了一份，
但模型面被告知的那份（渲染层 `src/config/modelArchetypes`）仍在另一边，
而 `.dependency-cruiser.mjs` 的 `electron-no-import-src` 是硬零，主进程够不到它。
于是外部 MCP 面至今**没有任何读工具返回参数名**——它只能猜，然后靠本刀的拒绝信息在第二轮改对。

这一刀的物理前提是档案归一二期（video 那 39 个档案已经住在 `electron/shared/videoCapabilities`，
自称 *canonical home*；image/audio/3d 那 58 个还在渲染层）。它是**一次搬家**，不是一次修补，
所以不该被塞进任何一份 bug 合同里——这正是本评审存在的意义：
**把它从「第 10 份合同」改写成「一刀结构工作」。**

## 6. 本评审不主张的

- 不主张 `electron/capabilityCore` 需要拆分或重构目录结构。9 份合同里没有一份的根因是「文件放错了」。
- 不主张增加门岗。判据 A/B/C 里只有 C 值得机器化，而机器化它的前提是先有一个主人可比对。
- 不主张冻结这一层的改动。它出血多是因为它是**所有外部入口的必经之路**，
  改动频率高本身不是缺陷证据。

---

# 追加（2026-09-22）：`electron/catalog` 也成簇了

本刀把档案搬进中立契约层之后，`electron/catalog` 的文件进了合同的 `scope_paths`，
于是它在同一个 7 天窗口里也凑够了阈值。门岗要求点名它，这一节就是回应。

**它成簇的原因和 `electron/capabilityCore` 是同一条**：`electron/catalog` 是「目录说什么」的
主人，而「模型说什么」的主人一直在渲染层（档案）。两份知识描述同一个对象（这个模型接受什么），
中间没有任何东西比对——`modelParameterSchema` 从 onboarding 字段与 mapping 默认值里凑一份、
档案里另有一份、video 档案投影再算一份，三份都对同一个问题给答案。
本刀把**准入判据**收敛到档案那一份，并在 `agentModelEntriesFromCatalog` 里把
「目录行（身份 + 可用性）」与「档案（能力 + 参数）」显式 join 成一个对象——
这是让两份知识**在一处相遇**，不是又加一份。

**实测支持这个判断**（数字见 `docs/plan/2026-09-21-model-spec-parity.md` §A-3）：
全目录 **0 个**模型带 `onboarding.fields`；`parameterSchema` 非空的 6 个**全部**来自
`mapping.create.defaultParams`。也就是说 `electron/catalog` 这一层里「模型参数」这份知识
今天几乎是空的——它一直由档案承担，只是主进程够不着。**搬家消除的正是这条缝，不是掩盖它。**

**这一层下一刀该看的**（建议，未拍板）：`catalogStore` 参与的硬环（架构耦合审计分析五已点名），
以及 `onboarding.fields` 这条今天零使用者的来源要不要保留——它是用户自接模型的唯一参数声明口，
删不得，但需要一条真实用例证明它走得通，否则下次还会有人以为「目录里有参数表」。
