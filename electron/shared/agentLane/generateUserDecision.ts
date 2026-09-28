// `generate` 的结果里「用户在那张报价卡上到底做了什么」这一格——端口写、回执读，形状只有这一份。
//
// 三种都是**成功形状**（2026-09-22 裁决 A）：没有任何东西坏了。错误形状会让模型重试、进熔断、
// 向用户报「出错了」——对一个「他说不」或「他想先改一下」，三样都是错的。

export const GENERATE_USER_DECISION_KEY = "userDecision";

export type GenerateUserDecision =
  /** 点了「生成 ¥X」：钱的那条链已经跑完，任务开跑。 */
  | Readonly<{ outcome: "approved" }>
  /** 点了 ×：明确的「不」，这份请求到此为止（真终态）。 */
  | Readonly<{ outcome: "declined" }>
  /** 卡待决时他打了字：这一次出价收回，计划留着；`userSaid` 一字不改。 */
  | Readonly<{ outcome: "redirected"; userSaid: string }>;

export function generateUserDecisionOf(result: unknown): GenerateUserDecision | undefined {
  if (!result || typeof result !== "object") return undefined;
  const value = (result as Record<string, unknown>)[GENERATE_USER_DECISION_KEY];
  if (!value || typeof value !== "object") return undefined;
  const outcome = (value as { outcome?: unknown }).outcome;
  if (outcome === "approved" || outcome === "declined") return { outcome };
  const userSaid = (value as { userSaid?: unknown }).userSaid;
  return outcome === "redirected" && typeof userSaid === "string" ? { outcome, userSaid } : undefined;
}
