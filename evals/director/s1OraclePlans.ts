import type { DirectorPlan } from '../../src/workbench/generationCanvas/nodes/director/model/plan/directorPlanSchema'

const shot = (id: string, window: [number, number], subject: string, size: DirectorPlan['shots'][number]['size'], angle: DirectorPlan['shots'][number]['angle'], kind: DirectorPlan['shots'][number]['move']['kind'], amount?: number): DirectorPlan['shots'][number] => ({ id, window, transitionIn: 'cut', subject, size, angle, height: 'eye', move: { kind, amount: amount ?? (kind === 'orbit_right' ? 90 : undefined), speed: 'medium', easing: 'linear' } })

export const S1_ORACLE_PLANS: Record<string, DirectorPlan> = {
  'courtyard-standoff': {
    version: 2, scene: { tags: ['courtyard'], environment: 'day', template: 'courtyard', setPieces: [] },
    actors: [{ id: 'woman', kind: 'person', desc: '青衣女子', anchors: { hand: { x: 1, y: 0, z: 0 } }, placement: { relation: 'at', ref: 's1-courtyard-ground' } }, { id: 'guard', kind: 'person', desc: '黑衣侍卫', placement: { relation: 'at', ref: 's1-courtyard-gate' } }],
    blocking: [{ actor: 'woman', verb: 'walk_to', target: 'gate', window: [0, 4] }, { actor: 'guard', verb: 'sidestep', target: 'woman', window: [4, 8] }, { actor: 'woman', verb: 'stop', window: [4, 8] }, { actor: 'woman', verb: 'hold_pose', window: [4, 8], action: 'hide_object_behind_back' }],
    shots: [shot('wide', [0, 4], 'woman', '全景', 'side_rear', 'follow'), { ...shot('medium', [4, 8], 'guard', '中景', 'three_quarter', 'static'), subjects: ['woman', 'guard'] }, shot('hand', [8, 10], 'woman.hand', '特写', 'front', 'static'), { ...shot('over-shoulder', [10, 12], 'woman', '中近景', { over_shoulder: 'guard' }, 'push_in') }],
  },
  'perfume-orbit': {
    version: 2, scene: { tags: ['product'], environment: 'studio', template: 'product_stage', setPieces: [] },
    actors: [{ id: 'bottle', kind: 'product', desc: 'bottle', anchors: { cap: { x: 0, y: 1.1, z: 0 } }, placement: { relation: 'on', ref: 's1-product-pedestal' } }], blocking: [],
    shots: [shot('orbit', [0, 8], 'bottle', '特写', 'front', 'orbit_right', 360), { ...shot('push', [8, 11], 'bottle.cap', '特写', 'front', 'push_in'), transitionIn: 'continuous' }],
  },
  'police-chase': {
    version: 2, scene: { tags: ['street', 'chase'], environment: 'night', template: 'street', setPieces: [] },
    actors: [{ id: 'police_car', kind: 'vehicle', desc: 'police', placement: { relation: 'at', ref: 's1-street-ground' } }, { id: 'suspect_car', kind: 'vehicle', desc: 'suspect', placement: { relation: 'in_front_of', ref: 'police_car' } }],
    blocking: [{ actor: 'suspect_car', verb: 'drive_along', target: 'police_car', window: [0, 4] }, { actor: 'police_car', verb: 'chase', target: 'suspect_car', window: [0, 4] }],
    shots: [shot('establish', [0, 4], 'suspect_car', '全景', 'back', 'follow'), { ...shot('follow', [4, 7], 'police_car', '中景', 'three_quarter', 'pan'), transitionIn: 'cut' }, { ...shot('close', [7, 9], 'police_car', '特写', 'front', 'push_in'), transitionIn: 'cut' }],
  },
}

type PlanMove = DirectorPlan['shots'][number]['move']['kind']
const TEMPLATE_FOR_REQUIRED: Record<string, { template: 'street' | 'room' | 'courtyard' | 'product_stage'; ref: string }> = {
  ground: { template: 'room', ref: 's1-room-floor' },
  room: { template: 'room', ref: 's1-room-floor' },
  interior: { template: 'room', ref: 's1-room-floor' },
  cafe_table: { template: 'room', ref: 's1-room-floor' },
  quiet_room: { template: 'room', ref: 's1-room-floor' },
  shop_counter: { template: 'room', ref: 's1-room-floor' },
  quiet_street: { template: 'street', ref: 's1-street-ground' },
  storm_ground: { template: 'street', ref: 's1-street-ground' },
  market_street: { template: 'street', ref: 's1-street-ground' },
  courtyard: { template: 'courtyard', ref: 's1-courtyard-ground' },
}

function requiredPlan(id: string, required: string, shots: Array<{ id: string; window: [number, number]; size: DirectorPlan['shots'][number]['size']; subject?: string; kind: PlanMove; angle?: DirectorPlan['shots'][number]['angle']; amount?: number; direction?: DirectorPlan['shots'][number]['move']['direction'] }>, duration: number, actorIds: string[] = ['subject']): DirectorPlan {
  const placement = TEMPLATE_FOR_REQUIRED[required] ?? { template: 'street' as const, ref: 's1-street-ground' }
  const actors = actorIds.map((actorId, index) => ({ id: actorId, kind: 'person' as const, desc: actorId, placement: index === 0 ? { relation: 'at' as const, ref: placement.ref } : { relation: 'right_of' as const, ref: actorIds[0] } }))
  return {
    version: 2,
    scene: { tags: [id, required], environment: placement.template === 'street' ? 'night' : 'day', template: placement.template, setPieces: [{ id: required, kind: required, relation: { type: 'at', ref: placement.ref } }] },
    actors,
    blocking: [],
    shots: shots.map((item) => ({ id: item.id, window: item.window, transitionIn: 'cut' as const, subject: item.subject ?? actorIds[0], size: item.size, angle: item.angle ?? 'front', height: 'eye' as const, move: { kind: item.kind, ...(item.direction ? { direction: item.direction } : {}), ...(item.amount ? { amount: item.amount } : {}), speed: 'slow' as const, easing: 'linear' as const } })),
  }
}

const singleMotion: Record<string, { kind: PlanMove; direction?: DirectorPlan['shots'][number]['move']['direction']; angle?: DirectorPlan['shots'][number]['angle']; amount?: number }> = {
  't1-01-push': { kind: 'push_in' }, 't1-02-pull': { kind: 'pull_out' }, 't1-03-pan': { kind: 'pan', direction: 'right' },
  't1-04-tilt': { kind: 'tilt', direction: 'up' }, 't1-05-orbit': { kind: 'orbit_right', direction: 'right', amount: 360 }, 't1-06-follow': { kind: 'follow', direction: 'right' },
  't1-07-truck': { kind: 'track_right', direction: 'right' }, 't1-08-crane': { kind: 'crane_up', direction: 'up' }, 't1-09-over_shoulder': { kind: 'static', angle: { over_shoulder: 'subject' } },
  't1-10-pov': { kind: 'static', angle: { pov: 'subject' } }, 't1-11-zoom': { kind: 'zoom_in' }, 't1-12-arc': { kind: 'arc_left', direction: 'left', amount: 90 },
  't1-13-static': { kind: 'static' }, 't1-14-dolly': { kind: 'push_in' }, 't1-15-whip': { kind: 'pan', direction: 'right' }, 't1-16-rack_focus': { kind: 'static' },
}
const requiredByCard: Record<string, string> = {
  't1-01-push': 'room', 't1-02-pull': 'quiet_street', 't1-03-pan': 'interior', 't1-04-tilt': 'shop_counter', 't1-05-orbit': 'shop_counter', 't1-06-follow': 'interior', 't1-07-truck': 'quiet_street', 't1-08-crane': 'room', 't1-09-over_shoulder': 'interior', 't1-10-pov': 'interior', 't1-11-zoom': 'shop_counter', 't1-12-arc': 'quiet_street', 't1-13-static': 'room', 't1-14-dolly': 'interior', 't1-15-whip': 'quiet_street', 't1-16-rack_focus': 'shop_counter',
}
for (const [id, move] of Object.entries(singleMotion)) S1_ORACLE_PLANS[id] = requiredPlan(id, requiredByCard[id], [{ id: 'shot', window: [0, 4], size: '中景', kind: move.kind, direction: move.direction, amount: move.amount, angle: move.angle }], 4, ['subject'])

const t2Shots: Record<string, Array<{ id: string; kind: PlanMove; size: DirectorPlan['shots'][number]['size']; direction?: DirectorPlan['shots'][number]['move']['direction'] }>> = {
  't2-courtyard': [{ id: 'wide', kind: 'follow', size: '全景' }, { id: 'medium', kind: 'static', size: '中景' }, { id: 'close', kind: 'push_in', size: '特写' }],
  't2-kitchen': [{ id: 'wide', kind: 'track_right', size: '全景', direction: 'right' }, { id: 'medium', kind: 'static', size: '中景' }, { id: 'close', kind: 'push_in', size: '特写' }],
  't2-train': [{ id: 'wide', kind: 'pan', size: '远景', direction: 'right' }, { id: 'medium', kind: 'follow', size: '中景' }, { id: 'close', kind: 'pull_out', size: '特写' }],
  't2-gallery': [{ id: 'wide', kind: 'orbit_right', size: '全景', direction: 'right' }, { id: 'medium', kind: 'static', size: '中景' }, { id: 'close', kind: 'push_in', size: '特写' }],
  't2-rooftop': [{ id: 'wide', kind: 'crane_up', size: '全景', direction: 'up' }, { id: 'medium', kind: 'track_right', size: '中景', direction: 'right' }, { id: 'close', kind: 'tilt', size: '近景', direction: 'down' }],
}
for (const [id, rows] of Object.entries(t2Shots)) S1_ORACLE_PLANS[id] = requiredPlan(id, 'ground', rows.map((row, index) => ({ id: row.id, window: [index * 4, (index + 1) * 4] as [number, number], size: row.size, kind: row.kind, direction: row.direction })), 12)

const t3Specs: Record<string, { required: string; moves: [PlanMove, PlanMove, PlanMove]; actors?: string[] }> = {
  't3-storm': { required: 'storm_ground', moves: ['crane_up', 'follow', 'push_in'] },
  't3-cafe': { required: 'cafe_table', moves: ['track_right', 'static', 'push_in'], actors: ['person_a', 'person_b'] },
  't3-space': { required: 'quiet_room', moves: ['orbit_right', 'crane_up', 'pull_out'] },
  't3-market': { required: 'market_street', moves: ['follow', 'track_right', 'push_in'] },
}
for (const [id, spec] of Object.entries(t3Specs)) S1_ORACLE_PLANS[id] = requiredPlan(id, spec.required, spec.moves.map((kind, index) => ({ id: `coverage-${index}`, window: [index * 4, (index + 1) * 4] as [number, number], size: (['全景', '中景', '特写'] as const)[index], kind })), 12, spec.actors)
