// 一键反馈的**组包**层。纯函数 + 注入依赖，不碰 Electron API（那半在 `feedbackIpc.ts`）。
//
// 反馈包 = 诊断包的一个**有界子集** + 这一回合的轨迹投影。
//
// 为什么不直接把 `buildDiagnosticsBundle()` 那个 zip 发出去：它上限 25MB，而这是一次
// 用户点了按钮就该立刻拿到编号的请求（接收端 body 上限 2MB）。所以这里带的是
//   · 日志**尾部**（最近若干行，写入时已脱敏）
//   · 模型目录（`redactModelCatalog` 抹掉密钥）
//   · 这一回合的轨迹投影（`projectLaneTrajectory` 的字段白名单）
//   · 上下文（版本 / 系统 / 失败面 / 错误码 / 那句人话 / 用户可空的留言）
// 完整原始日志与 Agent 记录仍然走既有的 **设置 → 导出诊断包**（用户自己挑保存位置、
// 自己决定发不发）。这条分工写进清单的 `excluded`，不藏。
//
// 清单机制**直接复用** `DiagnosticsBundleEntry{path,bytes,what}` /
// `DiagnosticsBundleExclusion{what,why}`（`electron/shared/contracts/diagnostics.ts`）——
// 「每项写清是什么、没带的写清为什么」这件事已经有 owner，不另造一份。
import { redactLogValue } from '../logging/redact'
import { redactModelCatalog } from '../diagnostics/catalogRedaction'
import { projectLaneTrajectory } from '../telemetry/trajectoryProjection'
import type { TrajectoryTurnInput } from '../shared/agentLane/laneTrajectory'
import type { DiagnosticsBundleEntry, DiagnosticsBundleExclusion, DiagnosticsBundleManifest } from '../shared/contracts/diagnostics'
import { FEEDBACK_SURFACES, type FeedbackReportRequest, type FeedbackSurface } from '../shared/contracts/feedback'

/** 摘要那句人话的上限。它是**已经派生好的**一句话，长到这个数说明调用处传错了东西。 */
const MAX_SUMMARY_CHARS = 300
/** 用户留言上限。他只需要补一句「我刚换了模型就出这个」。 */
const MAX_NOTE_CHARS = 1000
/** 日志尾部行数。够看到失败前后那一小段，不够重建他这一天干了什么。 */
const MAX_LOG_LINES = 300
/** 整包上限，留出余量给接收端的 2MB。 */
export const FEEDBACK_REPORT_MAX_BYTES = 1_200_000

const SURFACE_SET: ReadonlySet<string> = new Set(FEEDBACK_SURFACES)

export type FeedbackReportDeps = {
  now: Date
  app: { version: string; electron: string; node: string; chrome: string }
  system: { platform: string; arch: string; osRelease: string; locale: string; timeZone: string }
  projectId: string | null
  /** 日志尾部（已按行给出，未截断）。拿不到就给 null，清单里写原因。 */
  readLogTail(maxLines: number): string[] | null
  /** 模型目录原文（未脱敏）。拿不到给 null。 */
  readModelCatalog(): unknown | null
  /** 这一回合的轨迹入料。拿不到给 null，清单里写原因。 */
  readTrajectory(laneName: string): Promise<TrajectoryTurnInput[] | null>
}

export type FeedbackReportPayload = {
  schemaVersion: 1
  manifest: DiagnosticsBundleManifest
  context: {
    surface: FeedbackSurface
    /** 已经派生好的那句人话（仍过一遍第二道网：它可能带着服务商原话里的一段 URL）。 */
    summary: string
    errorCode: string | null
    note: string | null
    contentIncluded: boolean
    provider: string | null
    model: string | null
  }
  /** 清单里列到的东西，逐项放在这里。清单与内容一一对应，不许有清单里没写的格。 */
  attachments: Record<string, unknown>
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  // 第二道网：摘要与留言都可能带着一段服务商原话里的签名 URL，或用户顺手粘的路径。
  const clean = redactLogValue(value).trim()
  return clean.length > max ? clean.slice(0, max) : clean
}

/**
 * 供应商身份只放**渲染层已经脱敏过的那一格**（`buildFeedbackDiagnostics` 的产物：
 * 策展供应商原样、ComfyUI 塌成 `comfyui-local`、用户自建塌成字面量 `custom`）。
 * 这里再收一次形状，防的是「有人绕过那一层直接调 IPC」。
 */
function identity(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const clean = value.trim()
  if (!clean || clean.length > 64) return null
  return /^[a-z0-9][a-z0-9._-]*$/i.test(clean) ? clean : 'custom'
}

function bytesOf(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8')
}

export function isFeedbackReportRequest(value: unknown): value is FeedbackReportRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const request = value as Record<string, unknown>
  if (!SURFACE_SET.has(String(request.surface))) return false
  if (typeof request.summary !== 'string' || !request.summary.trim()) return false
  if (request.note !== undefined && typeof request.note !== 'string') return false
  if (request.errorCode !== undefined && typeof request.errorCode !== 'string') return false
  if (request.laneName !== undefined && typeof request.laneName !== 'string') return false
  if (request.includeContent !== undefined && typeof request.includeContent !== 'boolean') return false
  return true
}

/**
 * 组一份反馈包。
 *
 * 顺序：先把每一项取出来并脱敏，再算体积，**清单最后写** —— 这样清单描述的一定是
 * 最终真的带上的那些东西，而不是我们打算带的那些（`diagnosticsBundle.ts` 的同一条纪律）。
 */
export async function buildFeedbackReport(
  request: FeedbackReportRequest,
  deps: FeedbackReportDeps,
): Promise<FeedbackReportPayload> {
  const entries: DiagnosticsBundleEntry[] = []
  const excluded: DiagnosticsBundleExclusion[] = []
  const attachments: Record<string, unknown> = {}
  const includeContent = request.includeContent === true

  const add = (path: string, value: unknown, what: string): void => {
    const bytes = bytesOf(value)
    const used = entries.reduce((sum, entry) => sum + entry.bytes, 0)
    if (used + bytes > FEEDBACK_REPORT_MAX_BYTES) {
      excluded.push({ what: path, why: 'report-size-limit' })
      return
    }
    attachments[path] = value
    entries.push({ path, bytes, what })
  }

  // ① 日志尾部。写入时就脱敏过了（`electron/logging/redact.ts` 是 logger 的第二道网），
  //    这里再过一遍：老日志文件可能是脱敏规则收紧之前写下的。
  const logLines = deps.readLogTail(MAX_LOG_LINES)
  if (logLines === null) {
    excluded.push({ what: 'logs/tail.txt', why: 'logs-unavailable' })
  } else {
    add('logs/tail.txt', logLines.map((line) => redactLogValue(line)), `最近 ${logLines.length} 行主进程日志（写入时已脱敏，此处再过一遍）`)
  }

  // ② 模型目录。它是「为什么这个模型不工作」最有用的一份，密钥由 redactModelCatalog 抹掉。
  const catalog = deps.readModelCatalog()
  if (catalog === null) {
    excluded.push({ what: 'model-catalog.json', why: 'catalog-unavailable' })
  } else {
    add('model-catalog.json', redactModelCatalog(catalog as never), '模型目录（密钥、代理地址、自定义头全部抹掉）')
  }

  // ③ 这一回合的轨迹。字段白名单在 trajectoryProjection.ts，不在这里——
  //    组包层不该有第二套「什么能出门」的判据。
  if (!request.laneName) {
    excluded.push({ what: 'trajectory/turns.json', why: 'no-conversation-in-context' })
  } else {
    let turns: TrajectoryTurnInput[] | null = null
    try {
      turns = await deps.readTrajectory(request.laneName)
    } catch {
      turns = null
    }
    if (turns === null) {
      excluded.push({ what: 'trajectory/turns.json', why: 'trajectory-unavailable' })
    } else {
      const envelope = projectLaneTrajectory(turns, { includeContent, maxTurns: 3 })
      add(
        'trajectory/turns.json',
        envelope,
        includeContent
          ? '最近 3 个回合：工具名、参数结构、耗时、token —— 外加你勾选带上的提示词与文稿'
          : '最近 3 个回合：工具名、参数**结构**（只有键名）、耗时、token。提示词、文稿、工具结果都不在里面',
      )
    }
  }

  // 永远排除的三类，逐条写清原因（D4：包里没有什么，比包里有什么更容易引起误解）。
  excluded.push({ what: 'API keys / tokens / proxy credentials', why: 'never-collected-by-design' })
  excluded.push({ what: 'file paths / project paths / asset paths', why: 'never-collected-by-design' })
  if (!includeContent) {
    excluded.push({ what: 'prompts / manuscripts / tool results', why: 'content-checkbox-not-ticked' })
  }
  excluded.push({ what: 'full logs / Agent command ledger / project artifacts', why: 'available-only-via-settings-diagnostics-export' })

  const manifest: DiagnosticsBundleManifest = {
    schemaVersion: 1,
    createdAt: deps.now.toISOString(),
    app: deps.app,
    system: deps.system,
    projectId: deps.projectId,
    entries,
    excluded,
    totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
  }

  return {
    schemaVersion: 1,
    manifest,
    context: {
      surface: request.surface,
      summary: text(request.summary, MAX_SUMMARY_CHARS),
      errorCode: typeof request.errorCode === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(request.errorCode.trim())
        ? request.errorCode.trim()
        : null,
      note: text(request.note, MAX_NOTE_CHARS) || null,
      contentIncluded: includeContent,
      provider: identity(request.provider),
      model: identity(request.model),
    },
    attachments,
  }
}
