import { expect, it, vi } from 'vitest'
import { createDesktopLaneInput } from './laneDesktopInput'
const settings = vi.hoisted(() => ({ maxSpend: 12 as number | null }))
vi.mock('../settings/automationPolicySettings', () => ({ readAutomationPolicySettings: () => settings }))
vi.mock('../assets/projectAssetStore', () => ({ resolveProjectAgentAttachmentClaims: () => [] }))
it('C45 · provider context carries authored prose but never projects a global spending limit', async () => {
  const context = { approvalPolicy: { mode: 'safe-auto' as const, spend: 'confirm' as const } }
  const input = createDesktopLaneInput({ projectId: 'b1', capture: () => context, activate: () => undefined, prepare: async captured => captured,
    model: () => ({ kind: 'openai-compatible', model: { modelKey: 'fixture', modelAlias: '', meta: {} } as never }) })
  const message = { role: 'nomi.input' as const, content: '文稿预算 ¥8', timestamp: 1, context }
  for (const limit of [12, 0, null]) {
    settings.maxSpend = limit
    const text = JSON.stringify(await input.providerContent(message))
    expect(text).toContain('文稿预算 ¥8')
    expect(text).not.toMatch(/预算上限|¥12|¥0|来源：设置/)
  }
})
