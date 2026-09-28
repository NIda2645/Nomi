import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogState, Model, Vendor } from "../catalog/types";

// Reproduces GitHub issue #831: adding a SECOND connection under the same
// Base URL host (different connection name, different API key, no
// catalogVendorKey override — the real add-connection flow never sends one
// for a brand-new row) must not silently overwrite the first connection.
//
// Root cause under investigation: `registerProviderConnection`
// (electron/providerAdapter/registration.ts:38-40) derives the vendor
// identity purely from `deriveVendorKeyFromBaseUrl(baseUrl)`
// (electron/catalog/catalogCommit.ts:400-412), which only looks at the
// hostname. Two connections against the same host therefore resolve to the
// SAME vendorKey and `serviceCatalog.register` (electron/providerAdapter/
// serviceCatalog.ts:106-157) upserts the same vendor/apiKey row for both.

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
const { deriveVendorKeyFromBaseUrl } = await import("../catalog/catalogCommit");

function emptyState(): CatalogState {
  return {
    version: 8,
    vendors: [],
    models: [],
    mappings: [],
    apiKeysByVendor: {},
  };
}

describe("registering a second connection on the same Base URL host (issue #831)", () => {
  const baseUrl1 = "https://gateway.example.test/v1";
  const baseUrl2 = "https://gateway.example.test/v2";
  const hostVendorKey = deriveVendorKeyFromBaseUrl(baseUrl1);

  beforeEach(() => {
    state = emptyState();
    vi.clearAllMocks();
  });

  it("derives the identical vendorKey for both connections from the shared host (precondition)", () => {
    expect(deriveVendorKeyFromBaseUrl(baseUrl2)).toBe(hostVendorKey);
  });

  it("(a) keeps an unpublished first connection's name and credential when a second, unrelated connection is added on the same host", () => {
    const vendor1: Vendor = {
      key: hostVendorKey,
      name: "满血组",
      enabled: false,
      baseUrlHint: baseUrl1,
      authType: "bearer",
      providerKind: "openai-compatible",
      createdAt: now,
      updatedAt: now,
    };
    const credential1 = {
      vendorKey: hostVendorKey,
      apiKey: "encrypted-key-A",
      enc: "safeStorage" as const,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    state = {
      ...emptyState(),
      vendors: [vendor1],
      models: [
        { vendorKey: hostVendorKey, modelKey: "model-1", labelZh: "Model 1", kind: "image", enabled: false, createdAt: now, updatedAt: now },
      ],
      apiKeysByVendor: { [hostVendorKey]: credential1 },
    };
    const before = structuredClone(state);

    // Mirrors registerProviderConnection: no catalogVendorKey is supplied for
    // a brand-new connection, so vendorKey is the same host-derived key.
    const registered = defaultCatalog.register({
      vendorKey: hostVendorKey,
      vendorName: "Mini 特价组",
      baseUrl: baseUrl2,
      apiKey: "key-B",
      authType: "bearer",
      providerKind: "openai-compatible",
      models: [{ modelKey: "model-2", labelZh: "Model 2", kind: "image" }],
      savedAt: now,
    });

    // The first connection's vendor row must never be written by the second
    // connection's save.
    expect(upsertVendor).not.toHaveBeenCalledWith(expect.objectContaining({ key: hostVendorKey }));
    // The first connection's credential must survive untouched.
    expect(upsertApiKey).not.toHaveBeenCalledWith(hostVendorKey, expect.anything());
    // The second connection must land on its own, independent vendor identity.
    expect(registered.vendor.key).not.toBe(hostVendorKey);
    expect(upsertVendor).toHaveBeenCalledWith(expect.objectContaining({ name: "Mini 特价组" }));
    expect(state).toEqual(before);
  });

  it("(b) does not treat a second connection on the same host as a replacement candidate for an already-published first connection", () => {
    const vendor1: Vendor = {
      key: hostVendorKey,
      name: "满血组",
      enabled: true,
      baseUrlHint: baseUrl1,
      authType: "bearer",
      providerKind: "openai-compatible",
      createdAt: now,
      updatedAt: now,
    };
    const credential1 = {
      vendorKey: hostVendorKey,
      apiKey: "encrypted-key-A",
      enc: "safeStorage" as const,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    state = {
      ...emptyState(),
      vendors: [vendor1],
      models: [
        { vendorKey: hostVendorKey, modelKey: "model-1", labelZh: "Model 1", kind: "image", enabled: true, createdAt: now, updatedAt: now },
      ],
      mappings: [
        { id: "model-1-map", vendorKey: hostVendorKey, modelKey: "model-1", taskKind: "text_to_image", name: "model-1", enabled: true, create: { method: "POST", path: "/model-1" }, createdAt: now, updatedAt: now },
      ],
      apiKeysByVendor: { [hostVendorKey]: credential1 },
    };
    const before = structuredClone(state);

    const registered = defaultCatalog.register({
      vendorKey: hostVendorKey,
      vendorName: "Mini 特价组",
      baseUrl: baseUrl2,
      apiKey: "key-B",
      authType: "bearer",
      providerKind: "openai-compatible",
      // Selecting the same already-published modelKey is what flips
      // planStagedVendorIdentity into its "replacement candidate" branch.
      models: [{ modelKey: "model-1", labelZh: "Model 1", kind: "image" }],
      savedAt: now,
    });

    expect(upsertVendor).not.toHaveBeenCalledWith(expect.objectContaining({ key: hostVendorKey }));
    expect(upsertApiKey).not.toHaveBeenCalledWith(hostVendorKey, expect.anything());
    expect(registered.vendor.key).not.toBe(hostVendorKey);

    // The second connection is an independent connection, not a staged
    // "replace vendor1" candidate — its vendor row must carry no
    // candidate/supersede lineage pointing back at vendor 1.
    const secondVendorCall = upsertVendor.mock.calls.find(([payload]) => payload.key === registered.vendor.key);
    expect(secondVendorCall?.[0]?.meta ?? {}).not.toHaveProperty("adapterCandidateSourceVendorKey");

    // vendor1 must remain the active, enabled, unrenamed connection.
    expect(upsertVendor).not.toHaveBeenCalledWith(expect.objectContaining({ key: hostVendorKey, enabled: false }));
    expect(state).toEqual(before);
  });
});
