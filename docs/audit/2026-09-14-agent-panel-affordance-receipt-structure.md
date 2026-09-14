# 结构评审 · Agent 面板「做得了吗 / 发生了吗」两类不可见缺省（2026-09-14）

状态：✅ 已交付（本评审所定的两条结构防线已随本轮修复落地；遗留项见第 4 节处置清单）

> R21.2 触发的结构评审。本轮 `docs/fixes/2026-09-14-agent-panel-action-receipts.root-cause.json`
> 把 `electron/shared`、`src/workbench`、`src/i18n`、`src/devlab` 四个模块推过了 7 天 ≥3 份合同的线。
> 本文点名的就是这四个模块，逐个说清「这一簇到底是不是结构问题」。

## 0. 先把假信号摘掉

四个模块的计数（`electron/shared` 46、`src/workbench` 92、`src/i18n` 23、`src/devlab` 4）里，
绝大部分来自 **2026-09-08 那一次 lane 切换的批量合同**：一次迁移把几十份合同压在同一天落盘，
7 天窗口自然被撑满。`check:symptom-cluster` 只会数，不会区分「一次迁移」和「同一处反复出事」——
这是它该有的样子（门岗只判做没做，不判做得好不好，R21.2）。

所以本评审**不**对那 160 多份逐个复盘，只回答一个问题：
**2026-09-14 这份合同指向的结构问题，是不是一个真的、还会再来的结构问题？**
答案是**是**，而且它在本次修复之外还剩一处活的实例。

## 1. 这一簇真正的结构形状

Agent 面板 v4 把两件事都留成了**不可见的缺省**：

| | 编码方式 | 缺省时界面上的样子 | 后果 |
|---|---|---|---|
| **这件事这里做得了吗** | 组件的 `on*` prop 是可选的，宿主漏接就是 `undefined` | 钮照画，和能用的钮**长得一模一样** | 点了没反应 |
| **这件事发生了吗** | 终局是正文的一个属性（`interrupted` 挂在 `assistant-text` 上） | 没有正文就没有那一段，**什么都不画** | 看起来没发生 |

两件事合起来的效果是同一个：**「成功了」和「什么都没发生」在界面上不可区分**。
用户 2026-09-14 报的三条里有两条是它——而且用户对两条的判词一模一样：「点了没反应」。

### 量一下这个面有多大

- v4 四个积木文件里共 **38 个可选 `on*` 回调**
  （`AgentPanelV4Cards.tsx` 16 · `AgentPanelV4Composer.tsx` 14 · `AgentPanelV4Message.tsx` 5 · `AgentPanelV4Receipt.tsx` 3）。
- 其中 **17 处**把可选回调**无条件**绑在 `onClick` 上（`grep -n "onClick={on[A-Z][A-Za-z]*}" src/workbench/ai/v4/*.tsx`）。
- `V4FlowHandlers`（`src/workbench/ai/v4/AgentPanelV4Panel.tsx:45`）声明 8 个键；
  唯一的宿主 `ProjectAgentResidentShell.tsx:505` 此前提供 6 个。

### 还活着的同类实例（本次未修，按下面的处置走）

**`onUndoTask` 是第二颗死钮。** 它在 `V4FlowHandlers` 里声明（`AgentPanelV4Panel.tsx:51`）、
在任务卡的「撤销」上被无条件绑定（`AgentPanelV4Panel.tsx:184`），而宿主从未提供它
（`ProjectAgentResidentShell.tsx:505-532` 只有 `onCopy / onRetry / onContinue / onUndoTool /
onAdoptCandidate / onErrorAction / onSuggestion`）。任务卡上那颗「撤销」今天点下去什么都不会发生。

它**没有**和 `onRetry` 一起修，理由是诚实的：撤销一张任务卡需要一个真的撤销实现
（任务卡只写引用 `LaneTaskNote`，会动的数字每次投影时现去领域读），那是一次产品行为决定，
不是接一根线。本次只做了**结构上的防线**，使它无法再隐身——见第 2 节。

## 2. 本轮落的结构防线（不是补丁）

1. **`src/workbench/ai/v4/AgentPanelV4Message.tsx`：接了才画。**
   三个动作从「缺了照画、按下去没有去处」改成「没有 handler 就不画那颗钮」。
   于是「钮在」在这一个积木上等价于「这件事这里做得了」——宿主漏接会表现为**少一颗钮**，
   而不是多一颗死钮。`agentPanelV4Blocks.test.ts` 有一条断言专门钉这件事。
2. **`src/workbench/ai/v4/AgentPanelV4Panel.tsx`：条件也算「做得了」的一部分。**
   `onContinue` 不再只看宿主接没接，还看这一条有没有 `continuationEntryId`——
   宿主那边本来就会对没有它的条目原地返回，那也是一颗死钮。
3. **`electron/shared/agentLane/laneProjection.ts`：终局必有段。**
   `pushAssistantParts` 在 `stopReason:'aborted'` 且没有任何 text 内容时补一段空正文的
   `interrupted` 回执。回执不再依附于正文是否存在。
4. **`src/i18n/locales/agentPanelV4.ts`：`stoppedNotice`（已停止 / Stopped）。**
   这个模块进簇只是因为新增一对键；它不是结构问题，本条只为完整记账。
5. **`src/devlab/designLab/v4/states/01-vocabulary.tsx`：取景台显式接线。**
   实验室此前靠「不接」来取景，恰好让生产侧的漏接看起来正常。
   现在它显式接成空操作——「宿主没接会怎样」只由断言表达，不由实验室的缺省表达。
   这个模块进簇同样是跟随改动，不是独立的结构问题。

## 3. 没做的、以及为什么

- **不把 38 个可选回调一次性改成「接了才画」。** 那是 17 个控件的形态改动，
  其中相当一部分是用户拍过板的介入槽/composer 形态（R8/P5：用户可见改动先出样张）。
  正确的顺序是先把判据固定下来（本轮在 ② 助手文本上固定），再按面逐个走样张。
- **不为 `onUndoTask` 编一个「看起来能撤销」的实现。** 那正是这一簇的病因本身。

## 4. 处置清单

| 项 | 处置 | 责任层 |
|---|---|---|
| ② 助手文本的三个动作 | ✅ 本轮：接了才画 + 复制自带回执 + 空正文中断态出「已停止」 | `AgentPanelV4Message.tsx` |
| 零正文的终局回执 | ✅ 本轮：投影层补段 | `electron/shared/agentLane/laneProjection.ts` |
| 任务卡「撤销」（`onUndoTask`） | ⬜ 待办：要么实现真撤销，要么不画那颗钮；先出方案 | `ProjectAgentResidentShell.tsx` + `AgentPanelV4Cards.tsx` |
| 其余 16 处无条件绑定的可选回调 | ⬜ 待办：逐面核对宿主是否真的接了，按面走样张后统一改成「接了才画」 | `src/workbench/ai/v4/` |
| `check:control-contract` 拦不住「宿主把可选 handler 漏成 undefined」 | ⬜ 欠账：门岗只看组件内部，看不见跨文件的装配缺席 | `scripts/check-control-contract.mjs` |

## 5. 一条顺带纠正的事实（别让它变成下一个前提）

用户会话转录（`2026-09-12T22-37-40-455Z_01a097c4-….jsonl`）里 5 次 `cancel_requested`
曾被读成「等了 37.8 秒 / 99.9 秒才真停」。**那是误读**：把 `control.requestedAt` 与同一个
run 的 `nomi.ui.trace.endedAt` 对齐后，5 次停止的真实时延是 **6 / 3 / 4 / 11 / 3 毫秒**；
37.8 秒与 99.9 秒是用户**按下停止之前**已经干等的时间。
四种真机场景（单帧挂起流 · 150ms 一帧的连续 SSE · 一个字节都不给的静默流 · HTTP 500 重试退避）
实测停止落地 29–63ms。**取消链路没有问题，缺的是回执。**
