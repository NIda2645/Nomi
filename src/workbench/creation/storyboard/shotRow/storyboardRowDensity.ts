import React from 'react'
import { FRAME_COLUMN_WIDTH } from './shotFrameGeometry'
import { REFERENCE_COLUMN_WIDTH, REFERENCE_SLOT_BOX } from './shotReferenceStackGeometry'

/**
 * 行的**密度档**（2026-09-21 用户拍板的样张 v1；`scratchpad/shotcard-layout/sample.html`）。
 *
 * ## 这一层在回答什么
 *
 * 同一份行网格要同时活在两个宽度里，而它只按宽的那一个设计过：
 * 左栏收起时编辑器 841px、提示词列 392px，一切正常；左栏展开时编辑器只剩 585px，
 * 而固定列（把手 + 画面格 + 参考列 + 三个间距 + 左右内边距）**雷打不动吃掉 415px**，
 * 提示词列只剩 136px——占位文字溢到卡外、时长胶囊被切、「生成」顶出右缘。
 *
 * v1 的裁决是：**窄下来的时候先让参考列**。参考卡是「已经定好的东西」，提示词是「每一行都要
 * 动手改的东西」；参考列收成一格后信息没丢（还有「+N」、点一下就摊开），提示词被切到 136px
 * 是真的写不了。
 *
 * ## 判据是 derive 出来的，不是一个断点数字
 *
 * `STORYBOARD_ROW_NARROW_BELOW` 不是量出来的经验值，是一句规则的算术结果：
 * **「提示词列比参考列还窄，就让参考列先收」**——即 `剩余宽 < REFERENCE_COLUMN_WIDTH`。
 * 参考列的宽本身又是从固定盒 derive 的（`shotReferenceStackGeometry`），所以盒子一改，
 * 这条判据跟着改，没有第二个要人工对齐的常数。今天算出来是 626px 行宽：
 * 左栏收起（行宽 807）走宽档、左栏展开（行宽 551）走窄档，两边都留着 180px 以上的余量。
 *
 * 判据永远按**宽档的**固定宽算，与当前处在哪一档无关——否则收窄后剩余宽变大、又判回宽档，
 * 两档之间会来回跳。
 *
 * ## 到期条件
 *
 * **T-DS-01 · A-2（全局左侧栏 + 删顶栏）落地时收回这一整档。** A-2 之后编辑器不再被左栏吃掉
 * 240px，参考列该回到三格常驻。补丁与它的到期条件写在同一处，别让它变成一条没人记得为什么
 * 在那儿的分支。
 */

/** 行首竖条（拖拽把手 / ⋯ / 跳过复选框）。与 `StoryboardRowShell` 的 `14px` 同一个数。 */
export const ROW_GRIP_WIDTH = 14
/** `gap-3`：列与列之间。 */
export const ROW_COLUMN_GAP = 12
/** `pl-1.5`。 */
export const ROW_PADDING_LEFT = 6
/** `pr-3`。 */
export const ROW_PADDING_RIGHT = 12
/** 行网格一共几列（把手 / 画面格 / 参考列 / 提示词块）→ 三个间距。 */
export const ROW_COLUMN_COUNT = 4

/** 提示词列**拿不到**的那部分：三个固定列 + 三个间距 + 左右内边距。 */
export const STORYBOARD_ROW_FIXED_WIDTH =
  ROW_GRIP_WIDTH
  + FRAME_COLUMN_WIDTH
  + REFERENCE_COLUMN_WIDTH
  + ROW_COLUMN_GAP * (ROW_COLUMN_COUNT - 1)
  + ROW_PADDING_LEFT
  + ROW_PADDING_RIGHT

/**
 * 行宽低于这个数就走窄档。= 固定开销 + 参考列宽，
 * 也就是「提示词列刚好和参考列一样宽」的那一点（见上面的判据）。
 */
export const STORYBOARD_ROW_NARROW_BELOW = STORYBOARD_ROW_FIXED_WIDTH + REFERENCE_COLUMN_WIDTH

/** 窄档下参考列只留一格（固定盒本身的宽），省下的宽度全部给提示词列。 */
export const NARROW_REFERENCE_COLUMN_WIDTH = REFERENCE_SLOT_BOX.width

/** 这一档下参考列占多宽——宽/窄两档只有这一个差别。 */
export function referenceColumnWidthOf(narrow: boolean): number {
  return narrow ? NARROW_REFERENCE_COLUMN_WIDTH : REFERENCE_COLUMN_WIDTH
}

/**
 * 行网格模板（镜头行与锚展开行共用同一份；固定列宽都是 derive 出来的）。
 * 还没量到宽度（首帧 `null`）时按宽档渲染——宽档是今天的样子，量到之前不抖。
 */
export function storyboardRowGridTemplate(narrow: boolean): string {
  return `${ROW_GRIP_WIDTH}px ${FRAME_COLUMN_WIDTH}px ${referenceColumnWidthOf(narrow)}px minmax(0,1fr)`
}

/** 量到的行宽 → 档位。`null` = 还没量到，按宽档。 */
export function storyboardRowIsNarrow(rowWidth: number | null): boolean {
  return rowWidth !== null && rowWidth < STORYBOARD_ROW_NARROW_BELOW
}

/**
 * 档位由 `StoryboardRowShell` 量自己一次、往下发。
 * 参考列住在 `references` 这个 ReactNode 里（由调用方构造、在外壳里渲染），
 * 拿不到外壳的局部变量——所以走 context，而不是再加一路 prop 穿三层。
 */
export const StoryboardRowNarrowContext = React.createContext(false)

export function useStoryboardRowNarrow(): boolean {
  return React.useContext(StoryboardRowNarrowContext)
}
