// **双域动词**的那一条声明映射。今天 20 个动词里只有两个：`check_job` 与 `cancel_job`。
//
// ── 为什么只剩这一条（投影覆盖不到什么）──
//
// 投影的前提是「有且只有一份宿主 schema 是真相」。这两个动词各有两份：
//
// | 域 | 宿主 schema | 那个 id 叫什么 | 它在磁盘上是什么 |
// |---|---|---|---|
// | 导出 | `exportRead/WriteSemanticInputSchema` | `jobId` | `…/jobs/<jobId>/` 的目录名 |
// | 生成 | `generationStatusInputSchema` | `operationId` | `.nomi/runs/<operationId>/` 的目录名 |
//
// **两个域的宿主各有一份持久化，用的是两个不同的词。** 模型面只能有一个名字，所以两个之中必有一个
// 是翻译——这不是「我们这边习惯叫另一个名字」（那种按 R5.5 不是合法偏差，已经全部改成同名删掉了），
// 是那里**真的有两件东西**。模型面投在导出域上（零 rename 的真投影，见 `verbProjections.ts`），
// 生成域这一条留在这里。
//
// 投影里**故意**没有「改名」这个动作，所以这一条不可能写成投影。它换成了一个函数：返回类型从宿主
// schema 推导，宿主把 `operationId` 改名或改类型，这里当场 tsc 红——而这正是对照表时代做不到的那半件事
// （那张表核的是「目标字段名在不在宿主的字段名单里」，一个运行期字符串比对，编译器一个字都不说）。
import type { z } from "zod";

import { generationStatusInputSchema } from "../generationPlanSchemas";

/** 模型面那一个 id。两个双域动词的模型面都只有它（`verbProjections.ts` 从导出域投出来的）。 */
type JobIdArgs = Readonly<{ jobId: string }>;

/**
 * 生成域的状态读/取消，两支各自的模型面之外的部分（`operation` 由方法别名承载）。
 * 类型直接从宿主那份 union 的对应分支取——宿主改名或改类型，下面两个函数当场 tsc 红。
 */
type StatusReadArgs = Omit<z.infer<(typeof generationStatusInputSchema.options)[0]>, "operation">;
type StatusCancelArgs = Omit<z.infer<(typeof generationStatusInputSchema.options)[1]>, "operation">;

/**
 * 这条翻译的**领域理由**，写在一处，被两个动词引用。它不是注释：`verbDualDomain.test.ts` 断言
 * 这两个域的宿主字段名**真的不同**——哪天它们同名了，这条映射就该整个删掉，而那条断言会先红。
 */
export const JOB_ID_IS_DUAL_DOMAIN =
  "双域动词：导出域宿主字段真叫 jobId（jobs/<jobId>/ 目录名），生成域叫 operationId（.nomi/runs/<id>/ 目录名）；模型面只能有一个名字";

/** `check_job` 的生成域那一半。 */
export function checkJobGenerationArgs(args: JobIdArgs): StatusReadArgs {
  return { operationId: args.jobId };
}

/** `cancel_job` 的生成域那一半。 */
export function cancelJobGenerationArgs(args: JobIdArgs): StatusCancelArgs {
  return { operationId: args.jobId };
}
