import type { ShotClaimReason } from '../../../electron/shared/decideShotClaim'

export type ShotClaimCopy = {
  key: 'queued' | 'awaitingConfirmation' | 'inFlight' | 'needsReconcile'
  action: 'view-task' | 'reconcile'
}

const COPY_BY_REASON: Partial<Record<ShotClaimReason, ShotClaimCopy>> = {
  queued: { key: 'queued', action: 'view-task' },
  awaiting_confirmation: { key: 'awaitingConfirmation', action: 'view-task' },
  in_flight: { key: 'inFlight', action: 'view-task' },
  needs_reconcile: { key: 'needsReconcile', action: 'reconcile' },
}

export function shotClaimCopy(reason: ShotClaimReason | undefined): ShotClaimCopy | undefined {
  return reason ? COPY_BY_REASON[reason] : undefined
}
