import { describe, expect, it, vi } from "vitest";

import { createModuleRegistry } from "./moduleRegistry";
import { compileExecutionContract, type ExecutionContractV1, type PlanCandidate } from "./executionContract";
import {
  assertGenerationProviderCapabilities,
  GenerationProviderCapabilityError,
  createGenerationRuntimeAdapter,
  resolveExecutionContract,
} from "./generationRuntimeAdapter";
import type { ModuleManifest } from "./moduleManifest";
import { createProductionExecutionBinding } from "../productionRun/productionExecutionBinding";

const manifest: ModuleManifest = {
  moduleId: "generation.single-shot",
  version: "1.0.0",
  inputKinds: ["text"],
  outputKinds: ["image", "video"],
  modes: ["text-to-image", "text-to-video"],
  parameterSchema: { promptStrength: { type: "number" } },
  assetInputSchema: {},
  providers: [
    {
      providerId: "provider.image",
      models: [{
        modelId: "model.image.v1",
        modes: ["text-to-image"],
        parameterSchema: { aspectRatio: { type: "string" } },
        capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
      }],
    },
    {
      providerId: "provider.video",
      models: [{
        modelId: "model.video.v1",
        modes: ["text-to-video"],
        parameterSchema: { duration: { type: "number" } },
        capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
      }],
    },
  ],
};

const registry = createModuleRegistry([manifest]);
function bindingFor(providerNamespace: string, contractHash: string) {
  return createProductionExecutionBinding({
    immutableProjectUuid: "project-uuid-1",
    projectGeneration: 4,
    runId: "run-1",
    shotId: "shot-1",
    contractHash,
    runtimeTaskId: "task-1",
    providerNamespace,
    providerIdempotencyKey: "run-1:shot-1:attempt-1",
    requestFingerprint: "b".repeat(64),
    runtimeEnvelopeRef: ".nomi/runs/run-1/envelopes/task-1.json",
    fencingEpoch: 2,
  });
}

function contract(providerId: string, modelId: string, mode: string, parameters: Record<string, unknown>): ExecutionContractV1 {
  const candidate: PlanCandidate = {
    candidateId: "candidate-1",
    revision: 1,
    moduleId: "generation.single-shot",
    providerId,
    modelId,
    mode,
    prompt: "a red fox",
    parameters,
    references: [],
  };
  return compileExecutionContract(candidate, registry);
}

describe("GenerationRuntimeAdapter", () => {
  it("maps two different provider profiles without provider-specific branches in the adapter", async () => {
    const imageSubmit = vi.fn(async (request: Record<string, unknown>) => ({ providerTaskId: "image-task-1", raw: request }));
    const videoSubmit = vi.fn(async (request: Record<string, unknown>) => ({ providerTaskId: "video-task-1", raw: request }));
    const adapter = createGenerationRuntimeAdapter({
      providers: [
        {
          providerId: "provider.image",
          capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
          buildRequest: (input) => ({ endpointShape: "image", model: input.modelId, prompt: input.prompt, aspectRatio: input.parameters.aspectRatio }),
          submit: imageSubmit,
        },
        {
          providerId: "provider.video",
          capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
          buildRequest: (input) => ({ endpointShape: "video", model: input.modelId, prompt: input.prompt, duration: input.parameters.duration }),
          submit: videoSubmit,
        },
      ],
    });

    const imageContract = contract("provider.image", "model.image.v1", "text-to-image", { aspectRatio: "16:9" });
    const videoContract = contract("provider.video", "model.video.v1", "text-to-video", { duration: 5 });
    const imageBinding = bindingFor("provider.image", imageContract.contractHash);
    const videoBinding = bindingFor("provider.video", videoContract.contractHash);
    await expect(adapter.submit({ contract: imageContract, binding: imageBinding })).resolves.toMatchObject({ providerTaskId: "image-task-1" });
    await expect(adapter.submit({ contract: videoContract, binding: videoBinding })).resolves.toMatchObject({ providerTaskId: "video-task-1" });
    expect(imageSubmit).toHaveBeenCalledWith(expect.objectContaining({ endpointShape: "image" }), imageBinding.providerIdempotencyKey);
    expect(videoSubmit).toHaveBeenCalledWith(expect.objectContaining({ endpointShape: "video" }), videoBinding.providerIdempotencyKey);
  });

  it("keeps the full recovery assertion available for callers that explicitly require it", () => {
    const submit = vi.fn();
    const provider = {
      providerId: "provider.image",
      capabilities: { submitIdempotency: false, query: true, reconcile: true, cancel: true },
      buildRequest: (input) => input,
      submit,
    };
    expect(() => assertGenerationProviderCapabilities(provider)).toThrow(GenerationProviderCapabilityError);
    expect(submit).not.toHaveBeenCalled();
  });

  it("submits an observe-only provider without requiring native retry or cancel", async () => {
    const submit = vi.fn(async () => ({ providerTaskId: "task-apimart-1" }));
    const adapter = createGenerationRuntimeAdapter({ providers: [{
      providerId: "provider.image",
      capabilities: { submitIdempotency: false, query: true, reconcile: true, cancel: false },
      buildRequest: (input) => input,
      submit,
    }] });
    const imageContract = contract("provider.image", "model.image.v1", "text-to-image", { aspectRatio: "1:1" });
    await expect(adapter.submit({ contract: imageContract, binding: bindingFor("provider.image", imageContract.contractHash) }))
      .resolves.toMatchObject({ providerTaskId: "task-apimart-1" });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("submits a submit-only provider without inventing recovery capabilities", async () => {
    const submit = vi.fn(async () => ({ providerTaskId: "provider-reference-1" }));
    const adapter = createGenerationRuntimeAdapter({ providers: [{
      providerId: "provider.image",
      capabilities: { submitIdempotency: false, query: false, reconcile: false, cancel: false },
      buildRequest: (input) => input,
      submit,
    }] });
    const imageContract = contract("provider.image", "model.image.v1", "text-to-image", { aspectRatio: "1:1" });
    await expect(adapter.submit({ contract: imageContract, binding: bindingFor("provider.image", imageContract.contractHash) }))
      .resolves.toMatchObject({ providerTaskId: "provider-reference-1" });
  });

  it("creates a provider-neutral request with the sealed contract hash and idempotency key", () => {
    const imageContract = contract("provider.image", "model.image.v1", "text-to-image", { aspectRatio: "1:1" });
    const imageBinding = bindingFor("provider.image", imageContract.contractHash);
    const result = resolveExecutionContract(imageContract, imageBinding);
    expect(result).toMatchObject({ providerId: "provider.image", modelId: "model.image.v1", idempotencyKey: imageBinding.providerIdempotencyKey, contractHash: imageBinding.contractHash });
  });
});
