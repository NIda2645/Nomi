import React from 'react'
import { IconArrowLeft } from '@tabler/icons-react'
import { IconActionButton } from '../../design'
import { cn } from '../../utils/cn'

export function ModelSettingsPageSurface({
  page,
  title,
  backLabel,
  onBack,
  contentClassName,
  footer,
  children,
}: {
  page: 'add' | 'platformConnect' | 'verification' | 'script'
  title: React.ReactNode
  backLabel: string
  onBack: () => void
  contentClassName?: string
  footer?: React.ReactNode
  children: React.ReactNode
}): JSX.Element {
  return (
    <section data-model-settings-page={page} className="flex min-h-0 w-full flex-1 flex-col">
      <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-nomi-line bg-nomi-paper px-3 py-2 pr-14 sm:px-4 sm:pr-14">
        <IconActionButton
          data-model-settings-back
          onClick={onBack}
          aria-label={backLabel}
          title={backLabel}
          className="size-11 shrink-0 text-nomi-ink-60 hover:bg-nomi-ink-05 hover:text-nomi-ink sm:size-8"
          icon={<IconArrowLeft size={16} stroke={1.8} aria-hidden="true" />}
        />
        <div className="min-w-0 flex-1">{title}</div>
      </header>
      <div
        className={cn(
          'min-h-0 w-full flex-1 overflow-y-auto px-3 py-4 sm:px-5 sm:py-5',
          contentClassName,
        )}
      >
        <div
          data-model-settings-page-content
          className={cn(
            'mx-auto min-h-0 w-full',
            page === 'script' ? 'max-w-[1120px]' : 'max-w-[760px]',
          )}
        >
          {children}
        </div>
      </div>
      {footer ? (
        <footer
          data-model-settings-page-footer
          className="shrink-0 border-t border-nomi-line bg-nomi-paper px-3 py-3 sm:px-5"
        >
          {footer}
        </footer>
      ) : null}
    </section>
  )
}
