import { describe, expect, it, vi } from "vitest";

import { createModuleRegistry } from "./moduleRegistry";
import {
  coldstartEtaForGate,
  createGenerationPlanningHandler,
  createInMemoryGenerationOperationStore,
  type GenerationOperation,
} from "./mcpGenerationTools";
import { MCP_GENERATION_TOOL_CATALOG } from "./mcpGenerationToolCatalog";
import { PROJECT_LEASE_ALGORITHM, PROJECT_LEASE_AUDIENCE, PROJECT_LEASE_VERSION, type ProjectLeaseV2 } from "./projectLease";
import { buildVideoModelCandidates, recommendVideoGeneration, SEEDANCE_2_5_APIMART_ARCHETYPE } from "../shared/videoCapabilities";

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
  // 这份夹具要测的是「供应商只会提交、不会查询」的恢复能力，不是参数表。它的参数表必须像真目录那样
  // 声明这条 wire 认得的键（候选带 seed），否则合同编译会先一步以「未声明的参数」拒掉，测的就不是这件事了。
  parameterSchema: { seed: { type: "any" } },
  assetInputSchema: { references: { kind: "asset" } },
  providers: [{ providerId: "blocked-provider", models: [{ modelId: "blocked-model", modes: ["text-to-image"], parameterSchema: { seed: { type: "any" } }, capabilities: { submitIdempotency: false, query: false, reconcile: false, cancel: false } }] }],
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

// 完整的 ProjectLeaseV2 形状。签名相关字段（keyId/nonce/scopeHash/mac）这些用例用不到
// （handler 只读 projectId 之类），但类型上是必填的——缺了就是夹具在类型上撒谎。
const lease: ProjectLeaseV2 = {
  version: PROJECT_LEASE_VERSION,
  keyId: "key-1",
  algorithm: PROJECT_LEASE_ALGORITHM,
  issuer: "nomi-main",
  nonce: "nonce-1",
  scopeHash: "scope-hash-1",
  mac: "mac-1",
  projectId: "project-1",
  immutableProjectUuid: "project-uuid-1",
  projectGeneration: 1,
  canonicalRootDigest: "root-1",
  manifestDigest: "manifest-1",
  issuedAt: "2026-08-23T00:00:00.000Z",
  expiresAt: "2026-08-23T01:00:00.000Z",
  audience: PROJECT_LEASE_AUDIENCE,
  leasePrincipal: "mcp:codex",
  sessionId: "session-1",
  connectionNonce: "connection-1",
  revocationEpoch: 0,
  scopeSet: ["generation:create", "generation:plan", "generation:preview", "generation:read", "generation:cancel"],
};

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
    // 面收敛（surface-16-collapse）：operation 族 8 步塌成 5 个贴生命周期的工具（get_context 进 nomi_read）。
    expect(MCP_GENERATION_TOOL_CATALOG.map((tool) => tool.name)).toEqual([
      "nomi_operation_plan",
      "nomi_operation_preview",
      "nomi_operation_gate",
      "nomi_operation_execute",
      "nomi_operation_control",
    ]);
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

  it("creates a real draft from a natural prompt using the configured default model", async () => {
    const operations = createInMemoryGenerationOperationStore();
    const defaultModelForTaskKind = vi.fn((taskKind: "text_to_image" | "image_edit" | "text_to_video" | "image_to_video") => ({
      moduleId: "generation.single-shot",
      providerId: "fixture-provider",
      modelId: "fixture-model",
      mode: taskKind === "image_edit" ? "image-to-image" : "text-to-image",
    }));
    const handler = createGenerationPlanningHandler({ registry, operations, defaultModelForTaskKind, now: () => "2026-08-23T00:00:00.000Z" });

    const created = await handler({ capability: "create", params: { operationId: "op-natural-cat", prompt: "帮我生成一个小猫头像" }, lease }) as {
      operation: GenerationOperation;
      nextAction: string;
    };

    expect(created.nextAction).toBe("preview");
    expect(created.operation.candidate).toMatchObject({
      candidateId: "cand-op-natural-cat",
      providerId: "fixture-provider",
      modelId: "fixture-model",
      mode: "text-to-image",
      prompt: "帮我生成一个小猫头像",
      revision: 1,
    });
    expect(defaultModelForTaskKind).toHaveBeenCalledWith("text_to_image");
  });

  it("infers video intent and preserves explicit model parameters on the short create path", async () => {
    const operations = createInMemoryGenerationOperationStore();
    const defaultModelForTaskKind = vi.fn((taskKind: "text_to_image" | "image_edit" | "text_to_video" | "image_to_video") => ({
      moduleId: "generation.single-shot",
      providerId: "video-provider",
      modelId: "video-model",
      mode: taskKind === "image_to_video" ? "image-to-video" : "text-to-video",
    }));
    const handler = createGenerationPlanningHandler({ registry: videoRegistry, operations, defaultModelForTaskKind, now: () => "2026-08-23T00:00:00.000Z" });

    const created = await handler({ capability: "create", params: {
      operationId: "op-natural-video",
      prompt: "生成一段夜晚城市街道视频",
      parameters: { duration: 5 },
    }, lease }) as { operation: GenerationOperation };

    expect(created.operation.candidate).toMatchObject({ providerId: "video-provider", modelId: "video-model", mode: "text-to-video", parameters: { duration: 5 } });
    expect(defaultModelForTaskKind).toHaveBeenCalledWith("text_to_video");
  });

  it("promotes a prompt-only minute-scale video goal to the storyboard/multi-shot path", async () => {
    const operations = createInMemoryGenerationOperationStore();
    const planStoryboard = vi.fn((input: { projectId: string; scriptText: string; minimumShots?: number; targetDurationSeconds?: number }) => ({
      shots: Array.from({ length: 20 }, (_, index) => ({
        shotId: `shot-${index + 1}`,
        role: "shot" as const,
        prompt: `${input.scriptText}（镜头${index + 1}）`,
        durationSeconds: 15,
      })),
      targetDurationSeconds: input.targetDurationSeconds,
    }));
    const defaultModelForTaskKind = vi.fn((taskKind: "text_to_image" | "image_edit" | "text_to_video" | "image_to_video") => ({
      moduleId: "generation.single-shot",
      providerId: "video-provider",
      modelId: "video-model",
      mode: taskKind === "image_to_video" ? "image-to-video" : "text-to-video",
    }));
    const handler = createGenerationPlanningHandler({
      registry: videoRegistry,
      operations,
      planStoryboard,
      defaultModelForTaskKind,
      now: () => "2026-08-23T00:00:00.000Z",
    });

    const created = await handler({
      capability: "create",
      params: {
        operationId: "op-long-natural",
        prompt: "帮我做一个5分钟品牌视频",
        // This is one provider clip's duration, not the total movie length.
        parameters: { duration: 5 },
      },
      lease,
    }) as { operation: GenerationOperation; nextAction: string };

    expect(created.nextAction).toBe("preview");
    expect(planStoryboard).toHaveBeenCalledWith({
      projectId: "project-1",
      scriptText: "帮我做一个5分钟品牌视频",
      minimumShots: 2,
      targetDurationSeconds: 300,
    });
    expect(created.operation.shots).toHaveLength(20);
    expect(created.operation.shots?.reduce((sum, shot) => sum + Number(shot.candidate.parameters.duration || 0), 0)).toBe(300);
    expect(created.operation.shots?.[0]?.candidate.prompt).toBe("帮我做一个5分钟品牌视频（镜头1）");
    expect(defaultModelForTaskKind).toHaveBeenCalledTimes(20);
  });

  it("fails closed when a long-form planner omits per-shot durations", async () => {
    const operations = createInMemoryGenerationOperationStore();
    const planStoryboard = vi.fn(() => ({
      shots: [
        { shotId: "shot-1", role: "shot" as const, prompt: "开场" },
        { shotId: "shot-2", role: "shot" as const, prompt: "收束" },
      ],
    }));
    const handler = createGenerationPlanningHandler({
      registry: videoRegistry,
      operations,
      planStoryboard,
      defaultModelForTaskKind: () => ({
        moduleId: "generation.single-shot",
        providerId: "video-provider",
        modelId: "video-model",
        mode: "text-to-video",
      }),
      now: () => "2026-08-23T00:00:00.000Z",
    });

    await expect(handler({
      capability: "create",
      params: { operationId: "op-long-missing-duration", prompt: "帮我做一个5分钟品牌视频" },
      lease,
    })).rejects.toThrow(/未覆盖目标时长/);
    expect(operations.read("project-1", "op-long-missing-duration")).toBeNull();
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

  it("resolve runs a stateless plan pass: clamps out-of-range durations and never touches the operation store", async () => {
    const operations = createInMemoryGenerationOperationStore();
    const handler = createGenerationPlanningHandler({
      registry: videoRegistry,
      operations,
      videoModelCandidates: [{ provider: "apimart", modelKey: "doubao-seedance-2.5", label: "Seedance 2.5", archetype: SEEDANCE_2_5_APIMART_ARCHETYPE }],
      now: () => "2026-08-23T00:00:00.000Z",
    });

    const resolution = await handler({
      capability: "resolve",
      params: {
        shots: [
          { id: "s1", durationSec: 999, modelKey: "doubao-seedance-2.5", sceneAnchorId: "hall" },
          { id: "s2", durationSec: 5, sceneAnchorId: "hall" },
        ],
        goals: { allowAdvisoryMerge: true },
      },
      lease,
    }) as {
      nextAction: string;
      resolvedShots: Array<{ id: string; modelKey: string | null; issues: Array<{ code: string }> }>;
      mergeProposals: unknown[];
      splitProposals: unknown[];
      planIssues: Array<{ code: string }>;
    };

    expect(resolution.nextAction).toBe("create");
    expect(resolution.resolvedShots).toHaveLength(2);
    expect(resolution.resolvedShots[0]).toMatchObject({ id: "s1", modelKey: "doubao-seedance-2.5" });
    expect(Array.isArray(resolution.mergeProposals)).toBe(true);
    expect(Array.isArray(resolution.splitProposals)).toBe(true);
    // 999s 必然触发钳值/超限（任何真实单条上限都小于它）→ planIssues 至少一条不合法记录
    expect(resolution.planIssues.length).toBeGreaterThan(0);
    expect(resolution.planIssues.some((issue) => issue.code === "duration.overflow" || issue.code === "duration.clamped")).toBe(true);
    // stateless：resolve 不落任何 durable operation
    expect(await operations.read("project-1", "resolve-op")).toBeNull();
  });

  it("resolve is lease-free (GUI narrow IPC path): same advisory output with no lease, while other capabilities still fail-closed", async () => {
    const operations = createInMemoryGenerationOperationStore();
    const handler = createGenerationPlanningHandler({
      registry: videoRegistry,
      operations,
      videoModelCandidates: [{ provider: "apimart", modelKey: "doubao-seedance-2.5", label: "Seedance 2.5", archetype: SEEDANCE_2_5_APIMART_ARCHETYPE }],
      now: () => "2026-08-23T00:00:00.000Z",
    });

    // resolve 不传 lease（stateless advisory，无项目侧写）也走通。
    const leaseFree = await handler({
      capability: "resolve",
      params: { shots: [{ id: "s1", durationSec: 5, sceneAnchorId: "hall" }] },
    }) as { resolvedShots: unknown[]; mergeProposals: unknown[]; splitProposals: unknown[]; planIssues: unknown[]; nextAction: string };
    expect(leaseFree.nextAction).toBe("create");
    expect(leaseFree.resolvedShots).toHaveLength(1);

    // 其它 capability 没有 lease 仍必须 fail-closed（改 resolve 豁免不许放宽整把闸）。
    await expect(handler({ capability: "context", params: {} })).rejects.toThrow("A verified project lease is required");
    await expect(handler({ capability: "create", params: { prompt: "x" } })).rejects.toThrow("A verified project lease is required");
  });

  it("resolve 的输入解析走能力契约的 zod（单一生成点）：未知字段/空数组 fail-closed", async () => {
    const handler = createGenerationPlanningHandler({
      registry: videoRegistry,
      operations: createInMemoryGenerationOperationStore(),
      videoModelCandidates: [{ provider: "apimart", modelKey: "doubao-seedance-2.5", label: "Seedance 2.5", archetype: SEEDANCE_2_5_APIMART_ARCHETYPE }],
      now: () => "2026-08-23T00:00:00.000Z",
    });
    // .strict()：模型编出来的字段不会被默默吞掉
    await expect(handler({ capability: "resolve", params: { shots: [{ id: "s1", durationSec: 5, madeUpKey: 1 }] } }))
      .rejects.toThrow(/resolve input is invalid/);
    await expect(handler({ capability: "resolve", params: { shots: [] } })).rejects.toThrow(/resolve input is invalid/);
    await expect(handler({ capability: "resolve", params: { shots: [{ id: "s1" }] } })).rejects.toThrow(/resolve input is invalid/);
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
    const baseOperations = createInMemoryGenerationOperationStore();
    // Approval is intentionally owned by the Run/gate seam in production. This
    // fixture only projects the result of that seam back through `read`; it
    // must not add an `approve` method to the production operation store.
    const approval = { receiptId: undefined as string | undefined };
    const operations = {
      ...baseOperations,
      read(projectId: string, operationId: string) {
        const operation = baseOperations.read(projectId, operationId);
        return operation && approval.receiptId ? { ...operation, approvedReceiptId: approval.receiptId } : operation;
      },
    };
    const start = async (operation: GenerationOperation) => ({
      operationId: operation.operationId,
      state: "sealed",
      nextAction: "provider_not_configured",
    });
    const handler = createGenerationPlanningHandler({ registry, operations, start, now: () => "2026-08-23T00:00:00.000Z" });
    const created = await handler({ capability: "create", params: { candidate: candidate() }, lease });
    const operationId = (created as { operation: { operationId: string } }).operation.operationId;
    const preview = await handler({ capability: "preview", params: { operationId }, lease });
    operations.seal("project-1", operationId, (preview as { contract: never }).contract, "2026-08-23T00:00:00.000Z");
    approval.receiptId = "receipt-1";
    await expect(handler({ capability: "start", params: { operationId }, lease })).resolves.toMatchObject({ nextAction: "provider_not_configured" });
  });

  it("projects the node's @ mentions before the prompt is sealed into a contract", async () => {
    // A5 的入口级回归：@ 过参考图的镜头交给 Agent／外部 MCP 生成时，供应商此前收到的是字面
    // `@[asset:nomi-local%3A%2F%2F…]`。投影必须发生在**合同编译**这一刻——卡上给用户看的、
    // 密封进授权信封的、最后发给供应商的，是同一句话。
    const url = "nomi-local://project-1/assets/hero.png";
    const handler = createGenerationPlanningHandler({
      registry,
      operations: createInMemoryGenerationOperationStore(),
      now: () => "2026-08-23T00:00:00.000Z",
      resolveStoryboardReferenceUrl: () => url,
    });
    const created = await handler({ capability: "create", params: { candidate: candidate({
      mode: "image-to-image",
      prompt: `画面里 @[asset:${encodeURIComponent(url)}] 走过来`,
      references: [{ assetId: "hero", contentHash: "h".repeat(64), version: 1, kind: "image" }],
    }) }, lease }) as { operation: { operationId: string } };
    const preview = await handler({ capability: "preview", params: { operationId: created.operation.operationId }, lease }) as { contract: { prompt: string } };
    expect(preview.contract.prompt).toBe("画面里 @image1 走过来");
  });

  it("refuses to seal a mention it cannot project instead of leaking the marker", async () => {
    const url = "nomi-local://project-1/assets/hero.png";
    const handler = createGenerationPlanningHandler({
      registry,
      operations: createInMemoryGenerationOperationStore(),
      now: () => "2026-08-23T00:00:00.000Z",
    });
    const created = await handler({ capability: "create", params: { candidate: candidate({
      mode: "image-to-image",
      prompt: `画面里 @[asset:${encodeURIComponent(url)}] 走过来`,
      references: [{ assetId: "hero", contentHash: "h".repeat(64), version: 1, kind: "image" }],
    }) }, lease }) as { operation: { operationId: string } };
    await expect(handler({ capability: "preview", params: { operationId: created.operation.operationId }, lease }))
      .rejects.toThrow(/@ 内联引用/);
  });

  it("allows a submit-only provider while making recovery limits explicit", async () => {
    const operations = createInMemoryGenerationOperationStore();
    const handler = createGenerationPlanningHandler({
      registry: blockedRegistry,
      operations,
      resolveModelPricing: () => ({ cost: 0, enabled: true, specCosts: [] }),
      now: () => "2026-08-23T00:00:00.000Z",
    });
    const created = await handler({ capability: "create", params: { candidate: candidate({ providerId: "blocked-provider", modelId: "blocked-model" }) }, lease });
    const operationId = (created as { operation: { operationId: string } }).operation.operationId;
    await expect(handler({ capability: "preview", params: { operationId }, lease })).resolves.toMatchObject({ providerReady: true, providerCapabilityProfile: "submit_only", nextAction: "request_gate", providerCapabilitiesMissing: expect.arrayContaining(["query", "reconcile"]) });
    await expect(handler({ capability: "gate_request", params: { operationId }, lease })).resolves.toMatchObject({ nextAction: "confirm", providerCapabilityProfile: "submit_only", recoveryNotice: expect.stringContaining("核对") });
    expect((await operations.read("project-1", operationId))?.state).toBe("sealed");
  });

  // P4 S2: preview surfaces a per-shot pricing projection and gate_request carries the derived
  // maximumCost — both derived from the injected catalog pricing, never a hard-coded number.
  describe("P4 S2 pricing on preview + gate_request", () => {
    const resolveModelPricing = (providerId: string, modelId: string) =>
      providerId === "fixture-provider" && modelId === "fixture-model"
        ? { cost: 10, enabled: true, specCosts: [{ specKey: "aspectRatio:1:1", cost: 4, enabled: true }] }
        : undefined;

    it("projects a known per-shot price + total on preview without any provider call", async () => {
      const operations = createInMemoryGenerationOperationStore();
      const handler = createGenerationPlanningHandler({ registry, operations, resolveModelPricing, now: () => "2026-08-23T00:00:00.000Z" });
      const created = await handler({ capability: "create", params: { candidate: candidate() }, lease });
      const operationId = (created as { operation: { operationId: string } }).operation.operationId;
      const preview = await handler({ capability: "preview", params: { operationId }, lease }) as {
        pricing: { shots: Array<{ price: unknown; durationEstimate: unknown; degradations: unknown[] }>; total: unknown };
      };
      // base 10 + matched specCost 4 (aspectRatio:1:1) = 14.
      expect(preview.pricing.shots[0].price).toEqual({ known: true, amount: 14 });
      expect(preview.pricing.shots[0].durationEstimate).toEqual({ known: false });
      expect(preview.pricing.shots[0].degradations).toEqual([]);
      expect(preview.pricing.total).toEqual({ knownSubtotal: 14, unknownShotCount: 0, currency: "CNY" });
    });

    it("reports the price as unknown on preview when no pricing resolver is wired", async () => {
      const operations = createInMemoryGenerationOperationStore();
      const handler = createGenerationPlanningHandler({ registry, operations, now: () => "2026-08-23T00:00:00.000Z" });
      const created = await handler({ capability: "create", params: { candidate: candidate() }, lease });
      const operationId = (created as { operation: { operationId: string } }).operation.operationId;
      const preview = await handler({ capability: "preview", params: { operationId }, lease }) as {
        pricing: { shots: Array<{ price: unknown }>; total: unknown };
      };
      expect(preview.pricing.shots[0].price).toEqual({ known: false });
      expect(preview.pricing.total).toEqual({ knownSubtotal: 0, unknownShotCount: 1, currency: "CNY" });
    });

    it("projects every included video shot in a multi-shot preview before the gate", async () => {
      const operations = createInMemoryGenerationOperationStore();
      const handler = createGenerationPlanningHandler({
        registry,
        operations,
        resolveModelPricing,
        now: () => "2026-08-23T00:00:00.000Z",
      });
      await handler({
        capability: "create",
        params: {
          operationId: "op-preview-multi",
          shots: [
            { shotId: "shot-a", role: "shot", candidate: candidate({ candidateId: "cand-a", prompt: "雨夜推门" }) },
            { shotId: "shot-b", role: "shot", candidate: candidate({ candidateId: "cand-b", prompt: "货架对视" }) },
            { shotId: "shot-excluded", role: "shot", included: false, candidate: candidate({ candidateId: "cand-excluded", prompt: "不参与试拍" }) },
          ],
        },
        lease,
      });

      const preview = await handler({ capability: "preview", params: { operationId: "op-preview-multi" }, lease }) as {
        pricing: { shots: Array<{ shotId: string }>; total: unknown };
        nextAction: string;
      };

      expect(preview.pricing.shots.map((shot) => shot.shotId)).toEqual(["shot-a", "shot-b"]);
      expect(preview.pricing.total).toEqual({ knownSubtotal: 28, unknownShotCount: 0, currency: "CNY" });
      expect(preview.nextAction).toBe("request_gate");
    });

    it("puts the derived price into the receipt's maximumCost (no longer ¥0) with costKnown=true", async () => {
      const operations = createInMemoryGenerationOperationStore();
      const handler = createGenerationPlanningHandler({ registry, operations, resolveModelPricing, now: () => "2026-08-23T00:00:00.000Z" });
      const created = await handler({ capability: "create", params: { candidate: candidate() }, lease });
      const operationId = (created as { operation: { operationId: string } }).operation.operationId;
      await expect(handler({ capability: "gate_request", params: { operationId }, lease }))
        .resolves.toMatchObject({ maximumCost: 14, costKnown: true, currency: "CNY", nextAction: "confirm" });
    });

    // 2026-09-21 用户拍板：价格未知不许挡住生成（内置 204 个模型一条 pricing 都没有）。
    // 这条从前钉的是 `rejects generation_pricing_unknown`；今天钉的是「门照开、价照实说」。
    it("opens the gate for an unpriced model and reports the cost as unknown, never ¥0", async () => {
      const operations = createInMemoryGenerationOperationStore();
      const handler = createGenerationPlanningHandler({ registry, operations, now: () => "2026-08-23T00:00:00.000Z" });
      const created = await handler({ capability: "create", params: { candidate: candidate() }, lease });
      const operationId = (created as { operation: { operationId: string } }).operation.operationId;
      const gate = await handler({ capability: "gate_request", params: { operationId }, lease }) as
        { maximumCost: number | null; costKnown: boolean; unknownShotCount?: number; nextAction: string };
      expect(gate).toMatchObject({ maximumCost: null, costKnown: false, unknownShotCount: 1, nextAction: "confirm" });
      // 绝不把「算不出」写成 0：这是三种可能里唯一会被读成「这次免费」的那一种。
      expect(gate.maximumCost).not.toBe(0);
      expect((await operations.read("project-1", operationId))?.state).toBe("sealed");
    });
  });

  // P4 S4: gate_request builds the REAL display.shots for a multi-shot operation (the assembly the S3a
  // card was waiting on). A single-shot op still gets the flat card (no `shots`), so the 14/14 E2E holds.
  describe("P4 S4 multi-shot gate_request assembly (real display.shots)", () => {
    const resolveModelPricing = (providerId: string, modelId: string) =>
      providerId === "fixture-provider" && modelId === "fixture-model"
        ? { cost: 6, enabled: true, specCosts: [] }
        : undefined;

    /** A store whose operation carries multi-shot `shots` (anchor + 2 video shots), already sealed. */
    function multiShotStore() {
      const sealedContract = { schemaVersion: 1 as const, candidateId: "candidate-1", candidateRevision: 1, moduleId: "generation.single-shot", moduleVersion: "1.0.0", providerId: "fixture-provider", modelId: "fixture-model", mode: "text-to-image", prompt: "p", parameters: { aspectRatio: "1:1" }, references: [], contractHash: "hash-top", warnings: [], droppedFields: [] };
      const shotContract = (id: string, hash: string, prompt: string) => ({ ...sealedContract, candidateId: id, prompt, contractHash: hash });
      const shots = [
        { shotId: "anchor-1", role: "anchor" as const, candidate: { ...candidate({ candidateId: "cand-anchor", prompt: "主角 阿雨 定妆" }) }, contract: shotContract("cand-anchor", "hash-anchor", "主角 阿雨 定妆") },
        { shotId: "shot-a", candidate: { ...candidate({ candidateId: "cand-a", prompt: "雨夜推门", parameters: { aspectRatio: "1:1", duration: 15 } }) }, contract: shotContract("cand-a", "hash-a", "雨夜推门") },
        { shotId: "shot-b", candidate: { ...candidate({ candidateId: "cand-b", prompt: "货架对视", parameters: { aspectRatio: "1:1", duration: 15 } }) }, contract: shotContract("cand-b", "hash-b", "货架对视") },
      ];
      const operation = { operationId: "op-multi", projectId: "project-1", candidate: candidate(), state: "sealed" as const, contract: sealedContract, shots, planHash: "plan-hash-x", planVersion: 3, updatedAt: "2026-08-23T00:00:00.000Z" };
      return {
        create: () => operation,
        read: () => operation,
        patch: () => operation,
        seal: () => operation,
        approve: () => ({ ...operation, approvedReceiptId: "r" }),
        cancel: () => ({ ...operation, state: "cancelled" as const }),
        present: () => operation,
        dismiss: () => ({ ...operation, cardHidden: true }),
      };
    }

    it("returns a serializable display.shots with per-shot rows + anchor chips + plan-level cost", async () => {
      const handler = createGenerationPlanningHandler({ registry, operations: multiShotStore(), resolveModelPricing, now: () => "2026-08-23T00:00:00.000Z" });
      const result = await handler({ capability: "gate_request", params: { operationId: "op-multi" }, lease }) as {
        shots?: { shots: Array<{ shotId: string; index: number; price: unknown }>; anchorChips?: unknown[]; planHash?: string; hardLimit?: number; specs?: { shotCount: number; durationSeconds?: number } };
        maximumCost: number;
        costScope: string;
        contractHash: string;
      };
      expect(result.shots).toBeDefined();
      // Two video shots on the card (the anchor rides as a chip, not a row).
      expect(result.shots?.shots.map((s) => s.shotId)).toEqual(["shot-a", "shot-b"]);
      expect(result.shots?.shots[0]).toMatchObject({ index: 1, price: { known: true, amount: 6 } });
      expect(result.shots?.specs).toMatchObject({ shotCount: 2, durationSeconds: 30 });
      expect(result.shots?.anchorChips).toHaveLength(1);
      // Plan-level cost = 2 video shots (¥6 each) + 1 anchor (¥6) = ¥18; receipt keyed on the plan hash.
      expect(result.maximumCost).toBe(18);
      expect(result.contractHash).toBe("plan-hash-x");
      expect(result.costScope).toBe("generation.multi-shot:op-multi");
      expect(() => JSON.stringify(result.shots)).not.toThrow();
    });
  });

  // P4 S6.5 生产入口 — the REAL create-with-shots entrance over the in-memory store (proves the entrance
  // itself builds draft.shots then seals per-shot sub-contracts + planHash; the durable full-chain is in
  // mcpMultiShotCreateEntrance.e2e.test.ts). Complements the S4 block above which pre-seals a store.
  describe("P4 S6.5 multi-shot create entrance", () => {
    const resolveModelPricing = (providerId: string, modelId: string) =>
      providerId === "fixture-provider" && modelId === "fixture-model" ? { cost: 6, enabled: true, specCosts: [] } : undefined;

    function shotFrom(shotId: string, prompt: string, role?: "anchor" | "shot") {
      return { shotId, ...(role ? { role } : {}), candidate: candidate({ candidateId: `cand-${shotId}`, prompt }) };
    }

    it("create({shots}) persists draft shots and gate_request seals a real multi-shot bundle (sub-contracts + planHash)", async () => {
      const operations = createInMemoryGenerationOperationStore();
      const handler = createGenerationPlanningHandler({ registry, operations, resolveModelPricing, now: () => "2026-08-23T00:00:00.000Z" });
      const created = await handler({ capability: "create", params: { operationId: "op-e", shots: [
        shotFrom("anchor-1", "主角 阿雨 定妆", "anchor"),
        shotFrom("shot-a", "雨夜推门", "shot"),
        shotFrom("shot-b", "货架对视", "shot"),
      ] }, lease }) as { operation: { operationId: string; shots?: unknown[] }; nextAction: string };
      expect(created.nextAction).toBe("preview");
      expect(created.operation.shots).toHaveLength(3);

      await handler({ capability: "preview", params: { operationId: "op-e" }, lease });
      const gate = await handler({ capability: "gate_request", params: { operationId: "op-e" }, lease }) as {
        shots?: { shots: Array<{ shotId: string }>; anchorChips?: unknown[] }; maximumCost: number; costScope: string; contractHash: string; nextAction: string;
      };
      expect(gate.nextAction).toBe("confirm");
      // 2 video shots on the card, anchor as a chip; plan-level cost = 3 × ¥6 = ¥18.
      expect(gate.shots?.shots.map((s) => s.shotId)).toEqual(["shot-a", "shot-b"]);
      expect(gate.shots?.anchorChips).toHaveLength(1);
      expect(gate.maximumCost).toBe(18);
      expect(gate.costScope).toBe("generation.multi-shot:op-e");
      // The sealed operation now carries per-shot sub-contracts (candidate.sealedContractHash set).
      const sealed = await operations.read("project-1", "op-e") as { shots?: Array<{ shotId: string; contract?: { contractHash: string }; candidate: { sealedContractHash?: string } }>; planHash?: string };
      expect(sealed.shots).toBeDefined();
      const videoShot = sealed.shots!.find((s) => s.shotId === "shot-a");
      expect(videoShot?.contract?.contractHash).toBeTruthy();
      expect(videoShot?.candidate.sealedContractHash).toBe(videoShot?.contract?.contractHash);
      expect(gate.contractHash).toBe(sealed.planHash); // multi-shot receipt keyed on the plan hash
    });

    it("an excluded shot carries no sub-contract and drops off the card (试拍/分批)", async () => {
      const operations = createInMemoryGenerationOperationStore();
      const handler = createGenerationPlanningHandler({ registry, operations, resolveModelPricing, now: () => "2026-08-23T00:00:00.000Z" });
      await handler({ capability: "create", params: { operationId: "op-x", shots: [
        shotFrom("shot-a", "雨夜推门", "shot"),
        { ...shotFrom("shot-b", "货架对视", "shot"), included: false },
      ] }, lease });
      await handler({ capability: "preview", params: { operationId: "op-x" }, lease });
      const gate = await handler({ capability: "gate_request", params: { operationId: "op-x" }, lease }) as { shots?: { shots: Array<{ shotId: string }> }; maximumCost: number };
      expect(gate.shots?.shots.map((s) => s.shotId)).toEqual(["shot-a"]); // only the included shot
      expect(gate.maximumCost).toBe(6); // one included shot's price
      const sealed = await operations.read("project-1", "op-x") as { shots?: Array<{ shotId: string; contract?: unknown }> };
      expect(sealed.shots?.find((s) => s.shotId === "shot-b")?.contract).toBeUndefined();
    });

    it("scriptText uses the persisted task default when the planner omits model fields", async () => {
      const operations = createInMemoryGenerationOperationStore();
      const planStoryboard = vi.fn(() => ({
        shots: [{ shotId: "shot-default", role: "shot" as const, prompt: "按设置的默认模型生成" }],
      }));
      const defaultModelForTaskKind = vi.fn((taskKind: "text_to_video" | "image_to_video" | "text_to_image" | "image_edit") => ({
        moduleId: "generation.single-shot",
        providerId: "video-provider",
        modelId: "video-model",
        mode: taskKind === "image_to_video" ? "image-to-video" : "text-to-video",
      }));
      const handler = createGenerationPlanningHandler({
        registry: videoRegistry,
        operations,
        planStoryboard,
        defaultModelForTaskKind,
        now: () => "2026-08-23T00:00:00.000Z",
      });
      const created = await handler({ capability: "create", params: { operationId: "op-default", scriptText: "一个短镜头" }, lease }) as {
        operation: { shots: Array<{ candidate: { providerId: string; modelId: string; mode: string } }> };
      };
      expect(defaultModelForTaskKind).toHaveBeenCalledWith("text_to_video");
      expect(created.operation.shots[0]?.candidate).toMatchObject({ providerId: "video-provider", modelId: "video-model", mode: "text-to-video" });
    });
  });

  // J05 — plan patch model-change 应返回 changeset（modelChanged+previousModel+nextModel），
  // 让调用方知道哪些字段被静默重置。今天返回 {operation, nextAction:"preview"} 无 changeset → 红灯。
  describe("J05 plan patch changeset on model switch", () => {
    it("returns changeset.modelChanged when the model changes", async () => {
      const operations = createInMemoryGenerationOperationStore();
      const registry2 = createModuleRegistry([{
        moduleId: "generation.single-shot",
        version: "1.0.0",
        inputKinds: ["text", "image"],
        outputKinds: ["image"],
        modes: ["text-to-image"],
        parameterSchema: { aspectRatio: { type: "enum", enum: ["1:1", "16:9"] } },
        assetInputSchema: { references: { kind: "image", max: 4 } },
        providers: [
          {
            providerId: "fixture-provider",
            models: [{ modelId: "model-a", modes: ["text-to-image"], parameterSchema: { seed: { type: "integer" } }, capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true } }],
          },
          {
            providerId: "fixture-provider",
            models: [{ modelId: "model-b", modes: ["text-to-image"], parameterSchema: {}, capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true } }],
          },
        ],
      }]);
      const handler = createGenerationPlanningHandler({ registry: registry2, operations, now: () => "2026-09-03T00:00:00.000Z" });
      // Create with model-a (may have variantId later)
      await handler({ capability: "create", params: { operationId: "op-j05", prompt: "test prompt", providerId: "fixture-provider", modelId: "model-a", mode: "text-to-image", moduleId: "generation.single-shot" }, lease });
      // Patch to model-b (different model → should emit changeset)
      const patched = await handler({ capability: "plan", params: { operationId: "op-j05", patch: { providerId: "fixture-provider", modelId: "model-b" } }, lease }) as {
        operation: object;
        nextAction: string;
        changeset?: { modelChanged: boolean; previousModel: string; nextModel: string };
      };
      expect(patched.nextAction).toBe("preview");
      // J05 red light: today this will be undefined; after fix it should be present
      expect(patched.changeset).toBeDefined();
      expect(patched.changeset?.modelChanged).toBe(true);
      expect(patched.changeset?.previousModel).toBe("fixture-provider/model-a");
      expect(patched.changeset?.nextModel).toBe("fixture-provider/model-b");
    });

    it("returns no changeset when only the prompt changes (no model switch)", async () => {
      const operations = createInMemoryGenerationOperationStore();
      const handler = createGenerationPlanningHandler({ registry, operations, now: () => "2026-09-03T00:00:00.000Z" });
      await handler({ capability: "create", params: { operationId: "op-j05-noop", prompt: "first", providerId: "fixture-provider", modelId: "fixture-model", mode: "text-to-image", moduleId: "generation.single-shot" }, lease });
      const patched = await handler({ capability: "plan", params: { operationId: "op-j05-noop", patch: { prompt: "changed prompt" } }, lease }) as {
        changeset?: unknown;
      };
      expect(patched.changeset).toBeUndefined();
    });
  });

  // J06 — coldstartEtaForGate 应产出区间（waitSeconds/waitSecondsHigh/etaBasis='coldstart'）
  // 而不是硬编码 40 秒或 180 秒点值。
  describe("J06 coldstartEtaForGate — ETA range instead of hardcoded 40/180s", () => {
    it("video kind returns waitSecondsHigh > waitSeconds, both > 0, etaBasis=coldstart", () => {
      const eta = coldstartEtaForGate(["video"], 1);
      expect(eta.etaBasis).toBe("coldstart");
      expect(eta.waitSeconds).toBeGreaterThan(0);
      expect(eta.waitSecondsHigh).toBeGreaterThan(eta.waitSeconds);
      // video must be honest: at least 3 minutes (180s); 40s was the fake value
      expect(eta.waitSeconds).toBeGreaterThan(40);
    });

    it("video kind scales linearly with shotCount", () => {
      const single = coldstartEtaForGate(["video"], 1);
      const four = coldstartEtaForGate(["video"], 4);
      expect(four.waitSeconds).toBe(single.waitSeconds * 4);
      expect(four.waitSecondsHigh).toBe(single.waitSecondsHigh * 4);
    });

    it("uses scheduler concurrency as rounds instead of summing every task", () => {
      const eta = coldstartEtaForGate(["video"], 8, 6);
      expect(eta.waitSeconds).toBe(480);
      expect(eta.waitSecondsHigh).toBe(1200);
      expect(eta.waitSeconds).toBeLessThan(240 * 8);
    });

    it("image kind is faster than video", () => {
      const videoEta = coldstartEtaForGate(["video"], 1);
      const imageEta = coldstartEtaForGate(["image"], 1);
      expect(imageEta.waitSeconds).toBeLessThan(videoEta.waitSeconds);
    });

    it("mixed kinds with video present picks video as primary", () => {
      const eta = coldstartEtaForGate(["image", "video"], 1);
      const videoEta = coldstartEtaForGate(["video"], 1);
      expect(eta.waitSeconds).toBe(videoEta.waitSeconds);
    });

    it("unknown kind falls back gracefully without throwing", () => {
      const eta = coldstartEtaForGate(["hologram"], 2);
      expect(eta.etaBasis).toBe("coldstart");
      expect(eta.waitSeconds).toBeGreaterThan(0);
      expect(eta.waitSecondsHigh).toBeGreaterThan(eta.waitSeconds);
    });
  });
});

// 2026-09-18 单一账本：Agent 改多镜草稿里的一镜走 Run 账本（shots[i].candidate），不碰顶层候选、不碰其它镜。
describe("plan patch addressed to one shot of a multi-shot draft", () => {
  function shotFrom(shotId: string, prompt: string, title?: string) {
    return { shotId, role: "shot" as const, ...(title ? { title } : {}), candidate: candidate({ candidateId: `cand-${shotId}`, prompt }) };
  }

  it("changes only that shot's candidate and reports the changeset against that shot", async () => {
    const operations = createInMemoryGenerationOperationStore();
    const handler = createGenerationPlanningHandler({ registry, operations, now: () => "2026-09-18T00:00:00.000Z" });
    await handler({ capability: "create", params: { operationId: "op-shot", shots: [shotFrom("shot-1", "一", "开场"), shotFrom("shot-2", "二", "转折"), shotFrom("shot-3", "三")] }, lease });
    const result = await handler({ capability: "plan", params: { operationId: "op-shot", shotId: "shot-2", patch: { prompt: "逆光侧脸" } }, lease }) as { operation: GenerationOperation; changeset?: unknown };
    expect(result.changeset).toBeUndefined();
    expect(result.operation.shots?.map((shot) => shot.candidate.prompt)).toEqual(["一", "逆光侧脸", "三"]);
    expect(result.operation.candidate.prompt).toBe("一");
    // 信封整只搬：模型拟的标题不许死在草稿店的 create 里（它曾是逐字段手写、没列 title）。
    expect(result.operation.shots?.map((shot) => shot.title ?? null)).toEqual(["开场", "转折", null]);
  });

  it("rejects an unknown shotId instead of silently patching the top-level candidate", async () => {
    const operations = createInMemoryGenerationOperationStore();
    const handler = createGenerationPlanningHandler({ registry, operations, now: () => "2026-09-18T00:00:00.000Z" });
    await handler({ capability: "create", params: { operationId: "op-shot", shots: [shotFrom("shot-1", "一"), shotFrom("shot-2", "二")] }, lease });
    await expect(handler({ capability: "plan", params: { operationId: "op-shot", shotId: "shot-9", patch: { prompt: "x" } }, lease })).rejects.toThrow(/shot-9/);
    const after = await operations.read("project-1", "op-shot");
    expect(after?.shots?.map((shot) => shot.candidate.prompt)).toEqual(["一", "二"]);
  });
});

it('a document-admitted draft saves its author body into that document\'s plan, keeping the draft id as the plan id', async () => {
  const operations=createInMemoryGenerationOperationStore()
  const saved:Array<{op:string;payload:Record<string,unknown>}>=[]
  const requestRenderer=async(op:string,payload:unknown)=>{saved.push({op,payload:payload as Record<string,unknown>});return {status:'saved',designId:(payload as {designId:string}).designId}}
  const handler=createGenerationPlanningHandler({registry,operations,requestRenderer})
  const authored={anchorIds:[]}
  const input={candidate:{candidateId:'execution-id',revision:1,moduleId:'generation.single-shot',providerId:'fixture-provider',modelId:'fixture-model',mode:'text-to-image',prompt:'Original',parameters:{},references:[]},storyboard:authored}
  for(const multi of [false,true]){
    saved.length=0
    const result=await handler({capability:'create',lease,origin:{host:'nomi',sourceDocument:{documentId:'doc',revision:1,contentHash:'hash'}},params:{operation:'create',...(multi ? {shots:[{...input,shotId:'execution-id'}]} : input)}}) as {operation:GenerationOperation}
    expect(saved).toHaveLength(1)
    expect(saved[0].op).toBe('storyboard.upsert-design')
    expect(saved[0].payload.designId).toBe(result.operation.operationId)
    expect(saved[0].payload.documentId).toBe('doc')
    const plan=saved[0].payload.plan as {shots:Array<{shotId:string;prompt:string}>}
    expect(plan.shots[0].shotId).toBe('execution-id')
    expect(plan.shots[0].prompt).toBe('Original')
    // The Run keeps no second copy of the author body — the document's plan is the only one.
    expect(result.operation).not.toHaveProperty('editorial')
    expect(result.operation.sourceDocumentId).toBe('doc')
  }
})

it('refuses a document-admitted draft when the renderer that owns plans is unreachable', async () => {
  const operations=createInMemoryGenerationOperationStore()
  const handler=createGenerationPlanningHandler({registry,operations})
  await expect(handler({capability:'create',lease,origin:{host:'nomi',sourceDocument:{documentId:'doc',revision:1,contentHash:'hash'}},
    params:{operation:'create',candidate:{candidateId:'c',revision:1,moduleId:'generation.single-shot',providerId:'fixture-provider',modelId:'fixture-model',mode:'text-to-image',prompt:'Original',parameters:{},references:[]}}}))
    .rejects.toThrow('storyboard_renderer_required')
})
