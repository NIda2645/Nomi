import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { assertElectronInstallIdentity, inspectElectronInstallIdentity } from './electron-install-identity.mjs'
import { ensureElectronRuntime } from './install-electron-runtime.mjs'

const VERSION = '43.4.1'
const sourceRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function createRepo(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-electron-identity-'))
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ devDependencies: { electron: options.declared ?? VERSION } }),
  )

  const modulesRoot = options.symlinkNodeModules
    ? fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-shared-modules-'))
    : path.join(root, 'node_modules')
  fs.mkdirSync(modulesRoot, { recursive: true })
  if (options.symlinkNodeModules) fs.symlinkSync(modulesRoot, path.join(root, 'node_modules'), 'junction')

  if (options.installed !== null) {
    const electronRoot = options.externalElectronLink
      ? path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-external-electron-')), 'electron')
      : path.join(modulesRoot, 'electron')
    fs.mkdirSync(electronRoot, { recursive: true })
    fs.writeFileSync(path.join(electronRoot, 'package.json'), JSON.stringify({ version: options.installed ?? VERSION }))
    fs.writeFileSync(path.join(electronRoot, 'install.js'), '// fixture')
    if (options.dist !== null) {
      fs.mkdirSync(path.join(electronRoot, 'dist', 'fixture'), { recursive: true })
      fs.writeFileSync(path.join(electronRoot, 'dist', 'version'), options.dist ?? VERSION)
      fs.writeFileSync(path.join(electronRoot, 'path.txt'), 'fixture/electron')
      fs.writeFileSync(path.join(electronRoot, 'dist', 'fixture', 'electron'), '')
    }
    if (options.externalElectronLink) {
      fs.symlinkSync(electronRoot, path.join(modulesRoot, 'electron'), 'junction')
    }
  }
  return { root, modulesRoot }
}

function problemCodes(identity) {
  return identity.problems.map((problem) => problem.code)
}

test('rejects a shared top-level node_modules link even when every version matches', () => {
  const { root } = createRepo({ symlinkNodeModules: true })
  const identity = inspectElectronInstallIdentity(root, { probeRuntimeVersion: () => VERSION })
  assert.deepEqual(problemCodes(identity), ['shared-node-modules'])
  assert.throws(
    () => assertElectronInstallIdentity(root, { probeRuntimeVersion: () => VERSION }),
    /shared-node-modules/,
  )
})

test('rejects the observed pnpm link that detours through another worktree', () => {
  const { root } = createRepo({ externalElectronLink: true })
  const identity = inspectElectronInstallIdentity(root, { probeRuntimeVersion: () => VERSION })
  assert.deepEqual(problemCodes(identity), ['external-electron-package-link'])
})

test('rejects an installed Electron package from an older worktree', () => {
  const { root } = createRepo({ installed: '31.7.7', dist: '31.7.7' })
  const identity = inspectElectronInstallIdentity(root, {
    probeRuntimeVersion: () => '31.7.7',
  })
  assert.deepEqual(problemCodes(identity), [
    'installed-version-mismatch',
    'dist-version-mismatch',
    'runtime-version-mismatch',
  ])
})

test('rejects a missing downloaded Electron runtime', () => {
  const { root } = createRepo({ dist: null })
  const identity = inspectElectronInstallIdentity(root)
  assert.deepEqual(problemCodes(identity), ['runtime-not-installed'])
})

test('rejects stale dist metadata and the actual stale executable independently', () => {
  const staleDist = createRepo({ dist: '31.7.7' })
  assert.deepEqual(
    problemCodes(inspectElectronInstallIdentity(staleDist.root, { probeRuntimeVersion: () => VERSION })),
    ['dist-version-mismatch'],
  )

  const staleExecutable = createRepo()
  assert.deepEqual(
    problemCodes(
      inspectElectronInstallIdentity(staleExecutable.root, {
        probeRuntimeVersion: () => '31.7.7',
      }),
    ),
    ['runtime-version-mismatch'],
  )
})

test('accepts an isolated install only when package, dist, and executable match the declaration', () => {
  const { root } = createRepo()
  const identity = assertElectronInstallIdentity(root, { probeRuntimeVersion: () => `v${VERSION}` })
  assert.equal(identity.declaredVersion, VERSION)
  assert.equal(identity.installedVersion, VERSION)
  assert.equal(identity.distVersion, VERSION)
  assert.equal(identity.runtimeVersion, VERSION)
})

test('installer repairs only a missing runtime and then validates the exact executable', () => {
  const { root } = createRepo({ dist: null })
  let installs = 0
  const result = ensureElectronRuntime({
    repoRoot: root,
    runInstaller: () => {
      installs += 1
      const electronRoot = path.join(root, 'node_modules', 'electron')
      fs.mkdirSync(path.join(electronRoot, 'dist', 'fixture'), { recursive: true })
      fs.writeFileSync(path.join(electronRoot, 'dist', 'version'), VERSION)
      fs.writeFileSync(path.join(electronRoot, 'path.txt'), 'fixture/electron')
      fs.writeFileSync(path.join(electronRoot, 'dist', 'fixture', 'electron'), '')
    },
    probeRuntimeVersion: () => VERSION,
  })
  assert.equal(installs, 1)
  assert.equal(result.runtimeVersion, VERSION)
})

test('installer never mutates a shared node_modules or an already mismatched package', () => {
  for (const options of [
    { symlinkNodeModules: true, dist: null },
    { installed: '31.7.7', dist: null },
  ]) {
    const { root } = createRepo(options)
    let installs = 0
    assert.throws(
      () =>
        ensureElectronRuntime({
          repoRoot: root,
          runInstaller: () => {
            installs += 1
          },
        }),
      /shared-node-modules|installed-version-mismatch/,
    )
    assert.equal(installs, 0)
  }
})

test('all Electron entry points share the identity gate and install repair', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(sourceRepoRoot, 'package.json'), 'utf8'))
  for (const script of ['build', 'dist', 'gates', 'test:e2e', 'test:mcp', 'test:journeys']) {
    assert.match(packageJson.scripts[script], /check:electron-install/, `${script} must verify Electron`)
  }
  assert.match(
    packageJson.scripts.postinstall,
    /^node \.\/scripts\/install-electron-runtime\.mjs && node \.\/scripts\/install-git-hooks\.cjs$/,
  )

  const devSource = fs.readFileSync(path.join(sourceRepoRoot, 'scripts', 'dev-electron.mjs'), 'utf8')
  const startSource = fs.readFileSync(path.join(sourceRepoRoot, 'scripts', 'start-electron.mjs'), 'utf8')
  const clientSource = fs.readFileSync(path.join(sourceRepoRoot, 'scripts', 'lib', 'nomiClient.mjs'), 'utf8')
  assert.ok(
    devSource.indexOf('assertElectronInstallIdentity(repoRoot)') < devSource.search(/require\(['"]electron['"]\)/),
  )
  assert.ok(
    startSource.indexOf('assertElectronInstallIdentity(repoRoot)') < startSource.search(/require\(['"]electron['"]\)/),
  )
  assert.match(clientSource, /assertElectronInstallIdentity\(repoRoot\)/)

  const windowsGate = fs.readFileSync(path.join(sourceRepoRoot, '.github', 'workflows', 'win-gate.yml'), 'utf8')
  assert.match(windowsGate, /- name: Verify actual Electron identity\n\s+run: pnpm run check:electron-install/)
})
