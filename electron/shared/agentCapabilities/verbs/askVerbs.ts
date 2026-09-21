// 提问动词（一条）。形状与契约都住 `../askUser.ts`——这个文件**只写说明书**，一个字段都不新造。
//
// 为什么它常驻（没有 `internalGroup`）：能问一句话必须在每一轮都够得着。把它放进延迟披露组，
// 就等于「只有先猜对该问什么、才能问」——那正是 2026-09-21 实测 0/16 的形状换一个说法。
import { AGENT_ASK_CAPABILITY, ASK_USER_OPTION_RANGE, askUserInputSchema } from "../askUser";
import type { VerbDeclaration } from "../verbDeclaration";

export function askVerbs(): readonly VerbDeclaration[] {
  const askUser: VerbDeclaration = {
    name: "ask_user",
    profiles: ["internal"],
    // 外部宿主有它自己问人的办法（MCP `elicitation/create`），而这条 lane 在那边没有窗口。
    profileReason: "headlessHost",
    contractId: AGENT_ASK_CAPABILITY.id,
    effect: "read",
    nextAction: "user_sees_question_card",
    describe: {
      does: "Ask the user one question and wait for his answer.",
      useWhen: "The answer changes what you produce and guessing wrong costs him time or money: you cannot tell which thing he means, a fact you need is missing with no default, or you are about to spend or to do something irreversible.",
      notWhen: "Do not ask when a sensible default exists — take it, do the work and say which one you took. Do not ask for something you can look up: read it with look_at_canvas, read_script or list_models first. Do not use this to confirm an action you are allowed to take; a reversible edit just happens, and spending is confirmed on its own card by generate.",
      params: `question is one sentence in the user's own language. options is two to four answers he can click, each with a label and optionally one line of description; mark at most one recommended. Leave options out when there is no short list — he can always type an answer instead.`,
    },
    schema: askUserInputSchema,
    examples: [
      {
        when: "He said \"delete that one\" and three shots could be it:",
        arguments: {
          question: "哪一个要删掉？",
          options: [
            { label: "镜 2 · 推门", description: "画布中间那张，还没生成过" },
            { label: "镜 3 · 走廊", description: "最右边那张静帧" },
            { label: "文稿最后那段", description: "不是画布上的东西" },
          ],
        },
      },
      {
        when: "Nothing short would cover the answer, so ask with no options:",
        arguments: {
          question: "这支片子想给谁看？我按那个人的口味定语气和节奏。",
          note: "问一句是因为同一段文案给家长和给同事读，剪法完全不同。",
        },
      },
    ],
    // 「何时问 / 何时不问」住在这里，**不在身份提示词里再写一遍**：这条通道
    // （`lanePromptSections.renderLanePromptSections`）本来就把它送进系统提示词，
    // 而写两份的后果不是重复，是两份慢慢说得不一样——用户点名的正是这个坑。
    // 每一条都写成「什么情况下问 / 什么情况下别问」这种可判定的话，不是「要谨慎」：
    // 后者模型只会当客套话，而身份层那条「该调工具就调」会恒赢
    // （scratchpad/investigate-askback.md §2.3 实测）。
    promptGuidelines: [
      "Ask when the answer changes what you produce and guessing wrong wastes the user's time or money: "
      + "you cannot tell which of several things he means, a fact you need is missing and no project default supplies it, "
      + "or you are about to spend his credit or do something that cannot be taken back. Ask once, in one question.",
      "Do not ask when a sensible default exists — take it, do the work, and say in one line which default you took so he can correct it. "
      + "Never ask for something the project already decided (aspect ratio, which document is open, the model in the picker), "
      + "never ask permission for a reversible local edit, and never ask a second round of questions where one would have done.",
      `Two to four options, each a real answer he could pick, and they must not overlap. `
      + `More than ${ASK_USER_OPTION_RANGE.max} is a list to read, not a question to answer; `
      + `fewer than ${ASK_USER_OPTION_RANGE.min} is a yes/no you could have decided yourself.`,
      "The card always lets him type his own answer, so never add an option that means \"something else\" or \"let me explain\". "
      + "What comes back is his words: one option's label if he clicked it, or whatever he typed. Carry on in the same turn.",
    ],
  };

  return Object.freeze([askUser]);
}
