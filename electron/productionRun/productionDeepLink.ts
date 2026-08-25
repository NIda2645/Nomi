import type { ProductionRunRepository } from './productionRunRepository'

function identifier(value: string, label: string): string {
  const normalized = String(value || '').trim()
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(normalized) || normalized === '.' || normalized === '..') throw new Error(`Invalid ${label} id in production link`)
  return normalized
}

/**
 * 深链目标。三种形状（W3③ 扩宽前只认第三种，前两种被 resolver 抛错 → 用户点了没反应，
 * 而 `nomi://project/{id}` 正是每条生成结果都在给用户的链接——**既有死链，本轮修根因**）：
 *  · 工程级 `nomi://project/{p}`               → { projectId }
 *  · 节点级 `nomi://project/{p}/node/{n}`      → { projectId, nodeId }（「指着看」直达那一镜）
 *  · Run 级 `nomi://project/{p}/run/{r}[?artifact=]` → { projectId, runId, artifactId? }
 */
export type ProductionDeepLinkTarget = { projectId: string; runId?: string; nodeId?: string; artifactId?: string }

export function buildProductionDeepLink(projectId: string, runId: string, artifactId?: string): string {
  const project = identifier(projectId, 'project')
  const run = identifier(runId, 'run')
  const artifact = artifactId === undefined ? undefined : identifier(artifactId, 'artifact')
  const base = `nomi://project/${encodeURIComponent(project)}/run/${encodeURIComponent(run)}`
  return artifact ? `${base}?artifact=${encodeURIComponent(artifact)}` : base
}

export function resolveProductionDeepLink(rawUrl: string, repository: Pick<ProductionRunRepository, 'read'>): ProductionDeepLinkTarget {
  let url: URL
  try { url = new URL(rawUrl) } catch { throw new Error('Invalid production deep link') }
  if (url.protocol !== 'nomi:' || url.hostname !== 'project' || url.port || url.username || url.password || url.hash) {
    throw new Error('Unsupported production deep link')
  }
  // 路径穿越防护（**必须在归一化之后的形状判断之前**）：`new URL()` 会把 `/run/..` 折叠成 `/`，
  // 于是「run 级带 .. 的恶意链接」会被折成看起来合法的工程级路径、被下面的宽松分支放行。
  // 故对**原始串**查一次穿越段（含百分号编码的 %2e）——既有安全用例
  // 「rejects …/run/%2e%2e」正是钉这个，扩宽形状时差点把它放水（2026-08-20 实测抓出）。
  const rawPath = rawUrl.slice(rawUrl.indexOf('//') + 2)
  if (/(^|\/)(\.|%2e){1,2}(\/|$)/i.test(rawPath)) throw new Error('Invalid production deep link path')
  const parts = url.pathname.split('/').filter(Boolean)
  // 形状一：工程级 nomi://project/{p}——生成结果给用户的默认链接。此前不被接受（抛 Invalid path
  // → 被上层 catch 成一行 warn）→ **用户点了没任何反应**。现在如实解析出工程目标。
  if (parts.length === 1) {
    let projectId: string
    try { projectId = identifier(decodeURIComponent(parts[0]), 'project') } catch { throw new Error('Invalid production deep link path') }
    if ([...url.searchParams.keys()].length) throw new Error('Invalid production deep link query')
    return { projectId }
  }
  if (parts.length !== 3 || (parts[1] !== 'run' && parts[1] !== 'node')) throw new Error('Invalid production deep link path')
  // 形状二：节点级 nomi://project/{p}/node/{n}——「指着看」直达那一镜（W3③）。
  // 不查 repository：节点住画布快照、不在 production run 仓库里；存在性由渲染层导航时兜（找不到就停在工程）。
  if (parts[1] === 'node') {
    let projectId: string
    let nodeId: string
    try { projectId = identifier(decodeURIComponent(parts[0]), 'project'); nodeId = identifier(decodeURIComponent(parts[2]), 'node') } catch { throw new Error('Invalid production deep link path') }
    if ([...url.searchParams.keys()].length) throw new Error('Invalid production deep link query')
    return { projectId, nodeId }
  }
  // 形状三：Run 级（既有行为，逐字节不变——含 run/artifact 的存在性校验）。
  let projectId: string
  let runId: string
  try { projectId = identifier(decodeURIComponent(parts[0]), 'project'); runId = identifier(decodeURIComponent(parts[2]), 'run') } catch { throw new Error('Invalid production deep link path') }
  const keys = [...url.searchParams.keys()]
  if (keys.some((key) => key !== 'artifact') || keys.filter((key) => key === 'artifact').length > 1) throw new Error('Invalid production deep link query')
  const artifactId = url.searchParams.has('artifact') ? identifier(url.searchParams.get('artifact') || '', 'artifact') : undefined
  const run = repository.read(projectId, runId)
  if (!run) throw new Error(`Production run not found: ${runId}`)
  if (run.projectId !== projectId) throw new Error('Production run project mismatch')
  if (artifactId && !run.artifacts.some((artifact) => artifact.artifactId === artifactId)) throw new Error(`Production artifact not found: ${artifactId}`)
  return { projectId, runId, ...(artifactId ? { artifactId } : {}) }
}
