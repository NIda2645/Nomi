// React 侧接入模块级同步快照（systemPromptOverrides.ts）。
// 挂载时触发 load-once，并用 useSyncExternalStore 订阅快照——IPC 回来 / 用户在设置里改完，
// 所有读提示词的界面（创作面板、设置里的编辑框）一起重渲，拿到的都是同一份有效值。
import React from 'react'

import {
  getSystemPromptOverrides,
  loadSystemPromptOverrides,
  subscribeSystemPromptOverrides,
  type SystemPromptOverrideMap,
} from './systemPromptOverrides'

export function useSystemPromptOverrides(): SystemPromptOverrideMap {
  React.useEffect(() => {
    void loadSystemPromptOverrides()
  }, [])
  return React.useSyncExternalStore(subscribeSystemPromptOverrides, getSystemPromptOverrides, getSystemPromptOverrides)
}
