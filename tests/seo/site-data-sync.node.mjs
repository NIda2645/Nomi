import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

// .github/workflows/site-data-sync.yml 的合同：每周一次、能手动触发、只开一个只含 marketing/ 的 PR、绝不直接写 main、
// 用的是 package.json 里真有的 build:site，PR 正文来自「缺介绍」清单脚本。

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const load = () => yaml.load(fs.readFileSync(path.join(root, '.github/workflows/site-data-sync.yml'), 'utf8'))
const scripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts

export function workflowProblems(workflow) {
  const problems = []
  const triggers = workflow.on ?? workflow.true
  if (!triggers?.schedule?.some((entry) => /^\S+ \S+ \S+ \S+ [0-6]$/.test(String(entry.cron).trim()))) problems.push('没有「每周一次」的 cron')
  if (!('workflow_dispatch' in (triggers ?? {}))) problems.push('不能手动触发')
  const steps = Object.values(workflow.jobs).flatMap((job) => job.steps)
  const pullRequest = steps.find((step) => String(step.uses ?? '').startsWith('peter-evans/create-pull-request@'))
  if (!pullRequest) problems.push('没有用 peter-evans/create-pull-request 开 PR')
  else {
    const addPaths = String(pullRequest.with?.['add-paths'] ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
    if (addPaths.length !== 1 || addPaths[0] !== 'marketing/') problems.push(`PR 只许含 marketing/，现在是 ${JSON.stringify(addPaths)}`)
    if (!String(pullRequest.with?.['body-path'] ?? '').includes('site-data-sync-body.md')) problems.push('PR 正文不是来自缺介绍清单')
    if (pullRequest.with?.branch === 'main') problems.push('PR 分支不能是 main')
  }
  const commands = steps.map((step) => String(step.run ?? '')).join('\n')
  if (/\bgit\s+push\b/.test(commands)) problems.push('不许直接 git push')
  if (!/\bpnpm run build:site\b/.test(commands)) problems.push('没有跑 pnpm run build:site（先导出再生成）')
  if (!/model-intro-status\.mjs --markdown/.test(commands)) problems.push('没有生成缺介绍清单')
  if (workflow.permissions?.contents !== 'write' || workflow.permissions?.['pull-requests'] !== 'write') problems.push('权限应该正好是 contents/pull-requests: write')
  return problems
}

test('the site data sync workflow is weekly, site-only and never writes to main', () => {
  assert.deepEqual(workflowProblems(load()), [])
})

test('red: the workflow contract notices a wider add-paths, a direct push, a missing schedule or a missing build step', () => {
  const widened = load()
  Object.values(widened.jobs)[0].steps.find((step) => step.uses?.startsWith('peter-evans')).with['add-paths'] = 'marketing/\nsrc/'
  assert.ok(workflowProblems(widened).some((problem) => /PR 只许含 marketing\//.test(problem)))

  const pushing = load()
  Object.values(pushing.jobs)[0].steps.push({ run: 'git push origin HEAD:main' })
  assert.ok(workflowProblems(pushing).some((problem) => /不许直接 git push/.test(problem)))

  const unscheduled = load()
  delete unscheduled.on.schedule
  assert.ok(workflowProblems(unscheduled).some((problem) => /每周一次/.test(problem)))

  const noBuild = load()
  Object.values(noBuild.jobs)[0].steps = Object.values(noBuild.jobs)[0].steps.filter((step) => !String(step.run ?? '').includes('build:site'))
  assert.ok(workflowProblems(noBuild).some((problem) => /build:site/.test(problem)))
})

test('every pnpm script the workflow runs exists in package.json', () => {
  const commands = Object.values(load().jobs).flatMap((job) => job.steps).map((step) => String(step.run ?? '')).join('\n')
  for (const match of commands.matchAll(/\bpnpm run ([\w:-]+)/g)) assert.ok(scripts[match[1]], `package.json has no script ${match[1]}`)
})
