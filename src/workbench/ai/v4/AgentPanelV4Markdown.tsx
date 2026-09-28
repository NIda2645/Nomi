// Answers and actionable next steps remain visible. Process and user-message folding
// have their own semantic boundaries; rendered height cannot classify importance.
import React from 'react'
import { NomiMarkdown } from '../../common/NomiMarkdown'
import { useTranslation } from 'react-i18next'

export function AgentPanelV4Markdown({ text, streaming = false }: {
  text: string
  streaming?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="min-w-0" data-v4-markdown="true">
      <NomiMarkdown streaming={streaming} compact profile="agent-v4" copyLabel={t('agentPanelV4.copy')}
        imageLabel={t('agentPanelV4.image')}>
        {text}
      </NomiMarkdown>
    </div>
  )
}
