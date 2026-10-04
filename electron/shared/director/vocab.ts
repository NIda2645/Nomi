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
