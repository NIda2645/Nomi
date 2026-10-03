/**
 * 这个窗口发出去、主进程还没回话的画布生成请求（按节点 id 记）。
 *
 * 它是**进程寿命**的，不归项目会话管：切到项目库再切回来，项目会话里的东西都被释放、画布从磁盘重新装载，
 * 可那一笔请求还挂在 `nomi:tasks:run` 上、照样会出图、照样会扣钱。装载时的收敛
 * （canvasSnapshotNormalizer.convergeStuckMidFlightNode）把「存盘时在跑、又没有任务号」的节点当成上一个进程
 * 留下的幽灵转圈、收成空闲——对重启是对的，对切项目是错的：节点显示空闲，「生成全部」把它算进去，再扣一次钱
 * （S1-5 同类，2026-10-03）。所以收敛先问这里：这一笔还在路上，就不是幽灵。
 *
 * 只有一个写口：渲染层唯一的提交口 `runWorkbenchTaskByVendor`（taskApi）在 await 主进程前登记、回话后注销。
 * 主进程在同一个边界上另有一道硬闸（electron/tasks/nodeSubmitInFlight.ts）：同一节点在途时再来一笔直接拒。
 */
const inFlight = new Map<string, number>()

/** 登记一笔在途请求；返回注销函数（只生效一次）。没有节点 id 的请求不登记。 */
export function trackNodeSubmit(nodeId: string | undefined): () => void {
  const id = String(nodeId || '').trim()
  if (!id) return () => undefined
  inFlight.set(id, (inFlight.get(id) ?? 0) + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    const left = (inFlight.get(id) ?? 1) - 1
    if (left > 0) inFlight.set(id, left)
    else inFlight.delete(id)
  }
}

/** 这个节点此刻有没有一笔这个窗口发出、主进程还没回话的生成请求。 */
export function isNodeSubmitInFlight(nodeId: string | undefined): boolean {
  const id = String(nodeId || '').trim()
  return Boolean(id) && inFlight.has(id)
}
