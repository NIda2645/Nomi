# 「模型身份是一对」的结构评审（2026-09-21）

> 状态：📎 结构评审（`check:symptom-cluster` 触发：模块 `src/workbench` 与 `electron/shared` 7 天内均 ≥3 份根因合同）
> 触发合同：[`docs/fixes/2026-09-21-storyboard-model-vendor.root-cause.json`](../fixes/2026-09-21-storyboard-model-vendor.root-cause.json)
> 同类前序合同：`2026-09-05-model-identity-vendor-key`（身份唯一键补 vendor + `check:model-identity`）、`2026-09-12-storyboard-plan-defaults-passthrough`（批量条补 vendor 的同一轮）

## 1. 这一簇里真正同类的是哪几份

`src/workbench` / `electron/shared` 这两个键覆盖整个渲染层和整个共享契约层，7 天内 21/22 份合同大多互不相干（键太粗的问题见 09-21 画布落点评审 §1，不重复）。和本单**真正同一个形状**的，是按时间排开的这一串——它们不全在 7 天窗口里，但症状一字不差：

| 时间 | 入口 | 症状 | 当时的修法 |
|---|---|---|---|
| 07-31 | 画布节点模型框 | 同名两家，锁定的那家被静默改写 | `findModelOptionByIdentifier` 加 vendor 二次寻址 |
| 09-03/05 | 分镜落画布、Agent 模型清单、健康记账 | 选 APIMart，请求发去 code-newcli-com（真实付费走查 HTTP 400） | 身份唯一键补 vendor；`check:model-identity` 类型层棘轮 |
| 09-12 | 分镜批量条 | 选 A 家发去 B 家 | `applyModelToAll` 补 vendor 参数 |
| v0.21.0 | 画布节点去重模型框 | 自定义 gpt-image-2 顶掉 APIMart | `useDedupedModelSelect` 选中匹配加 vendor |
| **09-21（本单）** | 分镜镜头卡、批量条（09-12 的补丁在 UI 那一跳又丢了）、锚行 | 选 APIMart，钱花在自定义中转 | 见 §3 |

五次都是「选 A 家、请求发去 B 家」，五次都当场无异常、类型合法、门岗全绿。

## 2. 结构：身份是一对，但它被存成两个互相独立的字段

`PlanShot` / `PlanAnchor` / `keyframe` / 画布节点 meta 都把身份存成**两个兄弟字段** `modelKey` + `modelVendor`。于是有两种坏法，而现有防线各只看得见一种：

1. **写半个**：任何 `{ ...shot, ...patch }` 只要补丁里有 `modelKey` 没有 `modelVendor`，旧供应商就留下来，和新模型拼成一个「A 模型 × B 家」的身份。`check:model-identity` 是类型层判据——它只查「声明了 modelKey 却没有供应商字段」的类型，而 `PlanShot` 两个字段都声明了，所以看不见这种**运行时只写一半**。本单的三处复现全是这一种。
2. **按名字读**：一份只有 `modelKey` 的已存数据（旧镜头、Agent 没给 vendor），每个读者自己决定落哪家——`find` 第一条、按用户顺序、按目录顺序……**回显与执行各答各的**。目录又是新接入的在前，所以「第一条」恰好就是用户刚自定义的那家。

这就是 09-18「一个语义没有主人就会被重新发明」的原形：「给镜头换模型」和「一个没记家的模型名指哪家」这两个语义**没有主人**，每个组件、每条 Agent 路径各自回答一次。

## 3. 本单做到哪一步（已实施）

- **写的主人**：`storyboardPlanEdits.ts` 的 `planModelSelection(modelKey, vendor)` 是唯一构造器；`PlanShotPatch` / `PlanAnchorPatch` 在类型上不允许单独出现一半（字面量补丁直接 tsc 红）；`updateShotAt` / `updateAnchor` 运行时再兜一次（无类型调用者只写 modelKey → 旧供应商被清掉，绝不沿用）。`addShot` / `insertShotAt` 成对继承，`shotKindPatch` 成对清空。
- **读的主人**：`modelIdentity.ts` 的 `pickImplicitVendorMatch`（用户顺序 > 官方 > 内置中转 > 自接 > 目录序）是「没记家的模型名指哪家」的唯一判定口，被模型框回显（`findModelOptionByIdentifier` / `useDedupedModelSelect`）、执行索引（`buildModelEntryIndex`）、Agent 规范化（`normalizeStoryboardAnchorDefaults`）、兜底默认阶梯（`pickStoryboardDefaultModel`）共用——显示哪家，就发去哪家。
- **选择器的主人**：锚行删掉了自己那只原生下拉，与镜头卡、画布节点共用 `useDedupedModelSelect`。
- **持久化边界**：真机走查又挖出第三种坏法——`storyboardPlanSchema` 的锚 schema 里根本没有 `modelKey`/`modelVendor`，zod 默认静默丢未知键，于是锚上选的模型在重开项目（`projectNormalize`）和 materialize 能力那一刻就没了。补上字段，并加了一条逐键对账的编译期守卫（手写类型的每个键 schema 必须都有；删掉 `modelVendor` 做过变异验证，tsc 当场红）——原来那对「互相赋值」的守卫看不见缺席的可选字段。
- `electron/shared` 的 `planResolver.findCandidate` 也改为按 (modelKey, modelVendor) 取候选（分镜节奏审阅不再拿另一家的时长约束）。

## 4. 仍然没做、应该做的结构性修法（提议，未实施）

**把身份存成一个值，而不是两个字段**：`PlanShot.model?: { key: string; vendor: string }`（锚、首帧、节点 meta 同形）。这样「写半个」在数据形状上就不存在了——补丁要么整体替换 `model`，要么不碰它；`{ ...shot, ...patch }` 也拼不出混搭身份。`check:model-identity` 的判据可以随之收紧成「多供应商层不许出现裸 `modelKey` 字段」，把运行时那一半也收进机器判据。

**为什么这一单不做**：它是持久化格式（`project.json` 里的分镜方案、画布节点 meta）+ Agent/MCP 对外契约（`draft_shots`、`patch_shots` 的 `modelKey`/`modelVendor` 字段、`storyboardPlanSchema`）的迁移，按 R5⑤ 要先写对外格式的规范与偏差，按 P5/R4 要先出 `docs/plan` 并过评审；本单是用户报障（花错钱）的最小根因修复。

**本单没把它搞得更糟**：类型层的 `PairedModelIdentity` 已经是这个值类型的前身——将来迁移时只需把 `PlanShotPatch` 里那一对换成 `model`，写口都已经收在 `planModelSelection` 一处。

## 5. 残留（同步写进合同 `residual_risks`）

- `production.revise-storyboard` 由 LLM 整份重写方案：提示词已要求 modelKey/modelVendor 同进退，但「改了 modelKey、留着旧 modelVendor」只在下游被 `buildPlannedNodeMeta` 拒掉（节点回落默认模型），没有在解析时就拒收。§4 的单值身份能从形状上消灭它。
- 画布 `findModelOptionByIdentifier` 在「记的那家不在了」时仍回显另一家（画布自愈的既有行为，有测试钉住）；执行侧会拒绝已断开的供应商，分镜模型框则显示未选中。
