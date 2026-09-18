// **投影原型：一个动词（`cancel_job`），一个方向（导出域）。**
//
// ── 它在解决哪个真实摩擦 ──
//
// 今天一个工具在我们这里被写两遍：模型看的那份 schema 一遍，宿主收的那份 schema 一遍，中间再手写
// 一张对照表说清「模型的 A 对应宿主的 B」。三份东西描述同一件事，所以任何一份改了而另外两份没跟上，
// 值就在中间无声地丢掉——2026-09-18 当天量到两次。外面六家的做法是**一份 schema 两个用途**：宿主契约
// 那份是唯一真相，模型看的那一面是它的**投影**（藏掉宿主自己会补的字段、覆写描述），宿主补完值之后
// **再过一遍同一份 schema**（Claude Agent SDK 的 `updatedInput` → 重新准入；MCP TS SDK 的
// *"the listing and the call cannot diverge"*）。方案与逐条出处：
// `docs/plan/2026-09-18-tool-projection-cancel-job-prototype.md`。
//
// ── 这个文件里没有一个字段名是手写的 ──
//
// 模型面 = 宿主面 `.omit()` 掉宿主自补的字段；宿主补的值写成一个**显式常量**，它的类型是
// 「宿主面减模型面」的差集——多补一个、少补一个、补错一个值，都是 tsc 红，不是运行期惊喜。
// 补完 `cancelJobHostArgs` 重过同一份宿主 schema：这一步不是多余的复验，它断言的是
// 「投影 + 补值真的能还原成一份合法的宿主输入」，而那正是对照表时代永远无法表达的那句话。
//
// ── 它**覆盖不到**什么（明说，不静默降级）──
//
// 投影的前提是「有且只有一份宿主 schema 是真相」。`cancel_job` 有两份：导出域的宿主字段真叫 `jobId`
// （`…/jobs/<jobId>/` 的目录名），生成域叫 `operationId`（`.nomi/runs/<operationId>/` 的目录名）。
// 模型面只能有一个名字，所以生成域那一半**必然**是一次改名，而投影里故意没有「改名」这个动作。
// 于是生成域仍走 `verbTransportRoutes.ts` 上一条声明的 rename，它的 `why` 写的是真正的领域理由。
// 结论（铺开时的判据）：**单域动词走投影，双域动词保留一条带领域理由的声明映射。**
import type { z } from "zod";

import { EXPORT_WRITE_ALIASES, exportWriteSemanticInputSchema } from "../exportCapabilities";

/**
 * 这一次调用真正要过的那份宿主 schema——**不是**长得像的那一份。
 *
 * （对照表时代这里取错过：`EXPORT_JOB_ROUTES.cancel_job` 的目标字段名单取自
 * `exportReadSemanticInputSchema` 的 `inspect_export_job` 分支，而这条路调用的是
 * `cancel_export_job`。两份今天字段名单恰好相同所以没出过错，但核的一直是另一份 schema。
 * 投影按构造消灭这一类：真相源就是这条调用要过的那一份，取错都取不了。）
 */
const cancelJobHostSchema = exportWriteSemanticInputSchema.options[1];

/** 宿主自己补的字段：`operation` 是契约的分支判别值，模型既不知道也不该知道传输层的方法词表。 */
const HOST_FILLED = { operation: true } as const;

/**
 * 模型看到的那一面 = 宿主面减去宿主自补的字段，再覆写描述。
 * 描述是**唯一**允许在这里写的东西——它是给模型读的话，不是第二份形状。
 */
export const cancelJobModelSchema = cancelJobHostSchema.omit(HOST_FILLED).extend({
  jobId: cancelJobHostSchema.shape.jobId.describe("The job to cancel."),
});

export type CancelJobModelArgs = z.infer<typeof cancelJobModelSchema>;
type CancelJobHostArgs = z.infer<typeof cancelJobHostSchema>;

/**
 * 宿主补的那份值，**显式**写出来。类型是差集：模型面已经有的字段不许在这里再出现，宿主面缺的字段
 * 也不许漏。改宿主 schema 的分支判别值而忘了改这里 = tsc 红。
 */
export const CANCEL_JOB_HOST_FILL: Omit<CancelJobHostArgs, keyof CancelJobModelArgs> = {
  operation: EXPORT_WRITE_ALIASES.cancel,
};

/**
 * 模型给的那一份 + 宿主补的那一份 → **重过同一份宿主 schema**。
 *
 * 返回值是宿主形状，但传输层往下只递模型那一半（方法别名承载 `operation`，
 * `exportWriteInputForAlias` 会在跨进程那一侧把它重新拼回来并再验一次）。这里这一次 parse 的职责
 * 不是「再验一遍」，是**断言投影是可逆的**：藏掉的字段确实只有宿主补得出的那些。
 */
export function cancelJobHostArgs(modelArgs: CancelJobModelArgs): CancelJobHostArgs {
  return cancelJobHostSchema.parse({ ...modelArgs, ...CANCEL_JOB_HOST_FILL });
}
