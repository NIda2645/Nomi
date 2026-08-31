import type { createProductionRunService } from './productionRunService'

type ProductionService = ReturnType<typeof createProductionRunService>

/**
 * 等 detached driver（`void driveGeneration(...)` 这类）把条件跑成立。
 *
 * 这是全仓**唯一**一份等待实现 —— 曾经有 10 份复制粘贴散在各 test 文件里，默认超时从 500 一路飘到
 * 5000（5000 = testTimeout 本身，等于永远轮不到它先响，只是在给 flake 打补丁）。真正的 flake 根因是
 * 每次写盘都真 fsync，已在 `electron/durability.ts` 修掉；单测现在整体跑在 ephemeral 模式，
 * 这些编排测试的墙钟从 ~4.9 s 掉到 ~0.2 s。
 *
 * 预算为什么是 20s 不是 2s：测试自己不 fsync 了，但邻居进程打满文件系统时（多 worktree 并行跑
 * gates），外部负载仍能把链路拖几十倍（2026-08-25 实测 8 个 fsync 锤子下 2s/5s 双双顶穿）。
 * 这里的上限只该拦「条件永远不成立」的真回归，不给机器排队计时——低于 vitest testTimeout（30s），
 * 保证先抛出**带条件源码**的错误，而不是被 vitest 一刀切成看不出在等什么的 timeout。
 *
 * 超时信息带上 check 的源码 —— 「waitFor timed out」看不出在等什么，
 * 打印出条件本身能直接定位是哪一步没推进。
 */
const WAIT_TIMEOUT_MS = 20_000

export async function waitForProduction(
  check: () => boolean,
  timeoutMs = WAIT_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!check() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5))
  if (!check()) throw new Error(`waitFor timed out after ${timeoutMs}ms waiting for: ${check.toString()}`)
}

/** Move legacy production fixtures through the same script review gate as the
 * real Agent path. Tests that care about later gates should not bypass it. */
export async function approveLatestScript(
  service: ProductionService,
  projectId: string,
  runId: string,
): Promise<void> {
  await waitForProduction(() => service.readFull(projectId, runId).artifacts.some((artifact) => artifact.kind === 'script'))
  const run = service.readFull(projectId, runId)
  const script = [...run.artifacts].reverse().find((artifact) => artifact.kind === 'script' && artifact.status === 'candidate')
  if (!script) throw new Error('script candidate missing in test fixture')
  await service.command(projectId, runId, {
    commandId: `approve-script-${runId}`,
    expectedRevision: run.revision,
    type: 'script.review',
    payload: { artifactId: script.artifactId, decision: 'approved' },
    issuedAt: new Date().toISOString(),
  })
  await waitForProduction(() => service.readFull(projectId, runId).artifacts.some((artifact) => artifact.kind === 'storyboard'))
}

export async function approveLatestStoryboard(
  service: ProductionService,
  projectId: string,
  runId: string,
): Promise<void> {
  await waitForProduction(() => service.readFull(projectId, runId).artifacts.some((artifact) => artifact.kind === 'storyboard'))
  const run = service.readFull(projectId, runId)
  const storyboard = [...run.artifacts].reverse().find((artifact) => artifact.kind === 'storyboard' && artifact.status === 'candidate')
  if (!storyboard) throw new Error('storyboard candidate missing in test fixture')
  await service.command(projectId, runId, {
    commandId: `approve-storyboard-${runId}`,
    expectedRevision: run.revision,
    type: 'artifact.review',
    payload: { artifactId: storyboard.artifactId, decision: 'approved' },
    issuedAt: new Date().toISOString(),
  })
}
