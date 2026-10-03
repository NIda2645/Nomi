/**
 * [INPUT]: additive Director A asset files
 * [OUTPUT]: curated catalog plus planner-safe compact projection
 * [POS]: single owner for the pre-cutover 3D-BOX inventory; runtime wiring is intentionally deferred
 */
import type { AssetRecord, PlannerAsset } from './types'
import { STORYAI_POSES } from './staticPoses'

const sourceQuaternius = 'https://opengameart.org/content/universal-animation-library'
const sourceKenneyRoads = 'https://kenney.nl/assets/city-kit-roads'
const sourceKenneyCar = 'https://kenney.nl/assets/car-kit'
const sourceKenneyFurniture = 'https://kenney.nl/assets/furniture-kit'
const sourceKenneyBuilding = 'https://kenney.nl/assets/building-kit'
const restoredSource = 'git:d3f68057c^:src/assets/mannequin-animations.glb (three.js Xbot / Mixamo; license pending review)'

const action = (id: string, clipName: string, file: string, tags: string[], zh: string, en: string, source: string, license: AssetRecord['license'] = 'CC0-1.0', derivativeFile?: string): AssetRecord => ({
  id, kind: 'action', tags, nameZh: zh, nameEn: en, sizeClass: 'tiny', origin: 'rig-root', file, source, license, modified: true, clipName, derivativeFile, rig: 'mixamo',
})

const prop = (id: string, file: string, tags: string[], zh: string, en: string, dimensionsM: [number, number, number], source: string): AssetRecord => ({
  id, kind: 'prop', tags, nameZh: zh, nameEn: en, sizeClass: dimensionsM[2] > 2 ? 'large' : dimensionsM[0] > 0.8 ? 'medium' : 'small', dimensionsM: { widthM: dimensionsM[0], depthM: dimensionsM[1], heightM: dimensionsM[2] }, origin: 'ground-center', file, source, license: 'CC0-1.0', modified: true,
})

export const DIRECTOR_ASSET_CATALOG: AssetRecord[] = [
  action('action-restored-agree', 'agree', 'src/assets/director/pose/restored/retargeted-agree.glb', ['emote', 'agree', 'nod'], '同意', 'Agree', restoredSource, 'pending-review', 'src/assets/director/pose/restored/agree.fbx'),
  action('action-restored-head-shake', 'headShake', 'src/assets/director/pose/restored/retargeted-headShake.glb', ['emote', 'head-shake', 'disagree'], '摇头', 'Head shake', restoredSource, 'pending-review', 'src/assets/director/pose/restored/headShake.fbx'),
  action('action-restored-sad-pose', 'sad_pose', 'src/assets/director/pose/restored/retargeted-sad_pose.glb', ['emote', 'sad', 'static'], '悲伤', 'Sad pose', restoredSource, 'pending-review', 'src/assets/director/pose/restored/sad_pose.fbx'),
  action('action-restored-sneak-pose', 'sneak_pose', 'src/assets/director/pose/restored/retargeted-sneak_pose.glb', ['locomotion', 'sneak', 'static'], '潜行姿', 'Sneak pose', restoredSource, 'pending-review', 'src/assets/director/pose/restored/sneak_pose.fbx'),
  action('action-ual-sit-idle', 'Sitting_Idle_Loop', 'src/assets/director/actions/ual-sit-idle.glb', ['sit', 'idle', 'loop'], '坐姿待机', 'Sitting idle', sourceQuaternius),
  action('action-ual-push', 'Push_Loop', 'src/assets/director/actions/ual-push.glb', ['interaction', 'push', 'loop'], '推', 'Push loop', sourceQuaternius),
  action('action-ual-punch', 'Punch_Jab', 'src/assets/director/actions/ual-punch.glb', ['combat', 'punch'], '直拳', 'Punch jab', sourceQuaternius),
  action('action-ual-fall', 'Death01', 'src/assets/director/actions/ual-fall.glb', ['fall', 'death', 'impact'], '跌倒', 'Fall / death', sourceQuaternius),
  action('action-ual-pickup', 'PickUp_Table', 'src/assets/director/actions/ual-pickup.glb', ['interaction', 'pickup'], '拾取', 'Pick up', sourceQuaternius),
  action('action-ual-idle', 'Idle_Loop', 'src/assets/director/actions/ual-idle.glb', ['idle', 'loop'], '待机', 'Idle loop', sourceQuaternius),
  ...STORYAI_POSES,
  prop('prop-road-straight', 'src/assets/director/props/kenney-road-straight.glb', ['road', 'straight', 'street'], '直路', 'Straight road', [1, 1, 0.02], sourceKenneyRoads),
  prop('prop-road-crossroad', 'src/assets/director/props/kenney-road-crossroad.glb', ['road', 'crossroad', 'intersection'], '十字路口', 'Crossroad', [1, 1, 0.02], sourceKenneyRoads),
  prop('prop-road-intersection', 'src/assets/director/props/kenney-road-intersection.glb', ['road', 'intersection', 'street'], '道路交汇', 'Road intersection', [1, 1, 0.02], sourceKenneyRoads),
  prop('prop-streetlight', 'src/assets/director/props/kenney-streetlight-square.glb', ['street', 'light', 'lamp'], '方形路灯', 'Square street light', [0.05, 0.2375, 0.6], sourceKenneyRoads),
  prop('prop-traffic-light', 'src/assets/director/props/kenney-traffic-light.glb', ['street', 'traffic-light', 'signal'], '交通信号灯', 'Traffic light', [0.1176, 0.09, 0.515], sourceKenneyRoads),
  prop('prop-ambulance', 'src/assets/director/props/kenney-ambulance.glb', ['vehicle', 'ambulance', 'emergency'], '救护车', 'Ambulance', [1.5, 1.8, 3.25], sourceKenneyCar),
  prop('prop-police-car', 'src/assets/director/props/kenney-police-car.glb', ['vehicle', 'police', 'emergency'], '警车', 'Police car', [1.5, 1.3, 3.0907], sourceKenneyCar),
  prop('prop-taxi', 'src/assets/director/props/kenney-taxi.glb', ['vehicle', 'taxi', 'car'], '出租车', 'Taxi', [1.5, 1.5, 2.75], sourceKenneyCar),
  prop('prop-chair', 'src/assets/director/props/kenney-chair.glb', ['furniture', 'chair', 'interior'], '椅子', 'Chair', [0.2, 0.2, 0.47], sourceKenneyFurniture),
  prop('prop-table', 'src/assets/director/props/kenney-table.glb', ['furniture', 'table', 'interior'], '桌子', 'Table', [0.8415, 0.4474, 0.3267], sourceKenneyFurniture),
  prop('prop-kitchen-stove', 'src/assets/director/props/kenney-kitchen-stove.glb', ['furniture', 'kitchen', 'stove'], '厨房灶台', 'Kitchen stove', [0.43, 0.45, 0.45], sourceKenneyFurniture),
  prop('prop-kitchen-fridge', 'src/assets/director/props/kenney-kitchen-fridge.glb', ['furniture', 'kitchen', 'fridge'], '厨房冰箱', 'Kitchen fridge', [0.43, 0.2919, 0.92], sourceKenneyFurniture),
  prop('set-wall', 'src/assets/director/props/kenney-wall.glb', ['set-piece', 'building', 'wall'], '墙体', 'Wall', [0.1, 2, 2.4], sourceKenneyBuilding),
  prop('set-wall-doorway', 'src/assets/director/props/kenney-wall-doorway.glb', ['set-piece', 'building', 'doorway'], '带门墙体', 'Wall doorway', [0.2, 2, 2.4], sourceKenneyBuilding),
  prop('set-door-square', 'src/assets/director/props/kenney-door-square.glb', ['set-piece', 'building', 'door'], '方门', 'Square door', [0.3943, 0.9183, 2.1], sourceKenneyBuilding),
  prop('set-roof-flat', 'src/assets/director/props/kenney-roof-flat.glb', ['set-piece', 'building', 'roof'], '平屋顶', 'Flat roof', [2.3945, 2.3945, 0.4], sourceKenneyBuilding),
]

const level = (asset: AssetRecord): PlannerAsset['dimensionsLevel'] => asset.kind === 'action' || asset.kind === 'pose' ? 'animation' : asset.kind === 'setPiece' ? 'building' : (asset.dimensionsM?.heightM ?? 0) > 2 ? 'street' : (asset.dimensionsM?.widthM ?? 0) > 0.8 ? 'room' : 'handheld'
export const DIRECTOR_PLANNER_ASSETS: PlannerAsset[] = DIRECTOR_ASSET_CATALOG.map(({ dimensionsM: _dimensionsM, file: _file, source: _source, license: _license, modified: _modified, anchors: _anchors, origin: _origin, clipName: _clipName, derivativeFile: _derivativeFile, rig: _rig, ...asset }) => ({ ...asset, dimensionsLevel: level(DIRECTOR_ASSET_CATALOG.find((entry) => entry.id === asset.id)!)}))

export function findDirectorAsset(id: string): AssetRecord | undefined { return DIRECTOR_ASSET_CATALOG.find((asset) => asset.id === id) }
