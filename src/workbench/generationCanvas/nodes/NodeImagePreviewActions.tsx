import React from 'react'
import { useTranslation } from 'react-i18next'
import { EditableNodeTitle } from './render/EditableNodeTitle'

/** One title in the outside-media row, in both pending and generated states. */
export function NodeInlineImageTitle({ nodeId, value, readOnly }: {
  nodeId: string
  value: string
  readOnly: boolean
}): JSX.Element {
  const { t } = useTranslation()
  return <div data-node-inline-title="true" className="flex min-w-0 flex-1 items-center" onPointerDown={(event) => event.stopPropagation()}>
    {readOnly ? <span className="truncate text-[length:inherit] font-normal text-nomi-ink-60" title={value}>{value}</span> : <EditableNodeTitle
      nodeId={nodeId} value={value}
      placeholder={t('generationCommon.imagePreview.untitled')}
      className="text-[length:inherit] font-normal text-nomi-ink-60"
    />}
  </div>
}
