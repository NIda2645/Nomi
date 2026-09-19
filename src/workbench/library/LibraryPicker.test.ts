import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LibraryPicker, type LibraryPickerRow } from './LibraryPicker'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
const rows: LibraryPickerRow[] = Array.from({ length: 5 }, (_, index) => ({
  id: `preset-${index}`, name: `Preset ${index}`, command: '', desc: 'Soft light', section: 'Public',
  group: { id: 'portrait', label: 'Portrait' },
}))
const render = (props: Partial<React.ComponentProps<typeof LibraryPicker>> = {}) => renderToStaticMarkup(
  React.createElement(LibraryPicker, { rows, categories: ['All', 'Public', 'Mine'], searchLabel: 'Find presets', ...props }),
)
describe('shared library picker', () => {
  it('exposes matching rows immediately when searching a normally collapsed group', () => {
    expect(render()).toContain('<details')
    const html = render({ query: 'Soft' })
    expect(html).not.toContain('<details')
    expect(html).toContain('data-library-option="preset-4"')
  })
  it('renders an honest empty category and supports prompt-specific missing-media icons', () => {
    expect(render({ activeCategory: 'Mine', empty: React.createElement('p', null, 'No presets') })).toContain('No presets')
    expect(render({ activeCategory: 'Mine' })).not.toContain('data-library-option=')
    expect(render({ mediaFallback: React.createElement('span', null, 'Prompt icon') })).toContain('Prompt icon')
  })
  it('preserves host row anchors and management actions without taking ownership of them', () => {
    const html = render({ rowAttributes: row => ({ 'data-v4-command': row.id }),
      footer: React.createElement('button', null, 'Manage library') })
    expect(html).toContain('data-v4-command="preset-0"')
    expect(html).toContain('Manage library')
  })
})
