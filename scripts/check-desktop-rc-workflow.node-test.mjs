import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workflow = load(fs.readFileSync(path.join(repoRoot, '.github/workflows/desktop-rc.yml'), 'utf8'))

test('desktop RC collects every release-critical journey before deciding', () => {
  const steps = workflow.jobs.validate.steps
  const names = [
    'Clip editing journey',
    'Production MCP journey',
    'MCP journey suite',
    'MCP elicitation journey',
    'Canvas performance RC journey',
  ]
  for (const name of names) {
    const step = steps.find((candidate) => candidate.name === name)
    assert.ok(step, `${name} must remain in the RC workflow`)
    assert.equal(step['continue-on-error'], true, `${name} must not hide later release-critical failures`)
    assert.ok(step.id, `${name} needs an id for the final outcome summary`)
    assert.equal(typeof step.run, 'string')
  }

  const summary = steps.find((step) => step.name === 'Release-critical journey summary')
  assert.ok(summary)
  assert.equal(summary.if, 'always()')
  assert.equal(summary.run, 'node scripts/summarize-e2e-chain.mjs')
  assert.equal(summary['continue-on-error'], undefined)
  assert.match(summary.env.CHAIN, /clip:\$\{\{ steps\.clip\.outcome \}\}/)
  assert.match(summary.env.CHAIN, /canvas-performance:\$\{\{ steps\.canvas-performance\.outcome \}\}/)

  const upload = steps.find((step) => step.name === 'Upload release-critical evidence')
  assert.ok(upload)
  assert.equal(upload.if, 'always()')
  assert.equal(upload.uses, 'actions/upload-artifact@v4')
})
