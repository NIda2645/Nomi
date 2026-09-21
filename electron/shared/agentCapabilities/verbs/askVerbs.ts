// 提问动词（一条）。形状与契约都住 `../askUser.ts`——这个文件**只写说明书**，一个字段都不新造。
//
// 为什么它常驻（没有 `internalGroup`）：能问一句话必须在每一轮都够得着。把它放进延迟披露组，
// 就等于「只有先猜对该问什么、才能问」——那正是 2026-09-21 实测 0/16 的形状换一个说法。
import { AGENT_ASK_CAPABILITY, ASK_USER_OPTION_RANGE, ASK_USER_QUESTION_RANGE, askUserInputSchema } from "../askUser";
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
      does: "Ask the user up to three related questions on one card and wait for his answers.",
      // 2026-09-22：触发句写成**可判定的情形**，不是「当你不确定时」。
      // 依据是 run1/run2 两轮实测里模型真正卡住的那几句（`tests/ux/agent-askback-real-model.cases.json`）：
      // 「把那个删了」——它读完画布看见 6 个节点，**然后就停住了**，既没问也没动；
      // 「换个模型重做」——读完模型清单，停住。两次都不是「它挑了个默认」，是**它什么都没做**。
      // 「不确定就问」这种话对模型等于没说；「你刚读到的东西里不止一个对得上」是它当场能判的。
      useWhen: "Use it the moment one of these is true: (1) you just read the canvas, the document or the model list and MORE THAN ONE of the things you found matches what he pointed at (\"that one\", \"this\", \"the model\") — ask which, do not pick for him and do not stop; (2) you know exactly what he wants but one fact you cannot read anywhere would change the result (how long, who it is for, which look) — ask that one fact; (3) the next call spends his credit on something he has not described, or cannot be taken back. In all three, asking costs one card; guessing wrong costs him a rerun, and stopping costs him the turn.",
      notWhen: "Do not ask when a sensible default exists — take it, do the work and say which one you took. Do not ask for something you can look up: read it with look_at_canvas, read_script or list_models first, and when the read comes back with exactly ONE match, that is your answer, not a question. Never ask for confirmation of something you are allowed to do: a reversible edit (deleting a node, rewriting a line) just happens and the user can undo it, and spending is confirmed on its own card by generate — asking \"shall I?\" about those is one more click for nothing. Never stop the turn in silence because you could not decide: either act on a default and say so, or ask.",
      params: `questions holds one to ${ASK_USER_QUESTION_RANGE.max} questions; he sees them one at a time on one card. Each question is one sentence in his own language, naming the choice itself ("which one do you want deleted?"), never a yes/no about one candidate. options is two to four answers he can click: each label is one of the actual candidates, at most about twelve characters, and does not repeat the question. description is one short line that helps him tell this one apart — what he would recognise or what happens if he picks it. Mark at most one recommended. Set multiSelect when several answers can be true at once. Leave options out when there is no short list — he can always type instead.`,
    },
    schema: askUserInputSchema,
    examples: [
      {
        when: "He said \"delete that one\" and three shots could be it:",
        arguments: {
          questions: [{
            question: "要删哪一个？",
            options: [
              { label: "镜 2 · 推门", description: "画布中间那张，还没出过图" },
              { label: "镜 3 · 走廊", description: "最右边那张静帧" },
              { label: "文稿最后一段", description: "文字，不在画布上" },
            ],
          }],
        },
      },
      {
        when: "Two things you need are both missing, so ask them together instead of twice:",
        arguments: {
          questions: [
            {
              question: "这支片子想给谁看？",
              note: "同一段文案给家长和给同事读，剪法完全不同。",
            },
            {
              question: "多长合适？",
              options: [
                { label: "15 秒", description: "发朋友圈那种长度" },
                { label: "30 秒", description: "够讲清一件事", recommended: true },
                { label: "1 分钟", description: "能放进两三个转折" },
              ],
            },
          ],
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
      // 2026-09-21 用户看了第一张真卡之后点名的四条。卡上那次的长相：
      // 题目「你要删除选中的『镜1: 深夜招牌』这个节点吗？」，选项是
      // 「是的，删除这个选中的节点 / shot_table 类型的镜头表节点」「不，删除另一个…」「都不删，取消操作」。
      // 四处全错：为一个可撤销的删除问了「要不要」、把一道选择题写成是非题套娃、
      // 多列了一个「取消」（跳过本来就是卡自带的）、description 里露出 `shot_table` 这种内部类型名。
      "When two things he could mean are both plausible, the question names the choice — \"which one do you want removed?\" — "
      + "and each option is one of the actual candidates. Never write a yes/no about one candidate and make the other options "
      + "\"no, the other one\": that is two questions wearing one hat, and he has to read all of them to answer the first.",
      "Never offer an option that means cancel, skip or none of these. Skipping is something the card already does "
      + "(he can close it or just say something else), so spending one of your two to four slots on it takes a real answer away.",
      "Write labels and descriptions the way he talks about his own work: a shot's title, a file he recognises, what he will see. "
      + "Never put an internal name in front of him — node kinds, ids, field names, tool names, anything with an underscore in it. "
      + "Keep each label to about twelve characters and do not repeat words from the question in it.",
      "Do not ask when a sensible default exists — take it, do the work, and say in one line which default you took so he can correct it. "
      + "Never ask for something the project already decided (aspect ratio, which document is open, the model in the picker), "
      + "never ask permission for a reversible local edit, and never ask a second round of questions where one would have done.",
      `Two to four options, each a real answer he could pick, and they must not overlap. `
      + `More than ${ASK_USER_OPTION_RANGE.max} is a list to read, not a question to answer; `
      + `fewer than ${ASK_USER_OPTION_RANGE.min} is a yes/no you could have decided yourself.`,
      "The card always lets him type his own answer, so never add an option that means \"something else\" or \"let me explain\". "
      + "What comes back is his words, one entry per question: the labels he clicked, or whatever he typed. Carry on in the same turn.",
      `Ask the related questions in one call — up to ${ASK_USER_QUESTION_RANGE.max}. He answers them on one card, one at a time. `
      + "Asking one, waiting for the answer, then asking the next turns a single interruption into three.",
    ],
  };

  return Object.freeze([askUser]);
}
