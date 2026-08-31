/**
 * 「按镜头拆」的纯计算：灵敏度过滤 / 联系表切格 / 时间戳显示 / 落画布的网格坐标。
 *
 * 灵敏度滑杆为什么能瞬时响应：主进程**固定用低阈值跑一次**，返回带 `score` 的切点全集 + 一张同阈值的
 * 联系表（第 i 格恒是第 i 个切点）。滑杆只是在前端按 score 过滤这个数组，不重跑 ffmpeg。
 * 所以过滤后必须**保住原始下标**（`index`）——切格要靠它，用错就会张冠李戴。
 */

export type ShotCut = { seconds: number; score: number }

export type ShotCutCandidate = ShotCut & {
  /** 在**未过滤**全集里的下标 = 它在联系表里的格子号。过滤后千万别重新编号。 */
  index: number
}

/** 灵敏度滑杆的取值范围（对应 scene_score 的 0.10–0.70，再高基本什么都筛没了）。 */
export const SHOT_SENSITIVITY_MIN = 0.1
export const SHOT_SENSITIVITY_MAX = 0.7
export const SHOT_SENSITIVITY_DEFAULT = 0.3
export const SHOT_SENSITIVITY_STEP = 0.05

/**
 * 「同一刀的余震」合并窗口（秒）。ffmpeg 会把一个真切点连报两帧——实测某导入短片
 * `5.400/0.576` 紧跟着 `5.433/0.341`，差整整一帧，是同一刀。不合并就会在联系表里出现成对的重影格子。
 * 0.2s 只够吃掉紧邻的余震，吃不到真实快剪（最短的快剪镜头也在 0.3s 以上）。
 */
export const SHOT_CUT_MERGE_SECONDS = 0.2

/**
 * 按灵敏度过滤 + 合并余震，保住原始下标。
 *
 * 两件事必须一起做、且只有这一个出口：漏了过滤会把运镜当切点，漏了合并会把一刀数成两刀。
 * 合并保留簇里**分数最高**的那帧——它才是真正的切点位置，余震那帧画面已经切完了。
 */
export function filterShotCuts(cuts: readonly ShotCut[], threshold: number): ShotCutCandidate[] {
  const passed = cuts
    .map((cut, index) => ({ ...cut, index }))
    .filter((cut) => cut.score >= threshold)

  const merged: ShotCutCandidate[] = []
  for (const cut of passed) {
    const prev = merged[merged.length - 1]
    if (prev && cut.seconds - prev.seconds < SHOT_CUT_MERGE_SECONDS) {
      if (cut.score > prev.score) merged[merged.length - 1] = cut
      continue
    }
    merged.push(cut)
  }
  return merged
}

/**
 * 默认灵敏度**从这条视频自己的分数分布 derive**，不写死。
 *
 * 为什么：0.3 是照「硬切成片」调的，但很多片子最强的切点也只有 0.16（实测 `nomi-clip-01` = 0.161）。
 * 写死 0.3 的后果是「打开即空」——标题数的是过滤后的 0，空态判的是过滤前的非 0，
 * 于是面板显示「检测到 0 个镜头」+ 滑杆 + 一片空白 + 连一句解释都没有，用户只能关掉。
 *
 * 规则：0.3 能看到切点就用 0.3（常见片子行为不变），看不到就退到**能看到的最高档**。
 * 检测全集本身就是 `> 0.1` 的产物，故退到 MIN 必然非空 —— 面板不可能再打开就是空的。
 */
export function pickDefaultSensitivity(cuts: readonly ShotCut[]): number {
  if (!cuts.length) return SHOT_SENSITIVITY_DEFAULT
  const max = cuts.reduce((best, cut) => (cut.score > best ? cut.score : best), 0)
  if (max >= SHOT_SENSITIVITY_DEFAULT) return SHOT_SENSITIVITY_DEFAULT
  const steps = Math.floor((max - SHOT_SENSITIVITY_MIN) / SHOT_SENSITIVITY_STEP)
  const relaxed = SHOT_SENSITIVITY_MIN + Math.max(0, steps) * SHOT_SENSITIVITY_STEP
  // 浮点：0.1 + 3*0.05 会得到 0.25000000000000006，滑杆的 value 比对会当成越界。
  return Math.min(SHOT_SENSITIVITY_DEFAULT, Math.round(relaxed * 100) / 100)
}

/** 一镜到底时用几帧：约每 2.5 秒一帧，夹在 3–8 之间。5s 片段 → 3 帧，10s → 4 帧，28s → 8 帧。 */
export function evenFrameCount(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 3
  return Math.min(8, Math.max(3, Math.round(durationSeconds / 2.5)))
}

/**
 * 一镜到底时的替代取法：按时长均匀取 N 个时间点。
 * **避开首尾**——抽首帧/抽尾帧在视频工具栏已经有家了，这里再给一遍就是同一功能两个家。
 */
export function evenFrameSeconds(durationSeconds: number, count: number): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || count <= 0) return []
  return Array.from({ length: count }, (_, i) => Math.round(((durationSeconds * (i + 1)) / (count + 1)) * 1000) / 1000)
}

/**
 * 第 index 格在联系表里的 CSS 背景定位。
 * 联系表是 cols×rows 的等分网格；用 background-size 放大到 (cols×100%, rows×100%)，
 * 再按格子位置平移。百分比定位在网格里是「可用余量的百分比」，故除数是 (cols-1)/(rows-1)。
 */
export function shotSheetTileStyle(
  index: number,
  cols: number,
  rows: number,
): { backgroundSize: string; backgroundPosition: string } {
  const safeCols = Math.max(1, cols)
  const safeRows = Math.max(1, rows)
  const col = index % safeCols
  const row = Math.floor(index / safeCols)
  const x = safeCols > 1 ? (col / (safeCols - 1)) * 100 : 0
  const y = safeRows > 1 ? (row / (safeRows - 1)) * 100 : 0
  return {
    backgroundSize: `${safeCols * 100}% ${safeRows * 100}%`,
    backgroundPosition: `${x}% ${y}%`,
  }
}

/** 联系表行数——必须和主进程 `Math.ceil(cuts.length / cols)` 用同一个算式，否则切格全错位。 */
export function shotSheetRows(totalCuts: number, cols: number): number {
  return Math.max(1, Math.ceil(totalCuts / Math.max(1, cols)))
}

/** 秒 → `m:ss` / 超过一小时 `h:mm:ss`。 */
export function formatShotTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const s = total % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  const pad = (value: number) => String(value).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/**
 * 拆出来的帧落画布时的坐标：源视频右侧起，按格子铺开（成组紧凑布局，配 `exactPosition` 跳过逐卡避让，
 * 否则会被推散成一片——切图九宫格栽过同样的坑）。
 */
export function shotCutNodePositions(params: {
  origin: { x: number; y: number }
  sourceSize: { width: number; height: number }
  count: number
  columns?: number
}): { x: number; y: number }[] {
  const { origin, sourceSize, count } = params
  const columns = Math.max(1, params.columns ?? 4)
  const gapX = 32
  const gapY = 32
  const cellW = sourceSize.width + gapX
  const cellH = sourceSize.height + gapY
  const startX = origin.x + sourceSize.width + 96
  return Array.from({ length: Math.max(0, count) }, (_, index) => ({
    x: Math.round(startX + (index % columns) * cellW),
    y: Math.round(origin.y + Math.floor(index / columns) * cellH),
  }))
}
