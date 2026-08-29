import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const FULL_PATH_PATTERNS = [
  /^\.github\/(?:actions|workflows)\//,
  /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|electron-builder\.ya?ml)$/,
  /^(?:eslint|playwright|vite|vitest)\.config\.(?:ts|mts|cts|js|mjs|cjs)$/,
  /^tsconfig[^/]*\.json$/,
  /^electron\//,
  /^src\/.*(?:settings|onboarding|security|credential|model|provider|catalog|comfyui|bridge|generationCanvas\/runner).*\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i,
  /^(?:tests\/agent-runtime|tests\/system|tests\/ux|evals\/model-integration)(?:\/|$)/,
  /^scripts\/(?:check-|test-|select-quality-gate-profile|electron-install-identity|eval-journey|release-contract|.*walkthrough)/,
  /^skills\/model-integration\//,
]

function normalizePath(file) {
  return String(file || '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
}

export function isHighRiskPath(file) {
  const normalized = normalizePath(file)
  return FULL_PATH_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function classifyChangedFiles(changedFiles, options = {}) {
  const files = changedFiles.map((entry) =>
    typeof entry === 'string'
      ? { status: 'M', path: normalizePath(entry) }
      : {
          status: String(entry.status || 'M'),
          path: normalizePath(entry.path),
        },
  )
  const eventName = options.eventName || 'pull_request'
  const requestedMode = options.requestedMode || ''
  if (requestedMode === 'full') return { mode: 'full', reason: 'explicit_full_validation', files }
  if (eventName === 'push' || eventName === 'workflow_dispatch')
    return { mode: 'full', reason: `${eventName}_is_release_boundary`, files }
  if (files.length === 0) return { mode: 'full', reason: 'empty_diff_fail_closed', files }
  if (files.some((entry) => entry.status.startsWith('D') || entry.status.startsWith('R'))) {
    return { mode: 'full', reason: 'deletion_or_rename', files }
  }
  const highRisk = files.filter((entry) => isHighRiskPath(entry.path))
  if (highRisk.length > 0) {
    return { mode: 'full', reason: `high_risk_path:${highRisk[0].path}`, files }
  }
  return { mode: 'fast', reason: 'isolated_pull_request_change', files }
}

function changedEntries({ cwd = process.cwd(), base, head } = {}) {
  if (!base || !head) return []
  const output = execFileSync('git', ['diff', '--name-status', base, head], { cwd, encoding: 'utf8' })
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [status, ...pathParts] = line.split('\t')
      return { status, path: pathParts.at(-1) || '' }
    })
}

export function resolveProfileFromEnvironment(env = process.env, cwd = process.cwd()) {
  const eventName = env.GITHUB_EVENT_NAME || 'pull_request'
  const requestedMode = env.NOMI_VALIDATION_MODE || ''
  const entries = changedEntries({ cwd, base: env.NOMI_BASE_SHA, head: env.NOMI_HEAD_SHA || 'HEAD' })
  return classifyChangedFiles(entries, { eventName, requestedMode })
}

function writeGithubOutput(result, outputPath = process.env.GITHUB_OUTPUT) {
  if (!outputPath) return
  fs.appendFileSync(outputPath, `mode=${result.mode}\nreason=${result.reason}\nchanged_count=${result.files.length}\n`)
}

if (process.argv[1] && process.argv[1].endsWith('select-quality-gate-profile.mjs')) {
  try {
    const result = resolveProfileFromEnvironment()
    writeGithubOutput(result)
    console.log(`quality-gate profile: ${result.mode} (${result.reason}; ${result.files.length} changed files)`)
  } catch (error) {
    const result = { mode: 'full', reason: 'classifier_error_fail_closed', files: [] }
    writeGithubOutput(result)
    console.error(error instanceof Error ? error.message : String(error))
    console.error(`quality-gate profile: ${result.mode} (${result.reason})`)
    process.exit(0)
  }
}
