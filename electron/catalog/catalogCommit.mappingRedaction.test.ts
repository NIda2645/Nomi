import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogState, Mapping, Model, Vendor } from "./types";

const state = vi.hoisted(() => ({ catalog: null as CatalogState | null }));

vi.mock("./catalogStore", async (importOriginal) => ({
  ...await importOriginal<typeof import("./catalogStore")>(),
  readCatalog: () => state.catalog,
}));

vi.mock("../runtime", async () => {
  const { buildProfileHttpRequest } = await import("./profileHttpRequest");
  return {
    billingKindForTaskKind: () => "image",
    buildProfileHttpRequest,
    buildProfileTaskResult: vi.fn(),
    executeProfileOperation: vi.fn(),
    findExecutableModelForTask: () => {
      const catalog = state.catalog!;
      return {
        vendor: catalog.vendors[0],
        model: catalog.models[0],
        apiKey: "opaque+Credential/Value=987654%",
      };
    },
  };
});

import { testModelCatalogMapping } from "./catalogCommit";

describe("testModelCatalogMapping request redaction", () => {
  beforeEach(() => {
    const secret = "opaque+Credential/Value=987654%";
    const vendor = {
      key: "relay",
      name: "Relay",
      enabled: true,
      authType: "query",
      authQueryParam: "access_token",
      baseUrlHint: "https://relay.example/v1",
      meta: { extraHeaders: { "X-Workspace-Auth": secret } },
      createdAt: "",
      updatedAt: "",
    } satisfies Vendor;
    const model = {
      vendorKey: vendor.key,
      modelKey: "image-model",
      labelZh: "Image",
      kind: "image",
      enabled: true,
      createdAt: "",
      updatedAt: "",
    } satisfies Model;
    const mapping = {
      id: "relay:image-model:text_to_image",
      vendorKey: vendor.key,
      modelKey: model.modelKey,
      taskKind: "text_to_image",
      name: "Image smoke test",
      enabled: true,
      create: {
        method: "GET",
        path: "/generate",
        headers: { "X-Custom-Credential": "{{user_api_key}}" },
        query: { credential: "{{user_api_key}}", ordinary: "ordinary-marker" },
      },
      createdAt: "",
      updatedAt: "",
    } satisfies Mapping;
    state.catalog = { version: 11, vendors: [vendor], models: [model], mappings: [mapping], apiKeysByVendor: {} };
  });

  it("never returns raw or outbound-encoded header/query credentials in the mapping test DTO", async () => {
    const secret = "opaque+Credential/Value=987654%";
    const result = await testModelCatalogMapping("relay:image-model:text_to_image", { execute: false });
    const serialized = JSON.stringify(result);

    expect(serialized).toContain("ordinary-marker");
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(encodeURIComponent(secret));
    expect(serialized).not.toContain(new URLSearchParams({ credential: secret }).toString().slice("credential=".length));
  });
});
