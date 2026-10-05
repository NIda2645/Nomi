/**
 * [INPUT]: 依赖 three 的几何类与 Box3（只量包围盒，不渲染）、./directorTypes 的 DirectorObjectType / DirectorPrimitiveType / Vec3
 * [OUTPUT]: 对外提供 CHARACTER_HEIGHT / CHARACTER_FOOTPRINT、PRIMITIVE_GEOMETRY（图元几何表，渲染与量尺共用）、localBounds / scaledBounds（物体相对原点的包围盒）、
 *          originYForBottom / originYForCenter（唯一的「底 / 中心 ↔ 原点」换算）、worldBox（带姿态的世界包围盒）
 * [POS]: director/model 的空间事实唯一 owner：这个东西多大、原点在哪、底在哪。渲染组件 PrimitiveEntity 按 PRIMITIVE_GEOMETRY 画，
 *        编译器 / 测量 / 相机避让 / AI 搭场景都从这里量，不各抄一份。除 model 里的 THREE 禁令外，这是唯一 import three 的文件（只用几何类与 Box3，无 WebGL）。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three'
import type { DirectorObjectType, DirectorPrimitiveType, Vec3 } from './directorTypes'

// 假人真实身高（米）：渲染按骨骼量高度缩放到它，脚底落在对象原点
export const CHARACTER_HEIGHT = 1.75
// unverified：渲染只量身高，宽 / 深没有真值，沿用测量模块一直以来的假设
export const CHARACTER_FOOTPRINT = { x: 0.6, z: 0.4 } as const

export type PrimitiveGeometrySpec = {
  geometry: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'tetrahedron' | 'icosahedron'
  args: number[]
  /** 渲染里网格相对对象原点的抬高（米，未乘 scale）。 */
  meshY: number
}

// 渲染真值：PrimitiveEntity 按这张表画，包围盒也由这张表量，所以「渲染」和「量尺」不会再分叉
export const PRIMITIVE_GEOMETRY: Record<DirectorPrimitiveType, PrimitiveGeometrySpec> = {
  cube: { geometry: 'box', args: [1, 1, 1], meshY: 0.5 },
  sphere: { geometry: 'sphere', args: [0.5, 32, 24], meshY: 0.5 },
  plane: { geometry: 'box', args: [1, 0.02, 1], meshY: 0 },
  cylinder: { geometry: 'cylinder', args: [0.5, 0.5, 1, 32], meshY: 0.5 },
  cone: { geometry: 'cone', args: [0.5, 1, 32], meshY: 0.5 },
  torus: { geometry: 'torus', args: [0.4, 0.15, 16, 48], meshY: 0.5 },
  tetrahedron: { geometry: 'tetrahedron', args: [0.6], meshY: 0.5 },
  icosahedron: { geometry: 'icosahedron', args: [0.55], meshY: 0.5 },
}

export function buildPrimitiveGeometry(spec: PrimitiveGeometrySpec): THREE.BufferGeometry {
  const a = spec.args
  switch (spec.geometry) {
    case 'sphere':
      return new THREE.SphereGeometry(a[0], a[1], a[2])
    case 'cylinder':
      return new THREE.CylinderGeometry(a[0], a[1], a[2], a[3])
    case 'cone':
      return new THREE.ConeGeometry(a[0], a[1], a[2])
    case 'torus':
      return new THREE.TorusGeometry(a[0], a[1], a[2], a[3])
    case 'tetrahedron':
      return new THREE.TetrahedronGeometry(a[0])
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(a[0])
    case 'box':
    default:
      return new THREE.BoxGeometry(a[0], a[1], a[2])
  }
}

const cache = new Map<string, THREE.Box3>()
function measure(type: DirectorObjectType): THREE.Box3 {
  if (type === 'character')
    return new THREE.Box3(
      new THREE.Vector3(-CHARACTER_FOOTPRINT.x / 2, 0, -CHARACTER_FOOTPRINT.z / 2),
      new THREE.Vector3(CHARACTER_FOOTPRINT.x / 2, CHARACTER_HEIGHT, CHARACTER_FOOTPRINT.z / 2),
    )
  const spec = PRIMITIVE_GEOMETRY[type as DirectorPrimitiveType]
  if (spec) {
    const geometry = buildPrimitiveGeometry(spec)
    geometry.translate(0, spec.meshY, 0)
    geometry.computeBoundingBox()
    const box = geometry.boundingBox!.clone()
    geometry.dispose()
    return box
  }
  // 没有渲染真值（GLB 未归一化、高斯无包围盒、分组无几何）：按 1 米方盒——unverified。
  // model 沿用「底贴原点」的旧约定；group / splat 以原点为中心。
  const grounded = type === 'model'
  return new THREE.Box3(new THREE.Vector3(-0.5, grounded ? 0 : -0.5, -0.5), new THREE.Vector3(0.5, grounded ? 1 : 0.5, 0.5))
}

/** 单位 scale 下，物体相对自己原点的包围盒（返回副本，可随便改）。 */
export function localBounds(type: DirectorObjectType): THREE.Box3 {
  let box = cache.get(type)
  if (!box) {
    box = measure(type)
    cache.set(type, box)
  }
  return box.clone()
}

export type ScaledBounds = { min: Vec3; max: Vec3; center: Vec3; size: Vec3 }

/** 带 scale（不带旋转）的、相对原点的包围盒：编译器避让、测量、AI 搭场景落地都用这个。 */
export function scaledBounds(type: DirectorObjectType, scale: Vec3): ScaledBounds {
  const box = localBounds(type)
  const sx = Math.abs(scale.x), sy = Math.abs(scale.y), sz = Math.abs(scale.z)
  const min = { x: box.min.x * sx, y: box.min.y * sy, z: box.min.z * sz }
  const max = { x: box.max.x * sx, y: box.max.y * sy, z: box.max.z * sz }
  return {
    min,
    max,
    center: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 },
    size: { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z },
  }
}

/** 唯一的「底 → 原点」换算：要让物体的底落在 y = bottom，原点 y 该是多少。 */
export function originYForBottom(type: DirectorObjectType, scale: Vec3, bottom: number): number {
  return bottom - scaledBounds(type, scale).min.y
}

/** 唯一的「中心 → 原点」换算：模型写的是几何中心 y，换成对象原点 y。 */
export function originYForCenter(type: DirectorObjectType, scale: Vec3, centerY: number): number {
  return centerY - scaledBounds(type, scale).center.y
}

const DEG = Math.PI / 180
/** 带姿态（位置 / 度数欧拉角 / scale）的世界包围盒；不含父级——有父子关系的先自己合成父级姿态。 */
export function worldBox(type: DirectorObjectType, pose: { position: Vec3; rotation: Vec3; scale: Vec3 }): THREE.Box3 {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.rotation.x * DEG, pose.rotation.y * DEG, pose.rotation.z * DEG)),
    new THREE.Vector3(pose.scale.x, pose.scale.y, pose.scale.z),
  )
  return localBounds(type).applyMatrix4(matrix)
}
