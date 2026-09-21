// 传输层判决 → 模型看得懂的失败。**两个转换点唯一的组装处**（2026-09-18）。
//
// 为什么要有这个文件：传输适配器里有 9 处写着 `message: code`。前人诊断过这件事，
// 原话留在 `electron/agentLane/laneRuntimePort.ts` 的头部——「`[error] E_DENIED` 对一个要自纠的
// 模型等于什么都没说……模型据此没法自纠，只会把同一个调用再发一遍，用户撞到的『连续 6 次被自己
// 拒收』就是这么来的」。
//
// 他们也修了：`laneExtendedTools.ts` 那个转换点带着 `decision.message !== decision.code` 这道判断，
// 认出裸码就丢掉、换成一句人话 + 下一步。**但兄弟出口 `laneDesktopTools.ts` 没有这道判断**
// （`message: advice?.message ?? decision?.message ?? …`）——拿不到 surface-port 建议、而
// `decision.message` 恰好是裸码时，裸码原样抵达模型。文档/画布/时间轴三条 lane 走的正是那个出口。
//
// 这是 2026-09-18 当天第三次撞见同一个形状：修在一个调用点，兄弟调用点没跟上，而且两边都不报错。
// 所以这次不补那一行，把两个出口收敛到这里：**裸码进不来，出去的一定是人话 + 下一步。**

import { VERB_DECLARATIONS } from "../agentCapabilities/verbDeclarations";
import { verbMaySubmitGeneration, type VerbEffect, type VerbNextAction } from "../agentCapabilities/verbDeclaration";
import type { LaneToolFailureShape } from "./laneToolContract";

/**
 * 工具名 → 它自己声明的 `effect / nextAction`。**从动词声明现取**，不在这里复述一份工具名单——
 * 复述出来的那份会和声明各走各的，而两者不一致时今天没有任何东西会红。
 */
const SUBMISSION_FACETS: ReadonlyMap<string, readonly [VerbEffect, VerbNextAction]> = new Map(
  VERB_DECLARATIONS.map((declaration) => [declaration.name, [declaration.effect, declaration.nextAction] as const]),
);

/** 认不出的工具名 fail-closed 到「可能提交过」：宁可让模型多核对一次，也不要哄它说钱没花。 */
function submissionFacetsOf(toolName: string): readonly [VerbEffect, VerbNextAction] {
  return SUBMISSION_FACETS.get(toolName) ?? ["spend", "user_sees_spend_card"];
}

/** 判决里那句话是不是「等于没说」——裸码、空串、或只是把码又抄了一遍。 */
export function isBareCodeMessage(message: string | undefined, code: string | undefined): boolean {
  const text = (message ?? "").trim();
  if (!text) return true;
  if (!code) return false;
  return text === code.trim();
}

export type LaneFailureAdvice = { message: string; nextAction: string };

/**
 * 把一个传输层判决翻成模型看得懂的失败。
 *
 * `message` 的取值顺序，以及为什么是这个顺序：
 *   1. `advice` —— 领域自己给的人话（如 surface-port 的「磁盘没空间了」）。最具体，优先。
 *   2. `decision.message` —— **仅当它不是裸码**。这是关键那道闸：适配器里 9 处写着
 *      `message: code`，放进来等于把错误码当人话发给模型。
 *   3. 由工具名与码合成的一句话。永远有，所以出口不可能是空的或裸码。
 *
 * `nextAction` 永远有：没有下一步的拒绝会让模型把同一个调用原样再发一遍。
 */
export function laneFailureFromDecision(input: {
  toolName: string;
  code: string | undefined;
  message: string | undefined;
  fallbackCode: string;
  advice?: LaneFailureAdvice | undefined;
  nextAction: string;
  reason?: unknown;
}): LaneToolFailureShape {
  const code = input.code ?? input.fallbackCode;
  const taskAdvice: Record<string, LaneFailureAdvice> = {
    task_reference_required: { message: 'This task reference has no verified domain.', nextAction: 'Read the task result or canvas again and copy both domain and jobId from taskRef. Do not guess a task ID from a node ID.' },
    generation_operation_not_found: { message: 'No generation task exists for this reference in the authorized project.', nextAction: 'Read the current task list or canvas and use its taskRef. Do not create another paid request to recover an unknown outcome.' },
    production_run_not_found: { message: 'This run is not available in the authorized project.', nextAction: 'Read the project task list again. Do not switch domains or automatically submit a replacement.' },
    // 「提交结果可能未知」这句只有在**这个工具发得出提交**时才是真的。判据从动词声明派生
    // （`verbMaySubmitGeneration`），不按工具名手列——手列的那一版正是 2026-09-21 把这句话
    // 发给 `draft_shots` 23 次的原因（见该函数的注释）。
    generation_execution_failed: verbMaySubmitGeneration(...submissionFacetsOf(input.toolName))
      ? { message: 'The generation action could not be completed; its submission outcome may be unknown.', nextAction: 'Query the same domain-qualified task and reconcile its existing submission. Do not request payment or submit again until its outcome is known.' }
      : { message: `${input.toolName} failed inside Nomi. It cannot submit or spend, so nothing was sent to a provider and nothing was spent.`, nextAction: 'Read the current state with the matching read tool, change what you send, and call this tool again. Do not look for a task to reconcile: this call never created one.' },
    generation_not_started: { message: 'The generation action stopped before anything was submitted; nothing was spent.', nextAction: 'Read the failure detail, fix what it names, and let the user approve again. Do not query for a task: none exists.' },
    generation_provider_unavailable: { message: 'The configured generation provider cannot perform this action.', nextAction: 'Check provider configuration and query any existing task before requesting a new paid submission.' },
  };
  const safeAdvice = taskAdvice[code];
  if (safeAdvice) return { code, ...safeAdvice };
  const detail = isBareCodeMessage(input.message, input.code) ? "" : ` ${(input.message ?? "").trim()}`;
  const message = input.advice?.message
    ?? `${input.toolName} could not complete the requested action (${code}).${detail}`;
  return {
    code,
    message,
    nextAction: input.advice?.nextAction ?? input.nextAction,
    ...(input.reason ? { reason: input.reason as LaneToolFailureShape["reason"] } : {}),
  };
}
