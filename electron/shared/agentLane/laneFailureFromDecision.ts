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

import type { LaneToolFailureShape } from "./laneToolContract";

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
