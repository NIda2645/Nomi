// 模型看到的那一面 = 宿主契约 schema 的**投影**。20 个动词的模型面在这里从宿主那一份派生出来，
// 而不是在动词声明里再手写一遍。
//
// ── 它在解决哪个真实摩擦（一句大白话）──
//
// 一个工具过去在我们这里被写两遍：模型看的那份 schema 一遍、宿主收的那份一遍，中间再手写一张对照表
// 说清「模型的 A 对应宿主的 B」。三份东西描述同一件事，所以任何一份改了而另外两份没跟上，值就在中间
// 无声地丢掉——2026-09-18 当天量到两次（`durationSec` 被改名成宿主没有的顶层字段＝整条拒收；逐镜
// `candidate.providerId/modelId` 压根没被列进解构＝**静默**丢掉，模型点名的模型被换成用户默认的那个
// 去花钱）。外面六家的做法是**一份 schema 两个用途**：宿主契约那份是唯一真相，模型看的那一面是它的
// 投影（藏掉宿主自己会补的字段、覆写描述），宿主补完值之后**再过一遍同一份 schema**
// （Claude Agent SDK 的 `updatedInput` → 重新准入；MCP TS SDK 的 *"the listing and the call cannot
// diverge"*）。逐条出处：`docs/plan/2026-09-18-tool-projection-cancel-job-prototype.md` 的「先查别人」。
//
// ── 这个文件里没有一个字段名是手写的 ──
//
// 每条投影都是三件事，缺一不可：
//   ① `modelSchema` = 宿主 schema `.omit(宿主自补的字段)`，再 `.extend()` **只**覆写描述。
//      描述是唯一允许写在这里的东西——它是给模型读的话，不是第二份形状。
//   ② `HOST_FILL` = 宿主补的那份值，**显式**写出来，类型是 `HostFill<宿主, 模型>`＝「宿主面减模型面」。
//      藏了一个字段却没人补它 → tsc 当场红；补错了值 → 同样红（字面量类型对不上）。
//   ③ 补完**重过同一份宿主 schema**：这一步不在这里跑第二遍，宿主自己早有那一处
//      （`*InputForAlias` 都是 `semanticSchema.parse({ operation: alias, ...})`）。`HOST_FILL` 是那件事的
//      **声明**，`verbProjections.test.ts` 拿它和那条真路逐字节对账，所以常量不是注释，是被机器核过的规格。
//
// ── 「宿主新长出一个必填字段」会怎样（原型接不住的那条，这一刀怎么接住）──
//
// 两种可能，两道不同的红：
//   · 它落在 `.omit()` 名单里（＝我们有意藏它）→ `HOST_FILL` 的类型立刻要求补它，没补就是 **tsc 红**。
//   · 它没被藏 → 顺着投影流进模型面 → 模型面变了 → `check:model-face-frozen` **门岗红**
//     （`scripts/check-model-face-frozen.mjs`，基线 `scripts/model-face-baseline.json`）。
// 原型那次变异（给 cancel 分支加一个必填 `requestedBy`）走的是第二条：它当时全绿，是因为当时还没有
// 冻结模型面的那道门。现在两条路都有红，投影的那个默认（「宿主新加的字段都是模型该填的」）不再是静默假设。
//
// ── 投影**覆盖不到**什么（明说，不静默降级）──
//
// 前提是「有且只有一份宿主 schema 是真相」。不满足的三类写在 `verbDualDomain.ts` 与各自动词的注释里：
//   · **双域**（`check_job` / `cancel_job` 的生成域）：同一个模型面字段要落到另一份 schema 的另一个名字上。
//     投影只会藏字段和覆写描述，**故意**没有「改名」这个动作 → 那一条留一份带领域理由的声明映射。
//   · **结构有损**（`draft_shots`）：嵌套层级变了、嵌套被拍平 → `draftShotsProjection.ts` 的显式变换。
//   · **宿主没有形状**（`look_at_canvas` / `list_models`：契约 `inputSchema` 是 `z.unknown()`）→ 没有可投影的东西。
import type { z } from "zod";

import { documentReadSemanticInputSchema, type DocumentReadInput } from "../documentRead";
import { EXPORT_WRITE_ALIASES, exportWriteSemanticInputSchema } from "../exportCapabilities";
import { SKILL_READ_ALIASES, skillReadSemanticInputSchema } from "../skillRead";

/**
 * 宿主补的那份值的类型：**宿主面减模型面**。
 *
 * 这一个类型就是整套机制的编译期闸：模型面藏掉一个宿主必填字段而没人补它 → 这里少一个键 → tsc 红；
 * 宿主把自补字段的取值改了（`z.literal("a")` → `z.literal("b")`）而补的人不知道 → 字面量类型对不上 → tsc 红。
 * 后一种正是 Codex `timeout_ms` 那个已被量到的漂移形状搬到**补值**这一侧的样子。
 */
export type HostFill<Host extends z.ZodTypeAny, Model extends z.ZodTypeAny> =
  Omit<z.infer<Host>, keyof z.infer<Model>>;

/** 从一份 zod 对象 schema 取字段名单。投影的两边名单都从这里来——**不许手抄第二份**。 */
export function objectFieldKeys(schema: z.ZodTypeAny, label: string): readonly string[] {
  let node: unknown = schema;
  for (let depth = 0; depth < 8; depth += 1) {
    const def = (node as { _def?: Record<string, unknown> })._def;
    const shape = (node as { shape?: Record<string, unknown> }).shape;
    if (shape && typeof shape === "object") return Object.freeze(Object.keys(shape));
    if (!def) break;
    const inner = def.innerType ?? def.type ?? def.schema;
    if (!inner) break;
    node = inner;
  }
  throw new Error(`objectFieldKeys(${label}): 这不是一份能取出字段名单的对象 schema`);
}

// ── read_script · document.read ──────────────────────────────────────────────

/**
 * 宿主要 `scope` 必填，模型面让它可选——**缺省值是宿主补的**，所以这不是两份 schema，是一次投影加一次 fill。
 *
 * 2026-09-18 之前这个缺省只活在内部 lane 的一句手写 `?? "full"` 里，对外 MCP 面没有那句，于是
 * `nomi_document_read` 只带租约调用时当场 `capability_input_invalid`——同一个默认值，一边有一边没有。
 * 缺省搬到声明上（`readVerbs.ts` 的 `semanticInputOf`）之后，两个 profile 共用同一份。
 */
export const readScriptModelSchema = documentReadSemanticInputSchema.extend({
  scope: documentReadSemanticInputSchema.shape.scope.optional()
    .describe("full (default) reads the whole document; selection reads only what the user selected."),
});

/**
 * 模型没说时宿主按哪一档读。类型取自宿主 schema，所以宿主改枚举、这里就红——
 * 不会再出现「缺省值指着一个宿主已经不认的档」。
 */
export const READ_SCRIPT_SCOPE_DEFAULT: DocumentReadInput["scope"] = "full";

// ── read_skill · skill.read ──────────────────────────────────────────────────

/**
 * 藏两个字段：`operation` 是契约的分支判别值（模型不该知道传输层的方法词表）；
 * `expectedContentHash` 是**乐观并发**用的内容哈希，只有宿主自己拿得到（没有任何读动词返回它），
 * 所以它既不该出现在模型面上，也不该由模型填——这正是 B 类缺陷（宿主要一个模型拿不到的字段）的形状。
 */
const readSkillHostSchema = skillReadSemanticInputSchema;
export const readSkillModelSchema = readSkillHostSchema.omit({ operation: true, expectedContentHash: true }).extend({
  name: readSkillHostSchema.shape.name.describe("Skill name exactly as listed in the skills index."),
});

export const READ_SKILL_HOST_FILL: HostFill<typeof readSkillHostSchema, typeof readSkillModelSchema> = {
  operation: SKILL_READ_ALIASES.load,
};

// ── cancel_job（导出域那一半）· export.write ──────────────────────────────────

/**
 * 这一次调用真正要过的那份宿主 schema——**不是**长得像的那一份。
 *
 * （对照表时代这里取错过：`EXPORT_JOB_ROUTES.cancel_job` 的目标字段名单取自
 * `exportReadSemanticInputSchema` 的 `inspect_export_job` 分支，而这条路调用的是 `cancel_export_job`。
 * 两份今天字段名单恰好相同所以没出过错，但核的一直是另一份 schema。投影按构造消灭这一类：真相源
 * 就是这条调用要过的那一份，取错都取不了。）
 *
 * **只覆盖导出域。** `cancel_job` 是双域动词，生成域那一半必然是一次改名，见 `verbDualDomain.ts`。
 */
const cancelJobHostSchema = exportWriteSemanticInputSchema.options[1];

export const cancelJobModelSchema = cancelJobHostSchema.omit({ operation: true }).extend({
  jobId: cancelJobHostSchema.shape.jobId.describe("The job to cancel."),
});

export type CancelJobModelArgs = z.infer<typeof cancelJobModelSchema>;

export const CANCEL_JOB_HOST_FILL: HostFill<typeof cancelJobHostSchema, typeof cancelJobModelSchema> = {
  operation: EXPORT_WRITE_ALIASES.cancel,
};
