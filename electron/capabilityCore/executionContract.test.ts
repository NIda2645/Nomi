import { describe, expect, it } from "vitest";

import { createModuleRegistry } from "./moduleRegistry";
import {
  ContractCompilationError,
  applyPlanCandidatePatch,
  compileExecutionContract,
  type PlanCandidate,
} from "./executionContract";
import type { ModuleManifest } from "./moduleManifest";

const manifest: ModuleManifest = {
  moduleId: "generation.single-shot",
  version: "1.0.0",
  inputKinds: ["text", "image"],
  outputKinds: ["image", "video"],
  modes: ["text-to-image", "image-to-image", "text-to-video"],
  parameterSchema: {
    aspectRatio: { type: "string", required: true },
    seed: { type: "integer" },
    duration: { type: "number" },
  },
  assetInputSchema: { references: { kind: "image", max: 8 } },
  providers: [
    {
      providerId: "provider.image",
      models: [{
        modelId: "model.image.v1",
        modes: ["text-to-image", "image-to-image"],
        parameterSchema: { seed: { type: "integer" } },
        capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
      }],
    },
    {
      providerId: "provider.video",
      models: [{
        modelId: "model.video.v1",
        modes: ["text-to-video"],
        parameterSchema: { duration: { type: "number", required: true } },
        capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
      }],
    },
  ],
};

const registry = createModuleRegistry([manifest]);

function candidate(overrides: Partial<PlanCandidate> = {}): PlanCandidate {
  return {
    candidateId: "candidate-1",
    revision: 1,
    moduleId: "generation.single-shot",
    providerId: "provider.image",
    modelId: "model.image.v1",
    mode: "image-to-image",
    prompt: "a red fox in snow",
    parameters: { aspectRatio: "16:9", seed: 4 },
    references: [
      { assetId: "asset-a", contentHash: "a".repeat(64), version: 1 },
      { assetId: "asset-b", contentHash: "b".repeat(64), version: 1 },
    ],
    ...overrides,
  };
}

describe("ExecutionContract compiler", () => {
  it("is deterministic and preserves user reference order", () => {
    const first = compileExecutionContract(candidate(), registry);
    const second = compileExecutionContract(structuredClone(candidate()), registry);
    expect(first.contractHash).toBe(second.contractHash);
    expect(first.references.map((reference) => reference.assetId)).toEqual(["asset-a", "asset-b"]);
  });

  it("changes the contract when the user changes provider, mode, parameters, or references", () => {
    const original = compileExecutionContract(candidate(), registry);
    const changed = compileExecutionContract(candidate({
      providerId: "provider.video",
      modelId: "model.video.v1",
      mode: "text-to-video",
      parameters: { aspectRatio: "9:16", duration: 5 },
      references: [{ assetId: "asset-c", contentHash: "c".repeat(64), version: 2 }],
    }), registry);
    expect(changed.contractHash).not.toBe(original.contractHash);
    expect(changed.references.map((reference) => reference.assetId)).toEqual(["asset-c"]);
  });

  it("explains unsupported fields instead of silently dropping them", () => {
    const contract = compileExecutionContract(candidate({ parameters: { aspectRatio: "16:9", unknownKnob: 10 } }), registry);
    expect(contract.droppedFields).toEqual([{ path: "parameters.unknownKnob", reason: "unsupported_parameter" }]);
    expect(contract.warnings[0]).toContain("unknownKnob");
    expect(contract.parameters).not.toHaveProperty("unknownKnob");
  });

  it("fails before provider work when a required parameter is missing", () => {
    expect(() => compileExecutionContract(candidate({
      providerId: "provider.video",
      modelId: "model.video.v1",
      mode: "text-to-video",
      parameters: { aspectRatio: "16:9" },
    }), registry)).toThrow(ContractCompilationError);
  });

  it("allows edits before sealing and requires a new draft after sealing", () => {
    const draft = applyPlanCandidatePatch(candidate(), { parameters: { aspectRatio: "1:1", seed: 8 } });
    expect(draft.revision).toBe(2);
    expect(draft.parameters).toEqual({ aspectRatio: "1:1", seed: 8 });
    expect(() => applyPlanCandidatePatch({ ...candidate(), sealedContractHash: "a".repeat(64) }, { prompt: "new" })).toThrow(/new_draft_required/);
  });

  it("preserves reference kind and role in the sealed contract", () => {
    const contract = compileExecutionContract(candidate({
      references: [{ assetId: "asset-character", contentHash: "c".repeat(64), version: 1, kind: "image", role: "character" }],
    }), registry);

    expect(contract.references[0]).toMatchObject({ kind: "image", role: "character" });
  });

  it("changes the contract when only a reference role changes", () => {
    const original = candidate({
      references: [{ assetId: "asset-a", contentHash: "a".repeat(64), version: 1, kind: "image", role: "character" }],
    });
    const changed = applyPlanCandidatePatch(original, {
      references: [{ ...original.references[0]!, role: "first_frame" }],
    });

    expect(changed.revision).toBe(original.revision + 1);
    expect(compileExecutionContract(changed, registry).contractHash)
      .not.toBe(compileExecutionContract(original, registry).contractHash);
  });
});
