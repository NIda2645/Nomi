import { describe, expect, it } from "vitest";

import { classifyGenerationResume } from "./productionRunResume";

describe("generation.single-shot resume", () => {
  it("polls when providerTaskId was durably recorded", () => {
    expect(classifyGenerationResume({ jobStatus: "provider_accepted", providerTaskId: "provider-task-1", envelopeState: "provider_accepted" })).toEqual({ action: "poll" });
  });

  it("reconciles unknown submission and never chooses blind retry", () => {
    expect(classifyGenerationResume({ jobStatus: "submission_unknown", envelopeState: "submitted_unknown" })).toEqual({ action: "reconcile", reason: "submission_receipt_unknown" });
    expect(classifyGenerationResume({ jobStatus: "submitting", envelopeState: "sealed" })).toEqual({ action: "reconcile", reason: "crash_during_submit" });
  });

  it("only allows a new dispatch when the durable record proves it was not submitted", () => {
    expect(classifyGenerationResume({ jobStatus: "submit_intent_persisted", envelopeState: "sealed", definitelyNotSubmitted: true })).toEqual({ action: "dispatch" });
    expect(classifyGenerationResume({ jobStatus: "submit_intent_persisted", envelopeState: "sealed" })).not.toEqual({ action: "dispatch" });
  });
});

