/**
 * 导演计划编译器 · 空间不变量特征测试（草稿，2026-10-05 类根因分析线）
 *
 * 目的：动结构之前先把「编出来的工程在物理上成不成立」写成可执行判据，并把**今天的违例账**锁住（棘轮）。
 *   - 违例数变多 = 新回归，红；
 *   - 违例数变少 = 修好了，也红——逼修复者把下面的账同步改小（棘轮只许往下拧）。
 * 判据全部用**渲染真值**量：几何体尺寸 / 网格偏移直接取自渲染组件 `PrimitiveEntity` 返回的元素树，
 * 再用 three.js 的 `Object3D` + `Box3` 按渲染同一套父子 / 欧拉角 / scale 规则求世界包围盒；
 * 不读 `OBJECT_GEOMETRY_SIZES` / `OBJECT_ORIGIN_OFFSETS` 这类手抄表（那正是被测对象之一）。
 * 角色只取高度真值（`CHARACTER_HEIGHT`、脚底原点）；宽 0.6 × 深 0.4 沿用测量模块的假设，标 unverified。
 * 报告：docs/plan/2026-10-05-director-compiler-root-cause.md
 */
import React from 'react'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { compileDirectorPlan } from './directorPlanCompiler'
import regressions from './directorPlanCompiler.regressions.json'
import { S1_ORACLE_PLANS } from '../../../../../../../evals/director/s1OraclePlans'
import { PrimitiveEntity, PrimitiveGeometry } from '../../scene/entities/PrimitiveEntity'
import { scaledBounds } from '../directorSpace'
import { evaluateEntityTransform } from '../trajectoryEval'
import { normalizeAiScene } from '../aiScene'
import { exportAiScene } from '../storeAiSceneActions'
import type { DirectorCamera, DirectorObject, DirectorProject, DirectorScene } from '../directorTypes'

const CHARACTER_HEIGHT = 1.75 // = scene/entities/CharacterEntity.tsx CHARACTER_HEIGHT（该模块挂 GLTF 加载，单测不直接 import）
const CHARACTER_FOOTPRINT = { x: 0.6, z: 0.4 } // unverified：渲染按骨骼量高度，宽深没有真值
const DEG = Math.PI / 180
const EPS = 0.02 // 2cm：低于这个算贴合
const PRIMITIVES = ['cube', 'sphere', 'plane', 'cylinder', 'cone', 'torus', 'tetrahedron', 'icosahedron'] as const

// ── 渲染真值：从渲染组件本身取几何与网格偏移 ─────────────────────────────────────────
type JsxElement = { type: unknown; props: Record<string, unknown> }
function renderMeshOf(type: DirectorObject['type']): THREE.Mesh {
  const element = PrimitiveEntity({
    object: { id: 'probe', name: 'probe', type, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, visible: true, locked: false },
    displayMode: 'solid',
  }) as unknown as JsxElement
  const offset = element.props.position as [number, number, number]
  const children = React.Children.toArray(element.props.children as React.ReactNode) as unknown as JsxElement[]
  const geometryElement = children.find((child) => child.type === PrimitiveGeometry)!
  const intrinsic = PrimitiveGeometry(geometryElement.props as { type: never }) as unknown as JsxElement
  const ctorName = String(intrinsic.type).replace(/^./, (c) => c.toUpperCase()) as keyof typeof THREE
  const Ctor = THREE[ctorName] as unknown as new (...args: number[]) => THREE.BufferGeometry
  const mesh = new THREE.Mesh(new Ctor(...((intrinsic.props.args as number[]) ?? [])))
  mesh.position.set(...offset)
  return mesh
}

function nodeFor(object: { type: DirectorObject['type'] }): THREE.Object3D {
  const node = new THREE.Object3D()
  if (object.type === 'character') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(CHARACTER_FOOTPRINT.x, CHARACTER_HEIGHT, CHARACTER_FOOTPRINT.z))
    body.position.set(0, CHARACTER_HEIGHT / 2, 0)
    node.add(body)
  } else if ((PRIMITIVES as readonly string[]).includes(object.type)) node.add(renderMeshOf(object.type))
  return node
}

type Pose = { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number } }
/** 一个图层在 t 时刻的世界包围盒（按渲染的父子树、度数欧拉角、scale）。 */
function worldBoxes(scene: Pick<DirectorScene, 'objects'>, time = 0): Map<string, THREE.Box3> {
  const root = new THREE.Object3D()
  const nodes = new Map<string, THREE.Object3D>()
  for (const object of scene.objects) {
    const node = nodeFor(object)
    const pose: Pose = object.trajectoryClips?.length ? evaluateEntityTransform(object, time) : { position: object.position, rotation: object.rotation }
    node.position.set(pose.position.x, pose.position.y, pose.position.z)
    node.rotation.set(pose.rotation.x * DEG, pose.rotation.y * DEG, pose.rotation.z * DEG)
    node.scale.set(object.scale.x, object.scale.y, object.scale.z)
    nodes.set(object.id, node)
  }
  for (const object of scene.objects) (object.parentId && nodes.get(object.parentId) ? nodes.get(object.parentId)! : root).add(nodes.get(object.id)!)
  root.updateMatrixWorld(true)
  const boxes = new Map<string, THREE.Box3>()
  for (const object of scene.objects) {
    const node = nodes.get(object.id)!
    if (!node.children.some((child) => (child as THREE.Mesh).isMesh)) continue // group / model / splat：无渲染真值，跳过
    const box = new THREE.Box3()
    for (const child of node.children) if ((child as THREE.Mesh).isMesh) box.union(new THREE.Box3().setFromObject(child, true))
    boxes.set(object.id, box)
  }
  return boxes
}

const overlapDepth = (a: THREE.Box3, b: THREE.Box3): number =>
  Math.min(a.max.x - b.min.x, b.max.x - a.min.x, a.max.y - b.min.y, b.max.y - a.min.y, a.max.z - b.min.z, b.max.z - a.min.z)
const xzOverlap = (a: THREE.Box3, b: THREE.Box3) => a.min.x < b.max.x - EPS && b.min.x < a.max.x - EPS && a.min.z < b.max.z - EPS && b.min.z < a.max.z - EPS

// ── 语料：全部 oracle 计划 + 回归计划（真实规划器产出） ───────────────────────────────
type Compiled = { id: string; project: DirectorProject; actorMap: Record<string, string>; plan: { actors: { id: string; placement: { relation: string; ref: string } }[]; shots: { id: string; subject: string; window: [number, number] }[] } }
const corpus: Compiled[] = [
  ...Object.entries(S1_ORACLE_PLANS).map(([id, plan]) => ({ id: `oracle:${id}`, plan })),
  ...(regressions as { source: string; plan: unknown }[]).map((item) => ({ id: `regression:${item.source}`, plan: item.plan })),
].flatMap(({ id, plan }) => {
  const result = compileDirectorPlan(plan)
  return result.ok ? [{ id, project: result.project, actorMap: result.actorMap, plan: plan as Compiled['plan'] }] : []
})
const sceneOf = (project: DirectorProject) => project.scenes.find((item) => item.id === project.activeSceneId) ?? project.scenes[0]
const solid = (object: DirectorObject) => object.visible && !object.isAuxiliary && object.type !== 'plane' && object.type !== 'group'
const sampleTimes = (scene: DirectorScene): number[] => {
  const end = Math.max(0, ...[...scene.objects, ...scene.cameras].flatMap((entity) => (entity.trajectoryClips ?? []).map((clip) => clip.endTime)))
  return Array.from({ length: 9 }, (_, index) => (end * index) / 8)
}

// ── 判据 ───────────────────────────────────────────────────────────────────────────
/** I1 落地：静止时每个实心物件的底要么贴地，要么贴在另一个实心物件的顶上（被拿着的东西由父子关系承托，不算）。 */
function floating(scene: DirectorScene): string[] {
  const boxes = worldBoxes(scene, 0)
  const out: string[] = []
  for (const object of scene.objects.filter(solid)) {
    const box = boxes.get(object.id)
    if (!box || object.parentId) continue
    if (box.min.y <= EPS) continue // 贴地或在地面以下（地面板本身向下长 5cm；陷地另由 I2b 量）
    const resting = [...boxes].some(([otherId, other]) => otherId !== object.id && Math.abs(other.max.y - box.min.y) <= EPS && xzOverlap(box, other))
    if (!resting) out.push(`${object.id} 底在 ${box.min.y.toFixed(2)}m`)
  }
  return out
}

/** I2 不互穿：角色 / 计划放进来的件（actor:* / setPiece:*）在任何采样时刻不与其他实心物件互穿超过 2cm；手持关系除外。 */
function interpenetrating(scene: DirectorScene, carried: Set<string>): string[] {
  const placed = (id: string) => id.startsWith('actor:') || id.startsWith('setPiece:')
  const out = new Set<string>()
  for (const time of sampleTimes(scene)) {
    const boxes = worldBoxes(scene, time)
    const ids = scene.objects.filter(solid).map((item) => item.id).filter((id) => boxes.has(id))
    for (const [i, a] of ids.entries())
      for (const b of ids.slice(i + 1)) {
        if (!placed(a) && !placed(b)) continue // 模板 / 布景之间的拼接（墙角、门嵌墙）是作者意图
        if (carried.has(a) || carried.has(b)) continue
        if (walkable(boxes.get(a)!) || walkable(boxes.get(b)!)) continue // 地面另由 I2b 量
        if (overlapDepth(boxes.get(a)!, boxes.get(b)!) > EPS) out.add([a, b].sort().join(' ⟂ '))
      }
  }
  return [...out]
}

const walkable = (box: THREE.Box3) => box.max.y - box.min.y <= 0.3
/** I2b 地面只有一个高度：站在可行走面（地面 / 路面）上的东西，脚底应等于那块面的顶，而不是陷进去或悬在上面。 */
function offFloor(scene: DirectorScene): string[] {
  const boxes = worldBoxes(scene, 0)
  const floors = [...boxes].filter(([, box]) => walkable(box))
  const out: string[] = []
  for (const object of scene.objects.filter(solid)) {
    const box = boxes.get(object.id)
    if (!box || walkable(box) || object.parentId) continue
    const under = floors.filter(([id, floor]) => id !== object.id && xzOverlap(box, floor) && floor.max.y > box.min.y - 0.3 && floor.min.y < box.min.y + EPS)
    if (!under.length) continue
    const top = Math.max(...under.map(([, floor]) => floor.max.y))
    if (Math.abs(top - box.min.y) > EPS && box.min.y < top) out.push(`${object.id} 陷进地面 ${(top - box.min.y).toFixed(2)}m`)
  }
  return out
}

/** I3 在轴上：有片段的实体必须 inTimeline（编辑器 storeClipActions#syncInTimeline 的规则）。 */
function offTimeline(scene: DirectorScene): string[] {
  return [...scene.objects, ...scene.cameras]
    .filter((entity) => (entity.trajectoryClips?.length ?? 0) + (('actionClips' in entity ? entity.actionClips?.length : 0) ?? 0) > 0)
    .filter((entity) => !entity.inTimeline)
    .map((entity) => entity.id)
}

/** I4 机位不在实体里：每个采样时刻，机位点不落在任何实心物件的渲染包围盒内。 */
function cameraInside(scene: DirectorScene): string[] {
  const out = new Set<string>()
  for (const time of sampleTimes(scene)) {
    const boxes = worldBoxes(scene, time)
    for (const camera of scene.cameras as DirectorCamera[]) {
      if (!camera.trajectoryClips?.some((clip) => time >= clip.startTime - 1e-6 && time <= clip.endTime + 1e-6)) continue
      const p = evaluateEntityTransform(camera, time).position
      for (const object of scene.objects.filter(solid)) {
        const box = boxes.get(object.id)
        if (box?.containsPoint(new THREE.Vector3(p.x, p.y, p.z))) out.add(`${camera.id} 在 ${object.id} 里`)
      }
    }
  }
  return [...out]
}

/** I6 看得见主体：每个镜头窗口内，机位到主体中心的视线不被别的实心物件（非地面、非手持物）挡住。 */
function occluded(scene: DirectorScene, entry: Compiled, carried: Set<string>): string[] {
  const out = new Set<string>()
  for (const shot of entry.plan.shots) {
    const camera = scene.cameras.find((item) => item.id === `shot:${shot.id}/camera`)
    const subjectId = entry.actorMap[shot.subject.split('.')[0]]
    if (!camera || !subjectId) continue
    for (let k = 0; k <= 4; k += 1) {
      const time = shot.window[0] + ((shot.window[1] - shot.window[0]) * k) / 4 - (k === 4 ? 1e-3 : 0)
      const boxes = worldBoxes(scene, time)
      const subjectBox = boxes.get(subjectId)
      if (!subjectBox) continue
      const eye = evaluateEntityTransform(camera, time).position
      const from = new THREE.Vector3(eye.x, eye.y, eye.z)
      const to = subjectBox.getCenter(new THREE.Vector3())
      const ray = new THREE.Ray(from, to.clone().sub(from).normalize())
      const length = from.distanceTo(to)
      for (const object of scene.objects.filter(solid)) {
        const box = boxes.get(object.id)
        if (!box || object.id === subjectId || carried.has(object.id) || walkable(box) || box.containsPoint(from)) continue
        const hit = ray.intersectBox(box, new THREE.Vector3())
        if (hit && from.distanceTo(hit) < length - 0.05) out.add(`${shot.id} 被 ${object.id} 挡住`)
      }
    }
  }
  return [...out]
}

/** I5 携带物跟手：placement=on 且承托者是会动的角色时，两者间距全程不变（±2cm）。 */
function carriedDrift(scene: DirectorScene, carriedPairs: [string, string][]): string[] {
  const out: string[] = []
  for (const [item, holder] of carriedPairs) {
    const a = scene.objects.find((o) => o.id === item), b = scene.objects.find((o) => o.id === holder)
    if (!a || !b || !b.trajectoryClips?.length) continue
    const gap = (t: number) => {
      const p = evaluateEntityTransform(a, t).position, q = evaluateEntityTransform(b, t).position
      return Math.hypot(p.x - q.x, p.z - q.z)
    }
    const times = sampleTimes(scene)
    const drift = Math.max(...times.map((t) => Math.abs(gap(t) - gap(0))))
    if (drift > EPS) out.push(`${item} 离开 ${holder} ${drift.toFixed(2)}m`)
  }
  return out
}

function audit(entry: Compiled) {
  const scene = sceneOf(entry.project)
  const actorIds = new Set(entry.plan.actors.map((actor) => actor.id))
  const carriedPairs = entry.plan.actors
    .filter((actor) => actor.placement.relation === 'on' && actorIds.has(actor.placement.ref))
    .map((actor) => [entry.actorMap[actor.id], entry.actorMap[actor.placement.ref]] as [string, string])
  const carried = new Set(carriedPairs.map(([item]) => item))
  return {
    floating: floating(scene),
    interpenetrating: interpenetrating(scene, carried),
    offFloor: offFloor(scene),
    offTimeline: offTimeline(scene),
    cameraInside: cameraInside(scene),
    occluded: occluded(scene, entry, carried),
    carriedDrift: carriedDrift(scene, carriedPairs),
  }
}

describe('空间事实只有一份：共用包围盒 vs 渲染组件真值', () => {
  it('directorSpace 量出的包围盒与渲染组件元素树里的几何逐类型一致（独立读 JSX 对账，不读共用表）', () => {
    const one = { x: 1, y: 1, z: 1 }
    const mismatched = PRIMITIVES.filter((type) => {
      const rendered = new THREE.Box3().setFromObject(renderMeshOf(type), true)
      const shared = scaledBounds(type, one)
      const size = rendered.getSize(new THREE.Vector3())
      return Math.abs(size.x - shared.size.x) > 1e-6 || Math.abs(size.y - shared.size.y) > 1e-6 || Math.abs(size.z - shared.size.z) > 1e-6 || Math.abs(rendered.min.y - shared.min.y) > 1e-6
    })
    expect(mismatched).toEqual([])
  })

  it('渲染：torus / tetrahedron / icosahedron 的底不在原点（落地必须走 originYForBottom，不能假定底 = 原点）', () => {
    const bottoms = Object.fromEntries(PRIMITIVES.map((type) => [type, Number(new THREE.Box3().setFromObject(renderMeshOf(type), true).min.y.toFixed(3))]))
    expect(bottoms).toMatchObject({ cube: 0, sphere: 0, cylinder: 0, cone: 0 })
    expect(bottoms.tetrahedron).toBeGreaterThan(EPS)
    expect(bottoms.icosahedron).toBeGreaterThan(EPS)
    expect(bottoms.torus).toBeLessThan(0)
  })
})

describe('AI 搭场景（产品路径 AiSceneBar）按提示词的「中心坐标」直接物化', () => {
  it('提示词自带示例：贴地的东西全部悬空半个身高（今天的行为，锁账）', () => {
    const spec = {
      sceneName: 'probe',
      groups: [{ name: 'g', elements: [
        { type: 'cube', name: '门', position: [0, 1.1, -3.05], scale: [1.2, 2.2, 0.1] },
        { type: 'cube', name: '长椅', position: [4, 0.25, 1.5], scale: [1.8, 0.5, 0.6] },
        { type: 'cylinder', name: '垃圾桶', position: [6, 0.45, 1.5], scale: [0.5, 0.9, 0.5] },
      ] }],
    }
    const layer = exportAiScene(normalizeAiScene(spec as never, 'probe'))
    const boxes = worldBoxes(layer)
    const bottoms = layer.objects.filter((o) => o.type !== 'group').map((o) => [o.name, Number(boxes.get(o.id)!.min.y.toFixed(2))])
    // 提示词说「物体贴地（y = 高/2）」；渲染以脚底为原点 → 底 = 高/2，而不是 0。
    expect(Object.fromEntries(bottoms)).toEqual({ 门: 1.1, 长椅: 0.25, 垃圾桶: 0.45 })
  })
})

describe('编译器产物的物理不变量（棘轮账：只许变少）', () => {
  const results = corpus.map((entry) => ({ id: entry.id, ...audit(entry) }))
  const count = (key: keyof ReturnType<typeof audit>) => results.reduce((sum, item) => sum + item[key].length, 0)
  const casesWith = (key: keyof ReturnType<typeof audit>) => results.filter((item) => item[key].length > 0).length

  it('语料都编得出来', () => {
    expect(corpus.length).toBe(Object.keys(S1_ORACLE_PLANS).length + (regressions as unknown[]).length)
  })

  it('违例总账（棘轮：修好一类就把对应数字改小）', () => {
    const ledger = {
      cases: corpus.length,
      floating: [count('floating'), casesWith('floating')],
      interpenetrating: [count('interpenetrating'), casesWith('interpenetrating')],
      offFloor: [count('offFloor'), casesWith('offFloor')],
      offTimeline: [count('offTimeline'), casesWith('offTimeline')],
      cameraInside: [count('cameraInside'), casesWith('cameraInside')],
      occluded: [count('occluded'), casesWith('occluded')],
      carriedDrift: [count('carriedDrift'), casesWith('carriedDrift')],
    }
    if (process.env.DIRECTOR_INVARIANT_DUMP) console.log(JSON.stringify({ ledger, results: results.filter((r) => Object.values(r).some((v) => Array.isArray(v) && v.length)) }, null, 2))
    expect(ledger).toEqual(LEDGER)
  })
})

/**
 * 违例账：[违例条数, 涉及几道计划]。起点 = origin/main（第一步开工前，08756793c）：
 *   floating 158/34、interpenetrating 17/5、offFloor 27/27、offTimeline 112/34、cameraInside 0、occluded 27/12、carriedDrift 1/1
 * 第一步①空间事实：模板按「底」声明 + 地面顶面 = 0 + 落地走 originYForBottom → floating / offFloor 清零。
 *   interpenetrating 17→21：以前墙和门悬在半空（底在 2m / 1.2m），人在下面走过去不碰；现在墙立在地上，
 *   「at 院门」「走位终点取目标原点」把人放进了墙里——这是 e 类（关系词没有空间语义），留给舞台模型一步。
 *   occluded 27/12→30/6：同样，墙落地后挡住的是真挡；case 数 12→6 是因为编译器不再把环境词（room / interior / 街道……）做成 1.4m 灰盒（环境词挂在不渲染的辅助分组上）。
 */
const LEDGER = {
  cases: 34,
  floating: [1, 1], // 信（on 女子）悬在半空：携带物没挂到手上（留给 ②：用父子关系）
  interpenetrating: [21, 5], // 人站进院墙 / 院门 / 彼此（e 类，留给 ②）
  offFloor: [0, 0],
  offTimeline: [0, 0], // 第二步：编译器出口走 timeGrid.syncInTimeline（编辑器同一条规则）；起点 112 / 34
  cameraInside: [0, 0], // 现有避让在渲染真值下也成立——锁住
  occluded: [30, 6],
  carriedDrift: [1, 1], // 女子走 3.5m，信留在原地
}
