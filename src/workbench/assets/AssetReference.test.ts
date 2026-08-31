import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import AssetReference, { type AssetSlot } from './AssetReference'

vi.mock('react-i18next', async (original) => ({
  ...await original<typeof import('react-i18next')>(),
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('reference capacity rendering', () => {
  it.each([
    { max: undefined, occupied: 20, canAdd: true },
    { max: 3, occupied: 3, canAdd: false },
    { max: 3, occupied: 2, canAdd: true },
  ])('keeps unknown caps usable and respects occupied positions: $max / $occupied', ({ max, occupied, canAdd }) => {
    const slot: AssetSlot = {
      key: 'refs', label: 'References', accept: 'image', form: 'array',
      persistAsEdge: true, numbered: true, max,
    }
    const html = renderToStaticMarkup(React.createElement(AssetReference, {
      slots: [slot], valuesByKey: { refs: [] }, occupiedByKey: { refs: occupied },
      projectId: null, openSlotKey: '', uploadingSlotKey: '',
      onTogglePicker: vi.fn(), onPick: vi.fn(), onUpload: vi.fn(), onRemove: vi.fn(),
    }))
    expect(html.includes('assetLibrary.addReference')).toBe(canAdd)
  })
})
