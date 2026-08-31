import { AGENT_SYSTEM_SCHEMA_VERSION } from '../schema.mts'

export type AgentSystemLedgerPhase = 'plan' | 'approval' | 'effect' | 'settle'
export type AgentSystemLedgerStatus = 'pending' | 'consumed' | 'missing' | 'skipped'

export type AgentSystemLedgerEvidence = {
  version: number
  evidenceId: string
  kind: string
  label: string
  uri: string
  sha256?: string
  note?: string
}

export type AgentSystemLedgerTrace = {
  version: number
  runId: string
  caseId: string
  items: Array<{ itemId: string; kind: string; status: AgentSystemLedgerStatus }>
  effects: Array<{ effectId: string; kind: string; count: number }>
  evidence: AgentSystemLedgerEvidence[]
  notes: string[]
}

export type AgentSystemLedgerVerdict = {
  version: number
  runId: string
  caseId: string
  status: 'pass' | 'fail' | 'blocked' | 'needs_attention'
  summary: string
  findings: Array<{ id: string; status: 'pass' | 'fail' | 'blocked'; note?: string }>
}

export type AgentSystemLedgerEntry = {
  eventId: string
  seq: number
  phase: AgentSystemLedgerPhase
  kind: string
  status: AgentSystemLedgerStatus
  payload: Record<string, unknown>
}

export type AgentSystemLedgerHarness = {
  append: (entry: Omit<AgentSystemLedgerEntry, 'seq'> & { seq?: number }) => AgentSystemLedgerEntry
  duplicate: (index: number) => AgentSystemLedgerEntry
  drop: (index: number) => AgentSystemLedgerEntry | undefined
  reorder: (fromIndex: number, toIndex: number) => void
  truncateTail: (length: number) => void
  snapshot: () => readonly AgentSystemLedgerEntry[]
  replay: (visitor: (entry: AgentSystemLedgerEntry) => void) => void
  toTrace: (input: {
    runId: string
    caseId: string
    evidence?: AgentSystemLedgerEvidence[]
    notes?: string[]
  }) => AgentSystemLedgerTrace
  toVerdict: (input: {
    runId: string
    caseId: string
    status: AgentSystemLedgerVerdict['status']
    summary: string
    findings?: AgentSystemLedgerVerdict['findings']
  }) => AgentSystemLedgerVerdict
}

function cloneEntry(entry: AgentSystemLedgerEntry): AgentSystemLedgerEntry {
  return structuredClone(entry)
}

export function createEventLedgerHarness(
  initialEntries: readonly Omit<AgentSystemLedgerEntry, 'seq'>[] = [],
): AgentSystemLedgerHarness {
  let seq = 0
  let entries = initialEntries.map((entry) => cloneEntry({ ...entry, seq: ++seq }))

  function append(entry: Omit<AgentSystemLedgerEntry, 'seq'> & { seq?: number }): AgentSystemLedgerEntry {
    const next = cloneEntry({ ...entry, seq: entry.seq ?? ++seq })
    entries = [...entries, next]
    seq = Math.max(seq, next.seq)
    return cloneEntry(next)
  }

  function duplicate(index: number): AgentSystemLedgerEntry {
    const entry = entries[index]
    if (!entry) throw new Error(`Cannot duplicate missing ledger entry at index ${index}`)
    return append({ ...entry, eventId: `${entry.eventId}-duplicate`, payload: structuredClone(entry.payload) })
  }

  function drop(index: number): AgentSystemLedgerEntry | undefined {
    const entry = entries[index]
    if (!entry) return undefined
    entries = entries.filter((_, current) => current !== index)
    return cloneEntry(entry)
  }

  function reorder(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || fromIndex >= entries.length)
      throw new Error(`Cannot reorder missing ledger entry at index ${fromIndex}`)
    if (toIndex < 0 || toIndex >= entries.length) throw new Error(`Cannot reorder ledger entry to index ${toIndex}`)
    const next = [...entries]
    const [entry] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, entry)
    entries = next
  }

  function truncateTail(length: number): void {
    if (length < 0) throw new Error('Ledger tail length must be non-negative')
    entries = entries.slice(0, length)
  }

  function snapshot(): readonly AgentSystemLedgerEntry[] {
    return entries.map((entry) => cloneEntry(entry))
  }

  function replay(visitor: (entry: AgentSystemLedgerEntry) => void): void {
    for (const entry of entries) visitor(cloneEntry(entry))
  }

  function toTrace(input: {
    runId: string
    caseId: string
    evidence?: AgentSystemLedgerEvidence[]
    notes?: string[]
  }): AgentSystemLedgerTrace {
    const items = entries
      .filter((entry) => entry.phase !== 'effect')
      .map((entry) => ({
        itemId: entry.eventId,
        kind: entry.kind,
        status: entry.status,
      }))
    const effects = entries
      .filter((entry) => entry.phase === 'effect')
      .map((entry) => ({
        effectId: typeof entry.payload.effectId === 'string' ? entry.payload.effectId : entry.eventId,
        kind: entry.kind,
        count: typeof entry.payload.count === 'number' ? entry.payload.count : 1,
      }))
    return {
      version: AGENT_SYSTEM_SCHEMA_VERSION,
      runId: input.runId,
      caseId: input.caseId,
      items,
      effects,
      evidence: input.evidence ? input.evidence.map((value) => structuredClone(value)) : [],
      notes: input.notes ? [...input.notes] : [],
    }
  }

  function toVerdict(input: {
    runId: string
    caseId: string
    status: AgentSystemLedgerVerdict['status']
    summary: string
    findings?: AgentSystemLedgerVerdict['findings']
  }): AgentSystemLedgerVerdict {
    return {
      version: AGENT_SYSTEM_SCHEMA_VERSION,
      runId: input.runId,
      caseId: input.caseId,
      status: input.status,
      summary: input.summary,
      findings: input.findings ? input.findings.map((finding) => structuredClone(finding)) : [],
    }
  }

  return {
    append,
    duplicate,
    drop,
    reorder,
    truncateTail,
    snapshot,
    replay,
    toTrace,
    toVerdict,
  }
}
