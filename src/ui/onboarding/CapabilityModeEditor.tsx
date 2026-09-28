import React from 'react'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import {
  DesignButton,
  DesignNumberInput,
  DesignSwitch,
  DesignTextInput,
  DesignTextarea,
  IconActionButton,
  NomiSelect,
} from '../../design'
import {
  CAPABILITY_INTENTS,
  CAPABILITY_EDITOR_LIMITS,
  CAPABILITY_PARAMETER_TYPES,
  CAPABILITY_SLOT_KINDS,
  CAPABILITY_TASK_KINDS_BY_MODEL_KIND,
  createCapabilityOptionDraft,
  createCapabilityParameterDraft,
  createCapabilitySlotDraft,
  removeCapabilitySlotDraft,
  replaceCapabilitySlotDraft,
  type CapabilityContractDraft,
  type CapabilityDraftErrorCode,
  type CapabilityModeDraft,
  type CapabilityParameterDraft,
  type CapabilitySlotDraft,
} from './capabilityContractDraft'
import { CapabilityModeEditorHeader, ErrorText, FieldLabel } from './CapabilityModeEditorParts'

const NO_DEFAULT_VALUE = '__nomi_no_default__'

function SlotEditor({
  slot,
  path,
  errors,
  onChange,
  onRemove,
}: {
  slot: CapabilitySlotDraft
  path: string
  errors: Record<string, CapabilityDraftErrorCode>
  onChange: (slot: CapabilitySlotDraft) => void
  onRemove: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const defaultAsArray = slot.kind === 'image_ref' || slot.kind === 'video_ref' || slot.kind === 'audio_ref'
  const [interfaceOpen, setInterfaceOpen] = React.useState(false)
  const hasInterfaceError = Boolean(errors[`${path}.inputKey`])
  React.useEffect(() => {
    if (hasInterfaceError) setInterfaceOpen(true)
  }, [hasInterfaceError])
  return (
    <div className="grid grid-cols-1 gap-3 border-b border-nomi-line-soft py-3 last:border-b-0 md:grid-cols-12">
      <div className="md:col-span-4" data-capability-field={`${path}.kind`}>
        <FieldLabel>{t('onboardingProviders.workspace.capability.editor.slotKind')}</FieldLabel>
        <NomiSelect
          value={slot.kind}
          options={CAPABILITY_SLOT_KINDS.map((kind) => ({
            value: kind,
            label: t(
              `onboardingProviders.workspace.capability.slotKind.${kind}` as 'onboardingProviders.workspace.capability.slotKind.image_ref',
            ),
          }))}
          onChange={(kind) => {
            const nextKind = kind as CapabilitySlotDraft['kind']
            const singleItem = nextKind === 'first_frame' || nextKind === 'last_frame' || nextKind === 'source_video'
            onChange({
              ...slot,
              kind: nextKind,
              ...(nextKind !== 'image_ref' ? { characterIndexed: undefined } : {}),
              ...(singleItem ? { max: '1', min: Number(slot.min) > 1 ? '1' : slot.min } : {}),
            })
          }}
          ariaLabel={t('onboardingProviders.workspace.capability.editor.slotKind')}
          className="h-9 max-w-full rounded-nomi-sm"
        />
        <ErrorText code={errors[`${path}.kind`]} />
      </div>
      <label className="md:col-span-4">
        <FieldLabel>{t('onboardingProviders.workspace.capability.editor.label')}</FieldLabel>
        <DesignTextInput
          data-capability-field={`${path}.label`}
          error={Boolean(errors[`${path}.label`])}
          value={slot.label}
          maxLength={160}
          onChange={(event) => onChange({ ...slot, label: event.currentTarget.value })}
        />
        <ErrorText code={errors[`${path}.label`]} />
      </label>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem] gap-2 md:col-span-4">
        <label>
          <FieldLabel>{t('onboardingProviders.workspace.capability.editor.min')}</FieldLabel>
          <DesignNumberInput
            data-capability-field={`${path}.min`}
            error={Boolean(errors[`${path}.min`])}
            value={slot.min}
            allowDecimal={false}
            hideControls
            withKeyboardEvents={false}
            onChange={(value) => onChange({ ...slot, min: String(value) })}
          />
          <ErrorText code={errors[`${path}.min`]} />
        </label>
        <label>
          <FieldLabel>{t('onboardingProviders.workspace.capability.editor.max')}</FieldLabel>
          <DesignNumberInput
            data-capability-field={`${path}.max`}
            error={Boolean(errors[`${path}.max`])}
            value={slot.max}
            allowDecimal={false}
            hideControls
            withKeyboardEvents={false}
            onChange={(value) => onChange({ ...slot, max: String(value) })}
          />
          <ErrorText code={errors[`${path}.max`]} />
        </label>
        <div className="pt-4">
          <IconActionButton
            onClick={onRemove}
            aria-label={t('onboardingProviders.workspace.capability.editor.removeSlot')}
            title={t('onboardingProviders.workspace.capability.editor.removeSlot')}
            className="size-11 text-nomi-ink-40 hover:text-workbench-danger sm:size-8"
            icon={<IconTrash size={16} stroke={1.8} aria-hidden="true" />}
          />
        </div>
      </div>
      <details
        className="md:col-span-12"
        open={interfaceOpen || hasInterfaceError}
        onToggle={(event) => setInterfaceOpen(event.currentTarget.open)}
      >
        <summary className="min-h-8 cursor-pointer select-none text-micro font-medium text-nomi-ink-40 hover:text-nomi-ink-60">
          {t('onboardingProviders.workspace.capability.editor.interfaceFields')}
        </summary>
        <div className="grid grid-cols-1 gap-3 rounded-nomi-sm bg-nomi-ink-05 p-3 sm:grid-cols-2">
          <label>
            <FieldLabel>{t('onboardingProviders.workspace.capability.editor.inputKey')}</FieldLabel>
            <DesignTextInput
              data-capability-field={`${path}.inputKey`}
              classNames={{ input: 'font-nomi-mono' }}
              error={Boolean(errors[`${path}.inputKey`])}
              value={slot.inputKey}
              maxLength={128}
              placeholder={t('onboardingProviders.workspace.capability.editor.inputKeyPlaceholder')}
              onChange={(event) => onChange({ ...slot, inputKey: event.currentTarget.value })}
            />
            <ErrorText code={errors[`${path}.inputKey`]} />
          </label>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-5">
            <label className="inline-flex items-center gap-2 text-caption text-nomi-ink-60">
              <DesignSwitch
                checked={slot.asArray ?? defaultAsArray}
                onChange={(event) => onChange({ ...slot, asArray: event.currentTarget.checked })}
                aria-label={t('onboardingProviders.workspace.capability.editor.sendAsArray')}
              />
              {t('onboardingProviders.workspace.capability.editor.sendAsArray')}
            </label>
            {slot.kind === 'image_ref' ? (
              <label className="inline-flex items-center gap-2 text-caption text-nomi-ink-60">
                <DesignSwitch
                  checked={Boolean(slot.characterIndexed)}
                  onChange={(event) => onChange({ ...slot, characterIndexed: event.currentTarget.checked })}
                  aria-label={t('onboardingProviders.workspace.capability.editor.characterIndexed')}
                />
                {t('onboardingProviders.workspace.capability.editor.characterIndexed')}
              </label>
            ) : null}
          </div>
        </div>
      </details>
    </div>
  )
}

function OptionEditor({
  parameter,
  path,
  errors,
  onChange,
}: {
  parameter: CapabilityParameterDraft
  path: string
  errors: Record<string, CapabilityDraftErrorCode>
  onChange: (parameter: CapabilityParameterDraft) => void
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="mt-3 border-l-2 border-nomi-line pl-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-caption font-medium text-nomi-ink-60">
          {t('onboardingProviders.workspace.capability.editor.options')}
        </span>
        <span
          title={
            parameter.options.length >= CAPABILITY_EDITOR_LIMITS.optionsPerParameter
              ? t('onboardingProviders.workspace.capability.editor.limitReached')
              : undefined
          }
        >
          <DesignButton
            variant="subtle"
            size="xs"
            disabled={parameter.options.length >= CAPABILITY_EDITOR_LIMITS.optionsPerParameter}
            onClick={() => onChange({ ...parameter, options: [...parameter.options, createCapabilityOptionDraft()] })}
            className="text-nomi-accent"
            leftSection={<IconPlus size={14} stroke={1.8} aria-hidden="true" />}
          >
            {t('onboardingProviders.workspace.capability.editor.addOption')}
          </DesignButton>
        </span>
      </div>
      <ErrorText code={errors[`${path}.options`]} />
      {parameter.options.map((option, optionIndex) => {
        const optionPath = `${path}.options.${optionIndex}`
        return (
          <div
            key={optionIndex}
            className="grid grid-cols-1 gap-2 border-b border-nomi-line-soft py-2 last:border-b-0 md:grid-cols-12"
          >
            <label className="md:col-span-3">
              <FieldLabel>{t('onboardingProviders.workspace.capability.editor.optionValue')}</FieldLabel>
              <DesignTextInput
                data-capability-field={`${optionPath}.value`}
                classNames={{ input: 'font-nomi-mono' }}
                error={Boolean(errors[`${optionPath}.value`])}
                value={option.value}
                maxLength={2000}
                onChange={(event) => {
                  const wasDefault =
                    parameter.hasDefaultValue &&
                    parameter.defaultValue === option.value &&
                    parameter.defaultValueType === option.valueType
                  const options = parameter.options.map((item, index) =>
                    index === optionIndex ? { ...item, value: event.currentTarget.value } : item,
                  )
                  onChange({
                    ...parameter,
                    options,
                    ...(wasDefault ? { defaultValue: event.currentTarget.value } : {}),
                  })
                }}
              />
              <ErrorText code={errors[`${optionPath}.value`]} />
            </label>
            <label className="md:col-span-4">
              <FieldLabel>{t('onboardingProviders.workspace.capability.editor.optionLabel')}</FieldLabel>
              <DesignTextInput
                data-capability-field={`${optionPath}.label`}
                error={Boolean(errors[`${optionPath}.label`])}
                value={option.label}
                maxLength={160}
                onChange={(event) => {
                  const options = parameter.options.map((item, index) =>
                    index === optionIndex ? { ...item, label: event.currentTarget.value } : item,
                  )
                  onChange({ ...parameter, options })
                }}
              />
              <ErrorText code={errors[`${optionPath}.label`]} />
            </label>
            <div className="md:col-span-4" data-capability-field={`${optionPath}.valueType`}>
              <FieldLabel>{t('onboardingProviders.workspace.capability.editor.optionValueType')}</FieldLabel>
              <NomiSelect
                value={option.valueType}
                options={(['string', 'number', 'boolean'] as const).map((valueType) => ({
                  value: valueType,
                  label: t(
                    `onboardingProviders.workspace.capability.editor.scalarType.${valueType}` as 'onboardingProviders.workspace.capability.editor.scalarType.string',
                  ),
                }))}
                onChange={(valueType) => {
                  const wasDefault =
                    parameter.hasDefaultValue &&
                    parameter.defaultValue === option.value &&
                    parameter.defaultValueType === option.valueType
                  const options = parameter.options.map((item, index) =>
                    index === optionIndex ? { ...item, valueType: valueType as typeof item.valueType } : item,
                  )
                  onChange({
                    ...parameter,
                    options,
                    ...(wasDefault ? { defaultValueType: valueType as typeof option.valueType } : {}),
                  })
                }}
                ariaLabel={t('onboardingProviders.workspace.capability.editor.optionValueType')}
                className="h-9 max-w-full rounded-nomi-sm"
              />
            </div>
            <div className="pt-5 md:col-span-1">
              <IconActionButton
                onClick={() => {
                  const wasDefault =
                    parameter.hasDefaultValue &&
                    parameter.defaultValue === option.value &&
                    parameter.defaultValueType === option.valueType
                  onChange({
                    ...parameter,
                    options: parameter.options.filter((_, index) => index !== optionIndex),
                    ...(wasDefault
                      ? { hasDefaultValue: false, defaultValue: '', defaultValueType: 'string' as const }
                      : {}),
                  })
                }}
                aria-label={t('onboardingProviders.workspace.capability.editor.removeOption')}
                title={t('onboardingProviders.workspace.capability.editor.removeOption')}
                className="size-11 text-nomi-ink-40 hover:text-workbench-danger sm:size-8"
                icon={<IconTrash size={16} stroke={1.8} aria-hidden="true" />}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ParameterEditor({
  parameter,
  path,
  errors,
  onChange,
  onRemove,
}: {
  parameter: CapabilityParameterDraft
  path: string
  errors: Record<string, CapabilityDraftErrorCode>
  onChange: (parameter: CapabilityParameterDraft) => void
  onRemove: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const selectedDefaultOptionIndex =
    parameter.hasDefaultValue && parameter.type === 'select'
      ? parameter.options.findIndex(
          (option) => option.value === parameter.defaultValue && option.valueType === parameter.defaultValueType,
        )
      : -1
  return (
    <div className="border-b border-nomi-line-soft py-3 last:border-b-0">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <label className="md:col-span-3">
          <FieldLabel>{t('onboardingProviders.workspace.capability.editor.parameterKey')}</FieldLabel>
          <DesignTextInput
            data-capability-field={`${path}.key`}
            classNames={{ input: 'font-nomi-mono' }}
            error={Boolean(errors[`${path}.key`])}
            value={parameter.key}
            maxLength={128}
            onChange={(event) => onChange({ ...parameter, key: event.currentTarget.value })}
          />
          <ErrorText code={errors[`${path}.key`]} />
        </label>
        <label className="md:col-span-3">
          <FieldLabel>{t('onboardingProviders.workspace.capability.editor.label')}</FieldLabel>
          <DesignTextInput
            data-capability-field={`${path}.label`}
            error={Boolean(errors[`${path}.label`])}
            value={parameter.label}
            maxLength={160}
            onChange={(event) => onChange({ ...parameter, label: event.currentTarget.value })}
          />
          <ErrorText code={errors[`${path}.label`]} />
        </label>
        <div className="md:col-span-3" data-capability-field={`${path}.type`}>
          <FieldLabel>{t('onboardingProviders.workspace.capability.editor.parameterType')}</FieldLabel>
          <NomiSelect
            value={parameter.type}
            options={CAPABILITY_PARAMETER_TYPES.map((type) => ({
              value: type,
              label: t(
                `onboardingProviders.workspace.capability.parameterType.${type}` as 'onboardingProviders.workspace.capability.parameterType.text',
              ),
            }))}
            onChange={(type) =>
              onChange({
                ...parameter,
                type: type as CapabilityParameterDraft['type'],
                hasDefaultValue: false,
                defaultValue: '',
                defaultValueType: 'string',
              })
            }
            ariaLabel={t('onboardingProviders.workspace.capability.editor.parameterType')}
            className="h-9 max-w-full rounded-nomi-sm"
          />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_2.75rem] gap-2 md:col-span-3">
          <div>
            <FieldLabel>{t('onboardingProviders.workspace.capability.editor.defaultValue')}</FieldLabel>
            {parameter.type === 'boolean' ? (
              <div data-capability-field={`${path}.defaultValue`}>
                <NomiSelect
                  value={parameter.hasDefaultValue ? parameter.defaultValue : NO_DEFAULT_VALUE}
                  options={[
                    { value: NO_DEFAULT_VALUE, label: t('onboardingProviders.workspace.capability.editor.noDefault') },
                    { value: 'true', label: t('onboardingProviders.workspace.capability.editor.booleanTrue') },
                    { value: 'false', label: t('onboardingProviders.workspace.capability.editor.booleanFalse') },
                  ]}
                  onChange={(defaultValue) =>
                    onChange({
                      ...parameter,
                      hasDefaultValue: defaultValue !== NO_DEFAULT_VALUE,
                      defaultValue: defaultValue === NO_DEFAULT_VALUE ? '' : defaultValue,
                      defaultValueType: 'boolean',
                    })
                  }
                  ariaLabel={t('onboardingProviders.workspace.capability.editor.defaultValue')}
                  className="h-9 max-w-full rounded-nomi-sm"
                />
              </div>
            ) : parameter.type === 'select' ? (
              <div data-capability-field={`${path}.defaultValue`}>
                <NomiSelect
                  value={selectedDefaultOptionIndex >= 0 ? String(selectedDefaultOptionIndex) : NO_DEFAULT_VALUE}
                  options={[
                    { value: NO_DEFAULT_VALUE, label: t('onboardingProviders.workspace.capability.editor.noDefault') },
                    ...parameter.options.map((option, optionIndex) => ({
                      value: String(optionIndex),
                      label: option.label || option.value,
                      trailing: t(
                        `onboardingProviders.workspace.capability.editor.scalarType.${option.valueType}` as 'onboardingProviders.workspace.capability.editor.scalarType.string',
                      ),
                    })),
                  ]}
                  onChange={(selectedIndex) => {
                    const option = parameter.options[Number(selectedIndex)]
                    onChange(
                      option
                        ? {
                            ...parameter,
                            hasDefaultValue: true,
                            defaultValue: option.value,
                            defaultValueType: option.valueType,
                          }
                        : {
                            ...parameter,
                            hasDefaultValue: false,
                            defaultValue: '',
                            defaultValueType: 'string',
                          },
                    )
                  }}
                  ariaLabel={t('onboardingProviders.workspace.capability.editor.defaultValue')}
                  className="h-9 max-w-full rounded-nomi-sm"
                />
              </div>
            ) : (
              <div>
                <label className="mb-1 flex items-center gap-2 text-micro text-nomi-ink-60">
                  <DesignSwitch
                    checked={parameter.hasDefaultValue}
                    onChange={(event) =>
                      onChange({
                        ...parameter,
                        hasDefaultValue: event.currentTarget.checked,
                        defaultValueType: parameter.type === 'number' ? 'number' : 'string',
                      })
                    }
                    aria-label={t('onboardingProviders.workspace.capability.editor.useDefault')}
                  />
                  {t('onboardingProviders.workspace.capability.editor.useDefault')}
                </label>
                {parameter.type === 'number' ? (
                  <DesignNumberInput
                    data-capability-field={`${path}.defaultValue`}
                    aria-label={t('onboardingProviders.workspace.capability.editor.defaultValue')}
                    disabled={!parameter.hasDefaultValue}
                    error={Boolean(errors[`${path}.defaultValue`])}
                    value={parameter.defaultValue}
                    hideControls
                    withKeyboardEvents={false}
                    placeholder={t('onboardingProviders.workspace.capability.editor.noDefault')}
                    onChange={(value) => onChange({ ...parameter, defaultValue: String(value) })}
                  />
                ) : (
                  <DesignTextInput
                    data-capability-field={`${path}.defaultValue`}
                    aria-label={t('onboardingProviders.workspace.capability.editor.defaultValue')}
                    disabled={!parameter.hasDefaultValue}
                    error={Boolean(errors[`${path}.defaultValue`])}
                    value={parameter.defaultValue}
                    maxLength={2000}
                    placeholder={t('onboardingProviders.workspace.capability.editor.noDefault')}
                    onChange={(event) => onChange({ ...parameter, defaultValue: event.currentTarget.value })}
                  />
                )}
              </div>
            )}
            <ErrorText code={errors[`${path}.defaultValue`]} />
          </div>
          <div className="pt-4">
            <IconActionButton
              onClick={onRemove}
              aria-label={t('onboardingProviders.workspace.capability.editor.removeParameter')}
              title={t('onboardingProviders.workspace.capability.editor.removeParameter')}
              className="size-11 text-nomi-ink-40 hover:text-workbench-danger sm:size-8"
              icon={<IconTrash size={16} stroke={1.8} aria-hidden="true" />}
            />
          </div>
        </div>
      </div>

      {parameter.type === 'number' ? (
        <div className="mt-3 grid max-w-md grid-cols-2 gap-3">
          <label>
            <FieldLabel>{t('onboardingProviders.workspace.capability.editor.min')}</FieldLabel>
            <DesignNumberInput
              data-capability-field={`${path}.min`}
              error={Boolean(errors[`${path}.min`])}
              value={parameter.min}
              hideControls
              withKeyboardEvents={false}
              placeholder={t('onboardingProviders.workspace.capability.editor.optional')}
              onChange={(value) => onChange({ ...parameter, min: String(value) })}
            />
            <ErrorText code={errors[`${path}.min`]} />
          </label>
          <label>
            <FieldLabel>{t('onboardingProviders.workspace.capability.editor.max')}</FieldLabel>
            <DesignNumberInput
              data-capability-field={`${path}.max`}
              error={Boolean(errors[`${path}.max`])}
              value={parameter.max}
              hideControls
              withKeyboardEvents={false}
              placeholder={t('onboardingProviders.workspace.capability.editor.optional')}
              onChange={(value) => onChange({ ...parameter, max: String(value) })}
            />
            <ErrorText code={errors[`${path}.max`]} />
          </label>
        </div>
      ) : null}

      {parameter.type === 'select' ? (
        <OptionEditor parameter={parameter} path={path} errors={errors} onChange={onChange} />
      ) : null}
    </div>
  )
}

export function CapabilityModeEditor({
  draftKind,
  mode,
  modeIndex,
  isDefault,
  canRemove,
  errors,
  onChange,
  onSetDefault,
  onRemove,
}: {
  draftKind: CapabilityContractDraft['kind']
  mode: CapabilityModeDraft
  modeIndex: number
  isDefault: boolean
  canRemove: boolean
  errors: Record<string, CapabilityDraftErrorCode>
  onChange: (mode: CapabilityModeDraft) => void
  onSetDefault: () => void
  onRemove: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const path = `modes.${modeIndex}`
  const [interfaceOpen, setInterfaceOpen] = React.useState(false)
  const hasInterfaceError = Boolean(errors[`${path}.id`] || errors[`${path}.taskKind`])
  React.useEffect(() => {
    if (hasInterfaceError) setInterfaceOpen(true)
  }, [hasInterfaceError])
  return (
    <article className="rounded-nomi border border-nomi-line bg-nomi-paper" data-capability-mode={modeIndex}>
      <CapabilityModeEditorHeader
        modeName={mode.displayName}
        isDefault={isDefault}
        canRemove={canRemove}
        onSetDefault={onSetDefault}
        onRemove={onRemove}
      />

      <div className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label>
            <FieldLabel>{t('onboardingProviders.workspace.capability.editor.modeName')}</FieldLabel>
            <DesignTextInput
              data-capability-field={`${path}.displayName`}
              error={Boolean(errors[`${path}.displayName`])}
              value={mode.displayName}
              maxLength={160}
              onChange={(event) => onChange({ ...mode, displayName: event.currentTarget.value })}
            />
            <ErrorText code={errors[`${path}.displayName`]} />
          </label>
          <label className="md:col-span-2">
            <FieldLabel>{t('onboardingProviders.workspace.capability.editor.description')}</FieldLabel>
            <DesignTextarea
              data-capability-field={`${path}.description`}
              value={mode.description}
              maxLength={1000}
              autosize={false}
              rows={3}
              resize="vertical"
              onChange={(event) => onChange({ ...mode, description: event.currentTarget.value })}
            />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <div data-capability-field={`${path}.intent`}>
            <FieldLabel>{t('onboardingProviders.workspace.capability.editor.intent')}</FieldLabel>
            <NomiSelect
              value={mode.intent}
              options={CAPABILITY_INTENTS.map((intent) => ({
                value: intent,
                label: t(
                  `onboardingProviders.workspace.capability.intent.${intent}` as 'onboardingProviders.workspace.capability.intent.text',
                ),
              }))}
              onChange={(intent) => onChange({ ...mode, intent: intent as CapabilityModeDraft['intent'] })}
              ariaLabel={t('onboardingProviders.workspace.capability.editor.intent')}
              className="h-9 max-w-full rounded-nomi-sm"
            />
          </div>
          <div>
            <FieldLabel>{t('onboardingProviders.workspace.capability.editor.prompt')}</FieldLabel>
            <div className="flex h-9 items-center gap-2">
              <DesignSwitch
                checked={mode.promptRequired}
                onChange={(event) => onChange({ ...mode, promptRequired: event.currentTarget.checked })}
                aria-label={t('onboardingProviders.workspace.capability.editor.promptRequired')}
              />
              <span className="text-caption text-nomi-ink-60">
                {t(
                  mode.promptRequired
                    ? 'onboardingProviders.workspace.capability.editor.required'
                    : 'onboardingProviders.workspace.capability.editor.optional',
                )}
              </span>
            </div>
          </div>
        </div>

        <details
          className="mt-3"
          open={interfaceOpen || hasInterfaceError}
          onToggle={(event) => setInterfaceOpen(event.currentTarget.open)}
        >
          <summary className="min-h-8 cursor-pointer select-none text-micro font-medium text-nomi-ink-40 hover:text-nomi-ink-60">
            {t('onboardingProviders.workspace.capability.editor.interfaceFields')}
          </summary>
          <div className="grid grid-cols-1 gap-3 rounded-nomi-sm bg-nomi-ink-05 p-3 md:grid-cols-2">
            <label>
              <FieldLabel>{t('onboardingProviders.workspace.capability.editor.modeId')}</FieldLabel>
              <DesignTextInput
                data-capability-field={`${path}.id`}
                classNames={{ input: 'font-nomi-mono' }}
                error={Boolean(errors[`${path}.id`])}
                value={mode.id}
                maxLength={64}
                onChange={(event) => onChange({ ...mode, id: event.currentTarget.value })}
              />
              <ErrorText code={errors[`${path}.id`]} />
            </label>
            <div data-capability-field={`${path}.taskKind`}>
              <FieldLabel>{t('onboardingProviders.workspace.capability.editor.taskKind')}</FieldLabel>
              <NomiSelect
                value={mode.taskKind}
                options={CAPABILITY_TASK_KINDS_BY_MODEL_KIND[draftKind].map((taskKind) => ({
                  value: taskKind,
                  label: t(
                    `onboardingProviders.adapterVerification.mode.${taskKind}` as 'onboardingProviders.adapterVerification.mode.text_to_video',
                  ),
                }))}
                onChange={(taskKind) => onChange({ ...mode, taskKind: taskKind as CapabilityModeDraft['taskKind'] })}
                ariaLabel={t('onboardingProviders.workspace.capability.editor.taskKind')}
                className="h-9 max-w-full rounded-nomi-sm"
              />
              <ErrorText code={errors[`${path}.taskKind`]} />
            </div>
          </div>
        </details>

        <section className="mt-5" aria-labelledby={`mode-${modeIndex}-slots`}>
          <div className="flex min-h-9 items-center justify-between gap-3 border-b border-nomi-line">
            <div>
              <h4 id={`mode-${modeIndex}-slots`} className="text-body-sm font-semibold text-nomi-ink">
                {t('onboardingProviders.workspace.capability.editor.inputs')}
              </h4>
              <p className="text-micro text-nomi-ink-40">
                {t('onboardingProviders.workspace.capability.editor.inputsHint')}
              </p>
            </div>
            <span
              title={
                mode.slots.length >= CAPABILITY_EDITOR_LIMITS.slotsPerMode
                  ? t('onboardingProviders.workspace.capability.editor.limitReached')
                  : undefined
              }
            >
              <DesignButton
                variant="subtle"
                size="xs"
                disabled={mode.slots.length >= CAPABILITY_EDITOR_LIMITS.slotsPerMode}
                onClick={() => onChange({ ...mode, slots: [...mode.slots, createCapabilitySlotDraft()] })}
                className="text-nomi-accent"
                leftSection={<IconPlus size={14} stroke={1.8} aria-hidden="true" />}
              >
                {t('onboardingProviders.workspace.capability.editor.addInput')}
              </DesignButton>
            </span>
          </div>
          <ErrorText code={errors[`${path}.slots`]} />
          {mode.slots.length > 0 ? (
            mode.slots.map((slot, slotIndex) => (
              <SlotEditor
                key={slotIndex}
                slot={slot}
                path={`${path}.slots.${slotIndex}`}
                errors={errors}
                onChange={(next) => onChange(replaceCapabilitySlotDraft(mode, slotIndex, next))}
                onRemove={() => onChange(removeCapabilitySlotDraft(mode, slotIndex))}
              />
            ))
          ) : (
            <p className="py-3 text-caption text-nomi-ink-40">
              {t('onboardingProviders.workspace.capability.editor.noInputs')}
            </p>
          )}
        </section>

        <section className="mt-5" aria-labelledby={`mode-${modeIndex}-parameters`}>
          <div className="flex min-h-9 items-center justify-between gap-3 border-b border-nomi-line">
            <div>
              <h4 id={`mode-${modeIndex}-parameters`} className="text-body-sm font-semibold text-nomi-ink">
                {t('onboardingProviders.workspace.capability.editor.parameters')}
              </h4>
              <p className="text-micro text-nomi-ink-40">
                {t('onboardingProviders.workspace.capability.editor.parametersHint')}
              </p>
            </div>
            <span
              title={
                mode.parameters.length >= CAPABILITY_EDITOR_LIMITS.parametersPerMode
                  ? t('onboardingProviders.workspace.capability.editor.limitReached')
                  : undefined
              }
            >
              <DesignButton
                variant="subtle"
                size="xs"
                disabled={mode.parameters.length >= CAPABILITY_EDITOR_LIMITS.parametersPerMode}
                onClick={() =>
                  onChange({ ...mode, parameters: [...mode.parameters, createCapabilityParameterDraft()] })
                }
                className="text-nomi-accent"
                leftSection={<IconPlus size={14} stroke={1.8} aria-hidden="true" />}
              >
                {t('onboardingProviders.workspace.capability.editor.addParameter')}
              </DesignButton>
            </span>
          </div>
          <ErrorText code={errors[`${path}.parameters`]} />
          {mode.parameters.length > 0 ? (
            mode.parameters.map((parameter, parameterIndex) => (
              <ParameterEditor
                key={parameterIndex}
                parameter={parameter}
                path={`${path}.parameters.${parameterIndex}`}
                errors={errors}
                onChange={(next) =>
                  onChange({
                    ...mode,
                    parameters: mode.parameters.map((item, index) => (index === parameterIndex ? next : item)),
                  })
                }
                onRemove={() =>
                  onChange({
                    ...mode,
                    parameters: mode.parameters.filter((_, index) => index !== parameterIndex),
                  })
                }
              />
            ))
          ) : (
            <p className="py-3 text-caption text-nomi-ink-40">
              {t('onboardingProviders.workspace.capability.editor.noParameters')}
            </p>
          )}
        </section>
      </div>
    </article>
  )
}
