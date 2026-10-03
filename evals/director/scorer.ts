import type { DirectorObject, DirectorProject, DirectorScene } from '../../src/workbench/generationCanvas/nodes/director/model/directorTypes'
import { measureContinuity, recognizeCameraMotion, sampleDirectorProject, type DirectorMeasurements } from '../../src/workbench/generationCanvas/nodes/director/model/directorEvalMeasurement'
import type { DirectorCard } from './cardSchema'

export type LayerScores = { L0: number; L1: number; L2: number; L3: number; L4: number; L5: 'unverified' }
export type CardScore = { cardId: string; scores: LayerScores; total: number; reasons: string[]; measurements: DirectorMeasurements }
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol
const MOTION_RULES = new Set(['push','pull','pan','tilt','orbit','follow','truck','crane','zoom','arc','static','dolly','whip','rack_focus','over_shoulder','pov'])
const ACTION_RULES = new Set(['walk_to','run_to','stop','sidestep_block','drive_along','chase','hide_object_behind_back','hold_pose'])
const shotAliases: Record<string, string> = { wide:'全景', medium:'中景', close:'特写' }
const motionAliases: Record<string, string> = { push:'push_in', pull:'pull_out', truck:'track', crane:'crane', zoom:'zoom', arc:'orbit', dolly:'push_in', whip:'pan', rack_focus:'static', over_shoulder:'static', pov:'static' }

function resolveActors(card: DirectorCard, scene: DirectorScene, actorMap?: Record<string,string>): Record<string,string | undefined> {
  const out: Record<string,string | undefined> = {}, used = new Set<string>()
  for (const actor of card.actors) {
    const explicit = actorMap?.[actor.id]
    if (explicit && scene.objects.some(o => o.id === explicit)) { out[actor.id] = explicit; used.add(explicit); continue }
    const names = [actor.id, ...actor.aliases].map(v => v.toLowerCase())
    const named = scene.objects.filter(o => !used.has(o.id) && names.some(n => o.id.toLowerCase() === n || o.name.toLowerCase() === n || o.name.toLowerCase().includes(n)))
    const candidate = named.length === 1 ? named[0] : named.find(o => actor.category === 'person' ? o.type === 'character' : actor.category === o.type)
    out[actor.id] = candidate?.id
    if (candidate) used.add(candidate.id)
  }
  return out
}
function actorSamples(m: DirectorMeasurements, id: string, window: [number,number]) { return m.frames.filter(f => f.time >= window[0] - 1e-4 && f.time <= window[1] + 1e-4).map(f => f.objects[id]).filter(Boolean) }
function distance2(a: {position:{x:number;z:number}}, b:{position:{x:number;z:number}}) { return Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z) }
function findObject(scene: DirectorScene, key: string): DirectorObject | undefined { const needle=key.toLowerCase(); return scene.objects.find(o => o.id.toLowerCase()===needle || o.name.toLowerCase()===needle || o.name.toLowerCase().includes(needle)) }

export function scoreBlocking(card: DirectorCard, m: DirectorMeasurements, scene: DirectorScene, actorMap: Record<string,string|undefined>, reasons: string[]): number {
  if (!card.blocking.length) return 1
  let good = 0
  for (const action of card.blocking) {
    if (!ACTION_RULES.has(action.verb)) throw new Error(`card ${card.id}: no scoring predicate for blocking verb ${action.verb}`)
    const id = actorMap[action.actor], window = action.window ?? [0,m.duration] as [number,number]
    if (!id) { reasons.push(`缺少演员 ${action.actor}`); continue }
    const samples = actorSamples(m,id,window), first=samples[0], last=samples.at(-1)
    let ok = false
    if (first && last && ['walk_to','run_to'].includes(action.verb)) { const target=action.target ? findObject(scene,action.target) : undefined; const moved=distance2(first,last) >= .5; const arrived=!!target && Math.hypot(last.position.x-target.position.x,last.position.z-target.position.z) <= 2.5; ok=moved&&arrived }
    else if (first && last && action.verb==='stop') { const speeds=samples.slice(1).map((s,i)=>distance2(s,samples[i])/Math.max(.001,window[1]-window[0])); ok=speeds.every(v=>v<.1) }
    else if (first && last && action.verb==='sidestep_block') { const moved=Math.abs(last.position.x-first.position.x)>=.5; const target=action.between?.[1] ? findObject(scene,action.between[1]) : undefined; const nearTarget=!!target && Math.hypot(last.position.x-target.position.x,last.position.z-target.position.z)<=2.5; ok=moved&&nearTarget }
    else if (first && last && action.verb==='drive_along') ok=distance2(first,last)>=.5
    else if (first && last && action.verb==='chase') { const targetId=action.target ? actorMap[action.target] : undefined; const targetSamples=targetId ? actorSamples(m,targetId,window) : []; const startDist=targetSamples[0]&&first ? distance2(first,targetSamples[0]) : Infinity; const endDist=targetSamples.at(-1)&&last ? distance2(last,targetSamples.at(-1)!) : Infinity; ok=distance2(first,last)>=.5 && endDist <= startDist + 1 }
    else if (action.verb==='hide_object_behind_back' || action.verb==='hold_pose') { ok=(scene.objects.find(o=>o.id===id)?.actionClips ?? []).some(c=>c.startTime <= window[1] && c.endTime >= window[0] && (c.name+String(c.actionPose)).toLowerCase().includes(action.verb==='hide_object_behind_back'?'hide':'hold')) }
    if (ok) good++; else reasons.push(`${action.actor} 的动作 ${action.verb} 未在时间窗达成`)
  }
  return good / card.blocking.length
}

function actualShotWindows(m: DirectorMeasurements): [number,number][] { const out:[number,number][]=[]; let start=0, current=m.frames[0]?.cameraId ?? null; for(const frame of m.frames.slice(1)){ if(frame.cameraId!==current){ if(current!==null) out.push([start,frame.time]); start=frame.time; current=frame.cameraId } } if(current!==null&&m.frames.length) out.push([start,m.duration]); return out.filter(([a,b])=>b>a+1e-4) }
function alignedShotWindows(card: DirectorCard, m: DirectorMeasurements, reasons: string[]): [number,number][] { const explicit=card.shots.map(s=>s.t).filter((t): t is [number,number]=>!!t); if(explicit.length===card.shots.length) return explicit; const actual=actualShotWindows(m); if(actual.length>=card.shots.length){ reasons.push('镜头时间窗按节目机位顺序对齐'); return actual.slice(0,card.shots.length) } const d=m.duration/Math.max(1,card.shots.length); reasons.push('镜头时间窗按总时长等分对齐'); return card.shots.map((_,i)=>[i*d,(i+1)*d]) }
function intervalIoU(a:[number,number], b:[number,number]) { const inter=Math.max(0,Math.min(a[1],b[1])-Math.max(a[0],b[0])), union=Math.max(a[1],b[1])-Math.min(a[0],b[0]); return union>0?inter/union:0 }
function scoreStructure(card: DirectorCard, m: DirectorMeasurements, reasons: string[]): number { const expected=alignedShotWindows(card,m,reasons), actual=actualShotWindows(m); const count=Math.min(1, actual.length/Math.max(1,card.minCount ?? card.shots.length)); const iou=expected.reduce((sum,w)=>sum+Math.max(...actual.map(a=>intervalIoU(w,a)),0),0)/Math.max(1,expected.length); if(card.duration?.total!==undefined&&!near(m.duration,card.duration.total,card.duration.tol)) reasons.push(`总时长 ${m.duration.toFixed(1)}s 与 ${card.duration.total}s 偏差超过容差`); return (count+iou)/2 }
function moveMatches(expected:string, actual:string): boolean {
  const e=motionAliases[expected] ?? expected
  if(e==='orbit') return actual==='orbit_left'||actual==='orbit_right'
  if(e==='track') return actual==='track_left'||actual==='track_right'
  if(e==='push_in') return actual==='push_in'
  if(e==='pull_out') return actual==='pull_out'
  if(e==='crane') return actual==='crane_up'||actual==='crane_down'
  if(e==='pan') return actual==='pan'
  if(e==='static') return actual==='static'
  if(e==='zoom') return actual==='static' // zoom is judged from FOV in a future finer predicate; static position is required here.
  if(expected==='follow') return actual==='follow'
  return actual===e
}
function scoreMotionAndFraming(card: DirectorCard, m: DirectorMeasurements, actorMap: Record<string,string|undefined>, reasons: string[]): number { if(!card.shots.length)return 1; const windows=alignedShotWindows(card,m,reasons); let total=0,count=0; for(const [i,shot] of card.shots.entries()){ const [start,end]=windows[i]??[0,m.duration]; const subject=shot.subject?.split('.')[0]??shot.subjects?.[0]; const objectId=subject?actorMap[subject]:Object.values(actorMap)[0]; if(shot.move&&objectId){ const actual=recognizeCameraMotion(m,objectId,{start,end}).move; const ok=moveMatches(shot.move,actual); total+=ok?1:0;count++;if(!ok)reasons.push(`${start}-${end}s 运镜识别为 ${actual}，卡要求 ${shot.move}`); if(shot.sweepDeg!==undefined){const amp=Math.abs(recognizeCameraMotion(m,objectId,{start,end}).signedOrbitDeg),tol=shot.tolDeg??20;total+=near(amp,shot.sweepDeg,tol)?1:0;count++;if(!near(amp,shot.sweepDeg,tol))reasons.push(`环绕幅度 ${amp.toFixed(0)}°，目标 ${shot.sweepDeg}°`)}} if(!objectId && (shot.subject || shot.subjects?.length)){ count++; reasons.push(`缺少镜头主体 ${subject ?? 'unknown'}`) } if(objectId){const frames=m.frames.filter(f=>f.time>=start-1e-4&&(f.time<end-1e-4||end>=m.duration-1e-4)), visible=frames.filter(f=>f.objects[objectId]?.projection?.inFrame).length/Math.max(1,frames.length);total+=visible;count++;if(visible<.95)reasons.push(`${start}-${end}s 主体出画 ${Math.round((1-visible)*100)}% 帧`);if(shot.size){const sizes=frames.map(f=>f.objects[objectId]?.shotSize).filter(Boolean);const expected=shotAliases[shot.size]??shot.size;const hit=sizes.filter(s=>s===expected||(shot.size==='全景'&&s==='中景')||(shot.size==='中近景'&&s==='近景')).length/Math.max(1,sizes.length);total+=hit;count++;if(hit<.85)reasons.push(`${start}-${end}s 景别命中率 ${Math.round(hit*100)}%`)}} } return count?total/count:1 }
function scoreScene(card: DirectorCard, scene: DirectorScene, reasons: string[]): number { if(!card.scene.required.length)return 1;let hit=0;for(const required of card.scene.required){const names=[required,...(card.scene.aliases[required]??[])].map(v=>v.toLowerCase());const found=scene.objects.some(o=>names.some(n=>o.id.toLowerCase()===n||o.name.toLowerCase()===n||o.name.toLowerCase().includes(n))||(required==='ground'&&o.type==='plane'));if(found)hit++;else reasons.push(`场景缺少 ${required}`)}return hit/card.scene.required.length }
export function scoreCard(card: DirectorCard, project: DirectorProject, actorMap?: Record<string,string>): CardScore { const scene=project.scenes.find(s=>s.id===project.activeSceneId)??project.scenes[0];const m=sampleDirectorProject(project,{duration:card.duration?.total??undefined});const reasons:string[]=[];const continuity=measureContinuity(m,scene);const l0=continuity.length?0:1;if(continuity.length)reasons.push(...continuity.slice(0,5).map(i=>i.message));const actors=resolveActors(card,scene,actorMap);const l1=scoreStructure(card,m,reasons),l2=scoreMotionAndFraming(card,m,actors,reasons),l3=scoreBlocking(card,m,scene,actors,reasons),l4=scoreScene(card,scene,reasons);const total=(l1*.15+l2*.4+l3*.25+l4*.1)/.9;return{cardId:card.id,scores:{L0:l0,L1:l1,L2:l2,L3:l3,L4:l4,L5:'unverified'},total,reasons,measurements:m} }
export const scorerConfig = { motionRules: [...MOTION_RULES], actionRules: [...ACTION_RULES] }
