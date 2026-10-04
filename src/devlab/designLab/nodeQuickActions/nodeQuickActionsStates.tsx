// 设计实验室 · 屏「画布 · 节点快捷动作（批次 1 样张）」的状态注册表（汇总口）。
//
// 真身按主题拆在 `states/`；这里只按固定顺序拼成一条清单，顺序必须与
// `tests/ux/design-lab/labStates.mjs` 解析 `states/` 的顺序（文件名排序）一致。
//
// 这屏的基线**没录**：样张阶段，等用户看过接触表拍板（calibration.json 的 pendingApprovalScreens 有登记）。
import { QUICK_ACTION_TOOLBAR_STATES } from './states/01-toolbar'
import { QUICK_ACTION_DERIVE_STATES } from './states/02-derive'
import type { LabState } from '../labScreen'

export const NODE_QUICK_ACTIONS_STATES: readonly LabState[] = [...QUICK_ACTION_TOOLBAR_STATES, ...QUICK_ACTION_DERIVE_STATES]
