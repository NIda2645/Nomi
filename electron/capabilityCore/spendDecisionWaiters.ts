// 「这一笔出价，此刻有一个回合在等它的结论」——进程内的一张转接表（2026-09-22 · 裁决 A/B）。
//
// ── 它在解决哪个真实摩擦 ──
//
// Agent 调 `generate`，面板出一张报价卡。此前这一步以「错误 + STOP」的形状把回合当场结束：
// 用户点了「生成 ¥X」之后，没有任何回合接得住这个结论——Agent 那头对「他到底批没批」一无所知，
// 下一句话只能靠猜。文稿方案那条路更糟：等用户点头等在**工具执行里**，撞 60 秒写类预算，三轮实测一次没成过。
//
// 现在等待住在审批闸（`laneApprovalGate.hold`，唯一的「等用户」owner），而报价卡上的结论是在**另一个对象**里
// 产生的（面板 → IPC → `appIntegrationSpendConfirm`）。这张表只做一件事：把那边的结论递到正在等的那个回合手里。
//
// ── 它不是什么 ──
//
//   · **不是等待的 owner**：它不 race signal、不管超时、不管关窗。那些全在闸里。这里只有「登记 / 递一次 / 注销」。
//   · **不是授权**：递过来的只是「用户点了什么」。钱的那条链（封印 → 铸收据 → 决门 → 消费 → 开跑）
//     仍然只在 `decideGenerationSpend` 一处，这张表碰不到它。
//   · **不落盘**：进程死则等待死（裁决 C：重启后那一次出价被撤回，见 `stalePresentationSweep.ts`）。
//
// ── 身份锚 operationId，不锚 quoteId（裁决 B）──
//
// 用户在卡上改一次参数，quoteId 就换一个；等的那个回合等的是「这份计划他批不批」，不是「这个报价他批不批」。
// 查不到登记 = 这张卡不是 lane 出的（分镜编辑器「提交执行计划」等）——递送是 no-op，那条路照旧工作。

export type SpendDecision =
  | Readonly<{ kind: "confirmed" }>
  | Readonly<{ kind: "declined" }>;

const waiters = new Map<string, (decision: SpendDecision) => void>();

function keyOf(projectId: string, operationId: string): string {
  return `${projectId}:${operationId}`;
}

/**
 * 登记「我在等这一笔」。返回注销函数，调用方必须放进 `finally`。
 * 同一笔同时只许一个回合等：第二个登记说明同一份计划被两个回合同时摆出去了，那是程序错误，当场抛。
 */
export function registerSpendWaiter(projectId: string, operationId: string, deliver: (decision: SpendDecision) => void): () => void {
  const key = keyOf(projectId, operationId);
  if (waiters.has(key)) throw Object.assign(new Error("generation_decision_already_awaited"), { code: "generation_decision_already_awaited" });
  waiters.set(key, deliver);
  return () => { if (waiters.get(key) === deliver) waiters.delete(key); };
}

/** 报价卡上的结论到了。只递一次（递完即注销）；没人在等返回 `false`。 */
export function settleSpendWaiter(projectId: string, operationId: string, decision: SpendDecision): boolean {
  const key = keyOf(projectId, operationId);
  const deliver = waiters.get(key);
  if (!deliver) return false;
  waiters.delete(key);
  deliver(decision);
  return true;
}

/** 这一笔此刻有没有回合在等（测试与诊断用）。 */
export function spendDecisionAwaited(projectId: string, operationId: string): boolean {
  return waiters.has(keyOf(projectId, operationId));
}
