#!/usr/bin/env node
// 接口级「已有能力清单」生成器的测试。
//
// 最要紧的一条是「没登记就列不出来」的红绿对照：用 laneContextFit 的真实场景——在 electron/agentLane/ 新建一个
// 裁剪上下文的文件——证明清单里能看到 pi 的 context-compaction；把这条登记拿掉，清单里就没有了。
// 补登记之前这条断言是红的，这就是它的价值（见 docs/research/2026-10-01-ai-collaboration-rules/report.md §3 缺的那张清单）。
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'
import { buildCapabilityIndex, DEFAULT_MAX_BYTES, loadRegistries, neighbourhoodOf } from './build-capability-index.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const real = loadRegistries(root)

const concept = (subject, owner, symbol = 'run') => ({ subject, name: `概念 ${subject}`, owner: { path: owner, symbol } })
const framework = (id, caps) => ({ id, capabilities: caps.map(([capId, scope, provides]) => ({ id: capId, scope, provides })) })

describe('邻域', () => {
  test('electron 取两段，src 取三段', () => {
    assert.equal(neighbourhoodOf('electron/agentLane/laneX.ts'), 'electron/agentLane')
    assert.equal(neighbourhoodOf('src/workbench/ai/lane/foo.ts'), 'src/workbench/ai')
    assert.equal(neighbourhoodOf('src/App.tsx'), 'src')
  })
})

describe('按目标路径筛选', () => {
  const concepts = [
    concept('a.one', 'electron/agentLane/laneA.ts'),
    concept('b.other', 'electron/catalog/catalogB.ts'),
  ]
  const frameworks = [framework('pi', [['compaction', ['electron/agentLane/'], '自动压缩：摘要旧消息'], ['other', ['src/'], '别处']])]

  test('只列同目录 owner 与 scope 命中的框架能力', () => {
    const { text } = buildCapabilityIndex({ concepts, frameworks, targetRel: 'electron/agentLane/new.ts' })
    assert.match(text, /\[pi\] compaction：自动压缩/)
    assert.match(text, /electron\/agentLane\/laneA\.ts#run/)
    assert.doesNotMatch(text, /catalogB/)
    assert.doesNotMatch(text, /\[pi\] other/)
  })

  test('什么都没命中就是空串，不塞凑数的内容', () => {
    assert.equal(buildCapabilityIndex({ concepts, frameworks, targetRel: 'scripts/x.mjs' }).text, '')
  })
})

describe('大小上限', () => {
  test('条目太多时按上限截断并说明还有多少', () => {
    const many = Array.from({ length: 80 }, (_, i) => concept(`c.${i}`, `electron/agentLane/file${i}.ts`, `symbolWithALongName${i}`))
    const result = buildCapabilityIndex({ concepts: many, frameworks: [], targetRel: 'electron/agentLane/new.ts' })
    assert.ok(result.bytes <= DEFAULT_MAX_BYTES, `超了 ${result.bytes}`)
    assert.match(result.text, /另有 \d+ 条没列出/)
  })

  test('真实登记表下，常见新建位置的清单都在上限内', () => {
    for (const target of ['electron/agentLane/laneNew.ts', 'electron/capabilityCore/new.ts', 'src/workbench/ai/lane/new.ts', 'src/workbench/generationCanvas/new.tsx', 'electron/catalog/new.ts']) {
      const { bytes } = buildCapabilityIndex({ ...real, targetRel: target })
      assert.ok(bytes <= DEFAULT_MAX_BYTES, `${target} 清单 ${bytes} 字节超上限`)
    }
  })
})

describe('laneContextFit 场景：登记决定看不看得见', () => {
  const target = 'electron/agentLane/laneContextFit.ts'

  test('登记了 context-compaction → 新建这个文件时清单里有 pi 的压缩', () => {
    const { text } = buildCapabilityIndex({ ...real, targetRel: target })
    assert.match(text, /\[pi\] context-compaction：自动压缩 compaction/)
    assert.match(text, /reserveTokens \/ keepRecentTokens/)
  })

  test('拿掉这条登记 → 清单里没有压缩（补登记之前就是这个红灯）', () => {
    const without = real.frameworks.map((fw) => (fw.id === 'pi'
      ? { ...fw, capabilities: fw.capabilities.filter((cap) => cap.id !== 'context-compaction') }
      : fw))
    const { text } = buildCapabilityIndex({ concepts: real.concepts, frameworks: without, targetRel: target })
    assert.doesNotMatch(text, /compaction/i)
  })
})

describe('不入库、不另起真相源', () => {
  test('仓库里没有被提交的清单产物', () => {
    const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n')
    const offenders = tracked.filter((file) => /capability-index.*\.(json|md|txt)$/i.test(file))
    assert.deepEqual(offenders, [])
  })
})
