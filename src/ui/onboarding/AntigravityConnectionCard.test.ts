import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MantineProvider } from '@mantine/core'
import { describe, expect, it, vi } from 'vitest'
import { AntigravityConnectionCard } from './AntigravityConnectionCard'
import { ModelWorkspacePage } from './ModelSettingsWorkspacePages'
import type { ChipModel } from './ModelChipGroups'
import type { AntigravitySettingsSession } from './useAntigravitySettings'
import { zhAntigravity } from '../../i18n/locales/antigravity'
import { useAntigravityModelWorkspace } from './useAntigravityModelWorkspace'

vi.mock('react-i18next', async (importOriginal) => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key.split('.').slice(1).reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, zhAntigravity) ?? key }) }))

const ids = [
  ...['3.7', '3.6', '3.5'].flatMap((version) => ['high', 'medium', 'low'].map((tier) => `gemini-${version}-flash-${tier}`)),
  'gemini-3.1-pro-high', 'gemini-3.1-pro-low', 'claude-sonnet-4-6', 'claude-opus-4-6-thinking', 'gpt-oss-120b-medium',
]
const models: ChipModel[] = [...ids, 'auto', 'generate_image'].map((modelKey) => ({ modelKey, labelZh: modelKey, kind: modelKey === 'generate_image' ? 'image' : 'text', vendorKey: 'antigravity-cli', enabled: false }))
const render = (element: React.ReactElement) => renderToStaticMarkup(React.createElement(MantineProvider, { children: element }))

describe('Antigravity common model settings presentation', () => {
  it('keeps the last discovered model list visible during refresh without showing verification success', () => {
    const session = { view: { status: null, busy: 'checking' }, controller: null, perform: vi.fn() } as AntigravitySettingsSession
    const html = render(React.createElement(AntigravityConnectionCard, { enabled: false, models, selectedVariants: {}, session, onOpenModel: vi.fn(), onChanged: vi.fn() }))
    expect(html).toContain('Gemini 3.7 Flash')
    expect(html).toContain('正在检测')
    expect(html).not.toContain('试跑通过')
  })
  it('leaves the connection home and unrelated models renderable before a model is selected', () => {
    function Home() {
      const session = { view: { status: null, busy: null }, controller: null, perform: vi.fn() } as AntigravitySettingsSession
      const native = useAntigravityModelWorkspace(undefined, [], session, vi.fn())
      return React.createElement('div', null, native ? 'Native' : 'Home')
    }
    expect(render(React.createElement(Home))).toContain('Home')
  })
  it('renders seven visible model chips, with separate tool and route, without the old capability panel', () => {
    const session = { view: { status: { state: 'unverified', models: ids.map((id) => ({ id, label: id })), checkedAt: 1, loginCommand: 'agy' }, busy: null }, controller: {}, perform: vi.fn() } as unknown as AntigravitySettingsSession
    const html = render(React.createElement(AntigravityConnectionCard, { enabled: false, models, selectedVariants: {}, session, onOpenModel: vi.fn(), onChanged: vi.fn() }))
    for (const label of ['Gemini 3.7 Flash', 'Gemini 3.6 Flash', 'Gemini 3.5 Flash', 'Gemini 3.1 Pro', 'Claude Sonnet 4.6', 'Claude Opus 4.6', 'GPT-OSS 120B']) expect(html).toContain(label)
    expect(html).toContain('generate_image')
    expect(html).toContain('自动路由')
    expect(html).not.toContain('gemini-3.7-flash-high')
    expect(html).not.toContain('data-agy-capability')
    expect(html.indexOf('Gemini 3.7 Flash')).toBeLessThan(html.indexOf('<details'))
  })
  it('uses the common detail, exact identity, enable switch and supplied native status instead of API adaptation', () => {
    const html = render(React.createElement(ModelWorkspacePage, {
      model: models[0], modelKey: models[0].modelKey, vendorName: 'Antigravity CLI',
      canUseScript: false, canAutoAdapt: false, hasActiveRun: false, hasTask: false, adaptStarting: false, mappings: [],
      onOpenScript: vi.fn(), onStartAdapt: vi.fn(), onOpenTask: vi.fn(), onOpenCapability: vi.fn(), onSetEnabled: vi.fn(), onRetype: vi.fn(), onDelete: vi.fn(), onBack: vi.fn(),
      connection: { title: 'Gemini 3.7 Flash', status: React.createElement('div', { 'data-native-proof': true }, 'Unverified'), fields: React.createElement('div', { 'data-native-tier': true }, 'High'), enabledLocked: true, enabledHint: 'Test first', onSetEnabled: vi.fn(), requestSummary: 'Local CLI' },
    }))
    expect(html).toContain('data-model-settings-model="gemini-3.7-flash-high"')
    expect(html).toContain('data-native-proof')
    expect(html).toContain('data-native-tier')
    expect(html).toContain('Test first')
    expect(html).toContain('Local CLI')
    expect(html).not.toContain('requestDefaultText')
    expect(html).not.toContain('deleteModel')
  })
})
