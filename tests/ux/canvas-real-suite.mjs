import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const DEFAULT_CANVAS_SCENARIO_TIMEOUT_MS = 8 * 60_000
export const PERFORMANCE_CANVAS_SCENARIO_TIMEOUT_MS = 20 * 60_000

export const CRITICAL_CANVAS_SCENARIOS = [
  { id: 'gestures', script: 'tests/ux/canvas-drag-pan-gestures.walk.mjs' },
  { id: 'group-ports', script: 'tests/ux/group-ports.walk.mjs' },
  { id: 'card-stack-persistence', script: 'tests/ux/canvas-card-stack.walk.mjs' },
  { id: 'read-only-reload', script: 'tests/ux/react-flow-read-only.walk.mjs' },
]

export const FULL_CANVAS_SCENARIOS = [
  ...CRITICAL_CANVAS_SCENARIOS,
  { id: 'shortcuts', script: 'tests/ux/canvas-shortcuts.walk.mjs' },
  { id: 'node-context-menu', script: 'tests/ux/canvas-node-context-menu.walk.mjs' },
  { id: 'blank-context-menu', script: 'tests/ux/canvas-context-menu-click.walk.mjs' },
  { id: 'batch-production', script: 'tests/ux/canvas-batch-production.walk.mjs' },
  { id: 'selection-toolbar', script: 'tests/ux/selection-toolbar-vendor.walk.mjs' },
  { id: 'group-baseline', script: 'tests/ux/group-baseline.walk.mjs' },
  { id: 'group-reference-direction', script: 'tests/ux/group-reference-direction.walk.mjs' },
  { id: 'canvas-landing', script: 'tests/ux/p4-s5-canvas-landing.e2e.mjs' },
  { id: 'canvas-reconcile', script: 'tests/ux/p4-s5-canvas-reconcile.e2e.mjs' },
  {
    id: 'medium-canvas-performance',
    script: 'tests/ux/canvas-performance-benchmark.e2e.mjs',
    args: ['pr216-acceptance', '--scale', 'M', '--runs', '1'],
    timeoutMs: PERFORMANCE_CANVAS_SCENARIO_TIMEOUT_MS,
  },
]

export function scenariosForProfile(profile) {
  if (profile === 'critical') return CRITICAL_CANVAS_SCENARIOS
  if (profile === 'full') return FULL_CANVAS_SCENARIOS
  throw new Error(`unknown canvas suite profile: ${profile}`)
}

export function runCanvasScenario(scenario, {
  cwd = repoRoot,
  env = process.env,
  spawnProcess = spawnSync,
  timeoutMs,
} = {}) {
  const resolvedTimeoutMs = timeoutMs ?? scenario.timeoutMs ?? DEFAULT_CANVAS_SCENARIO_TIMEOUT_MS
  const startedAt = Date.now()
  const child = spawnProcess(process.execPath, [scenario.script, ...(scenario.args || [])], {
    cwd,
    env,
    stdio: 'inherit',
    timeout: resolvedTimeoutMs,
    killSignal: 'SIGKILL',
  })
  const timedOut = child.error?.code === 'ETIMEDOUT'
  if (timedOut) console.error(`[canvas] ${scenario.id} exceeded ${resolvedTimeoutMs}ms and was terminated`)
  return {
    id: scenario.id,
    script: scenario.script,
    args: scenario.args || [],
    exitCode: child.status ?? 1,
    signal: child.signal,
    timedOut,
    timeoutMs: resolvedTimeoutMs,
    error: child.error ? String(child.error.message || child.error) : null,
    durationMs: Date.now() - startedAt,
  }
}

export function runCanvasSuite(profile, { cwd = repoRoot, env = process.env } = {}) {
  const outputDir = path.join(cwd, 'outputs', 'canvas-acceptance', profile)
  fs.rmSync(outputDir, { recursive: true, force: true })
  fs.mkdirSync(outputDir, { recursive: true })
  const results = []

  for (const scenario of scenariosForProfile(profile)) {
    console.log(`\n[canvas:${profile}] ${scenario.id}`)
    results.push(runCanvasScenario(scenario, { cwd, env }))
  }

  const summary = {
    profile,
    passed: results.filter((result) => result.exitCode === 0).length,
    failed: results.filter((result) => result.exitCode !== 0).length,
    results,
  }
  fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2))
  return summary
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const summary = runCanvasSuite(process.argv[2] || 'critical')
    console.log(`\ncanvas-${summary.profile}: ${summary.failed === 0 ? 'PASS' : 'FAIL'} (${summary.passed}/${summary.results.length})`)
    process.exit(summary.failed === 0 ? 0 : 1)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
