import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

test('SEO radar is weekly, manually triggerable, and report-only', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/seo-radar.yml'), 'utf8')
  assert.match(workflow, /schedule:/)
  assert.match(workflow, /cron: ['"]\d+ \d+ \* \* \d['"]/)
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /contents: write/)
  assert.match(workflow, /pull-requests: write/)
  assert.match(workflow, /pnpm (run )?seo:audit/)
  assert.match(workflow, /docs\/seo\/data|docs\/seo\/reports/)
  assert.match(workflow, /peter-evans\/create-pull-request@v7/)
  assert.match(workflow, /add-paths:/)
  assert.match(workflow, /continue-on-error: true/)
  assert.match(workflow, /if: always\(\)/)
  assert.doesNotMatch(workflow, /git push/)
  assert.doesNotMatch(workflow, /git add -A|git add \.\s*$/)
})
