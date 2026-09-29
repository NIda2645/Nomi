import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  dayOf,
  extractFeedbackItem,
  buildFeedbackItems,
  flattenEvents,
  groupGenerationResults,
  rankErrorCodes,
  latestTwoDatesWithData,
  detectGenerationSpikes,
  tallyLaunches,
  tallyUpdateActions,
  buildIntakeReport,
} from './aggregate.mjs'

// 夹具：占位句，不放任何真实用户原文（任务书 §要做 1 明确要求）。形状照
// D:\tmp\nomi-intake 里的真实结构（receivedAt/receipt/ref/payload.manifest/payload.context）。
function fakeFeedback({ key, receivedAt, receipt = null, version = '0.22.3', platform = 'win32', surface = 'generation', errorCode = 'unknown', provider = 'custom', model = null, summary = '占位摘要文本', note = null }) {
  return {
    key,
    record: {
      schemaVersion: 1,
      receivedAt,
      route: '/v1/feedback',
      receipt,
      ref: key.split('/').pop().replace('.json', ''),
      payload: {
        schemaVersion: 1,
        manifest: { schemaVersion: 1, createdAt: receivedAt, app: { version, electron: '43.0.0', node: '24.0.0', chrome: '150' }, system: { platform, arch: 'x64', osRelease: '10.0', locale: 'zh-CN', timeZone: 'Asia/Shanghai' }, projectId: null, entries: [], excluded: [], totalBytes: 0 },
        context: { surface, summary, errorCode, note, contentIncluded: false, provider, model },
        attachments: {},
      },
    },
  }
}

function fakeEventsRecord({ key, events }) {
  return { key, record: { schemaVersion: 1, receivedAt: `${events[0]?.timestamp ?? '2026-09-24T00:00:00.000Z'}`, route: '/v1/events', receipt: null, ref: key, payload: { events } } }
}

function genEvent({ timestamp, capability, result, sessionId = 's1', appMajor = 0, appMinor = 22, osFamily = 'windows' }) {
  return { schemaVersion: 1, timestamp, sessionId, eventName: 'generation.completed', props: { capability, durationBucket: '1-5s', result, attemptCountBucket: '1' }, systemProps: { locale: 'zh-CN', osFamily, appMajor, appMinor } }
}

test('dayOf 截取 ISO 时间戳的日期部分', () => {
  assert.equal(dayOf('2026-09-24T01:37:00.617Z'), '2026-09-24')
  assert.equal(dayOf(''), '')
  assert.equal(dayOf(undefined), '')
})

test('extractFeedbackItem 取出报告要的那几格，缺字段兜底不抛', () => {
  const item = extractFeedbackItem('feedback/2026-09-27/a.json', fakeFeedback({ key: 'feedback/2026-09-27/a.json', receivedAt: '2026-09-27T13:31:12.554Z', receipt: 'NF-0927-0001', summary: '占位：素材内容与扩展名不符', note: '占位留言' }).record)
  assert.deepEqual(item, {
    key: 'feedback/2026-09-27/a.json',
    date: '2026-09-27',
    id: 'NF-0927-0001',
    version: '0.22.3',
    system: 'win32',
    locale: 'zh-CN',
    surface: 'generation',
    errorCode: 'unknown',
    provider: 'custom',
    model: null,
    summary: '占位：素材内容与扩展名不符',
    note: '占位留言',
  })
})

test('extractFeedbackItem 对畸形 payload 兜底，不抛', () => {
  const item = extractFeedbackItem('feedback/x.json', { receivedAt: '2026-09-01T00:00:00.000Z', ref: 'x' })
  assert.equal(item.id, 'x')
  assert.equal(item.version, 'unknown')
  assert.equal(item.surface, 'unknown')
  assert.equal(item.errorCode, null)
})

test('buildFeedbackItems 按日期新到旧排序', () => {
  const items = buildFeedbackItems([
    fakeFeedback({ key: 'feedback/2026-09-27/a.json', receivedAt: '2026-09-27T00:00:00.000Z', receipt: 'NF-1' }),
    fakeFeedback({ key: 'feedback/2026-09-28/b.json', receivedAt: '2026-09-28T00:00:00.000Z', receipt: 'NF-2' }),
  ])
  assert.deepEqual(items.map((i) => i.id), ['NF-2', 'NF-1'])
})

test('flattenEvents 拍平多条事件并跳过畸形条目', () => {
  const events = flattenEvents([
    fakeEventsRecord({ key: 'events/2026-09-24/a.json', events: [genEvent({ timestamp: '2026-09-24T00:00:00.000Z', capability: 'image', result: 'success' }), 'not-an-object', { eventName: 123 }] }),
  ])
  assert.equal(events.length, 1)
  assert.equal(events[0].date, '2026-09-24')
  assert.equal(events[0].sourceKey, 'events/2026-09-24/a.json')
})

test('groupGenerationResults 按能力/版本/系统/日期分组并算比例', () => {
  const events = flattenEvents([
    fakeEventsRecord({
      key: 'events/2026-09-24/a.json',
      events: [
        genEvent({ timestamp: '2026-09-24T00:00:00.000Z', capability: 'image', result: 'success' }),
        genEvent({ timestamp: '2026-09-24T00:00:00.000Z', capability: 'image', result: 'failure' }),
        genEvent({ timestamp: '2026-09-24T00:00:00.000Z', capability: 'image', result: 'failure' }),
        genEvent({ timestamp: '2026-09-24T00:00:00.000Z', capability: 'video', result: 'cancel' }),
      ],
    }),
  ])
  const gr = groupGenerationResults(events)
  assert.equal(gr.overall.total, 4)
  assert.equal(gr.overall.success, 1)
  assert.equal(gr.overall.failure, 2)
  assert.equal(gr.overall.cancel, 1)
  assert.equal(gr.overall.successRate, 25)
  const image = gr.byCapabilityOverall.find((c) => c.capability === 'image')
  assert.equal(image.total, 3)
  assert.equal(image.failure, 2)
  const group = gr.byGroup.find((g) => g.capability === 'image')
  assert.equal(group.appVersion, '0.22')
  assert.equal(group.osFamily, 'windows')
  assert.equal(group.date, '2026-09-24')
})

test('groupGenerationResults 对没有 generation.completed 的空输入不报错', () => {
  const gr = groupGenerationResults([])
  assert.equal(gr.overall.total, 0)
  assert.equal(gr.overall.successRate, 0)
  assert.deepEqual(gr.byGroup, [])
})

test('rankErrorCodes 按出现次数降序，同数按字母序', () => {
  const items = buildFeedbackItems([
    fakeFeedback({ key: 'feedback/2026-09-28/a.json', receivedAt: '2026-09-28T00:00:00.000Z', errorCode: 'input' }),
    fakeFeedback({ key: 'feedback/2026-09-28/b.json', receivedAt: '2026-09-28T00:00:00.000Z', errorCode: 'input' }),
    fakeFeedback({ key: 'feedback/2026-09-28/c.json', receivedAt: '2026-09-28T00:00:00.000Z', errorCode: 'asset-upload-failed' }),
    fakeFeedback({ key: 'feedback/2026-09-28/d.json', receivedAt: '2026-09-28T00:00:00.000Z', errorCode: null }),
  ])
  assert.deepEqual(rankErrorCodes(items), [
    { errorCode: 'input', count: 2 },
    { errorCode: 'asset-upload-failed', count: 1 },
  ])
})

test('latestTwoDatesWithData 跳过没有数据的空档日', () => {
  const events = [{ date: '2026-09-20' }, { date: '2026-09-24' }]
  assert.deepEqual(latestTwoDatesWithData(events), { latestDate: '2026-09-24', previousDate: '2026-09-20' })
  assert.deepEqual(latestTwoDatesWithData([]), { latestDate: null, previousDate: null })
})

test('detectGenerationSpikes 标出相对与绝对都够大的涨幅', () => {
  const events = flattenEvents([
    fakeEventsRecord({ key: 'events/2026-09-23/a.json', events: [genEvent({ timestamp: '2026-09-23T00:00:00.000Z', capability: 'video', result: 'failure' }), genEvent({ timestamp: '2026-09-23T00:00:00.000Z', capability: 'video', result: 'failure' })] }),
    fakeEventsRecord({
      key: 'events/2026-09-24/a.json',
      events: [
        genEvent({ timestamp: '2026-09-24T00:00:00.000Z', capability: 'video', result: 'failure' }),
        genEvent({ timestamp: '2026-09-24T00:00:00.000Z', capability: 'video', result: 'failure' }),
        genEvent({ timestamp: '2026-09-24T00:00:00.000Z', capability: 'video', result: 'failure' }),
        genEvent({ timestamp: '2026-09-24T00:00:00.000Z', capability: 'video', result: 'failure' }),
        genEvent({ timestamp: '2026-09-24T00:00:00.000Z', capability: 'video', result: 'failure' }),
      ],
    }),
  ])
  const spikes = detectGenerationSpikes(events)
  const labels = spikes.map((s) => s.dimension)
  assert.ok(labels.includes('生成失败'), `expected 生成失败 in ${JSON.stringify(labels)}`)
  assert.ok(labels.includes('video 失败'))
})

test('detectGenerationSpikes 不把小涨幅或小绝对数报成突增', () => {
  const events = flattenEvents([
    fakeEventsRecord({ key: 'events/2026-09-23/a.json', events: [genEvent({ timestamp: '2026-09-23T00:00:00.000Z', capability: 'image', result: 'failure' })] }),
    fakeEventsRecord({ key: 'events/2026-09-24/a.json', events: [genEvent({ timestamp: '2026-09-24T00:00:00.000Z', capability: 'image', result: 'failure' }), genEvent({ timestamp: '2026-09-24T00:00:00.000Z', capability: 'image', result: 'failure' })] }),
  ])
  // 1 -> 2：绝对数只有 2，低于 SPIKE_MIN_COUNT=3，不该报
  const spikes = detectGenerationSpikes(events)
  assert.deepEqual(spikes, [])
})

test('detectGenerationSpikes 处理"上一窗口是 0"的新增情况', () => {
  const events = flattenEvents([
    fakeEventsRecord({ key: 'events/2026-09-23/a.json', events: [genEvent({ timestamp: '2026-09-23T00:00:00.000Z', capability: 'image', result: 'success' })] }),
    fakeEventsRecord({ key: 'events/2026-09-24/a.json', events: [genEvent({ timestamp: '2026-09-24T00:00:00.000Z', capability: 'image', result: 'cancel' }), genEvent({ timestamp: '2026-09-24T00:00:00.000Z', capability: 'image', result: 'cancel' }), genEvent({ timestamp: '2026-09-24T00:00:00.000Z', capability: 'image', result: 'cancel' })] }),
  ])
  const spikes = detectGenerationSpikes(events)
  assert.ok(spikes.some((s) => s.dimension === '生成取消' && s.previousCount === 0 && s.currentCount === 3))
})

test('detectGenerationSpikes 数据不足两天时不报突增（不是"从 0 突增"的假信号）', () => {
  const events = flattenEvents([fakeEventsRecord({ key: 'events/2026-09-24/a.json', events: [genEvent({ timestamp: '2026-09-24T00:00:00.000Z', capability: 'image', result: 'failure' })] })])
  assert.deepEqual(detectGenerationSpikes(events), [])
})

test('tallyLaunches 按日期计数 app.started', () => {
  const events = flattenEvents([
    fakeEventsRecord({ key: 'events/2026-09-24/a.json', events: [{ schemaVersion: 1, timestamp: '2026-09-24T00:00:00.000Z', sessionId: 's', eventName: 'app.started', props: { appMajor: 0, appMinor: 22, osFamily: 'windows', locale: 'zh-CN' }, systemProps: { locale: 'zh-CN', osFamily: 'windows', appMajor: 0, appMinor: 22 } }] }),
  ])
  const launches = tallyLaunches(events)
  assert.equal(launches.total, 1)
  assert.deepEqual(launches.byDate, [{ date: '2026-09-24', count: 1 }])
})

test('tallyUpdateActions 按 action × result 计数', () => {
  const mk = (action, result) => ({ schemaVersion: 1, timestamp: '2026-09-24T00:00:00.000Z', sessionId: 's', eventName: 'update.action', props: { action, result }, systemProps: { locale: 'zh-CN', osFamily: 'windows', appMajor: 0, appMinor: 22 } })
  const events = flattenEvents([fakeEventsRecord({ key: 'events/2026-09-24/a.json', events: [mk('check', 'success'), mk('check', 'success'), mk('download', 'failure')] })])
  assert.deepEqual(tallyUpdateActions(events), [
    { action: 'check', result: 'success', count: 2 },
    { action: 'download', result: 'failure', count: 1 },
  ])
})

test('buildIntakeReport 只把 newFeedbackKeys 里的键当"本次新增反馈"', () => {
  const feedbackRecords = [
    fakeFeedback({ key: 'feedback/2026-09-27/old.json', receivedAt: '2026-09-27T00:00:00.000Z', receipt: 'NF-OLD' }),
    fakeFeedback({ key: 'feedback/2026-09-28/new.json', receivedAt: '2026-09-28T00:00:00.000Z', receipt: 'NF-NEW' }),
  ]
  const report = buildIntakeReport({
    feedbackRecords,
    eventRecords: [],
    trajectoriesCount: 0,
    newFeedbackKeys: ['feedback/2026-09-28/new.json'],
    newEventKeys: [],
    generatedAt: '2026-09-29T00:00:00.000Z',
  })
  assert.equal(report.totals.feedbackCount, 2)
  assert.equal(report.totals.newFeedbackCount, 1)
  assert.deepEqual(report.newFeedback.map((i) => i.id), ['NF-NEW'])
  assert.equal(report.totals.trajectoriesCount, 0)
})

test('buildIntakeReport 把本地解析失败的文件计入 dataQuality，不影响其余统计', () => {
  const report = buildIntakeReport({
    feedbackRecords: [],
    eventRecords: [],
    trajectoriesCount: 0,
    newFeedbackKeys: [],
    newEventKeys: [],
    corruptFiles: [{ key: 'feedback/2026-09-01/broken.json', error: 'Unexpected token' }],
    generatedAt: '2026-09-29T00:00:00.000Z',
  })
  assert.equal(report.dataQuality.corruptFileCount, 1)
  assert.equal(report.totals.feedbackCount, 0)
})
