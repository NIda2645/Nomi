import { describe, expect, it, vi } from "vitest";

import { createModuleRegistry } from "./moduleRegistry";
import { createGenerationPlanningHandler, createInMemoryGenerationOperationStore, MCP_GENERATION_TOOL_CATALOG } from "./mcpGenerationTools";
import { SEEDANCE_2_5_APIMART_ARCHETYPE } from "../../src/config/modelArchetypes/seedance25Apimart";
import { buildVideoModelCandidates, recommendVideoGeneration } from "../shared/videoCapabilities";

const videoModelCandidates = buildVideoModelCandidates([
  { provider: "apimart", modelKey: "doubao-seedance-2.0", label: "Seedance 2.0" },
  { provider: "apimart", modelKey: "doubao-seedance-2.0-fast", label: "Seedance 2.0 Fast" },
  { provider: "apimart", modelKey: "doubao-seedance-2.0-mini", label: "Seedance 2.0 Mini" },
]);

const registry = createModuleRegistry([{
  moduleId: "generation.single-shot",
  version: "1.0.0",
  inputKinds: ["text", "image"],
  outputKinds: ["image"],
  modes: ["text-to-image", "image-to-image"],
  parameterSchema: { aspectRatio: { type: "enum", enum: ["1:1", "16:9"] } },
  assetInputSchema: { references: { kind: "image", max: 4 } },
  providers: [{
    providerId: "fixture-provider",
    models: [{
      modelId: "fixture-model",
      modes: ["text-to-image", "image-to-image"],
      parameterSchema: { seed: { type: "integer" } },
      capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
    }],
  }],
}]);

const blockedRegistry = createModuleRegistry([{
  moduleId: "generation.single-shot",
  version: "1.0.0",
  inputKinds: ["image"],
  outputKinds: ["image"],
  modes: ["text-to-image"],
  parameterSchema: {},
  assetInputSchema: { references: { kind: "asset" } },
  providers: [{ providerId: "blocked-provider", models: [{ modelId: "blocked-model", modes: ["text-to-image"], parameterSchema: {}, capabilities: { submitIdempotency: false, query: false, reconcile: false, cancel: false } }] }],
}]);

const videoRegistry = createModuleRegistry([{
  moduleId: "generation.single-shot",
  version: "1.0.0",
  inputKinds: ["text", "image", "video"],
  outputKinds: ["video"],
  modes: ["text-to-video", "image-to-video"],
  parameterSchema: { duration: { type: "number" } },
  assetInputSchema: { references: { kind: "asset", max: 30 } },
  providers: [{
    providerId: "video-provider",
    models: [{
      modelId: "video-model",
      modes: ["text-to-video", "image-to-video"],
      parameterSchema: { duration: { type: "number" } },
      capabilities: { submitIdempotency: false, query: true, reconcile: true, cancel: false },
    }],
  }],
}]);

const lease = {
  leaseId: "lease-1",
  projectId: "project-1",
  immutableProjectUuid: "project-uuid-1",
  projectGeneration: 1,
  canonicalRootDigest: "root-1",
  manifestDigest: "manifest-1",
  issuedAt: "2026-08-23T00:00:00.000Z",
  expiresAt: "2026-08-23T01:00:00.000Z",
  audience: "mcp",
  leasePrincipal: "mcp:test",
  sessionId: "session-1",
  connectionNonce: "connection-1",
  revocationEpoch: 0,
  scopeSet: ["generation:create", "generation:plan", "generation:preview", "generation:read", "generation:cancel"],
} as const;

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    candidateId: "candidate-1",
    revision: 1,
    moduleId: "generation.single-shot",
    providerId: "fixture-provider",
    modelId: "fixture-model",
    mode: "text-to-image",
    prompt: "A paper boat on a quiet lake",
    parameters: { aspectRatio: "1:1", seed: 7 },
    references: [],
    ...overrides,
  };
}

describe("semantic MCP generation tools", () => {
  it("returns the current catalog context without calling a provider", async () => {
    const handler = createGenerationPlanningHandler({ registry, operations: createInMemoryGenerationOperationStore(), now: () => "2026-08-23T00:00:00.000Z" });
    await expect(handler({ capability: "context", params: {}, lease })).resolves.toMatchObject({
      projectId: "project-1",
      immutableProjectUuid: "project-uuid-1",
      providerProfiles: [{ providerId: "fixture-provider", modelIds: ["fixture-model"], modes: expect.arrayContaining(["text-to-image", "image-to-image"]) }],
    });
  });

  it("exposes one vocabulary for MCP and GUI adapters", () => {
    expect(MCP_GENERATION_TOOL_CATALOG.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "nomi_session_open",
      "nomi_operation_create",
      "nomi_submit_generation_plan",
      "nomi_preview_execution",
      "nomi_start_generation",
    ]));
  });

  it("keeps editing provider-neutral and does not call a provider", async () => {
    const operations = createInMemoryGenerationOperationStore();
    const handler = createGenerationPlanningHandler({ registry, operations, now: () => "2026-08-23T00:00:00.000Z" });
    const created = await handler({ capability: "create", params: { candidate: candidate() }, lease });
    const operationId = (created as { operation: { operationId: string } }).operation.operationId;

    const edited = await handler({
      capability: "plan",
      params: { operationId, patch: { modelId: "fixture-model", mode: "image-to-image", references: [{ assetId: "asset-1", contentHash: "hash-1", version: 1 }], parameters: { aspectRatio: "16:9", seed: 9 } } },
      lease,
    });
    expect(edited).toMatchObject({ nextAction: "preview", operation: { candidate: { revision: 2, mode: "image-to-image" } } });

    const preview = await handler({ capability: "preview", params: { operationId }, lease });
    expect(preview).toMatchObject({ operationId, candidateRevision: 2, nextAction: "request_gate", contract: { mode: "image-to-image", contractHash: expect.any(String) } });
  });

  it("keeps reference kind and role when an MCP draft is created", async () => {
    const operations = createInMemoryGenerationOperationStore();
    const handler = createGenerationPlanningHandler({ registry, operations, now: () => "2026-08-23T00:00:00.000Z" });
    const created = await handler({
      capability: "create",
      params: {
        candidate: candidate({
          references: [{ assetId: "asset-character", contentHash: "c".repeat(64), version: 1, kind: "image", role: "character" }],
        }),
      },
      lease,
    });
    const operationId = (created as { operation: { operationId: string } }).operation.operationId;

    expect((await operations.read("project-1", operationId))?.candidate.references[0])
      .toMatchObject({ kind: "image", role: "character" });
  });

  it("projects a contextual recommendation during video preview without provider side effects", async () => {
    const operations = createInMemoryGenerationOperationStore();
    const recommendVideoGeneration = vi.fn(() => ({
      recommendations: [{
        provider: "apimart",
        modelKey: "doubao-seedance-2.5",
        label: "Seedance 2.5",
        modeId: "firstlast",
        modeLabel: "首尾帧",
        params: { duration: 8 },
        editableParams: ["duration"],
        reasons: ["提供了首帧和尾帧"],
        limitations: [],
        score: 175,
      }],
    }));
    const start = vi.fn(async () => { throw new Error("video preview must not start a provider"); });
    const handler = createGenerationPlanningHandler({
      registry: videoRegistry,
      operations,
      videoModelCandidates: [{ provider: "apimart", modelKey: "doubao-seedance-2.5", label: "Seedance 2.5", archetype: SEEDANCE_2_5_APIMART_ARCHETYPE }],
      recommendVideoGeneration,
      start,
      now: () => "2026-08-23T00:00:00.000Z",
    });
    const created = await handler({
      capability: "create",
      params: {
        candidate: {
          candidateId: "video-candidate",
          revision: 1,
          moduleId: "generation.single-shot",
          providerId: "video-provider",
          modelId: "video-model",
          mode: "text-to-video",
          prompt: "从白天过渡到夜晚",
          parameters: { duration: 8 },
          references: [
            { assetId: "first", contentHash: "f".repeat(64), version: 1, kind: "image", role: "first_frame" },
            { assetId: "last", contentHash: "l".repeat(64), version: 1, kind: "image", role: "last_frame" },
          ],
        },
      },
      lease,
    });
    const operationId = (created as { operation: { operationId: string } }).operation.operationId;

    const preview = await handler({ capability: "preview", params: { operationId }, lease });
    expect(preview).toMatchObject({ recommendation: { recommendations: [{ modeId: "firstlast" }] } });
    expect(recommendVideoGeneration).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });

  it("uses the shared source-backed registry for a real preview path without starting a provider", async () => {
    const operations = createInMemoryGenerationOperationStore();
    const start = vi.fn(async () => { throw new Error("shared preview must not start a provider"); });
    const handler = createGenerationPlanningHandler({
      registry: videoRegistry,
      operations,
      videoModelCandidates,
      recommendVideoGeneration,
      start,
      now: () => "2026-08-23T00:00:00.000Z",
    });
    const created = await handler({
      capability: "create",
      params: {
        candidate: {
          candidateId: "shared-video-candidate",
          revision: 1,
          moduleId: "generation.single-shot",
          providerId: "video-provider",
          modelId: "video-model",
          mode: "text-to-video",
          prompt: "从首帧自然过渡到尾帧",
          parameters: { duration: 8, preserveTransition: true },
          references: [
            { assetId: "first", contentHash: "f".repeat(64), version: 1, kind: "image", role: "first_frame" },
            { assetId: "last", contentHash: "l".repeat(64), version: 1, kind: "image", role: "last_frame" },
          ],
        },
      },
      lease,
    });
    const operationId = (created as { operation: { operationId: string } }).operation.operationId;

    const preview = await handler({ capability: "preview", params: { operationId }, lease });

    const recommendations = (preview as { recommendation: { recommendations: Array<Record<string, unknown>> } }).recommendation.recommendations;
    expect(recommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: "apimart", modelKey: "doubao-seedance-2.0", modeId: "firstlast" }),
    ]));
    expect(start).not.toHaveBeenCalled();
  });

  it("returns a new-draft error instead of mutating a sealed plan", async () => {
    const operations = createInMemoryGenerationOperationStore();
    const handler = createGenerationPlanningHandler({ registry, operations, now: () => "2026-08-23T00:00:00.000Z" });
    const created = await handler({ capability: "create", params: { candidate: candidate() }, lease });
    const operation = (created as { operation: { operationId: string; candidate: typeof candidate } }).operation;
    const preview = await handler({ capability: "preview", params: { operationId: operation.operationId }, lease });
    operations.seal("project-1", operation.operationId, (preview as { contract: never }).contract, "2026-08-23T00:00:00.000Z");

    await expect(handler({ capability: "plan", params: { operationId: operation.operationId, patch: { prompt: "A red paper boat" } }, lease }))
      .rejects.toThrow("new_draft_required");
  });

  it("returns explicit provider-not-configured status and never falls back to legacy generation", async () => {
    const operations = createInMemoryGenerationOperationStore();
    const start = async (operation: never) => ({ operationId: operation.operationId, state: "sealed", nextAction: "provider_not_configured" });
    const handler = createGenerationPlanningHandler({ registry, operations, start, now: () => "2026-08-23T00:00:00.000Z" });
    const created = await handler({ capability: "create", params: { candidate: candidate() }, lease });
    const operationId = (created as { operation: { operationId: string } }).operation.operationId;
    const preview = await handler({ capability: "preview", params: { operationId }, lease });
    operations.seal("project-1", operationId, (preview as { contract: never }).contract, "2026-08-23T00:00:00.000Z");
    operations.approve("project-1", operationId, "receipt-1", "2026-08-23T00:00:00.000Z");
    await expect(handler({ capability: "start", params: { operationId }, lease })).resolves.toMatchObject({ nextAction: "provider_not_configured" });
  });

  it("allows a submit-only provider while making recovery limits explicit", async () => {
    const operations = createInMemoryGenerationOperationStore();
    const handler = createGenerationPlanningHandler({ registry: blockedRegistry, operations, now: () => "2026-08-23T00:00:00.000Z" });
    const created = await handler({ capability: "create", params: { candidate: candidate({ providerId: "blocked-provider", modelId: "blocked-model" }) }, lease });
    const operationId = (created as { operation: { operationId: string } }).operation.operationId;
    await expect(handler({ capability: "preview", params: { operationId }, lease })).resolves.toMatchObject({ providerReady: true, providerCapabilityProfile: "submit_only", nextAction: "request_gate", providerCapabilitiesMissing: expect.arrayContaining(["query", "reconcile"]) });
    await expect(handler({ capability: "gate_request", params: { operationId }, lease })).resolves.toMatchObject({ nextAction: "confirm", providerCapabilityProfile: "submit_only", recoveryNotice: expect.stringContaining("核对") });
    expect((await operations.read("project-1", operationId))?.state).toBe("sealed");
  });
});
