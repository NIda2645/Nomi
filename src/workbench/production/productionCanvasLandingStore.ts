// P4 S5 — 画布落地的运行时驱动（渲染层）。一个轻 store 持有「当前项目最活跃的多镜 Run 全量」，
// 供占位节点派生三态（shotPlaceholderState）。真相源仍是主进程的 Run（这里只是它的只读投影缓存，非第二真相源）。
//
// 逐镜 result 回填**不在这里 poll**：由主进程调度器完成一镜即 requestRenderer('production.attach-shot-result')
// 推过来（「逐个冒」），渲染层在 capability handler 里落地（multiShotCanvasLanding.attachShotResult）。
// 打开项目补齐时的历史 result 由 materialize-shots 载荷一并带过来回填。故本 store 只管三态渲染，不碰 url。
import { create } from 'zustand'

import type { ProductionRun } from '../../../electron/productionRun/productionRunTypes'

type LandingStore = {
  projectId: string | null
  run: ProductionRun | null
  /** E2E 专用：钉住注入的 Run，让 host 的 poll 不覆盖（零额度走查构造各态并存的批次验三态占位）。生产恒 false。 */
  pinnedForE2E: boolean
  setRun: (projectId: string, run: ProductionRun | null) => void
  reset: () => void
}

/** 占位节点读它派生三态。只读投影缓存——写入只来自 host 的 poll（pinnedForE2E 时除外）。 */
export const useProductionCanvasLandingStore = create<LandingStore>()((set, get) => ({
  projectId: null,
  run: null,
  pinnedForE2E: false,
  // pin 住时 poll 的 setRun 是 no-op（走查注入的 Run 说了算）；生产从不 pin。
  setRun: (projectId, run) => { if (!get().pinnedForE2E) set({ projectId, run }) },
  reset: () => { if (!get().pinnedForE2E) set({ projectId: null, run: null }) },
}))
