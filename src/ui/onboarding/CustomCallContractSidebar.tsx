import React from 'react'
import { useTranslation } from 'react-i18next'

type ScriptVariable = { name: string; type: string }
type ScriptVariableGroupKey = 'input' | 'connection' | 'request'

function groupVariables(variables: ScriptVariable[]) {
  return [
    {
      key: 'input' as const,
      variables: variables.filter((variable) =>
        ['prompt', 'taskKind', 'modeId', 'params', 'references', 'model'].includes(variable.name),
      ),
    },
    {
      key: 'connection' as const,
      variables: variables.filter((variable) => ['baseUrl', 'apiKey', 'config'].includes(variable.name)),
    },
    {
      key: 'request' as const,
      variables: variables.filter((variable) =>
        ['http', 'request', 'poll', 'saveFile', 'sleep', 'signal'].includes(variable.name),
      ),
    },
  ]
}

function VariableGroups({
  variables,
  compact = false,
}: {
  variables: ScriptVariable[]
  compact?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const [openGroups, setOpenGroups] = React.useState<Record<ScriptVariableGroupKey, boolean>>({
    input: true,
    connection: false,
    request: false,
  })
  return (
    <div className={compact ? 'mt-3 flex flex-col gap-2' : 'mt-2 flex flex-col gap-2'}>
      {groupVariables(variables).map((group) => (
        <details
          key={group.key}
          open={openGroups[group.key]}
          onToggle={(event) => {
            const open = event.currentTarget.open
            setOpenGroups((current) => (current[group.key] === open ? current : { ...current, [group.key]: open }))
          }}
          className={compact ? undefined : 'border-t border-nomi-line-soft pt-2 first:border-t-0 first:pt-0'}
        >
          <summary className="cursor-pointer select-none text-caption font-semibold text-nomi-ink-60 hover:text-nomi-ink">
            {t(
              group.key === 'input'
                ? 'onboardingProviders.customCall.variableGroup.input'
                : group.key === 'connection'
                  ? 'onboardingProviders.customCall.variableGroup.connection'
                  : 'onboardingProviders.customCall.variableGroup.request',
            )}
          </summary>
          <ul className="mt-2 flex flex-col gap-2.5">
            {group.variables.map((variable) => (
              <li key={variable.name} className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                  <code className="font-nomi-mono text-caption font-semibold text-nomi-ink-80">{variable.name}</code>
                  <span className="min-w-0 break-words font-nomi-mono text-micro text-nomi-ink-40">
                    {variable.type}
                  </span>
                </div>
                <p className="mt-1 text-caption leading-snug text-nomi-ink-60">
                  {t(
                    `onboardingProviders.customCall.vars.${variable.name}` as 'onboardingProviders.customCall.vars.prompt',
                  )}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  )
}

export function CustomCallContractSidebar({
  returnContract,
  variables,
}: {
  returnContract: string
  variables: ScriptVariable[]
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <aside
      data-custom-call-contract-sidebar
      aria-labelledby="custom-call-contract-title"
      className="min-w-0 border-b border-nomi-line-soft pb-3 sm:sticky sm:top-0 sm:self-start sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3"
    >
      <section className="hidden border-b border-nomi-line-soft pb-3 sm:block">
        <h3 id="custom-call-contract-title" className="text-body-sm font-semibold text-nomi-ink">
          {t('onboardingProviders.customCall.returnTitle')}
        </h3>
        <p className="mt-1.5 text-caption leading-relaxed text-nomi-ink-60">{returnContract}</p>
      </section>

      <details className="text-caption text-nomi-ink-60 sm:hidden">
        <summary className="cursor-pointer select-none font-semibold text-nomi-ink">
          {t('onboardingProviders.customCall.apiHelpTitle')}
        </summary>
        <p className="mt-2 leading-relaxed">{returnContract}</p>
        <VariableGroups variables={variables} compact />
      </details>

      <section className="hidden pt-3 sm:block" aria-labelledby="custom-call-variables-title">
        <h3 id="custom-call-variables-title" className="text-body-sm font-semibold text-nomi-ink">
          {t('onboardingProviders.customCall.varsLabel')}
        </h3>
        <VariableGroups variables={variables} />
      </section>
    </aside>
  )
}
