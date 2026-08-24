import { describe, expect, it } from "vitest";

import {
  AssetLeaseError,
  assertAssetLeaseUsable,
  createAssetLease,
} from "./projectAssetLease";

const valid = {
  assetId: "asset-1",
  projectId: "project-1",
  immutableProjectUuid: "project-uuid-1",
  projectGeneration: 4,
  contentHash: "c".repeat(64),
  version: 3,
  privacy: "project-only" as const,
  issuedAt: "2026-08-23T00:00:00.000Z",
  expiresAt: "2026-08-23T00:05:00.000Z",
};

describe("AssetLease", () => {
  it("binds an asset to the project generation and content hash", () => {
    const lease = createAssetLease(valid);
    expect(assertAssetLeaseUsable(lease, { projectId: "project-1", immutableProjectUuid: "project-uuid-1", projectGeneration: 4 }, "2026-08-23T00:01:00.000Z")).toEqual(lease);
  });

  it("rejects an expired, foreign, or malformed lease before provider work", () => {
    expect(() => assertAssetLeaseUsable(valid, { projectId: "project-2" }, "2026-08-23T00:01:00.000Z")).toThrow(AssetLeaseError);
    expect(() => assertAssetLeaseUsable(valid, { projectId: "project-1" }, "2026-08-23T00:06:00.000Z")).toThrow(AssetLeaseError);
    expect(() => createAssetLease({ ...valid, contentHash: "bad" })).toThrow(AssetLeaseError);
  });
});

