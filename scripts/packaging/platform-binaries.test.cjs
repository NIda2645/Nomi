const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { auditPackagedMedia } = require('./audit-packaged-media.cjs')
const { binaryFormat, isForeignBinary, packageSupportsTarget } = require('./native-binaries.cjs')
const { prunePlatformBinaries, targetPackageName } = require('./platform-binaries.cjs')

function writeMachO(filePath, cpuType, executable = true) {
  const header = Buffer.alloc(64)
  header.writeUInt32LE(0xfeedfacf, 0)
  header.writeUInt32LE(cpuType, 4)
  fs.writeFileSync(filePath, header)
  fs.chmodSync(filePath, executable ? 0o755 : 0o644)
}

function writePe(filePath, machine) {
  const header = Buffer.alloc(70)
  header.write('MZ', 0, 'ascii')
  header.writeUInt32LE(64, 0x3c)
  header.write('PE\0\0', 64, 'binary')
  header.writeUInt16LE(machine, 68)
  fs.writeFileSync(filePath, header)
}

function writeElf(filePath, machine) {
  const header = Buffer.alloc(64)
  header.write('\x7fELF', 0, 'latin1')
  header[4] = 2
  header[5] = 1
  header.writeUInt16LE(machine, 18)
  fs.writeFileSync(filePath, header)
}

/** 真实的平台子包都在 package.json 里声明 os/cpu（@ffmpeg-installer/win32-x64 就是 os:[win32] cpu:[x64]）。 */
function writePlatformPackage(familyPath, packageName) {
  const [platform, cpu] = packageName.split('-')
  const packagePath = path.join(familyPath, packageName)
  fs.mkdirSync(packagePath, { recursive: true })
  fs.writeFileSync(path.join(packagePath, 'package.json'), JSON.stringify({ name: packageName, os: [platform], cpu: [cpu] }))
  return packagePath
}

function writeTargetBinaries(rootPath, packageName, writers) {
  for (const family of ['ffmpeg', 'ffprobe']) {
    const packagePath = writePlatformPackage(path.join(rootPath, `@${family}-installer`), packageName)
    writers[family](path.join(packagePath, packageName.startsWith('win32-') ? `${family}.exe` : family))
  }
}

assert.equal(targetPackageName('darwin', 3), 'darwin-arm64')
assert.equal(targetPackageName('win32', 'x64'), 'win32-x64')
assert.throws(() => targetPackageName('darwin', 'universal'), /Unsupported packaged media target/)

// ── 判据本身 ──
assert.equal(packageSupportsTarget({ os: ['win32'], cpu: ['x64'] }, 'win32', 'x64'), true)
assert.equal(packageSupportsTarget({ os: ['darwin'], cpu: ['arm64'] }, 'win32', 'x64'), false)
assert.equal(packageSupportsTarget({ os: ['!win32'] }, 'win32', 'x64'), false)
assert.equal(packageSupportsTarget({ os: ['!win32'] }, 'darwin', 3), true)
assert.equal(packageSupportsTarget({ name: 'no-platform-fields' }, 'darwin', 3), true)
const javaClass = Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00, 0x00, 0x34, ...Buffer.alloc(56)])
assert.equal(binaryFormat(javaClass), null, 'Java class 文件和 Mach-O 胖包同魔数，不能误判成原生二进制')
const fat = Buffer.alloc(64)
fat.writeUInt32BE(0xcafebabe, 0)
fat.writeUInt32BE(2, 4)
fat.writeUInt32BE(0x01000007, 8)
fat.writeUInt32BE(0x0100000c, 28)
assert.deepEqual(binaryFormat(fat), { format: 'macho', archs: ['x64', 'arm64'] })
assert.equal(isForeignBinary(binaryFormat(fat), 'darwin', 3), false, '含目标架构的胖包不算外平台')
assert.equal(isForeignBinary({ format: 'pe', archs: ['ia32'] }, 'win32', 'x64'), false, 'x64 Windows 原生跑 32 位程序')
assert.equal(isForeignBinary({ format: 'pe', archs: ['arm64'] }, 'win32', 'x64'), true)
assert.equal(isForeignBinary({ format: 'elf', archs: ['x64'] }, 'win32', 'x64'), true)

// ── ffmpeg / ffprobe：按 os/cpu 删掉别的平台子包，只剩目标 ──
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-packaging-test-'))
for (const family of ['ffmpeg', 'ffprobe']) {
  const familyPath = path.join(root, `@${family}-installer`)
  fs.mkdirSync(familyPath, { recursive: true })
  for (const packageName of ['darwin-x64', 'linux-x64', 'win32-x64']) writePlatformPackage(familyPath, packageName)
}
writeTargetBinaries(root, 'darwin-arm64', {
  ffmpeg: (filePath) => writeMachO(filePath, 0x0100000c),
  ffprobe: (filePath) => writeMachO(filePath, 0x0100000c),
})

const result = prunePlatformBinaries(root, 'darwin', 3)
assert.equal(result.target, 'darwin-arm64')
assert.equal(result.removed.length, 6)
assert.ok(fs.existsSync(path.join(root, '@ffmpeg-installer', 'darwin-arm64')))
assert.ok(fs.existsSync(path.join(root, '@ffprobe-installer', 'darwin-arm64')))
assert.ok(!fs.existsSync(path.join(root, '@ffmpeg-installer', 'win32-x64')))
assert.ok(!fs.existsSync(path.join(root, '@ffprobe-installer', 'linux-x64')))
// macOS 目标的审计要看文件的 x 位；Windows 的文件系统表达不了 x 位（chmod 只管只读），
// 这几条在 Windows 上天然跑不成立——不是被测代码的问题。CI 的 contracts 跑在 Linux 上，照常全验。
if (process.platform === 'win32') {
  console.log('SKIP (win32): macOS 媒体目标审计依赖可执行位，Windows 上无法构造；由 Linux CI 覆盖')
} else {
  const audit = auditPackagedMedia(root, 'darwin', 3)
  assert.equal(audit.target, 'darwin-arm64')
  assert.deepEqual(
    audit.families.ffmpeg.map(({ packageName }) => packageName),
    ['darwin-arm64'],
  )
  assert.deepEqual(
    audit.families.ffprobe.map(({ packageName }) => packageName),
    ['darwin-arm64'],
  )
  assert.equal(audit.families.ffmpeg[0].executable.format, 'mach-o')

  fs.rmSync(path.join(root, '@ffprobe-installer', 'darwin-arm64'), { recursive: true, force: true })
  assert.throws(
    () => auditPackagedMedia(root, 'darwin', 3),
    /@ffprobe-installer must contain exactly darwin-arm64; found none/,
  )
  fs.mkdirSync(path.join(root, '@ffprobe-installer', 'darwin-arm64'), { recursive: true })
  assert.throws(() => auditPackagedMedia(root, 'darwin', 3), /required executable is missing/)
  writeMachO(path.join(root, '@ffprobe-installer', 'darwin-arm64', 'ffprobe'), 0x01000007)
  assert.throws(() => auditPackagedMedia(root, 'darwin', 3), /Mach-O architecture does not match arm64/)
  writeMachO(path.join(root, '@ffprobe-installer', 'darwin-arm64', 'ffprobe'), 0x0100000c, false)
  assert.throws(() => auditPackagedMedia(root, 'darwin', 3), /Mach-O binary is not executable/)
}
fs.rmSync(root, { recursive: true, force: true })

const windowsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-packaging-windows-test-'))
writeTargetBinaries(windowsRoot, 'win32-x64', {
  ffmpeg: (filePath) => writePe(filePath, 0x8664),
  ffprobe: (filePath) => writePe(filePath, 0x8664),
})
const windowsAudit = auditPackagedMedia(windowsRoot, 'win32', 'x64')
assert.equal(windowsAudit.families.ffprobe[0].executable.format, 'pe')
writePe(path.join(windowsRoot, '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe'), 0xaa64)
assert.throws(() => auditPackagedMedia(windowsRoot, 'win32', 'x64'), /PE architecture does not match x64/)
fs.rmSync(windowsRoot, { recursive: true, force: true })

// ── 多平台包里夹带的别的平台二进制：按文件头删，目标平台的、非原生的都留下 ──
// 形状照 0.22.4 Windows 包里真实命中的那几处（sandbox-runtime 的 vendor、pi-tui 的 native prebuilds）。
const mixedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-packaging-mixed-test-'))
const vendor = path.join(mixedRoot, '@anthropic-ai', 'sandbox-runtime', 'vendor')
for (const dir of ['seccomp/x64', 'seccomp/arm64', 'srt-win/x64', 'srt-win/arm64', 'java-proxy-agent']) fs.mkdirSync(path.join(vendor, dir), { recursive: true })
writeElf(path.join(vendor, 'seccomp', 'x64', 'apply-seccomp'), 0x3e)
writeElf(path.join(vendor, 'seccomp', 'arm64', 'apply-seccomp'), 0xb7)
writePe(path.join(vendor, 'srt-win', 'x64', 'srt-win.exe'), 0x8664)
writePe(path.join(vendor, 'srt-win', 'arm64', 'srt-win.exe'), 0xaa64)
fs.writeFileSync(path.join(vendor, 'java-proxy-agent', 'srt-proxy-agent.jar'), Buffer.from('PK\u0003\u0004 not native'))
const prebuilds = path.join(mixedRoot, '@earendil-works', 'pi-tui', 'native', 'darwin', 'prebuilds', 'darwin-arm64')
fs.mkdirSync(prebuilds, { recursive: true })
writeMachO(path.join(prebuilds, 'darwin-modifiers.node'), 0x0100000c)
const mixed = prunePlatformBinaries(mixedRoot, 'win32', 'x64')
assert.deepEqual(mixed.removed.sort(), [
  '@anthropic-ai/sandbox-runtime/vendor/seccomp/arm64/apply-seccomp',
  '@anthropic-ai/sandbox-runtime/vendor/seccomp/x64/apply-seccomp',
  '@anthropic-ai/sandbox-runtime/vendor/srt-win/arm64/srt-win.exe',
  '@earendil-works/pi-tui/native/darwin/prebuilds/darwin-arm64/darwin-modifiers.node',
])
assert.ok(fs.existsSync(path.join(vendor, 'srt-win', 'x64', 'srt-win.exe')), '目标平台的二进制必须留下')
assert.ok(fs.existsSync(path.join(vendor, 'java-proxy-agent', 'srt-proxy-agent.jar')), '不是原生二进制的资产必须留下')
fs.rmSync(mixedRoot, { recursive: true, force: true })

console.log('PACKAGED MEDIA BINARY TEST PASS')
