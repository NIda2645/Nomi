# 结构评审 · 「等用户」这一层（`electron/agentLane` / `electron/productionRun`）

- 触发：`check:symptom-cluster` —— `electron/agentLane` 在 2026-09-17 到 2026-09-22 的 7 天里收到 21 份根因合同，`electron/productionRun` 20 份。
- 范围：本文只评审**「这一刻在等用户」**这一件事在这两层里的归属，以及它的终态。两个簇里其余合同（会话恢复、压缩、批调度、预览令牌…）不在本文证据范围内。
- 证据全部来自真机：2026-09-22 三轮真实模型轨迹（`docs/evidence/2026-09-2{1,2}-askback-real-model*`）、spend 七条走查在合并 ③ 提交上的归因复跑、以及两个临时探针（占位节点 id 与面板 pending 的逐字段比对；提问卡待答时的 composer 输入）。

## 一、这一层今天真正的形状

「等用户」有三个 owner，而且三个的性质互不相同：

| owner | 等在哪 | 受不受工具超时管 | 被打断时 | 重启后 | 「用户说不」是不是终态 |
|---|---|---|---|---|---|
| 审批闸 `laneApprovalGate` | `before_tool` | 不受 | resolve（不 reject），记录走 `drainNotes` | 不复活卡 | 是（`denied` / `answered` / `cancelled`）|
| 付费卡（Run 账本 + 面板 1.5 秒轮询）| 回合**之外**：`generate` 先以 isError 收场，卡留在面板上 | 不适用 | 不适用 | **卡还在**（落盘的），回合早没了 | **不是**：× 走 `dismiss`，计划仍是 `draft` |
| 文稿方案的确认 `presentStoryboardAuthoring → requestRendererDecision` | **工具执行里** | **受**（写类 60 秒）| abort 冲不掉那个 promise | — | — |

三个后果各对应一条用户撞得到的事：× 之后占位节点被重建（第二行的「不是终态」）；`generate` 对文稿方案三轮实测一次没成过（第三行的「受超时管」）；
有卡待答时打字被读成别的意思（宿主只认审批闸那一种等待，而且把「答」和「拒」折成了一个动作）。

## 二、判断：是不是结构问题

是。形状与 2026-09-21 付费确认那份评审、2026-09-22 失败正文那份评审同一句话：**一个语义没有主人，于是每个需要它的地方各自回答一遍，而各自回答不会报错。**
这一次多出来的变体值得单独记：**终态不由账本自己说、要靠第二趟往返去补**。× 之后「别复活」靠的是渲染层观察到节点被删、再另发一趟
`plan.detach-shot-nodes`（先读再写、失败静默吞掉）——任何这种形状都自带一个抢跑窗口，而抢输的那一侧不会报错，只会多出一个节点。

## 三、本轮做掉的（`docs/fixes/2026-09-22-waiting-for-user-one-owner.root-cause.json`；方案 `docs/plan/2026-09-22-waiting-for-user-one-owner.md`）

1. × = 真终态：`generation.cancel` + `cancelReason: "declined"`；`dismiss` 一支（reducer 分支、两个 store、接口成员、`dismissGenerationPlan`）同 commit 删净；落地不认被撤回的计划；同一个 operationId 不再被 present 复活。
2. 提问卡待答时打字 = 那道题的答案（`answer`，不是 `deny`）；有闸在等时 follow-up 与 steer 同义。
3. `agent-spend-card.walk.mjs` 自合并 ③ 起第一次全程绿；七条 spend 走查全绿。

## 四、没做掉的 / 下一刀

1. **裁决 A/B/C/F**：把付费卡与文稿方案的等待挪进审批闸的 preflight（表里第二、三行并进第一行），待决身份锚 `operationId`，启动时作废落盘的未决计划，确认后同回合再 `generate` 不出第二笔的端到端证明。方案已写，未实现。
2. **多镜计划上 × 的产品后果**：× 只撤卡上摆出来的那几镜的占位，而整份计划已终结——没摆出来的镜的节点留在画布上，再要生成得重新起草。要么 × 撤整份草稿的全部占位，要么卡上说清「这会关掉整份方案」。这是产品取舍，不是实现细节。
3. **渲染层两处**（等合并 ④）：composer 那颗圆钮在「有卡待答 + 有字」时是停止不是发送；第二张卡一出来就停在「确认不要」那一态。
4. 两个簇里其余合同没有在本文里被评审。
