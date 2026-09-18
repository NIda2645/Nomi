// 阶段 5c · 技能索引在 lane 里的注入与自动触发（方案 §3.4）。
//
// 这一批断言钉的是三件事，每件都对应一个「不报错、只会静静变差」的失败：
//   ① 进系统提示词的**只有** name/description/location——正文进去了不会报错，
//      只会让用户每一轮为一个 30KB 的技能付一次钱；
//   ② 索引那段话叫模型用 **`read`** 去取正文——写成 `bash` 也不会报错，
//      只会让模型为了读一个 md 文件去申请一次命令执行审批；
//   ③ 解锁只看**被引用的**技能——按整个索引解锁也不会报错，
//      只会让 coding 组永远亮着，把按需装载退化成默认全亮（那要付 §6 量到的 20% 前缀）。
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { composeLaneSystemPrompt } from '../../electron/agentLane/lanePromptSections.js';
import { LANE_MODEL_TOOL_CATALOG } from '../../electron/agentLane/laneToolCatalog.js';
import {
  laneSkillRequiresCodingTools,
  laneSkillUnlockReason,
  loadPiSkillFormatter,
  renderLaneSkillSection,
  toPiSkills,
} from '../../electron/agentLane/laneSkillCatalog.mjs';
import type { LaneSkillIndexEntry } from '../../electron/shared/agentLane/laneContracts.js';

function entry(overrides: Partial<LaneSkillIndexEntry> & { name: string }): LaneSkillIndexEntry {
  return {
    description: `${overrides.name} 的用途说明。`,
    filePath: `/Users/nobody/Documents/Nomi Skills/${overrides.name}/SKILL.md`,
    origin: 'user',
    disableModelInvocation: false,
    requiresCodingTools: false,
    ...overrides,
  };
}

const SHUOHAO = entry({
  name: 'shuohao-storyboard',
  description: '把一段小说改写成说号风格的分镜表。',
  requiresCodingTools: true,
});
const PLAIN = entry({ name: 'tone-guide', description: '统一文稿语气。' });
const HIDDEN = entry({ name: 'internal-eval', description: '内部评测。', disableModelInvocation: true });

test('索引里只有 name/description/location——正文一个字都不进系统提示词', async () => {
  const section = renderLaneSkillSection(await loadPiSkillFormatter(), [SHUOHAO, PLAIN]);
  assert.match(section, /<available_skills>/);
  assert.match(section, /<name>shuohao-storyboard<\/name>/);
  assert.match(section, /<description>把一段小说改写成说号风格的分镜表。<\/description>/);
  assert.match(section, /<location>[^<]*shuohao-storyboard[^<]*SKILL\.md<\/location>/);
  // 正文的替身：没有任何一处 <body>/<content>，且整段短得不可能装得下一个技能。
  assert.doesNotMatch(section, /<body>|<content>/);
  assert.ok(section.length < 1200, `技能索引段 ${section.length} 字符——它应该是目录不是正文`);
});

test('索引那段话叫模型用 read 去取正文（lane 装了 pi 的 read，不必为读 md 走 bash 审批）', async () => {
  const section = renderLaneSkillSection(await loadPiSkillFormatter(), [SHUOHAO]);
  assert.match(section, /read tool/);
  assert.doesNotMatch(section, /Use bash to load/);
});

test('disable-model-invocation 的技能不进索引（它只能由 /skill chip 显式送）', async () => {
  const section = renderLaneSkillSection(await loadPiSkillFormatter(), [PLAIN, HIDDEN]);
  assert.match(section, /tone-guide/);
  assert.doesNotMatch(section, /internal-eval/);
});

test('没有技能 = 那一段整个不出现，不是一段空的 <available_skills>', async () => {
  assert.equal(renderLaneSkillSection(await loadPiSkillFormatter(), []), '');
});

test('映射到 pi 的 Skill 时 baseDir 是技能目录、source 是发现来源，不是编出来的空值或常量', () => {
  const [skill] = toPiSkills([SHUOHAO]);
  assert.equal(skill.baseDir, '/Users/nobody/Documents/Nomi Skills/shuohao-storyboard');
  assert.equal(skill.sourceInfo.path, skill.filePath);
  assert.equal(skill.sourceInfo.source, 'user');
  assert.equal(skill.sourceInfo.origin, 'package');
  assert.equal(skill.disableModelInvocation, false);
});

test('要不要 coding 工具：盘上的 scripts/ 与 frontmatter 的 tools: 两条来源任一即真', () => {
  assert.equal(laneSkillRequiresCodingTools({ childDirectoryNames: ['scripts', 'references'] }), true);
  assert.equal(laneSkillRequiresCodingTools({ childDirectoryNames: ['BIN'] }), true, '大小写不该改变结论');
  assert.equal(laneSkillRequiresCodingTools({ frontmatterValues: { tools: 'coding' } }), true);
  assert.equal(laneSkillRequiresCodingTools({ frontmatterValues: { tools: ['bash', 'write'] } }), true);
  // 阴性：只有知识区、也没声明——它不该把 coding 组点亮。
  assert.equal(laneSkillRequiresCodingTools({
    childDirectoryNames: ['references', 'assets'], frontmatterValues: { tools: ['canvas'] },
  }), false);
  assert.equal(laneSkillRequiresCodingTools({}), false);
});

test('解锁只看被引用的技能——索引里躺着一个带脚本的技能不等于这次要跑脚本', () => {
  const index = [SHUOHAO, PLAIN];
  assert.equal(laneSkillUnlockReason(index, ['shuohao-storyboard']), 'skill-requires-scripts');
  assert.equal(laneSkillUnlockReason(index, ['SHUOHAO-STORYBOARD']), 'skill-requires-scripts');
  // 阳性对照的反面：同一个索引、同一批技能，只是这次引用的是那条不带脚本的——必须不解锁。
  // 没有这一条，一个「恒返回 skill-requires-scripts」的退化实现会全绿。
  assert.equal(laneSkillUnlockReason(index, ['tone-guide']), null);
  assert.equal(laneSkillUnlockReason(index, []), null);
});

test('系统提示词的三段顺序是 身份 → 工具 → 技能，且空技能不留一段空白', async () => {
  const section = renderLaneSkillSection(await loadPiSkillFormatter(), [SHUOHAO]);
  const withSkills = composeLaneSystemPrompt('你是 Nomi。', LANE_MODEL_TOOL_CATALOG, section);
  const identityAt = withSkills.indexOf('你是 Nomi。');
  const toolsAt = withSkills.indexOf('Available tools:');
  const skillsAt = withSkills.indexOf('<available_skills>');
  assert.ok(identityAt < toolsAt && toolsAt < skillsAt, `顺序错了：${identityAt}/${toolsAt}/${skillsAt}`);

  const without = composeLaneSystemPrompt('你是 Nomi。', LANE_MODEL_TOOL_CATALOG, '');
  assert.doesNotMatch(without, /available_skills/);
  // 前缀是 prompt cache 的本体：没有技能时，这段必须和「从来没有过技能索引」逐字相同。
  assert.equal(without.includes('\n\n\n'), false, '空技能段留下了一段空白，前缀就抖了');
});
