import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import zlib from 'node:zlib'
import yaml from 'js-yaml'

const RELEASE_VERSION = /^\d+\.\d+\.\d+$/
const RELEASE_TAG = /^v\d+\.\d+\.\d+$/
const RUN_ID = /^\d+$/
const PUBLISHABLE_EXTENSIONS = new Set(['.dmg', '.zip', '.exe', '.blockmap', '.yml'])

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function readYaml(filePath) {
  let document
  try {
    document = yaml.load(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(
      `Malformed updater metadata ${path.basename(filePath)}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error(`Malformed updater metadata ${path.basename(filePath)}: expected a mapping`)
  }
  return document
}

function sha512(filePath) {
  return crypto.createHash('sha512').update(fs.readFileSync(filePath)).digest('base64')
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function assertSha512(value, label) {
  if (typeof value !== 'string') throw new Error(`${label} must contain sha512`)
  const decoded = Buffer.from(value, 'base64')
  if (decoded.length !== 64 || decoded.toString('base64') !== value) {
    throw new Error(`${label} has malformed sha512`)
  }
  return value
}

function assetNameFromReference(reference, label) {
  if (typeof reference !== 'string' || !reference.trim() || reference.includes('\\')) {
    throw new Error(`${label} must contain a file path or URL`)
  }
  let url
  try {
    url = new URL(reference, 'https://release.invalid/')
  } catch {
    throw new Error(`${label} contains an invalid file path or URL`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label} contains an unsupported URL protocol`)
  }
  let basename
  try {
    basename = decodeURIComponent(path.posix.basename(url.pathname))
  } catch {
    throw new Error(`${label} contains an invalid encoded file path`)
  }
  if (!basename || basename === '.' || basename === '..') throw new Error(`${label} has no asset filename`)
  return basename
}

function assetArchitecture(assetName) {
  return assetName.match(/(?:^|-)(arm64|x64)(?=[.-]|$)/i)?.[1]?.toLowerCase() || null
}

function validateUpdaterMetadata({ metadataPath, copied, expectedVersion, platform, requiredAssets }) {
  const name = path.basename(metadataPath)
  const document = readYaml(metadataPath)
  if (document.version !== expectedVersion) {
    throw new Error(`${name} version ${JSON.stringify(document.version)} does not match release ${expectedVersion}`)
  }
  if (!Array.isArray(document.files) || document.files.length === 0) {
    throw new Error(`${name} must contain a non-empty files list`)
  }

  const entries = new Map()
  for (const [index, file] of document.files.entries()) {
    if (!file || typeof file !== 'object' || Array.isArray(file)) {
      throw new Error(`${name} files[${index}] must be a mapping`)
    }
    const label = `${name} files[${index}]`
    const assetName = assetNameFromReference(file.url ?? file.path, label)
    if (entries.has(assetName)) throw new Error(`${name} references ${assetName} more than once`)
    const assetPath = copied.get(assetName)
    if (!assetPath) throw new Error(`${name} references missing release asset ${assetName}`)
    if (platform === 'mac' && !/^Nomi-mac-/.test(assetName))
      throw new Error(`${name} references non-mac asset ${assetName}`)
    if (platform === 'windows' && !/^Nomi-win-/.test(assetName))
      throw new Error(`${name} references non-Windows asset ${assetName}`)

    const arch = assetArchitecture(assetName)
    if (!arch) throw new Error(`${name} cannot determine architecture for ${assetName}`)
    if (file.arch !== undefined && file.arch !== arch) {
      throw new Error(`${name} architecture ${JSON.stringify(file.arch)} does not match ${assetName}`)
    }
    const actualSize = fs.statSync(assetPath).size
    if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new Error(`${label} has invalid size`)
    if (file.size !== actualSize)
      throw new Error(`${name} size mismatch for ${assetName}: metadata ${file.size}, actual ${actualSize}`)
    const expectedSha512 = assertSha512(file.sha512, label)
    const actualSha512 = sha512(assetPath)
    if (expectedSha512 !== actualSha512) throw new Error(`${name} sha512 mismatch for ${assetName}`)
    entries.set(assetName, { assetName, assetPath, arch, sha512: expectedSha512, size: actualSize })
  }

  for (const { assetName, arch } of requiredAssets) {
    const entry = entries.get(assetName)
    if (!entry) throw new Error(`${name} is missing required ${arch} update asset ${assetName}`)
    if (entry.arch !== arch) throw new Error(`${name} architecture mismatch for ${assetName}`)
  }

  const primaryName = assetNameFromReference(document.path ?? document.url, `${name} path`)
  const primary = entries.get(primaryName)
  if (!primary) throw new Error(`${name} path references missing files entry ${primaryName}`)
  if (assertSha512(document.sha512, `${name} path`) !== primary.sha512) {
    throw new Error(`${name} path sha512 does not match ${primaryName}`)
  }
  if (document.size !== undefined && document.size !== primary.size) {
    throw new Error(`${name} path size does not match ${primaryName}`)
  }
  return { version: document.version, entries, primary }
}

function listFiles(root) {
  const files = []
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name)
      if (entry.isDirectory()) visit(target)
      else files.push(target)
    }
  }
  visit(root)
  return files
}

function copyUniqueByBasename(files, outputDir) {
  const copied = new Map()
  for (const source of files) {
    const basename = path.basename(source)
    if (!PUBLISHABLE_EXTENSIONS.has(path.extname(basename)) || /^builder-/.test(basename)) continue
    const existing = copied.get(basename)
    if (existing) {
      const same = fs.readFileSync(existing).equals(fs.readFileSync(source))
      if (!same) throw new Error(`Conflicting release assets share the name ${basename}`)
      continue
    }
    const destination = path.join(outputDir, basename)
    fs.copyFileSync(source, destination)
    copied.set(basename, destination)
  }
  return copied
}

function releaseArtifactEntries(root) {
  const filesByName = new Map()
  for (const filePath of listFiles(root)) {
    const name = path.basename(filePath)
    if (!PUBLISHABLE_EXTENSIONS.has(path.extname(name)) || /^builder-/.test(name)) continue
    const existing = filesByName.get(name)
    if (existing && !fs.readFileSync(existing).equals(fs.readFileSync(filePath))) {
      throw new Error(`Conflicting release assets share the name ${name}`)
    }
    if (!existing) filesByName.set(name, filePath)
  }
  return [...filesByName.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, filePath]) => ({ name, size: fs.statSync(filePath).size, sha256: sha256(filePath) }))
}

function validateArtifactEntries(actual, expected, label) {
  if (!Array.isArray(expected) || expected.length === 0) throw new Error(`${label} has no artifact digests`)
  const expectedByName = new Map()
  for (const entry of expected) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${label} has malformed artifact`)
    const name = String(entry.name || '')
    if (!name || path.basename(name) !== name || expectedByName.has(name)) {
      throw new Error(`${label} has invalid or duplicate artifact name ${JSON.stringify(name)}`)
    }
    if (!Number.isSafeInteger(entry.size) || entry.size <= 0 || !/^[0-9a-f]{64}$/.test(String(entry.sha256 || ''))) {
      throw new Error(`${label} has invalid digest metadata for ${name}`)
    }
    expectedByName.set(name, entry)
  }
  if (!Array.isArray(actual)) throw new Error(`${label} has no artifact data to verify`)
  const actualByName = new Map()
  for (const entry of actual) {
    const name = String(entry?.name || '')
    if (!name || path.basename(name) !== name || actualByName.has(name)) {
      throw new Error(`${label} has invalid or duplicate actual artifact name ${JSON.stringify(name)}`)
    }
    if (!Number.isSafeInteger(entry.size) || entry.size <= 0 || !/^[0-9a-f]{64}$/.test(String(entry.sha256 || ''))) {
      throw new Error(`${label} has invalid actual digest metadata for ${name}`)
    }
    actualByName.set(name, entry)
  }
  const expectedNames = [...expectedByName.keys()].sort()
  const actualNames = [...actualByName.keys()].sort()
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(
      `${label} artifact set mismatch: expected ${expectedNames.join(', ')}, found ${actualNames.join(', ')}`,
    )
  }
  for (const name of expectedNames) {
    const expectedEntry = expectedByName.get(name)
    const actualEntry = actualByName.get(name)
    if (actualEntry.size !== expectedEntry.size) throw new Error(`${label} size mismatch for ${name}`)
    if (actualEntry.sha256 !== expectedEntry.sha256) throw new Error(`${label} sha256 mismatch for ${name}`)
  }
}

function requireAsset(copied, basename) {
  const filePath = copied.get(basename)
  if (!filePath) throw new Error(`Required release asset is missing: ${basename}`)
  return filePath
}

function requireValidBlockmap(copied, assetName) {
  const blockmapName = `${assetName}.blockmap`
  const blockmapPath = requireAsset(copied, blockmapName)
  let document
  try {
    document = JSON.parse(zlib.gunzipSync(fs.readFileSync(blockmapPath)).toString('utf8'))
  } catch (error) {
    throw new Error(
      `Invalid release blockmap ${blockmapName}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!document || typeof document !== 'object' || !Array.isArray(document.files) || document.files.length === 0) {
    throw new Error(`Invalid release blockmap ${blockmapName}: expected a non-empty files list`)
  }
  return blockmapPath
}

function requireSingleInstaller(copied) {
  const installers = [...copied.entries()].filter(([basename]) => basename.endsWith('.exe'))
  if (installers.length !== 1) {
    throw new Error(
      `Expected exactly one Windows installer, found ${installers.map(([name]) => name).join(', ') || 'none'}`,
    )
  }
  return installers[0][1]
}

function writeAlias(source, outputDir, basename) {
  const destination = path.join(outputDir, basename)
  if (path.resolve(source) === path.resolve(destination)) return destination
  fs.copyFileSync(source, destination)
  return destination
}

export function assertReleaseVersion(version, packageVersion) {
  const normalized = String(version || '')
  if (!RELEASE_VERSION.test(normalized))
    throw new Error(`Release version must match x.y.z, got ${JSON.stringify(version)}`)
  if (normalized !== packageVersion) {
    throw new Error(`Release version ${normalized} does not match package.json ${packageVersion}`)
  }
  return normalized
}

export function assertReleaseTag(tag, packageVersion) {
  const normalized = String(tag || '')
  if (!RELEASE_TAG.test(normalized)) throw new Error(`Release tag must match vX.Y.Z, got ${JSON.stringify(tag)}`)
  return assertReleaseVersion(normalized.slice(1), packageVersion)
}

export function assertRunId(runId) {
  const normalized = String(runId || '')
  if (!RUN_ID.test(normalized)) throw new Error(`RC run ID must contain digits only, got ${JSON.stringify(runId)}`)
  return normalized
}

export function createReleaseManifest({
  repository,
  sha,
  version,
  runId,
  runAttempt,
  artifactRoot,
  createdAt = new Date().toISOString(),
}) {
  if (!repository || !/^[0-9a-f]{40}$/i.test(sha)) throw new Error('Manifest requires a repository and full commit SHA')
  const normalizedVersion = assertReleaseVersion(version, version)
  const artifacts = releaseArtifactEntries(artifactRoot)
  if (artifacts.length === 0) throw new Error('Manifest requires at least one release artifact')
  return {
    schemaVersion: 2,
    repository,
    sha: sha.toLowerCase(),
    version: normalizedVersion,
    runId: assertRunId(runId),
    runAttempt: assertRunId(runAttempt),
    artifacts,
    createdAt,
  }
}

export function validateReleaseManifest(manifest, { repository, tag, runId, runAttempt, sha, artifactRoot }) {
  if (manifest?.schemaVersion !== 2) throw new Error('Unsupported release manifest schema')
  if (manifest.repository !== repository) throw new Error(`RC repository mismatch: ${manifest.repository}`)
  if (!/^[0-9a-f]{40}$/i.test(manifest.sha || '')) throw new Error('RC manifest has no valid commit SHA')
  if (sha !== undefined && manifest.sha !== String(sha).toLowerCase())
    throw new Error(`RC commit mismatch: ${manifest.sha}`)
  assertReleaseVersion(manifest.version, manifest.version)
  const manifestRunId = assertRunId(manifest.runId)
  if (runId !== undefined && manifestRunId !== assertRunId(runId)) throw new Error(`RC run mismatch: ${manifest.runId}`)
  const manifestRunAttempt = assertRunId(manifest.runAttempt)
  if (runAttempt !== undefined && manifestRunAttempt !== assertRunId(runAttempt)) {
    throw new Error(`RC run attempt mismatch: ${manifest.runAttempt}`)
  }
  assertReleaseTag(tag, manifest.version)
  validateArtifactEntries(releaseArtifactEntries(artifactRoot), manifest.artifacts, 'RC manifest')
  return manifest
}

export function prepareReleaseAssets(inputRoot, outputDir, expectedVersion) {
  const normalizedVersion = assertReleaseVersion(expectedVersion, expectedVersion)
  fs.mkdirSync(outputDir, { recursive: true })
  const copied = copyUniqueByBasename(listFiles(inputRoot), outputDir)

  const macArmDmg = requireAsset(copied, 'Nomi-mac-arm64.dmg')
  const macIntelDmg = requireAsset(copied, 'Nomi-mac-x64.dmg')
  requireAsset(copied, 'Nomi-mac-arm64.zip')
  requireAsset(copied, 'Nomi-mac-x64.zip')
  const macMetadata = requireAsset(copied, 'latest-mac.yml')
  const windowsMetadata = requireAsset(copied, 'latest.yml')
  const windowsInstaller = requireSingleInstaller(copied)
  for (const assetName of [
    'Nomi-mac-arm64.dmg',
    'Nomi-mac-x64.dmg',
    'Nomi-mac-arm64.zip',
    'Nomi-mac-x64.zip',
    path.basename(windowsInstaller),
  ]) {
    requireValidBlockmap(copied, assetName)
  }

  validateUpdaterMetadata({
    metadataPath: macMetadata,
    copied,
    expectedVersion: normalizedVersion,
    platform: 'mac',
    requiredAssets: [
      { assetName: 'Nomi-mac-arm64.zip', arch: 'arm64' },
      { assetName: 'Nomi-mac-x64.zip', arch: 'x64' },
    ],
  })
  validateUpdaterMetadata({
    metadataPath: windowsMetadata,
    copied,
    expectedVersion: normalizedVersion,
    platform: 'windows',
    requiredAssets: [{ assetName: path.basename(windowsInstaller), arch: 'x64' }],
  })

  writeAlias(macArmDmg, outputDir, 'Nomi-mac-arm64.dmg')
  writeAlias(macIntelDmg, outputDir, 'Nomi-mac-intel.dmg')
  writeAlias(windowsInstaller, outputDir, 'Nomi-windows-setup.exe')

  const publishFiles = fs
    .readdirSync(outputDir)
    .filter((name) => name !== 'SHA256SUMS.txt')
    .sort()
  const checksums = publishFiles.map((name) => {
    const digest = crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(outputDir, name)))
      .digest('hex')
    return `${digest}  ${name}`
  })
  fs.writeFileSync(path.join(outputDir, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`)
  return [...publishFiles, 'SHA256SUMS.txt']
}

export function verifyPublishedReleaseAssets(inputRoot, releaseJsonPath) {
  const local = fs
    .readdirSync(inputRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const filePath = path.join(inputRoot, entry.name)
      return { name: entry.name, size: fs.statSync(filePath).size, sha256: sha256(filePath) }
    })
    .sort((left, right) => left.name.localeCompare(right.name))
  const release = readJson(releaseJsonPath)
  const remote = Array.isArray(release?.assets)
    ? release.assets.map((asset) => ({
        name: asset?.name,
        size: asset?.size,
        sha256: typeof asset?.digest === 'string' ? asset.digest.replace(/^sha256:/, '') : '',
      }))
    : []
  validateArtifactEntries(remote, local, 'GitHub release')
  return local
}

function packageVersion(root) {
  return readJson(path.join(root, 'package.json')).version
}

function argument(name, args) {
  const index = args.indexOf(`--${name}`)
  if (index < 0 || !args[index + 1]) throw new Error(`Missing --${name}`)
  return args[index + 1]
}

async function main(args) {
  const command = args.shift()
  if (command === 'validate-version') {
    const root = path.resolve(argument('root', args))
    console.log(assertReleaseVersion(argument('version', args), packageVersion(root)))
    return
  }
  if (command === 'validate-promotion-inputs') {
    const root = path.resolve(argument('root', args))
    const version = assertReleaseTag(argument('tag', args), packageVersion(root))
    assertRunId(argument('run-id', args))
    console.log(version)
    return
  }
  if (command === 'write-manifest') {
    const output = path.resolve(argument('output', args))
    const manifest = createReleaseManifest({
      repository: argument('repository', args),
      sha: argument('sha', args),
      version: argument('version', args),
      runId: argument('run-id', args),
      runAttempt: argument('run-attempt', args),
      artifactRoot: path.resolve(argument('artifacts', args)),
    })
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`)
    return
  }
  if (command === 'validate-manifest') {
    const manifest = validateReleaseManifest(readJson(path.resolve(argument('manifest', args))), {
      repository: argument('repository', args),
      tag: argument('tag', args),
      runId: argument('run-id', args),
      runAttempt: argument('run-attempt', args),
      sha: argument('sha', args),
      artifactRoot: path.resolve(argument('artifacts', args)),
    })
    process.stdout.write(`${manifest.sha}\n`)
    return
  }
  if (command === 'prepare-assets') {
    const files = prepareReleaseAssets(
      path.resolve(argument('input', args)),
      path.resolve(argument('output', args)),
      argument('version', args),
    )
    console.log(`Prepared ${files.length} release assets`)
    return
  }
  if (command === 'verify-release-assets') {
    const files = verifyPublishedReleaseAssets(
      path.resolve(argument('input', args)),
      path.resolve(argument('release-json', args)),
    )
    console.log(`Verified ${files.length} published release assets`)
    return
  }
  throw new Error(`Unknown release-contract command: ${command || '<empty>'}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
