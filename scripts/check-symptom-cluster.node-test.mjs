// 症状聚类判据的测试（R17：加规则先证明它会红）。
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  contractDate,
  countsAsSymptom,
  evaluateClusters,
  findClusters,
  moduleKey,
  modulesOf,
} from './symptom-cluster-lib.mjs'

const contract = (file, scopes, entries = [], rewriteDecision) => ({
  file,
  date: contractDate(file),
  modules: modulesOf({ scope_paths: scopes, entry_points: entries }),
  ...(rewriteDecision ? { rewriteDecision } : {}),
})
const OLD = '2026-09-07' // 测试用的旧阈值：fixture 日期都在 9 月，生产阈值是 10-02

test('模块键：三段及以上取前两段，两段取目录', () => {
  assert.equal(moduleKey('electron/harness/runtime/pi/session.mts'), 'electron/harness')
  assert.equal(moduleKey('src/workbench/generationCanvas/x.ts'), 'src/workbench')
  assert.equal(moduleKey('scripts/check-x.mjs'), 'scripts')
  assert.equal(moduleKey('electron/hardenedFetch.ts'), 'electron')
  assert.equal(moduleKey(''), null)
})

test('模块从 scope_paths 与 entry_points 两处取，去重排序', () => {
  const modules = modulesOf({
    scope_paths: ['electron/harness/runtime/pi/', 'electron/harness/other.ts'],
    entry_points: ['跑 pnpm run x；判据在 src/workbench/canvas/a.ts:12 那一带'],
  })
  assert.deepEqual(modules, ['electron/harness', 'src/workbench'])
})

test('7 天内第三份合同才成簇；跨过窗口就不成簇', () => {
  const inside = [
    contract('docs/fixes/2026-09-07-a.root-cause.json', ['electron/harness/x.ts']),
    contract('docs/fixes/2026-09-09-b.root-cause.json', ['electron/harness/y.ts']),
    contract('docs/fixes/2026-09-12-c.root-cause.json', ['electron/harness/z.ts']),
  ]
  const clusters = findClusters({ contracts: inside })
  assert.equal(clusters.length, 1)
  assert.equal(clusters[0].module, 'electron/harness')
  assert.equal(clusters[0].contracts.length, 3)

  const spread = [
    contract('docs/fixes/2026-09-07-a.root-cause.json', ['electron/harness/x.ts']),
    contract('docs/fixes/2026-09-09-b.root-cause.json', ['electron/harness/y.ts']),
    contract('docs/fixes/2026-09-20-c.root-cause.json', ['electron/harness/z.ts']),
  ]
  assert.deepEqual(findClusters({ contracts: spread }), [])
})

test('成簇且最新合同没写 rewrite_decision → 红；写了有效的选择 → 绿', () => {
  const decision = { decision: 'rewrite', characterization_test: 'electron/harness/x.test.ts' }
  const files = ['docs/fixes/2026-09-07-a.root-cause.json', 'docs/fixes/2026-09-09-b.root-cause.json', 'docs/fixes/2026-09-12-c.root-cause.json']
  const build = (newest) => findClusters({
    contracts: files.map((file, index) => contract(file, ['electron/harness/x.ts'], [], index === 2 ? newest : undefined)),
  })
  const red = evaluateClusters({ clusters: build(undefined), threshold: OLD })
  assert.equal(red.length, 1)
  assert.match(red[0], /已有 3 份根因合同/)
  assert.match(red[0], /rewrite_decision/)

  assert.equal(evaluateClusters({ clusters: build({ decision: 'maybe', characterization_test: 'a.test.ts' }), threshold: OLD }).length, 1, '选项不在 patch/rewrite/delete 里，不算')
  assert.equal(evaluateClusters({ clusters: build({ decision: 'patch', characterization_test: '  ' }), threshold: OLD }).length, 1, '没给特征测试路径，不算')
  assert.deepEqual(evaluateClusters({ clusters: build(decision), threshold: OLD }), [])
  for (const choice of ['patch', 'rewrite', 'delete']) {
    assert.deepEqual(evaluateClusters({ clusters: build({ ...decision, decision: choice }), threshold: OLD }), [], choice)
  }
})

test('只有簇里**最新**那份合同带选择才算（旧合同带着不算）', () => {
  const decision = { decision: 'patch', characterization_test: 'electron/harness/x.test.ts' }
  const clusters = findClusters({
    contracts: [
      contract('docs/fixes/2026-09-07-a.root-cause.json', ['electron/harness/x.ts'], [], decision),
      contract('docs/fixes/2026-09-09-b.root-cause.json', ['electron/harness/y.ts']),
      contract('docs/fixes/2026-09-12-c.root-cause.json', ['electron/harness/z.ts']),
    ],
  })
  assert.equal(evaluateClusters({ clusters, threshold: OLD }).length, 1)
})

test('生产阈值 2026-10-02：9 月的簇不追溯（那些已按旧规矩处理过）', () => {
  const clusters = findClusters({
    contracts: [
      contract('docs/fixes/2026-09-20-a.root-cause.json', ['electron/harness/x.ts']),
      contract('docs/fixes/2026-09-21-b.root-cause.json', ['electron/harness/y.ts']),
      contract('docs/fixes/2026-09-22-c.root-cause.json', ['electron/harness/z.ts']),
    ],
  })
  assert.deepEqual(evaluateClusters({ clusters }), [])
  const october = findClusters({
    contracts: ['02', '03', '04'].map((day) => contract(`docs/fixes/2026-10-${day}-x.root-cause.json`, ['electron/harness/x.ts'])),
  })
  assert.equal(evaluateClusters({ clusters: october }).length, 1)
})

test('整簇早于阈值 → 不追溯；混合窗口只要有一份早于阈值也不追溯', () => {
  const old = findClusters({
    contracts: [
      contract('docs/fixes/2026-09-01-a.root-cause.json', ['electron/harness/x.ts']),
      contract('docs/fixes/2026-09-02-b.root-cause.json', ['electron/harness/y.ts']),
      contract('docs/fixes/2026-09-03-c.root-cause.json', ['electron/harness/z.ts']),
    ],
  })
  assert.equal(old.length, 1)
  assert.deepEqual(evaluateClusters({ clusters: old, threshold: '2026-10-02' }), [])
})

test('新窗口不许藏在老窗口后面（实测栽过：只报最密的那一个，新增三份合同一条都报不出来）', () => {
  const contracts = [
    // 老的、更密的一簇（阈值之前，不追溯）
    contract('docs/fixes/2026-08-01-a.root-cause.json', ['electron/harness/a.ts']),
    contract('docs/fixes/2026-08-02-b.root-cause.json', ['electron/harness/b.ts']),
    contract('docs/fixes/2026-08-03-c.root-cause.json', ['electron/harness/c.ts']),
    contract('docs/fixes/2026-08-04-d.root-cause.json', ['electron/harness/d.ts']),
    contract('docs/fixes/2026-08-05-e.root-cause.json', ['electron/harness/e.ts']),
    // 这周新出现的三份（阈值之后，必须报）
    contract('docs/fixes/2026-09-20-x.root-cause.json', ['electron/harness/x.ts']),
    contract('docs/fixes/2026-09-21-y.root-cause.json', ['electron/harness/y.ts']),
    contract('docs/fixes/2026-09-22-z.root-cause.json', ['electron/harness/z.ts']),
  ]
  const errors = evaluateClusters({ clusters: findClusters({ contracts }), threshold: OLD })
  assert.equal(errors.length, 1, '新窗口必须被报出来')
  assert.match(errors[0], /2026-09-20 到 2026-09-22/)
  assert.ok(!errors[0].includes('2026-08-01'), '老窗口不该混进这条')
})

test('同一模块多个重叠窗口只报最密的一条（刷屏的门岗没人读）', () => {
  const contracts = ['20', '21', '22', '23', '24'].map((day) =>
    contract(`docs/fixes/2026-09-${day}-x.root-cause.json`, ['electron/harness/x.ts']))
  const clusters = findClusters({ contracts })
  assert.ok(clusters.length > 1, '窗口本身有多个')
  const errors = evaluateClusters({ clusters, threshold: OLD })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /已有 5 份根因合同/)
})

// 2026-09-22：这道门数的单位是**纠正性修复**。`change_kind: "structural"` 的合同按 schema 就没有
// symptom / direct_cause / class_root（结构性合同声明的是「行为逐字不变」），把它算进症状簇，
// 等于让一次纯搬家或纯删死代码去要求一份**没有证据的结构评审**——而那正是这道门想防的东西。
// 触发实例：`2026-09-22-catalog-listing-dead-imports`（删两个没人读的 import），它一进来就把
// `electron/catalog` 顶过了阈值。
test('结构性合同不算一次「这一层又被修了」', () => {
  const structural = { change_kind: 'structural', scope_paths: ['electron/catalog/modelCatalogListing.ts'] }
  assert.deepEqual(modulesOf(structural), [], '结构性合同不该贡献任何模块键')
  assert.equal(countsAsSymptom(structural), false)

  // 阳性对照一：同一份合同去掉 change_kind（= 纠正性）就照常计数——放行的是**那一档**，不是这个模块。
  assert.deepEqual(modulesOf({ scope_paths: structural.scope_paths }), ['electron/catalog'])
  assert.equal(countsAsSymptom({ change_kind: 'corrective' }), true)

  // 阳性对照二：两份纠正性 + 一份结构性 **不**成簇；把结构性那份换成纠正性就成簇。
  const corrective = (file) => contract(file, ['electron/catalog/x.ts'])
  const withStructural = [
    corrective('docs/fixes/2026-09-20-a.root-cause.json'),
    corrective('docs/fixes/2026-09-21-b.root-cause.json'),
    { file: 'docs/fixes/2026-09-22-c.root-cause.json', date: '2026-09-22',
      modules: modulesOf({ change_kind: 'structural', scope_paths: ['electron/catalog/y.ts'] }) },
  ]
  assert.deepEqual(findClusters({ contracts: withStructural }), [])
  const allCorrective = [...withStructural.slice(0, 2), corrective('docs/fixes/2026-09-22-c.root-cause.json')]
  assert.equal(findClusters({ contracts: allCorrective }).length, 1, '三份纠正性仍然照常成簇')
})
