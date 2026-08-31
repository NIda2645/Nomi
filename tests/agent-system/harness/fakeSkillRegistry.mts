import crypto from 'node:crypto'

export type FakeSkillEntry = {
  name: string
  directoryName: string
  description: string
  body?: string
  permissions?: readonly string[]
  trust?: 'trusted' | 'tainted'
}

export type FakeSkillRecord = FakeSkillEntry & {
  hash: string
  loadedAt: number
}

export type FakeSkillRegistry = {
  register: (skill: FakeSkillEntry) => FakeSkillRecord
  load: (name: string) => FakeSkillRecord
  list: () => readonly FakeSkillRecord[]
  snapshot: () => readonly FakeSkillRecord[]
  loaded: () => readonly string[]
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Skill registry values must be finite')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(',')}}`
  }
  throw new Error('Skill registry values must be JSON serializable')
}

function digest(value: unknown): string {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex')
}

export function createFakeSkillRegistry(entries: readonly FakeSkillEntry[] = []): FakeSkillRegistry {
  const registry = new Map<string, FakeSkillRecord>()
  const loads: string[] = []

  function register(skill: FakeSkillEntry): FakeSkillRecord {
    if (registry.has(skill.name)) throw new Error(`Duplicate fake skill: ${skill.name}`)
    const record: FakeSkillRecord = {
      ...structuredClone(skill),
      permissions: [...(skill.permissions ?? [])],
      trust: skill.trust ?? 'trusted',
      hash: digest({
        name: skill.name,
        directoryName: skill.directoryName,
        description: skill.description,
        body: skill.body ?? '',
        permissions: skill.permissions ?? [],
        trust: skill.trust ?? 'trusted',
      }),
      loadedAt: registry.size + 1,
    }
    registry.set(skill.name, record)
    return structuredClone(record)
  }

  for (const entry of entries) register(entry)

  function load(name: string): FakeSkillRecord {
    const record = registry.get(name)
    if (!record) throw new Error(`Unknown fake skill: ${name}`)
    loads.push(name)
    return structuredClone(record)
  }

  return {
    register,
    load,
    list: () => [...registry.values()].map((skill) => structuredClone(skill)),
    snapshot: () => [...registry.values()].map((skill) => structuredClone(skill)),
    loaded: () => [...loads],
  }
}
