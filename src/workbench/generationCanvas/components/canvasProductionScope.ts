import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import {
  getGenerationNodeExecutionKind,
  type GenerationNodeExecutionKind,
  type GenerationNodeKind,
} from '../model/generationNodeKinds'

export const CANVAS_BATCH_CONCURRENCY_STORAGE_KEY = 'nomi.canvas.batch-concurrency'
export const DEFAULT_CANVAS_BATCH_CONCURRENCY = 6

type CanvasBatchConcurrencyStorage = Pick<Storage, 'getItem' | 'setItem'>

export function normalizeCanvasBatchConcurrency(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_CANVAS_BATCH_CONCURRENCY
  return Math.max(1, Math.min(8, Math.floor(value)))
}

function defaultStorage(): CanvasBatchConcurrencyStorage | undefined {
  return typeof window !== 'undefined' ? window.localStorage : undefined
}

export function readCanvasBatchConcurrency(storage = defaultStorage()): number {
  if (!storage) return DEFAULT_CANVAS_BATCH_CONCURRENCY
  try {
    const raw = storage.getItem(CANVAS_BATCH_CONCURRENCY_STORAGE_KEY)
    return normalizeCanvasBatchConcurrency(raw === null ? undefined : Number(raw))
  } catch {
    return DEFAULT_CANVAS_BATCH_CONCURRENCY
  }
}

export function writeCanvasBatchConcurrency(value: unknown, storage = defaultStorage()): number {
  const normalized = normalizeCanvasBatchConcurrency(value)
  try {
    storage?.setItem(CANVAS_BATCH_CONCURRENCY_STORAGE_KEY, String(normalized))
  } catch {
    // Hardened Electron sessions may block localStorage; the in-memory value still applies.
  }
  return normalized
}

export function eligibleGenerationNodeIds(
  nodes: readonly GenerationCanvasNode[],
  scope: { categoryId?: string; nodeIds?: readonly string[] } = {},
): string[] {
  const scopedIds = scope.nodeIds ? new Set(scope.nodeIds) : null
  return nodes
    .filter((node) => {
      if (scope.categoryId && (node.categoryId || 'shots') !== scope.categoryId) return false
      if (scopedIds && !scopedIds.has(node.id)) return false
      if (!getGenerationNodeExecutionKind(node.kind)) return false
      const status = node.status ?? 'idle'
      return status === 'idle' || status === 'error'
    })
    .map((node) => node.id)
}

export function shouldShowCanvasBatchGenerateDock(input: {
  readOnly: boolean
  selectedCount: number
  eligibleCount: number
}): boolean {
  return !input.readOnly && input.selectedCount === 0 && input.eligibleCount > 0
}

export type CanvasGenerationExecutionGroup = {
  executionKind: GenerationNodeExecutionKind
  nodeIds: string[]
  representativeKind: GenerationNodeKind
}

export function groupGenerationNodesByExecutionKind(
  nodes: readonly GenerationCanvasNode[],
): CanvasGenerationExecutionGroup[] {
  const groups = new Map<GenerationNodeExecutionKind, CanvasGenerationExecutionGroup>()
  for (const node of nodes) {
    const executionKind = getGenerationNodeExecutionKind(node.kind)
    if (!executionKind) continue
    const existing = groups.get(executionKind)
    if (existing) {
      existing.nodeIds.push(node.id)
      continue
    }
    groups.set(executionKind, { executionKind, nodeIds: [node.id], representativeKind: node.kind })
  }
  return [...groups.values()]
}
