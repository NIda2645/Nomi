// 角色 → 颜色/图标的**唯一对照表**（节点卡、菜单、左栏预览、图例共用）。
// plan: docs/plan/2026-08-12-model-settings-home-and-comfyui-workflow-page.md
//
// 为什么集中：同一个角色在图上、菜单里、预览里必须是同一个颜色，否则用户没法把三处对上——
// 各处各写一份就是第一次改颜色时开始漂。
//
// 色只用根层 token（--nomi-*）：这页 Portal 到 body，**够不到 .workbench-shell 作用域里的
// --workbench-***（那会静默退回继承色，任务中心栽过，见 nomi-tokens.css --nomi-danger 的注释）。
import { IconMessage, IconMovie, IconPhoto, IconStack2 } from '@tabler/icons-react'
import type { WorkflowRole } from '../comfyuiWorkflowBinding'

export type RoleTone = {
  /** 描边/文字色（bracket 语法引 token 变量，门岗放行的写法）。 */
  text: string
  border: string
  /** 浅底：色带 12% 混进面板底色，和 accent-soft 同做法。 */
  soft: string
  Icon: typeof IconMessage
  labelKey: string
}

const tone = (token: string, Icon: RoleTone['Icon'], labelKey: string): RoleTone => ({
  text: `text-[var(${token})]`,
  border: `border-[var(${token})]`,
  soft: `bg-[color-mix(in_srgb,var(${token})_14%,var(--nomi-paper))]`,
  Icon,
  labelKey,
})

export const ROLE_TONES: Record<WorkflowRole, RoleTone> = {
  prompt: tone('--nomi-accent', IconMessage, 'comfyuiWorkflowPage.roles.prompt'),
  // 首帧/尾帧同色同图标（都是「帧」），靠文字区分——给它俩两套视觉反而让人以为是两类东西。
  // 也不为此往 src/vendor/tablerIcons.ts 那份精选清单里塞新图标（那是控包体的白名单）。
  firstFrame: tone('--nomi-track-image', IconPhoto, 'comfyuiWorkflowPage.roles.firstFrame'),
  lastFrame: tone('--nomi-track-image', IconPhoto, 'comfyuiWorkflowPage.roles.lastFrame'),
  sourceVideo: tone('--nomi-track-video', IconMovie, 'comfyuiWorkflowPage.roles.sourceVideo'),
  output: tone('--nomi-warning', IconStack2, 'comfyuiWorkflowPage.roles.output'),
}

export const ROLE_ORDER: WorkflowRole[] = ['prompt', 'firstFrame', 'lastFrame', 'sourceVideo', 'output']
