# 未实现 playbook 静默建坏 Run —— 收 registry、当场失败、诚实终态

日期：2026-08-18 ｜ 分支：`claude/angry-tharp-3ec858`

## 一、现象与真实根因

`nomi_start_playbook` 传 `film.scene-recreation`（任何非 `brand.promo` 的名字）→ 工具**返回成功**、Run 落盘，
但 `status: "draft"`、`stages: []`、`gates: []`、`jobs: []`，此后再无事件。用户在任务中心看到一张
永远不会动的制作卡。

### 三处叠加（第 3 处与初始报告不同，实读代码后修正）

1. `electron/productionRun/productionRunRepository.ts:213` —— 整条流水线只认一个字面量：
   ```ts
   const isBrandPromo = input.playbook.name === "brand.promo" && Boolean(input.brief);
   ```
   非 brand.promo（**或缺 brief**）⇒ `stages/gates/artifacts` 全空、状态停在 `draft`。
   注意 `&& Boolean(input.brief)`：**brand.promo 不带 brief 也掉进同一个坑**，是同一类 bug 的第二个入口。

2. `productionRunService.ts:273` —— 方向门初始化挂在 `if (run.status === 'awaiting_direction')`，
   `draft` 直接跳过 ⇒ 永远不会有门。`resumeUnfinishedRuns` 同样只认 `awaiting_direction`，
   重启也救不回来。

3. **（修正）** 任务卡不是「没有按钮」，是「只有一个去了也没用的按钮」：
   `productionRunView.ts:261-270` 兜底分支给 `primaryAction: 'open-stage'`、`controls: []`
   （`controls` 只在 `status === 'running'` 时才给 pause/cancel）。于是卡片渲染出
   「查看当前阶段」——点了只是切到生成区（`useProductionStatus.ts:94`），画布上什么都没有；
   而**取消入口完全不给**。文案更是反着说：「这份草稿尚未产生付费调用，确认制作摘要后才会开始」
   ——根本没有可确认的摘要。
   （`ProductionRunTaskCard.tsx:281` 的 `!routedGate && action` 分支会渲染主按钮，
   所以原报告「只在 routedGate 时渲染」的判断不成立；真正的问题是这个按钮**无意义**。）

一句话：三处叠起来 = 静默降级成一个**无法操作、也无法解释**的状态，违反「不许静默降级，要诚实终态」。

## 二、改动范围

| # | 文件 | 改什么 |
|---|---|---|
| 1 | **新增** `electron/productionRun/productionPlaybooks.ts` | 已实现 playbook 注册表（唯一真相源）：阶段模板 + `listProductionPlaybookNames()` + `requireProductionPlaybook()` |
| 2 | `electron/productionRun/productionRunRepository.ts` | `create` 读注册表；未知 playbook / 缺 brief ⇒ **写盘前**抛人话错误。删掉 `isBrandPromo` 字面量比较（P1 加新必删旧）|
| 3 | `electron/capabilityCore/mcpToolCatalog.ts` | `playbook` 参数加 `enum`（从注册表 derive，不 hardcode）+ 诚实 description |
| 4 | `electron/capabilityCore/mcpToolResults.ts` | 历史坏 Run（`draft` 且无门）不再回 `nextActions: ['pick_direction']`，改成「取消重发起」|
| 5 | `src/workbench/production/productionRunView.ts` | `draft` + 无 stage 无 gate ⇒ 诚实终态：`tone: danger` +「这个制作无法继续」+ 只留取消 |
| 6 | `src/i18n/locales/generationCommon.ts` | 新增 zh-CN / en 文案（R15）|
| 7 | 各 `*.test.ts` | 见下「验收门」|

### 不动项

- **`draft` 状态保留在 union 里**。修完之后新 Run 不可能再停在 `draft`，但用户盘上**已经有**
  一个坏 Run（还有别的机器上的），把状态删了会读不出它。它从此是「历史遗留态」，
  由第 5 项负责诚实呈现 + 给出口。
- 任务中心分组（坏 draft 仍在 running 组）不动：它确实还没终结，取消后自然进 done。
- `brand.promo` 的 9 阶段流水线逻辑不动，只把「阶段清单」这份数据挪进注册表。

## 三、为什么这么修（不是补一个 if）

- **单一真相源**：`=== "brand.promo"` 这种字面量散在 repository / driverOps / service 里，
  加第二个 playbook 时必然漏改一处。收进注册表后，「有哪些 playbook」只有一个地方回答，
  MCP 的 enum 也从它 derive ⇒ 工具描述**结构上不可能**再和实现对不上。
- **当场失败 > 静默降级**：坏 Run 一旦落盘就产生事件流、快照、任务卡、MCP 投影五处噪音。
  在写盘前抛错，这一整类后果都不存在。
- **诚实终态兜底**：已经落盘的坏 Run 不能靠「以后不会再有」解决，必须给用户一个看得懂的说法
  和一个出口。

## 四、回滚

单 commit，`git revert` 即可。注册表是新增文件，无数据迁移、不改磁盘格式。

## 四·五、走查逮到的第二个根因（不在原范围内，但在同一条出路上）

R13 走查跑到「取消这个坏 Run」时直接弹了 **「操作失败：Invalid artifact id」**。查下去是
`productionRunIpc.ts` 的 `rendererCommandPayload`：

- `RENDERER_COMMAND_TYPES` 白名单里**有** `run.control`（第 8 行），
- 但 payload 构造器**没有**它的分支，于是掉进函数末尾那句「兜底当 artifact.adopt 处理」的 return，
- ⇒ **暂停 / 继续 / 取消从渲染端就没通过过**，用户点了只会看到一句风马牛不相及的
  「Invalid artifact id」。（MCP 的 `nomi_control_run` 走 dispatcher，是另一条路，所以是好的——
  这也解释了原报告里「实测可以取消」为什么成立。）

根因不是「少写了一个 if」，是**默认分支替别人猜形状**。所以两件一起做：补 `run.control` 分支，
并把兜底改成 `artifact.adopt` 显式分支 + 未实现类型**响亮抛错**。以后再往白名单加类型却忘了建
payload，会当场报「Production command payload is not implemented: X」，而不是伪装成产物错误。

顺带修好两条本就过期的走查断言（`production-budget-recovery.walk.mjs`：等的还是 N1 之前的
「紧凑行」形态、去设置页后没把任务中心开回来）。已 stash 到改动前跑过一次对账确认：
这两条在本次改动**之前**就是红的，不是本次引入。

## 五、验收门

- [x] 单测：未知 playbook ⇒ 抛错，且 `.nomi/runs/` 下**不留任何目录**（不是「建了又删」）
- [x] 单测：brand.promo 缺 brief ⇒ 同样抛错
- [x] 单测：`brand.promo` + brief ⇒ `awaiting_direction` + 1 个 gate（既有断言不回归）
- [x] 单测：MCP 目录里 `nomi_start_playbook` 的 `playbook.enum` === 注册表名单，且描述不再写「例如」
- [x] 单测：`buildProductionRunView` 对「draft + 空 stage/gate」⇒ `primaryAction: null` + `controls: ['cancel']`
- [x] 单测：渲染端 `run.control` 原样过桥；未实现的命令类型响亮报错
- [x] `pnpm run gates` 全过（5434 passed）
- [x] R13 真机走查 `tests/ux/production-stalled-draft.walk.mjs` 10/10 通过，截图亲眼看过
- [x] 回归：`production-mcp-journey.e2e.mjs` 43 条断言全过（真出 MP4）、`production-budget-recovery.walk.mjs` 修好后转绿
