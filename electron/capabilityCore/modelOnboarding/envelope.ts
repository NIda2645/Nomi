/**
 * 接模型两个工具共用的返回信封（方案 §4.3）。
 *
 * 这份信封里最重要的一格是 `unverified`：它把「接好了吗」从一个模型要靠语气拿捏的问题，
 * 变成一个它手里有答案的问题。只要里面还有 `model_produces_output`，它就**不能**说「接好了」。
 * 这是 GitHub `issue_write` 那段「STOP — do not claim the operation succeeded」在本域的等价物，
 * 只是我们用结构表达，而不是靠一段大写祈使句（反方 prior-art 报告结论 5）。
 *
 * 自检**永远**消不掉 `model_produces_output`：自检证明的是「地址对、key 对、卡的形状自洽」，
 * 不是「点了一定能出片」。消掉它的唯一证据是用户在画布上真跑一次（§7）。
 */
export const UNVERIFIED_CLAIMS = [
  "endpoint_reachable",
  "credential_accepted",
  "model_id_exists",
  /** 卡本身过没过校验（旧名 `adapter_compiles`——那时它还是「我们编译出来的」）。 */
  "declaration_valid",
  /** 这家的上传通道真的能把一张本地图送进去吗。自检不打它（那会花钱或留垃圾）。 */
  "asset_upload_works",
  /** 唯一一条只有用户真跑一次才能消掉的。 */
  "model_produces_output",
] as const;
export type UnverifiedClaim = (typeof UNVERIFIED_CLAIMS)[number];

export type UnverifiedEntry = { claim: UnverifiedClaim; reason: string; evidenceWouldBe: string };

export type OnboardingStateId = "S11.0" | "S11.1" | "S11.3" | "S11.4" | "S11.5" | "S11.6";
export type OnboardingChange = { state: OnboardingStateId; summary: string };

export type BlastRadius = {
  modelsAppearing: number;
  modelsDisappearing: number;
  recordsDeleted: number;
  /** 本域 `billable` 恒 false——类型上就不给写 true 的机会（09-12 拍板：这条路上没有花钱的动作）。 */
  outboundRequests: Array<{ origin: string; count: number; billable: false }>;
};

export type OnboardingNextActionKind =
  | "none" | "user_sees_key_page" | "user_sees_confirm_card" | "waiting_for_user" | "working";

export type OnboardingNextAction = {
  kind: OnboardingNextActionKind;
  /** 一句人话，与界面同源、模型可直接转述。 */
  userSees: string;
  waitWith?: "nomi_read target=setup waitMs";
  url?: string;
};

export type OnboardingResult = {
  ok: true;
  setupId?: string;
  vendorKey?: string;
  /** 重放同一跳返回同一个 changeId（按 `(setupId, action, canonicalJson(args))` 派生）。 */
  changeId?: string;
  state: unknown;
  unverified: UnverifiedEntry[];
  changes: OnboardingChange[];
  blastRadius: BlastRadius;
  nextAction: OnboardingNextAction;
};

export type OnboardingRejection = {
  /** 卡上的位置，如 `models[1].modes[0].query.path`。 */
  path: string;
  code:
    | "schema" | "same_origin" | "no_channel" | "async_without_query"
    | "reference_slot_missing" | "credential_rejected" | "endpoint_unreachable"
    | "model_not_listed" | "upload_strategy_unsupported";
  message: string;
  /** **卡上该字段自己声明的出处**，不是我们猜的（真实用户那一条：「你声明 A，文档第 N 节写 B」）。 */
  sourceUrl?: string;
};

export type OnboardingFailure = {
  ok: false;
  code:
    | "wrong_verb" | "needs_input" | "not_found" | "invalid_args" | "stale_fingerprint"
    | "declaration_rejected" | "credential_origin_mismatch" | "no_generic_contract" | "provider_failed";
  message: string;
  useInstead?: string;
  /** 缺什么**一次列全**（09-10 实测 22 次失败里 9 次死在逐个抛）。 */
  needs?: string[];
  rejections?: OnboardingRejection[];
  /** 上游原文，截断但不改写（≤512）。 */
  evidence?: { status?: number; bodyExcerpt?: string };
  nextAction: string;
};

const REASON: Record<UnverifiedClaim, { reason: string; evidenceWouldBe: string }> = {
  endpoint_reachable: {
    reason: "Nomi has not reached this base URL yet.",
    evidenceWouldBe: "a self-check that got an answer from the provider",
  },
  credential_accepted: {
    reason: "The provider has not accepted this key on any request yet.",
    evidenceWouldBe: "a self-check where the provider answered without an auth error",
  },
  model_id_exists: {
    reason: "Nomi has not seen this model id in the provider's own model list.",
    evidenceWouldBe: "the model id appearing in the provider's model list during a self-check",
  },
  declaration_valid: {
    reason: "No declaration card has passed validation for this provider yet.",
    evidenceWouldBe: "a submit_declaration call that came back without a rejected field",
  },
  asset_upload_works: {
    reason: "No local file has been sent through this provider's upload channel yet. The self-check deliberately does not try: it would either cost money or leave a file behind.",
    evidenceWouldBe: "the user's first generation that carries a reference image or video",
  },
  model_produces_output: {
    reason: "Nothing has actually been generated with this model. A self-check never proves this: it only checks the address, the key and the shape of the card.",
    evidenceWouldBe: "the user's first real generation on the canvas",
  },
};

/** claim 列表 → 信封里那一格。理由与「什么才算证据」是派生的，不逐处手写。 */
export function unverified(...claims: UnverifiedClaim[]): UnverifiedEntry[] {
  return [...new Set(claims)].map((claim) => ({ claim, ...REASON[claim] }));
}

/** 这一跳什么都没改。 */
export function noBlast(): BlastRadius {
  return { modelsAppearing: 0, modelsDisappearing: 0, recordsDeleted: 0, outboundRequests: [] };
}

/** 自检发出的免费请求（`billable` 由 `BlastRadius` 的类型钉死成 false，写不成 true）。 */
export function freeRequests(origin: string): BlastRadius["outboundRequests"] {
  return origin ? [{ origin, count: 1, billable: false }] : [];
}
