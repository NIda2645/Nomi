import type { DirectorProject, DirectorScene } from '../../src/workbench/generationCanvas/nodes/director/model/directorTypes'
import { measureContinuity, recognizeCameraMotion, sampleDirectorProject, type DirectorMeasurements } from '../../src/workbench/generationCanvas/nodes/director/model/directorEvalMeasurement'
import type { DirectorCard } from './cardSchema'

export type LayerScores = { L0: number; L1: number; L2: number; L3: number; L4: number; L5: 'unverified' }
export type CardScore = { cardId: string; scores: LayerScores; total: number; reasons: string[]; measurements: DirectorMeasurements }
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol
const sizeAliases: Record<string, string> = { wide:'全景', medium:'中景', close:'特写', push:'push_in', pull:'pull_out', pan:'pan', tilt:'tilt', orbit:'orbit', follow:'follow', truck:'track_right', crane:'crane_up', static:'static' }
function resolveActors(card: DirectorCard, scene: DirectorScene, actorMap?: Record<string,string>): Record<string,string | undefined> {
  const out: Record<string,string | undefined> = {}, used = new Set<string>()
  for (const actor of card.actors) {
    const explicit = actorMap?.[actor.id]
    if (explicit && scene.objects.some(o => o.id === explicit)) { out[actor.id] = explicit; used.add(explicit); continue }
    const match = scene.objects.find(o => !used.has(o.id) && (o.name.toLowerCase().includes(actor.id.toLowerCase()) || o.type === actor.category || (actor.category === 'person' && o.type === 'character') || (actor.category === 'product' && ['model','cube','cylinder'].includes(o.type))))
    out[actor.id] = match?.id; if (match) used.add(match.id)
  }
  return out
}
function shotFrames(measurements: DirectorMeasurements, start: number, end: number) { return measurements.frames.filter(f => f.time >= start - 1e-4 && f.time <= end + 1e-4) }
function scoreStructure(card: DirectorCard, m: DirectorMeasurements, reasons: string[]): number {
  if (!card.shots.length) return 1
  const expected = card.shots.filter(s => s.t).map(s => s.t!)
  const actualDuration = m.duration
  if (card.duration?.total !== undefined && !near(actualDuration, card.duration.total, card.duration.tol)) reasons.push(`总时长 ${actualDuration.toFixed(1)}s 与 ${card.duration.total}s 偏差超过容差`)
  const countScore = Math.min(1, m.cuts.length + 1 >= (card.minCount ?? card.shots.length) ? 1 : (m.cuts.length + 1) / Math.max(1, card.minCount ?? card.shots.length))
  const timeScore = expected.length ? expected.reduce((sum, [a,b]) => sum + (shotFrames(m,a,b).length ? 1 : 0), 0) / expected.length : 1
  return (countScore + timeScore) / 2
}
function scoreMotionAndFraming(card: DirectorCard, m: DirectorMeasurements, actorMap: Record<string,string|undefined>, reasons: string[]): number {
  if (!card.shots.length) return 1
  let total = 0, count = 0
  for (const shot of card.shots) {
    const [start,end] = shot.t ?? [0,m.duration]
    const subject = shot.subject?.split('.')[0] ?? shot.subjects?.[0]
    const objectId = subject ? actorMap[subject] : Object.values(actorMap)[0]
    if (shot.move && objectId) {
      const actual = recognizeCameraMotion(m, objectId, {start,end}).move
      const expected = sizeAliases[shot.move] ?? shot.move
      const ok = actual === expected || (expected === 'orbit' && String(actual).startsWith('orbit')) || (expected === 'follow' && (actual === 'follow' || actual === 'track_left' || actual === 'track_right' || actual === 'push_in')) || (expected === 'pan' && (actual === 'pan' || actual === 'track_left' || actual === 'track_right' || actual === 'push_in')) || (expected === 'static' && actual === 'static') || (expected === 'push' && actual === 'push_in') || (expected === 'pull' && actual === 'pull_out') || (expected === 'track_right' && actual === 'track_left')
      total += ok ? 1 : 0; count++
      if (!ok) reasons.push(`${start}-${end}s 运镜识别为 ${actual}，卡要求 ${shot.move}`)
      if (shot.sweepDeg !== undefined) { const motion = recognizeCameraMotion(m, objectId, {start,end}); const tol = shot.tolDeg ?? 20; const amp = Math.abs(motion.signedOrbitDeg); total += near(amp, shot.sweepDeg, tol) ? 1 : 0; count++; if (!near(amp, shot.sweepDeg, tol)) reasons.push(`环绕幅度 ${amp.toFixed(0)}°，目标 ${shot.sweepDeg}°`) }
    }
    if (objectId) {
      const frames = shotFrames(m,start,end), visible = frames.filter(f => f.objects[objectId]?.projection?.inFrame).length / Math.max(1, frames.length)
      total += visible; count++
      if (visible < .95) reasons.push(`${start}-${end}s 主体出画 ${Math.round((1-visible)*100)}% 帧`)
      if (shot.size) { const sizes = frames.map(f => f.objects[objectId]?.shotSize).filter(Boolean); const hit = sizes.filter(s => s === shot.size || s === sizeAliases[shot.size] || (shot.size === '全景' && s === '中景') || (shot.size === '中近景' && s === '近景')).length / Math.max(1,sizes.length); total += hit; count++; if (hit < .85) reasons.push(`${start}-${end}s 景别命中率 ${Math.round(hit*100)}%`) }
    }
  }
  return count ? total / count : 1
}
function scoreBlocking(card: DirectorCard, m: DirectorMeasurements, scene: DirectorScene, actorMap: Record<string,string|undefined>, reasons: string[]): number {
  if (!card.blocking.length) return 1
  let good = 0
  for (const action of card.blocking) {
    const id = actorMap[action.actor]
    if (!id) { reasons.push(`缺少演员 ${action.actor}`); continue }
    const frames = shotFrames(m, ...(action.window ?? [0,m.duration]))
    const samples = frames.map(f => f.objects[id]).filter(Boolean)
    let ok = samples.length > 0
    if (action.verb === 'stop') { const speeds = samples.slice(1).map((s,i) => Math.hypot(s.position.x-samples[i].position.x,s.position.z-samples[i].position.z)); ok = speeds.every(v => v < .05) }
    if (action.verb === 'walk_to' && action.target) { const target = scene.objects.find(o => o.name.toLowerCase().includes(action.target!.toLowerCase()) || o.id === action.target); const last = samples.at(-1); ok = !!target && !!last && Math.hypot(last.position.x-target.position.x,last.position.z-target.position.z) <= 2.5 }
    if (action.verb === 'sidestep_block' && action.between?.[1]) { const target = scene.objects.find(o => o.id === action.between![1] || o.name.includes(action.between![1])); const last = samples.at(-1); ok = !!target && !!last && Math.hypot(last.position.x-target.position.x,last.position.z-target.position.z) <= 2.5 }
    if (ok) good++; else reasons.push(`${action.actor} 的动作 ${action.verb} 未在时间窗达成`)
  }
  return good / card.blocking.length
}
function scoreScene(card: DirectorCard, scene: DirectorScene, reasons: string[]): number {
  if (!card.scene.required.length) return 1
  let hit = 0
  for (const required of card.scene.required) {
    const found = scene.objects.some(o => o.name.toLowerCase().includes(required.toLowerCase()) || o.type === required || (required === 'ground' && o.type === 'plane') || (required === 'bottle' && ['cylinder','model'].includes(o.type)))
    if (found) hit++; else reasons.push(`场景缺少 ${required}`)
  }
  return hit / card.scene.required.length
}
export function scoreCard(card: DirectorCard, project: DirectorProject, actorMap?: Record<string,string>): CardScore {
  const scene = project.scenes.find(s => s.id === project.activeSceneId) ?? project.scenes[0]
  const m = sampleDirectorProject(project, { duration: card.duration?.total ?? undefined })
  const reasons: string[] = []
  const continuity = measureContinuity(m, scene)
  const l0 = continuity.length ? 0 : 1
  if (continuity.length) reasons.push(...continuity.slice(0,5).map(i => i.message))
  const actors = resolveActors(card, scene, actorMap)
  const l1 = scoreStructure(card,m,reasons), l2 = scoreMotionAndFraming(card,m,actors,reasons), l3 = scoreBlocking(card,m,scene,actors,reasons), l4 = scoreScene(card,scene,reasons)
  const weighted = l1*.15 + l2*.4 + l3*.25 + l4*.1
  const total = weighted / .9
  return { cardId: card.id, scores:{L0:l0,L1:l1,L2:l2,L3:l3,L4:l4,L5:'unverified'}, total, reasons, measurements:m }
}
