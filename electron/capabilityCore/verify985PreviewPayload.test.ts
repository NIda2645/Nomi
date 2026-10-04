import { describe, expect, it, vi } from "vitest";

import { createCatalogGenerationProvider as createProvider } from "./apimartGenerationProvider";
import type { CatalogState } from "../catalog/types";
import { APIMART_IMAGE_MODELS } from "../catalog/apimartImages";
import { APIMART_VIDEO_MODELS } from "../catalog/apimartVideos";
import { APIMART_IMAGE_QUERY_OP, APIMART_STATUS_MAPPING, APIMART_VENDOR_SEED, APIMART_VIDEO_QUERY_OP } from "../catalog/apimartVendor";
import { registerRequestTransform } from "../tasks/requestTransforms";
import { spendReferenceKey } from "../shared/contracts/pendingSpendConfirm";

/** 授权时封存的那份 URL 快照，键就是付费卡上那一条参考的身份。 */
function approvedUrls(entries: ReadonlyArray<readonly [Record<string, unknown>, string]>): Record<string, string> {
  return Object.fromEntries(entries.map(([reference, url]) =>
    [spendReferenceKey(reference as Parameters<typeof spendReferenceKey>[0]), url]));
}

function catalogFixture(overrides: Partial<CatalogState> = {}): CatalogState {
  const now = "now";
  const models = [
    ...APIMART_IMAGE_MODELS.map((model) => ({
      modelKey: model.modelKey,
      vendorKey: "apimart" as const,
      labelZh: model.labelZh,
      kind: "image" as const,
      enabled: true,
      meta: { archetypeId: model.archetypeId },
      createdAt: now,
      updatedAt: now,
    })),
    ...APIMART_VIDEO_MODELS.map((model) => ({
      modelKey: model.modelKey,
      vendorKey: "apimart" as const,
      labelZh: model.labelZh,
      kind: "video" as const,
      enabled: true,
      meta: { archetypeId: model.archetypeId },
      createdAt: now,
      updatedAt: now,
    })),
  ];
  const mappings = [
    ...APIMART_IMAGE_MODELS.flatMap((model) => model.mappings.map((mapping) => ({
      ...mapping,
      vendorKey: "apimart" as const,
      modelKey: model.modelKey,
      enabled: true,
      query: APIMART_IMAGE_QUERY_OP,
      statusMapping: APIMART_STATUS_MAPPING,
      createdAt: now,
      updatedAt: now,
    }))),
    ...APIMART_VIDEO_MODELS.flatMap((model) => model.mappings.map((mapping) => ({
      ...mapping,
      vendorKey: "apimart" as const,
      modelKey: model.modelKey,
      enabled: true,
      query: APIMART_IMAGE_QUERY_OP,
      statusMapping: APIMART_STATUS_MAPPING,
      createdAt: now,
      updatedAt: now,
    }))),
  ];
  return {
    version: 11,
    vendors: [{
      key: "apimart",
      name: APIMART_VENDOR_SEED.name,
      enabled: true,
      baseUrlHint: APIMART_VENDOR_SEED.baseUrl,
      authType: APIMART_VENDOR_SEED.authType,
      authHeader: APIMART_VENDOR_SEED.authHeader,
      createdAt: "now",
      updatedAt: "now",
    }],
    models,
    mappings,
    apiKeysByVendor: {},
    ...overrides,
  };
}

function dualModeCatalogFixture(): CatalogState {
  const base = catalogFixture();
  const sharedModels: CatalogState["models"] = [
    { modelKey: "shared-model", vendorKey: "apimart", labelZh: "Shared", kind: "image", enabled: true, meta: { archetypeId: "shared", adapter: { state: "verified", activeRevision: "fixture", modes: [{ taskKind: "text_to_image", state: "verified" }] } }, createdAt: "now", updatedAt: "now" },
    { modelKey: "shared-model", vendorKey: "apimart", labelZh: "Shared", kind: "video", enabled: true, meta: { archetypeId: "shared", adapter: { state: "verified", activeRevision: "fixture", modes: [{ taskKind: "text_to_video", state: "verified" }] } }, createdAt: "now", updatedAt: "now" },
  ];
  const sharedMappings: CatalogState["mappings"] = [
    { id: "shared-image", vendorKey: "apimart", modelKey: "shared-model", taskKind: "text_to_image", name: "Shared image", enabled: true, create: { method: "POST", path: "/v1/images/generations", body: { model: "{{model.modelKey}}", prompt: "{{request.prompt}}" }, response_mapping: { task_id: "data.0.task_id" } }, query: APIMART_IMAGE_QUERY_OP, createdAt: "now", updatedAt: "now" },
    { id: "shared-video", vendorKey: "apimart", modelKey: "shared-model", taskKind: "text_to_video", name: "Shared video", enabled: true, create: { method: "POST", path: "/v1/videos/generations", body: { model: "{{model.modelKey}}", prompt: "{{request.prompt}}" }, response_mapping: { task_id: "data.0.task_id" } }, query: APIMART_IMAGE_QUERY_OP, createdAt: "now", updatedAt: "now" },
  ];
  return { ...base, models: sharedModels, mappings: sharedMappings };
}

/**
 * 一家**用户自己接的**供应商（非内置 direct-key）：`Authorization: Key <k>` 的方案词、
 * 自己的 base、自己的轮询路径。BL-1 的整条判据就是靠它证明「执行器与供应商无关」。
 */
function acmeCatalog(): CatalogState {
  const base = catalogFixture();
  return {
    ...base,
    vendors: [
      ...base.vendors,
      { key: "acme", name: "Acme", enabled: true, baseUrlHint: "https://acme.example", authType: "bearer", authHeader: "Authorization", authScheme: "Key", createdAt: "now", updatedAt: "now" },
    ],
    models: [
      ...base.models,
      { vendorKey: "acme", modelKey: "acme-image", kind: "image", enabled: true, labelZh: "Acme 图", createdAt: "now", updatedAt: "now" },
    ],
    mappings: [
      ...base.mappings,
      {
        id: "acme-text_to_image", vendorKey: "acme", modelKey: "acme-image", taskKind: "text_to_image",
        name: "Acme 文生图", enabled: true,
        create: { method: "POST", path: "/v2/jobs", body: { model: "{{model.modelKey}}", prompt: "{{request.prompt}}" }, response_mapping: { task_id: "id" } },
        query: { method: "GET", path: "/v2/jobs/{{providerMeta.task_id}}", response_mapping: { status: "status" } },
        createdAt: "now", updatedAt: "now",
      },
    ],
    apiKeysByVendor: { ...base.apiKeysByVendor },
  } as CatalogState;
}

function createApimartGenerationProvider(options: Omit<Parameters<typeof createProvider>[0], "vendorKey"> & { vendorKey?: string; catalogReader?: () => CatalogState }) {
  return createProvider({ vendorKey: "apimart", catalogReader: () => catalogFixture(), ...options });
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    moduleId: "generation.single-shot",
    providerId: "apimart",
    modelId: "gpt-image-2",
    mode: "text-to-image",
    prompt: "a red paper crane",
    parameters: { aspectRatio: "1:1", resolution: "1K" },
    references: [],
    contractHash: "a".repeat(64),
    idempotencyKey: "stable-nomi-key",
    requestFingerprint: "b".repeat(64),
    executionBinding: {
      immutableProjectUuid: "project-1",
      projectGeneration: 1,
      runId: "run-1",
      shotId: "shot-1",
      contractHash: "a".repeat(64),
      runtimeTaskId: "runtime-1",
      providerNamespace: "apimart",
      providerIdempotencyKey: "stable-nomi-key",
      requestFingerprint: "b".repeat(64),
      runtimeEnvelopeRef: ".nomi/runs/run-1/runtime.json",
      fencingEpoch: 1,
    },
    ...overrides,
    ...overrides,
  };
}

import { pinAssetReference } from "./semanticGenerationCandidate";

describe("V-3b: where does a 3D-BOX preview mp4 land in the sealed provider body", () => {
  const provider = () => createApimartGenerationProvider({ resolveConnection: () => ({ apiKey: "test-key" }), fetchImpl: vi.fn() });
  const URL = "https://cdn.example/preview.mp4";
  const body = (reference: Record<string, unknown>, modeId = "omni") => provider().buildRequest(input({
    modelId: "doubao-seedance-2.0", mode: "image_to_video", modeId, references: [reference],
    referenceUrls: approvedUrls([[reference, URL]]), parameters: { duration: 5 },
  })) as Record<string, unknown>;

  it("what draft_shots really stores: model gives only assetId, host pins hash+version (no kind)", () => {
    const pinned = pinAssetReference({ assetId: "asset-pre" }, () => ({ contentHash: "a".repeat(64), version: 1 })) as Record<string, unknown>;
    console.log("PINNED_REFERENCE", JSON.stringify(pinned))
    expect(pinned.kind).toBeUndefined();
    const b = body(pinned);
    console.log("BODY_WITHOUT_KIND", JSON.stringify(b))
    // The video must be in the video channel. If it is only in an image channel, the preview was NOT sent as a reference video.
    expect(JSON.stringify(b.video_urls ?? b.videoUrls ?? null)).toContain("preview.mp4");
  });

  it("control: same reference with kind=video lands in the video channel", () => {
    const b = body({ assetId: "asset-pre", contentHash: "a".repeat(64), version: 1, kind: "video" });
    console.log("BODY_WITH_KIND_VIDEO", JSON.stringify(b))
    expect(JSON.stringify(b.video_urls ?? null)).toContain("preview.mp4");
  });
});
