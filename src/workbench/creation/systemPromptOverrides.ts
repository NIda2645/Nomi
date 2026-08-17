// 系统提示词「用户覆盖层」：默认值仍住 creationAiModes.ts（唯一真相源，P1 无并行副本），
// 这里只负责把用户改过的那几条盖上去。
//
// 为什么需要一个模块级缓存（而不是 React state / async getter）：
// `getCreationAiMode()` 是**同步**函数，渲染期被调用（CreationAiPanel.tsx:147），它的结果又直接
// 喂给 `buildCreationAiPrompt()`（同文件 :313，发消息那一刻同步取值）。而覆盖值只能走异步 IPC 拿。
// 三个约束凑在一起 → 必须有个「进程内已经装好答案」的同步读取口：
//   1. 模块加载时**发一次**异步 IPC，回来后写进模块级 `overrides`（load-once，同 modelCatalogCache 的范式）；
//   2. 对外只暴露**同步** `effectiveModePrompt()`：读当前快照，没有覆盖就返回默认值；
//   3. React 侧用 `subscribeSystemPromptOverrides()` + useSyncExternalStore 订阅，快照变了就重渲。
// 首帧（IPC 还没回来）取到的是默认值——这是正确的降级：默认值本来就是「没覆盖」的答案，
// 不会出现空提示词，也不会阻塞渲染。IPC 回来后触发订阅者重渲，UI 自动换成覆盖值。

import { getDesktopBridge } from '../../desktop/bridge'
import type { SystemPromptModeId, SystemPromptOverrides } from '../../../electron/settings/systemPromptsContract'

export type SystemPromptOverrideMap = Partial<Record<SystemPromptModeId, string>>

/**
 * 纯合并规则（单一判定源，被 UI / 发送路径 / 单测共用）：
 * 有覆盖且非空白 → 用覆盖；否则 → 用默认值（byte-for-byte 原样返回，不做 trim/规整，
 * 因为「恢复默认」必须精确回到默认文本）。
 */
export function resolveEffectivePrompt(
  defaultPrompt: string,
  override: string | undefined | null,
): string {
  if (typeof override !== 'string') return defaultPrompt
  if (!override.trim()) return defaultPrompt
  return override
}

/** 某个模式当前是不是「被用户自定义过」——徽标和「恢复默认」是否可点都查它。 */
export function hasPromptOverride(
  overrides: SystemPromptOverrideMap,
  modeId: string,
  defaultPrompt: string,
): boolean {
  const override = overrides[modeId as SystemPromptModeId]
  if (typeof override !== 'string' || !override.trim()) return false
  // 和默认值一模一样就不算覆盖：用户手动把文本改回默认的场景，不该继续显示「已自定义」。
  return override !== defaultPrompt
}

/**
 * 写盘前的收口：把「等于默认值」的条目剔掉。
 * 默认值住渲染进程，主进程判不了这条，所以由这里负责——否则默认提示词以后一改，
 * 老用户会被自己那份「和当时默认值相同」的副本永久钉住（并行版）。
 */
export function pruneRedundantOverrides(
  overrides: SystemPromptOverrideMap,
  defaultPromptOf: (modeId: SystemPromptModeId) => string | undefined,
): SystemPromptOverrideMap {
  const next: SystemPromptOverrideMap = {}
  for (const [modeId, prompt] of Object.entries(overrides)) {
    if (typeof prompt !== 'string' || !prompt.trim()) continue
    const fallback = defaultPromptOf(modeId as SystemPromptModeId)
    if (fallback !== undefined && prompt === fallback) continue
    next[modeId as SystemPromptModeId] = prompt
  }
  return next
}

let overrides: SystemPromptOverrideMap = {}
let loadPromise: Promise<SystemPromptOverrideMap> | null = null
let loaded = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of [...listeners]) listener()
}

/** 同步读当前快照。IPC 还没回来时是空 map = 全部走默认值。 */
export function getSystemPromptOverrides(): SystemPromptOverrideMap {
  return overrides
}

export function systemPromptOverridesLoaded(): boolean {
  return loaded
}

export function subscribeSystemPromptOverrides(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function applySnapshot(next: SystemPromptOverrideMap): SystemPromptOverrideMap {
  overrides = next
  loaded = true
  emit()
  return overrides
}

/**
 * load-once：多次调用共用同一个 in-flight promise，不会打多次 IPC。
 * 非 Electron 环境（浏览器测试/预览）没有 bridge → 直接落到空 map，全部用默认值。
 */
export function loadSystemPromptOverrides(): Promise<SystemPromptOverrideMap> {
  if (loaded) return Promise.resolve(overrides)
  if (loadPromise) return loadPromise
  const bridge = getDesktopBridge()?.settings?.systemPrompts
  if (!bridge?.get) {
    return Promise.resolve(applySnapshot({}))
  }
  loadPromise = bridge
    .get()
    .then((value: SystemPromptOverrides | undefined) => applySnapshot({ ...(value?.prompts ?? {}) }))
    .catch(() => applySnapshot({}))
    .finally(() => {
      loadPromise = null
    })
  return loadPromise
}

/** 写盘 + 立即更新本地快照（乐观），让同步 getter 马上看到新值、不用等 IPC 回来。 */
export async function saveSystemPromptOverrides(
  next: SystemPromptOverrideMap,
): Promise<SystemPromptOverrideMap> {
  applySnapshot({ ...next })
  const bridge = getDesktopBridge()?.settings?.systemPrompts
  if (!bridge?.set) return overrides
  try {
    const stored = await bridge.set({ schemaVersion: 1, prompts: next })
    return applySnapshot({ ...(stored?.prompts ?? {}) })
  } catch {
    return overrides
  }
}

/** 仅供单测复位模块级状态。 */
export function resetSystemPromptOverridesForTest(next: SystemPromptOverrideMap = {}): void {
  overrides = next
  loaded = false
  loadPromise = null
  listeners.clear()
}
