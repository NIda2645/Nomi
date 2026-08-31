import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export type PermissionTier = 'full-auto' | 'confirm' | 'manual'
export type ThreadStatus = 'idle' | 'running' | 'awaiting_input' | 'interrupted' | 'failed' | 'completed'
export type TurnStatus = 'queued' | 'running' | 'awaiting_approval' | 'settling' | 'interrupted' | 'failed' | 'completed'
export type ItemKind = 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'approval' | 'receipt' | 'handoff'
export type EffectStatus = 'prepared' | 'pending' | 'done' | 'failed' | 'cancelled' | 'unknown' | 'reconciled'

export interface ProjectBinding { projectId: string; immutableProjectUuid: string; projectGeneration: number }
export interface HostPolicy { tier: PermissionTier; budget: { currency: string; limit: number; reserved: number; actual: number } }
export interface LedgerItem { itemId: string; threadId: string; turnId: string; seq: number; kind: ItemKind; status: 'started' | 'completed' | 'failed' | 'cancelled'; payload: unknown; createdAt: string }
export interface Turn { turnId: string; threadId: string; status: TurnStatus; goal: string; baseRevision: number; contextRevision: number; idempotencyKey: string; deviated: boolean; createdAt: string; updatedAt: string }
export interface Effect { operationId: string; turnId: string; idempotencyKey: string; status: EffectStatus; cost: number; authorized: boolean; createdAt: string; updatedAt: string }
export interface HostEvent { seq: number; type: string; turnId?: string; itemId?: string; operationId?: string; at: string; data?: unknown }
export interface HostState { schemaVersion: 1; binding: ProjectBinding; thread: { threadId: string; status: ThreadStatus; revision: number; contextRevision: number; nextSeq: number }; turns: Record<string, Turn>; items: LedgerItem[]; effects: Record<string, Effect>; events: HostEvent[]; policy: HostPolicy }

export class HostConflictError extends Error { readonly code = 'context_revision_conflict'; }
export class HostPolicyError extends Error { readonly code = 'policy_rejected'; }
export class HostSettlementError extends Error { readonly code = 'not_settled'; }

const now = () => new Date().toISOString()
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function initialState(binding: ProjectBinding, threadId: string, policy: HostPolicy): HostState {
  return { schemaVersion: 1, binding: clone(binding), thread: { threadId, status: 'idle', revision: 0, contextRevision: 0, nextSeq: 1 }, turns: {}, items: [], effects: {}, events: [], policy: clone(policy) }
}

/** Durable conversation and control owner. Pi/renderer are clients of this reducer, never stores of truth. */
export class ProjectAgentHost {
  private state: HostState
  private readonly file: string
  private writeTail: Promise<void> = Promise.resolve()

  private constructor(file: string, state: HostState) { this.file = file; this.state = state }

  static open(input: { rootDir: string; binding: ProjectBinding; threadId?: string; policy?: Partial<HostPolicy> }): ProjectAgentHost {
    fs.mkdirSync(input.rootDir, { recursive: true })
    const file = path.join(input.rootDir, `${input.binding.projectId}.agent-ledger.json`)
    const defaultPolicy: HostPolicy = { tier: 'confirm', budget: { currency: 'CNY', limit: 1_000_000_000_000, reserved: 0, actual: 0 } }
    let state: HostState | undefined
    try { state = JSON.parse(fs.readFileSync(file, 'utf8')) as HostState } catch { /* first open */ }
    if (state && (state.binding.immutableProjectUuid !== input.binding.immutableProjectUuid || state.binding.projectGeneration !== input.binding.projectGeneration)) throw new HostConflictError('Project binding changed')
    return new ProjectAgentHost(file, state ?? initialState(input.binding, input.threadId ?? `thread-${crypto.randomUUID()}`, { ...defaultPolicy, ...input.policy, budget: { ...defaultPolicy.budget, ...input.policy?.budget } }))
  }

  snapshot(): HostState { return clone(this.state) }

  private append(type: string, data: unknown, refs: { turnId?: string; itemId?: string; operationId?: string } = {}): void {
    const event: HostEvent = { seq: this.state.thread.nextSeq++, type, at: now(), ...refs, ...(data === undefined ? {} : { data: clone(data) }) }
    this.state.events.push(event)
  }

  private persist(): Promise<void> {
    const next = this.writeTail.then(async () => {
      const tmp = `${this.file}.${process.pid}.${crypto.randomUUID()}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(this.state), 'utf8')
      fs.renameSync(tmp, this.file)
    })
    this.writeTail = next.catch(() => undefined)
    return next
  }

  async setPolicy(policy: HostPolicy, source: 'user' | 'system' | 'tainted' = 'user'): Promise<HostState> {
    if (source === 'tainted') throw new HostPolicyError('Tainted content cannot change Host policy')
    if (!Number.isFinite(policy.budget.limit) || policy.budget.limit < 0 || policy.budget.reserved < 0 || policy.budget.actual < 0) throw new HostPolicyError('Invalid budget')
    this.state.policy = clone(policy); this.append('policy.updated', policy); return this.persist().then(() => this.snapshot())
  }

  async acceptIntent(input: { turnId?: string; goal: string; expectedContextRevision: number; idempotencyKey: string }): Promise<Turn> {
    if (input.expectedContextRevision !== this.state.thread.contextRevision) throw new HostConflictError(`Expected ${input.expectedContextRevision}, got ${this.state.thread.contextRevision}`)
    const existing = Object.values(this.state.turns).find((turn) => turn.idempotencyKey === input.idempotencyKey)
    if (existing) return Promise.resolve(clone(existing))
    const turnId = input.turnId ?? `turn-${crypto.randomUUID()}`
    const turn: Turn = { turnId, threadId: this.state.thread.threadId, status: 'running', goal: input.goal, baseRevision: this.state.thread.revision, contextRevision: ++this.state.thread.contextRevision, idempotencyKey: input.idempotencyKey, deviated: false, createdAt: now(), updatedAt: now() }
    this.state.turns[turnId] = turn; this.state.thread.status = 'running'; this.state.thread.revision += 1
    this.addItem(turnId, 'user', { goal: input.goal }, 'completed'); this.append('turn.accepted', { contextRevision: turn.contextRevision }, { turnId }); return this.persist().then(() => clone(turn))
  }

  addItem(turnId: string, kind: ItemKind, payload: unknown, status: LedgerItem['status'] = 'started', itemId = `item-${crypto.randomUUID()}`): LedgerItem {
    if (!this.state.turns[turnId]) throw new HostConflictError('Unknown turn')
    const item: LedgerItem = { itemId, threadId: this.state.thread.threadId, turnId, seq: this.state.thread.nextSeq, kind, status, payload: clone(payload), createdAt: now() }
    this.state.items.push(item); this.append(`item.${status}`, { kind }, { turnId, itemId }); return clone(item)
  }

  async markDeviated(turnId: string, reason: string): Promise<Turn> {
    const turn = this.state.turns[turnId]; if (!turn) throw new HostConflictError('Unknown turn')
    turn.deviated = true; turn.updatedAt = now(); this.append('turn.deviated', { reason }, { turnId }); return this.persist().then(() => clone(turn))
  }

  async beginEffect(input: { turnId: string; operationId: string; idempotencyKey: string; cost?: number }): Promise<Effect> {
    const existing = this.state.effects[input.operationId] ?? Object.values(this.state.effects).find((effect) => effect.idempotencyKey === input.idempotencyKey)
    if (existing) return Promise.resolve(clone(existing))
    const cost = input.cost ?? 0
    const auto = this.state.policy.tier === 'full-auto'
    if (auto && this.state.policy.budget.reserved + this.state.policy.budget.actual + cost > this.state.policy.budget.limit) throw new HostPolicyError('Budget exceeded; confirmation required')
    const effect: Effect = { operationId: input.operationId, turnId: input.turnId, idempotencyKey: input.idempotencyKey, status: 'pending', cost, authorized: auto, createdAt: now(), updatedAt: now() }
    this.state.effects[effect.operationId] = effect; if (auto) this.state.policy.budget.reserved += cost; this.append('effect.pending', { cost, authorized: auto }, { turnId: input.turnId, operationId: effect.operationId }); return this.persist().then(() => clone(effect))
  }

  async authorizeEffect(operationId: string): Promise<Effect> {
    const effect = this.state.effects[operationId]; if (!effect) throw new HostConflictError('Unknown effect')
    if (effect.status !== 'pending') return Promise.resolve(clone(effect))
    if (this.state.policy.budget.reserved + this.state.policy.budget.actual + effect.cost > this.state.policy.budget.limit) throw new HostPolicyError('Budget exceeded; confirmation required')
    effect.authorized = true; effect.updatedAt = now(); this.state.policy.budget.reserved += effect.cost; this.addItem(effect.turnId, 'approval', { operationId, tier: this.state.policy.tier }, 'completed'); this.append('effect.authorized', undefined, { turnId: effect.turnId, operationId }); return this.persist().then(() => clone(effect))
  }

  async settleEffect(operationId: string, status: Exclude<EffectStatus, 'prepared' | 'pending'>): Promise<Effect> {
    const effect = this.state.effects[operationId]; if (!effect) throw new HostConflictError('Unknown effect')
    if (effect.status === 'done' || effect.status === 'failed' || effect.status === 'cancelled' || effect.status === 'reconciled') return Promise.resolve(clone(effect))
    effect.status = status; effect.updatedAt = now(); this.state.policy.budget.reserved = Math.max(0, this.state.policy.budget.reserved - effect.cost); if (status === 'done' || status === 'reconciled') this.state.policy.budget.actual += effect.cost
    this.append('effect.settled', { status }, { turnId: effect.turnId, operationId }); return this.persist().then(() => clone(effect))
  }

  async interrupt(turnId: string): Promise<Turn> { return this.transition(turnId, 'interrupted', 'turn.interrupted') }
  async steer(turnId: string, goal: string): Promise<Turn> { const turn = this.state.turns[turnId]; if (!turn) throw new HostConflictError('Unknown turn'); turn.goal = goal; turn.updatedAt = now(); this.append('turn.steered', { goal }, { turnId }); return this.persist().then(() => clone(turn)) }
  async resume(turnId: string): Promise<Turn> { return this.transition(turnId, 'running', 'turn.resumed') }
  async continueTurn(turnId: string, expectedContextRevision: number): Promise<Turn> { const turn = this.state.turns[turnId]; if (!turn || turn.contextRevision !== expectedContextRevision) throw new HostConflictError('Stale context revision'); return this.resume(turnId) }

  private async transition(turnId: string, status: TurnStatus, event: string): Promise<Turn> { const turn = this.state.turns[turnId]; if (!turn) throw new HostConflictError('Unknown turn'); turn.status = status; turn.updatedAt = now(); if (status === 'running') this.state.thread.status = 'running'; else if (status === 'interrupted' || status === 'failed' || status === 'completed') this.state.thread.status = status; this.append(event, undefined, { turnId }); return this.persist().then(() => clone(turn)) }

  /** Low-level loop completion never completes a turn; all effects/items must settle first. */
  async settleTurn(turnId: string): Promise<Turn> {
    const turn = this.state.turns[turnId]; if (!turn) throw new HostConflictError('Unknown turn')
    const pendingEffects = Object.values(this.state.effects).some((effect) => effect.turnId === turnId && ['pending', 'prepared', 'unknown'].includes(effect.status))
    const pendingItems = this.state.items.some((item) => item.turnId === turnId && item.status === 'started')
    if (pendingEffects || pendingItems) { turn.status = 'settling'; this.append('execution.waiting_settlement', { pendingEffects, pendingItems }, { turnId }); return this.persist().then(() => { throw new HostSettlementError('Execution has not settled') }) }
    turn.status = 'completed'; turn.updatedAt = now(); this.state.thread.status = 'completed'; this.append('execution_settled', undefined, { turnId }); this.append('turn.completed', undefined, { turnId }); return this.persist().then(() => clone(turn))
  }
}
