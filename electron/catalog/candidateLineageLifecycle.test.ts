import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let userDataRoot = "";

vi.mock("electron", () => ({
  app: {
    getPath: () => userDataRoot,
    getAppPath: () => process.cwd(),
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}));

import { deleteModelCatalogVendor, readCatalog } from "./catalogStore";
import { CURRENT_CATALOG_VERSION, type CatalogState, type Vendor } from "./types";

const now = "2026-08-28T00:00:00.000Z";

function vendor(key: string, meta?: unknown): Vendor {
  return {
    key,
    name: key,
    enabled: true,
    baseUrlHint: `https://${key}.example.test/v1`,
    authType: "bearer",
    ...(meta ? { meta } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

function writeState(state: CatalogState): void {
  fs.writeFileSync(path.join(userDataRoot, "model-catalog.json"), JSON.stringify(state), "utf8");
}

beforeEach(() => {
  userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-candidate-lineage-"));
});

afterEach(() => {
  fs.rmSync(userDataRoot, { recursive: true, force: true });
});

describe("candidate vendor lineage deletion", () => {
  it("deleting a root source cascades through every candidate revision and leaves no orphan secret/model/mapping", () => {
    const root = "source";
    const first = "source--candidate-first";
    const second = "source--candidate-second";
    writeState({
      version: CURRENT_CATALOG_VERSION,
      vendors: [
        vendor(root),
        vendor(first, {
          adapterCandidateSourceVendorKey: root,
          adapterCandidateRootVendorKey: root,
          adapterCandidateRevisionId: "first",
        }),
        vendor(second, {
          adapterCandidateSourceVendorKey: first,
          adapterCandidateRootVendorKey: root,
          adapterCandidateRevisionId: "second",
        }),
      ],
      models: [root, first, second].map((vendorKey) => ({
        vendorKey,
        modelKey: "image-v1",
        labelZh: "Image V1",
        kind: "image" as const,
        enabled: vendorKey === second,
        createdAt: now,
        updatedAt: now,
      })),
      mappings: [root, first, second].map((vendorKey) => ({
        id: `mapping-${vendorKey}`,
        vendorKey,
        modelKey: "image-v1",
        taskKind: "text_to_image" as const,
        name: "image",
        enabled: vendorKey === second,
        create: { method: "POST", path: "/images" },
        createdAt: now,
        updatedAt: now,
      })),
      apiKeysByVendor: Object.fromEntries([root, first, second].map((vendorKey) => [vendorKey, {
        vendorKey,
        apiKey: Buffer.from(`${vendorKey}-key`).toString("base64"),
        enc: "safeStorage" as const,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      }])),
    });

    deleteModelCatalogVendor(root);

    expect(readCatalog()).toMatchObject({ vendors: [], models: [], mappings: [], apiKeysByVendor: {} });
  });

  it("deleting a promoted candidate restores its immediate source execution and removes candidate descendants", () => {
    const root = "source";
    const candidate = "source--candidate-promoted";
    const child = "source--candidate-unpublished-child";
    writeState({
      version: CURRENT_CATALOG_VERSION,
      vendors: [
        vendor(root),
        vendor(candidate, {
          adapterCandidateSourceVendorKey: root,
          adapterCandidateRootVendorKey: root,
          adapterCandidateRevisionId: "promoted",
        }),
        vendor(child, {
          adapterCandidateSourceVendorKey: candidate,
          adapterCandidateRootVendorKey: root,
          adapterCandidateRevisionId: "child",
        }),
      ],
      models: [
        { vendorKey: root, modelKey: "target", labelZh: "Target", kind: "image", enabled: false, createdAt: now, updatedAt: now },
        { vendorKey: root, modelKey: "sibling", labelZh: "Sibling", kind: "video", enabled: true, createdAt: now, updatedAt: now },
        { vendorKey: candidate, modelKey: "target", labelZh: "Target", kind: "image", enabled: true, createdAt: now, updatedAt: now },
        { vendorKey: child, modelKey: "target", labelZh: "Target", kind: "image", enabled: false, createdAt: now, updatedAt: now },
      ],
      mappings: [
        { id: "source-target", vendorKey: root, modelKey: "target", taskKind: "text_to_image", name: "target", enabled: false, create: { method: "POST", path: "/source" }, createdAt: now, updatedAt: now },
        { id: "source-sibling", vendorKey: root, modelKey: "sibling", taskKind: "text_to_video", name: "sibling", enabled: true, create: { method: "POST", path: "/sibling" }, createdAt: now, updatedAt: now },
        { id: "candidate-target", vendorKey: candidate, modelKey: "target", taskKind: "text_to_image", name: "target", enabled: true, create: { method: "POST", path: "/candidate" }, createdAt: now, updatedAt: now },
        { id: "child-target", vendorKey: child, modelKey: "target", taskKind: "text_to_image", name: "target", enabled: false, create: { method: "POST", path: "/child" }, createdAt: now, updatedAt: now },
      ],
      apiKeysByVendor: Object.fromEntries([root, candidate, child].map((vendorKey) => [vendorKey, {
        vendorKey,
        apiKey: Buffer.from(`${vendorKey}-key`).toString("base64"),
        enc: "safeStorage" as const,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      }])),
    });

    deleteModelCatalogVendor(candidate);

    const state = readCatalog();
    expect(state.vendors.map((item) => item.key)).toEqual([root]);
    expect(state.models.find((model) => model.vendorKey === root && model.modelKey === "target")?.enabled).toBe(true);
    expect(state.mappings.find((mapping) => mapping.id === "source-target")?.enabled).toBe(true);
    expect(state.models.find((model) => model.modelKey === "sibling")?.enabled).toBe(true);
    expect(state.mappings.find((mapping) => mapping.id === "source-sibling")?.enabled).toBe(true);
    expect(Object.keys(state.apiKeysByVendor)).toEqual([root]);
  });
});
