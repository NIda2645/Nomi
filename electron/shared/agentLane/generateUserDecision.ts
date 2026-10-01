import type { GeneratePresentationOutcome } from "../productionGenerationPresentation";
// `generate` 的结果里「用户在那张报价卡上到底做了什么」这一格——端口写、回执读，形状只有这一份。
//
// 三种都是**成功形状**（2026-09-22 裁决 A）：没有任何东西坏了。错误形状会让模型重试、进熔断、
// 向用户报「出错了」——对一个「他说不」或「他想先改一下」，三样都是错的。

export const GENERATE_USER_DECISION_KEY = "userDecision";

export type GenerateUserDecision =
  /** 文稿方案（分镜编辑器那张整份确认框）：点了开拍。 */
  | Readonly<{ outcome: "approved" }>
  /** 文稿方案：点了取消。 */
  | Readonly<{ outcome: "declined" }>
  /**
   * 付费卡（逐镜，2026-09-30）：这一次出价关了——每一镜都决定了，或者他点了 ×。每一镜的结局都在 `shots` 里，
   * 是宿主给的那一个值（`generationPresentationOutcome`），回执只渲染它。
   */
  | Readonly<{ outcome: "card_closed"; shots: GeneratePresentationOutcome }>
  /** 卡待决时他打了字：这一次出价收回，计划留着；`userSaid` 一字不改。付费卡那条路同时带上逐镜结局。 */
  | Readonly<{ outcome: "redirected"; userSaid: string; shots?: GeneratePresentationOutcome }>;

function presentationOutcomeOf(value: unknown): GeneratePresentationOutcome | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const ids = (key: string) => Array.isArray(record[key]) && (record[key] as unknown[]).every((id) => typeof id === "string");
  const undecided = Array.isArray(record.undecided) && (record.undecided as unknown[]).every((entry) => Boolean(entry)
    && typeof (entry as { shotId?: unknown }).shotId === "string" && typeof (entry as { reason?: unknown }).reason === "string");
  return typeof record.closedBy === "string" && ids("generating") && ids("failedBeforeSending") && ids("removed") && ids("takenByCanvas") && undecided
    ? value as GeneratePresentationOutcome
    : undefined;
}

export function generateUserDecisionOf(result: unknown): GenerateUserDecision | undefined {
  if (!result || typeof result !== "object") return undefined;
  const value = (result as Record<string, unknown>)[GENERATE_USER_DECISION_KEY];
  if (!value || typeof value !== "object") return undefined;
  const outcome = (value as { outcome?: unknown }).outcome;
  if (outcome === "approved" || outcome === "declined") return { outcome };
  const shots = presentationOutcomeOf((value as { shots?: unknown }).shots);
  if (outcome === "card_closed") return shots ? { outcome, shots } : undefined;
  const userSaid = (value as { userSaid?: unknown }).userSaid;
  return outcome === "redirected" && typeof userSaid === "string" ? { outcome, userSaid, ...(shots ? { shots } : {}) } : undefined;
}
