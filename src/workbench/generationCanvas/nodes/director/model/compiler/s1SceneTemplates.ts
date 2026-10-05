import type { DirectorObject } from '../directorTypes'
import { originYForBottom } from '../directorSpace'
import type { DirectorSceneTemplate } from '../../../../../../../electron/shared/director/vocab'

type Template = DirectorSceneTemplate
type Size = { x: number; y: number; z: number }
const GROUND_THICKNESS = 0.05

/**
 * 模板件按「底在哪」声明，原点 y 由 directorSpace.originYForBottom 换算——模板里不再手写「中心」坐标。
 * 地面板顶面 = y 0（向下长 GROUND_THICKNESS），所以全场只有一个地面高度：人和物按 y 0 站。
 */
const part = (id: string, name: string, type: DirectorObject['type'], at: { x: number; z: number }, scale: Size, color = '#94a3b8', bottom = 0): DirectorObject => ({
  id, name, type, position: { x: at.x, y: originYForBottom(type, scale, bottom), z: at.z }, rotation: { x: 0, y: 0, z: 0 }, scale, color, visible: true, locked: true, isAuxiliary: false,
})
const block = (id: string, name: string, at: { x: number; z: number }, scale: Size, color?: string, bottom?: number) => part(id, name, 'cube', at, scale, color, bottom)
const ground = (id: string, size: { x: number; z: number }, color: string) => block(id, 'ground', { x: 0, z: 0 }, { x: size.x, y: GROUND_THICKNESS, z: size.z }, color, -GROUND_THICKNESS)

/** S1-only template adapter. Existing street/room builders remain untouched; these objects preserve their semantic layout. */
export function buildS1TemplateObjects(template: Template): DirectorObject[] {
  if (template === 'courtyard') return [
    ground('s1-courtyard-ground', { x: 18, z: 18 }, '#64748b'),
    block('s1-courtyard-wall-north', 'wall_enclosure', { x: 0, z: -8 }, { x: 16, y: 4, z: 0.3 }, '#a8a29e'),
    block('s1-courtyard-wall-east', 'wall east', { x: 8, z: 0 }, { x: 0.3, y: 4, z: 16 }, '#a8a29e'),
    block('s1-courtyard-gate', 'gate', { x: 0, z: -7.7 }, { x: 2.5, y: 2.4, z: 0.35 }, '#78350f'),
    part('s1-courtyard-tree', 'courtyard tree', 'cylinder', { x: -5, z: -4 }, { x: 1.2, y: 3, z: 1.2 }, '#166534'),
  ]
  if (template === 'product_stage') return [
    ground('s1-product-ground', { x: 14, z: 14 }, '#e2e8f0'),
    block('s1-product-backdrop', 'wall backdrop', { x: 0, z: -5 }, { x: 12, y: 6, z: 0.2 }, '#f8fafc'),
    part('s1-product-pedestal', 'round_pedestal', 'cylinder', { x: 0, z: 0 }, { x: 0.8, y: 1, z: 0.8 }, '#cbd5e1'),
  ]
  if (template === 'room') return [
    ground('s1-room-floor', { x: 10, z: 8 }, '#a8a29e'),
    block('s1-room-back', 'wall back', { x: 0, z: -4 }, { x: 10, y: 4, z: 0.2 }, '#d6d3d1'),
    block('s1-room-left', 'wall left', { x: -5, z: 0 }, { x: 0.2, y: 4, z: 8 }, '#d6d3d1'),
  ]
  return [
    ground('s1-street-ground', { x: 10, z: 30 }, '#475569'),
    block('s1-street-road-left', 'road', { x: -7, z: 0 }, { x: 3, y: 0.2, z: 30 }, '#a8a29e'),
    block('s1-street-road-right', 'road', { x: 7, z: 0 }, { x: 3, y: 0.2, z: 30 }, '#a8a29e'),
    block('s1-street-building-left', 'buildings_both_sides', { x: -10, z: 0 }, { x: 2, y: 6, z: 30 }, '#334155'),
    block('s1-street-building-right', 'buildings_both_sides', { x: 10, z: 0 }, { x: 2, y: 6, z: 30 }, '#334155'),
  ]
}

export type S1Template = Template
