const fs = require('node:fs')
const path = require('node:path')
const { PLATFORM_PACKAGES, targetPackageName } = require('./platform-binaries.cjs')

const MACHO_CPU_TYPES = Object.freeze({
  arm64: 0x0100000c,
  x64: 0x01000007,
})

const PE_MACHINE_TYPES = Object.freeze({
  arm64: 0xaa64,
  x64: 0x8664,
})

function inspectMachO(filePath, arch) {
  const header = Buffer.alloc(8)
  const fd = fs.openSync(filePath, 'r')
  try {
    if (fs.readSync(fd, header, 0, header.length, 0) !== header.length) {
      throw new Error('file is shorter than a Mach-O header')
    }
  } finally {
    fs.closeSync(fd)
  }
  if (header.readUInt32LE(0) !== 0xfeedfacf) throw new Error('expected a little-endian 64-bit Mach-O executable')
  const expectedCpu = MACHO_CPU_TYPES[arch]
  if (expectedCpu === undefined || header.readUInt32LE(4) !== expectedCpu) {
    throw new Error(`Mach-O architecture does not match ${arch}`)
  }
  if ((fs.statSync(filePath).mode & 0o111) === 0) throw new Error('Mach-O binary is not executable')
  return 'mach-o'
}

function inspectPe(filePath, arch) {
  const fd = fs.openSync(filePath, 'r')
  try {
    const dos = Buffer.alloc(64)
    if (fs.readSync(fd, dos, 0, dos.length, 0) !== dos.length || dos.toString('ascii', 0, 2) !== 'MZ') {
      throw new Error('expected a PE executable with an MZ header')
    }
    const peOffset = dos.readUInt32LE(0x3c)
    const pe = Buffer.alloc(6)
    if (fs.readSync(fd, pe, 0, pe.length, peOffset) !== pe.length || pe.toString('binary', 0, 4) !== 'PE\0\0') {
      throw new Error('expected a valid PE signature')
    }
    const expectedMachine = PE_MACHINE_TYPES[arch]
    if (expectedMachine === undefined || pe.readUInt16LE(4) !== expectedMachine) {
      throw new Error(`PE architecture does not match ${arch}`)
    }
  } finally {
    fs.closeSync(fd)
  }
  return 'pe'
}

function inspectExecutable(filePath, platform, arch) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`required executable is missing: ${filePath}`)
  }
  if (platform === 'darwin') return inspectMachO(filePath, arch)
  if (platform === 'win32' || platform === 'windows') return inspectPe(filePath, arch)
  throw new Error(`Unsupported packaged media executable format: ${platform}/${arch}`)
}

function findUnpackedRoot(input) {
  const candidates = [
    input,
    path.join(input, 'app.asar.unpacked', 'node_modules'),
    path.join(input, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules'),
    path.join(input, 'Resources', 'app.asar.unpacked', 'node_modules'),
    path.join(input, 'resources', 'app.asar.unpacked', 'node_modules'),
  ]
  const result = candidates.find(
    (candidate) =>
      fs.existsSync(path.join(candidate, '@ffmpeg-installer')) ||
      fs.existsSync(path.join(candidate, '@ffprobe-installer')),
  )
  if (!result) throw new Error(`Could not find app.asar.unpacked/node_modules below ${input}`)
  return result
}

function auditPackagedMedia(input, platform, arch) {
  const target = targetPackageName(platform, arch)
  const targetArch = target.split('-').at(-1)
  const nodeModules = findUnpackedRoot(path.resolve(input))
  const families = Object.fromEntries(
    Object.keys(PLATFORM_PACKAGES).map((family) => {
      const root = path.join(nodeModules, `@${family}-installer`)
      const present = PLATFORM_PACKAGES[family]
        .filter((packageName) => fs.existsSync(path.join(root, packageName)))
        .map((packageName) => ({ packageName, packagePath: path.join(root, packageName) }))
      return [family, present]
    }),
  )
  for (const [family, present] of Object.entries(families)) {
    const names = present.map(({ packageName }) => packageName)
    if (present.length !== 1 || present[0].packageName !== target) {
      throw new Error(`@${family}-installer must contain exactly ${target}; found ${names.join(', ') || 'none'}`)
    }
    const executableName = platform === 'win32' || platform === 'windows' ? `${family}.exe` : family
    const executablePath = path.join(present[0].packagePath, executableName)
    present[0].executable = {
      path: executablePath,
      bytes: fs.existsSync(executablePath) ? fs.statSync(executablePath).size : 0,
      format: inspectExecutable(executablePath, platform, targetArch),
    }
  }
  return { input: path.resolve(input), platform, arch, target, families }
}

if (require.main === module) {
  const [input, platform = process.platform, arch = process.arch] = process.argv.slice(2)
  if (!input)
    throw new Error('Usage: node scripts/packaging/audit-packaged-media.cjs <app-or-resources-path> <platform> <arch>')
  console.log(JSON.stringify(auditPackagedMedia(input, platform, arch), null, 2))
}

module.exports = { auditPackagedMedia, findUnpackedRoot, inspectExecutable }
