// 一键反馈的 Electron 那一半：取料（日志 / 模型目录 / 轨迹）、发送、返回编号。
//
// 两件事在这里定死，别挪进渲染层：
//   ① **不受「帮 Nomi 变好」开关管**（2026-09-15 用户拍板④：反馈是他主动点的）。
//      所以这里一个字都不读 `readTelemetrySettings()`。
//   ② **永不阻塞 UI**：发送失败就入队静默重试，IPC 立刻返回，界面不等网络。
import { app, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { assertTrustedSender } from '../ipcSenderGuard'
import { getSettingsRoot } from '../settings/settingsRoot'
import { logsDir, listLogFilesForBundle } from '../logging/logFiles'
import { activeTaskProjectFallback } from '../tasks/activeProjectFallback'
import { getWorkspaceRepositoryDeps } from '../runtimePaths'
import { resolveWorkspaceProjectDir } from '../workspace/workspaceRepository'
import { getDesktopLocale } from '../desktopLocale'
import { intakeConfigured, postIntake } from '../telemetry/intakeClient'
import { enqueueIntake, flushIntakeQueue } from '../telemetry/intakeQueue'
import type { TrajectoryTurnInput } from '../shared/agentLane/laneTrajectory'
import type { FeedbackReportPreview, FeedbackSendResult } from '../shared/contracts/feedback'
import { buildFeedbackReport, isFeedbackReportRequest, type FeedbackReportDeps } from './feedbackReport'

/** 日志尾部读多少字节就够凑出 300 行。整文件可能有 4MB，没必要全读进内存。 */
const LOG_TAIL_BYTES = 256 * 1024

function readLogTail(maxLines: number): string[] | null {
  try {
    const [newest] = listLogFilesForBundle(logsDir())
    if (!newest) return null
    const stat = fs.statSync(newest)
    const start = Math.max(0, stat.size - LOG_TAIL_BYTES)
    const handle = fs.openSync(newest, 'r')
    try {
      const buffer = Buffer.alloc(Math.min(LOG_TAIL_BYTES, stat.size))
      fs.readSync(handle, buffer, 0, buffer.length, start)
      // 从中间开始读会把第一行切一半——丢掉它，半行日志没有信息只有误导。
      const lines = buffer.toString('utf8').split('\n')
      if (start > 0) lines.shift()
      return lines.filter((line) => line.trim()).slice(-maxLines)
    } finally {
      fs.closeSync(handle)
    }
  } catch {
    return null
  }
}

function readModelCatalog(): unknown | null {
  try {
    const file = path.join(getSettingsRoot(), 'model-catalog.json')
    return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
  } catch {
    // 解不出来就整份不带：解不出来就保证不了脱敏（diagnosticsBundle.ts 的同一条判断）。
    return null
  }
}

async function readTrajectory(laneName: string): Promise<TrajectoryTurnInput[] | null> {
  try {
    const projectId = activeTaskProjectFallback()
    if (!projectId) return null
    const projectDir = resolveWorkspaceProjectDir(projectId, getWorkspaceRepositoryDeps())
    if (!projectDir) return null
    // 跨编译岛只走这座桥（pi 是 ESM-only）。桥的返回类型就是形状漂移守卫。
    const native = createRequire(__filename)('../agentLane/laneNativeLoader.cjs') as {
      readLaneTraceTurns(projectDir: string, laneName: string): Promise<TrajectoryTurnInput[]>
    }
    return await native.readLaneTraceTurns(projectDir, laneName)
  } catch {
    return null
  }
}

function reportDeps(): FeedbackReportDeps {
  return {
    now: new Date(),
    app: {
      version: app.getVersion(),
      electron: process.versions.electron ?? 'unknown',
      node: process.versions.node ?? 'unknown',
      chrome: process.versions.chrome ?? 'unknown',
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      osRelease: process.getSystemVersion?.() ?? '',
      locale: getDesktopLocale(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
    },
    projectId: activeTaskProjectFallback() || null,
    readLogTail,
    readModelCatalog,
    readTrajectory,
  }
}

export function registerFeedbackIpc(): void {
  // 「查看」：把清单给他看。每项一行 what，没带的一行 why。不发任何东西。
  ipcMain.handle('nomi:feedback:preview', async (event, payload: unknown): Promise<FeedbackReportPreview | null> => {
    assertTrustedSender(event)
    if (!isFeedbackReportRequest(payload)) return null
    const report = await buildFeedbackReport(payload, reportDeps())
    return { manifest: report.manifest }
  })

  ipcMain.handle('nomi:feedback:send', async (event, payload: unknown): Promise<FeedbackSendResult> => {
    assertTrustedSender(event)
    if (!isFeedbackReportRequest(payload)) return { ok: false, reason: 'invalid' }
    // 这个构建没配接收端就是真的发不出去。跟用户说「已排队」等于骗他（D4：缺口明着标）。
    if (!intakeConfigured()) return { ok: false, reason: 'endpoint-unconfigured' }

    let report: Awaited<ReturnType<typeof buildFeedbackReport>>
    try {
      report = await buildFeedbackReport(payload, reportDeps())
    } catch {
      return { ok: false, reason: 'failed' }
    }

    try {
      const result = await postIntake('/v1/feedback', report)
      // 顺手把上次没发出去的也带走——用户这次联网了。
      void flushIntakeQueue('feedback')
      return { ok: true, id: result.id ?? null, queued: false }
    } catch {
      // 发不出去不许把这份报告丢了：他已经点过「发送」。入队 + 静默重试。
      enqueueIntake('feedback', report)
      return { ok: true, id: null, queued: true }
    }
  })
}

/** App 起来时把上次没发出去的反馈补发掉。失败无声——用户已经拿到过回执。 */
export function flushPendingFeedback(): void {
  void flushIntakeQueue('feedback')
}
