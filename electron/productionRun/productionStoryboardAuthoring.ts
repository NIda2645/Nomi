import { z } from 'zod'
import { storyboardPlanSchema } from '../shared/storyboard/storyboardPlanSchema'
import { generationDraftFromStoryboard, storyboardContentToken } from '../shared/storyboard/generationPlanEditorial'
import { revokeWaitingGenerationAuthorization, unsealedGenerationPlanFields } from './productionGenerationPlanEdits'
import type { ProductionRun, RunCommand } from './productionRunTypes'

const storyboardSaveSchema = z.object({
  projectId: z.string().min(1), runId: z.string().min(1), operationId: z.string().min(1),
  sourceDocumentId: z.string().min(1), sourceDocumentRevision: z.number().int().nonnegative(),
  sourceDocumentHash: z.string().min(1), expectedContentToken: z.string().min(1), plan: storyboardPlanSchema,
}).strict()

/** IPC and durable reducer share the complete original editor contract. */
export function validateStoryboardSavePayload(raw: Record<string, unknown>) {
  return storyboardSaveSchema.parse(raw)
}

export function saveStoryboardAuthoring(current: ProductionRun, command: RunCommand, now: string): ProductionRun {
  const payload = validateStoryboardSavePayload(command.payload)
  const source = current.origin.sourceDocument
  if (payload.projectId !== current.projectId || payload.runId !== current.runId
    || payload.operationId !== current.generationPlan?.operationId) throw new Error('Storyboard target mismatch')
  if (!source || payload.sourceDocumentId !== source.documentId || payload.sourceDocumentRevision !== source.revision
    || payload.sourceDocumentHash !== source.contentHash) throw new Error('Storyboard source mismatch')
  const plan = current.generationPlan
  if (!plan) throw new Error('Storyboard generation plan missing')
  if (payload.expectedContentToken !== storyboardContentToken(current)) throw new Error('storyboard_content_conflict')
  const changed = storyboardContentToken({ generationPlan: generationDraftFromStoryboard(payload.plan, plan, now) }) !== payload.expectedContentToken
  const revoke = changed && plan.state === 'sealed' && current.gates.some(gate => gate.gateId === plan.authorizationGateId && gate.status === 'waiting')
  const revoked = revoke ? revokeWaitingGenerationAuthorization(current, plan, now, 'Save storyboard') : {}
  const execution = revoke ? { ...unsealedGenerationPlanFields(plan, now), cardHidden: true }
    : changed && plan.state === 'draft' ? { ...plan, cardHidden: true } : plan
  return { ...current, ...revoked, authoring: { title: payload.plan.title },
    generationPlan: generationDraftFromStoryboard(payload.plan, execution, now), updatedAt: now }
}
