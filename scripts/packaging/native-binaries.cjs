// 「这个原生二进制 / 这个平台包能不能在目标平台上跑」的唯一判据（2026-09-28，发版审计 A）。
//
// 两个消费者读同一份判据（P1）：
//   · scripts/packaging/platform-binaries.cjs 的 afterPack 裁剪——跑不起来的就不进包；
//   · scripts/audit-package.mjs 的禁带文件检查——包里还剩跑不起来的就判红。
// 裁剪和审计各写一套判据，迟早一个说「该删」、另一个说「没问题」。
//
// CommonJS：afterPack 由 electron-builder 用 require 加载，ESM 的审计脚本经 createRequire 取用。
const fs = require('node:fs')

const PE_ARCH = Object.freeze({ 0x8664: 'x64', 0xaa64: 'arm64', 0x14c: 'ia32', 0x1c4: 'arm' })
const MACHO_ARCH = Object.freeze({ 0x01000007: 'x64', 0x0100000c: 'arm64', 7: 'ia32', 12: 'arm' })
const ELF_ARCH = Object.freeze({ 0x3e: 'x64', 0xb7: 'arm64', 0x03: 'ia32', 0x28: 'arm', 0xf3: 'riscv64' })
const NATIVE_FORMAT = Object.freeze({ win32: 'pe', darwin: 'macho', linux: 'elf' })
/** x64 Windows 原生跑 32 位程序（electron-builder 自带的 elevate.exe 就是 32 位），不算别的平台。 */
const COMPATIBLE_ARCHS = Object.freeze({
  'win32-x64': Object.freeze(['x64', 'ia32']),
  'win32-arm64': Object.freeze(['arm64']),
  'darwin-arm64': Object.freeze(['arm64']),
  'darwin-x64': Object.freeze(['x64']),
  'linux-x64': Object.freeze(['x64']),
  'linux-arm64': Object.freeze(['arm64']),
})
const ARCH_NAMES = Object.freeze({ 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', ia32: 'ia32', x64: 'x64', armv7l: 'armv7l', arm64: 'arm64' })

/** electron-builder 的 Arch 枚举（数字）或名字 → 'x64' / 'arm64' / 'ia32' / 'arm'。 */
function normalizeArch(arch) {
  const name = ARCH_NAMES[arch] || String(arch || '')
  return name === 'armv7l' ? 'arm' : name
}

function normalizePlatform(platform) {
  const name = String(platform || '').trim()
  return name === 'windows' ? 'win32' : name
}

function readHead(file, bytes = 4096) {
  const fd = fs.openSync(file, 'r')
  try {
    const buffer = Buffer.alloc(bytes)
    return buffer.subarray(0, fs.readSync(fd, buffer, 0, bytes, 0))
  } finally {
    fs.closeSync(fd)
  }
}

/**
 * 文件头 → { format: 'pe' | 'macho' | 'elf', archs }；不是原生二进制返回 null。
 * CAFEBABE 既是 Mach-O 胖包也是 Java class 的魔数：胖包第二个字是架构个数（个位数），
 * class 文件那里是版本号（≥45），靠它区分。
 */
function binaryFormat(head) {
  if (head.length >= 64 && head.toString('latin1', 0, 2) === 'MZ') {
    const peOffset = head.readUInt32LE(0x3c)
    if (peOffset + 6 > head.length || head.toString('latin1', peOffset, peOffset + 4) !== 'PE\0\0') return null
    const machine = head.readUInt16LE(peOffset + 4)
    return { format: 'pe', archs: [PE_ARCH[machine] || `0x${machine.toString(16)}`] }
  }
  if (head.length >= 8) {
    const little = head.readUInt32LE(0)
    const big = head.readUInt32BE(0)
    if (little === 0xfeedfacf || little === 0xfeedface) return { format: 'macho', archs: [MACHO_ARCH[head.readUInt32LE(4)] || 'unknown'] }
    if (big === 0xfeedfacf || big === 0xfeedface) return { format: 'macho', archs: [MACHO_ARCH[head.readUInt32BE(4)] || 'unknown'] }
    if (big === 0xcafebabe || big === 0xcafebabf) {
      const count = head.readUInt32BE(4)
      if (count === 0 || count > 20) return null
      const entrySize = big === 0xcafebabe ? 20 : 32
      const archs = []
      for (let index = 0; index < count && 8 + index * entrySize + 4 <= head.length; index += 1) {
        archs.push(MACHO_ARCH[head.readUInt32BE(8 + index * entrySize)] || 'unknown')
      }
      return { format: 'macho', archs }
    }
  }
  if (head.length >= 20 && head[0] === 0x7f && head.toString('latin1', 1, 4) === 'ELF') {
    const machine = head[5] === 2 ? head.readUInt16BE(18) : head.readUInt16LE(18)
    return { format: 'elf', archs: [ELF_ARCH[machine] || `0x${machine.toString(16)}`] }
  }
  return null
}

/** 这个二进制在目标平台上跑不跑得起来；跑不起来 = 别的平台的二进制。 */
function isForeignBinary(detected, platform, arch) {
  if (!detected) return false
  const target = `${normalizePlatform(platform)}-${normalizeArch(arch)}`
  if (detected.format !== NATIVE_FORMAT[normalizePlatform(platform)]) return true
  const compatible = COMPATIBLE_ARCHS[target] || [normalizeArch(arch)]
  return !detected.archs.some((candidate) => compatible.includes(candidate))
}

/** 可能是原生二进制的文件：无扩展名或几种可执行/库扩展名。文本资产不读头，省时间也省误判。 */
function mayBeNativeBinary(relativePath) {
  const base = String(relativePath).split('/').pop() || ''
  if (/\.(?:exe|dll|node|dylib|so)$/i.test(base) || /\.so(?:\.\d+)+$/.test(base)) return true
  return !base.includes('.') && !/^(?:LICEN[CS]E|README|CHANGELOG|AUTHORS|NOTICE|COPYING|Makefile|PATENTS)$/i.test(base)
}

/**
 * npm 的 os / cpu 字段是包自己声明的「我能在哪跑」（支持 `!` 取反）。
 * 声明了且不含目标的包，在目标平台上一行都跑不起来——正常安装根本不会装它，进包就是多余。
 */
function packageSupportsTarget(manifest, platform, arch) {
  const allows = (list, value) => {
    if (!Array.isArray(list) || list.length === 0) return true
    if (list.includes(`!${value}`)) return false
    const positives = list.filter((item) => !String(item).startsWith('!'))
    return positives.length === 0 || positives.includes(value)
  }
  return allows(manifest.os, normalizePlatform(platform)) && allows(manifest.cpu, normalizeArch(arch))
}

module.exports = {
  binaryFormat,
  isForeignBinary,
  mayBeNativeBinary,
  normalizeArch,
  normalizePlatform,
  packageSupportsTarget,
  readHead,
}
