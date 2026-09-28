import { shotPresentation } from '../../creation/storyboard/shotPresentation'
import { asGenerationProposalArgs, asSemanticGenerationProposalArgs } from './generationProposalEditing'

// 这三个形状原本住在 `ResidentExceptionStates.tsx` 里——那是旧面板的**长相**文件，
// 随 v4 接线整件删除。形状本身不是长相：它们描述的是「一次工具调用的 args 里能读出什么」，
// v4 的介入槽投影照样要用。所以跟着**读它们的那一层**走，别跟着渲染它们的那一层走。
export type ResidentPlanShot = Readonly<{
  id: string
  title: string
  description: string
  selected?: boolean
  edited?: boolean
}>

export type ResidentCandidate = Readonly<{
  id: string
  label: string
  imageUrl?: string
}>

export function residentVisibleCandidates(candidates: readonly ResidentCandidate[], expanded: boolean): readonly ResidentCandidate[] {
  return candidates.slice(0, expanded ? 6 : 3)
}

export function residentPlanShots(rawArgs: unknown): ResidentPlanShot[] {
  const canvas = asGenerationProposalArgs(rawArgs)
  if (canvas) return canvas.nodes.map((node, index) => ({
    id: typeof node.clientId === 'string' && node.clientId ? node.clientId : `shot-${index + 1}`,
    ...shotPresentation(node, index + 1),
  }))
  const semantic = asSemanticGenerationProposalArgs(rawArgs)
  const shots = semantic?.shots?.filter((shot): shot is Record<string, unknown> => Boolean(shot && typeof shot === 'object' && !Array.isArray(shot))) ?? []
  return shots.map((shot, index) => ({
    id: typeof shot.shotId === 'string' && shot.shotId ? shot.shotId : `shot-${index + 1}`,
    ...shotPresentation(shot, index + 1),
  }))
}

export function residentProposalParameters(rawArgs: unknown): string[] {
  const record = rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs) ? rawArgs as Record<string, unknown> : {}
  const candidate = record.candidate && typeof record.candidate === 'object' && !Array.isArray(record.candidate) ? record.candidate as Record<string, unknown> : {}
  return [record.model, record.modelId, record.variantId, candidate.model, candidate.modelId, candidate.variantId]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
}

export function residentArgsForSelection(rawArgs: Record<string, unknown>, selectedIds: readonly string[]): Record<string, unknown> {
  const selected = new Set(selectedIds)
  const canvas = asGenerationProposalArgs(rawArgs)
  if (canvas) return { ...canvas, nodes: canvas.nodes.filter((node, index) => selected.has(typeof node.clientId === 'string' && node.clientId ? node.clientId : `shot-${index + 1}`)) }
  const semantic = asSemanticGenerationProposalArgs(rawArgs)
  if (!semantic || !Array.isArray(semantic.shots)) return rawArgs
  return { ...semantic, shots: semantic.shots.filter((shot, index) => {
    if (!shot || typeof shot !== 'object' || Array.isArray(shot)) return false
    const record = shot as Record<string, unknown>
    return selected.has(typeof record.shotId === 'string' && record.shotId ? record.shotId : `shot-${index + 1}`)
  }) }
}

export function residentCandidates(rawArgs: unknown): ResidentCandidate[] {
  if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) return []
  const candidates = (rawArgs as Record<string, unknown>).candidates
  if (!Array.isArray(candidates)) return []
  return candidates.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return []
    const record = candidate as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id : `candidate-${index + 1}`
    const label = typeof record.label === 'string' ? record.label : typeof record.title === 'string' ? record.title : id
    const imageUrl = typeof record.imageUrl === 'string' ? record.imageUrl : typeof record.thumbnailUrl === 'string' ? record.thumbnailUrl : undefined
    return [{ id, label, ...(imageUrl ? { imageUrl } : {}) }]
  })
}
