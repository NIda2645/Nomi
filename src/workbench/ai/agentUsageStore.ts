import { declareStoreLifetime } from '../project/storeLifetime'
import { create } from 'zustand'
import type { AgentUsage } from '../../api/desktopClient'

type AgentUsageState = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  turns: number
  addUsage: (usage?: AgentUsage) => void
  reset: () => void
}

/**
 * Cumulative agent token usage for the current app session, fed automatically by
 * ProjectAgentHost execution results (all Agent callers and terminal outcomes). Previously the SDK collected usage and it
 * was dropped one IPC hop away (harness audit #8); now it accumulates here so a
 * token/cost readout can render it for free.
 */
export const useAgentUsageStore = create<AgentUsageState>((set) => ({
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  turns: 0,
  addUsage: (usage) => {
    if (!usage) return
    set((s) => ({
      promptTokens: s.promptTokens + usage.promptTokens,
      completionTokens: s.completionTokens + usage.completionTokens,
      totalTokens: s.totalTokens + usage.totalTokens,
      turns: s.turns + 1,
    }))
  },
  reset: () => set({ promptTokens: 0, completionTokens: 0, totalTokens: 0, turns: 0 }),
}))

/**
 * C1 寿命声明。**刻意 `process`**：这个 store 的 docstring 从第一天就写着
 * "Cumulative agent token usage for the current app session"——它统计的是**这次开机**用了多少
 * token，不是某个项目用了多少。切项目清零会让这个读数变成另一件事。
 *
 * 审计把它列为 B 档（要拍板）：「跨项目累计是不是产品意图」。声明写成 `process` = 按它自己
 * 写着的意图归位，同时把这个选择第一次变成**看得见**的——这正是加这个轴的目的。
 * 真要改成按项目算，改的是产品定义，不是这一行。
 */
export const agentUsageStoreLifetime = declareStoreLifetime({
  store: 'useAgentUsageStore',
  fields: { promptTokens: 'process', completionTokens: 'process', totalTokens: 'process', turns: 'process' },
})
