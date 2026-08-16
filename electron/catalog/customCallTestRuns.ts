import crypto from 'node:crypto'
import type { JsonRecord } from '../jsonUtils'
import type { CustomCallTranscriptEntry } from './customCallRunner'
import type { ProfileKind } from './types'

export type CustomCallTestRunResult = {
  ok: boolean
  assets: string[]
  text?: string
  errorMessage?: string
  transcript: CustomCallTranscriptEntry[]
  durationMs: number
}

export type CustomCallTestRunInput = {
  runId: string
  vendorKey: string
  modelKey: string
  modeId?: string
  taskKind?: ProfileKind
  script: string
  prompt?: string
  params?: JsonRecord
}

export type CustomCallTestRunState = 'running' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled'

export type CustomCallTestRunSnapshot = {
  id: string
  vendorKey: string
  modelKey: string
  modeId?: string
  taskKind?: ProfileKind
  state: CustomCallTestRunState
  scriptDigest: string
  result?: CustomCallTestRunResult
  startedAt: string
  updatedAt: string
}

type ExecuteCustomCallTest = (
  input: CustomCallTestRunInput,
  signal: AbortSignal,
) => Promise<CustomCallTestRunResult>

const MAX_KEPT_RUNS = 50

function digestScript(script: string): string {
  return crypto.createHash('sha256').update(script).digest('hex')
}

function snapshotCopy(snapshot: CustomCallTestRunSnapshot | undefined): CustomCallTestRunSnapshot | undefined {
  return snapshot ? structuredClone(snapshot) : undefined
}

function isTerminal(state: CustomCallTestRunState): boolean {
  return state === 'succeeded' || state === 'failed' || state === 'cancelled'
}

export function createCustomCallTestRunRegistry({ execute }: { execute: ExecuteCustomCallTest }) {
  const runs = new Map<string, CustomCallTestRunSnapshot>()
  const controllers = new Map<string, AbortController>()
  const pending = new Map<string, Promise<CustomCallTestRunSnapshot>>()

  const update = (
    runId: string,
    patch: Partial<Pick<CustomCallTestRunSnapshot, 'state' | 'result'>>,
  ): CustomCallTestRunSnapshot => {
    const current = runs.get(runId)
    if (!current) throw new Error(`custom call test run not found: ${runId}`)
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() }
    runs.set(runId, next)
    return next
  }

  const prune = (): void => {
    if (runs.size < MAX_KEPT_RUNS) return
    for (const [runId, run] of runs) {
      if (!isTerminal(run.state)) continue
      runs.delete(runId)
      if (runs.size < MAX_KEPT_RUNS) return
    }
  }

  const start = (input: CustomCallTestRunInput): CustomCallTestRunSnapshot => {
    const runId = input.runId.trim()
    if (!runId) throw new Error('custom call test run id is required')
    if (runs.has(runId)) throw new Error(`custom call test run already exists: ${runId}`)
    prune()
    const now = new Date().toISOString()
    const initial: CustomCallTestRunSnapshot = {
      id: runId,
      vendorKey: input.vendorKey,
      modelKey: input.modelKey,
      ...(input.modeId ? { modeId: input.modeId } : {}),
      ...(input.taskKind ? { taskKind: input.taskKind } : {}),
      state: 'running',
      scriptDigest: digestScript(input.script),
      startedAt: now,
      updatedAt: now,
    }
    const controller = new AbortController()
    runs.set(runId, initial)
    controllers.set(runId, controller)

    const completion = Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) throw controller.signal.reason
        return execute({ ...input, runId }, controller.signal)
      })
      .then((result) => update(runId, {
        state: controller.signal.aborted ? 'cancelled' : result.ok ? 'succeeded' : 'failed',
        result,
      }))
      .catch((error) => update(runId, {
        state: controller.signal.aborted ? 'cancelled' : 'failed',
        result: {
          ok: false,
          assets: [],
          errorMessage: controller.signal.aborted
            ? 'custom call test cancelled'
            : error instanceof Error ? error.message : String(error),
          transcript: [],
          durationMs: Date.now() - Date.parse(initial.startedAt),
        },
      }))
      .finally(() => {
        controllers.delete(runId)
        pending.delete(runId)
      })
    pending.set(runId, completion)
    return snapshotCopy(initial)!
  }

  return {
    start,
    get(runId: string): CustomCallTestRunSnapshot | undefined {
      return snapshotCopy(runs.get(runId))
    },
    latest(identity: { vendorKey: string; modelKey: string; modeId?: string }): CustomCallTestRunSnapshot | undefined {
      const candidates = [...runs.values()].filter((run) =>
        run.vendorKey === identity.vendorKey &&
        run.modelKey === identity.modelKey &&
        (run.modeId ?? '') === (identity.modeId ?? ''),
      )
      return snapshotCopy(candidates.at(-1))
    },
    cancel(runId: string): CustomCallTestRunSnapshot | undefined {
      const current = runs.get(runId)
      if (!current || isTerminal(current.state)) return snapshotCopy(current)
      const next = update(runId, { state: 'cancelling' })
      controllers.get(runId)?.abort(new Error('custom call test cancelled'))
      return snapshotCopy(next)
    },
    async wait(runId: string): Promise<CustomCallTestRunSnapshot | undefined> {
      const completion = pending.get(runId)
      if (completion) await completion
      return snapshotCopy(runs.get(runId))
    },
    matchesScript(snapshot: CustomCallTestRunSnapshot, script: string): boolean {
      return snapshot.scriptDigest === digestScript(script)
    },
  }
}
