import type { ProductionRun } from './productionRunTypes'

export function safeExternalText(value: string): string {
  const text = Array.from(String(value || ''), (character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1f || codePoint === 0x7f ? ' ' : character
  }).join('').trim()
  if (/(?:https?|file):\/\//i.test(text)
    || /(?:^|[\s('"=:])\/(?:Users|home|Volumes|private|var|tmp|opt|etc)\//i.test(text)
    || /(?:^|[\s('"=:])[A-Za-z]:[\\/]/.test(text)) {
    return '[内容已隐藏]'
  }
  return text.slice(0, 500)
}

export function safeProductionContract(contract: ProductionRun['gates'][number]['contract']) {
  if (!contract) return undefined
  return {
    specs: {
      ...(contract.specs.durationSeconds !== undefined ? { durationSeconds: contract.specs.durationSeconds } : {}),
      ...(contract.specs.aspectRatio ? { aspectRatio: contract.specs.aspectRatio } : {}),
      ...(contract.specs.language ? { language: contract.specs.language } : {}),
      ...(contract.specs.shotCount !== undefined ? { shotCount: contract.specs.shotCount } : {}),
    },
    claims: contract.claims.map((claim) => ({ text: safeExternalText(claim.text), evidenceIds: [...claim.evidenceIds] })),
    evidence: contract.evidence.map((evidence) => ({ evidenceId: evidence.evidenceId, label: safeExternalText(evidence.label) })),
    skills: contract.skills.map((skill) => ({ name: safeExternalText(skill.name), version: safeExternalText(skill.version) })),
    ...(contract.estimatedCost ? { estimatedCost: { ...contract.estimatedCost } } : {}),
  }
}
