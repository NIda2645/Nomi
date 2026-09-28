import React from 'react'
import type { NotificationData } from '@mantine/notifications'
import { notifications, notificationsStore } from '@mantine/notifications'
import { IconAlertCircle, IconAlertTriangle, IconCircleCheck, IconInfoCircle } from '@tabler/icons-react'

// 全仓唯一通用 toast。统一走 @mantine/notifications 的单一容器（main.tsx 的 <Notifications/>）。
// 语义变体 showUndoToast（点击撤销）/ showInfoToast（一次性告知）也走同一容器，不再有本地并行 store/host。
export type ToastType = 'info' | 'success' | 'error' | 'warning'
type Toast = {
  id: string
  message: React.ReactNode
  reason?: string
  count?: number
  type?: ToastType
  ttl?: number | false
  actionLabel?: string
  onAction?: () => void
  dismissible?: boolean
}

type ToastInput = Omit<Toast, 'id' | 'message'> & ({ id: string; message: React.ReactNode } | { id?: string; message: string })

function toastColor(type?: ToastType): string {
  if (type === 'error') return 'var(--nomi-danger)'
  if (type === 'success') return 'var(--workbench-success)'
  if (type === 'warning') return 'var(--nomi-warning)'
  return 'var(--nomi-ink-40)'
}

function toastIcon(type?: ToastType): React.ReactNode {
  const props = { size: 17, stroke: 1.8, 'aria-hidden': true } as const
  if (type === 'error') return <IconAlertCircle {...props} />
  if (type === 'success') return <IconCircleCheck {...props} />
  if (type === 'warning') return <IconAlertTriangle {...props} />
  return <IconInfoCircle {...props} />
}

function defaultTtl(type?: ToastType): number {
  if (type === 'success') return 2600
  if (type === 'warning') return 5000
  if (type === 'error') return 6000
  return 3000
}

function ToastMessage({
  id,
  message,
  actionLabel,
  onAction,
  count = 1,
}: Pick<Toast, 'id' | 'message' | 'actionLabel' | 'onAction' | 'count'>): JSX.Element {
  const handleAction = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    notifications.hide(id)
    onAction?.()
  }

  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 flex-1 break-words text-body-sm text-nomi-ink-80">{message}{count > 1 ? <span className="ml-1 text-micro text-nomi-ink-40" data-notification-occurrences>{`×${count}`}</span> : null}</span>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={handleAction}
          title={actionLabel}
          className="max-w-[40%] shrink-0 truncate rounded-nomi-sm bg-nomi-accent-soft px-2 py-1 text-caption font-semibold text-nomi-accent hover:bg-nomi-ink-10"
        >
          {actionLabel}
        </button>
      ) : null}
    </span>
  )
}

export function buildToastNotification(input: Toast): NotificationData {
  const actionable = Boolean(input.actionLabel && input.onAction)
  const repeatedFailure = (input.count ?? 1) > 1 && (input.type === 'warning' || input.type === 'error')
  return {
    id: input.id,
    message: (
      <ToastMessage
        id={input.id}
        message={input.message}
        actionLabel={input.actionLabel}
        onAction={input.onAction}
        count={input.count}
      />
    ),
    icon: toastIcon(input.type),
    color: toastColor(input.type),
    autoClose: repeatedFailure ? false : input.ttl === undefined ? (actionable ? 8000 : defaultTtl(input.type)) : input.ttl,
    withCloseButton: repeatedFailure || (input.dismissible ?? (actionable || input.type === 'warning' || input.type === 'error')),
    withBorder: true,
    classNames: { root: 'min-w-[min(20rem,calc(100vw-1.5rem))]' },
  }
}

const toastStore = {
  push(input: ToastInput): string {
    // Stable identity is supplied by contextual callers. Scalar legacy callers (including
    // frozen integrations) coalesce identical text; no random identities or second store.
    const id = input.id || `toast:${input.type ?? 'info'}:${typeof input.message === 'string' ? input.message : 'notice'}`
    const reason = input.reason ?? (typeof input.message === 'string' ? input.message : input.type ?? 'info')
    notifications.updateState(notificationsStore, (items) => {
      const previous = items.find((item) => item.id === id)
      const count = previous?.['data-notification-reason'] === reason
        ? Number(previous['data-notification-count'] ?? 1) + 1
        : 1
      const notification = {
        ...buildToastNotification({ ...input, id, count }),
        'data-notification-reason': reason,
        'data-notification-count': count,
      }
      // Replace, do not merge: a new reason must not inherit an obsolete retry action.
      return previous ? items.map((item) => item.id === id ? notification : item) : [...items, notification]
    })
    return id
  },
  remove(id: string): void {
    try {
      notifications.hide(id)
    } catch {
      /* notifications 容器未挂载（如测试环境）→ 静默放行 */
    }
  },
}

export const useToastStore = Object.assign(
  <T,>(selector: (state: typeof toastStore) => T): T => selector(toastStore),
  { getState: () => toastStore },
)

export function toast(message: string, type?: ToastType, id?: string): void {
  toastStore.push({ message, type, ...(id ? { id } : {}) })
}
