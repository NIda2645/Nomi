import { describe, expect, it, vi } from 'vitest'

import {
  buildProductionDeepLink,
  resolveProductionDeepLink,
} from './productionDeepLink'
import type { ProductionRun } from './productionRunTypes'

const run = {
  projectId: 'project-1',
  runId: 'run-1',
  artifacts: [{ artifactId: 'artifact-1' }],
} as ProductionRun

describe('production deep links', () => {
  it('builds and resolves a project/run/artifact link only after repository verification', () => {
    const read = vi.fn(() => run)
    const url = buildProductionDeepLink('project-1', 'run-1', 'artifact-1')
    expect(url).toBe('nomi://project/project-1/run/run-1?artifact=artifact-1')
    expect(resolveProductionDeepLink(url, { read } as never)).toEqual({
      projectId: 'project-1', runId: 'run-1', artifactId: 'artifact-1',
    })
    expect(read).toHaveBeenCalledWith('project-1', 'run-1')
  })

  it.each([
    'nomi://project/%2e%2e/run/run-1',
    'nomi://project/project-1/run/%2e%2e',
    'nomi://project/project-1/run/run-1?artifact=%2e%2e',
    'nomi://project/project-1/run/run-1?artifact=artifact-1&path=/tmp/a',
    'file:///Users/me/private.mp4',
  ])('rejects malformed or path-like deep link %s', (url) => {
    expect(() => resolveProductionDeepLink(url, { read: () => run } as never)).toThrow(/link|invalid|unsupported/i)
  })

  it('rejects a forged project/run pair and wrong-run artifact', () => {
    expect(() => resolveProductionDeepLink(
      'nomi://project/project-2/run/run-1',
      { read: () => null } as never,
    )).toThrow(/not found/i)
    expect(() => resolveProductionDeepLink(
      'nomi://project/project-1/run/run-1?artifact=artifact-2',
      { read: () => run } as never,
    )).toThrow(/artifact/i)
  })
})

describe('三种链接形状（W3③ 扩宽：此前只认 /run/，工程级链接是既有死链）', () => {
  const repo = { read: () => null } as unknown as Parameters<typeof resolveProductionDeepLink>[1]

  it('★工程级 nomi://project/{p} 现在解析得出（此前抛 Invalid path → 用户点了没反应）', () => {
    expect(resolveProductionDeepLink('nomi://project/proj-1', repo)).toEqual({ projectId: 'proj-1' })
  })

  it('节点级 nomi://project/{p}/node/{n} 解析出 nodeId（「指着看」直达那一镜）', () => {
    expect(resolveProductionDeepLink('nomi://project/proj-1/node/node-7', repo)).toEqual({ projectId: 'proj-1', nodeId: 'node-7' })
  })

  it('节点级不查 run 仓库（节点住画布快照，不在 production 仓库里）——repo 恒空也能解析', () => {
    expect(() => resolveProductionDeepLink('nomi://project/p/node/n', repo)).not.toThrow()
  })

  it('形状仍然收紧：未知段 /foo/ 拒、带查询参数的工程级拒、非法 id 拒', () => {
    expect(() => resolveProductionDeepLink('nomi://project/p/foo/x', repo)).toThrow()
    expect(() => resolveProductionDeepLink('nomi://project/p?artifact=a', repo)).toThrow()
    expect(() => resolveProductionDeepLink('nomi://project/..', repo)).toThrow()
    expect(() => resolveProductionDeepLink('nomi://project/p/node/../etc', repo)).toThrow()
  })
})
