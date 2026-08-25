import React from 'react'
import { useTranslation } from 'react-i18next'
import type { ModelOption } from '../../../config/models'
import { NomiSelect } from '../../../design'
import { useDedupedModelSelect } from '../../common/useDedupedModelSelect'
import { useGenerationModelOptionsState } from '../adapters/modelOptionsAdapter'
import type { CanvasGenerationExecutionGroup } from './canvasProductionScope'

export type CanvasApplyModelInput = {
  executionKind: string
  value: string
  vendor?: string
  modelOptions: readonly ModelOption[]
}

function modelGroupLabel(executionKind: string, count: number, t: ReturnType<typeof useTranslation>['t']): string {
  return t(
    `generationCommon.production.modelGroup.${executionKind}` as 'generationCommon.production.modelGroup.image',
    { count },
  )
}

export function CanvasBulkModelSelect({
  group,
  onApplyModel,
}: {
  group: CanvasGenerationExecutionGroup
  onApplyModel: (input: CanvasApplyModelInput) => void
}): JSX.Element | null {
  const { t } = useTranslation()
  const state = useGenerationModelOptionsState(group.representativeKind)
  const handleChange = React.useCallback(
    (value: string, vendor?: string) => {
      onApplyModel({ executionKind: group.executionKind, value, vendor, modelOptions: state.options })
    },
    [group.executionKind, onApplyModel, state.options],
  )
  const modelSelect = useDedupedModelSelect(state.options, '', handleChange)
  if (modelSelect.modelOptions.length === 0) return null
  const label = modelGroupLabel(group.executionKind, group.nodeIds.length, t)
  return (
    <NomiSelect
      ariaLabel={label}
      leadingLabel={label}
      placeholder={t('generationCommon.production.unifyModel')}
      value=""
      options={modelSelect.modelOptions}
      onChange={modelSelect.onModelPick}
      size="xs"
      triggerMaxWidth={140}
    />
  )
}
