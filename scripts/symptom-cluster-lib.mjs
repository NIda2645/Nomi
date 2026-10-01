// 症状聚类的判据本体（R21 / R14，2026-09-07；2026-10-02 起与「重写判据」合并）。
//
// 守的不变量：**同一层在短时间里被修第三次，就不许再修第四次了，先出那一层的结构评审。**
//
// 起因（类根因）：根因流程是**逐件**执行的——每份合同都诚实地问过「同类问题还能不能从别的
// 入口回来」，但它问的范围是那一件事。于是「同一个模块这周已经收到第三份合同」这个信号
// 从来没有 owner：每个修的人只看得见自己那一件，而三件挨着出现恰恰是「这一层的结构不对」
// 最便宜的证据。人不会去数——那是机器的活。
//
// 判据（刻意粗）：合同的 scope_paths / entry_points → 模块键（两级目录）；同一模块在 7 天窗口里
// 累计 ≥3 份合同 → 簇里**最新那份**合同必须带 `rewrite_decision`：{ decision: patch|rewrite|delete,
// characterization_test: <测试路径> }（2026-10-02 起取代「交一份结构评审文档」——两份并存就是并行版，P1）。
// 路径存在、选 rewrite 时测试必须在 diff 里，由 root-cause-contracts 的校验管；这里只判「有没有选」。
//
// 为什么门槛是「有没有做选择」而不是更聪明的判断：门岗只判**做没做**，做得好不好是人的事。
// 一道试图判质量的门岗会开始误判，然后被绕过（R17）。
//
// 老合同按日期阈值豁免：只有**整簇都在阈值之后**的窗口才受管。追溯会让门岗一上线就一片红，
// 而一片红的门岗等于不存在。

const CONTRACT_DATE = /(?:^|\/)(\d{4}-\d{2}-\d{2})-/
/** 从任意字符串里捞仓库路径样子的片段（entry_points 常写成一句话，路径夹在里面）。 */
const PATH_LIKE = /\b((?:src|electron|scripts|tests|docs|\.github)\/[\w./+-]+)/g

/** 整簇都在这天（含）之后才受管；更早的簇已按旧规矩（结构评审文档）处理过，不追溯。 */
export const SYMPTOM_CLUSTER_THRESHOLD_DATE = '2026-10-02'
export const REWRITE_DECISION_VALUES = ['patch', 'rewrite', 'delete']

export function hasRewriteDecision(decision) {
  return Boolean(decision) && REWRITE_DECISION_VALUES.includes(decision.decision)
    && typeof decision.characterization_test === 'string' && decision.characterization_test.trim() !== ''
}
export const SYMPTOM_CLUSTER_WINDOW_DAYS = 7
export const SYMPTOM_CLUSTER_MIN_CONTRACTS = 3

export function contractDate(file) {
  const match = CONTRACT_DATE.exec(String(file).replaceAll('\\', '/'))
  return match ? match[1] : null
}

/** 路径 → 模块键：三段及以上取前两段（electron/harness），否则取所在目录（scripts）。 */
export function moduleKey(candidate) {
  const clean = String(candidate).replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/\*+$/, '').replace(/\/$/, '')
  const segments = clean.split('/').filter(Boolean)
  if (segments.length === 0) return null
  if (segments.length >= 3) return segments.slice(0, 2).join('/')
  if (segments.length === 2) return segments[0]
  return segments[0]
}

/**
 * 这份合同算不算「这一层又被修了一次」。
 *
 * **`change_kind: "structural"` 的不算**（2026-09-22）。这道门自己的判词是「同一层在短时间里被修
 * 第三次，就先出结构评审」——它数的单位是**纠正性修复**。而结构性合同按 schema 定义就没有
 * `symptom` / `direct_cause` / `class_root`（`root-cause-contracts.mjs` 的 `validateStructuralContract`
 * 根本不要求这三样）：它声明的是「这次改动行为逐字不变」。把它算进症状簇，等于让一次纯搬家
 * 或纯删死代码去要求一份没有证据的结构评审——而**没有证据的评审正是这道门想防的东西**。
 *
 * 触发这条判断的实例：`2026-09-22-catalog-listing-dead-imports`（删两个没人读的 import，
 * 零行为变化，按门岗自己的正规出口走 structural），它一进来就把 `electron/catalog` 顶过了阈值。
 */
export function countsAsSymptom(contract) {
  return contract?.change_kind !== "structural"
}

/** 一份合同碰了哪些模块。scope_paths 是正式声明，entry_points 里夹的路径是补充。 */
export function modulesOf(contract) {
  if (!countsAsSymptom(contract)) return []
  const modules = new Set()
  for (const scope of Array.isArray(contract?.scope_paths) ? contract.scope_paths : []) {
    const key = moduleKey(scope)
    if (key) modules.add(key)
  }
  for (const entry of Array.isArray(contract?.entry_points) ? contract.entry_points : []) {
    for (const match of String(entry).matchAll(PATH_LIKE)) {
      const key = moduleKey(match[1])
      if (key) modules.add(key)
    }
  }
  return [...modules].sort()
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
}

/**
 * 找出「同一模块 windowDays 天内 ≥ minContracts 份合同」的**所有**窗口（按成员集合去重）。
 * `contracts` = [{ file, date, modules }]。
 *
 * 为什么不是「每个模块只报最密的那一个」：那样写会让**新窗口藏在老窗口后面**——
 * 一个历史上很热闹的模块（比如 electron/harness）永远有一个更大的旧窗口，
 * 于是这周新出现的三份合同一条都报不出来。实测栽过：三份探针合同加进去，聚簇数一点没变。
 * 现在返回全部窗口，由 evaluateClusters 挑出「整簇都在阈值之后」的那些，并按模块只报最密的一条。
 */
export function findClusters({ contracts, windowDays = SYMPTOM_CLUSTER_WINDOW_DAYS, minContracts = SYMPTOM_CLUSTER_MIN_CONTRACTS }) {
  const byModule = new Map()
  for (const contract of contracts) {
    if (!contract.date) continue
    for (const module of contract.modules) {
      if (!byModule.has(module)) byModule.set(module, [])
      byModule.get(module).push(contract)
    }
  }
  const clusters = []
  for (const [module, list] of [...byModule.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.file.localeCompare(b.file))
    const seen = new Set()
    for (let end = 0; end < sorted.length; end += 1) {
      const members = sorted.filter((entry) => {
        const gap = daysBetween(entry.date, sorted[end].date)
        return gap >= 0 && gap < windowDays
      })
      if (members.length < minContracts) continue
      const signature = members.map((entry) => entry.file).join('|')
      if (seen.has(signature)) continue
      seen.add(signature)
      clusters.push({ module, contracts: members, from: members[0].date, to: sorted[end].date })
    }
  }
  return clusters
}

/**
 * 判簇。只管**整簇都在阈值之后**的窗口；要求簇里最新那份合同带有效的 rewrite_decision。
 */
export function evaluateClusters({ clusters, threshold = SYMPTOM_CLUSTER_THRESHOLD_DATE }) {
  // 同一模块可能有多个重叠窗口；只报最密的那一条，否则一个热模块会刷屏，而刷屏的门岗没人读。
  const worstByModule = new Map()
  for (const cluster of clusters) {
    if (!cluster.contracts.every((entry) => entry.date >= threshold)) continue
    const newest = cluster.contracts[cluster.contracts.length - 1]
    if (hasRewriteDecision(newest.rewriteDecision)) continue
    const previous = worstByModule.get(cluster.module)
    if (!previous || cluster.contracts.length > previous.contracts.length) worstByModule.set(cluster.module, cluster)
  }
  const errors = []
  for (const cluster of [...worstByModule.values()].sort((a, b) => a.module.localeCompare(b.module))) {
    const newest = cluster.contracts[cluster.contracts.length - 1]
    errors.push(`模块 ${cluster.module}：${cluster.from} 到 ${cluster.to} 的 ${SYMPTOM_CLUSTER_WINDOW_DAYS} 天里已有 ${cluster.contracts.length} 份根因合同`
      + `\n      ${cluster.contracts.map((entry) => entry.file).join('\n      ')}`
      + `\n      —— 第三份合同是「这一层的结构不对」最便宜的证据，不是再补一次的理由。`
      + `\n      在最新那份（${newest.file}）里写 rewrite_decision：{ "decision": "patch|rewrite|delete", "characterization_test": "<特征测试路径>" }；`
      + `\n      选 rewrite：先写特征测试钉住旧行为，只重写一个模块，同一次提交删掉旧的（该测试必须在本次 diff 里）。`)
  }
  return errors
}
