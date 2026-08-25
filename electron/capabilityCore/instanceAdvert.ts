// 能力核 · 实例广告 v2（形状 + 命名空间路径 + 握手校验，全是纯函数）。
//
// 为什么单独成模块（P1：一处派生，写者/读者共吃）：advert 是并发会话发现「Nomi 开着没、连的是哪个库」的
// 唯一探针。历史上 advert 只写 { pid, port, token, ... }，**不含库指纹也无归属校验** → 两个用不同
// NOMI_PROJECTS_DIR 起的会话抢同一个 instance.json，谁后写谁赢，受害会话的 nomi_list_projects 静默连到了
// 别人的库（2026-08-17 真实故障，见 docs/plan/2026-08-18-mcp-experience-overhaul.md §P3-F）。
//
// 治法两条，都落在这个模块里，写者与读者一律经它，从结构上关掉分叉：
//   ① **库指纹**：advert v2 带 projectsRoot（这个实例真正服务的绝对项目库）+ heartbeatAt（周期刷新的心跳）
//      + version:2。读者握手时比对 projectsRoot；不匹配绝不连（validateAdvert 返回 mismatch）。
//   ② **命名空间文件名**：非默认库的 advert 落 instance-<hash>.json（hash = 归一绝对路径的稳定摘要），默认库
//      仍用 instance.json（向后兼容）。于是走查/fixture 宿主（自带 NOMI_PROJECTS_DIR）在结构上**不可能**写到
//      生产 advert 的文件名上；两个同自定义库的会话仍能互相发现（同 hash → 同文件）。
//
// 陈旧/失联判定的阈值也定在这里，写者心跳周期与读者新鲜度窗口成对出现，避免两头飘。
import crypto from 'node:crypto'
import path from 'node:path'

/** 默认库的 advert 文件名（向后兼容：老写者/老读者都用它）。 */
export const DEFAULT_INSTANCE_FILE = 'instance.json'

/** 写者心跳刷新周期。读者新鲜度窗口须 > 它（留几拍抖动余量），否则活实例会被误判失联。 */
export const HEARTBEAT_INTERVAL_MS = 15_000
/** 读者判「实例失联/wedged」的阈值：心跳超过它没刷新 = 进程活着但卡死/挂起，快速失败而非盲等。 */
export const HEARTBEAT_STALE_MS = 45_000

/**
 * 运行中的 app 写的实例广告。v2 在 v1 的 { pid, port, token, startedAt, version } 上**加字段**
 * （projectsRoot / heartbeatAt / version:2），同文件超集——老读者忽略未知字段，不破坏升级中途的旧 launcher。
 */
export type InstanceAdvertisement = {
  version: number
  pid: number
  port: number
  token: string
  startedAt: number
  /** 这个实例真正服务的**绝对**项目库根（与 runtimePaths.getProjectsRoot 同源，写者传入，读者据此校验归属）。 */
  projectsRoot: string
  /** 心跳时间戳（epoch ms），写者周期刷新；读者据此判活实例是否失联。 */
  heartbeatAt: number
  /** app 版本（诊断用，非校验字段）。 */
  appVersion: string
}

/**
 * 归一一个绝对项目库路径，供 hash 与库匹配比较用。
 * 抹掉尾随分隔符、`.`/`..`、多余分隔符差异（path.normalize）；大小写按平台语义处理（macOS/Windows 常见
 * 大小写不敏感文件系统 → 小写化，避免同一库因大小写不同被判成两个库）。**不解析 symlink**（纯函数、无 IO；
 * symlink 归一交给调用方在有 IO 的层用 realpath 预处理——见 lockfile/launcher 注释）。
 */
export function normalizeProjectsRoot(root: string): string {
  const trimmed = String(root || '').trim()
  if (!trimmed) return ''
  let normalized = path.normalize(trimmed)
  // 去尾随分隔符（保留根 '/' 或 'C:\'）：normalize 后 '/a/b/' → '/a/b/'，仍可能带尾斜杠。
  if (normalized.length > 1) normalized = normalized.replace(/[\\/]+$/, '')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

/** 归一路径的稳定短摘要（sha256 前 12 hex）——命名空间文件名用。同库同 hash（跨进程/跨会话稳定）。 */
export function projectsRootHash(root: string): string {
  return crypto.createHash('sha256').update(normalizeProjectsRoot(root)).digest('hex').slice(0, 12)
}

/**
 * 某个「有效库根 + 是否默认」对应的 advert 文件名。
 * 默认库 → instance.json（back-compat）；非默认库 → instance-<hash>.json（结构隔离）。
 * 「是否默认」由调用方决定：写者知道 getProjectLocationState().source==='default'；读者据它能拿到的信号
 * （NOMI_PROJECTS_DIR / 可选的 settings 自定义根）判断，拿不准就当默认（走 instance.json + 结构隔离兜底）。
 */
export function instanceAdvertFileName(projectsRoot: string, isDefault: boolean): string {
  return isDefault ? DEFAULT_INSTANCE_FILE : `instance-${projectsRootHash(projectsRoot)}.json`
}

function isProcessAlive(pid: number, kill: (p: number, sig: number) => void = process.kill): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    // signal 0 = 只探测存在/权限，不真发信号。ESRCH=不存在，EPERM=存在但无权（仍算活）。
    kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * 把任意 JSON 解析出的对象校验成一个 v2 advert（含 v1→v2 兼容读取：缺 version/projectsRoot/heartbeatAt 的旧
 * advert 也能被解析出核心字段，是否算「合法 v2」交给 validateAdvert 分诊）。字段缺失/类型不符 → null。
 */
export function parseAdvert(raw: unknown): Partial<InstanceAdvertisement> | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (typeof value.pid !== 'number' || typeof value.port !== 'number' || typeof value.token !== 'string') {
    return null
  }
  return {
    version: typeof value.version === 'number' ? value.version : 1,
    pid: value.pid,
    port: value.port,
    token: value.token,
    startedAt: typeof value.startedAt === 'number' ? value.startedAt : 0,
    projectsRoot: typeof value.projectsRoot === 'string' ? value.projectsRoot : '',
    heartbeatAt: typeof value.heartbeatAt === 'number' ? value.heartbeatAt : 0,
    appVersion: typeof value.appVersion === 'string'
      ? value.appVersion
      : (typeof value.version === 'string' ? value.version : ''), // v1 把 app 版本放在 version（字符串）里
  }
}

/** 握手分诊结果：读者据 kind 决定连/快速失败/冷启。 */
export type AdvertVerdict =
  | { kind: 'malformed' } // 文件缺失/JSON 坏/核心字段缺 → 当作没开，走冷启
  | { kind: 'dead' } // 写它的进程已死（app 崩了没清广告）→ 走冷启（陈旧文件该清）
  | { kind: 'legacy'; pid: number } // v1 广告（无 projectsRoot）+ 进程活着 → 升级中途，别猜库，快速失败
  | { kind: 'stale'; pid: number; heartbeatAgeMs: number } // 进程活着但心跳过期 → wedged 实例，快速失败
  | { kind: 'mismatch'; instance: InstanceAdvertisement; expectedRoot: string } // 库不匹配 → 绝不连，快速失败
  | { kind: 'match'; instance: InstanceAdvertisement } // v2 + 活 + 心跳新鲜 + 库匹配 → 连（happy path）

export type ValidateAdvertOptions = {
  now?: number
  staleMs?: number
  kill?: (pid: number, sig: number) => void
}

/**
 * 把「解析后的 advert + 期望库根」判成一个 verdict。纯函数（进程存活探测可注入以便单测）。
 * 分诊顺序（先致命后可连）：坏 → 死 → 旧版 → 心跳陈旧 → 库不匹配 → 匹配。
 * 库匹配比较用 normalizeProjectsRoot（尾斜杠/大小写/`.`差异不算不同库）。
 *
 * expectedRoot 语义：
 *   · 字符串 → 读者能算出自己期望的确切库（如 bare-Node launcher 有 NOMI_PROJECTS_DIR）：做全等比较，
 *     不等 → mismatch，绝不连。
 *   · null → 读者读的是**默认库的 instance.json**、但无法在纯 bare-Node 里算出 documents 下默认绝对路径。
 *     此时命名空间已从结构上保证「只有 default-source 的 app 会写 instance.json」（自定义库都落
 *     instance-<hash>.json），故信任该文件声明的 projectsRoot、跳过全等（仍强制 v2/心跳/pid 校验）。
 */
export function validateAdvert(
  parsed: Partial<InstanceAdvertisement> | null,
  expectedRoot: string | null,
  options: ValidateAdvertOptions = {},
): AdvertVerdict {
  if (!parsed) return { kind: 'malformed' }
  const now = options.now ?? Date.now()
  const staleMs = options.staleMs ?? HEARTBEAT_STALE_MS
  const pid = Number(parsed.pid)
  if (!isProcessAlive(pid, options.kill)) return { kind: 'dead' }
  // v1 广告：进程活着但没库指纹。别猜它服务哪个库（可能是别人的），快速失败让用户重启升级。
  const isV2 = Number(parsed.version) >= 2 && typeof parsed.projectsRoot === 'string' && parsed.projectsRoot !== ''
  if (!isV2) return { kind: 'legacy', pid }
  const heartbeatAgeMs = now - Number(parsed.heartbeatAt || 0)
  if (heartbeatAgeMs > staleMs) return { kind: 'stale', pid, heartbeatAgeMs }
  const instance: InstanceAdvertisement = {
    version: Number(parsed.version),
    pid,
    port: Number(parsed.port),
    token: String(parsed.token),
    startedAt: Number(parsed.startedAt || 0),
    projectsRoot: String(parsed.projectsRoot),
    heartbeatAt: Number(parsed.heartbeatAt),
    appVersion: String(parsed.appVersion || ''),
  }
  if (expectedRoot !== null && normalizeProjectsRoot(instance.projectsRoot) !== normalizeProjectsRoot(expectedRoot)) {
    return { kind: 'mismatch', instance, expectedRoot }
  }
  return { kind: 'match', instance }
}
