// 「问用户一句」这件事的**唯一形状**。全仓只有这一份。
//
// ── 它在解决哪个真实摩擦 ──
//
// 2026-09-21 实测（scratchpad/investigate-askback.md §3.3）：真实模型跑 16 句该反问的话，
// 反问卡触发 **0/16**。原因不是「触发条件太窄」，是**根本没有触发条件**——20 个动词里
// 没有一个能让模型问一句话。用户的原话是「这个是模型要自己输入选项吧，通用的吧，
// 别搞错了，只有那一种反问就离谱了」：要的是一个**通用**提问工具，模型自己写题目、
// 自己写选项，任何面任何话题都能问。
//
// ── 为什么这个文件必须是唯一的一份 ──
//
// 用户以前被同一个坑修过一次：一个工具的契约有好几份（schema / 描述 / 提示词里的用法 /
// MCP 目录 / 校验器 / 渲染层类型），每份不一样，于是 Agent 很难触发它
// （`docs/lessons/stale-directives-outlive-tool-renames.md`）。09-18 的根治
// （`4b43f3ac9`）把模型可见工具收成一条动词声明，schema / 描述 / 必填 / 注解全从它算出来。
// 提问工具是**全新**的模型可见工具，最容易再长出那个坑，所以这里把话说死：
//
//   · 模型看到的 JSON Schema        ← `askUserInputSchema`（经动词声明 → `toPublishedJsonSchema`）
//   · 主进程校验                     ← `askUserInputSchema`（`laneTools.mts` 的那一次 contract parse）
//   · 渲染层 `agentPanelV4Question` ← `z.infer<typeof askUserInputSchema>`（一行 re-export，不手写）
//   · 身份提示词里举的例子           ← 动词声明的 `examples`（装配期逐条喂回同一份 schema）
//   · 熔断转提问时构造的参数         ← `askUserPendingArgsSchema`（同一份 + 两个宿主字段）
//
// 任何一处想加字段，只能加在这个文件里；加错地方由 `askUserContract.test.ts` 当场红。
import { z } from "zod";

import type { CapabilityContract } from "./capabilityContract";

/**
 * 拍板的选项数量区间（2026-09-21：2–4 个）。
 *
 * **不写进 schema 当硬约束**：模型多给一个选项时，`.max(4)` 会让整次调用被打回，
 * 而用户那头看到的是「模型又失败了一次」——一个他完全不关心的差别把一次本来能答的
 * 提问变成了一次重试。数量的判词归渲染层（`questionOptionCountIssue`），
 * 说明书里写清楚，校验器不拦。
 */
export const ASK_USER_OPTION_RANGE = Object.freeze({ min: 2, max: 4 });

/** 一个选项。`label` 既是 chip 上印的字，**也是**答案本身——反问卡没有「确认」。 */
export const askUserOptionSchema = z.object({
  /**
   * 这一项的 id。模型不给就由渲染层按位置补 `option-N`。
   * 留着它是因为答案要带一个结构化的「他点的是哪一颗」，而 `label` 会重复。
   */
  id: z.string().trim().min(1).optional()
    .describe("Your own id for this option, echoed back when the user picks it. Omit it and Nomi numbers them."),
  label: z.string().trim().min(1)
    .describe("The words printed on the chip. Answering with this option sends exactly these words back to you."),
  description: z.string().trim().min(1).optional()
    .describe("One short line under the label: what picking this one means. Leave it out rather than restating the label."),
  // `z.literal(true)` 生成的是 `const`，而 Google 的 OpenAPI 3.03 路径不认它
  // （`check:model-schema` 的 `const-instead-of-enum`：这一族只有真模型会用一次失败告诉你）。
  // 所以这里是真 boolean，`false` 与缺席同义——「这一项我不特别推荐」本来就没有第三种意思。
  recommended: z.boolean().optional()
    .describe("Set true on at most one option: the one you would pick. It is only a mark — nothing is preselected and nothing is answered for the user."),
}).strict();

export type AskUserOption = z.infer<typeof askUserOptionSchema>;

/**
 * 一次提问，**模型这一侧的全部输入**。
 *
 * `options` 可以为空：没有现成答案的题目（「你想要什么风格？」）就只剩自由输入那一行，
 * 卡照样成立。自由输入**不是一个选项**，是卡的固有能力（2026-09-21 拍板），
 * 所以它不出现在这份 schema 里——模型不需要、也不应该能把它关掉。
 */
export const askUserInputSchema = z.object({
  question: z.string().trim().min(1)
    .describe("The question, in the user's own language, as one sentence he can answer without reading anything else."),
  options: z.array(askUserOptionSchema).optional()
    .describe(`Two to four answers he can pick with one click. Leave it out when there is no short list of answers — he can always type instead.`),
  note: z.string().trim().min(1).optional()
    .describe("One optional line of why you are asking right now. Not a second question."),
}).strict();

export type AskUserInput = z.infer<typeof askUserInputSchema>;

/**
 * 我们**自己**要说的那句话（不是模型写的），所以只传一个码 + 一个数：文案在渲染层 i18n。
 * 生产者传成句的字符串就绕过了 i18n，英文用户会读到中文。
 */
export const askUserHostReasonSchema = z.object({
  code: z.literal("retry_exhausted"),
  attempts: z.number().int().positive(),
}).strict();

export type AskUserHostReason = z.infer<typeof askUserHostReasonSchema>;

/**
 * 一张**待决的**反问卡上会出现的全部字段 = 模型那份 + 两个宿主生产者才写得出的字段。
 *
 * 三个生产者共用同一张卡（渲染层 `agentPanelV4Question.ts` 文件头）：
 *   ① 模型自己调 `ask_user`      → 只有上面那三个字段；
 *   ② 工具缺参数                  → `missingParam`（问句由渲染层按参数名补一句人话）；
 *   ③ 同一字段被拒 3 次后的熔断    → `question` + `options` + `askReason`。
 * 模型**填不出** `missingParam` / `askReason`，所以它们不在 `askUserInputSchema` 里——
 * 让模型能自己声称「这是第 3 次了」就是给它一个伪造理由的字段。
 */
export const askUserPendingArgsSchema = askUserInputSchema.extend({
  question: askUserInputSchema.shape.question.optional(),
  missingParam: z.string().trim().min(1).optional(),
  askReason: askUserHostReasonSchema.optional(),
}).strict().refine(
  (value) => Boolean(value.question || value.missingParam),
  { message: "A question card needs either a question or the name of the missing parameter" },
);

export type AskUserPendingArgs = z.infer<typeof askUserPendingArgsSchema>;

/**
 * 提问能力的契约。
 *
 * · `effect: "read"` —— 它一个字节都不改。因此 `ask` / `editSelection` 两个窄工作模式下
 *   它照样能用：**任何模式下模型都有权说「我不确定」**，那是比动手更安全的一步。
 * · `alwaysAsksUser` —— 见 `capabilityContract.ts` 的字段注释。没有它，一个 `read` 动词会被
 *   `capabilityMayReuseSafeApproval` 直接放行，于是这次「提问」会在用户还没看见卡的时候
 *   自己过去——模型收到一句空答案，用户什么都没被问到。
 * · 不投对外 MCP profile：外部宿主有它自己问人的办法（MCP `elicitation/create`），而这条 lane
 *   在那边 `hasUserInterface = false`，投过去只会得到一句「这里没有窗口可问」。
 */
export const AGENT_ASK_CAPABILITY = {
  id: "agent.ask",
  version: 1,
  aliases: { pi: "ask_user" },
  inputSchema: askUserInputSchema,
  outputSchema: z.object({ answer: z.string(), optionId: z.string().optional() }).strict(),
  effect: "read",
  effectClass: "reversible_local",
  alwaysAsksUser: true,
  execution: { port: "document", availability: "main_or_renderer" },
  exposure: "internal_only",
  requiredScope: "agent:ask",
  targetKind: "project",
} as const satisfies CapabilityContract<AskUserInput, { answer: string; optionId?: string }>;
