// React 侧接入模块级同步快照（systemPromptOverrides.ts）。
// 挂载时触发 load-once，并用 useSyncExternalStore 订阅快照——IPC 回来 / 用户在设置里改完，
// 所有读提示词的界面（创作面板、设置里的编辑框）一起重渲，拿到的都是同一份有效值。
import React from 'react'

import {
  getSystemPromptOverrides,
  getSystemPromptSnapshot,
  loadSystemPromptOverrides,
  subscribeSystemPromptOverrides,
  type SystemPromptOverrideMap,
  type SystemPromptSnapshot,
} from './systemPromptOverrides'

export function useSystemPromptOverrides(): SystemPromptOverrideMap {
  React.useEffect(() => {
    void loadSystemPromptOverrides()
  }, [])
  return React.useSyncExternalStore(subscribeSystemPromptOverrides, getSystemPromptOverrides, getSystemPromptOverrides)
}

/**
 * 整份快照（内置覆盖 + 自定义清单）。设置页要同时读两边，订阅两个 hook 会拿到
 * 同一次 emit 的两个半拍——用一个订阅口取整份，两边永远同源。
 *
 * `getSystemPromptSnapshot` 返回的是模块级那个对象本身（不是每次新建的字面量），
 * 引用稳定，useSyncExternalStore 不会因为 getSnapshot 每次返回新对象而无限重渲。
 */
export function useSystemPromptSnapshot(): SystemPromptSnapshot {
  React.useEffect(() => {
    void loadSystemPromptOverrides()
  }, [])
  return React.useSyncExternalStore(subscribeSystemPromptOverrides, getSystemPromptSnapshot, getSystemPromptSnapshot)
}
