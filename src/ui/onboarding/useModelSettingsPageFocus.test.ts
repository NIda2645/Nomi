import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { modelSettingsFocusAction } from './useModelSettingsPageFocus'

const hookSource = fs.readFileSync(path.join(process.cwd(), 'src/ui/onboarding/useModelSettingsPageFocus.ts'), 'utf8')
const settingsSource = fs.readFileSync(path.join(process.cwd(), 'src/workbench/settings/SettingsDialog.tsx'), 'utf8')
const overlaySource = fs.readFileSync(path.join(process.cwd(), 'src/design/overlayLayers.ts'), 'utf8')
const comfyuiCardSource = fs.readFileSync(path.join(process.cwd(), 'src/ui/onboarding/ComfyuiLocalCard.tsx'), 'utf8')

describe('model settings keyboard and focus policy', () => {
  it('does not focus the page-stack back button on the home page', () => {
    expect(modelSettingsFocusAction('home', false)).toBe('none')
  })

  it('focuses Back on a newly opened page, but restores the opener when returning', () => {
    expect(modelSettingsFocusAction('connection', false)).toBe('focus-back')
    expect(modelSettingsFocusAction('home', true)).toBe('restore-trigger')
    expect(modelSettingsFocusAction('connection', true)).toBe('restore-trigger')
  })

  it('records activation inside the workspace and resolves it after the previous page remounts', () => {
    expect(hookSource).toContain("document.addEventListener('click', rememberTrigger, true)")
    expect(hookSource).toContain("document.querySelector<HTMLElement>(WORKSPACE_SELECTOR)")
    expect(hookSource).toContain("document.querySelector<HTMLElement>('[data-model-settings-dialog]')")
    expect(hookSource).toContain('createFocusReturnLocator')
    expect(hookSource).toContain('resolveFocusReturnLocator')
    expect(hookSource).toContain('savedTriggersRef.current.delete(pageKey)')
  })

  it('routes Escape through the visible page Back action exactly once', () => {
    expect(hookSource).toContain("querySelector<HTMLElement>('[data-model-settings-back]')")
    expect(hookSource).toContain('backButton.click()')
    expect(hookSource).toContain('else onBack()')
  })

  it('lets local controls process Escape before the settings page stack', () => {
    expect(settingsSource).toContain("document.addEventListener('keydown', onKeyBubble)")
    expect(settingsSource).toContain("window.addEventListener('keydown', markDelegatedEscape, true)")
    expect(settingsSource).toContain('externalEscapes.add(event)')
    expect(settingsSource).toContain('if (externalEscapes.has(event)) return')
    expect(settingsSource).not.toContain("window.addEventListener('keydown', onKey, true)")
    expect(overlaySource).toContain('[data-mantine-stop-propagation="true"]')
    expect(overlaySource).toContain('[role="listbox"]')
    expect(overlaySource).toContain('[role="menu"]')
  })

  it('lets ComfyUI address editing cancel itself before the connection page goes back', () => {
    expect(comfyuiCardSource).toContain('data-nomi-escape-owner="true"')
    expect(comfyuiCardSource).toContain("event.key !== 'Escape'")
    expect(comfyuiCardSource).toContain('event.nativeEvent.isComposing')
    expect(comfyuiCardSource).toContain('event.stopPropagation()')
    expect(comfyuiCardSource).toContain('cancelAddressEditing()')
  })
})
