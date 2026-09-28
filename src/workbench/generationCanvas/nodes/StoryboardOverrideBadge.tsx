import { useTranslation } from 'react-i18next'
import { IconCheck, IconX } from '../../../vendor/tablerIcons'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { nodeShotField, overriddenShotFields } from '../model/storyboardOverrides'

/** The same badge on the row and canvas card; resolution controls live on the row only. */
export function StoryboardOverrideBadge({ node, onResolve }: {
  node: GenerationCanvasNode
  onResolve?: (field: string, action: 'adopt' | 'discard') => void
}): JSX.Element | null {
  const { t } = useTranslation()
  const fields = overriddenShotFields(node)
  if (!fields.length) return null
  return (
    <div className="flex min-w-0 flex-col gap-1" data-storyboard-overrides={node.id}>
      {fields.map(field => {
        const value = String(nodeShotField(node, field) ?? '')
        return (
          <div key={field} className="flex min-w-0 flex-wrap items-center gap-2" data-storyboard-override-field={field}>
            <span className="max-w-full truncate rounded-pill bg-nomi-ink-05 px-2 py-0.5 text-micro text-nomi-ink-60" title={value}>
              {t('storyboardEditor.overrides.badge', { value })}
            </span>
            {onResolve ? <>
              <button type="button" onClick={() => onResolve(field, 'adopt')} className="inline-flex items-center gap-1 rounded-nomi-sm px-1 py-0.5 text-micro text-nomi-ink-60 hover:bg-nomi-ink-10">
                <IconCheck size={12} stroke={1.5} aria-hidden />{t('storyboardEditor.overrides.adopt')}
              </button>
              <button type="button" onClick={() => onResolve(field, 'discard')} className="inline-flex items-center gap-1 rounded-nomi-sm px-1 py-0.5 text-micro text-nomi-ink-60 hover:bg-nomi-ink-10">
                <IconX size={12} stroke={1.5} aria-hidden />{t('storyboardEditor.overrides.discard')}
              </button>
              <span className="w-full truncate text-micro text-nomi-ink-40" title={value}>{t('storyboardEditor.overrides.effective', { value })}</span>
            </> : null}
          </div>
        )
      })}
    </div>
  )
}
