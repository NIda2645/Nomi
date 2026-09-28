import { skillResourceUri, skillFileMimeType, type SkillSummaryFrame } from './mcpSkillResources'

export function buildSkillResources(skills: readonly SkillSummaryFrame[]): Array<Record<string, string>> {
  return skills.flatMap((skill) => (skill.filePaths ?? ['SKILL.md']).flatMap((filePath) => {
    const uri = skillResourceUri(skill, filePath)
    return uri
      ? [{
          uri,
          name: filePath === 'SKILL.md' ? skill.name : `${skill.name}/${filePath}`,
          description: skill.description,
          mimeType: skillFileMimeType(filePath),
        }]
      : []
  }))
}

export function buildSkillPrompts(skills: readonly SkillSummaryFrame[]): Array<Record<string, unknown>> {
  return skills.map((skill) => ({
    name: skill.directoryName,
    title: skill.name,
    description: skill.description,
    arguments: [
      { name: 'packageVersion', description: 'Package version from prompt metadata.', required: false },
      { name: 'contentHash', description: 'Content hash from prompt metadata.', required: false },
    ],
    _meta: { packageVersion: skill.packageVersion, contentHash: skill.contentHash },
  }))
}
