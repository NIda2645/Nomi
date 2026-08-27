import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workflowPath = path.join(repoRoot, '.github/workflows/quality-gate.yml')
const workflow = fs.readFileSync(workflowPath, 'utf8').replaceAll('\r\n', '\n')

test('quality gate runs for pull requests and main pushes without feature-branch push duplication', () => {
  const triggerBlock = workflow.match(/^on:\n([\s\S]*?)\npermissions:/m)?.[1]
  assert.ok(triggerBlock, 'quality-gate.yml must keep an explicit trigger block')
  assert.match(triggerBlock, /  push:\n    branches:\n      - main\n/)
  assert.match(triggerBlock, /  pull_request:\n/)
  assert.doesNotMatch(triggerBlock, /feat\/\*\*|fix\/\*\*/)
})

test('quality gate cancels only obsolete runs in the same PR or main lane', () => {
  assert.match(
    workflow,
    /concurrency:\n  group: quality-gate-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}\n  cancel-in-progress: true\n/,
  )
  assert.match(
    workflow,
    /VOCAB_BASE_REF: \$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.event\.before \}\}/,
  )
})
