import { describe, expect, it } from 'vitest'
import { directorPlanSchema, normalizeDirectorPlan, parseDirectorPlan } from './directorPlanSchema'

const valid = { version: 2, scene: { tags: ['street'], environment: 'day', template: 'street', setPieces: [] }, actors: [{ id: 'hero', kind: 'person', desc: 'hero', placement: { relation: 'at', ref: 's1-street-ground' } }], blocking: [], shots: [{ id: 'shot-1', window: [0, 2], transitionIn: 'cut', subject: 'hero', size: '中景', angle: 'front', height: 'eye', move: { kind: 'static', speed: 'slow', easing: 'linear' } }] }

describe('director plan v2 schema', () => {
  it('accepts intent without coordinates', () => expect(directorPlanSchema.parse(valid).shots[0].size).toBe('中景'))
  it('rejects coordinates and reversed windows', () => {
    const bad = { ...valid, shots: [{ ...valid.shots[0], window: [2, 1], position: { x: 1, y: 2, z: 3 } }] }
    expect(directorPlanSchema.safeParse(bad).success).toBe(false)
  })
  it('rejects an unknown subject', () => expect(directorPlanSchema.safeParse({ ...valid, shots: [{ ...valid.shots[0], subject: 'missing' }] }).success).toBe(false))
  it('normalizes mixed-language enum synonyms before validation', () => {
    const normalized = normalizeDirectorPlan({
      ...valid,
      scene: { ...valid.scene, environment: '白天', template: '室内' },
      actors: [{ ...valid.actors[0], kind: '人物', placement: { relation: '右侧', ref: 's1-room-floor' } }],
      shots: [{ ...valid.shots[0], size: 'medium', transitionIn: 'CUT', move: { ...valid.shots[0].move, kind: 'push' } }],
    })
    const result = parseDirectorPlan(normalized)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.shots[0].move.kind).toBe('push_in')
  })
  it('keeps unknown enum values visible to zod', () => {
    const result = parseDirectorPlan({ ...valid, scene: { ...valid.scene, environment: 'mars' } })
    expect(result.success).toBe(false)
  })
})
