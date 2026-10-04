/** Director plan vocabulary. Rendering labels and measurement thresholds live with their consumers. */
export const EVAL_SHOT_SIZES = ['远景', '全景', '中景', '中近景', '近景', '特写', '大特写'] as const
export type EvalShotSize = (typeof EVAL_SHOT_SIZES)[number]

export const CAMERA_MOVES = [
  'orbit_left', 'orbit_right', 'push_in', 'pull_out', 'crane_up', 'crane_down',
  'track_left', 'track_right', 'arc_left', 'arc_right', 'zoom_in', 'zoom_out', 'dolly_zoom',
] as const
export type CameraMove = (typeof CAMERA_MOVES)[number]

export const DIRECTOR_SCENE_TEMPLATES = ['street', 'room', 'courtyard', 'product_stage'] as const
export type DirectorSceneTemplate = (typeof DIRECTOR_SCENE_TEMPLATES)[number]

/**
 * 环境词：说的是「这场戏在哪种地方」，不是舞台上的一件东西。规划器按提示词会把它们也写进 setPieces.kind
 *（为了让实体对应不丢词），但它们由场景模板本身承担——编译器不能把它们做成一个灰盒。
 * 比较前先小写并把空格 / 连字符换成下划线。
 */
export const DIRECTOR_ENVIRONMENT_WORDS = [
  'room', 'interior', 'indoor', 'indoors', 'outdoor', 'outdoors', 'ground', 'floor', 'street', 'courtyard', 'studio', 'hallway', 'corridor',
  'quiet_room', 'quiet_street', 'market_street', 'storm_ground', 'empty_street', 'empty_room',
  'gallery', 'museum', 'cafe', 'kitchen', 'station', 'rooftop', 'shop', 'office', 'library', 'park',
  '房间', '室内', '室外', '街道', '庭院', '地面', '走廊', '美术馆', '画廊', '咖啡馆', '厨房', '车站', '屋顶', '商店', '办公室', '图书馆', '公园',
] as const
export const isEnvironmentWord = (kind: string): boolean =>
  (DIRECTOR_ENVIRONMENT_WORDS as readonly string[]).includes(kind.trim().toLowerCase().replace(/[\s-]+/g, '_'))
