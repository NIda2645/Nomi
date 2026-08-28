import { IconFolderMinus, IconFolderPlus, IconLayoutGrid, IconPlayerPlay, IconX } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { NomiSelect, WorkbenchIconButton } from '../../../design'
import { cn } from '../../../utils/cn'
import { CanvasBulkModelSelect, type CanvasApplyModelInput } from './CanvasBulkModelSelect'
import type { CanvasGenerationExecutionGroup } from './canvasProductionScope'

const CONCURRENCY_OPTIONS = [1, 2, 4, 6, 8].map((value) => ({ value: String(value), label: String(value) }))

type CanvasSelectionToolbarProps = {
  selectedCount: number
  selectedGroupCount: number
  transform: string
  maxWidth?: number
  eligibleCount: number
  executionGroups: CanvasGenerationExecutionGroup[]
  concurrency: number
  /** 选中的节点里已经出图的张数——不足 2 张就没有联系表可拼，钮直接不出现（不给点了才说不行）。 */
  contactSheetCount: number
  onConcurrencyChange: (value: number) => void
  onGenerate: () => void
  onApplyModel: (input: CanvasApplyModelInput) => void
  onGroupSelectedNodes: () => void
  onUngroupSelectedNodes: () => void
  onBuildContactSheet: () => void
  onClearSelection: () => void
}

export function CanvasSelectionToolbar({
  selectedCount,
  selectedGroupCount,
  transform,
  maxWidth,
  eligibleCount,
  executionGroups,
  concurrency,
  contactSheetCount,
  onConcurrencyChange,
  onGenerate,
  onApplyModel,
  onGroupSelectedNodes,
  onUngroupSelectedNodes,
  onBuildContactSheet,
  onClearSelection,
}: CanvasSelectionToolbarProps): JSX.Element {
  const { t } = useTranslation()
  const generateLabel = t('generationCommon.production.generateSelected', { count: eligibleCount })
  return (
    <div
      className={cn(
        'generation-canvas-v2__selection-toolbar',
        'absolute z-[11] inline-flex max-w-[760px] items-center gap-2 overflow-x-auto px-2.5 py-1.5',
        'border border-nomi-line rounded-full',
        'bg-nomi-paper/[0.96] shadow-nomi-md pointer-events-auto',
      )}
      style={{ transform, maxWidth }}
      aria-label={t('generationCommon.selection.aria')}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span className={cn('pl-1.5 pr-1 text-nomi-ink-60 text-body-sm whitespace-nowrap')}>
        {t('generationCommon.selection.count', { count: selectedCount })}
      </span>
      {executionGroups.map((group) => (
        <CanvasBulkModelSelect key={group.executionKind} group={group} onApplyModel={onApplyModel} />
      ))}
      <button
        type="button"
        data-storyboard-run-all="true"
        data-batch-scope="selection"
        className={cn(
          'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border-0 px-4 text-body font-medium',
          'bg-nomi-ink text-nomi-paper',
          'transition-colors duration-[var(--nomi-transition-fast)]',
          eligibleCount > 0 ? 'cursor-pointer hover:bg-nomi-accent' : 'cursor-not-allowed opacity-45',
        )}
        disabled={eligibleCount === 0}
        title={
          eligibleCount === 0
            ? t('generationCommon.production.noPending')
            : t('generationCommon.selection.generateHint')
        }
        onClick={onGenerate}
      >
        <IconPlayerPlay size={16} stroke={1.6} aria-hidden />
        {generateLabel}
      </button>
      <NomiSelect
        ariaLabel={t('generationCommon.production.concurrency')}
        leadingLabel={t('generationCommon.production.concurrency')}
        value={String(concurrency)}
        options={CONCURRENCY_OPTIONS}
        size="xs"
        onChange={(value) => onConcurrencyChange(Number(value))}
      />
      <span className={cn('w-px h-4 bg-nomi-line')} />
      {contactSheetCount >= 2 ? (
        <WorkbenchIconButton
          data-contact-sheet="true"
          label={t('generationCommon.contactSheet.action', { count: contactSheetCount })}
          icon={<IconLayoutGrid size={16} />}
          onClick={onBuildContactSheet}
        />
      ) : null}
      {selectedGroupCount > 0 ? (
        <WorkbenchIconButton
          label={t('generationCommon.selection.ungroup')}
          icon={<IconFolderMinus size={16} />}
          onClick={onUngroupSelectedNodes}
        />
      ) : (
        <WorkbenchIconButton
          label={t('generationCommon.selection.group')}
          icon={<IconFolderPlus size={16} />}
          onClick={onGroupSelectedNodes}
        />
      )}
      <WorkbenchIconButton
        label={t('generationCommon.selection.clear')}
        icon={<IconX size={16} />}
        onClick={onClearSelection}
      />
    </div>
  )
}
