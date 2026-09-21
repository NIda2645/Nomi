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

  it("refuses an undeclared parameter and names the legal ones instead of dropping it", () => {
    // 静默丢弃 = 「你批准的是 A、我们发出去的是 B」：用户在付款卡上把清晰度改成 2K，合同悄悄丢掉，
    // 供应商按自己的默认出 1k，节点上仍印 2K。报错并列出合法键才是可执行的答复。
    expect(() => compileExecutionContract(candidate({ parameters: { aspectRatio: "16:9", unknownKnob: 10 } }), registry))
      .toThrow(/parameters\.unknownKnob/);
    try {
      compileExecutionContract(candidate({ parameters: { aspectRatio: "16:9", unknownKnob: 10 } }), registry);
    } catch (error) {
      expect(String((error as Error).message)).toContain("aspectRatio");
      expect(String((error as Error).message)).toContain("seed");
    }
  });

  it("keeps a wire-declared parameter whose value domain only the provider knows", () => {
    // 线缆模板引用了 `resolution` → 它发得出去 → 合同必须原样带着它（type: "any" 那一档）。
    const wireRegistry = createModuleRegistry([{
      ...manifest,
      parameterSchema: { ...manifest.parameterSchema, resolution: { type: "any" } },
    }]);
    const contract = compileExecutionContract(
      candidate({ parameters: { aspectRatio: "16:9", resolution: "2K" } }),
      wireRegistry,
    );
    expect(contract.parameters.resolution).toBe("2K");
    expect(contract.droppedFields).toEqual([]);
  });

  it("registers Nomi's own planning intents instead of calling them unsupported", () => {
    const contract = compileExecutionContract(
      candidate({ parameters: { aspectRatio: "16:9", preserveCharacter: true } }),
      registry,
    );
    expect(contract.droppedFields).toEqual([{ path: "parameters.preserveCharacter", reason: "planning_input" }]);
    expect(contract.parameters).not.toHaveProperty("preserveCharacter");
  });

  it("fails before provider work when a required parameter is missing", () => {
    expect(() => compileExecutionContract(candidate({
      providerId: "provider.video",
      modelId: "model.video.v1",
      mode: "text-to-video",
      parameters: { aspectRatio: "16:9" },
    }), registry)).toThrow(ContractCompilationError);
  });

  it("keeps discrete numeric choices discrete instead of accepting arbitrary numbers", () => {
    const constrainedRegistry = createModuleRegistry([{
      ...manifest,
      providers: [{
        providerId: "provider.video",
        models: [{
          modelId: "model.video.v1",
          modes: ["text-to-video"],
          parameterSchema: { duration: { type: "number", enum: [6, 10], required: true } },
          capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
        }],
      }],
    }]);
    expect(compileExecutionContract(candidate({
      providerId: "provider.video",
      modelId: "model.video.v1",
      mode: "text-to-video",
      parameters: { aspectRatio: "16:9", duration: 6 },
    }), constrainedRegistry).parameters.duration).toBe(6);
    expect(() => compileExecutionContract(candidate({
      providerId: "provider.video",
      modelId: "model.video.v1",
      mode: "text-to-video",
      parameters: { aspectRatio: "16:9", duration: 7 },
    }), constrainedRegistry)).toThrow(ContractCompilationError);
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
