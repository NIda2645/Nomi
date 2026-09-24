import { ProjectHydrationSupersededError } from './projectCanvasReadSurface'

/** 在飞的那一次操作；由调用方（React ref）持有，跨渲染存活。 */
export type InFlightSlot<T> = { current: Promise<T> | null }

/**
 * 同一时刻只跑一次：在飞期间再触发，拿到的就是同一个结果；落定（成功或失败）后才放行下一次。
 *
 * 项目生命周期里「重复触发会真的多做一遍」的动作都经这里——离开项目（重复点返回只存一次盘）、
 * 建项目（界面卡住时多点的几下会排队、恢复后一口气执行，每一下都真建一个空项目，后一次的
 * 打开还会把前一次顶掉；2026-09-24 用户反馈卡死恢复后项目库多出空项目、顶上挂着「新建项目失败」）。
 */
export function shareInFlight<T>(slot: InFlightSlot<T>, start: () => Promise<T>): Promise<T> {
  if (slot.current) return slot.current
  const operation = Promise.resolve().then(start)
  slot.current = operation
  const clear = () => { if (slot.current === operation) slot.current = null }
  void operation.then(clear, clear)
  return operation
}

export type ProjectCreationOutcome = { projectId: string; opened: boolean }

/**
 * 打开刚建好的项目。被后来的打开顶掉（用户已经转去开别的项目）不是创建失败：
 * 项目已经在盘上了，只是这一次没去打开它，所以返回 false，不往外抛。
 * 其余错误照常抛给入口去报。
 */
export async function openCreatedProject(open: () => Promise<boolean>): Promise<boolean> {
  try {
    return await open()
  } catch (error) {
    if (error instanceof ProjectHydrationSupersededError) return false
    throw error
  }
}
