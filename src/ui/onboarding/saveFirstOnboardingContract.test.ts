import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (name: string): string => fs.readFileSync(path.join(process.cwd(), 'src/ui/onboarding', name), 'utf8')

describe('save-first gateway onboarding contract', () => {
  it('never binds model-list retrieval to field blur', () => {
    const wizard = source('OnboardingWizard.tsx')

    expect(wizard).not.toContain('maybeAutoFetchModels')
    expect(wizard).not.toContain('autoFetchSigRef')
    expect(wizard).not.toMatch(/onBlur=\{[^}]*handleFetchModels/)
    expect(wizard).toContain('onClick={handleFetchModels}')
  })

  it('registers selected models without starting automatic adaptation', () => {
    const wizard = source('OnboardingWizard.tsx')

    expect(wizard).toContain('bridge.onboarding.adapterRegister({')
    expect(wizard).toMatch(/bridge\.onboarding\.adapterRegisterExisting\(\{\s*vendorKey:\s*targetVendorKey,\s*models:\s*selected/)
    expect(wizard).toContain('if (onCommitted) onCommitted(res.registration)')
    expect(wizard).not.toContain('adapterStart(')
    expect(wizard).not.toContain('adapterStartExisting(')
    expect(wizard).not.toContain('onAdapterRunChange')
    expect(wizard).not.toContain('onSelfConnect')
  })

  it('continues from saving into the affected model or connection instead of closing the workflow', () => {
    const wizard = source('OnboardingWizard.tsx')
    const drawer = source('OnboardingDrawer.tsx')

    expect(wizard).toContain('if (onCommitted) onCommitted(res.registration)')
    expect(drawer).toContain('const handleRegistrationCommitted')
    expect(drawer).toContain('registration.selectedModelKeys.length === 1')
    expect(drawer).toContain('openModelSettingsDialog(current')
    expect(drawer).toContain("type: 'connection'")
    expect(drawer).toContain('onCommitted={handleRegistrationCommitted}')
    expect(drawer).toContain('setRegistrationHandoff({')
    expect(drawer).toContain('pendingModelKeys[0]')
    expect(source('ModelSettingsWorkspacePages.tsx')).toContain('data-model-registration-handoff')
  })

  it('saves the connection before any model is selected or discovered', () => {
    const wizard = source('OnboardingWizard.tsx')

    expect(wizard).toContain('const saveConnection = React.useCallback')
    expect(wizard).toContain('models: []')
    expect(wizard).toContain('data-model-connection-saved')
    expect(wizard).toContain("t('modelSetup.fetchModels')")
    expect(wizard).toContain("t('modelSetup.manualEnter')")
    expect(wizard).not.toContain('forceSaveArmed')
    expect(wizard).not.toContain('manualSaveAction')
    expect(wizard).not.toContain('resolvePrecheckGateAction')
  })

  it('keeps connection testing optional and gives each setup state one primary action', () => {
    const wizard = source('OnboardingWizard.tsx')

    expect(wizard).toContain('data-model-connection-diagnostics')
    expect(wizard).toContain("t('modelSetup.diagnostics')")
    expect(wizard).toMatch(/variant="light"\s+onClick=\{handleTestConnection\}/)
    expect(wizard).toMatch(/variant="light"\s+onClick=\{\(\) => setScreen\('select'\)\}/)
    expect(wizard).toMatch(/variant="filled"\s+onClick=\{handleFetchModels\}/)
  })

  it('offers manual model IDs before any list request and discloses later adaptation work', () => {
    const wizard = source('OnboardingWizard.tsx')
    const picker = source('ModelPickerScreen.tsx')

    expect(wizard).toContain("t('modelSetup.manualEnter')")
    expect(picker).toContain('data-model-picker-save-disclosure')
    expect(picker).toContain("t('onboardingProviders.modelControls.saveModelsDisclosure')")
    expect(wizard).toContain('confirming={saving}')
  })

  it('continues model registration through the saved main-process connection', () => {
    const wizard = source('OnboardingWizard.tsx')

    expect(wizard).toContain('const savedVendorKey = savedConnection?.vendorKey')
    expect(wizard).toContain('adapterRegisterExisting({ vendorKey: targetVendorKey')
    expect(wizard).toContain('onConnectionSaved?.(res.registration)')
  })
})
