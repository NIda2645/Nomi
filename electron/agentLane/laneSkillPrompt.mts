// 用户为**这一轮**挂的那条技能 → 系统提示词的一段。**全仓唯一的选中技能注入点。**
//
// ── 它在解决哪个真实摩擦（D6 ①）──
// 用户在 composer 里点了「电影分镜」，然后说「这段剧本帮我做成分镜」。2026-09-15 之前整份 SKILL.md（含
// frontmatter）被原样拼在面板提示词后面，一个字的交代都没有；症状是用户 2026-09-10 的原话「用了一个电影分镜
// skill，但他和我生成出来的东西提示词一看就不对，而且比例不对」。
//
// ── 为什么搬到岛上（2026-09-18）──
// 信封形状是 pi 定的（skill 标签 + 「References are relative to …」），此前在 `agentContext.ts`
// 里逐字手拼，因为那一层被 `FORBIDDEN_OWNER_IMPORT` 钉死不许摸 pi。现在信封直接来自 pi 的
// `formatSkillInvocation(skill, additionalInstructions)`，权威节走它的第二个参数——那正是 pi 留的口子。
// 正文（`content`）由 pi 的加载器给出、已去 frontmatter，所以本仓不再有任何一份 stripper。
//
// 「索引管发现，这里管用户点了的那一条」：两条并存且分工明确（`laneSkillCatalog.mts` 头注释）。
import { formatSkillInvocation } from '@earendil-works/pi-agent-core';

import {
  SELECTED_SKILL_FRAMING,
  SKILL_TOOL_AUTHORITY_PLACEMENT,
  SKILL_TOOL_AUTHORITY_SECTION,
  type SkillToolAuthorityPlacement,
} from '../shared/agentLane/skillPromptPlacement.js';
import type { SkillRecord } from '../skills/skillStore.js';

export type SelectedSkill = Pick<SkillRecord, 'name' | 'description' | 'filePath' | 'content'>;

export function renderSelectedSkillPrompt(
  skill: SelectedSkill,
  placement: SkillToolAuthorityPlacement = SKILL_TOOL_AUTHORITY_PLACEMENT,
): string {
  const piSkill = { name: skill.name, description: skill.description, content: skill.content, filePath: skill.filePath };
  // 臂 B `after_body`：权威节就是 pi 的 additionalInstructions。臂 A / 臂 0：同一个信封，前面加一节 / 不加。
  const envelope = placement === 'after_body'
    ? formatSkillInvocation(piSkill, SKILL_TOOL_AUTHORITY_SECTION)
    : formatSkillInvocation(piSkill);
  return [
    SELECTED_SKILL_FRAMING,
    '',
    ...(placement === 'before_body' ? [SKILL_TOOL_AUTHORITY_SECTION, ''] : []),
    envelope,
  ].join('\n');
}
