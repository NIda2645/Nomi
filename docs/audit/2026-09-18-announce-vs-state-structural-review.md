# 结构评审 2026-09-18：宿主「说的那一句」与产生它的那份状态之间没有绑定

状态：✅ 结构评审已交付（R21 症状聚类闸要求）。本文只做结构判断，不冒充多人审批；
提出的三条结构动作里，第 3 条碰用户可见行为，**要用户拍板才做**。

触发：`fix/auto-mode-spend-card-and-receipt-20260918` 这一轮 `gates:contracts` 的
`check:symptom-cluster` 同时报出五个模块 —— `electron/agentLane`、`electron/capabilityCore`、
`electron/productionRun`、`electron/shared`、`scripts`。计数与合同清单转录在下表，
结论不依赖那份 `/tmp` 日志长期存在。

| 模块 | 窗口 | 7 天内的根因合同数 |
|---|---|---|
| `electron/agentLane` | 2026-09-14 → 2026-09-18 | 9 |
| `electron/capabilityCore` | 2026-09-12 → 2026-09-18 | 15 |
| `electron/productionRun` | 2026-09-12 → 2026-09-18 | 5 |
| `electron/shared` | 2026-09-12 → 2026-09-18 | 12 |
| `scripts` | 2026-09-12 → 2026-09-18 | 13 |

## 1. 这不是五个模块各自有毛病，是同一层的同一件事

把这五个模块 09-12 以来的 40 份合同的 `class_root` 逐条读一遍（`docs/fixes/2026-09-1[2-8]-*.root-cause.json`），
它们落在四个形状里，而四个形状是同一条缺失不变量的四种长相：

**形状 A — 一份状态没有 owner，或者有两个。** 最大的一族。
「这个模型现在能不能用」（`2026-09-12-model-availability-single-owner`）、
「常驻生成面装没装」（`2026-09-14-resident-generation-adapter-install`，三份 nullable 影子）、
「contentType → kind」（`2026-09-15-media-kind-single-judgment`，三份独立实现）、
「允许什么」（`2026-09-14-settings-allowlist-default-deny`，两个 owner 且空值语义相反）、
「有哪些 MCP 客户端」（`2026-09-14-mcp-connection-truthfulness`，每个消费者各抄一份）。

**形状 B — 一个返回值同时代表「没有」和「我读不到」。**
`2026-09-12-announced-card-never-rendered`（announce→render 链上六处各自写成 `catch { return [] }`）、
`2026-09-13-spend-surface-capability-guard`（能力不存在 vs 调用失败）、
`2026-09-17-import-progress-finishing-phase`（一个标量代表三阶段）。

**形状 C — 声明承诺了一件事，实现没兑现，而两者之间没有任何机器绑定。**
`2026-09-17-credential-failure-preserved-clause`（一句「真伪取决于状态」的话被写进固定串）、
以及本轮这一份（`2026-09-18-full-auto-spend-card-and-static-receipt`）：
`verbDeclaration.ts` 的后果句写着「全自动档它直接应用，**而且结果会这么说**」，
而真正写结果的 `laneExtendedTools.ts` 查的是一张静态表。

**形状 D — 「可选」被当成防线。** 可选 handler、可选依赖、nullable 影子：缺了不报错，只是悄悄少做一件事
（`2026-09-14-agent-panel-action-receipts`、`2026-09-14-resident-generation-adapter-install`）。

四个形状的共同底：**「谁有资格说这句话」这件事，在这一层不是被声明的，是被约定的。**
`electron/shared` 放判据（`capabilityApprovalPolicy`、`verbDeclaration`），
`capabilityCore` / `agentLane` / `productionRun` 各自在自己的面上把那份判据「再说一遍」，
而「再说一遍」和「读同一份」在编译器眼里一模一样。`scripts` 高频出现不是因为脚本坏，
恰恰相反——它是每次修完之后唯一能长出防线的地方，所以每份合同都会碰它一次。

## 2. 为什么现有机制拦不住

仓里已经有三件对的工具，但它们各管一段，中间恰好漏掉这一族：

- `check:vocabularies` 管的是**词表**（状态/阶段的枚举值有没有第二份定义），不管「某一句话的依据是谁」；
- `check:door-map` 管的是**写口**（一份状态有几扇门），不管「有几处在复述它」；
- `check:framework-surface` 管的是**上游框架**公开的每个字段有没有裁决，不管**我们自己**声明的字段有没有被下游消费。

所以形状 C 今天完全没人看：一个动词可以在 schema 上声明 `candidate: { providerId, modelId }`，
而传输层 `laneVerbTransport.ts` 的 `draftShotToPlanShot` 把这个字段**直接丢掉**
（实测：`tests/ux/agent-spend-full-auto.walk.mjs` 因此在隔离 profile 上恒红于
「没有配置可用的图片模型」——模型填了 candidate，宿主没收到）。声明与实现分家，编译、测试、门岗全绿。

## 3. 这一轮做了什么（已落地，不是提案）

- 报价卡：把「这一笔此刻由档位代答」做成一份**有始有终**的事实，唯一 owner
  `electron/capabilityCore/policySpendDecision.ts`；判据仍只在 `spendDecidedByPolicy` 一处，
  投影端只读事实、不重问档位（形状 A）。
- 工具回执：闸新增 `decisionFor(toolCallId)`，回执经 `LaneToolExecutionContext.approvalDecision`
  从真实结论派生，删掉静态表（形状 C）。
- 机器判据：`check:announced-card` 新增 `hardcoded-card-claim`，
  受检文件里写死的 `kind: 'user_sees_*_card'` 当场红，并把 `laneExtendedTools.ts` /
  `verbDeclaration.ts` 纳入 WATCHED。按 R17 修前实跑验过它会红（3 处 → 0 处）。

## 4. 结构上还欠的三件（第 3 条要拍板）

1. **声明字段必须被消费**（拦形状 C，无 UI 影响）。给动词声明加一道与
   `check:framework-surface` 同形状的逐字段裁决：`VerbDeclaration.schema` 里的每个字段，
   要么在 `laneVerbTransport` 的翻译里出现，要么在声明上显式标注「本面不消费，理由是…」。
   今天的反例现成：`draft_shots` 的 `candidate`（两层都有）被 `draftShotToPlanShot` 丢弃。
2. **回执这一面纳入同一条不变量**（拦形状 C 的下一个动词）。本轮只钉住了 `kind`；
   `spendCardResult` 的 `code: 'user_sees_spend_card'` 仍靠代码分支保证，不靠门岗。
   要么把「宣称有卡」的判定抽成一个必须传入真实状态的构造函数，要么承认它是测试守着的债并登记到期日。
3. **时间轴编辑的卡该说什么**（用户可见，**要拍板**）。本轮真机实测发现：走 20 动词那条路的
   `edit_timeline`，用户看到的是通用能力审批卡（「调整时间线 / 把调整写入当前时间线」），
   既没有逐条人话摘要、时间轴上也没有计划高亮带——那两件是旧传输层路径 `apply_edit_plan` 才有的。
   证据：`tests/ux/agent-timeline-ops.walk.mjs` 换掉过期锚点后第一次走到这里并保持红，
   文件里写清了为什么不许删那条断言。改卡长什么样属于 P5/R8，先出样张再实施。

## 5. 这份评审不证明什么

它不证明这五个模块现在健康。它只说：**同一条缺失不变量在 40 份合同里反复出现，
而今天没有任何一道防线在看「谁有资格说这句话」。** 上面第 1、2 条是可以直接做的结构补齐，
第 3 条是产品决定。在这三条落地之前，同一族还会继续以新的长相回来。
