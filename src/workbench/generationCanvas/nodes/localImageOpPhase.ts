// 「就地加工这张图」这类本地操作（抠图 / 切图 / 裁剪）的进度相位——单一真相源。
//
// 谁写：useNodeImageEditing 把 progress.phase 设成这里的值。
// 谁读：节点壳据此决定待机长相——**图保留 + 模糊呼吸**，不套「生成中」那层转圈遮罩
//       （那层是给真·生成用的：没图、要等模型、可取消；本地加工只是这张图在被处理）。
// 为什么抽出来：两边各写各的字符串，加一种本地操作就会漏掉一边，于是切图时节点要么没反馈、
// 要么被当成「正在生成」——这类不一致只能靠共用一个常量根治。
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

export const REMOVE_BACKGROUND_PHASE = 'remove-background'
/** 切图 / 裁剪共用一相：对用户是同一件事——「这张图正在被裁开」。 */
export const IMAGE_EDIT_PHASE = 'image-edit'

const LOCAL_IMAGE_OP_PHASES: readonly string[] = [REMOVE_BACKGROUND_PHASE, IMAGE_EDIT_PHASE]

export function isLocalImageOpPending(node: GenerationCanvasNode): boolean {
  if (node.status !== 'queued' && node.status !== 'running') return false
  return LOCAL_IMAGE_OP_PHASES.includes(node.progress?.phase || '')
}

/** 浮条上「抠图中」那颗按钮只认抠图这一相：切图时它不该转圈说自己在抠图。 */
export function isRemoveBackgroundPending(node: GenerationCanvasNode): boolean {
  return isLocalImageOpPending(node) && node.progress?.phase === REMOVE_BACKGROUND_PHASE
}
