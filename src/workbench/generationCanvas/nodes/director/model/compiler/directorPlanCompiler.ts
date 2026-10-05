import { createDefaultProject } from '../directorProject'
import { originYForBottom, originYForCenter, scaledBounds } from '../directorSpace'
import type { SpatialAuditContext } from '../directorSpatialAudit'
import { syncInTimeline } from '../timeGrid'
import {
  distanceForShotSize,
  measureContinuity,
  sampleDirectorProject,
  type AnchorSpec,
  type ShotLadder,
} from '../directorEvalMeasurement'
import type { DirectorCamera, DirectorObject, DirectorProject, Vec3, Waypoint } from '../directorTypes'
import type { EvalShotSize } from '../../../../../../../electron/shared/director/vocab'
import { evaluateEntityTransform } from '../trajectoryEval'
import { findActionEntry } from '../actionLibrary'
import { lookAtAngles } from '../vec3'
import {
  directorPlanSchema,
  type DirectorPlan,
  type DirectorPlanActor,
  type DirectorPlanShot,
} from '../../../../../../../electron/shared/director/directorPlanSchema'
import { actorBody, buildStage, type Stage } from './directorStage'

const FPS = 30
const v = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z })
const add = (a: Vec3, b: Vec3): Vec3 => v(a.x + b.x, a.y + b.y, a.z + b.z)
const sub = (a: Vec3, b: Vec3): Vec3 => v(a.x - b.x, a.y - b.y, a.z - b.z)
const clip = (id: string, start: number, end: number) => ({
  id,
  startTime: start,
  endTime: end,
  startFrame: Math.round(start * FPS),
  endFrame: Math.round(end * FPS),
})
const wp = (id: string, position: Vec3, target: Vec3, time: number, fov = 45): Waypoint => ({
  id,
  ...position,
  ...lookAtAngles(position, target),
  time,
  frameIndex: Math.round(time * FPS),
  fov,
})
const entityWp = (id: string, position: Vec3, time: number, yaw = 0): Waypoint => ({
  id,
  ...position,
  yaw,
  pitch: 0,
  roll: 0,
  time,
  frameIndex: Math.round(time * FPS),
})
function reflectAcrossAxis(point: Vec3, a: Vec3, b: Vec3): Vec3 {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    length2 = dx * dx + dz * dz
  if (length2 < 1e-6) return point
  const t = ((point.x - a.x) * dx + (point.z - a.z) * dz) / length2
  const projection = { x: a.x + t * dx, y: point.y, z: a.z + t * dz }
  return v(2 * projection.x - point.x, point.y, 2 * projection.z - point.z)
}
function positionAt(object: DirectorObject, time: number): Vec3 {
  return evaluateEntityTransform(object, time).position
}

export type DirectorCompileIssue = {
  kind: 'unknown-ref' | 'overlap' | 'measurement' | 'missing_asset' | 'nominal-size'
  message: string
  time?: number
  objectId?: string
  actorId?: string
  assetId?: string
}
export type DirectorCompileResult =
  | {
      ok: true
      project: DirectorProject
      actorMap: Record<string, string>
      anchors: Record<string, AnchorSpec>
      issues: DirectorCompileIssue[]
      duration: number
      /** 物理判据需要的计划信息（谁拍谁、谁拿着什么），评测打分用。 */
      spatial: SpatialAuditContext
    }
  | { ok: false; errors: string[] }

function actorObject(actor: DirectorPlanActor, plan: DirectorPlan, position: Vec3, id: string): DirectorObject {
  const body = actorBody(actor, plan)
  return {
    id,
    name: actor.kind === 'vehicle' ? `${actor.desc}_car` : actor.desc,
    type: body.type,
    position,
    rotation: v(),
    scale: body.scale,
    visible: true,
    locked: false,
    posePreset: actor.kind === 'person' ? 'standing' : undefined,
  }
}

/** 摆位参照物：原点（水平位置）+ 顶面高度（上面能放东西）。 */
type Piece = { origin: Vec3; top: number }
const pieceOf = (object: DirectorObject): Piece => ({
  origin: object.position,
  top: object.position.y + scaledBounds(object.type, object.scale).max.y,
})

// ── 站位不进实心物体：全场只有这一条规则（用 directorSpace 的包围盒），不按「谁和谁」写特例 ──
const isStandable = (object: DirectorObject) => object.visible && !object.isAuxiliary && object.type !== 'plane' && object.type !== 'group'
function solidBox(object: DirectorObject, position: Vec3) {
  const box = scaledBounds(object.type, object.scale)
  return { min: add(position, box.min), max: add(position, box.max) }
}
/**
 * 把落脚点沿 `retreat`（水平单位向量）推到所有挡路实心物体（外扩演员半宽）之外。
 * 只看和演员身高有竖直交集、且不是地面 / 路面这类薄板的东西。
 */
function clearOfSolids(point: Vec3, actor: DirectorObject, obstacles: { object: DirectorObject; position: Vec3 }[], retreat: (box: { min: Vec3; max: Vec3 }) => Vec3): Vec3 {
  const body = scaledBounds(actor.type, actor.scale)
  const half = { x: body.size.x / 2, z: body.size.z / 2 }
  const p = { ...point }
  for (let pass = 0; pass < 8; pass += 1) {
    const hit = obstacles
      .filter(({ object }) => object.id !== actor.id && isStandable(object))
      .map(({ object, position }) => solidBox(object, position))
      .find((box) =>
        box.max.y - box.min.y > 0.3 &&
        box.min.y < p.y + body.max.y - 0.02 && box.max.y > p.y + 0.02 &&
        p.x > box.min.x - half.x && p.x < box.max.x + half.x && p.z > box.min.z - half.z && p.z < box.max.z + half.z)
    if (!hit) break
    const direction = retreat(hit)
    const length = Math.hypot(direction.x, direction.z)
    // 没有明确的退路方向（在场景中心）就朝 +z（面向观众那一侧）退
    const d = length > 1e-6 ? { x: direction.x / length, z: direction.z / length } : { x: 0, z: 1 }
    const exits = [
      d.x > 1e-6 ? (hit.max.x + half.x - p.x) / d.x : d.x < -1e-6 ? (hit.min.x - half.x - p.x) / d.x : Infinity,
      d.z > 1e-6 ? (hit.max.z + half.z - p.z) / d.z : d.z < -1e-6 ? (hit.min.z - half.z - p.z) / d.z : Infinity,
    ]
    const t = Math.min(...exits)
    if (!Number.isFinite(t)) break
    // 留出落脚间隙：人 30cm，车按车身半长（跟车距离），机位才有地方进去
    const gap = Math.max(0.3, half.z)
    p.x += d.x * (t + gap)
    p.z += d.z * (t + gap)
  }
  return p
}

// 手里拿着的东西：几何中心离地的高度（米）。「携带」只定初始高度；不挂父子关系（留给舞台模型一步）。
const HELD_CENTER_HEIGHT = 1

function positionActors(
  plan: DirectorPlan,
  stage: Stage,
): { positions: Map<string, Vec3>; issues: DirectorCompileIssue[] } {
  const staticSolids = stage.things.map((thing) => thing.object)
  const positions = new Map<string, Vec3>(),
    issues: DirectorCompileIssue[] = []
  const occupied = new Set<string>()
  const placed = new Map<string, Piece>()
  const placedObjects = new Map<string, DirectorObject>()
  const actorKinds = new Map(plan.actors.map((actor) => [actor.id, actor.kind]))
  for (const [index, actor] of plan.actors.entries()) {
    const refThing = stage.refs.get(actor.placement.ref)
    const ref = (refThing ? pieceOf(refThing.object) : undefined) ?? placed.get(actor.placement.ref)
    if (!ref) {
      issues.push({ kind: 'unknown-ref', objectId: actor.id, message: `unknown placement ref ${actor.placement.ref}` })
      continue
    }
    const relation = actor.placement.relation
    const ring = index + 1
    const offset =
      relation === 'left_of'
        ? v(-1.8, 0, 0)
        : relation === 'right_of'
          ? v(1.8, 0, 0)
          : relation === 'in_front_of'
            ? v(0, 0, 1.8)
            : relation === 'behind'
              ? v(0, 0, -1.8)
              : relation === 'near'
                ? v((ring % 2 ? 1 : -1) * 1.2, 0, 1.2)
                : relation === 'along'
                  ? v(ring * 1.5, 0, 0)
                  : v(0, 0, 0)
    const p = add(ref.origin, offset)
    // 垂直方向只有一个换算点：底落在哪（directorSpace.originYForBottom）。
    // 放在某件东西「上面」= 底落在它的顶面；手持（承托者是人）= 几何中心在手的高度；其余一律站在地面（y 0）。
    const probe = actorObject(actor, plan, p, `actor:${actor.id}`)
    const heldByPerson = relation === 'on' && actorKinds.get(actor.placement.ref) === 'person'
    p.y = heldByPerson
      ? originYForCenter(probe.type, probe.scale, HELD_CENTER_HEIGHT)
      : originYForBottom(probe.type, probe.scale, relation === 'on' ? ref.top : 0)
    if (relation !== 'on') {
      // 站进墙 / 门 / 先到的人里面就往场景中心退出来（模板都以原点为中心，里面在中心那一侧）
      const solids = [...staticSolids.map((object) => ({ object, position: object.position })), ...[...positions].map(([id, position]) => ({ object: placedObjects.get(id)!, position }))]
      const cleared = clearOfSolids(p, probe, solids, (box) => ({ x: -(box.min.x + box.max.x) / 2, y: 0, z: -(box.min.z + box.max.z) / 2 }))
      if (cleared.x !== p.x || cleared.z !== p.z) issues.push({ kind: 'overlap', objectId: actor.id, message: `moved ${actor.id} out of a solid` })
      p.x = cleared.x
      p.z = cleared.z
    }
    const key = `${Math.round(p.x * 10)}:${Math.round(p.y * 10)}:${Math.round(p.z * 10)}`
    if (occupied.has(key) && relation !== 'on') {
      p.x += 0.8
      p.z += 0.8
      issues.push({ kind: 'overlap', objectId: actor.id, message: `resolved placement overlap for ${actor.id}` })
    }
    occupied.add(key)
    positions.set(actor.id, p)
    placedObjects.set(actor.id, { ...probe, position: p })
    placed.set(actor.id, pieceOf({ ...probe, position: p }))
  }
  return { positions, issues }
}

function applyBlocking(
  plan: DirectorPlan,
  objects: DirectorObject[],
  actorMap: Record<string, string>,
  duration: number,
  issues: DirectorCompileIssue[],
): void {
  const byPlanId = (id?: string) =>
    id
      ? objects.find(
          (o) =>
            o.id === actorMap[id] ||
            o.id === `setPiece:${id}` ||
            o.id === id ||
            o.name.toLowerCase() === id.toLowerCase() ||
            o.name.toLowerCase().includes(id.toLowerCase()),
        )
      : undefined
  for (const action of [...plan.blocking].sort((a, b) => a.window[0] - b.window[0])) {
    const actor = byPlanId(action.actor)
    if (!actor) continue
    const start = action.window[0],
      end = Math.min(duration, action.window[1]),
      target = byPlanId(action.target)
    const from = positionAt(actor, start)
    // 落脚点：留在出发点的地面高度（不照抄目标原点的高度），并且不进任何实心物体——
    // 向「出发点」那一侧退出来，也就是停在目标跟前，而不是钻进目标里
    const reach = (point: Vec3): Vec3 => {
      const level = { ...point, y: from.y }
      const solids = objects.filter((item) => item.id !== actor.id).map((item) => ({ object: item, position: positionAt(item, end) }))
      return clearOfSolids(level, actor, solids, () => ({ x: from.x - level.x, y: 0, z: from.z - level.z }))
    }
    const to = target ? reach(positionAt(target, end)) : from
    const points: Waypoint[] = [entityWp(`${actor.id}-${action.verb}-start`, from, start)]
    if (action.verb === 'walk_to' || action.verb === 'run_to')
      points.push(entityWp(`${actor.id}-${action.verb}-end`, to, end))
    else if (action.verb === 'drive_along')
      points.push(entityWp(`${actor.id}-${action.verb}-end`, add(from, v(0, 0, 4)), end))
    else if (action.verb === 'chase')
      points.push(entityWp(`${actor.id}-${action.verb}-end`, reach(add(to, v(0, 0, 0.8))), end))
    else if (action.verb === 'sidestep')
      points.push(
        entityWp(
          `${actor.id}-sidestep-end`,
          add(from, v(target && to.x < from.x ? -1 : 1, 0, 0)),
          end,
        ),
      )
    else
      points.push(
        entityWp(
          `${actor.id}-${action.verb}-end`,
          from,
          end,
          action.verb === 'turn_to' && target ? (Math.atan2(to.x - from.x, to.z - from.z) * 180) / Math.PI : 0,
        ),
      )
    const trajectoryClip = clip(`${actor.id}-${action.verb}-${start}`, start, end)
    // Explicit ownership preserves the shared start waypoint of adjacent clips.
    // Without it, playback assigns that point to the previous clip and jumps
    // straight to the new clip's endpoint on the first frame after the cut.
    actor.motionTrajectory = [...(actor.motionTrajectory ?? []), ...points.map((point) => ({ ...point, clipId: trajectoryClip.id }))].sort((a, b) => a.time - b.time)
    actor.trajectoryClips = [...(actor.trajectoryClips ?? []), trajectoryClip]
    if (actor.type === 'character') {
      const chosen =
        action.action ??
        (action.verb === 'run_to' || action.verb === 'chase'
          ? 'running'
          : action.verb === 'walk_to' || action.verb === 'drive_along' || action.verb === 'sidestep'
            ? 'standard_walk'
            : 'standing_idle')
      const entry = findActionEntry(chosen)
      if (entry) {
        actor.actionClips = [
          ...(actor.actionClips ?? []),
          {
            id: `${actor.id}-action-${start}`,
            name: entry.id,
            clipType: 'action',
            actionPose: entry.id,
            startTime: start,
            endTime: end,
            startFrame: Math.round(start * FPS),
            endFrame: Math.round(end * FPS),
          },
        ]
      } else {
        issues.push({
          kind: 'missing_asset',
          actorId: action.actor,
          objectId: actor.id,
          assetId: chosen,
          message: `no action-library asset for ${chosen}; left the semantic action unmaterialized`,
        })
      }
    }
  }
}

function ensureCharacterActionCoverage(objects: DirectorObject[], duration: number): void {
  const entry = findActionEntry('standing_idle')!
  for (const object of objects.filter((item) => item.type === 'character')) {
    const clips = [...(object.actionClips ?? [])].sort((a, b) => a.startTime - b.startTime)
    let cursor = 0
    const addIdle = (start: number, end: number) => {
      if (end <= start) return
      clips.push({
        ...clip(`${object.id}/idle:${start}`, start, end),
        name: entry.id, clipType: 'action', actionPose: entry.id,
      })
    }
    for (const action of [...clips]) {
      addIdle(cursor, action.startTime)
      cursor = Math.max(cursor, action.endTime)
    }
    addIdle(cursor, duration)
    object.actionClips = clips.sort((a, b) => a.startTime - b.startTime)
  }
}

function angleOffset(angle: DirectorPlanShot['angle']): number {
  if (typeof angle === 'string')
    return ({ front: 0, three_quarter: 45, side: 90, side_rear: 135, back: 180 } as Record<string, number>)[angle]
  return 'over_shoulder' in angle ? 25 : 0
}

function solveCamera(
  shot: DirectorPlanShot,
  subject: DirectorObject,
  previous: Vec3 | undefined,
  id: string,
  anchor?: AnchorSpec,
): DirectorCamera {
  const start = shot.window[0],
    end = shot.window[1],
    ladder: ShotLadder = anchor || subject.type !== 'character' ? 'object' : 'figure'
  const closeCharacter = !anchor && subject.type === 'character' && (shot.size === '特写' || shot.size === '大特写')
  const fov = closeCharacter ? 10 : shot.size === '中近景' && subject.type === 'character' ? 30 : 45
  const bounds = scaledBounds(subject.type, subject.scale)
  const subjectHeight = anchor?.size.y ?? (subject.type === 'character' ? bounds.size.y : Math.max(0.4, bounds.size.y))
  const distance =
    distanceForShotSize(shot.size as EvalShotSize, subjectHeight, fov, ladder) *
    (shot.subjects && shot.subjects.length > 1 ? 3 : 1)
  const safeObjectRadius = ladder === 'object' ? Math.hypot(bounds.size.x, bounds.size.z) / 2 + 0.2 : 0
  const azimuth = angleOffset(shot.angle),
    requestedHeight = closeCharacter
      ? subject.position.y + 2.1
      : shot.height === 'low'
        ? 0.65
        : shot.height === 'high'
          ? 2.3
          : shot.height === 'overhead'
            ? 4.2
            : subject.position.y + (subject.type === 'character' ? 1.1 : 0.8)
  const height = requestedHeight
  const subjectStart = positionAt(subject, start),
    subjectEndPosition = positionAt(subject, end)
  const aimY = subject.type === 'character' && !['远景', '全景'].includes(shot.size) ? 1.5 : 1.2
  const aimOffset =
    anchor ??
    (subject.type === 'character'
      ? { offset: v(0, aimY, 0), size: bounds.size }
      : { offset: v(0, bounds.center.y, 0), size: bounds.size })
  const target = add(subjectStart, aimOffset.offset)
  const subjectEndTarget = add(subjectEndPosition, aimOffset.offset)
  const endAngle =
    shot.move.kind === 'orbit_left' || shot.move.kind === 'arc_left'
      ? azimuth - (shot.move.amount ?? (shot.move.kind.startsWith('arc') ? 45 : 90))
      : shot.move.kind === 'orbit_right' || shot.move.kind === 'arc_right'
        ? azimuth + (shot.move.amount ?? (shot.move.kind.startsWith('arc') ? 45 : 90))
        : azimuth
  const amount =
    shot.move.amount ??
    (shot.move.kind === 'push_in' || shot.move.kind === 'pull_out' ? Math.max(0.65, distance * 0.35) : 2)
  const endRadius =
    shot.move.kind === 'push_in'
      ? Math.max(0.68, safeObjectRadius, distance - amount)
      : shot.move.kind === 'pull_out'
        ? distance + amount
        : distance
  const startRadius = shot.move.kind === 'push_in' ? distance + amount : distance
  const startPosition =
    previous ??
    v(
      target.x + Math.sin((azimuth * Math.PI) / 180) * startRadius,
      height,
      target.z + Math.cos((azimuth * Math.PI) / 180) * startRadius,
    )
  let endPosition = v(
    target.x + Math.sin((endAngle * Math.PI) / 180) * endRadius,
    height,
    target.z + Math.cos((endAngle * Math.PI) / 180) * endRadius,
  )
  if (shot.move.kind === 'crane_up' || shot.move.kind === 'crane_down')
    endPosition.y = height + (shot.move.kind === 'crane_up' ? amount : -amount)
  const trackAmount = Math.min(amount, distance * 0.25)
  if (shot.move.kind === 'track_left' || shot.move.kind === 'track_right')
    endPosition = add(endPosition, v(shot.move.kind === 'track_left' ? -trackAmount : trackAmount, 0, 0))
  let targetEnd = target
  if (shot.move.kind === 'follow' && subject.motionTrajectory?.length) {
    const delta = sub(subjectEndPosition, subjectStart)
    endPosition = add(endPosition, delta)
    targetEnd = subjectEndTarget
  }
  if (shot.move.kind === 'pan' || shot.move.kind === 'whip') {
    const direction = shot.move.direction === 'left' ? 1 : -1
    targetEnd = add(target, v(direction * (shot.move.amount ?? 2), 0, 0))
  } else if (shot.move.kind === 'tilt') {
    const direction = shot.move.direction === 'down' ? -1 : 1
    targetEnd = add(target, v(0, direction * (shot.move.amount ?? 0.5), 0))
  }
  if (shot.move.kind === 'track_left' || shot.move.kind === 'track_right') {
    const direction = shot.move.kind === 'track_left' ? -1 : 1
    targetEnd = add(target, v(direction * trackAmount, 0, 0))
  }
  const endFov =
    shot.move.kind === 'zoom_in'
      ? Math.max(18, fov - (shot.move.amount ?? 10))
      : shot.move.kind === 'zoom_out'
        ? Math.min(80, fov + (shot.move.amount ?? 10))
        : fov
  const isOrbit =
    shot.move.kind === 'orbit_left' ||
    shot.move.kind === 'orbit_right' ||
    shot.move.kind === 'arc_left' ||
    shot.move.kind === 'arc_right'
  const motionTrajectory = isOrbit
    ? Array.from({ length: 9 }, (_, index) => {
        const ratio = index / 8
        const angle = ((azimuth + (endAngle - azimuth) * ratio) * Math.PI) / 180
        const radius = distance + (endRadius - distance) * ratio
        const point = v(target.x + Math.sin(angle) * radius, height, target.z + Math.cos(angle) * radius)
        return wp(`${id}-orbit-${index}`, point, target, start + (end - start) * ratio, fov + (endFov - fov) * ratio)
      })
    : [wp(`${id}-start`, startPosition, target, start, fov), wp(`${id}-end`, endPosition, targetEnd, end, endFov)]
  return {
    id,
    name: shot.id,
    position: startPosition,
    yaw: 0,
    pitch: 0,
    roll: 0,
    fov,
    focalLengthMm: 35,
    motionTrajectory,
    trajectoryClips: [clip(`${id}-clip`, start, end)],
  }
}

function constrainCameraPath(
  camera: DirectorCamera,
  shot: DirectorPlanShot,
  subject: DirectorObject,
  objects: DirectorObject[],
  anchor: AnchorSpec | undefined,
  desiredSign: { value: number },
): void {
  const characters = objects.filter((object) => object.type === 'character').slice(0, 2)
  const aimOffset = anchor?.offset ?? (subject.type === 'character'
    ? v(0, ['远景', '全景'].includes(shot.size) ? 1.2 : 1.5, 0)
    : v(0, scaledBounds(subject.type, subject.scale).center.y, 0))
  const frameCount = Math.max(1, Math.ceil((shot.window[1] - shot.window[0]) * FPS))
  const baked = Array.from({ length: frameCount + 1 }, (_, frame) => {
    const time = shot.window[0] + (shot.window[1] - shot.window[0]) * frame / frameCount
    const pose = evaluateEntityTransform(camera, time)
    let point = { ...pose.position }
    const original = { ...point }
    const a = characters[0] && positionAt(characters[0], time)
    const b = characters[1] && positionAt(characters[1], time)
    const axisSide = (candidate: Vec3) => a && b
      ? (b.x - a.x) * (candidate.z - a.z) - (b.z - a.z) * (candidate.x - a.x) : 0
    const sign = Math.sign(axisSide(point))
    if (!desiredSign.value && sign) desiredSign.value = sign
    if (a && b && sign && desiredSign.value !== sign) point = reflectAcrossAxis(point, a, b)
    for (const object of objects) {
      if (!object.visible || object.isAuxiliary || object.type === 'plane') continue
      const origin = positionAt(object, time)
      const box = scaledBounds(object.type, object.scale)
      const center = add(origin, box.center)
      const half = v(box.size.x / 2 + 0.08, box.size.y / 2 + 0.08, box.size.z / 2 + 0.08)
      if (Math.abs(point.x - center.x) > half.x || Math.abs(point.y - center.y) > half.y || Math.abs(point.z - center.z) > half.z) continue
      const candidates = (['x', 'y', 'z'] as const).flatMap((axis) => [-1, 1].map((direction) => ({
        ...point, [axis]: center[axis] + direction * (half[axis] + 0.02),
      }))).filter((candidate) => candidate.y >= 0 && (!desiredSign.value || !a || !b || axisSide(candidate) * desiredSign.value >= 0))
      candidates.sort((left, right) => Math.hypot(left.x - point.x, left.y - point.y, left.z - point.z) - Math.hypot(right.x - point.x, right.y - point.y, right.z - point.z))
      if (candidates[0]) point = candidates[0]
    }
    const changed = Math.hypot(point.x - original.x, point.y - original.y, point.z - original.z) > 1e-6
    return {
      ...wp(`${camera.id}/frame:${frame}`, point, add(positionAt(subject, time), aimOffset), time, pose.fov ?? camera.fov),
      ...(changed ? {} : { yaw: pose.rotation.y, pitch: pose.rotation.x, roll: pose.rotation.z }),
      clipId: camera.trajectoryClips?.[0]?.id,
    }
  })
  camera.motionTrajectory = baked
  camera.position = v(baked[0].x, baked[0].y, baked[0].z)
}

export function compileDirectorPlan(input: unknown): DirectorCompileResult {
  const parsed = directorPlanSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) }
  const plan = parsed.data,
    project = createDefaultProject(plan.scene.tags.join(' / ') || 'S1 Director')
  const scene = project.scenes[0]
  scene.id = 'scene:director'
  project.activeSceneId = scene.id
  scene.name = plan.scene.environment
  const stage = buildStage(plan)
  const placed = positionActors(plan, stage),
    actorMap: Record<string, string> = {},
    anchors: Record<string, AnchorSpec> = {},
    actorObjects: DirectorObject[] = []
  for (const actor of plan.actors) {
    const id = `actor:${actor.id}`
    actorMap[actor.id] = id
    const position = placed.positions.get(actor.id) ?? v()
    const obj = actorObject(actor, plan, position, id)
    actorObjects.push(obj)
    for (const [name, offset] of Object.entries(actor.anchors ?? {}))
      anchors[`${id}.${name}`] = {
        offset: { x: offset?.x ?? 0, y: offset?.y ?? 0.9, z: offset?.z ?? 0 },
        size: v(0.18, 0.18, 0.18),
      }
  }
  scene.objects = [...stage.objects, ...actorObjects]
  const duration = Math.max(...plan.shots.map((s) => s.window[1]), ...plan.blocking.map((b) => b.window[1]), 0)
  const issues: DirectorCompileIssue[] = [...stage.issues, ...placed.issues]
  applyBlocking(plan, scene.objects, actorMap, duration, issues)
  ensureCharacterActionCoverage(scene.objects, duration)
  const cameras: DirectorCamera[] = []
  let previous: Vec3 | undefined
  const axisSign = { value: 0 }
  for (const shot of plan.shots) {
    const root = shot.subject.split('.')[0],
      subject = actorObjects.find((o) => o.id === actorMap[root])
    if (!subject) continue
    if (shot.move.kind === 'follow' && !subject.motionTrajectory?.length) {
      const start = shot.window[0],
        end = shot.window[1]
      subject.motionTrajectory = [
        entityWp(`${subject.id}-follow-start`, subject.position, start),
        entityWp(`${subject.id}-follow-end`, add(subject.position, v(2, 0, 0)), end),
      ]
      subject.trajectoryClips = [...(subject.trajectoryClips ?? []), clip(`${subject.id}-follow`, start, end)]
    }
    const part = shot.subject.split('.')[1]
    const anchorValue = part ? plan.actors.find((actor) => actor.id === root)?.anchors?.[part] : undefined
    const anchor = anchorValue
      ? { offset: v(anchorValue.x ?? 0, anchorValue.y ?? 0.9, anchorValue.z ?? 0), size: v(0.18, 0.18, 0.18) }
      : undefined
    const camera = solveCamera(
      shot,
      subject,
      shot.transitionIn === 'continuous' ? previous : undefined,
      `shot:${shot.id}/camera`,
      anchor,
    )
    constrainCameraPath(camera, shot, subject, scene.objects, anchor, axisSign)
    camera.trajectoryClips = (camera.trajectoryClips ?? []).map((clipItem) => ({
      ...clipItem,
      endTime: Math.max(clipItem.startTime, clipItem.endTime - 1e-4),
      endFrame: Math.max(clipItem.startFrame, clipItem.endFrame - 1),
    }))
    cameras.push(camera)
    scene.timelineTrackOrder.push(camera.id)
    previous = camera.motionTrajectory?.at(-1)
      ? v(camera.motionTrajectory.at(-1)!.x, camera.motionTrajectory.at(-1)!.y, camera.motionTrajectory.at(-1)!.z)
      : camera.position
  }
  scene.cameras = cameras
  // 在不在时间轴由片段推出——和编辑器同一条规则（timeGrid.syncInTimeline），编译器不另写一份
  for (const entity of [...scene.objects, ...scene.cameras]) syncInTimeline(entity)
  const measurement = sampleDirectorProject(project, { fps: FPS, duration, anchors }),
    continuity = measureContinuity(measurement, scene)
  issues.push(
    ...continuity.map((item) => ({
      kind: 'measurement' as const,
      message: item.message,
      time: item.time,
      objectId: item.objectId,
    })),
  )
  const spatial: SpatialAuditContext = {
    shots: plan.shots.flatMap((shot) => {
      const subjectId = actorMap[shot.subject.split('.')[0]]
      return subjectId && cameras.some((camera) => camera.id === `shot:${shot.id}/camera`)
        ? [{ cameraId: `shot:${shot.id}/camera`, subjectId, window: shot.window as [number, number] }]
        : []
    }),
    carried: plan.actors
      .filter((actor) => actor.placement.relation === 'on' && actorMap[actor.placement.ref])
      .map((actor) => [actorMap[actor.id], actorMap[actor.placement.ref]] as [string, string]),
  }
  return { ok: true, project, actorMap, anchors, issues, duration, spatial }
}
