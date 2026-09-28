// 选中技能进提示词时的两段 Nomi 文案 + 权威节的位置开关（中立契约层）。
//
// 为什么住在 `electron/shared/`：渲染这段提示词的函数在 ESM 岛上（`electron/agentLane/laneSkillPrompt.mts`，
// 因为信封要用 pi 的 `formatSkillInvocation`），而 A/B 脚本、走查与 CJS 侧的测试也要读同一份文案与开关。
// 岛内外都看得见的只有这一层（`tsconfig.pi.json` 头注释：跨岛只走中立契约层）。
//
// ── 权威节相对技能正文的位置 ──
// **暂定 `after_body`，不是结论**——2026-09-18 起有一路三臂 A/B 在真模型上量它（臂 0 `omitted` 作阳性对照、
// 臂 A `before_body`、臂 B `after_body`），另带一个维度：同一回合连调 8 次以上时模型是否还听它。
// 所以位置是**一个参数**：数据回来改这一个常量即可切换，三个臂都从 `renderSelectedSkillPrompt` 可达。
// `after_body` 那一臂走的是 pi `formatSkillInvocation(skill, additionalInstructions)` 的第二个参数——
// 那正是 pi 留给「往技能上追加指令」的口子；另两臂是同一个信封前面加一节 / 不加。

export type SkillToolAuthorityPlacement = "before_body" | "after_body" | "omitted";
export const SKILL_TOOL_AUTHORITY_PLACEMENT: SkillToolAuthorityPlacement = "after_body";

/**
 * 交代四句。用户在 composer 里点了一条技能，它不是背景资料，是这一轮的作业规范
 * （2026-09-15 真实模型实测：只给正文时 12 句里 4 句回复看不出技能被用过）。
 * `tests/ux/skill-import-real-use.walk.mjs` 在真机出站报文上钉第一句。
 */
export const SELECTED_SKILL_FRAMING = [
  "本轮用户在输入框里挂了一条技能。它不是背景资料，是这一轮的作业规范：",
  "- 照它的方法和约束做这一轮；与你自己的一般习惯冲突时以它为准。",
  "- 它规定的画幅、时长、镜头数、生成模式这类**参数**，要真的写进你调用工具时的入参里；只在正文里说一句「用宽屏」不算照做。",
  "- 回复里要让用户看得出它被用了：用一句话说清你照它做了哪一两条关键决定。不要复述整份技能。",
  "- 它提到的外部 CLI、HTTP 或文件工具不会自动执行，除非当前对话确实提供了对应能力。",
].join("\n");

/**
 * 权威节正文。**不重列工具**：名字与「读/写·要不要先问·花不花钱」那四类事实已经由
 * `renderLanePromptSections` 从注册表派生一次（后果句 `verbConsequence(effect, nextAction)` 全仓只此一份）。
 * 再列一遍就是第二份会漂的副本（P1）。
 *
 * 指向**按名字**而不是「上面/下面」：本节的产出进 `composeLaneSystemPrompt` 的第一个参数，
 * 而 `Available tools` / `Tool usage` 是它之后才拼的——写「以上面为准」当场就是错的，而且位置一旦按 A/B 结果切换，
 * 方位词会再错一次。
 *
 * 语气是**给一份能力清单**，不是「你这份技能写错了」。技能可能整份是给别的宿主写的
 * （一个 ChatCut 技能会点名 `submit_video` / `track_progress`——这里一个都没有），那不是错误，是常态。
 */
export const SKILL_TOOL_AUTHORITY_SECTION = [
  "关于工具，一律以本条提示词里的 `Available tools` 与 `Tool usage` 两节为准——那是你**实际拥有**的全部工具：",
  "- 技能正文里出现的**任何工具名，以及它对某个工具是读还是写、要不要先问用户、花不花钱的说法**，一律不作数。技能可能是为别的宿主写的，也可能写于这些工具改名或改性质之前。",
  "- 正文要你做成的**事**照做；用哪个工具、那个工具会造成什么后果，只看那两节。",
  "- 正文点名的工具在那两节里找不到，**不是错误**：按它想做成的那件事，在那两节里挑能做成的那个用（例如别的宿主的「提交一个视频生成任务」，在这里就是生视频那个动词）。别猜一个相近的名字，也别假装调过了。",
  "- 确实没有任何一个工具能做成那一步：用一句人话告诉用户这一步在 Nomi 里做不了，然后把其余步骤照常做完。",
].join("\n");
