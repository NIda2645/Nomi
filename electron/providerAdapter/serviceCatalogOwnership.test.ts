import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogState, Mapping, Model, Vendor } from "../catalog/types";
import type { ProviderAdapterDraft, ProviderAdapterRun } from "./types";

const now = "2026-08-15T00:00:00.000Z";
const vendorKey = "shared-provider";
const modelKey = "image-v1";

function initialState(): CatalogState {
  return {
    version: 8,
    vendors: [{
      key: vendorKey,
      name: "Shared Provider",
      enabled: false,
      baseUrlHint: "http://127.0.0.1:9000/v1",
      authType: "none",
      providerKind: "openai-compatible",
      createdAt: now,
      updatedAt: now,
    }],
    models: [{
      vendorKey,
      modelKey,
      labelZh: "Image V1",
      kind: "image",
      enabled: false,
      createdAt: now,
      updatedAt: now,
    }],
    mappings: [],
    apiKeysByVendor: {},
  };
}

let state = initialState();

const upsertVendor = vi.fn((payload: unknown): Vendor => {
  const raw = payload as Vendor;
  const index = state.vendors.findIndex((vendor) => vendor.key === raw.key);
  const next = { ...(index >= 0 ? state.vendors[index] : {}), ...structuredClone(raw) } as Vendor;
  if (index >= 0) state.vendors[index] = next;
  else state.vendors.push(next);
  return structuredClone(next);
});

const upsertModel = vi.fn((payload: unknown): Model => {
  const raw = payload as Model;
  const index = state.models.findIndex((model) => model.vendorKey === raw.vendorKey && model.modelKey === raw.modelKey);
  const next = {
    ...(index >= 0 ? state.models[index] : { createdAt: now }),
    ...structuredClone(raw),
    updatedAt: raw.updatedAt || now,
  } as Model;
  if (index >= 0) state.models[index] = next;
  else state.models.push(next);
  return structuredClone(next);
});

const upsertMapping = vi.fn((payload: unknown): Mapping => {
  const raw = payload as Mapping;
  const index = state.mappings.findIndex(
    (mapping) => mapping.vendorKey === raw.vendorKey && mapping.modelKey === raw.modelKey && mapping.taskKind === raw.taskKind,
  );
  const next = {
    ...(index >= 0 ? state.mappings[index] : { id: `mapping-${raw.modelKey}-${raw.taskKind}`, createdAt: now }),
    ...structuredClone(raw),
    updatedAt: raw.updatedAt || now,
  } as Mapping;
  if (index >= 0) state.mappings[index] = next;
  else state.mappings.push(next);
  return structuredClone(next);
});

const upsertApiKey = vi.fn((key: string, payload: { apiKey?: string; enabled?: boolean }) => {
  state.apiKeysByVendor[key] = {
    vendorKey: key,
    apiKey: String(payload.apiKey || ""),
    enc: "safeStorage",
    enabled: payload.enabled !== false,
    createdAt: now,
    updatedAt: now,
  };
});

const deleteApiKey = vi.fn((key: string) => {
  delete state.apiKeysByVendor[key];
});

vi.mock("../catalog/catalogStore", () => ({
  readCatalog: () => structuredClone(state),
  mutateCatalog: <T>(fn: (tx: unknown) => T): T => fn({
    upsertVendor,
    upsertModel,
    upsertMapping,
    upsertApiKey,
    deleteApiKey,
    deleteModelMappings: vi.fn(),
  }),
  extractVendorExtraHeaders: () => undefined,
  normalizeProviderKind: (value: unknown) => value ?? "openai-compatible",
}));

const { defaultCatalog } = await import("./serviceCatalog");

function stage(runId: string): void {
  defaultCatalog.stage({
    vendorKey,
    runId,
    vendorName: "Shared Provider",
    baseUrl: "http://127.0.0.1:9000/v1",
    apiKey: "",
    authType: "none",
    providerKind: "openai-compatible",
    models: [{ modelKey, labelZh: "Image V1", kind: "image" }],
  });
}

function draft(path: string): ProviderAdapterDraft {
  return {
    provider: { baseUrl: "http://127.0.0.1:9000/v1", authType: "none", providerKind: "openai-compatible" },
    sources: [],
    models: [{
      modelKey,
      labelZh: "Image V1",
      kind: "image",
      modes: [{ taskKind: "text_to_image", create: { method: "POST", path }, testParams: {}, sourceUrls: [] }],
    }],
  };
}

function run(runId: string, stage: ProviderAdapterRun["stage"], modeState: "verified" | "failed"): ProviderAdapterRun {
  return {
    id: runId,
    vendorKey,
    vendorName: "Shared Provider",
    connectionFingerprint: `fingerprint-${runId}`,
    selectedModelKeys: [modelKey],
    stage,
    repairAttempt: 0,
    models: [{
      modelKey,
      labelZh: "Image V1",
      kind: "image",
      modes: [{
        taskKind: "text_to_image",
        state: modeState,
        attempts: 1,
        ...(modeState === "failed" ? { stage: "create" as const, error: "cancelled" } : {}),
      }],
    }],
    sourceUrls: [],
    createdAt: now,
    updatedAt: now,
  };
}

function promote(runId: string, path: string): void {
  const candidate = draft(path);
  const completed = run(runId, "completed", "verified");
  defaultCatalog.promote({
    run: completed,
    draft: candidate,
    revision: {
      id: `revision-${runId}`,
      vendorKey,
      digest: `digest-${runId}`,
      draft: candidate,
      verifiedModes: [{ modelKey, taskKind: "text_to_image" }],
      createdAt: now,
    },
    verifiedModes: [{ modelKey, taskKind: "text_to_image" }],
  });
}

describe("provider adapter catalog run ownership", () => {
  beforeEach(() => {
    state = initialState();
    vi.clearAllMocks();
  });

  it.each(["cancelled", "timed_out", "failed"] as const)(
    "keeps run B metadata when run A becomes %s after B completes",
    (terminalStage) => {
      stage("run-a");
      stage("run-b");
      promote("run-b", "/images/from-b");
      const afterB = structuredClone(state);
      const writesAfterB = upsertModel.mock.calls.length;

      defaultCatalog.fail(run("run-a", terminalStage, "failed"));

      expect(state).toEqual(afterB);
      expect(upsertModel).toHaveBeenCalledTimes(writesAfterB);
      expect((state.models[0].meta as { adapter: { runId: string } }).adapter.runId).toBe("run-b");
    },
  );

  it("ignores a late promote from run A after run B owns and completes the model", () => {
    stage("run-a");
    stage("run-b");
    promote("run-b", "/images/from-b");
    const afterB = structuredClone(state);

    promote("run-a", "/images/from-a");

    expect(state).toEqual(afterB);
    expect(state.mappings[0]?.create.path).toBe("/images/from-b");
  });

  it("keeps a shared published connection byte-identical when a replacement run fails", () => {
    state = {
      ...initialState(),
      vendors: [{ ...initialState().vendors[0], enabled: true, baseUrlHint: "https://active.example.test/v1", authType: "bearer" }],
      models: [
        { ...initialState().models[0], enabled: true },
        { ...initialState().models[0], modelKey: "video-sibling", labelZh: "Video sibling", kind: "video", enabled: true },
      ],
      mappings: [
        { id: "active-image", vendorKey, modelKey, taskKind: "text_to_image", name: "active image", enabled: true, create: { method: "POST", path: "/active-image" }, createdAt: now, updatedAt: now },
        { id: "active-video", vendorKey, modelKey: "video-sibling", taskKind: "text_to_video", name: "active video", enabled: true, create: { method: "POST", path: "/active-video" }, createdAt: now, updatedAt: now },
      ],
      apiKeysByVendor: { [vendorKey]: { vendorKey, apiKey: "encrypted-active", enc: "safeStorage", enabled: true, createdAt: now, updatedAt: now } },
    };
    const activeBefore = structuredClone(state);

    const staged = defaultCatalog.stage({
      catalogVendorKey: vendorKey,
      vendorKey,
      runId: "replacement-run",
      vendorName: "Replacement",
      baseUrl: "https://candidate.example.test/v2",
      apiKey: "candidate-secret",
      authType: "bearer",
      providerKind: "openai-responses",
      headers: { "X-Candidate": "yes" },
      models: [{ modelKey, labelZh: "Candidate image", kind: "video" }],
    });

    expect(staged.vendor.key).not.toBe(vendorKey);
    expect(state.vendors.find((vendor) => vendor.key === vendorKey)).toEqual(activeBefore.vendors[0]);
    expect(state.models.filter((model) => model.vendorKey === vendorKey)).toEqual(activeBefore.models);
    expect(state.mappings.filter((mapping) => mapping.vendorKey === vendorKey)).toEqual(activeBefore.mappings);
    expect(state.apiKeysByVendor[vendorKey]).toEqual(activeBefore.apiKeysByVendor[vendorKey]);

    defaultCatalog.fail({
      ...run("replacement-run", "failed", "failed"),
      vendorKey: staged.vendor.key,
    });

    expect(state.vendors.find((vendor) => vendor.key === vendorKey)).toEqual(activeBefore.vendors[0]);
    expect(state.models.filter((model) => model.vendorKey === vendorKey)).toEqual(activeBefore.models);
    expect(state.mappings.filter((mapping) => mapping.vendorKey === vendorKey)).toEqual(activeBefore.mappings);
    expect(state.apiKeysByVendor[vendorKey]).toEqual(activeBefore.apiKeysByVendor[vendorKey]);
  });

  it("switches only the verified target to the candidate connection and leaves its published sibling active", () => {
    state = {
      ...initialState(),
      vendors: [{ ...initialState().vendors[0], enabled: true, baseUrlHint: "https://active.example.test/v1", authType: "bearer" }],
      models: [
        { ...initialState().models[0], enabled: true },
        { ...initialState().models[0], modelKey: "video-sibling", labelZh: "Video sibling", kind: "video", enabled: true },
      ],
      mappings: [
        { id: "active-image", vendorKey, modelKey, taskKind: "text_to_image", name: "active image", enabled: true, create: { method: "POST", path: "/active-image" }, createdAt: now, updatedAt: now },
        { id: "active-video", vendorKey, modelKey: "video-sibling", taskKind: "text_to_video", name: "active video", enabled: true, create: { method: "POST", path: "/active-video" }, createdAt: now, updatedAt: now },
      ],
      apiKeysByVendor: { [vendorKey]: { vendorKey, apiKey: "encrypted-active", enc: "safeStorage", enabled: true, createdAt: now, updatedAt: now } },
    };
    const staged = defaultCatalog.stage({
      catalogVendorKey: vendorKey,
      vendorKey,
      runId: "replacement-run",
      vendorName: "Replacement",
      baseUrl: "https://candidate.example.test/v2",
      apiKey: "candidate-secret",
      authType: "bearer",
      providerKind: "openai-responses",
      models: [{ modelKey, labelZh: "Candidate image", kind: "image" }],
    });
    const candidateDraft: ProviderAdapterDraft = {
      provider: { baseUrl: "https://candidate.example.test/v2", authType: "bearer", providerKind: "openai-responses" },
      sources: [],
      models: [{
        modelKey,
        labelZh: "Candidate image",
        kind: "image",
        modes: [{ taskKind: "text_to_image", create: { method: "POST", path: "/candidate-image" }, testParams: {}, sourceUrls: [] }],
      }],
    };
    const completed = { ...run("replacement-run", "completed", "verified"), vendorKey: staged.vendor.key };

    defaultCatalog.promote({
      run: completed,
      draft: candidateDraft,
      revision: {
        id: "replacement-revision",
        vendorKey: staged.vendor.key,
        digest: "replacement-digest",
        draft: candidateDraft,
        verifiedModes: [{ modelKey, taskKind: "text_to_image" }],
        createdAt: now,
      },
      verifiedModes: [{ modelKey, taskKind: "text_to_image" }],
    });

    expect(state.models.find((model) => model.vendorKey === vendorKey && model.modelKey === modelKey)?.enabled).toBe(false);
    expect(state.mappings.find((mapping) => mapping.id === "active-image")?.enabled).toBe(false);
    expect(state.models.find((model) => model.vendorKey === vendorKey && model.modelKey === "video-sibling")?.enabled).toBe(true);
    expect(state.mappings.find((mapping) => mapping.id === "active-video")).toMatchObject({ enabled: true, create: { path: "/active-video" } });
    expect(state.vendors.find((vendor) => vendor.key === vendorKey)?.enabled).toBe(true);
    expect(state.models.find((model) => model.vendorKey === staged.vendor.key && model.modelKey === modelKey)?.enabled).toBe(true);
    expect(state.mappings.find((mapping) => mapping.vendorKey === staged.vendor.key && mapping.modelKey === modelKey)).toMatchObject({
      enabled: true,
      create: { path: "/candidate-image" },
    });
  });
});
