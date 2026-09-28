#!/usr/bin/env node
/**
 * Skill IPC coverage gate — 2026-09-03（2026-09-18 扩成「每条通道两侧同一种协议」）。
 *
 * 根因：PR #279 交付了渲染层解析和主进程落地函数，但忘了把三个 write IPC handler
 * 注册进 registerSkillIpc，导致整条功能无声失效，CI 全绿。同一批还抓到协议混用：
 * preload 用 `ipcRenderer.invoke`（拿到 Promise）而主进程注册的是同步 handler，渲染层的
 * `res.ok` 对一个 Promise 恒 truthy——错误路径被掩盖。
 *
 * 这个门岗的设计原则：
 *   1. 扫 preload 里 skill 对象内所有 nomi:skill:* 通道（真相源），**连同它用的协议**：
 *      `invokeSync(...)` = 同步；`ipcRenderer.invoke(...)` = 异步。
 *   2. 扫 electron/skills/skillIpc.ts 里注册的通道，连同协议：
 *      `registerSyncIpc(...)` = 同步；`ipcMain.handle(...)` = 异步。
 *   3. 差集必须为零，而且**每条通道两侧协议必须相同**——缺一侧就是「No handler registered」，
 *      两侧协议不同就是那个 Promise-truthy 的坑。
 *
 * 为什么不再是「一律 invokeSync」（2026-09-03 的 Guard 2 原文）：技能目录自 2026-09-18 起由 pi 的
 * `loadSourcedSkills` 给（ESM、async），读目录的两条通道（list / export）必须走 `ipcMain.handle`。
 * 那条 Guard 防的从来不是「async 本身」，是「一侧 async 一侧 sync」——所以判据改成逐通道对齐，
 * 比原来更准：原来只拦 preload 侧的 invoke，拦不住「主进程 handle 了但 preload 用 sendSync」。
 * 改盘的两条（import / delete）不碰目录，仍是同步（2026-09-03 合同不变量 ③ 的那一半原样保留）。
 *
 * 为什么是硬零而不是棘轮：
 *   - 棘轮只关心「总数」，删掉一条合法的再加一条缺失的，计数不变照样绿；
 *   - 这里要的是「每条 preload 通道都有对应注册且协议一致」，是一一对应关系，只有硬零能保证。
 *
 * 为什么不 import TypeScript：这是一个在 build 之前跑的静态扫描，不依赖编译产物。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// preload 的桥面自 2026-09-17 起分成 electron/preload.ts（组装层）+ electron/preload/*.ts（各族桥面）。
// 这里扫的是「渲染层能调到的全部 nomi:skill:* 通道」，所以两处都要读——只读组装层会扫出 0 条，
// 而 0 条会让这道门岗静默变绿（假绿），下面的 Guard 0 就是钉住这一点的响的检测器。
const preloadFiles = [
  path.join(repoRoot, 'electron', 'preload.ts'),
  ...fs.readdirSync(path.join(repoRoot, 'electron', 'preload'))
    .filter((name) => name.endsWith('.ts'))
    .map((name) => path.join(repoRoot, 'electron', 'preload', name)),
]
const skillIpcFile = path.join(repoRoot, 'electron', 'skills', 'skillIpc.ts')

function stripLineComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ''))
    .replace(/^[^\S\n]*\/\/.*$/gm, '')
}

/** channel → 'sync' | 'async'，按 preload 侧调用它用的原语判。 */
export function extractPreloadSkillChannels(source) {
  const channels = new Map()
  const syncRe = /invokeSync\s*\(\s*["'`](nomi:skill:[^"'`]+)["'`]/g
  const asyncRe = /ipcRenderer\.invoke\s*\(\s*["'`](nomi:skill:[^"'`]+)["'`]/g
  let m
  while ((m = syncRe.exec(source)) !== null) channels.set(m[1], 'sync')
  while ((m = asyncRe.exec(source)) !== null) channels.set(m[1], 'async')
  return channels
}

/** channel → 'sync' | 'async'，按主进程注册它用的原语判。 */
export function extractRegisteredSkillChannels(source) {
  const channels = new Map()
  const syncRe = /registerSyncIpc\s*\(\s*["'`](nomi:skill:[^"'`]+)["'`]/g
  const asyncRe = /ipcMain\.handle\s*\(\s*["'`](nomi:skill:[^"'`]+)["'`]/g
  let m
  while ((m = syncRe.exec(source)) !== null) channels.set(m[1], 'sync')
  while ((m = asyncRe.exec(source)) !== null) channels.set(m[1], 'async')
  return channels
}

/** 纯判据（node-test 喂假源码用）：缺注册 / 协议不一致 / 一条都没扫到，三种红。 */
export function evaluateSkillIpcCoverage(preloadSrc, skillIpcSrc) {
  const preload = extractPreloadSkillChannels(stripLineComments(preloadSrc))
  const registered = extractRegisteredSkillChannels(stripLineComments(skillIpcSrc))
  const missing = [...preload.keys()].filter((channel) => !registered.has(channel))
  const mismatched = [...preload.entries()]
    .filter(([channel, protocol]) => registered.has(channel) && registered.get(channel) !== protocol)
    .map(([channel, protocol]) => ({ channel, preload: protocol, main: registered.get(channel) }))
  return { preload, registered, missing, mismatched, empty: preload.size === 0 }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  for (const file of preloadFiles) {
    if (!fs.existsSync(file)) {
      console.error(`✖ preload source not found: ${file}`)
      process.exit(1)
    }
  }
  if (!fs.existsSync(skillIpcFile)) {
    console.error(`✖ skillIpc.ts not found: ${skillIpcFile}`)
    process.exit(1)
  }

  const preloadSrc = preloadFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n')
  const verdict = evaluateSkillIpcCoverage(preloadSrc, fs.readFileSync(skillIpcFile, 'utf8'))
  let failed = false

  // Guard 0（硬零）：扫不到任何 nomi:skill:* 通道 = 扫错地方了，不是「协议很干净」。
  // 桥面搬过一次家（2026-09-17 拆 preload 巨壳），这道检测器保证下次再搬家时门岗会红而不是变绿。
  if (verdict.empty) {
    failed = true
    console.log('\n✖ Skill IPC coverage: 在 preload 侧一条 nomi:skill:* 都没扫到。')
    console.log('  这几乎一定是桥面又搬家了（扫描清单：' + preloadFiles.map((f) => path.relative(repoRoot, f)).join(', ') + '）。')
    console.log('  修法是把新位置加进 preloadFiles，不是把这条判据删掉——0 条通道过关就是假绿。')
  }

  // Guard 1：每条 preload 通道在主进程都有注册。
  if (verdict.missing.length > 0) {
    failed = true
    console.log('\n✖ Skill IPC coverage: preload 声明了但主进程没有注册的通道:')
    for (const ch of verdict.missing) {
      const protocol = verdict.preload.get(ch)
      const how = protocol === 'sync' ? `registerSyncIpc("${ch}", handler)` : `ipcMain.handle("${ch}", handler)`
      console.log(`    "${ch}"  — 在 electron/skills/skillIpc.ts 的 registerSkillIpc 里补上 ${how}`)
    }
    console.log()
    console.log('  后果：渲染层调用返回 "No handler registered for \'...\'"，UI 静默失败（P0 体验断点）。')
    console.log('  这正是 2026-09-03 走查发现的根因：nomi:skill:import/export/delete 三条全缺。')
  }

  // Guard 2：同一条通道两侧同一种协议。
  if (verdict.mismatched.length > 0) {
    failed = true
    console.log('\n✖ Skill IPC 协议混用: 以下 nomi:skill:* 通道两侧协议不一致（一侧拿到 Promise、一侧回同步值，res.ok 检查失效）:')
    for (const { channel, preload, main } of verdict.mismatched) {
      console.log(`    "${channel}"  preload=${preload} / main=${main}  → 两侧改成同一种：sync = invokeSync ↔ registerSyncIpc；async = ipcRenderer.invoke ↔ ipcMain.handle`)
    }
  }

  if (failed) {
    console.log('\n[check:skill-ipc-coverage] 未通过。')
    process.exit(1)
  }

  const summary = [...verdict.preload.entries()].map(([ch, protocol]) => `${ch}[${protocol}]`).join(', ')
  console.log(`✅ Skill IPC coverage: preload 声明的通道（${summary}）在主进程全部有注册，且逐通道协议一致。`)
}
