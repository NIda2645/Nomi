// 付费卡上的动作排成的那一条队（每一次出价一条：projectId + operationId），以及「这一次出价最终批下了哪几镜」什么时候才算定。
//
// ── 队 ──
// 卡上的动作（生成这张 / 去掉这张 / 生成剩下）按这一份计划一个接一个跑完：连点两下、连按回车、点完这张立刻点下一张，
// 后一下读到的是前一下落盘之后的 Run（「同一镜只发一次」靠的就是这个顺序，而不是渲染层的防抖）。
// × 和「在卡开着时打字」不排队，要的就是能打断它。
//
// ── 结局什么时候算定 ──
// 卡可以在队里那一下批到一半时关掉。那一镜过完卡上的核对、门还没开的时候收回出价，没有门可撤，它随后照样封印、批下、
// 发出、花钱（2026-10-02 搞破坏线 X2 / X4：真 App 主进程忙，× 晚到几秒正好落在这儿；回执当场读，把它写成「没生成、没花钱」）。
// 所以说结局的地方——× 回给卡的那一句（`appIntegrationSpendConfirm.discardPendingSpend`）、Agent 的回执
// （`generationTransportAdapters.readPresentationOutcome`）——都先等队里的动作落定（`cardActionsSettled`），
// 读到的才是宿主最终批下的那一份。不各自猜，也不各存一份「批到第几张」。
//
// 进程内、不落盘：进程死了队也没了（那一次出价由启动清扫收回，见 `stalePresentationSweep.ts`）。

const queues = new Map<string, Promise<unknown>>();

function keyOf(projectId: string, operationId: string): string {
  return `${projectId}:${operationId}`;
}

/** 把卡上的这一下排进这一次出价的队：前面的都跑完（成或败）才轮到它。 */
export function serializeCardAction<T>(projectId: string, operationId: string, run: () => Promise<T>): Promise<T> {
  const key = keyOf(projectId, operationId);
  // 前一下的失败已经原样交给了它自己的调用方（它拿到的就是那个 promise）；这里只是不让它卡住后一下。
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(run);
  queues.set(key, next);
  void next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => undefined);
  return next;
}

/** 等这一次出价在队里的动作都落定（队空 → 立刻）。之后读 Run，读到的就是宿主最终批下的那一份。 */
export async function cardActionsSettled(projectId: string, operationId: string): Promise<void> {
  const key = keyOf(projectId, operationId);
  // 等的时候又排进来一下（卡关了之后它会当场失败）：接着等，直到队空。
  for (let tail = queues.get(key); tail; tail = queues.get(key)) await tail.catch(() => undefined);
}
