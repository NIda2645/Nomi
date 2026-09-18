import type { StateCreator } from 'zustand'
import type { WorkspaceMode } from '../workbenchStore'
import { workspaceModeCarriesCreationResourceTree } from './creationResourceTreeModes'

/**
 * 创作资源树（「创作内容」那一列）的收起态 —— A-1 刀 1。
 *
 * **寿命 = 窗口/进程级的用户偏好，不是项目内容。** 它表达的是「我这台机器屏幕多大、
 * 我习惯怎么用」，所以：一份全局值、落 localStorage、跨项目与重启都保留，
 * **不** bump `persistRevision`、**不**进 projectRecordSchema。写法照现役
 * `agentDockHidden`（`preview/editingPanelLayoutSlice.ts:70-76, 105-111`）——
 * 那是本仓唯一一份「用户级 UI 偏好」的既有机制，这里复用它而不是新造第二种寿命。
 *
 * 三态而不是布尔：`null` = 用户从没设过 → 按面给默认（创作面展开、分镜面收起，
 * 见 `DEFAULT_COLLAPSED_BY_MODE`）；一旦手动设过，那个全局值覆盖两面的默认
 * （2026-09-17 用户拍板 grill 题 ③ + ③b）。
 */
const STORAGE_KEY = 'nomi.creationResourceTreeCollapsed'

/**
 * 「没设过时这一面默认收不收」的唯一 owner。
 * 创作面写剧本要在文稿/方案之间跳，那列是导航；分镜面横向预算紧（1280 + Agent 开时
 * 分镜表只剩 568px），收起就把 240px 还给表。两个默认只许写在这里一处。
 */
const DEFAULT_COLLAPSED_BY_MODE = { creation: false, storyboard: true } as const satisfies Record<
  Extract<WorkspaceMode, 'creation' | 'storyboard'>,
  boolean
>

/** 树不在场的面（生成/预览）恒当「收起」——它们本来就没有这一列。 */
export function creationResourceTreeCollapsedFor(mode: WorkspaceMode, preference: boolean | null): boolean {
  if (!workspaceModeCarriesCreationResourceTree(mode)) return true
  if (typeof preference === 'boolean') return preference
  return DEFAULT_COLLAPSED_BY_MODE[mode as keyof typeof DEFAULT_COLLAPSED_BY_MODE]
}

export function readCreationResourceTreeCollapsed(): boolean | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    return raw === '1' ? true : raw === '0' ? false : null
  } catch { return null }
}

export type CreationResourceTreeSlice = {
  /** null = 用户没设过（按面给默认）；boolean = 用户设过的全局值。 */
  creationResourceTreeCollapsedPreference: boolean | null
  setCreationResourceTreeCollapsed: (collapsed: boolean) => void
}

export const createCreationResourceTreeSlice: StateCreator<
  CreationResourceTreeSlice,
  [['zustand/subscribeWithSelector', never]],
  [],
  CreationResourceTreeSlice
> = (set) => ({
  creationResourceTreeCollapsedPreference: readCreationResourceTreeCollapsed(),
  setCreationResourceTreeCollapsed: (collapsed) => {
    // 用户偏好不是项目内容：直接记住，不触发项目 persistRevision。
    try { globalThis.localStorage?.setItem(STORAGE_KEY, collapsed ? '1' : '0') }
    catch { /* 存储不可用时，本次会话仍可收起/展开。 */ }
    set({ creationResourceTreeCollapsedPreference: Boolean(collapsed) })
  },
})
