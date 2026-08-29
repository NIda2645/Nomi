import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'
import { PROFILES, STAGES } from '../tests/system/profiles.mjs'
import { classifyChangedFiles, isHighRiskPath } from './select-quality-gate-profile.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workflowPath = path.join(repoRoot, '.github/workflows/quality-gate.yml')
const workflowSource = fs.readFileSync(workflowPath, 'utf8')
const workflow = load(workflowSource)
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))

const runCommands = (job) => job.steps?.flatMap((step) => (typeof step.run === 'string' ? [step.run] : [])) ?? []

test('quality gate runs for pull requests and main pushes without feature-branch push duplication', () => {
  assert.deepEqual(workflow.on, {
    push: { branches: ['main'] },
    pull_request: null,
    workflow_dispatch: {
      inputs: {
        base_ref: {
          description: 'Reachable vocabulary baseline for a manual current-HEAD recovery run',
          required: false,
          default: 'origin/main',
          type: 'string',
        },
        validation_mode: {
          description: 'Manual runs are always full; keep this explicit for auditability',
          required: false,
          default: 'full',
          type: 'choice',
          options: ['full'],
        },
      },
    },
  })
})

test('quality gate cancels only obsolete runs in the same PR or main lane', () => {
  assert.deepEqual(workflow.concurrency, {
    group: 'quality-gate-${{ github.event.pull_request.number || github.ref }}',
    'cancel-in-progress': true,
  })
  assert.equal(
    workflow.jobs.contracts.env.VOCAB_BASE_REF,
    '${{ github.event.pull_request.base.sha || github.event.before || inputs.base_ref }}',
  )
  assert.equal(
    workflow.jobs.contracts.env.ROOT_CAUSE_BASE_REF,
    '${{ github.event.pull_request.base.sha || github.event.before || inputs.base_ref }}',
  )
})

test('parallel CI profiles preserve the complete legacy Ubuntu coverage set', () => {
  assert.deepEqual(PROFILES['ci-contracts'], ['contracts'])
  assert.deepEqual(PROFILES['ci-unit'], ['unit'])
  assert.deepEqual(PROFILES['ci-desktop'], ['build', 'e2e', 'canvas-critical', 'journeys-ci'])

  const stageUnion = new Set([...PROFILES['ci-contracts'], ...PROFILES['ci-unit'], ...PROFILES['ci-desktop']])
  assert.deepEqual(
    [...stageUnion].sort(),
    ['build', 'canvas-critical', 'contracts', 'e2e', 'journeys-ci', 'unit'],
  )
  assert.deepEqual([STAGES.contracts.command, ...STAGES.contracts.args], ['pnpm', 'run', 'gates:contracts'])
  assert.deepEqual(
    [STAGES['canvas-critical'].command, ...STAGES['canvas-critical'].args],
    ['pnpm', 'run', 'test:canvas:critical'],
  )
})

test('package scripts keep local gates whole while exposing canonical CI profiles', () => {
  const scripts = packageJson.scripts
  assert.equal(scripts['test:system:contracts'], 'node scripts/test-system.mjs ci-contracts')
  assert.equal(scripts['test:system:unit'], 'node scripts/test-system.mjs ci-unit')
  assert.equal(scripts['test:system:desktop'], 'node scripts/test-system.mjs ci-desktop')
  assert.equal(scripts['test:system:focused'], 'node scripts/test-focused.mjs')
  assert.equal(
    scripts['check:quality-gate-workflow'],
    'node --test ./scripts/check-quality-gate-workflow.node-test.mjs ./scripts/test-focused.node-test.mjs',
  )

  const localGateCommands = scripts.gates.split('&&').map((command) => command.trim())
  assert.equal(localGateCommands[0], 'pnpm run gates:contracts')
  assert.deepEqual(localGateCommands.slice(1, 3), ['pnpm run test', 'pnpm run build'])

  const contractCommands = scripts['gates:contracts'].split('&&').map((command) => command.trim())
  assert.ok(contractCommands.includes('pnpm run lint:ci'))
  assert.ok(contractCommands.includes('pnpm run typecheck'))
  assert.ok(contractCommands.includes('pnpm run check:test-types'))
  assert.ok(!contractCommands.includes('pnpm run test'))
  assert.ok(!contractCommands.includes('pnpm run build'))
})

test('workflow selects a fast lane for ordinary PRs and keeps contracts mandatory', () => {
  const scope = workflow.jobs.scope
  assert.ok(scope)
  assert.match(runCommands(scope).join('\n'), /select-quality-gate-profile\.mjs/)
  assert.deepEqual(scope.outputs, {
    mode: '${{ steps.profile.outputs.mode }}',
    reason: '${{ steps.profile.outputs.reason }}',
    changed_count: '${{ steps.profile.outputs.changed_count }}',
  })

  const contracts = workflow.jobs.contracts
  assert.equal(contracts.needs, undefined)
  assert.equal(contracts.if, undefined)
  assert.ok(runCommands(contracts).includes('pnpm run test:system:contracts'))

  const unit = workflow.jobs.unit
  assert.equal(unit.needs, 'scope')
  assert.ok(runCommands(unit).includes('pnpm run test:system:unit'))
  assert.ok(runCommands(unit).includes('pnpm run test:system:focused'))
  assert.match(
    unit.steps.find((step) => typeof step.name === 'string' && step.name.includes('full lane')).if,
    /mode == 'full'/,
  )
  assert.match(
    unit.steps.find((step) => typeof step.name === 'string' && step.name.includes('fast lane')).if,
    /mode == 'fast'/,
  )

  for (const jobId of ['desktop-linux', 'mac-package']) {
    const job = workflow.jobs[jobId]
    assert.equal(job.needs, 'scope')
    assert.match(job.if, /needs\.scope\.outputs\.mode == 'full'/)
  }
})

test('quality-gate classifier promotes only high-risk or release-boundary changes to full', () => {
  assert.equal(classifyChangedFiles(['README.md']).mode, 'fast')
  assert.equal(classifyChangedFiles([{ status: 'M', path: 'src/workbench/foo.ts' }]).mode, 'fast')
  assert.equal(classifyChangedFiles([]).reason, 'empty_diff_fail_closed')
  assert.equal(classifyChangedFiles(['electron/providerAdapter/service.ts']).mode, 'full')
  assert.equal(classifyChangedFiles(['electron/assets/projectAssetStore.ts']).mode, 'full')
  assert.equal(classifyChangedFiles(['electron/catalog/comfyuiWorkflowImport.ts']).mode, 'full')
  assert.equal(classifyChangedFiles(['electron/ai/onboarding/modelListProbe.ts']).mode, 'full')
  assert.equal(classifyChangedFiles(['electron/export/mediaProbe.ts']).mode, 'full')
  assert.equal(classifyChangedFiles(['electron/networkHostPolicy.ts']).mode, 'full')
  assert.equal(classifyChangedFiles(['src/config/modelCatalogCache.ts']).mode, 'full')
  assert.equal(classifyChangedFiles(['src/desktop/bridge.ts']).mode, 'full')
  assert.equal(classifyChangedFiles(['tests/ux/smoke.e2e.mjs']).mode, 'full')
  assert.equal(classifyChangedFiles(['scripts/test-focused.mjs']).mode, 'full')
  assert.equal(classifyChangedFiles(['vite.config.ts']).mode, 'full')
  assert.equal(classifyChangedFiles(['package.json']).mode, 'full')
  assert.equal(classifyChangedFiles([{ status: 'D', path: 'src/workbench/foo.ts' }]).mode, 'full')
  assert.equal(classifyChangedFiles(['README.md'], { eventName: 'push' }).mode, 'full')
  assert.equal(classifyChangedFiles(['README.md'], { requestedMode: 'full' }).reason, 'explicit_full_validation')
  assert.equal(isHighRiskPath('electron/integrationCertification/connector.ts'), true)
  assert.equal(isHighRiskPath('src/workbench/timeline/TimelinePanel.tsx'), false)
})

test('desktop evidence and the complete Mac package path remain required', () => {
  const desktop = workflow.jobs['desktop-linux']
  const evidence = desktop.steps.find((step) => step.uses === 'actions/upload-artifact@v4')
  assert.equal(evidence.if, 'always()')
  assert.equal(evidence.with.name, 'linux-walkthrough-evidence')
  assert.match(evidence.with.path, /evals\/runs\/\*\*\/screenshots\/\*\*/)
  assert.match(evidence.with.path, /evals\/runs\/\*\*\/output\.jsonl/)
  assert.match(evidence.with.path, /outputs\/canvas-acceptance\/\*\*/)
  assert.match(evidence.with.path, /outputs\/canvas-smoke\/\*\*/)
  assert.match(evidence.with.path, /outputs\/canvas-card-stack-20260827\/\*\*/)
  assert.match(evidence.with.path, /tests\/ux\/shots\/canvas-drag-pan-gestures\/\*\*/)
  assert.match(evidence.with.path, /tests\/ux\/shots\/group-ports\/\*\*/)
  assert.match(evidence.with.path, /tests\/ux\/shots\/react-flow-read-only\/\*\*/)

  const macPackage = workflow.jobs['mac-package']
  assert.equal(macPackage.needs, 'scope')
  assert.match(macPackage.if, /needs\.scope\.outputs\.mode == 'full'/)
  assert.deepEqual(runCommands(macPackage), [
    'pnpm install --frozen-lockfile',
    'pnpm run build',
    'pnpm run dist:mac:dir',
    'codesign --verify --deep --strict --verbose=4 release/mac-arm64/Nomi.app',
  ])
})

test('Quality Gate aggregator fails closed unless every required job succeeds', () => {
  const quality = workflow.jobs.quality
  assert.deepEqual(quality.needs, ['scope', 'contracts', 'unit', 'desktop-linux', 'mac-package'])
  assert.equal(quality.if, '${{ always() }}')
  assert.equal(quality.name, 'Quality Gate')

  const command = runCommands(quality).join('\n')
  for (const jobId of ['scope', 'contracts', 'unit']) {
    const resultExpression = jobId.includes('-') ? `needs\\['${jobId}'\\]\\.result` : `needs\\.${jobId}\\.result`
    assert.match(command, new RegExp(resultExpression))
    assert.match(command, new RegExp(`${resultExpression} \\}\\}.*success`))
  }
  assert.match(command, /needs\.scope\.outputs\.mode/)
  assert.match(command, /needs\['desktop-linux'\]\.result/)
  assert.match(command, /needs\['mac-package'\]\.result/)
})
