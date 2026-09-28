import type { ToastType } from './toast'
import { confirmDialog } from '../design/confirmDialogStore'
import { useToastStore } from './toast'

type Feedback = {
  identity: string
  reason: string
  message: string
  type?: ToastType
}

type NotificationInput = Feedback & (
  | { level: 'inline'; present: (message: string) => void }
  | { level: 'status' }
  | { level: 'background'; actionLabel: string; onAction: () => void }
  | { level: 'decision'; title: string; confirmLabel: string; danger?: boolean }
)

/** The producer supplies object context, never a container. Local feedback wins;
 * background feedback needs a real next step; decisions reuse the existing host. */
export function notify(input: Extract<NotificationInput, { level: 'decision' }>): Promise<boolean>
export function notify(input: Exclude<NotificationInput, { level: 'decision' }>): void
export function notify(input: NotificationInput): Promise<boolean> | void {
  if (input.level === 'decision') {
    return confirmDialog({ title: input.title, message: input.message, confirmLabel: input.confirmLabel, danger: input.danger })
  }
  if (input.level === 'inline' || input.level === 'status') {
    useToastStore.getState().remove(input.identity)
    if (input.level === 'inline') input.present(input.message)
    return
  }
  useToastStore.getState().push({
    id: input.identity,
    reason: input.reason,
    message: input.message,
    type: input.type,
    actionLabel: input.actionLabel,
    onAction: input.onAction,
  })
}

/** Internal renderer navigation request. The application acknowledges synchronously
 * and resolves only after its ordinary project hydration/permission path finishes. */
export type NotificationTarget = {
  projectId: string
  runId?: string
  workspaceMode?: 'preview' | 'generation'
  nodeIds?: string[]
  taskCenter?: boolean
}
export type NotificationTargetRequest = NotificationTarget & { resolve: (opened: boolean) => void }

export function revealNotificationTarget(target: NotificationTarget): Promise<boolean> {
  return new Promise((resolve) => {
    const event = new CustomEvent<NotificationTargetRequest>('nomi-reveal-notification', {
      detail: { ...target, resolve }, cancelable: true,
    })
    if (window.dispatchEvent(event)) resolve(false)
  })
}
