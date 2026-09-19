import type { LaneComposerContext } from '../shared/agentLane/laneDesktopContracts'
import type { SkillRecord } from '../skills/skillStore'

/** Runs after historical intent resolution and before pi admits any input. */
export async function prepareLaneSkillContext(context: LaneComposerContext, skills: {
  resolve(key: string): Promise<SkillRecord | null>
  render(skill: SkillRecord): Promise<string>
}): Promise<LaneComposerContext> {
  if (!context.skillKey) return { ...context, skillSnapshot: undefined, skillPrompt: undefined }
  const skill = await skills.resolve(context.skillKey)
  if (!skill) throw new Error('agent_skill_unavailable')
  const expected = context.expectedSkillHash ?? context.skillSnapshot?.contentHash
  // Old inputs without a verifiable skill version cannot silently switch to today's body.
  if ((context.retryFromEntryId && !expected) || (expected && expected !== skill.contentHash)) {
    throw new Error('agent_skill_version_changed')
  }
  return { ...context, skillSnapshot: { name: skill.name, contentHash: skill.contentHash },
    skillPrompt: await skills.render(skill) }
}
