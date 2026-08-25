import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogState, Model, Vendor } from "../catalog/types";

const now = "2026-08-15T00:00:00.000Z";
let state: CatalogState;

const upsertVendor = vi.fn((raw: Partial<Vendor> & Pick<Vendor, "key" | "name" | "enabled">): Vendor => ({
  baseUrlHint: null,
  createdAt: now,
  updatedAt: now,
  ...raw,
}));
const upsertModel = vi.fn((raw: Omit<Model, "createdAt" | "updatedAt">): Model => ({
  createdAt: now,
  updatedAt: now,
  ...raw,
}));
const upsertApiKey = vi.fn();
const deleteApiKey = vi.fn();

vi.mock("../catalog/catalogStore", () => ({
  readCatalog: () => structuredClone(state),
  mutateCatalog: <T>(fn: (tx: unknown) => T): T => fn({
    upsertVendor,
    upsertModel,
    upsertApiKey,
    deleteApiKey,
  }),
  extractVendorExtraHeaders: () => undefined,
  normalizeProviderKind: (value: unknown) => value || "openai-compatible",
}));

const { defaultCatalog } = await import("./serviceCatalog");

function emptyState(): CatalogState {
  return {
    version: 8,
    vendors: [],
    models: [],
    mappings: [],
    apiKeysByVendor: {},
  };
}

describe("provider adapter registration catalog", () => {
  beforeEach(() => {
    state = emptyState();
    vi.clearAllMocks();
  });

  it("stores the vendor and encrypted credential without inventing a model", () => {
    defaultCatalog.register({
      vendorKey: "saved-gateway",
      vendorName: "Saved Gateway",
      baseUrl: "https://gateway.example.test/v1",
      apiKey: "sk-encrypt-me",
      authType: "bearer",
      providerKind: "openai-compatible",
      models: [],
      savedAt: now,
    });

    expect(upsertVendor).toHaveBeenCalledWith(expect.objectContaining({
      key: "saved-gateway",
      enabled: true,
    }));
    expect(upsertApiKey).toHaveBeenCalledWith("saved-gateway", {
      apiKey: "sk-encrypt-me",
      enabled: true,
    });
    expect(upsertModel).not.toHaveBeenCalled();
  });

  it("enables only new text models and marks every new model as manually added and unverified", () => {
    const kinds = ["text", "image", "video", "audio", "model3d"] as const;
    const models = Array.from({ length: 20 }, (_, index) => ({
      modelKey: `model-${index + 1}`,
      labelZh: `Model ${index + 1}`,
      kind: kinds[index % kinds.length],
    }));

    defaultCatalog.register({
      vendorKey: "generic-gateway",
      vendorName: "Generic Gateway",
      baseUrl: "https://gateway.example.test/v1",
      apiKey: "sk-encrypt-me",
      authType: "bearer",
      providerKind: "openai-compatible",
      models,
      savedAt: now,
    });

    expect(upsertVendor).toHaveBeenCalledWith(expect.objectContaining({
      key: "generic-gateway",
      enabled: true,
    }));
    expect(upsertApiKey).toHaveBeenCalledWith("generic-gateway", {
      apiKey: "sk-encrypt-me",
      enabled: true,
    });
    expect(upsertModel).toHaveBeenCalledTimes(20);
    for (const [written] of upsertModel.mock.calls) {
      expect(written).toMatchObject({
        enabled: written.kind === "text",
        onboarding: { addedVia: "manual", addedAt: now, fields: [] },
        meta: {
          adapter: {
            state: "unverified",
            modes: [],
            updatedAt: now,
          },
        },
      });
      expect((written.meta as { adapter: Record<string, unknown> }).adapter).not.toHaveProperty("runId");
    }
  });

  it("keeps an existing encrypted credential when main requests credential preservation", () => {
    state = {
      ...emptyState(),
      vendors: [{
        key: "saved-gateway",
        name: "Saved Gateway",
        enabled: true,
        baseUrlHint: "https://gateway.example.test/v1",
        authType: "bearer",
        createdAt: now,
        updatedAt: now,
      }],
      apiKeysByVendor: {
        "saved-gateway": {
          vendorKey: "saved-gateway",
          apiKey: "encrypted-record",
          enabled: true,
          enc: "safeStorage",
          createdAt: now,
          updatedAt: now,
        },
      },
    };

    defaultCatalog.register({
      catalogVendorKey: "saved-gateway",
      vendorKey: "saved-gateway",
      vendorName: "Saved Gateway",
      baseUrl: "https://gateway.example.test/v1",
      apiKey: "",
      authType: "bearer",
      providerKind: "openai-compatible",
      preserveExistingCredential: true,
      models: [{ modelKey: "new-image", kind: "image" }],
      savedAt: now,
    });

    expect(upsertApiKey).not.toHaveBeenCalled();
    expect(deleteApiKey).not.toHaveBeenCalled();
    expect(upsertModel).toHaveBeenCalledWith(expect.objectContaining({
      modelKey: "new-image",
      enabled: false,
      onboarding: { addedVia: "manual", addedAt: now, fields: [] },
      meta: expect.objectContaining({
        adapter: expect.objectContaining({ state: "unverified" }),
      }),
    }));
  });

  it("preserves executable existing models and their adapter, mapping, and custom-call capability", () => {
    const oldAdapter = {
      state: "verified",
      runId: "run-old",
      activeRevision: "revision-old",
      modes: [{ taskKind: "text_to_image", state: "verified", attempts: 1 }],
      updatedAt: "2026-08-14T00:00:00.000Z",
    };
    state = {
      ...emptyState(),
      vendors: [{
        key: "saved-gateway",
        name: "Saved Gateway",
        enabled: true,
        baseUrlHint: "https://gateway.example.test/v1",
        authType: "bearer",
        createdAt: now,
        updatedAt: now,
      }],
      models: [
        {
          vendorKey: "saved-gateway",
          modelKey: "revision-image",
          labelZh: "Revision image",
          kind: "image",
          enabled: true,
          meta: { adapter: oldAdapter, parameters: [{ key: "size" }] },
          onboarding: { addedVia: "agent", addedAt: "2026-08-01T00:00:00.000Z", fields: [] },
          createdAt: now,
          updatedAt: now,
        },
        {
          vendorKey: "saved-gateway",
          modelKey: "script-video",
          labelZh: "Script video",
          kind: "video",
          enabled: true,
          customCall: { script: "return { assets: ['https://example.test/a.mp4'] }", updatedAt: now },
          meta: { adapter: { state: "failed", modes: [], updatedAt: now } },
          createdAt: now,
          updatedAt: now,
        },
        {
          vendorKey: "saved-gateway",
          modelKey: "mapped-audio",
          labelZh: "Mapped audio",
          kind: "audio",
          enabled: true,
          meta: { adapter: { state: "partial", modes: [], updatedAt: now } },
          createdAt: now,
          updatedAt: now,
        },
        {
          vendorKey: "saved-gateway",
          modelKey: "no-contract-image",
          labelZh: "No contract image",
          kind: "image",
          enabled: true,
          meta: { adapter: { state: "failed", modes: [], updatedAt: now } },
          createdAt: now,
          updatedAt: now,
        },
      ],
      mappings: [
        {
          id: "generic-audio",
          vendorKey: "saved-gateway",
          taskKind: "text_to_audio",
          name: "Generic audio",
          enabled: true,
          create: { method: "POST", path: "/audio" },
          createdAt: now,
          updatedAt: now,
        },
      ],
      apiKeysByVendor: {
        "saved-gateway": {
          vendorKey: "saved-gateway",
          apiKey: "encrypted-record",
          enabled: true,
          enc: "safeStorage",
          createdAt: now,
          updatedAt: now,
        },
      },
    };

    defaultCatalog.register({
      vendorKey: "saved-gateway",
      vendorName: "Saved Gateway",
      baseUrl: "https://gateway.example.test/v1",
      apiKey: "",
      authType: "bearer",
      providerKind: "openai-compatible",
      preserveExistingCredential: true,
      models: state.models.map(({ modelKey, labelZh, kind }) => ({ modelKey, labelZh, kind })),
      savedAt: now,
    });

    const writes = new Map(upsertModel.mock.calls.map(([model]) => [model.modelKey, model]));
    expect(writes.get("revision-image")).toMatchObject({
      enabled: true,
      meta: { adapter: oldAdapter, parameters: [{ key: "size" }] },
      onboarding: { addedVia: "agent" },
    });
    expect(writes.get("script-video")).toMatchObject({
      enabled: true,
      customCall: { script: expect.stringContaining("assets") },
      meta: { adapter: { state: "failed" } },
    });
    expect(writes.get("mapped-audio")).toMatchObject({
      enabled: true,
      meta: { adapter: { state: "partial" } },
    });
    expect(writes.get("no-contract-image")).toMatchObject({
      enabled: false,
      meta: { adapter: { state: "unverified", modes: [], updatedAt: now } },
      onboarding: { addedVia: "manual", addedAt: now, fields: [] },
    });
    expect(state.mappings).toHaveLength(1);
  });
});
