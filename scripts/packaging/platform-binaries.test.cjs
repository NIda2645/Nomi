const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { auditPackagedMedia } = require('./audit-packaged-media.cjs')
const { prunePlatformBinaries, targetPackageName } = require('./platform-binaries.cjs')

function writeMachO(filePath, cpuType, executable = true) {
  const header = Buffer.alloc(8)
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

function writeTargetBinaries(rootPath, packageName, writers) {
  for (const family of ['ffmpeg', 'ffprobe']) {
    const packagePath = path.join(rootPath, `@${family}-installer`, packageName)
    fs.mkdirSync(packagePath, { recursive: true })
    writers[family](path.join(packagePath, packageName.startsWith('win32-') ? `${family}.exe` : family))
  }
}

assert.equal(targetPackageName('darwin', 3), 'darwin-arm64')
assert.equal(targetPackageName('win32', 'x64'), 'win32-x64')
assert.throws(() => targetPackageName('darwin', 'universal'), /Unsupported packaged media target/)

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-packaging-test-'))
for (const family of ['ffmpeg', 'ffprobe']) {
  const familyPath = path.join(root, `@${family}-installer`)
  fs.mkdirSync(familyPath, { recursive: true })
  for (const packageName of ['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64']) {
    fs.mkdirSync(path.join(familyPath, packageName), { recursive: true })
  }
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

console.log('PACKAGED MEDIA BINARY TEST PASS')
