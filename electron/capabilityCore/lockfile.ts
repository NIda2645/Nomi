// 能力核 · 实例广告 / 探测（见 docs/plan/2026-06-20-capability-core-headless-exposure.md §S4）。
//
// 「Nomi 开着没」是开/不开自动适配的关键探针。运行中的 app 启动 RPC server 后，把实例广告（v2 形状见
// instanceAdvert.ts：{ version:2, pid, port, token, startedAt, projectsRoot, heartbeatAt, appVersion }）写到
// 能力核目录下的 advert 文件；外部 CLI/MCP 读它就知道：有活实例 → 走 RPC（A 模式，改动实时反映到 UI）；
// 无/陈旧 → 走 headless host（B 模式）。
//
// **文件名带库命名空间**（instanceAdvert.instanceAdvertFileName）：默认库仍是 instance.json；非默认库（自定义
// NOMI_PROJECTS_DIR / settings 根）是 instance-<hash>.json，从结构上隔离并发的走查/fixture 宿主，杜绝串库。
//
// 陈旧判定：写广告的进程已死（pid 不在）→ 视为没开（app 崩了没清锁）。文件放 <capabilityCoreDir>/。
// 本模块服务**同进程 in-Electron stdio 路**（mcpStdioServer）：它读的是自己这台 app 写的广告，故 readLiveInstance
// 保持宽松（活进程即连，不做跨库快速失败——那是 bare-Node launcher 的握手职责，见 mcpNodeLauncher）。
import fs from 'node:fs'
import path from 'node:path'
import { ensureDir } from '../runtimePaths'
import { capabilityCoreDir } from './security'
import {
  DEFAULT_INSTANCE_FILE,
  instanceAdvertFileName,
  parseAdvert,
  type InstanceAdvertisement,
} from './instanceAdvert'

export { type InstanceAdvertisement } from './instanceAdvert'

/** 广告文件的绝对路径。传入库根 + 是否默认 → 命名空间文件名（默认库回退 instance.json）。 */
function instancePath(projectsRoot: string, isDefault: boolean): string {
  return path.join(capabilityCoreDir(), instanceAdvertFileName(projectsRoot, isDefault))
}

/** 运行中的 app 写实例广告（启动 RPC 后调）。文件名据广告自身的 projectsRoot + isDefault 派生。 */
export function writeInstanceAdvertisement(advertisement: InstanceAdvertisement, isDefault: boolean): void {
  ensureDir(capabilityCoreDir())
  fs.writeFileSync(instancePath(advertisement.projectsRoot, isDefault), JSON.stringify(advertisement, null, 2), 'utf8')
}

/** app 退出时清掉广告（best-effort，不抛——退出路径绝不卡）。清的是这个实例自己那份（同命名空间文件名）。 */
export function clearInstanceAdvertisement(projectsRoot: string, isDefault: boolean): void {
  try {
    fs.rmSync(instancePath(projectsRoot, isDefault), { force: true })
  } catch {
    /* 退出清理失败无所谓：下次读会做 pid 存活校验兜底 */
  }
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    // signal 0 = 只探测存在/权限，不真发信号。ESRCH=不存在，EPERM=存在但无权（仍算活）。
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * 读活实例广告（**同进程 in-Electron stdio 路**用）：文件存在 + 写它的进程仍活 → 返回广告（app 开着）；否则
 * null（没开/陈旧）。陈旧文件顺手清掉，避免反复 pid 探测。
 *
 * 库参数可选：传了（有效库根 + 是否默认）→ 读对应命名空间文件；不传 → 读默认 instance.json（stdio server 与它
 * 转发的 GUI 同库同进程组，默认路径足够；串库防护的重活在 bare-Node launcher 侧）。v2 超集字段照常读出，
 * 未识别的旧 v1 广告也兼容（parseAdvert 兜底）。
 */
export function readLiveInstance(
  library?: { projectsRoot: string; isDefault: boolean },
): InstanceAdvertisement | null {
  const file = library
    ? instancePath(library.projectsRoot, library.isDefault)
    : path.join(capabilityCoreDir(), DEFAULT_INSTANCE_FILE)
  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
  let parsed: Partial<InstanceAdvertisement> | null
  try {
    parsed = parseAdvert(JSON.parse(raw))
  } catch {
    return null
  }
  if (!parsed) return null
  if (!isProcessAlive(Number(parsed.pid))) {
    try { fs.rmSync(file, { force: true }) } catch { /* 兜底清理，不抛 */ }
    return null
  }
  return {
    version: Number(parsed.version) || 1,
    pid: Number(parsed.pid),
    port: Number(parsed.port),
    token: String(parsed.token),
    startedAt: Number(parsed.startedAt || 0),
    projectsRoot: String(parsed.projectsRoot || ''),
    heartbeatAt: Number(parsed.heartbeatAt || 0),
    appVersion: String(parsed.appVersion || ''),
  }
}
