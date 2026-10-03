import type { DirectorPlan } from '../../src/workbench/generationCanvas/nodes/director/model/plan/directorPlanSchema'

const shot = (id: string, window: [number, number], subject: string, size: DirectorPlan['shots'][number]['size'], angle: DirectorPlan['shots'][number]['angle'], kind: DirectorPlan['shots'][number]['move']['kind']): DirectorPlan['shots'][number] => ({ id, window, transitionIn: 'cut', subject, size, angle, height: 'eye', move: { kind, amount: kind === 'orbit_right' ? 90 : undefined, speed: 'medium', easing: 'linear' } })

export const S1_ORACLE_PLANS: Record<string, DirectorPlan> = {
  'courtyard-standoff': {
    version: 2, scene: { tags: ['courtyard'], environment: 'day', template: 'courtyard', setPieces: [] },
    actors: [{ id: 'a', kind: 'person', desc: 'a', placement: { relation: 'at', ref: 's1-courtyard-ground' } }, { id: 'b', kind: 'person', desc: 'b', placement: { relation: 'right_of', ref: 'a' } }],
    blocking: [{ actor: 'a', verb: 'walk_to', target: 'b', window: [0, 3] }],
    shots: [shot('wide', [0, 2], 'a', '全景', 'front', 'static'), shot('orbit', [2, 5], 'b', '中景', 'three_quarter', 'orbit_right')],
  },
  'perfume-orbit': {
    version: 2, scene: { tags: ['product'], environment: 'studio', template: 'product_stage', setPieces: [] },
    actors: [{ id: 'perfume', kind: 'product', desc: 'perfume', placement: { relation: 'at', ref: 's1-product-pedestal' } }], blocking: [],
    shots: [shot('orbit', [0, 5], 'perfume', '特写', 'front', 'orbit_right')],
  },
  'police-chase': {
    version: 2, scene: { tags: ['street', 'chase'], environment: 'night', template: 'street', setPieces: [] },
    actors: [{ id: 'police', kind: 'vehicle', desc: 'police car', placement: { relation: 'at', ref: 's1-street-ground' } }, { id: 'runner', kind: 'person', desc: 'runner', placement: { relation: 'in_front_of', ref: 'police' } }],
    blocking: [{ actor: 'runner', verb: 'run_to', target: 'police', window: [0, 4] }, { actor: 'police', verb: 'chase', target: 'runner', window: [0, 4] }],
    shots: [shot('establish', [0, 2], 'runner', '远景', 'back', 'static'), { ...shot('follow', [2, 6], 'runner', '中景', 'three_quarter', 'follow'), transitionIn: 'continuous' }],
  },
}
