/**
 * [INPUT]: DirectorProject and existing pure trajectory/program-camera evaluators.
 * [OUTPUT]: deterministic frame samples, pinhole projections, shot-size and camera-motion recognition,
 *           and continuity checks for offline director evaluation. Zero React/THREE.
 * [POS]: single owner of preview measurement; evals/director and future agent self-checks consume it.
 */
import type { DirectorCamera, DirectorObject, DirectorProject, DirectorScene, Vec3 } from './directorTypes'
import { evaluateEntityTransform } from './trajectoryEval'
import { evaluateSceneObjectPose } from './evaluatedSceneObject'
import { programCameraIdAt } from './programCamera'
import { sceneFrame, transformPoint } from './sceneObjectGraph'
import { forwardFromAngles, normalize, signedDeg, sub } from './vec3'
import { CAMERA_MOVES, type CameraMove } from '../agent/cameraMoveVocab'
import { SHOT_FRAMING, type StagingShot } from '../agent/stagingVocab'

export type EvalShotSize = '远景' | '全景' | '中景' | '中近景' | '近景' | '特写' | '大特写'
export const EVAL_SHOT_SIZES: readonly EvalShotSize[] = ['远景', '全景', '中景', '中近景', '近景', '特写', '大特写']
/** Thresholds are normalized projected subject height. They follow the conventional full-body/waste/face ladder;
 * 1.0 means the subject fills the frame. The exact threshold is intentionally stable for cross-scheme comparison. */
export const SHOT_SIZE_THRESHOLDS: readonly [number, EvalShotSize][] = [
  [0.12, '远景'], [0.28, '全景'], [0.48, '中景'], [0.62, '中近景'], [0.78, '近景'], [0.93, '特写'], [Infinity, '大特写'],
]
export const STAGING_SHOT_TO_EVAL: Record<StagingShot, EvalShotSize> = { wide: '全景', medium: '中景', close: '特写' }

export type AnchorSpec = { offset: Vec3; size: Vec3 }
export type ProjectionBox = { x: number; y: number; width: number; height: number; heightRatio: number; inFrame: boolean; depth: number }
export type ObjectSample = { position: Vec3; yaw: number; projection?: ProjectionBox; shotSize?: EvalShotSize; belowGround: boolean }
export type CameraSample = { id: string; position: Vec3; yaw: number; pitch: number; roll: number; fov: number }
export type FrameSample = { frame: number; time: number; cameraId: string | null; camera: CameraSample | null; objects: Record<string, ObjectSample> }
export type MeasurementOptions = { fps?: number; duration?: number; aspectRatio?: number; anchors?: Record<string, AnchorSpec> }
export type DirectorMeasurements = { fps: number; duration: number; frames: FrameSample[]; cuts: number[] }

const DEFAULT_FPS = 30
const DEFAULT_ASPECT = 16 / 9
const EPS = 1e-5
const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z })
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z)
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const mul = (a: Vec3, n: number): Vec3 => ({ x: a.x * n, y: a.y * n, z: a.z * n })
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const sceneDuration = (scene: DirectorScene): number => {
  const ends: number[] = []
  for (const entity of [...scene.objects, ...scene.cameras]) {
    for (const c of entity.trajectoryClips ?? []) ends.push(c.endTime)
    for (const c of 'closeupClips' in entity ? entity.closeupClips ?? [] : []) ends.push(c.endTime)
    for (const c of 'actionClips' in entity ? entity.actionClips ?? [] : []) ends.push(c.endTime)
  }
  return ends.length ? Math.max(...ends) : 0
}

function objectSize(object: DirectorObject): Vec3 {
  if (object.type === 'character') return { x: 0.6 * Math.abs(object.scale.x), y: 1.75 * Math.abs(object.scale.y), z: 0.4 * Math.abs(object.scale.z) }
  return { x: Math.max(EPS, Math.abs(object.scale.x)), y: Math.max(EPS, Math.abs(object.scale.y)), z: Math.max(EPS, Math.abs(object.scale.z)) }
}

function cameraBasis(camera: CameraSample): { forward: Vec3; right: Vec3; up: Vec3 } {
  const forward = forwardFromAngles(camera.yaw, camera.pitch)
  const right = normalize(cross(forward, vec(0, 1, 0)))
  const up = normalize(cross(right, forward))
  return { forward, right, up }
}

export function projectBounds(camera: CameraSample, center: Vec3, size: Vec3, aspectRatio = DEFAULT_ASPECT): ProjectionBox {
  const { forward, right, up } = cameraBasis(camera)
  const half = mul(size, 0.5)
  const points: Vec3[] = []
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) points.push(add(center, vec(sx * half.x, sy * half.y, sz * half.z)))
  const vertical = Math.max(1e-3, camera.fov * Math.PI / 360)
  const tanV = Math.tan(vertical), tanH = tanV * aspectRatio
  const projected = points.map((point) => {
    const d = sub(point, camera.position)
    const depth = dot(d, forward)
    return { x: 0.5 + dot(d, right) / Math.max(EPS, depth) / (2 * tanH), y: 0.5 - dot(d, up) / Math.max(EPS, depth) / (2 * tanV), depth }
  })
  const x0 = Math.min(...projected.map(p => p.x)), x1 = Math.max(...projected.map(p => p.x))
  const y0 = Math.min(...projected.map(p => p.y)), y1 = Math.max(...projected.map(p => p.y))
  const depth = Math.min(...projected.map(p => p.depth))
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0, heightRatio: y1 - y0, inFrame: depth > 0 && x0 >= -EPS && x1 <= 1 + EPS && y0 >= -EPS && y1 <= 1 + EPS, depth }
}

export function shotSizeForHeight(heightRatio: number): EvalShotSize {
  for (const [threshold, size] of SHOT_SIZE_THRESHOLDS) if (heightRatio < threshold) return size
  return '大特写'
}

function cameraSample(camera: DirectorCamera, time: number): CameraSample {
  const evaluated = evaluateEntityTransform(camera, time)
  return { id: camera.id, position: evaluated.position, yaw: evaluated.rotation.y, pitch: evaluated.rotation.x, roll: evaluated.rotation.z, fov: evaluated.fov ?? camera.fov }
}

function objectSample(scene: DirectorScene, object: DirectorObject, time: number, camera: CameraSample | null, aspectRatio: number, anchors?: Record<string, AnchorSpec>): ObjectSample {
  const evaluated = evaluateSceneObjectPose(scene.objects, object.id, time)
  const frame = evaluated?.frame
  const sceneWorld = frame ? transformPoint(sceneFrame(scene.sceneConfig), frame.position) : object.position
  const position = sceneWorld
  const anchor = anchors?.[object.id]
  const center = anchor && frame ? transformPoint(sceneFrame(scene.sceneConfig), transformPoint(frame, anchor.offset)) : position
  const size = anchor?.size ?? objectSize(object)
  const projection = camera ? projectBounds(camera, center, size, aspectRatio) : undefined
  return { position, yaw: evaluated?.yaw ?? object.rotation.y, projection, shotSize: projection ? shotSizeForHeight(projection.heightRatio) : undefined, belowGround: position.y - size.y / 2 < -0.05 }
}

export function sampleDirectorProject(project: DirectorProject, options: MeasurementOptions = {}): DirectorMeasurements {
  const scene = project.scenes.find(s => s.id === project.activeSceneId) ?? project.scenes[0]
  if (!scene) return { fps: options.fps ?? DEFAULT_FPS, duration: options.duration ?? 0, frames: [], cuts: [] }
  const fps = Math.max(1, Math.round(options.fps ?? DEFAULT_FPS))
  const duration = Math.max(0, options.duration ?? sceneDuration(scene))
  const frames: FrameSample[] = []
  const count = Math.round(duration * fps)
  let previousCamera: string | null = null
  const cuts: number[] = []
  for (let frame = 0; frame <= count; frame++) {
    const time = frame / fps
    const cameraId = programCameraIdAt(time, scene.cameras, scene.timelineTrackOrder) ?? (scene.cameras[0]?.id ?? null)
    if (previousCamera !== null && cameraId !== previousCamera) cuts.push(time)
    previousCamera = cameraId
    const camera = cameraId ? scene.cameras.find(item => item.id === cameraId) : undefined
    const cameraState = camera ? cameraSample(camera, time) : null
    const objects: Record<string, ObjectSample> = {}
    for (const object of scene.objects) objects[object.id] = objectSample(scene, object, time, cameraState, options.aspectRatio ?? DEFAULT_ASPECT, options.anchors)
    frames.push({ frame, time, cameraId, camera: cameraState, objects })
  }
  return { fps, duration, frames, cuts }
}

export type MotionWindow = { start: number; end: number }
export type MotionRecognition = { move: CameraMove | 'follow' | 'pan' | 'tilt' | 'static'; signedOrbitDeg: number; distanceDelta: number; linearSpeed: number; angularSpeed: number; jerkRms: number; jump: boolean }

function unwrapDelta(values: number[]): number[] { const out: number[] = []; let total = 0; for (let i = 1; i < values.length; i++) { const d = signedDeg(values[i] - values[i - 1]); total += d; out.push(total) } return out }
export function recognizeCameraMotion(measurements: DirectorMeasurements, subjectId: string, window: MotionWindow): MotionRecognition {
  const frames = measurements.frames.filter(f => f.time >= window.start - EPS && f.time <= window.end + EPS && f.camera)
  const first = frames[0], last = frames[frames.length - 1]
  if (!first?.camera || !last?.camera || frames.length < 2) return { move: 'static', signedOrbitDeg: 0, distanceDelta: 0, linearSpeed: 0, angularSpeed: 0, jerkRms: 0, jump: false }
  const points = frames.map(f => f.camera!.position), subjects = frames.map(f => f.objects[subjectId]?.position ?? vec(0, 0, 0))
  const distances = frames.map((_, i) => distance(points[i], subjects[i]))
  const azimuth = frames.map((_, i) => Math.atan2(points[i].x - subjects[i].x, points[i].z - subjects[i].z) * 180 / Math.PI)
  const orbit = unwrapDelta(azimuth).at(-1) ?? 0
  const distanceDelta = distances.at(-1)! - distances[0]
  const dt = Math.max(EPS, last.time - first.time)
  const cameraTravel = distance(points.at(-1)!, points[0])
  const angularTravel = Math.abs(signedDeg(last.camera.yaw - first.camera.yaw))
  const subjectScreen = frames.map(f => f.objects[subjectId]?.projection ? [f.objects[subjectId].projection!.x + f.objects[subjectId].projection!.width / 2, f.objects[subjectId].projection!.y + f.objects[subjectId].projection!.height / 2] : [0.5, 0.5])
  const screenDrift = Math.hypot(subjectScreen.at(-1)![0] - subjectScreen[0][0], subjectScreen.at(-1)![1] - subjectScreen[0][1])
  const accel: number[] = []
  const speeds: number[] = []
  for (let i = 1; i < points.length; i++) speeds.push(distance(points[i], points[i - 1]) / Math.max(EPS, frames[i].time - frames[i - 1].time))
  for (let i = 1; i < speeds.length; i++) accel.push((speeds[i] - speeds[i - 1]) / Math.max(EPS, frames[i + 1].time - frames[i].time))
  const jerks = accel.slice(1).map((value, i) => (value - accel[i]) / Math.max(EPS, frames[i + 2].time - frames[i + 1].time))
  const jerkRms = jerks.length ? Math.sqrt(jerks.reduce((sum, value) => sum + value * value, 0) / jerks.length) : 0
  const jump = speeds.some((speed, i) => i > 0 && Math.abs(speed - speeds[i - 1]) > 8)
  let move: MotionRecognition['move'] = 'static'
  if (Math.abs(distanceDelta) >= 0.25) move = distanceDelta < 0 ? 'push_in' : 'pull_out'
  else if (Math.abs(orbit) >= 25) move = orbit > 0 ? 'orbit_right' : 'orbit_left'
  else if (cameraTravel < 0.25 && angularTravel >= 12) move = Math.abs(last.camera.pitch - first.camera.pitch) >= angularTravel ? 'tilt' : 'pan'
  else if (cameraTravel >= 0.25 && screenDrift < 0.08 && distanceDelta < 0.25) move = 'follow'
  else if (cameraTravel >= 0.25) {
    const dx = last.camera.position.x - first.camera.position.x
    move = dx < 0 ? 'track_left' : 'track_right'
  }
  return { move, signedOrbitDeg: orbit, distanceDelta, linearSpeed: cameraTravel / dt, angularSpeed: angularTravel / dt, jerkRms, jump }
}

export type ContinuityIssue = { kind: 'teleport' | 'axis-cross' | 'camera-inside' | 'below-ground'; time: number; objectId?: string; message: string }
export function measureContinuity(measurements: DirectorMeasurements, scene: DirectorScene): ContinuityIssue[] {
  const issues: ContinuityIssue[] = []
  for (const frame of measurements.frames) {
    if (frame.camera) for (const object of scene.objects) {
      const sample = frame.objects[object.id]
      if (sample?.projection && sample.projection.depth < 0.05) issues.push({ kind: 'camera-inside', time: frame.time, objectId: object.id, message: `camera enters ${object.name}` })
      if (sample?.belowGround) issues.push({ kind: 'below-ground', time: frame.time, objectId: object.id, message: `${object.name} is below ground` })
    }
  }
  for (const cut of measurements.cuts) {
    const before = measurements.frames.find(f => Math.abs(f.time - (cut - 1 / measurements.fps)) < EPS * 2)
    const after = measurements.frames.find(f => Math.abs(f.time - cut) < EPS * 2)
    if (before && after) for (const object of scene.objects) {
      const a = before.objects[object.id]?.position, b = after.objects[object.id]?.position
      if (a && b && distance(a, b) > 2) issues.push({ kind: 'teleport', time: cut, objectId: object.id, message: `${object.name} jumps ${distance(a, b).toFixed(2)}m across cut` })
    }
  }
  const pair = scene.objects.filter(o => o.type === 'character').slice(0, 2)
  if (pair.length === 2) {
    let previousSign = 0
    for (const frame of measurements.frames) {
      const a = frame.objects[pair[0].id]?.position, b = frame.objects[pair[1].id]?.position, c = frame.camera?.position
      if (!a || !b || !c) continue
      const sign = Math.sign(cross(sub(b, a), sub(c, a)).y)
      if (sign && previousSign && sign !== previousSign) issues.push({ kind: 'axis-cross', time: frame.time, message: `camera crosses 180° axis for ${pair[0].name}/${pair[1].name}` })
      if (sign) previousSign = sign
    }
  }
  return issues
}

export const isKnownCameraMove = (value: string): value is CameraMove => (CAMERA_MOVES as readonly string[]).includes(value)
export const measurementMath = { add, sub, cross, dot, length }
