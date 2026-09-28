import { Group, Stack, Text } from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { DesignButton } from '../../design'

export function OnboardingWizardResult({
  phase,
  resultLabel,
  errorReason,
  errorHint,
  onReset,
  onClose,
}: {
  phase: 'input' | 'running' | 'success' | 'error'
  resultLabel: string
  errorReason: string
  errorHint: string
  onReset: () => void
  onClose: () => void
}): JSX.Element | null {
  const { t } = useTranslation()
  if (phase === 'success') {
    return (
      <Stack gap={12} align="center" py={8}>
        <div className="flex items-center justify-center size-12 rounded-full bg-workbench-success-soft text-workbench-success">
          <IconCheck size={26} stroke={1.8} />
        </div>
        <Stack gap={2} align="center">
          <Text size="md" fw={600} c="var(--nomi-ink)">{t('modelSetup.added', { name: resultLabel })}</Text>
          <Text size="sm" c="var(--nomi-ink-60)">{t('modelSetup.addedHint')}</Text>
        </Stack>
        <Group justify="center" gap={8} w="100%" mt={4}>
          <DesignButton variant="subtle" onClick={onReset}>{t('modelSetup.addAnother')}</DesignButton>
          <DesignButton variant="filled" onClick={onClose}>{t('modelSetup.done')}</DesignButton>
        </Group>
      </Stack>
    )
  }
  if (phase !== 'error') return null
  return (
    <Stack gap="sm">
      <Text size="md" c="var(--nomi-ink)">{t('modelSetup.addFailed')}</Text>
      <Text size="sm" c="var(--nomi-ink)">{errorReason}</Text>
      {errorHint && <Text size="sm" c="var(--nomi-ink-60)">{errorHint}</Text>}
      <Group justify="flex-end">
        <DesignButton variant="subtle" onClick={onReset}>{t('modelSetup.retryEdit')}</DesignButton>
        <DesignButton onClick={onClose}>{t('modelSetup.close')}</DesignButton>
      </Group>
    </Stack>
  )
}
