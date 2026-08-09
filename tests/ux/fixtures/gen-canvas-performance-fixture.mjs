#!/usr/bin/env node
import { CANVAS_PERF_SCALES, createCanvasPerformanceFixture } from './canvas-performance-fixture.mjs'

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('用法：node tests/ux/fixtures/gen-canvas-performance-fixture.mjs <projectsDir> [scale]')
  console.log(`scale：${Object.keys(CANVAS_PERF_SCALES).join(' / ')}`)
  process.exit(0)
}

const projectsDir = process.argv[2]
const scale = process.argv[3] || 'M'
if (!projectsDir) {
  console.error('缺少 projectsDir；夹具必须写入显式隔离目录。')
  process.exit(2)
}

const fixture = createCanvasPerformanceFixture({ projectsDir, scale })
console.log('✅ 画布性能夹具已生成')
console.log(JSON.stringify(fixture.summary, null, 2))
console.log(`项目：${fixture.projectRoot}`)
