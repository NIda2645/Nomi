// Agent 会话键工厂（B1a）——收口此前 4 处硬编码的键生成约定，产出与旧代码**逐字节相同**。
//
// 键决定后端对话记忆（agentSessionStore）落哪个桶：换了字面值 = 用户已有会话历史丢失。
// 因此本工厂只是把散在 4 个文件里的 `nomi:...:${projectId||'local'}` 拼接收进一处，
// 不改任何字面模板。projectId 缺省一律落 `local`（打包版曾因只读 search 段全落 local，
// 这个兜底值必须保持不变，见 windowUrlParam.ts 注）。
//
// 两种历史形态：
//   · area 形态：nomi:workbench:<pid>:<area>   —— 创作区/生成区各一份记忆，按 area 隔离（2026-06-14 起）。
//   · feature 形态：nomi:<feature>:<pid>       —— 单次任务（方向/校验/脚本）用独立键，不污染对话历史线程。

import { readWindowUrlParam } from '../windowUrlParam'

export type WorkbenchAgentArea = 'creation' | 'generation'

/**
 * 会话键底层工厂。`projectId` 显式给则用它，否则回退读 URL（与旧 4 处一致：均 `readWindowUrlParam('projectId') || 'local'`）。
 * - feature 形态：`{ feature }`         → `nomi:<feature>:<pid>`
 * - area 形态：   `{ feature, area }`   → `nomi:<feature>:<pid>:<area>`
 */
export function sessionKeyFor(spec: { feature: string; area?: string; projectId?: string }): string {
  const pid = (spec.projectId && spec.projectId.trim()) || readWindowUrlParam('projectId') || 'local'
  const base = `nomi:${spec.feature}:${pid}`
  return spec.area ? `${base}:${spec.area}` : base
}

/**
 * 创作区/生成区共享的对话记忆键（按 area 隔离，按 project 隔离）。
 * readWindowUrlParam 兼容 prod 的 hash 路由——只读 search 段曾让打包版全部落 `local` 桶。
 */
export function workbenchSessionKey(area: WorkbenchAgentArea): string {
  return sessionKeyFor({ feature: 'workbench', area })
}

/** 方向门用独立会话键（与创作/生成区线程隔离，不污染用户对话历史）。 */
export function directionSessionKey(): string {
  return sessionKeyFor({ feature: 'production-directions' })
}

/** 镜级 verify 用独立会话键（与创作/生成区线程隔离，不污染用户对话历史）。 */
export function shotVerifySessionKey(): string {
  return sessionKeyFor({ feature: 'shot-verify' })
}

/** 剧本/脚本单次规划用独立会话键；caller 可显式传 projectId（否则回退 URL）。 */
export function productionScriptSessionKey(projectId?: string): string {
  return sessionKeyFor({ feature: 'production-script', ...(projectId ? { projectId } : {}) })
}
