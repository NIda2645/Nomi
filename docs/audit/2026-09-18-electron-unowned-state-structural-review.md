# 结构评审：`electron` 这一层 7 天 41 份合同，说的是同一件事

> 状态：现行 · 2026-09-18
> **触发**：`check:symptom-cluster` 拦下了第 41 份合同——「同一模块 7 天内 ≥3 份根因合同」。
> 门岗原话：「第三份合同是『这一层的结构不对』最便宜的证据，不是再修一次的理由。」
> 本文是它要求的那份评审。**覆盖模块：`electron`（含 `electron/agentLane`）。**

## 1. 数字

| | |
|---|---|
| 2026-09-12 ~ 09-18 的根因合同 | **41** |
| 其中判为 `recurring`（会复发） | **38** |
| 防线类型是 `centralized-boundary`（= 事后建一个 owner） | **29** |
| 类根因里明写「这份状态没有 owner / 没有单一真相源」 | 18 |
| 明写「多处各自实现 / 手抄一份 / 散在 N 处」 | 17 |
| 明写「错了不报错 / 编译期看不出 / 静默」 | 12 |
| 三者同时出现 | 6 |

**29 次「建一个 owner」的意思是：7 天里我们发现了 29 份没有主人的状态。**

## 1.5 按模块拆开（合同按 `scope_paths` 归属，一份合同可跨多个模块，故有重叠）

这四个子模块各自都越过了聚类阈值。**逐个看下来，它们不是四种毛病，是同一种毛病的四个现场**——
所以本文不拆成四份评审，各举一条最有代表性的类根因为证：

### `electron/capabilityCore` — 15 份（最密集）
> 「没有要确认的东西」和「我没能把要确认的东西变成一张卡」**共用同一个返回值**（空数组 / undefined），
> 而调用方无法区分。这个形状在 announce→render 链上重复出现了六处，各自独立写成。
> （`2026-09-12-announced-card-never-rendered`）

> 「这个模型现在能不能用」是一条跨进程、跨界面的不变量，而仓库从来没有给它一个 owner：
> 每个新界面落地时都在自己那一层重新拼一次「启用 + 发布 + 钥匙」的合取，拼漏一项就是一个新的答案。
> （`2026-09-12-model-availability-single-owner`）

### `electron/shared` — 12 份
> 这一层只导出了**给界面看的 getter**，没有导出**给请求体用的 resolver**。
> 作用域语义因此只在显示端被执行，发送端没有。
> （`2026-09-12-storyboard-plan-defaults-passthrough`）

> 同一份状态有多扇写门却只在其中一扇装守卫；写下去的值没有对应的读回校验；
> 而「有哪些客户端」这个事实没有 owner，每个消费者各抄一份，编译器也不再拦。
> （`2026-09-14-mcp-connection-truthfulness`）

**`electron/shared` 值得单独说一句**：它本应是「放单一真相源的地方」。
12 份合同落在这里，说明**我们往这一层放的是共享的代码，不是共享的权威**——
放进来的东西仍然被各处重新实现，只是路径变短了。

### `electron/productionRun` — 5 份
> 「常驻生成面在本会话里装没装、没装是为什么」这份状态没有 owner，有三份 nullable 影子。
> （`2026-09-14-resident-generation-adapter-install`）

> 镜头信封没有单一真相源，每个投影点各自手抄一份字段列表；TypeScript 对此完全沉默。
> （`2026-09-18-shot-envelope-…`，即触发本次评审的那一份）

### `electron/agentLane` — 9 份
> 「一份外部知识包进提示词」这件事没有 owner：拼装散在调用点上，于是两条不变量在每个调用点
> 各自可以缺席，而**缺席不报错**。仓里本来有一个正确的实现，但它**零生产调用者**，
> 于是『看起来有』和『跑的时候没有』长期并存。
> （`2026-09-15-selected-skill-injection`）

最后这条尤其值得记住：**正确的实现已经写好了，只是没人调它。** 这与 §3 的「958 个主人没人核」是同一件事的两面——
一面是声明了没人核，一面是实现了没人用，**共同点是「存在」被当成了「生效」**。

## 2. 共同形状

41 份合同的措辞几乎可以互换，抽出来是三句话，缺一不可：

> **一份状态没有 owner ⇒ 每个消费点各自重新回答一次 ⇒ 答错了不报错。**

第三句才是致命的。前两句只是重复劳动，第三句让重复劳动变成**不可发现的重复劳动**：

- `2026-09-12-run-task-grant-class`：「漏带 grantId 编译期看不出、运行期才炸，而且炸得和『模型答不出来』长得一模一样」
- `2026-09-14-agent-panel-action-receipts`：「动作 handler 是可选的（缺了照画钮，TypeScript 不说话）……界面上『成功了』和『什么都没发生』长得一模一样」
- `2026-09-15-generation-shell-bottom-band`：「类名改错既不影响编译、也不影响任何既有测试」
- `2026-09-18-shot-envelope-…`：「对象字面量只要满足目标类型的必填项就合法，漏掉可选字段既不报错也不警告」

这四条分别出自权限、界面、布局、数据投影四个完全不同的子系统，**而它们描述的是同一种缺陷**。

## 3. 真正的结构问题：主人声明了，但没人看着

**这是本次评审唯一的新发现，也是我认为最该动的一处。**

合同 schema 里有 `shared_boundaries`：路径 + 符号 + 「这个边界负责拦住什么」。它是**机器可读**的。

实测全仓：

| | |
|---|---|
| 根因合同总数 | **458** |
| 其中声明了机器可读 `shared_boundaries` 的 | **406** |
| 累计声明过的 owner 条目 | **958** |

**而读这个字段的只有合同校验器自己**（`scripts/root-cause-contracts.mjs`，只校验路径存在、且被 `scope_paths` 盖住）。
**没有任何门岗核对「这个被声明的主人，今天是不是还是唯一的那一个」。**

于是每一份合同都在说「我建了主人，这一类不会再复发」，然后：
- 主人被删掉 → 不报错
- 主人被改名 → 不报错
- 主人旁边长出第二份实现 → 不报错

**958 个承诺，0 个被机器核对过。**

这和本周其它几处是同一个形状，不是巧合：
- 技能正文里「`draft_shots` 不碰画布」躺着为假（该动词自述「在画布上创建或更新草稿镜头」）——**没有任何流程要求任何人去核它**，所以文档形态的规则在这里执行次数是 **0，不是「偶尔漏」**。
- 分镜表 v6 的机器契约停在 v5，**绿了 12 天**——判据只问「有没有契约、跑没跑」，答不出「它描述的还是不是现行拍板」。
- 镜头信封的字段集合在七层投影里手抄，**编译期全合法、测试全绿**。

## 4. 现有门岗为什么拦不住

`check:vocabularies` 就是为这一类建的（「单一语义 owner 门岗」），而且是**自动发现**的，不靠登记。它拦不住的原因很具体：

判据在 `scripts/check-vocabularies-scan.mjs:372`——一个候选集合只有在「成员像生命周期词」**或**「声明路径里带语义 owner 词」时才算数。而那份 owner 词表是：

```
status statuses state states phase phases stage stages step steps lifecycle lifecycles health outcome outcomes
```

**没有 code / codes / failure / error / limit / precision / field / allowlist。**

所以它只看得见「状态机词表」这一种无主状态。本周 41 份合同里的无主状态是：失败码族、字段信封、体积上限（30MB/600MB/200MB/80MB/64MB 散在六处）、小数精度、白名单、能力可用性、项目身份……**一种都不在它视野里。**

实测：`capability_execution_failed` 在词表基线里出现 **0 次**。

## 5. 建议（按性价比排序，都不改产品行为）

### R1 · 让 958 个已声明的主人变成会红的断言（推荐先做）
新门岗读全部合同的 `shared_boundaries`，逐条核：
- **(a) 符号还在不在那个路径上** —— 今天就能做，纯静态，零误报。主人被删/改名 = 那份合同的承诺已作废，必须当场知道。
- **(b) 有没有长出第二份实现** —— 记下立约时该责任的实现处数，只减不增（棘轮）。

代价小、覆盖面 958 条，而且**不需要任何人再写新东西**——信息已经在盘上躺了几个月。

### R2 · 把 `check:vocabularies` 的 owner 词表从「状态机」扩到「任何被多处回答的问题」
至少补 code/codes/failure/error/limit/limits/precision/allowlist。
**加之前先验它会红**（现在应该立刻红出失败码族与体积上限族）。

### R3 · 合同模板加一问：「这份状态的主人是谁创建的时候就有的吗？」
29/41 是事后补主人。事后补是对的，但**出生时就没有主人**这件事本身没有被记录，所以看不出「哪些子系统在持续生产无主状态」。
这一问只加一个字段，用于下次评审做归因，不阻断任何人。

## 5.5 同一形状的渲染层实例：`src/workbench` 的分镜账本（2026-09-18 补）

`src/workbench` 这一层 2026-09-15 → 09-18 也聚到了 ≥3 份合同（`2026-09-15-shot-seconds-precision`、`2026-09-17-*` 六份、`2026-09-18-agent-storyboard-single-ledger`）。最后那份就是本评审 §3 的形状在渲染层的复现：**一份用户看得见的东西（「Agent 刚起的分镜」）声明了两个主人**——Run 的 `generationPlan` 落成画布节点，分镜表却读 `storyboardDesignsByDocumentId`；09-14 删掉 Agent 写账本 B 的动词时没有任何东西核「谁还在读 B」，于是「表里没有 Agent 的镜头」活了四天、五轮真机。修法与 §5 R1 同向：让 owner 成为会红的断言——production 表 `rows: z.never()`（第二份真相在 schema 上不可能）、表只在落地事务里同生（`src/workbench/capability/multiShotCanvasLanding.ts`）、金路径走查只读账本 A。它同时给 R1 提供了一条渲染层的样本：`docs/fixes/2026-09-18-agent-storyboard-single-ledger.root-cause.json` 的 `invariant_owner_layer`。剩下的账本 B（用户手写方案）带到期日 2026-10-16 退役（`docs/roadmap/TODO.md` T-DS-19）——这正是 §3 说的「登记是承诺不是防线」在本仓第一次被写成带日期的承诺。

## 6. 不建议做的

- **不建议**把 41 份合同回头合并或降级。它们各自都是对的，问题不在单份质量。
- **不建议**给 `check:symptom-cluster` 抬阈值。它这次拦得完全正确——**它是本仓今天唯一一个成功阻止「再补一次」的机制**。

## 7. 未证实

- ~~「29 份 `centralized-boundary` 里有多少个主人今天已经被侵蚀」——本文没查，这正是 R1 要回答的。~~
  **已答，见 §8。**
- 本文只覆盖 `electron`。`src/`（渲染层）是否同构未查。

---

## 8. R1 做完了：958 条的第一次体检（2026-09-18）

门岗 `check:boundary-owners`（`scripts/check-boundary-owners.mjs`，判据在 `scripts/boundary-owners.mjs`），
已进 `gates:contracts`。第一次全量体检：

| | |
|---|---|
| 声明过的 owner | **958** |
| 主人还在原位 | **803**（83.8%） |
| 主人不在了 | **67**（7.0%）——路径没了 40 ／ 符号没了 27 |
| symbol 机器读不了 | **88**（9.2%） |

**侵蚀率 7%，低到足以让这道门岗当天就硬起来**，所以没有走分阶段。67 条的处置：

- **改锚 12 条**：同名符号只是搬了家（如 `readSkillCuration` 移到 `electron/shared/`），
  台账登记新锚，**门岗接着核新地址**——这是真修，不是豁免。新锚坏了照样红。
- **退役 45 条**：主人被整体删除，理由逐条取自真实删除提交。最大一族是 agent-lane 切换
  （`36f343204` 一系「remove retired owners…」）与 `3f5ca19e5`「删掉旧面板闭包」，
  都是 P1「加新必删旧」的正常结果，那几条不变量确实不再适用。
- **待查 10 条**：有名字相近的后继（如 `RUNWAY_RATIO_FAMILIES` → `RUNWAY_VIDEO_RATIO_ENUMS`），
  但等价性没读码核实，**不冒充已修**；棘轮只减不增。

**最刺眼的一条**：`2026-08-31-generation-result-retrieval-boundary` 声明的
`electron/assets/projectAssetStore.ts :: importGeneratedBytes`，
`git log -S --all` 显示这个符号**在仓库历史里一次都没出现过**，只命中合同自身那次提交。
也就是说它**立约当天声明的就是一个不存在的主人**——旧校验器只查 `path` 存在、不查 `symbol`，
所以这条「已建 owner，此类不会再复发」的承诺从第一天起就是空的，而且整整没人发现。
同一份合同另外 5 条边界都在位，所以它看起来一直很健康。

### 8.1 顺带挖到的：合同事实上是写一次就冻住的

试着把一份合同里搬了家的 `path` 改对，`check:root-cause-contracts` 连环报 **11 条错**——
因为 `validateContract` 要求 `enforcement_path`／回归测试**在本次 diff 里有变化**，
而那是当初那次修复的产物。**于是「主人搬了家，把合同改对」这条路是堵死的。**
这也是为什么本次的处置台账必须活在合同**外面**。

顺带暴露：那份合同自己还有 2 个 `scope_paths` 和 2 个 `regression_tests` 指向已不存在的文件——
同样因为历史合同从不复检，**今天完全看不见**。

### 8.2 §4 的一处过度乐观：体积上限/小数精度/白名单，`check:vocabularies` 结构上够不着

§4 说「补 code/codes/failure/error/limit/limits/precision/allowlist 就能看见本周这批无主状态」。
实测逐词加进 `SEMANTIC_OWNER_TOKENS` 后的新增 owner 数：

| 词 | 新增 | 是不是本周合同里的真实无主状态 |
|---|---|---|
| `code`/`codes` | **+55** | 是（含 `PUBLIC_CODES`，`capability_execution_failed` 在词表基线里确实 0 次） |
| `failure`/`failures` | **+13** | 是（**六份手抄的 `PUBLIC_FAILURE_CODES` 副本**全在里面） |
| `error`/`errors` | **+29** | 是（各 `*ErrorCode` 联合） |
| `field`/`fields` | **+19** | 是（镜头信封那类手抄字段列表） |
| `capability`/`capabilities` | **+27** | 是（能力可用性） |
| `identity`/`identities` | **+1** | 是（项目身份） |
| `limit`/`limits` | **+0** | **否** |
| `precision` | **+0** | **否** |
| `allowlist` | **+0** | **否** |

后三个是 0 不是巧合：**体积上限和小数精度是标量常量，不是成员词表**，
而这个扫描器按「≥2 个字符串成员的枚举」找候选，**结构上就够不着它们**。
要拦 30MB/600MB 散在六处，得另建一道「同一个量的多处字面量」门岗，不是给这道加词。
（`kind`/`reason`/`mode` 分别 +310/+50/+60，远超本周覆盖面，加了会淹掉真信号。）

### 8.3 为什么这次没有把词加进去

六个有依据的词一起加，扫描器从 210 涨到 **328 个 owner，门岗当场红出 118 条「新词表未登记」**——
方向完全正确，六份 `PUBLIC_FAILURE_CODES` 一个不漏地被捞了出来。

但 `check:vocabularies` 的两个桶都容不下它们：`registered` 要求逐条写明「为什么它有资格当独立 owner」
（门岗自己还有 `GENERIC_AUTHORITY_REASON` 正则专门拒套话），`debt` 则是硬棘轮
（`debt-cap-loose` + `historical-new-debt` 双向锁死，**新增 debt 结构上不允许**）。

118 条里每一条都要真读代码判「该复用现有 owner 还是确属独立」。**在没有真判过的情况下批量写 118 条理由，
就是造第 119 个「以为有人在管」**——正是本文要消灭的东西。所以这次**只交测量、不改词表**。

建议分三批推进，每批独立可验收：
1. **`failure`/`failures`（+13）**先做——收益最集中（六份手抄码表），且已有 09-17 那次
   「六份手抄同步齐」的现场；正解是把六份收敛成一份 derive，收敛完这 13 条自然消失，不用登记。
2. **`code`/`codes` + `error`/`errors`（合计 ≈70，去重后更少）**次之，多半能并进同一次码表收敛。
3. **`field`/`fields` + `capability` + `identity`（+47）**最后，与镜头信封收敛一起做。

## 9. 补记（2026-09-18 晚）：`electron/harness` / `electron/skills` 的技能加载层是同一形状的第三例

同一天 `electron/harness` 收到本周第三份合同（`2026-09-15-selected-skill-injection`、`2026-09-18-skill-restates-registry-facts`、
`2026-09-18-skill-loader-diverges-from-ecosystem`），三份都落在**技能加载 → 进提示词**这一条链上。结构结论与 §3 一致，
只是主人不是「声明了没人看」，而是**声明了两次**：`electron/skills/skillStore.ts` 与 `electron/agentLane/laneInstalledSkills.mts`
各写了一份技能遍历器，两份都比 pi 自带的 `loadSkills` 窄一点、窄在不同的轴上（一份只认 `root/<dir>/SKILL.md`，一份对不叫
SKILL.md 的路径直接抛）；`electron/harness/context/agentContext.ts` 又逐字手抄了 pi 的 `<skill>` 信封，因为那一层被钉死不许摸 pi。
「一个 Skill 别的宿主读得到、Nomi 也读得到」这条不变量在 22 份合同里被记了 59 次，却没有一个机械的主人。

这一层的结构评审正本是 `docs/plan/2026-09-18-skill-loading-migration.md`（59 条不变量逐条三档判定 + 迁完的分层 + 留下的每个文件
为什么 pi 取代不了）。处置：主人搬到岛上一处（`electron/agentLane/laneSkillCatalog.mts`，pi 的 `loadSourcedSkills`），
`electron/harness/context` 只剩身份 / 语言 / 合成，选中技能进提示词的唯一注入点在 `laneSkillPrompt.mts`（pi 的 `formatSkillInvocation`）。
`check:framework-boundary` 新增 `private-skill-directory-walk` 让两份旧遍历器的名字回不来；`skillFrontmatter.test.ts` 把唯一留下的本地解析
钉在 pi 的 `parseFrontmatter` 上（88 份真技能逐文件深等）。
