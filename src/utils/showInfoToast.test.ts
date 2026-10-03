import { beforeEach, describe, expect, it, vi } from 'vitest'

const toastMock = vi.hoisted(() => vi.fn())

vi.mock('../ui/toast', () => ({ toast: toastMock }))

import { showInfoToast } from './showInfoToast'

describe('showInfoToast', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes the caller-supplied identity through, so a repeated notice stays one toast', () => {
    showInfoToast('limit reached', 'canvas-limit')
    showInfoToast('limit reached', 'canvas-limit')

    expect(toastMock).toHaveBeenNthCalledWith(1, 'limit reached', 'info', 'canvas-limit')
    expect(toastMock).toHaveBeenNthCalledWith(2, 'limit reached', 'info', 'canvas-limit')
  })

  it('leaves the identity to the toast owner when the caller gives none', () => {
    showInfoToast('saved')
    expect(toastMock).toHaveBeenCalledWith('saved', 'info', undefined)
  })
})
