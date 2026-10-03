/**
 * 主进程的硬闸：同一个项目里的同一个画布节点，有一笔生成请求还在主进程手里（`runTask` 没回话）时，
 * 再来一笔直接拒，并说实话（结构化 code `node_generation_in_flight`，渲染层按 i18n 讲成「这个节点还在生成」）。
 *
 * 为什么要它（S1-5 同类，2026-10-03）：生成途中切到项目库再切回来，渲染层的项目会话被释放、画布从磁盘重装，
 * 节点一度显示空闲、「生成全部」把它算进去——供应商收到第二笔，扣两次钱。界面那一侧已经改成认这笔在途请求，
 * 但花钱的边界不能只靠界面：任何一个入口（另一个窗口状态、Agent、将来的新按钮）都可能再发一笔。
 *
 * 同一次提交的幂等重放（同 idempotencyKey）在 IPC 边界的 submissionLedger 里先合并成一次 runTask，到不了这里；
 * 逐个跑的变体（generationRunController 里 await 一个再发下一个）也不会撞上。
 */
const inFlight = new Set<string>()

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export class NodeGenerationInFlightError extends Error {
  readonly code = "node_generation_in_flight";
  readonly reason = "in_flight";
  constructor(nodeId: string) {
    super(`node_generation_in_flight: ${nodeId}`);
  }
}

/** 在「这一节点在途」的独占里跑一次提交；没有项目或节点身份的请求照常跑。 */
export async function withNodeSubmitExclusive<T>(extras: Record<string, unknown> | undefined, run: () => Promise<T>): Promise<T> {
  const projectId = text(extras?.projectId);
  const nodeId = text(extras?.nodeId);
  if (!projectId || !nodeId) return run();
  const key = `${projectId}\u0000${nodeId}`;
  if (inFlight.has(key)) throw new NodeGenerationInFlightError(nodeId);
  inFlight.add(key);
  try {
    return await run();
  } finally {
    inFlight.delete(key);
  }
}
