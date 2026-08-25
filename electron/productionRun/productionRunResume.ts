export type GenerationResumeInput = {
  jobStatus: string;
  providerTaskId?: string;
  envelopeState: "sealed" | "provider_accepted" | "submitted_unknown" | "materialized";
  definitelyNotSubmitted?: boolean;
};

export type GenerationResumeDecision =
  | { action: "dispatch" }
  | { action: "poll" }
  | { action: "reconcile"; reason: "submission_receipt_unknown" | "crash_during_submit" }
  | { action: "attention"; reason: "invalid_recovery_state" };

export function classifyGenerationResume(input: GenerationResumeInput): GenerationResumeDecision {
  if (input.jobStatus === "provider_accepted" && input.providerTaskId && input.envelopeState === "provider_accepted") return { action: "poll" };
  if (input.jobStatus === "submission_unknown" || input.envelopeState === "submitted_unknown") return { action: "reconcile", reason: "submission_receipt_unknown" };
  if (input.jobStatus === "submitting") return { action: "reconcile", reason: "crash_during_submit" };
  if (input.jobStatus === "submit_intent_persisted" && input.envelopeState === "sealed" && input.definitelyNotSubmitted === true) return { action: "dispatch" };
  return { action: "attention", reason: "invalid_recovery_state" };
}

