// 读「用户真正拿到的那份包」（2026-09-28，发版审计 A）：布局、app.asar 目录树。
// 只读，不解包：asar 的文件表用 @electron/asar 的 getRawHeader 取，文件内容按表里的偏移直接读。
// 原生二进制「能不能在目标平台跑」的判据不在这里——在 scripts/packaging/native-binaries.cjs，
// afterPack 裁剪与审计共用那一份。消费者：scripts/audit-package.mjs。
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { binaryFormat, readHead } = require('../packaging/native-binaries.cjs')

/** 平台键 = 预算文件 platforms 里的键。 */
export function platformKey(platform, arch) {
  return `${platform}-${arch}`
}

/** 解出产物布局：Windows/Linux 的 unpacked 目录，或 macOS 的 .app（也接受 .app/Contents/Resources）。 */
export function resolvePackageLayout(input) {
  const absolute = path.resolve(input)
  const bundle = absolute.endsWith('.app') ? absolute
    : /\.app[\\/]Contents[\\/]Resources[\\/]?$/.test(absolute) ? path.resolve(absolute, '..', '..') : null
  if (bundle) {
    return {
      platform: 'darwin',
      installRoot: bundle,
      resourcesDir: path.join(bundle, 'Contents', 'Resources'),
      executable: path.join(bundle, 'Contents', 'MacOS', path.basename(bundle, '.app')),
      // Chromium 的 locale.pak 在框架里；应用自己的 Resources 下还有一套同名 .lproj（系统据此判断 App 支持哪些语言）。
      localeDirs: [path.join(bundle, 'Contents', 'Frameworks', 'Electron Framework.framework', 'Resources'), path.join(bundle, 'Contents', 'Resources')],
      localeExtension: '.lproj',
    }
  }
  const resourcesDir = path.join(absolute, 'resources')
  if (!fs.existsSync(path.join(resourcesDir, 'app.asar'))) {
    throw new Error(`${absolute} 不像打包产物：既不是 .app，也没有 resources/app.asar`)
  }
  const executables = fs.readdirSync(absolute).filter((name) => /\.exe$/i.test(name))
  const windows = executables.length > 0
  const main = windows ? executables.find((name) => !/^(?:elevate|uninstall)/i.test(name)) ?? executables[0] : null
  return {
    platform: windows ? 'win32' : 'linux',
    installRoot: absolute,
    resourcesDir,
    executable: main ? path.join(absolute, main) : null,
    localeDirs: [path.join(absolute, 'locales')],
    localeExtension: '.pak',
  }
}

/** 主程序的架构（胖包记成 universal）。 */
export function detectArch(layout) {
  if (!layout.executable || !fs.existsSync(layout.executable)) throw new Error(`找不到主程序：${layout.executable}`)
  const detected = binaryFormat(readHead(layout.executable))
  if (!detected) throw new Error(`读不出主程序的格式：${layout.executable}`)
  return detected.archs.length > 1 ? 'universal' : detected.archs[0]
}

/** 目录里所有文件（相对路径用 /）。符号链接不跟随、按零字节记。 */
export function walkFiles(root) {
  const files = []
  const stack = ['']
  while (stack.length > 0) {
    const relative = stack.pop()
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isDirectory()) stack.push(childRelative)
      else if (entry.isFile()) files.push({ path: childRelative, bytes: fs.statSync(path.join(root, childRelative)).size })
      else files.push({ path: childRelative, bytes: 0, link: true })
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * app.asar 的文件表。entries：path → { path, bytes, unpacked, offset?, link? }。
 * unpacked 的真文件在 app.asar.unpacked/ 下同一相对路径；其余在归档里 8 + headerSize + offset 处
 * （与 @electron/asar 的 disk.readFileSync 同一算法）。
 */
export function openAsar(archivePath) {
  const asar = require('@electron/asar')
  const { header, headerSize } = asar.getRawHeader(archivePath)
  const entries = new Map()
  const directories = new Set([''])
  const walk = (node, prefix) => {
    for (const [name, child] of Object.entries(node.files ?? {})) {
      const relative = prefix ? `${prefix}/${name}` : name
      if (child.files) {
        directories.add(relative)
        walk(child, relative)
      } else if (child.link !== undefined) {
        entries.set(relative, { path: relative, bytes: 0, unpacked: false, link: child.link })
      } else {
        entries.set(relative, { path: relative, bytes: Number(child.size) || 0, unpacked: child.unpacked === true, offset: child.offset })
      }
    }
  }
  walk(header, '')
  const dataStart = 8 + headerSize
  const unpackedRoot = `${archivePath}.unpacked`
  let fd = null
  const read = (relative, limit) => {
    const entry = entries.get(relative)
    if (!entry || entry.link !== undefined) return null
    if (entry.unpacked) {
      const file = path.join(unpackedRoot, ...relative.split('/'))
      if (!fs.existsSync(file)) return null
      return limit ? readHead(file, limit) : fs.readFileSync(file)
    }
    fd ??= fs.openSync(archivePath, 'r')
    const length = limit ? Math.min(limit, entry.bytes) : entry.bytes
    const buffer = Buffer.alloc(length)
    fs.readSync(fd, buffer, 0, length, dataStart + Number(entry.offset))
    return buffer
  }
  return {
    entries,
    directories,
    /** 文件表里有、且（若是 unpacked）盘上那份真文件还在——afterPack 删掉的外平台文件表里仍有记录。 */
    exists: (relative) => {
      const entry = entries.get(relative)
      if (!entry) return false
      return !entry.unpacked || fs.existsSync(path.join(unpackedRoot, ...relative.split('/')))
    },
    readText: (relative) => read(relative)?.toString('utf8') ?? null,
    readHead: (relative, limit = 4096) => read(relative, limit),
    close: () => {
      if (fd !== null) fs.closeSync(fd)
      fd = null
    },
  }
}

/** asar 里一个文件归哪一组：node_modules 下按（最内层的）包，其余按顶层目录。 */
export function asarGroupOf(relative) {
  const parts = relative.split('/')
  const index = parts.lastIndexOf('node_modules')
  if (index >= 0 && index + 1 < parts.length) {
    return parts[index + 1].startsWith('@') ? `${parts[index + 1]}/${parts[index + 2] ?? ''}` : parts[index + 1]
  }
  return parts.length > 1 ? parts[0] : '(根目录)'
}

/** asar 里所有装进来的包：{ name, dir }（dir 是归档内路径，嵌套 node_modules 也算）。 */
export function packagedPackages(archive) {
  const packages = []
  for (const directory of archive.directories) {
    const parts = directory.split('/')
    const last = parts.length - 1
    const scoped = last >= 2 && parts[last - 2] === 'node_modules' && parts[last - 1].startsWith('@')
    const plain = last >= 1 && parts[last - 1] === 'node_modules' && !parts[last].startsWith('@') && !parts[last].startsWith('.')
    if ((scoped || plain) && archive.exists(`${directory}/package.json`)) {
      packages.push({ name: scoped ? `${parts[last - 1]}/${parts[last]}` : parts[last], dir: directory })
    }
  }
  return packages.sort((a, b) => a.dir.localeCompare(b.dir))
}

/** 在归档里按 Node 的规则从 fromDir 往上找 node_modules/<name>；找到返回包目录，找不到返回 null。 */
export function resolveInArchive(archive, name, fromDir) {
  let dir = fromDir
  for (;;) {
    const candidate = dir ? `${dir}/node_modules/${name}` : `node_modules/${name}`
    if (archive.exists(`${candidate}/package.json`)) return candidate
    if (!dir) return null
    const cut = dir.lastIndexOf('/')
    dir = cut < 0 ? '' : dir.slice(0, cut)
  }
}
