// `check:skill-ipc-coverage` 的阳性对照（R17：加规则必须先验它会红）。
//
// 2026-09-18 判据从「一律 invokeSync」改成「每条通道两侧同一种协议」：技能目录改由 pi 的
// `loadSourcedSkills` 给（ESM、async），读目录的 `nomi:skill:list` / `nomi:skill:export` 走
// `ipcMain.handle` ↔ `ipcRenderer.invoke`，改盘的 import / delete 仍是 `registerSyncIpc` ↔ `invokeSync`。
// 旧判据防的从来不是 async 本身，是「一侧 Promise 一侧同步值，`res.ok` 对 Promise 恒 truthy」。
// 下面四条里，「协议混用」那条逐字就是 2026-09-03 合同不变量 ③ 防的形状。
import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateSkillIpcCoverage } from './check-skill-ipc-coverage.mjs'

const preload = (body) => `export const runtimeBridge = { skill: {\n${body}\n} }`
const main = (body) => `export function registerSkillIpc(registerSyncIpc) {\n${body}\n}`

test('绿：四条通道两侧协议逐条一致（两条 async 读目录，两条 sync 改盘）', () => {
  const verdict = evaluateSkillIpcCoverage(
    preload(`list: () => ipcRenderer.invoke("nomi:skill:list"),
      exportPackage: (d) => ipcRenderer.invoke("nomi:skill:export", d),
      importPackage: (p) => invokeSync("nomi:skill:import", p),
      deleteByDir: (d) => invokeSync("nomi:skill:delete", d),`),
    main(`ipcMain.handle("nomi:skill:list", async () => []);
      ipcMain.handle("nomi:skill:export", async () => null);
      registerSyncIpc("nomi:skill:import", () => ({ ok: true }));
      registerSyncIpc("nomi:skill:delete", () => ({ ok: true }));`),
  )
  assert.deepEqual(verdict.missing, [])
  assert.deepEqual(verdict.mismatched, [])
  assert.equal(verdict.empty, false)
  assert.equal(verdict.preload.get('nomi:skill:list'), 'async')
  assert.equal(verdict.preload.get('nomi:skill:import'), 'sync')
})

test('红 · 2026-09-03 的事故：preload 声明了三条写通道，主进程一条都没注册', () => {
  const verdict = evaluateSkillIpcCoverage(
    preload(`list: () => ipcRenderer.invoke("nomi:skill:list"),
      importPackage: (p) => invokeSync("nomi:skill:import", p),
      exportPackage: (d) => ipcRenderer.invoke("nomi:skill:export", d),
      deleteByDir: (d) => invokeSync("nomi:skill:delete", d),`),
    main(`ipcMain.handle("nomi:skill:list", async () => []);`),
  )
  assert.deepEqual(verdict.missing.sort(), ['nomi:skill:delete', 'nomi:skill:export', 'nomi:skill:import'])
})

test('红 · 协议混用：preload 用 invoke、主进程注册的是同步 handler（res.ok 对 Promise 恒 truthy）', () => {
  const verdict = evaluateSkillIpcCoverage(
    preload(`importPackage: (p) => ipcRenderer.invoke("nomi:skill:import", p),`),
    main(`registerSyncIpc("nomi:skill:import", () => ({ ok: true }));`),
  )
  assert.deepEqual(verdict.mismatched, [{ channel: 'nomi:skill:import', preload: 'async', main: 'sync' }])
})

test('红 · 反向混用也拦：主进程 handle 了，preload 却用 invokeSync（旧判据看不见这一半）', () => {
  const verdict = evaluateSkillIpcCoverage(
    preload(`list: () => invokeSync("nomi:skill:list"),`),
    main(`ipcMain.handle("nomi:skill:list", async () => []);`),
  )
  assert.deepEqual(verdict.mismatched, [{ channel: 'nomi:skill:list', preload: 'sync', main: 'async' }])
})

test('红 · 一条都没扫到 = 扫错地方，不是干净', () => {
  const verdict = evaluateSkillIpcCoverage(preload(`list: () => ipcRenderer.invoke("nomi:model:list"),`), main(``))
  assert.equal(verdict.empty, true)
})

test('注释里的通道不算数：被注释掉的注册不能让门岗变绿', () => {
  const verdict = evaluateSkillIpcCoverage(
    preload(`list: () => ipcRenderer.invoke("nomi:skill:list"),`),
    main(`// ipcMain.handle("nomi:skill:list", async () => []);`),
  )
  assert.deepEqual(verdict.missing, ['nomi:skill:list'])
})
