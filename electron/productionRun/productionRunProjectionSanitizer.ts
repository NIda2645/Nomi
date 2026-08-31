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

/**
 * job 归属哪一镜（`metadata.shotId`）——批次里 job↔镜头的唯一对应关系，本来就是 agent 建批时自己传的 id，
 * 读回来认不出自己传的东西是纯损失，故外发。但按**值**判定不按字段名信任：只有过 intake 那把同款尺子
 * （`mcpGenerationMultiShot.shotEnvelope`）的 id 才出去，老 run / 别处写入的怪值一律省略（宁可缺，不外发未校验串）。
 * 注意这**不是** reducer 的 `jobShotLineage`：那把尺子必须宽（老 run 的 lineage 分组不能因收紧而漂移），这把必须严。
 */
export function safeShotId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,120}$/.test(value) ? value : undefined
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
