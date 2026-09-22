import { z } from 'zod'
import { quantizeShotSeconds } from './shotTime'

const identitySchema = z.string().trim().min(1)
const viewSchema = z.object({
  selectedRowIds: z.array(identitySchema).refine((ids) => new Set(ids).size === ids.length),
  density: z.enum(['auto', 'full', 'compact', 'card']),
}).strict()
const commonShape = {
  schemaVersion: z.literal(1),
  view: viewSchema,
  revision: z.number().int().nonnegative().safe(),
  updatedAt: z.string().datetime(),
}

/**
 * 「这次切点检测给全了没有」——**唯一 owner 在这里**。
 *
 * 为什么住在 shared 而不是 `electron/video/detectShotCuts.ts`：它有三个跨进程的读侧
 * （切镜面板 / 拆解引擎 / 分镜表快照），而 2026-09-22 之前的那个 `truncated: boolean`
 * 恰恰是因为**没有一个跨侧的 owner**，被拆解那条路整个丢掉了而编译器一声不吭。
 * 放在这里，schema 和类型就是同一份，读侧再想「只取我关心的那几个字段」也绕不开它。
 *
 * 语义：超上限时我们**抬分数阈值**（不是砍时间），所以「表变短」而「整条片子仍在表里」。
 */
export const shotCutCoverageSchema = z.object({
  /** ffmpeg 在检测下限上一共报了多少刀（已去掉「同一刀两帧」）。 */
  detectedCuts: z.number().int().nonnegative(),
  /** 这次实际采用了多少刀。 */
  keptCuts: z.number().int().nonnegative(),
  /** 为压到上限而实际生效的分数阈值；没压过就是检测下限。 */
  appliedThreshold: z.number().finite().nonnegative(),
  /** 是否因为上限而没给全。 */
  capped: z.boolean(),
  /** 采用的切点覆盖到第几秒。 */
  coveredSeconds: z.number().finite().nonnegative(),
  /** 全片多长。 */
  durationSeconds: z.number().finite().nonnegative(),
}).strict()
export type ShotCutCoverage = z.infer<typeof shotCutCoverageSchema>

export const shotTableColumnSchema = z.object({
  columnId: identitySchema,
  kind: z.enum(['builtin', 'custom']),
  labelKey: identitySchema,
  order: z.number().finite(),
  visible: z.boolean(),
  hint: z.string().optional(),
}).strict()

export const shotTableFactRowSchema = z.object({
  rowId: identitySchema,
  order: z.number().finite(),
  startSeconds: z.number().finite().nonnegative(),
  endSeconds: z.number().finite().nonnegative(),
  durationSeconds: z.number().finite().nonnegative(),
  carriedOver: z.boolean(),
  visionFailed: z.boolean().optional(),
  keyframeRef: z.string().startsWith('nomi-local://').optional(),
  cells: z.record(z.string()),
  imagePrompt: z.string().optional(),
  motionPrompt: z.string().optional(),
}).strict().refine((row) => row.endSeconds >= row.startSeconds, {
  message: 'Fact row end must not precede start',
// Every read and write of a fact row goes through this schema (`readShotTable` /
// `normalizeShotTableMeta` / `deconstructionShotTableSchema.parse`), so quantizing here is what
// normalizes the long-decimal rows already sitting in saved projects — no display-side fallback.
// `durationSeconds` is derived from the quantized ends instead of trusted: it was never a second
// truth, only a cached subtraction.
}).transform((row) => {
  const startSeconds = quantizeShotSeconds(row.startSeconds)
  const endSeconds = quantizeShotSeconds(row.endSeconds)
  return { ...row, startSeconds, endSeconds, durationSeconds: quantizeShotSeconds(endSeconds - startSeconds) }
})

export const storyboardShotTableSchema = z.object({
  ...commonShape,
  source: z.object({
    kind: z.literal('storyboard'),
    documentId: identitySchema,
    designId: identitySchema,
  }).strict(),
  columnSetId: z.literal('production'),
  // A view never owns a cached copy of the storyboard rows.
  rows: z.never().optional(),
}).strict()

/**
 * Agent 分镜的账本只有一份：`ProductionRun.generationPlan` 落成的画布节点。这张表不存任何一行，
 * 行从画布上 `meta.productionRunId === runId` 的节点 derive（分镜表 = 画布节点的表格表示版，
 * 2026-09-01 拍板）。删掉这张表只是删掉一个视图，节点与 Run 一字不动。
 */
export const productionShotTableSchema = z.object({
  ...commonShape,
  source: z.object({
    kind: z.literal('production'),
    runId: identitySchema,
    /** 落地那一批的幂等章（`canvas-landing:<runId>`）：同一 Run 的补齐重放据它认出这张表已存在。 */
    materializationOperationId: identitySchema,
  }).strict(),
  columnSetId: z.literal('production'),
  rows: z.never().optional(),
}).strict()

export const deconstructionShotTableSchema = z.object({
  ...commonShape,
  source: z.object({
    kind: z.literal('deconstruction'),
    sourceNodeId: identitySchema,
    sourceAssetRef: z.string().startsWith('nomi-local://').optional(),
    title: z.string(),
    durationSeconds: z.number().finite().nonnegative().transform(quantizeShotSeconds).optional(),
    /**
     * 拆解这条参考片的生命周期。**终态保证（T-ED-06）**：`running` 之外的每一格都是终态，
     * 而 `running` 只在**这个渲染进程里真有一次在飞的调用**时才成立——判据是
     * `deconstructionLifecycle` 那份在飞登记，不是磁盘上这个字段本身。
     *
     * 为什么要 `interrupted` 而不是复用 `failed` 或 `idle`：
     * - `failed` = 跑到了、跑挂了，有一句供应商 / ffmpeg 的原话可说；
     * - `idle` = **从没拆过**，UI 的空态和「还没开始」一模一样——2026-09-17 走查里
     *   用户看到的正是这种「看着像正在跑、其实已经死了」的空白（§6.5）；
     * - `interrupted` = 跑过、被外力打断（关 app、切项目、渲染进程没了），证据都在、
     *   没有失败原因可说，但**必须给一个找回入口**。三件事是三种不同的下一步动作，合并任何两个
     *   都会让其中一种没有出口。
     */
    status: z.enum(['idle', 'running', 'ready', 'failed', 'interrupted', 'cancelled']),
    phase: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
    failedShotIndexes: z.array(z.number().int().nonnegative()).optional(),
    errorMessage: z.string().optional(),
    /**
     * 阶段内部那句更细的进度话（「首次使用本地转写，正在下载引擎与模型 120/575 MB」）。
     * 与 `errorMessage` **分开两个字段**：错误是红的、带 role=alert，进度不是——
     * 共用一个字段就等于把每一条进度都渲染成一次失败。
     */
    progressDetail: z.string().optional(),
    /**
     * 这次失败是**哪一类**的机器可读判据。今天只有一个值：`local-speech`（本地离线转写那一路挂了）。
     * 为什么需要它而不是让 UI 去认错误文案：文案会翻译、会改写，拿它当判据就是把
     * 「给不给『改用云端』这个出口」这件事绑在字符串比对上——那正是最容易静默失效的那种判据。
     */
    failureKind: z.literal('local-speech').optional(),
    /**
     * 这张表是不是整条片子（切点超上限时自动抬了阈值）。
     *
     * `.optional()` 只为**已经存在的老项目**：2026-09-22 之前落盘的表里没有这一块，
     * 读不回来不该让整张表 parse 失败。新写入一律带着它——写侧的类型是**必填**的
     * （`DeconstructionResult.cutCoverage`），所以「忘了带」在编译期就过不去，
     * 这里的 optional 不是一条可以走的后路。
     */
    cutCoverage: shotCutCoverageSchema.optional(),
  }).strict(),
  columnSetId: z.literal('facts'),
  columns: z.array(shotTableColumnSchema).refine((columns) => new Set(columns.map((column) => column.columnId)).size === columns.length),
  rows: z.array(shotTableFactRowSchema).refine((rows) => new Set(rows.map((row) => row.rowId)).size === rows.length),
}).strict()

/** Cross-process persistence owner. Storyboard rows remain in the existing design/node owners. */
export const shotTableDocumentSchema = z.union([storyboardShotTableSchema, productionShotTableSchema, deconstructionShotTableSchema])
export type StoryboardShotTableDocument = z.infer<typeof storyboardShotTableSchema>
export type ProductionShotTableDocument = z.infer<typeof productionShotTableSchema>
export type DeconstructionShotTableDocument = z.infer<typeof deconstructionShotTableSchema>
export type ShotTableDocument = z.infer<typeof shotTableDocumentSchema>
export type ShotTableColumn = z.infer<typeof shotTableColumnSchema>
export type ShotTableFactRow = z.infer<typeof shotTableFactRowSchema>

export function readShotTable(meta: unknown): ShotTableDocument | undefined {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return undefined
  const parsed = shotTableDocumentSchema.safeParse((meta as Record<string, unknown>).shotTable)
  return parsed.success ? parsed.data : undefined
}

/** Snapshot readers fail closed instead of dropping a future or corrupt table. */
export function normalizeShotTableMeta(meta: unknown): Record<string, unknown> {
  const value = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta as Record<string, unknown> : {}
  return { ...value, shotTable: shotTableDocumentSchema.parse(value.shotTable) }
}

export function createStoryboardShotTable(
  documentId: string,
  designId: string,
  updatedAt = new Date().toISOString(),
): StoryboardShotTableDocument {
  return storyboardShotTableSchema.parse({
    schemaVersion: 1,
    source: { kind: 'storyboard', documentId, designId },
    columnSetId: 'production',
    view: { selectedRowIds: [], density: 'auto' },
    revision: 0,
    updatedAt,
  })
}

export function createProductionShotTable(
  runId: string,
  materializationOperationId: string,
  updatedAt = new Date().toISOString(),
): ProductionShotTableDocument {
  return productionShotTableSchema.parse({
    schemaVersion: 1,
    source: { kind: 'production', runId, materializationOperationId },
    columnSetId: 'production',
    view: { selectedRowIds: [], density: 'auto' },
    revision: 0,
    updatedAt,
  })
}

/**
 * 拆解进度。`phase` 是三大阶段（切点 / 读图 / 对白）；`detail` 是**阶段内部**那句更细的话
 * （「下载引擎与权重 120/575 MB」「转写第 2/6 段」）。
 *
 * 为什么要 detail：云端转写几秒就回来了，一个阶段名够用；本地转写第一次用要先下几百 MB、
 * 之后按段跑几分钟——一条没有进度的几分钟等待在用户那里和「卡死了」长得一模一样。
 * 文案在主进程按用户语言生成（`desktopT`），渲染层原样显示，不在两边各拼一次。
 */
export type DeconstructionProgress = { requestId: string; projectId: string; phase: 0 | 1 | 2; detail?: string }
