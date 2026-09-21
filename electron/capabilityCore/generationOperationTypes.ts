// 生成 operation 的**数据形状与存储接口**（从 `mcpGenerationTools.ts` 拆出：那个文件顶着 800 行门岗，
// 而这一段是纯类型、零运行时）。两份 store（内存版 / Run 账本版）与规划 handler 都从这里取同一份。
import type { ExecutionContractV1, PlanCandidate } from "./executionContract";
import type { GenerationOperationDraftShot, GenerationSealMultiShot } from "./mcpGenerationMultiShot";
import type { GenerationInvocationContext } from "../shared/agentCapabilities/generationInvocationContext";
import type { ProductionGenerationAuthorizationEnvelopeV1 } from "../productionRun/productionGenerationAuthorization";

export type GenerationOperationState = "draft" | "sealed" | "cancelled" | "submitted";

/**
 * P4 S4: one shot within a multi-shot operation, projected for the MCP surface. `role` distinguishes
 * anchor (identity image) from video shot; `included` drives 试拍/分批. Present only when the operation's
 * plan has shots[]; a single-shot operation omits `shots` entirely (byte-identical to today).
 */
export type GenerationOperationShot = Readonly<{
  shotId: string;
  role?: "anchor" | "shot";
  included?: boolean;
  /** 模型拟的短标题（给人看，不进 provider 请求）。见 GenerationOperationDraftShot.title。 */
  title?: string;
  candidate: PlanCandidate;
  contract?: ExecutionContractV1;
}>;

// P4 S6.5: the multi-shot create/seal shapes live in mcpGenerationMultiShot.ts (the entrance's home; keeps
// this shell under the 800-line gate). Re-exported so downstream imports stay on mcpGenerationTools.

export type GenerationOperation = Readonly<{
  /** Set when the draft was admitted from a document: its author body lives in that document's plan. */
  sourceDocumentId?: string;
  operationId: string;
  projectId: string;
  runRevision?: number;
  candidate: PlanCandidate;
  state: GenerationOperationState;
  /** 草稿建好但报价卡还没摆到用户面前（见 `ProductionGenerationPlan.cardHidden`）。 */
  cardHidden?: boolean;
  /** 见 `ProductionGenerationPlan.cancelReason`。 */
  cancelReason?: "declined";
  contract?: ExecutionContractV1;
  approvedReceiptId?: string;
  /** P4 S4: multi-shot entries (anchors + video shots). Absent = single-shot (today's flat path). */
  shots?: ReadonlyArray<GenerationOperationShot>;
  planHash?: string;
  planVersion?: number;
  authorizationEnvelope?: ProductionGenerationAuthorizationEnvelopeV1;
  authorizationDigest?: string;
  authorizationGateId?: string;
  updatedAt: string;
}>;

export type GenerationAuthorizationPreparation = Readonly<{
  envelope: ProductionGenerationAuthorizationEnvelopeV1;
  authorizationDigest: string;
}>;

export type GenerationOperationStore = {
  // P4 S6.5: `shots` seeds a multi-shot draft (anchor + video shots). Absent → single-shot (unchanged).
  create(input: { operationId: string; projectId: string; candidate: PlanCandidate; now: string; origin?: { host: string; actorId?: string; sourceDocument?: { documentId: string; revision: number; contentHash: string } }; shots?: ReadonlyArray<GenerationOperationDraftShot>; cardHidden?: boolean }): GenerationOperation | Promise<GenerationOperation>;
  read(projectId: string, operationId: string): GenerationOperation | null | Promise<GenerationOperation | null>;
  /** `shotId`：改多镜草稿里的一镜（那一镜的候选 revision +1，其它镜一字不动）；缺省 = 顶层候选。 */
  patch(projectId: string, operationId: string, patch: Partial<Omit<PlanCandidate, "candidateId" | "revision">>, now: string, shotId?: string, target?: GenerationInvocationContext['storyboardTarget']): GenerationOperation | Promise<GenerationOperation>;
  /** `generate` 动词：清掉 `cardHidden`，报价卡从这一刻起可投影。只对 draft 合法。 */
  present(projectId: string, operationId: string, now: string, shotIds?: readonly string[], target?: GenerationInvocationContext['storyboardTarget']): GenerationOperation | Promise<GenerationOperation>;
  // P4 S6.5: `multiShot` seals per-shot sub-contracts + planHash (reducer freezes the whole batch). Absent
  // → single-shot seal of the one top-level contract (byte-identical to today).
  seal(projectId: string, operationId: string, contract: ExecutionContractV1, now: string, multiShot?: GenerationSealMultiShot, authorization?: GenerationAuthorizationPreparation): GenerationOperation | Promise<GenerationOperation>;
  /**
   * 终结一份还没提交的计划。`reason: "declined"` = 用户在报价卡上点了 ×（或打字拒绝）：真终态，
   * 投影不出卡、落地不建占位、同一个 operationId 不再被 present 复活。
   */
  cancel(projectId: string, operationId: string, now: string, reason?: "declined"): GenerationOperation | Promise<GenerationOperation>;
  /**
   * 撤回**这一次出价**，计划留着（回到 draft / 未 present）。不是用户说「不」——是问这句话的那个回合没了
   * （重启 / 按停止 / 关窗）。幂等；钱的事已经定了的（门已决 / 已提交 / 已终结）原样返回。
   */
  withdraw(projectId: string, operationId: string, now: string): GenerationOperation | Promise<GenerationOperation>;
  /** P4 S4 试拍首镜: invalidate the waiting authority and return a narrowed plan to draft for re-seal. */
  trialNarrow?(projectId: string, operationId: string, now: string): GenerationOperation | Promise<GenerationOperation>;
  /**
   * 2026-09-11 付费卡上改参数：撤掉还没被点头的授权、把改动落到候选、回到 draft 等重新封印。
   * 与 `trialNarrow` 同族（同一条「撤授权 → 回 draft → 重新 seal/gate」的路），差别只在改了什么。
   */
  revise?(projectId: string, operationId: string, input: GenerationReviseInput, now: string): GenerationOperation | Promise<GenerationOperation>;
};

/** 卡上那一次改动：改哪一镜（缺省 = 顶层候选）、改了什么。 */
export type GenerationReviseInput = Readonly<{
  expectedRevision?: number;
  shotId?: string;
  patch: Readonly<Record<string, unknown>>;
  /** 只对 `shotId` 有意义：把这一镜勾上/取消勾选（「逐镜 / 全部」那个范围切换的落点）。 */
  included?: boolean;
}>;
