import type { DirectorCard } from '../cardSchema'
import { scoreCard } from '../scorer'
import { recognizeCameraMotion } from '../../../src/workbench/generationCanvas/nodes/director/model/directorEvalMeasurement'
import type { AdaptedProject } from '../adapters'
import type { VisualReview } from './schema'

export type CrossCheck = { checked: number; consistent: number; consistency: number | null; disagreements: Array<{ claim: string; expected: string; observed: string }> }

export function crossCheck(card: DirectorCard, adapted: AdaptedProject, review: VisualReview | undefined): CrossCheck {
  if (!review) return { checked: 0, consistent: 0, consistency: null, disagreements: [] }
  const measured = scoreCard(card, adapted.project, adapted.actorMap).measurements
  const disagreements: CrossCheck['disagreements'] = []
  let checked = 0
  let consistent = 0
  for (const claim of review.measurableClaims) {
    checked += 1
    if (claim.kind === 'cut_count') {
      const expected = String(measured.cuts.length)
      if (claim.value.match(/\d+/)?.[0] === expected) consistent += 1
      else disagreements.push({ claim: claim.value, expected, observed: claim.timecode })
    } else if (claim.kind === 'direction') {
      const subjectId = Object.keys(measured.frames[0]?.objects ?? {})[0]
      const expected = subjectId ? recognizeCameraMotion(measured, subjectId, { start: 0, end: measured.duration }).move : 'unknown'
      if (claim.value.toLowerCase().includes(expected.toLowerCase())) consistent += 1
      else disagreements.push({ claim: claim.value, expected, observed: claim.timecode })
    } else {
      disagreements.push({ claim: claim.value, expected: 'manual review', observed: claim.timecode })
    }
  }
  return { checked, consistent, consistency: checked ? consistent / checked : null, disagreements }
}
