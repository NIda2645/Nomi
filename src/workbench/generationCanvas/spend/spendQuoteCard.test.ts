import { beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmGenerationSpend, useSpendConfirmStore } from './spendConfirm'

const quoteSpend = vi.hoisted(() => vi.fn())
vi.mock('../../../desktop/bridge', () => ({ getDesktopBridge: () => ({ tasks: { quoteSpend } }) }))

describe('shared quote confirmation card', () => {
  beforeEach(() => vi.restoreAllMocks())
  it('shows a priced model amount and transfers only the confirmed quote id', async () => {
    quoteSpend.mockResolvedValue({ quoteId: 'quote-1', amount: 0.3, lines: [] })
    const confirm = vi.spyOn(useSpendConfirmStore.getState(), 'requestConfirm').mockResolvedValue(true)
    const accepted = vi.fn()
    await confirmGenerationSpend([{ meta: { modelVendor: 'relay', modelKey: 'image' } }], {
      title: 'Generate', message: 'One image', onQuoteConfirmed: accepted,
    })
    expect(confirm.mock.calls[0][0].details?.[0].value).toContain('0.3')
    expect(accepted).toHaveBeenCalledWith('quote-1')
  })
  it('unknown price is explicit and rejection never transfers quote authorization', async () => {
    quoteSpend.mockResolvedValue({ quoteId: 'quote-2', amount: null, lines: [] })
    const confirm = vi.spyOn(useSpendConfirmStore.getState(), 'requestConfirm').mockResolvedValue(false)
    const accepted = vi.fn()
    await confirmGenerationSpend([{ meta: { modelVendor: 'relay', modelKey: 'unpriced' } }], {
      title: 'Generate', message: 'One image', onQuoteConfirmed: accepted,
    })
    expect(confirm.mock.calls[0][0].details?.[0].value).toMatch(/目录未标价|Not priced/)
    expect(accepted).not.toHaveBeenCalled()
  })
})
