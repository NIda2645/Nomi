import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

export const PRODUCTION_E2E_FIXTURE_PROVIDER = 'nomi-e2e-fixture'
export const PRODUCTION_E2E_FIXTURE_MODEL = 'nomi-e2e-fixture-video'

type FixtureEnvironment = Partial<Record<'NOMI_E2E' | 'NOMI_E2E_PRODUCTION_FIXTURE', string | undefined>>

type FixtureOptions = {
  projectRootResolver: (projectId: string) => string | null
  ffmpegPath?: string
}

function bundledFfmpegPath(): string {
  try {
    const loadFixtureDependency = createRequire(__filename)
    return String((loadFixtureDependency('@ffmpeg-installer/ffmpeg') as { path?: string }).path || '')
  } catch {
    return ''
  }
}

export function isProductionRunE2eFixtureEnabled(
  env: FixtureEnvironment,
  isPackaged: boolean,
): boolean {
  return !isPackaged
    && env.NOMI_E2E === '1'
    && env.NOMI_E2E_PRODUCTION_FIXTURE === '1'
}

function identifier(value: unknown, label: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(text) || text === '.' || text === '..') {
    throw new Error(`Invalid fixture ${label}`)
  }
  return text
}

function payloadRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid production fixture payload')
  return value as Record<string, unknown>
}

function runFfmpeg(ffmpegPath: string, args: string[], timeoutMs: number): void {
  if (!ffmpegPath) throw new Error('Bundled FFmpeg is unavailable for the Production E2E fixture')
  const result = spawnSync(ffmpegPath, args, {
    encoding: 'utf8',
    timeout: Math.max(1_000, timeoutMs),
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Production fixture FFmpeg failed: ${String(result.stderr || '').slice(-1_000)}`)
}

function projectAssetUrl(projectId: string, relativePath: string): string {
  return `nomi-local://asset/${encodeURIComponent(projectId)}/${relativePath.split('/').map(encodeURIComponent).join('/')}`
}

export function createProductionRunE2eRenderer(options: FixtureOptions) {
  const ffmpegPath = options.ffmpegPath ?? bundledFfmpegPath()
  const generatedByRun = new Map<string, string[]>()

  return async (operation: string, rawPayload: unknown, timeoutMs: number): Promise<unknown> => {
    const payload = payloadRecord(rawPayload)
    const projectId = identifier(payload.projectId, 'project id')
    const runId = identifier(payload.runId, 'run id')
    const projectRoot = options.projectRootResolver(projectId)
    if (!projectRoot) throw new Error('Production fixture project root is unavailable')

    if (operation === 'production.plan-directions') {
      // B1 方向门候选（fixture，零额度）：让 e2e 真机走查看到「三选一」方向门的真实渲染。
      return {
        candidates: [
          { key: 'documentary', title: 'Documentary warmth', oneLiner: 'Real creators, real desks — an honest local-first workflow.' },
          { key: 'kinetic', title: 'Kinetic product cut', oneLiner: 'Fast beat-synced shots of the canvas and timeline in motion.' },
          { key: 'minimal', title: 'Minimal studio', oneLiner: 'Clean macro shots of UI and typography on seamless backdrops.' },
        ],
      }
    }

    if (operation === 'production.plan-script') {
      return {
        text: '剧本初稿：雨夜里，创作者在本地画布中整理素材，逐镜确认后导出一条完整短片。',
      }
    }

    if (operation === 'production.plan-storyboard') {
      return {
        text: 'Production E2E fixture storyboard',
        plan: {
          title: 'Truthful Nomi production fixture',
          anchors: [],
          shots: Array.from({ length: 8 }, (_, index) => ({
            index: index + 1,
            shotId: `shot-${index + 1}`,
            shotKind: 'video' as const,
            durationSec: 3.75,
            anchorIds: [],
            prompt: `A local Nomi workspace advances through production step ${index + 1}.`,
            subtitle: String(index + 1),
            transition: index < 7
              ? index === 0
                ? { type: 'dissolve' as const, durationFrames: 12 }
                : index === 1
                  ? { type: 'fade' as const, durationFrames: 12 }
                  : { type: 'cut' as const }
              : undefined,
            modelKey: PRODUCTION_E2E_FIXTURE_MODEL,
          })),
        },
      }
    }

    if (operation === 'production.materialize-storyboard') {
      const rawPlan = (payload as Record<string, unknown>).plan
      const plan = rawPlan && typeof rawPlan === 'object' && !Array.isArray(rawPlan)
        ? rawPlan as Record<string, unknown>
        : {}
      const rawShots = Array.isArray(plan.shots) ? plan.shots : []
      const shots = rawShots.length > 0 ? rawShots : Array.from({ length: 8 }, (_, index) => ({ index: index + 1 }))
      const bindings = shots.map((shot, index) => {
        const rawShot = shot && typeof shot === 'object' && !Array.isArray(shot) ? shot as Record<string, unknown> : {}
        const transition = rawShot.transition && typeof rawShot.transition === 'object' && !Array.isArray(rawShot.transition)
          ? rawShot.transition as Record<string, unknown>
          : undefined
        const metadata = {
          ...(typeof rawShot.shotId === 'string' ? { shotId: rawShot.shotId } : {}),
          ...(typeof rawShot.subtitle === 'string' ? { subtitle: rawShot.subtitle } : {}),
          ...(transition ? { transition } : {}),
        }
        return {
        nodeId: `shot-${index + 1}`,
        stageId: 'generate',
        provider: PRODUCTION_E2E_FIXTURE_PROVIDER,
        model: PRODUCTION_E2E_FIXTURE_MODEL,
          ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
        }
      })
      return { createdNodeIds: bindings.map((binding) => binding.nodeId), connectedCount: 0, bindings }
    }

    if (operation === 'production.generate-node') {
      const jobId = typeof payload.jobId === 'string' ? payload.jobId.trim() : ''
      if (!/^[A-Za-z0-9._:-]{1,240}$/.test(jobId)) throw new Error('Invalid fixture job id')
      const nodeId = typeof payload.nodeId === 'string' && payload.nodeId.trim() ? payload.nodeId.trim() : 'shot-1'
      const relativeVideoPath = `assets/generated/fixture-${runId}-${nodeId}.mp4`
      const relativeThumbnailPath = `assets/generated/fixture-${runId}-${nodeId}.jpg`
      const videoPath = path.join(projectRoot, relativeVideoPath)
      const thumbnailPath = path.join(projectRoot, relativeThumbnailPath)
      fs.mkdirSync(path.dirname(videoPath), { recursive: true })
      runFfmpeg(ffmpegPath, [
        '-y',
        // Keep the zero-provider fixture portable: testsrc2 gives us a deterministic,
        // decodable visual without assuming a system font package in CI or packaged builds.
        '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24',
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
        '-t', '3.75',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '96k',
        '-shortest', '-movflags', '+faststart',
        videoPath,
      ], timeoutMs)
      runFfmpeg(ffmpegPath, [
        '-y', '-ss', '0.4', '-i', videoPath, '-frames:v', '1', '-q:v', '2', thumbnailPath,
      ], timeoutMs)
      const key = `${projectId}:${runId}`
      generatedByRun.set(key, [...(generatedByRun.get(key) || []), relativeVideoPath])
      return {
        status: 'succeeded',
        assets: [{
          type: 'video',
          url: projectAssetUrl(projectId, relativeVideoPath),
          thumbnailUrl: projectAssetUrl(projectId, relativeThumbnailPath),
        }],
      }
    }

    if (operation === 'production.arrange') {
      return {
        arranged: 8,
        total: 8,
        placed: Array.from({ length: 8 }, (_, index) => ({ nodeId: `shot-${index + 1}`, role: 'video', startFrame: index * 112 })),
        skipped: [],
        timelineContract: {
          fps: 30,
          durationFrames: 900,
          clips: Array.from({ length: 8 }, (_, index) => ({ shotId: `shot-${index + 1}`, startFrame: index * 112, endFrame: index === 7 ? 900 : (index + 1) * 112 })),
          subtitles: Array.from({ length: 8 }, (_, index) => ({ startFrame: index * 112 + 8, endFrame: Math.min(900, index * 112 + 104), text: String(index + 1) })),
          transitions: [1, 3, 5].map((index) => ({ fromShotId: `shot-${index}`, toShotId: `shot-${index + 1}`, type: 'cut' })),
        },
      }
    }

    if (operation === 'production.verify-shots') {
      // W1.5 qa 阶段审片（fixture，零额度）：让 production journey 测试不悬挂，且能看到 qa.verdict 事件
      // 与 qa 阶段摘要落地。回一个「全部过检」的判决（真判分链路由 L1/L2 覆盖，此处只做端到端不阻断）。
      const rawIds = (payload as Record<string, unknown>).shotNodeIds
      const shotNodeIds = Array.isArray(rawIds)
        ? rawIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        : []
      return {
        reviewedShotIds: shotNodeIds,
        verdicts: shotNodeIds.map((shotNodeId) => ({ shotNodeId, passed: true })),
      }
    }

    if (operation === 'production.export') {
      const sourceRelativePaths = generatedByRun.get(`${projectId}:${runId}`) || []
      if (sourceRelativePaths.length === 0) throw new Error('Production fixture has no generated clip to export')
      const outputName = identifier(payload.outputName, 'output name')
      if (!outputName.endsWith('.mp4')) throw new Error('Production fixture export must be MP4')
      const relativePath = `exports/${outputName}`
      const outputPath = path.join(projectRoot, relativePath)
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
      const concatList = path.join(projectRoot, `.nomi/runs/${runId}/fixture-concat.txt`)
      fs.mkdirSync(path.dirname(concatList), { recursive: true })
      fs.writeFileSync(concatList, sourceRelativePaths.map((relativePath) => `file '${path.join(projectRoot, relativePath).replaceAll("'", "'\\''")}'`).join('\n'))
      runFfmpeg(ffmpegPath, ['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', '-movflags', '+faststart', outputPath], timeoutMs)
      return { relativePath, size: fs.statSync(outputPath).size }
    }

    throw new Error(`Production E2E fixture does not implement ${operation}`)
  }
}
