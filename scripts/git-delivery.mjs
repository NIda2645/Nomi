import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { runProfile } from './test-system.mjs'

export const DEFAULT_FETCH_TIMEOUT_MS = 45_000
const MAX_TRANSPORT_OUTPUT_CHARS = 256 * 1024
const SHA_PATTERN = /^[0-9a-f]{40}$/i

export class DeliveryError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'DeliveryError'
    this.code = code
    this.details = details
  }
}

function boundedAppend(current, chunk) {
  const combined = `${current}${chunk}`
  return combined.length <= MAX_TRANSPORT_OUTPUT_CHARS ? combined : combined.slice(-MAX_TRANSPORT_OUTPUT_CHARS)
}

export function runBoundedCommand(
  command,
  args,
  { cwd = process.cwd(), env = process.env, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, spawnProcess = spawn } = {},
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new DeliveryError('invalid_timeout', `Transport timeout must be positive; received ${timeoutMs}`)
  }

  return new Promise((resolve, reject) => {
    const detached = process.platform !== 'win32'
    const child = spawnProcess(command, args, {
      cwd,
      env,
      detached,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let spawnError = null
    let timedOut = false
    let forceKillTimer = null

    child.stdout?.on('data', (chunk) => {
      stdout = boundedAppend(stdout, chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr = boundedAppend(stderr, chunk)
    })
    child.once('error', (error) => {
      spawnError = error
    })

    const signalChild = (signal) => {
      try {
        if (detached && child.pid) process.kill(-child.pid, signal)
        else child.kill(signal)
      } catch {
        try {
          child.kill(signal)
        } catch {
          /* process already exited */
        }
      }
    }

    const timeout = setTimeout(() => {
      timedOut = true
      signalChild('SIGTERM')
      forceKillTimer = setTimeout(() => signalChild('SIGKILL'), 1_000)
      forceKillTimer.unref?.()
    }, timeoutMs)
    timeout.unref?.()

    child.once('close', (exitCode, signal) => {
      clearTimeout(timeout)
      if (forceKillTimer) clearTimeout(forceKillTimer)
      const details = {
        command,
        args,
        cwd,
        timeoutMs,
        exitCode,
        signal,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      }
      if (timedOut) {
        reject(
          new DeliveryError(
            'transport_timeout',
            `Remote refresh exceeded ${timeoutMs}ms and was terminated after one attempt`,
            details,
          ),
        )
      } else if (spawnError) {
        reject(new DeliveryError('transport_spawn_failed', spawnError.message, details))
      } else if (exitCode !== 0) {
        reject(
          new DeliveryError(
            'transport_failed',
            `Remote refresh failed once with exit code ${exitCode}; no automatic retry or API fallback was used`,
            details,
          ),
        )
      } else {
        resolve(details)
      }
    })
  })
}

function gitOutput(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (error) {
    const stderr = String(error?.stderr || '').trim()
    throw new DeliveryError(
      'git_state_failed',
      `Cannot inspect Git state with: git ${args.join(' ')}${stderr ? `\n${stderr}` : ''}`,
      { cwd, args },
    )
  }
}

function gitStatus(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error) {
    throw new DeliveryError('git_state_failed', result.error.message, { cwd, args })
  }
  return {
    exitCode: result.status ?? 1,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  }
}

export async function fetchRemoteBase({
  cwd = process.cwd(),
  remote = 'origin',
  base = 'main',
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  runCommand = runBoundedCommand,
} = {}) {
  const refspec = `refs/heads/${base}:refs/remotes/${remote}/${base}`
  return runCommand('git', ['fetch', '--no-tags', remote, refspec], {
    cwd,
    timeoutMs,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
}

export function classifyIdentity({ headCommit, headTree, remoteCommit, remoteTree }) {
  if (headCommit === remoteCommit) return 'same-commit'
  if (headTree === remoteTree) return 'same-tree-different-commit'
  return 'different-tree'
}

export function inspectDeliveryState({ cwd = process.cwd(), remote = 'origin', base = 'main' } = {}) {
  const repoRoot = gitOutput(cwd, ['rev-parse', '--show-toplevel'])
  const remoteRef = `${remote}/${base}`
  const headCommit = gitOutput(cwd, ['rev-parse', 'HEAD'])
  const headTree = gitOutput(cwd, ['rev-parse', 'HEAD^{tree}'])
  const remoteCommit = gitOutput(cwd, ['rev-parse', remoteRef])
  const remoteTree = gitOutput(cwd, ['rev-parse', `${remoteRef}^{tree}`])
  const branchResult = gitStatus(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD'])
  const ancestry = gitStatus(cwd, ['merge-base', '--is-ancestor', remoteRef, 'HEAD'])
  if (![0, 1].includes(ancestry.exitCode)) {
    throw new DeliveryError('git_state_failed', `Cannot compare HEAD with ${remoteRef}`, ancestry)
  }
  const commonDir = gitOutput(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  const dirtyPaths = gitOutput(cwd, ['status', '--porcelain'])

  return {
    repoRoot,
    commonDir,
    branch: branchResult.exitCode === 0 ? branchResult.stdout : null,
    remote,
    base,
    remoteRef,
    headCommit,
    headTree,
    remoteCommit,
    remoteTree,
    relation: classifyIdentity({ headCommit, headTree, remoteCommit, remoteTree }),
    remoteBaseIsAncestor: ancestry.exitCode === 0,
    clean: dirtyPaths === '',
    dirtyPaths: dirtyPaths ? dirtyPaths.split(/\r?\n/) : [],
  }
}

export function assertPreflightState(state, { protectedBranches = ['main', 'master', state.base] } = {}) {
  if (!state.branch) {
    throw new DeliveryError(
      'detached_preflight',
      'Delivery preflight requires a named task branch, not detached HEAD',
      state,
    )
  }
  if (new Set(protectedBranches).has(state.branch)) {
    throw new DeliveryError('protected_branch', `Delivery work cannot start on protected branch ${state.branch}`, state)
  }
  if (!state.clean) {
    throw new DeliveryError(
      'dirty_worktree',
      `Delivery preflight failed because the worktree is not clean: ${state.dirtyPaths.join(', ')}`,
      {
        ...state,
      },
    )
  }
  if (!state.remoteBaseIsAncestor) {
    throw new DeliveryError(
      'stale_task_branch',
      `Task branch ${state.branch} does not contain the refreshed remote baseline ${state.remoteRef}`,
      state,
    )
  }
  return state
}

export function assertMergedState(state, { expectedSha } = {}) {
  if (!SHA_PATTERN.test(String(expectedSha || ''))) {
    throw new DeliveryError(
      'invalid_expected_sha',
      'Merged verification requires an explicit full 40-character commit SHA',
    )
  }
  if (!state.clean) {
    throw new DeliveryError('dirty_worktree', 'Merged verification requires a clean worktree', state)
  }
  if (state.headCommit !== expectedSha) {
    throw new DeliveryError(
      'unexpected_head',
      `HEAD is not the expected merged commit: expected ${expectedSha}, observed ${state.headCommit}`,
      state,
    )
  }
  if (state.remoteCommit !== expectedSha) {
    throw new DeliveryError(
      'remote_main_moved',
      `${state.remoteRef} is not the expected merged commit: expected ${expectedSha}, observed ${state.remoteCommit}`,
      state,
    )
  }
  if (state.relation !== 'same-commit') {
    throw new DeliveryError(
      'merged_identity_diverged',
      `Merged identity relation must be same-commit, observed ${state.relation}`,
      state,
    )
  }
  return state
}

export async function preflightDelivery({
  cwd = process.cwd(),
  remote = 'origin',
  base = 'main',
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  fetchRemote = fetchRemoteBase,
} = {}) {
  await fetchRemote({ cwd, remote, base, timeoutMs })
  return assertPreflightState(inspectDeliveryState({ cwd, remote, base }))
}

function receiptPathFor(state) {
  return path.join(state.commonDir, 'nomi-delivery', 'merged-main', state.headCommit, 'full-local.json')
}

function readReceipt(receiptPath) {
  if (!fs.existsSync(receiptPath)) return null
  try {
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'))
    return receipt?.schemaVersion === 1 && Array.isArray(receipt.attempts) ? receipt : null
  } catch (error) {
    throw new DeliveryError('invalid_receipt', `Cannot read validation receipt ${receiptPath}: ${error.message}`, {
      receiptPath,
    })
  }
}

function writeReceipt(receiptPath, receipt) {
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true })
  const temporaryPath = `${receiptPath}.${process.pid}.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`)
  fs.renameSync(temporaryPath, receiptPath)
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

function acquireValidationLock(receiptPath, startedAt) {
  const lockPath = `${receiptPath}.lock`
  fs.mkdirSync(path.dirname(lockPath), { recursive: true })
  const lock = { pid: process.pid, hostname: os.hostname(), startedAt }

  const create = () => {
    const descriptor = fs.openSync(lockPath, 'wx')
    try {
      fs.writeFileSync(descriptor, `${JSON.stringify(lock)}\n`)
    } finally {
      fs.closeSync(descriptor)
    }
  }

  try {
    create()
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
    let existing = null
    try {
      existing = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
    } catch {
      /* malformed lock fails closed */
    }
    const staleLocalLock = existing?.hostname === os.hostname() && !processIsAlive(existing?.pid)
    if (!staleLocalLock) {
      throw new DeliveryError(
        'validation_in_progress',
        `Full validation is already running for this merged SHA: ${lockPath}`,
        { lockPath, lock: existing },
      )
    }
    fs.rmSync(lockPath)
    create()
  }

  return {
    lockPath,
    release: () => fs.rmSync(lockPath, { force: true }),
  }
}

function resultAttempt(result, startedAt, completedAt) {
  const summary = result?.summary ?? { ok: false }
  return {
    startedAt,
    completedAt,
    status: summary.ok === true ? 'passed' : 'failed',
    summary,
    reportPath: result?.runDir ? path.join(result.runDir, 'report.md') : null,
    stages: Array.isArray(result?.stages)
      ? result.stages.map(({ id, status, exitCode, durationMs, timedOut }) => ({
          id,
          status,
          exitCode,
          durationMs,
          timedOut,
        }))
      : [],
    error: null,
  }
}

function errorAttempt(error, startedAt, completedAt) {
  return {
    startedAt,
    completedAt,
    status: 'failed',
    summary: { ok: false },
    reportPath: null,
    stages: [],
    error: error instanceof Error ? error.message : String(error),
  }
}

export async function verifyMergedDelivery({
  cwd = process.cwd(),
  expectedSha,
  remote = 'origin',
  base = 'main',
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  rerun = false,
  env = process.env,
  now = () => new Date(),
  fetchRemote = fetchRemoteBase,
  runFullProfile = (profile) => runProfile(profile, { root: cwd, env }),
} = {}) {
  await fetchRemote({ cwd, remote, base, timeoutMs })
  const state = assertMergedState(inspectDeliveryState({ cwd, remote, base }), { expectedSha })
  const receiptPath = receiptPathFor(state)
  const existing = readReceipt(receiptPath)
  const passedAttempt = existing?.attempts.find((attempt) => attempt.status === 'passed')
  if (passedAttempt && !rerun) {
    return { state, receiptPath, receipt: existing, reused: true }
  }
  if (existing && !rerun) {
    throw new DeliveryError(
      'validation_already_failed',
      `Full validation already failed for ${expectedSha}; use a new merged SHA or pass --rerun explicitly`,
      { receiptPath, receipt: existing },
    )
  }

  const startedAt = now().toISOString()
  const validationLock = acquireValidationLock(receiptPath, startedAt)
  try {
    let attempt
    try {
      const result = await runFullProfile('full-local')
      attempt = resultAttempt(result, startedAt, now().toISOString())
    } catch (error) {
      attempt = errorAttempt(error, startedAt, now().toISOString())
    }

    const receipt = {
      schemaVersion: 1,
      profile: 'full-local',
      commitSha: state.headCommit,
      treeSha: state.headTree,
      remoteRef: state.remoteRef,
      attempts: [...(existing?.attempts ?? []), attempt],
    }
    writeReceipt(receiptPath, receipt)
    if (attempt.status !== 'passed') {
      throw new DeliveryError(
        'full_validation_failed',
        `Full merged-main validation failed for ${expectedSha}; receipt: ${receiptPath}`,
        { receiptPath, receipt },
      )
    }
    return { state, receiptPath, receipt, reused: false }
  } finally {
    validationLock.release()
  }
}

function parseCli(argv) {
  const [command, ...args] = argv
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--rerun') options.rerun = true
    else if (arg === '--expected-sha') options.expectedSha = args[++index]
    else if (arg === '--remote') options.remote = args[++index]
    else if (arg === '--base') options.base = args[++index]
    else if (arg === '--timeout-ms') options.timeoutMs = Number(args[++index])
    else throw new DeliveryError('unknown_argument', `Unknown delivery argument: ${arg}`)
  }
  return { command, options }
}

function printableState(state) {
  return {
    branch: state.branch,
    remoteRef: state.remoteRef,
    headCommit: state.headCommit,
    headTree: state.headTree,
    remoteCommit: state.remoteCommit,
    remoteTree: state.remoteTree,
    relation: state.relation,
    remoteBaseIsAncestor: state.remoteBaseIsAncestor,
    clean: state.clean,
  }
}

export async function runDeliveryCommand(argv = process.argv.slice(2), { cwd = process.cwd() } = {}) {
  const { command, options } = parseCli(argv)
  if (command === 'preflight') {
    const state = await preflightDelivery({ cwd, ...options })
    return { stage: 'preflight', state: printableState(state) }
  }
  if (command === 'verify-merged') {
    const result = await verifyMergedDelivery({ cwd, ...options })
    return {
      stage: 'verify-merged',
      state: printableState(result.state),
      reused: result.reused,
      receiptPath: result.receiptPath,
      receipt: result.receipt,
    }
  }
  throw new DeliveryError(
    'unknown_command',
    'Usage: pnpm run delivery:preflight OR pnpm run delivery:verify-merged -- --expected-sha <40-char-sha> [--rerun]',
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runDeliveryCommand()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      const payload =
        error instanceof DeliveryError
          ? { error: error.code, message: error.message, details: error.details }
          : { error: 'unexpected_error', message: error instanceof Error ? error.message : String(error) }
      console.error(JSON.stringify(payload, null, 2))
      process.exitCode = 1
    })
}
