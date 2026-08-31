import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_INSTANCE_FILE,
  HEARTBEAT_STALE_MS,
  instanceAdvertFileName,
  normalizeProjectsRoot,
  parseAdvert,
  projectsRootHash,
  validateAdvert,
  type InstanceAdvertisement,
} from './instanceAdvert'

// 存活 pid 注入：这些单测不依赖真实进程，用可控 kill 桩把「活/死」变成纯输入。
const aliveKill = () => {}
const deadKill = () => {
  const error = new Error('ESRCH') as NodeJS.ErrnoException
  error.code = 'ESRCH'
  throw error
}

function v2(overrides: Partial<InstanceAdvertisement> = {}): InstanceAdvertisement {
  return {
    version: 2,
    pid: 4321,
    port: 51234,
    token: 'tok-abc',
    startedAt: 1_000,
    projectsRoot: '/Users/x/Nomi Projects',
    heartbeatAt: 10_000,
    appVersion: '0.20.0',
    ...overrides,
  }
}

describe('normalizeProjectsRoot', () => {
  it('strips trailing separators and resolves . segments so the same library compares equal', () => {
    expect(normalizeProjectsRoot('/Users/x/Nomi Projects/')).toBe(normalizeProjectsRoot('/Users/x/Nomi Projects'))
    expect(normalizeProjectsRoot('/Users/x/./Nomi Projects')).toBe(normalizeProjectsRoot('/Users/x/Nomi Projects'))
    expect(normalizeProjectsRoot('/Users/x/a/../Nomi Projects')).toBe(normalizeProjectsRoot('/Users/x/Nomi Projects'))
  })

  it('is empty for blank input', () => {
    expect(normalizeProjectsRoot('')).toBe('')
    expect(normalizeProjectsRoot('   ')).toBe('')
  })

  it('does not collapse the filesystem root away', () => {
    // 根 '/' 不该被尾分隔符裁剪规则吃掉。
    expect(normalizeProjectsRoot('/')).toBe(path.normalize('/'))
  })
})

describe('projectsRootHash', () => {
  it('is stable across trailing-slash / dot-segment variants of the same path', () => {
    const a = projectsRootHash('/Users/x/Nomi Projects')
    expect(projectsRootHash('/Users/x/Nomi Projects/')).toBe(a)
    expect(projectsRootHash('/Users/x/./Nomi Projects')).toBe(a)
  })

  it('differs for genuinely different libraries', () => {
    expect(projectsRootHash('/Users/x/Nomi Projects')).not.toBe(projectsRootHash('/Users/x/Fixture Projects'))
  })

  it('is a short lowercase hex digest', () => {
    expect(projectsRootHash('/Users/x/Nomi Projects')).toMatch(/^[0-9a-f]{12}$/)
  })
})

describe('instanceAdvertFileName', () => {
  it('uses plain instance.json for the default library (back-compat)', () => {
    expect(instanceAdvertFileName('/whatever', true)).toBe(DEFAULT_INSTANCE_FILE)
    expect(DEFAULT_INSTANCE_FILE).toBe('instance.json')
  })

  it('namespaces non-default libraries by a stable hash of the normalized root', () => {
    const name = instanceAdvertFileName('/Users/x/Fixture Projects', false)
    expect(name).toBe(`instance-${projectsRootHash('/Users/x/Fixture Projects')}.json`)
    // 尾斜杠不同的同一自定义库 → 同文件名（两个同库会话互相发现）。
    expect(instanceAdvertFileName('/Users/x/Fixture Projects/', false)).toBe(name)
  })

  it('gives two different custom libraries two different advert files (structural isolation)', () => {
    expect(instanceAdvertFileName('/libs/prod', false)).not.toBe(instanceAdvertFileName('/libs/walkthrough', false))
  })
})

describe('parseAdvert', () => {
  it('reads a full v2 advert', () => {
    const parsed = parseAdvert(v2())
    expect(parsed).toMatchObject({ version: 2, pid: 4321, port: 51234, token: 'tok-abc', projectsRoot: '/Users/x/Nomi Projects', heartbeatAt: 10_000 })
  })

  it('tolerates a legacy v1 advert: no version/projectsRoot/heartbeatAt, appVersion carried in string version', () => {
    const parsed = parseAdvert({ pid: 7, port: 8, token: 't', startedAt: 5, version: '0.19.0' })
    expect(parsed).toMatchObject({ version: 1, projectsRoot: '', heartbeatAt: 0, appVersion: '0.19.0' })
  })

  it('returns null when core fields are missing or mistyped', () => {
    expect(parseAdvert(null)).toBeNull()
    expect(parseAdvert('nope')).toBeNull()
    expect(parseAdvert({ pid: 'x', port: 8, token: 't' })).toBeNull()
    expect(parseAdvert({ pid: 7, port: 8 })).toBeNull() // no token
  })
})

describe('validateAdvert matrix', () => {
  const expected = '/Users/x/Nomi Projects'

  it('v2 fresh + alive + matching root → match', () => {
    const verdict = validateAdvert(parseAdvert(v2()), expected, { now: 10_000, kill: aliveKill })
    expect(verdict.kind).toBe('match')
    if (verdict.kind === 'match') expect(verdict.instance.port).toBe(51234)
  })

  it('matching root ignores trailing-slash / case differences (same library)', () => {
    const verdict = validateAdvert(parseAdvert(v2({ projectsRoot: '/Users/x/Nomi Projects/' })), expected, { now: 10_000, kill: aliveKill })
    expect(verdict.kind).toBe('match')
  })

  it('projectsRoot mismatch (alive) → mismatch verdict naming both roots', () => {
    const verdict = validateAdvert(parseAdvert(v2({ projectsRoot: '/Users/x/Fixture Projects' })), expected, { now: 10_000, kill: aliveKill })
    expect(verdict.kind).toBe('mismatch')
    if (verdict.kind === 'mismatch') {
      expect(verdict.instance.projectsRoot).toBe('/Users/x/Fixture Projects')
      expect(verdict.expectedRoot).toBe(expected)
    }
  })

  it('expectedRoot=null (default instance.json) trusts the advert root and never mismatches', () => {
    const verdict = validateAdvert(parseAdvert(v2({ projectsRoot: '/anything/at/all' })), null, { now: 10_000, kill: aliveKill })
    expect(verdict.kind).toBe('match')
  })

  it('alive but heartbeat older than the stale window → stale', () => {
    const verdict = validateAdvert(parseAdvert(v2({ heartbeatAt: 0 })), expected, { now: HEARTBEAT_STALE_MS + 1, kill: aliveKill })
    expect(verdict.kind).toBe('stale')
    if (verdict.kind === 'stale') expect(verdict.heartbeatAgeMs).toBeGreaterThan(HEARTBEAT_STALE_MS)
  })

  it('heartbeat exactly at the boundary is still fresh (> is stale, not >=)', () => {
    const verdict = validateAdvert(parseAdvert(v2({ heartbeatAt: 0 })), expected, { now: HEARTBEAT_STALE_MS, kill: aliveKill })
    expect(verdict.kind).toBe('match')
  })

  it('legacy v1 advert (no projectsRoot) but alive → legacy (do not guess the library)', () => {
    const parsed = parseAdvert({ pid: 7, port: 8, token: 't', startedAt: 5, version: '0.19.0' })
    const verdict = validateAdvert(parsed, expected, { now: 10_000, kill: aliveKill })
    expect(verdict.kind).toBe('legacy')
  })

  it('v2 shape but dead pid → dead (spawn path, not fast-fail)', () => {
    const verdict = validateAdvert(parseAdvert(v2()), expected, { now: 10_000, kill: deadKill })
    expect(verdict.kind).toBe('dead')
  })

  it('malformed / null parse → malformed', () => {
    expect(validateAdvert(null, expected, { kill: aliveKill }).kind).toBe('malformed')
  })

  it('dead check precedes legacy/stale/mismatch (a dead process is always just cold-boot)', () => {
    // 一个既旧版又库不匹配的广告，只要进程死了就该是 dead（走冷启），而非 legacy/mismatch 快速失败。
    const parsed = parseAdvert({ pid: 7, port: 8, token: 't', projectsRoot: '/other', version: 2, heartbeatAt: 0 })
    expect(validateAdvert(parsed, expected, { now: 10_000, kill: deadKill }).kind).toBe('dead')
  })
})
